"""Sale lifecycle pure helpers (POS-01, POS-06, POS-13, POS-14).

Route handlers (Plan 15-04) compose these into transactional flows.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db.models.tenant.clinical import (
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
