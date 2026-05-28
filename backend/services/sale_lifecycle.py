"""Sale lifecycle pure helpers (POS-01, POS-04, POS-06, POS-13, POS-14).

Route handlers (Plan 15-04) compose these into transactional flows.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.audit import log_action
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import (
    AuditAction,
    OpticalOrder,
    OpticalOrderLineItem,
    PatientInsurance,
    Payment,
    PaymentStatus,
    Sale,
    SaleLineItem,
    Superbill,
)
from backend.services.money import quantize_money

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
