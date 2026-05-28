"""Sale lifecycle pure helpers (POS-01, POS-04, POS-06, POS-13, POS-14).

Route handlers (Plan 15-04) compose these into transactional flows.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.audit import log_action
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import (
    AuditAction,
    InventoryTransaction,
    OpticalOrder,
    OpticalOrderLineItem,
    PatientInsurance,
    Payment,
    PaymentStatus,
    Product,
    Refund,
    RefundLineItem,
    RefundPayment,
    Sale,
    SaleLineItem,
    Superbill,
)
from backend.services.money import quantize_money
from backend.services.payments.base import PaymentProcessor, PaymentProcessorError

ZERO = Decimal("0.00")


def compute_sale_totals(
    lines: Iterable[SaleLineItem], tax_rate: Decimal
) -> dict[str, Decimal]:
    """Compute subtotal / discount_total / tax / total.

    Tax = round-of-sum (NOT sum-of-rounds) per RESEARCH Pitfall 4.
    """
    lines = list(lines)
    subtotal = quantize_money(sum((li.line_total for li in lines), ZERO))
    discount_total = quantize_money(
        sum((li.discount_amount or ZERO for li in lines), ZERO)
    )
    taxable_base = quantize_money(
        sum((li.line_total for li in lines if li.taxable), ZERO)
    )
    tax = quantize_money(taxable_base * tax_rate)
    total = quantize_money(subtotal + tax)
    return {
        "subtotal": subtotal,
        "discount_total": discount_total,
        "tax": tax,
        "total": total,
    }


def compute_remaining(
    sale_total: Decimal, payments: Iterable[Payment]
) -> Decimal:
    """Drives split-tender close gate (POS-06).

    Only payments with status in {succeeded, partial_refund} count toward balance —
    a partially-refunded payment originally cleared the full principal.
    """
    counted = (PaymentStatus.SUCCEEDED.value, PaymentStatus.PARTIAL_REFUND.value)
    paid = quantize_money(
        sum((p.amount for p in payments if p.status in counted), ZERO)
    )
    return quantize_money(sale_total - paid)


# Aliases honoring Wave-0 stub names so future imports won't break.
compute_remaining_balance = compute_remaining


async def prefill_from_superbill(
    db: AsyncSession, sale: Sale, superbill_id: UUID
) -> SaleLineItem:
    """Cart-load a Superbill row — patient-owed amount only (POS-14).

    - billed_payer_id set + matching active PatientInsurance → use copay_amount
    - else (self-pay) → use Superbill.total_fee
    """
    superbill = (
        await db.execute(
            select(Superbill)
            .where(Superbill.id == superbill_id)
            .options(selectinload(Superbill.encounter))
        )
    ).scalar_one()

    if superbill.billed_payer_id:
        ins = (
            await db.execute(
                select(PatientInsurance).where(
                    PatientInsurance.patient_id == superbill.patient_id,
                    PatientInsurance.payer_id == superbill.billed_payer_id,
                    PatientInsurance.is_active.is_(True),
                )
            )
        ).scalar_one_or_none()
        unit_price = (
            ins.copay_amount
            if (ins and ins.copay_amount is not None)
            else Decimal("0.00")
        )
    else:
        unit_price = superbill.total_fee

    unit_price = quantize_money(unit_price)
    encounter_date = (
        superbill.encounter.encounter_date.isoformat()
        if superbill.encounter and superbill.encounter.encounter_date
        else "walk-in"
    )
    line = SaleLineItem(
        tenant_id=sale.tenant_id,
        sale_id=sale.id,
        source_type="superbill",
        source_id=superbill.id,
        description=f"Encounter copay — {encounter_date}",
        qty=1,
        unit_price=unit_price,
        discount_amount=Decimal("0.00"),
        taxable=False,  # clinical service — not CA sales tax
        line_total=unit_price,
    )
    db.add(line)
    await db.flush()
    return line


async def prefill_from_optical_order(
    db: AsyncSession, sale: Sale, optical_order_id: UUID
) -> list[SaleLineItem]:
    """One SaleLineItem per OpticalOrderLineItem, flat with shared source_id.

    Per RESEARCH Open Q 1 — no self-FK; UI groups by shared source_id.
    optical_order_line_item_id FK (WARNING #3 fix) lets Plan 15-05 restock walk to
    the exact OpticalOrderLineItem without fragile line_total matching.
    """
    order = (
        await db.execute(
            select(OpticalOrder)
            .where(OpticalOrder.id == optical_order_id)
            .options(
                selectinload(OpticalOrder.line_items).selectinload(
                    OpticalOrderLineItem.product
                )
            )
        )
    ).scalar_one()

    lines: list[SaleLineItem] = []
    for oli in order.line_items:
        product = getattr(oli, "product", None)
        desc = " ".join(
            filter(
                None,
                [
                    getattr(product, "brand", None) if product else None,
                    getattr(product, "model", None) if product else None,
                ],
            )
        ) or "Optical order line"
        li = SaleLineItem(
            tenant_id=sale.tenant_id,
            sale_id=sale.id,
            source_type="optical_order",
            source_id=order.id,
            optical_order_line_item_id=oli.id,
            description=desc,
            qty=oli.qty,
            unit_price=quantize_money(oli.unit_price),
            discount_amount=Decimal("0.00"),
            taxable=True,
            line_total=quantize_money(oli.line_total),
        )
        db.add(li)
        lines.append(li)
    await db.flush()
    return lines


async def maybe_dispense_optical_orders(
    db: AsyncSession, ctx: TenantContext, sale: Sale, mark_dispensed: bool
) -> list[OpticalOrder]:
    """Flip OpticalOrder.status placed→dispensed when cart toggle set.

    Returns dispensed orders for audit metadata. Skipped when mark_dispensed=False.
    """
    if not mark_dispensed:
        return []
    order_ids = {
        li.source_id
        for li in sale.lines
        if li.source_type == "optical_order" and li.source_id
    }
    dispensed: list[OpticalOrder] = []
    for oid in order_ids:
        order = (
            await db.execute(select(OpticalOrder).where(OpticalOrder.id == oid))
        ).scalar_one_or_none()
        if order and order.status == "placed":
            order.status = "dispensed"
            order.dispensed_at = datetime.now(timezone.utc)
            dispensed.append(order)
            await log_action(
                db,
                ctx,
                AuditAction.OPTICAL_ORDER_DISPENSE,
                "optical_order",
                order.id,
                metadata={"via_sale_id": str(sale.id)},
            )
    return dispensed


async def generate_receipt_number(db: AsyncSession, tenant_id: UUID) -> str:
    """Receipt number format: R-YYYYMMDD-NNNN per tenant per day."""
    today = date.today()
    count = (
        await db.execute(
            select(func.count(Sale.id)).where(
                Sale.tenant_id == tenant_id,
                func.date(Sale.closed_at) == today,
                Sale.receipt_number.isnot(None),
            )
        )
    ).scalar_one()
    return f"R-{today.strftime('%Y%m%d')}-{count + 1:04d}"


async def close_sale(*args, **kwargs):
    """Reserved for future programmatic close API.

    The route handler `backend/api/routes/sales.py::close_sale` is the
    canonical entry point. This service shim is kept so that future webhook
    code (Plan 15-08) or background jobs can call into the same flow without
    going through HTTP — implementation lives in the route until a real
    second caller exists.
    """
    raise NotImplementedError(
        "Use POST /api/sales/{id}/close/ via FastAPI; programmatic shim "
        "lands when a second caller (webhook / job) needs it."
    )


async def load_cart_from_sources(
    db: AsyncSession,
    sale: Sale,
    superbill_ids: Iterable[UUID] = (),
    optical_order_ids: Iterable[UUID] = (),
) -> list[SaleLineItem]:
    """Convenience: prefill multiple sources in one call (kept for Plan 15-04 route)."""
    lines: list[SaleLineItem] = []
    for sb_id in superbill_ids:
        lines.append(await prefill_from_superbill(db, sale, sb_id))
    for oo_id in optical_order_ids:
        lines.extend(await prefill_from_optical_order(db, sale, oo_id))
    return lines


# ---------------------------------------------------------------------------
# Refund flow (Plan 15-05 — POS-05, POS-09)
# ---------------------------------------------------------------------------


@dataclass
class RefundLineSpec:
    """Service-layer DTO mirrors backend.schemas.sales.RefundLineSpec.

    Service stays Pydantic-free; route adapts schema → dataclass at the edge.
    """

    sale_line_item_id: UUID
    qty: int
    amount: Decimal


@dataclass
class RefundPaymentSpec:
    """Service-layer DTO mirrors backend.schemas.sales.RefundPaymentSpec."""

    payment_id: UUID
    amount: Decimal


async def restock_for_refund_line(
    db: AsyncSession,
    ctx: TenantContext,
    line: SaleLineItem,
    qty: int,
    refund_id: UUID,
    *,
    staff_id: UUID | None = None,
) -> InventoryTransaction | None:
    """Restock a single sale line — product or optical_order branch (POS-09).

    Superbill / adhoc lines NEVER restock (CONTEXT §E). Returns the written
    InventoryTransaction, or None if no restock applies.

    Optical lines resolve product via the SaleLineItem.optical_order_line_item_id FK
    populated by Plan 15-03 prefill — no line_total heuristic. A legacy-data fallback
    keeps backwards compatibility for rows created before Plan 15-01 migration ran.
    """
    if line.source_type not in ("product", "optical_order") or qty <= 0:
        return None

    if line.source_type == "product":
        product_id = line.source_id
    else:
        if line.optical_order_line_item_id is None:
            # Legacy data path: SaleLineItem rows created before Plan 15-01.
            # New rows always carry the FK (Plan 15-03 acceptance criterion).
            order = (
                await db.execute(
                    select(OpticalOrder)
                    .where(OpticalOrder.id == line.source_id)
                    .options(selectinload(OpticalOrder.line_items))
                )
            ).scalar_one_or_none()
            if not order:
                return None
            ooli = next(
                (o for o in order.line_items if o.line_total == line.line_total),
                None,
            )
            if not ooli:
                return None
            product_id = ooli.product_id
        else:
            # Standard path — direct FK lookup, no guessing.
            ooli = await db.get(OpticalOrderLineItem, line.optical_order_line_item_id)
            if ooli is None:
                return None
            product_id = ooli.product_id

    if not product_id:
        return None

    product = (
        await db.execute(
            select(Product)
            .where(Product.id == product_id)
            .with_for_update()
        )
    ).scalar_one()
    product.stock_qty += qty

    # reason='refund_restock' is in the widened ck_inventory_reason CHECK (Plan 15-01,
    # migration 0020). sale_id links the inventory move to the parent sale for daily-
    # close audit; refund_id is not stored directly (the InventoryTransaction → Sale →
    # Refund chain provides the same trail).
    txn = InventoryTransaction(
        tenant_id=ctx.tenant_id,
        product_id=product.id,
        delta=qty,
        reason="refund_restock",
        sale_id=line.sale_id,
        staff_id=staff_id,
    )
    db.add(txn)
    return txn


async def maybe_cancel_optical_orders(
    db: AsyncSession,
    ctx: TenantContext,
    sale: Sale,
    refund: Refund,
) -> list[OpticalOrder]:
    """Cascade-cancel OpticalOrders whose every line is now fully refunded.

    Mirrors Phase 13 cancel semantics: status → 'cancelled', cancelled_at stamped,
    OPTICAL_ORDER_CANCEL audit emitted. Idempotent — orders already cancelled are
    skipped so re-refunds don't double-log.
    """
    order_ids = {
        li.source_id
        for li in sale.lines
        if li.source_type == "optical_order" and li.source_id
    }
    cancelled: list[OpticalOrder] = []
    for order_id in order_ids:
        order_lines = [
            li
            for li in sale.lines
            if li.source_type == "optical_order" and li.source_id == order_id
        ]
        if not order_lines:
            continue
        all_refund_lines = (
            await db.execute(
                select(RefundLineItem)
                .join(Refund, RefundLineItem.refund_id == Refund.id)
                .where(
                    Refund.sale_id == sale.id,
                    RefundLineItem.sale_line_item_id.in_([li.id for li in order_lines]),
                )
            )
        ).scalars().all()
        refunded_by_sli: dict[UUID, int] = {}
        for rl in all_refund_lines:
            refunded_by_sli[rl.sale_line_item_id] = (
                refunded_by_sli.get(rl.sale_line_item_id, 0) + rl.qty
            )
        fully_refunded = all(
            refunded_by_sli.get(li.id, 0) >= li.qty for li in order_lines
        )
        if not fully_refunded:
            continue
        order = (
            await db.execute(select(OpticalOrder).where(OpticalOrder.id == order_id))
        ).scalar_one_or_none()
        if order and order.status != "cancelled":
            order.status = "cancelled"
            order.cancelled_at = datetime.now(timezone.utc)
            cancelled.append(order)
            await log_action(
                db,
                ctx,
                AuditAction.OPTICAL_ORDER_CANCEL,
                "optical_order",
                order.id,
                metadata={
                    "via_refund_id": str(refund.id),
                    "via_sale_id": str(sale.id),
                },
            )
    return cancelled


async def issue_refund(
    db: AsyncSession,
    ctx: TenantContext,
    sale: Sale,
    line_refunds: list[RefundLineSpec],
    payment_refunds: list[RefundPaymentSpec],
    reason: str,
    processor: PaymentProcessor,
) -> Refund:
    """Atomic refund — restock + processor refund + cascade-cancel + audit (POS-05, POS-09).

    All side-effects flushed but NOT committed — caller (route) is responsible for
    db.commit() so the refund, restock InventoryTransactions, OpticalOrder cancels,
    and REFUND_ISSUED audit row all land in one TXN (Pitfall 14). If log_action raises
    or processor.refund_payment fails, the entire TXN rolls back.

    Raises HTTPException 400 on validation failure; HTTPException 502 if Stripe rejects
    the refund (e.g. payment already refunded, insufficient balance).
    """
    if not reason or len(reason.strip()) < 3:
        raise HTTPException(status_code=400, detail="reason required (min 3 chars)")
    if len(reason) > 500:
        raise HTTPException(status_code=400, detail="reason too long (max 500 chars)")
    if not line_refunds:
        raise HTTPException(status_code=400, detail="at least one line refund required")
    if not payment_refunds:
        raise HTTPException(
            status_code=400, detail="at least one payment refund required"
        )

    total_line_amount = quantize_money(
        sum((lr.amount for lr in line_refunds), Decimal("0.00"))
    )
    total_payment_amount = quantize_money(
        sum((pr.amount for pr in payment_refunds), Decimal("0.00"))
    )
    if total_payment_amount != total_line_amount:
        raise HTTPException(
            status_code=400,
            detail=(
                f"payment refund total {total_payment_amount} must equal "
                f"line refund total {total_line_amount}"
            ),
        )

    staff = await resolve_staff(ctx, db)
    refund = Refund(
        tenant_id=ctx.tenant_id,
        sale_id=sale.id,
        total_amount=total_line_amount,
        reason=reason.strip(),
        refunded_by_id=staff.id if staff else None,
    )
    db.add(refund)
    await db.flush()

    # 1) Per-line restock + RefundLineItem rows
    line_by_id = {li.id: li for li in sale.lines}
    for spec in line_refunds:
        line = line_by_id.get(spec.sale_line_item_id)
        if line is None:
            raise HTTPException(
                status_code=400,
                detail=f"sale_line_item {spec.sale_line_item_id} not on this sale",
            )
        await restock_for_refund_line(
            db,
            ctx,
            line,
            spec.qty,
            refund.id,
            staff_id=staff.id if staff else None,
        )
        db.add(
            RefundLineItem(
                tenant_id=ctx.tenant_id,
                refund_id=refund.id,
                sale_line_item_id=line.id,
                qty=spec.qty,
                amount=quantize_money(spec.amount),
            )
        )

    # 2) Per-payment processor refund (stripe_card only) + RefundPayment rows
    tenant = await db.get(Tenant, ctx.tenant_id)
    payment_by_id = {p.id: p for p in sale.payments}
    stripe_refund_count = 0
    for spec in payment_refunds:
        payment = payment_by_id.get(spec.payment_id)
        if payment is None:
            raise HTTPException(
                status_code=400,
                detail=f"payment {spec.payment_id} not on this sale",
            )
        processor_refund_id: str | None = None
        if payment.method == "stripe_card":
            try:
                result = await processor.refund_payment(tenant, payment, spec.amount)
                processor_refund_id = result.refund_id
                stripe_refund_count += 1
            except PaymentProcessorError as exc:
                raise HTTPException(
                    status_code=502, detail=f"Stripe refund failed: {exc}"
                ) from exc
        db.add(
            RefundPayment(
                tenant_id=ctx.tenant_id,
                refund_id=refund.id,
                payment_id=payment.id,
                amount=quantize_money(spec.amount),
                processor_refund_id=processor_refund_id,
            )
        )
        # Update Payment.status — sum prior refunds + this allocation.
        existing_refunded = (
            await db.execute(
                select(func.coalesce(func.sum(RefundPayment.amount), 0)).where(
                    RefundPayment.payment_id == payment.id
                )
            )
        ).scalar_one()
        total_refunded = quantize_money(
            Decimal(existing_refunded) + quantize_money(spec.amount)
        )
        if total_refunded >= payment.amount:
            payment.status = PaymentStatus.REFUNDED.value
        else:
            payment.status = PaymentStatus.PARTIAL_REFUND.value

    # 3) Cascade-cancel fully-refunded OpticalOrders (Phase 13 semantics)
    await maybe_cancel_optical_orders(db, ctx, sale, refund)

    # 4) Sale.status flips to refunded (CONTEXT §E — same enum for partial + full)
    sale.status = "refunded"

    # 5) Audit (MUST be before commit per Pitfall 14)
    await log_action(
        db,
        ctx,
        AuditAction.REFUND_ISSUED,
        "refund",
        refund.id,
        staff_id=staff.id if staff else None,
        patient_id=sale.patient_id,
        metadata={
            "sale_id": str(sale.id),
            "amount": str(refund.total_amount),
            "reason": refund.reason,
            "line_count": len(line_refunds),
            "stripe_refund_count": stripe_refund_count,
        },
    )
    await db.flush()
    return refund
