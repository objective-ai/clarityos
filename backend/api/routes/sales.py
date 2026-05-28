"""POS sale lifecycle routes (Phase 15, Plan 15-04).

Routes:
    GET    /api/sales/                              — list with filters
    POST   /api/sales/                              — open new sale (optional prefill)
    GET    /api/sales/{sale_id}/                    — single sale + remaining
    PATCH  /api/sales/{sale_id}/                    — update notes (open only)
    DELETE /api/sales/{sale_id}/                    — void open sale
    POST   /api/sales/{sale_id}/lines/              — add SaleLineItem
    PATCH  /api/sales/{sale_id}/lines/{line_id}/    — edit line
    DELETE /api/sales/{sale_id}/lines/{line_id}/    — remove line
    POST   /api/sales/{sale_id}/close/              — close sale (financial-and-inventory commit)

Payment routes (POST payments, POST stripe-confirm, DELETE pending) mount on this
shared `router` via decorators in `sale_payments.py` (single-router pattern,
WARNING #6).

All routes gated on `Entitlement.RETAIL_POS` + `ClinicalAction.OPEN_POS`.
Primary-TXN audit per `.claude/rules/clinical-safety.md`.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.audit import log_action
from backend.core.entitlements import require_entitlement
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import (
    AuditAction,
    InventoryTransaction,
    OpticalOrder,
    OpticalOrderLineItem,
    Product,
    Refund,
    Sale,
    SaleLineItem,
)
from backend.db.session import get_db
from backend.schemas.sales import (
    RefundLineItemResponse,
    RefundPaymentResponse,
    RefundResponse,
    SaleCreate,
    SaleLineItemCreate,
    SaleLineItemUpdate,
    SaleResponse,
)
from backend.services.money import quantize_money
from backend.services.sale_lifecycle import (
    compute_remaining,
    compute_sale_totals,
    generate_receipt_number,
    load_cart_from_sources,
    maybe_dispense_optical_orders,
)

router = APIRouter(
    prefix="/api/sales",
    tags=["sales"],
    dependencies=[Depends(require_entitlement("retail_pos"))],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_tenant(db: AsyncSession, tenant_id: UUID) -> Tenant:
    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


async def _load_sale(
    db: AsyncSession, ctx: TenantContext, sale_id: UUID, *, require_open: bool = False
) -> Sale:
    sale = (
        await db.execute(
            select(Sale)
            .where(
                Sale.id == sale_id,
                Sale.tenant_id == ctx.tenant_id,
            )
            .options(
                selectinload(Sale.lines),
                selectinload(Sale.payments),
                selectinload(Sale.refunds),
            )
        )
    ).scalar_one_or_none()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if require_open and sale.status != "open":
        raise HTTPException(
            status_code=409,
            detail={"error": "not_open", "message": f"Sale is {sale.status}"},
        )
    return sale


def _sale_response(sale: Sale) -> SaleResponse:
    remaining = compute_remaining(sale.total, sale.payments or [])
    return SaleResponse.model_validate(
        {
            "id": sale.id,
            "tenant_id": sale.tenant_id,
            "patient_id": sale.patient_id,
            "status": sale.status,
            "subtotal": sale.subtotal,
            "tax": sale.tax,
            "discount_total": sale.discount_total,
            "total": sale.total,
            "receipt_number": sale.receipt_number,
            "receipt_url": sale.receipt_url,
            "notes": sale.notes,
            "opened_at": sale.opened_at,
            "closed_at": sale.closed_at,
            "created_at": sale.created_at,
            "updated_at": sale.updated_at,
            "lines": sale.lines or [],
            "payments": sale.payments or [],
            "refunds": sale.refunds or [],
            "remaining": remaining,
        }
    )


async def _recompute_and_persist_totals(
    db: AsyncSession, tenant: Tenant, sale: Sale
) -> None:
    totals = compute_sale_totals(sale.lines, tenant.sales_tax_rate or Decimal("0.00"))
    sale.subtotal = totals["subtotal"]
    sale.discount_total = totals["discount_total"]
    sale.tax = totals["tax"]
    sale.total = totals["total"]


def _validate_discount_reason(
    discount_amount: Decimal | None, discount_reason: str | None
) -> None:
    if discount_amount and discount_amount > Decimal("0.00"):
        if not discount_reason or not discount_reason.strip():
            raise HTTPException(
                status_code=400,
                detail="discount_reason required when applying discount",
            )


def _line_total(qty: int, unit_price: Decimal, discount_amount: Decimal) -> Decimal:
    return quantize_money(Decimal(qty) * unit_price - discount_amount)


# ---------------------------------------------------------------------------
# Sale CRUD
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[SaleResponse])
async def list_sales(
    request: Request,
    patient_id: UUID | None = Query(None),
    status: Literal["open", "paid", "refunded", "voided"] | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    clauses = [Sale.tenant_id == ctx.tenant_id]
    if patient_id:
        clauses.append(Sale.patient_id == patient_id)
    if status:
        clauses.append(Sale.status == status)
    if date_from:
        clauses.append(Sale.opened_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        clauses.append(Sale.opened_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc))

    rows = (
        await db.execute(
            select(Sale)
            .where(and_(*clauses))
            .options(
                selectinload(Sale.lines),
                selectinload(Sale.payments),
                selectinload(Sale.refunds),
            )
            .order_by(Sale.opened_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return [_sale_response(s) for s in rows]


@router.post("/", response_model=SaleResponse, status_code=201)
async def open_sale(
    body: SaleCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    staff = await resolve_staff(ctx, db)
    tenant = await _load_tenant(db, ctx.tenant_id)
    sale = Sale(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=body.patient_id,
        status="open",
        notes=body.notes,
        created_by_id=staff.id if staff else None,
        opened_at=datetime.now(timezone.utc),
    )
    db.add(sale)
    await db.flush()

    if body.prefill:
        superbill_ids = [p.source_id for p in body.prefill if p.kind == "superbill"]
        optical_order_ids = [p.source_id for p in body.prefill if p.kind == "optical_order"]
        await load_cart_from_sources(db, sale, superbill_ids, optical_order_ids)

    await _recompute_and_persist_totals(db, tenant, sale)

    await log_action(
        db, ctx, AuditAction.SALE_CREATE, "sale", sale.id,
        staff_id=staff.id if staff else None,
        patient_id=sale.patient_id,
        metadata={
            "prefill_count": len(body.prefill or []),
            "total": str(sale.total),
        },
        ip_address=request.client.host if request.client else None,
    )
    await log_action(
        db, ctx, AuditAction.SALE_OPENED, "sale", sale.id,
        staff_id=staff.id if staff else None,
        patient_id=sale.patient_id,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    sale = await _load_sale(db, ctx, sale.id)
    return _sale_response(sale)


@router.get("/{sale_id}/", response_model=SaleResponse)
async def get_sale(
    sale_id: UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx, sale_id)
    return _sale_response(sale)


@router.patch("/{sale_id}/", response_model=SaleResponse)
async def update_sale(
    sale_id: UUID,
    body: SaleCreate,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx, sale_id, require_open=True)
    if body.notes is not None:
        sale.notes = body.notes
    await db.commit()
    sale = await _load_sale(db, ctx, sale_id)
    return _sale_response(sale)


@router.delete("/{sale_id}/", status_code=204)
async def void_sale(
    sale_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx, sale_id, require_open=True)
    staff = await resolve_staff(ctx, db)
    if sale.payments:
        raise HTTPException(
            status_code=409,
            detail="Cannot void sale with recorded payments",
        )
    sale.status = "voided"
    await log_action(
        db, ctx, AuditAction.SALE_VOIDED, "sale", sale.id,
        staff_id=staff.id if staff else None,
        patient_id=sale.patient_id,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Line item CRUD
# ---------------------------------------------------------------------------


@router.post("/{sale_id}/lines/", response_model=SaleResponse, status_code=201)
async def add_line(
    sale_id: UUID,
    body: SaleLineItemCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx, sale_id, require_open=True)
    staff = await resolve_staff(ctx, db)
    tenant = await _load_tenant(db, ctx.tenant_id)
    _validate_discount_reason(body.discount_amount, body.discount_reason)

    line = SaleLineItem(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        sale_id=sale.id,
        source_type=body.source_type,
        source_id=body.source_id,
        description=body.description,
        qty=body.qty,
        unit_price=quantize_money(body.unit_price),
        discount_amount=quantize_money(body.discount_amount or Decimal("0.00")),
        discount_reason=body.discount_reason,
        taxable=body.taxable,
        line_total=_line_total(body.qty, body.unit_price, body.discount_amount or Decimal("0.00")),
    )
    db.add(line)
    sale.lines.append(line)
    await db.flush()

    if line.discount_amount > Decimal("0.00"):
        await log_action(
            db, ctx, AuditAction.SALE_DISCOUNT_APPLIED, "sale_line_item", line.id,
            staff_id=staff.id if staff else None,
            patient_id=sale.patient_id,
            metadata={
                "sale_id": str(sale.id),
                "discount_amount": str(line.discount_amount),
                "reason": line.discount_reason,
            },
            ip_address=request.client.host if request.client else None,
        )

    await _recompute_and_persist_totals(db, tenant, sale)
    await db.commit()
    sale = await _load_sale(db, ctx, sale_id)
    return _sale_response(sale)


@router.patch("/{sale_id}/lines/{line_id}/", response_model=SaleResponse)
async def update_line(
    sale_id: UUID,
    line_id: UUID,
    body: SaleLineItemUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx, sale_id, require_open=True)
    staff = await resolve_staff(ctx, db)
    tenant = await _load_tenant(db, ctx.tenant_id)

    line = next((li for li in sale.lines if li.id == line_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")

    prior_discount = line.discount_amount
    if body.qty is not None:
        line.qty = body.qty
    if body.unit_price is not None:
        line.unit_price = quantize_money(body.unit_price)
    if body.discount_amount is not None:
        line.discount_amount = quantize_money(body.discount_amount)
    if body.discount_reason is not None:
        line.discount_reason = body.discount_reason
    if body.taxable is not None:
        line.taxable = body.taxable
    if body.description is not None:
        line.description = body.description

    _validate_discount_reason(line.discount_amount, line.discount_reason)
    line.line_total = _line_total(line.qty, line.unit_price, line.discount_amount)

    if line.discount_amount != prior_discount and line.discount_amount > Decimal("0.00"):
        await log_action(
            db, ctx, AuditAction.SALE_DISCOUNT_APPLIED, "sale_line_item", line.id,
            staff_id=staff.id if staff else None,
            patient_id=sale.patient_id,
            metadata={
                "sale_id": str(sale.id),
                "discount_amount": str(line.discount_amount),
                "prior_discount": str(prior_discount),
                "reason": line.discount_reason,
            },
            ip_address=request.client.host if request.client else None,
        )

    await _recompute_and_persist_totals(db, tenant, sale)
    await db.commit()
    sale = await _load_sale(db, ctx, sale_id)
    return _sale_response(sale)


@router.delete("/{sale_id}/lines/{line_id}/", response_model=SaleResponse)
async def delete_line(
    sale_id: UUID,
    line_id: UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx, sale_id, require_open=True)
    tenant = await _load_tenant(db, ctx.tenant_id)
    line = next((li for li in sale.lines if li.id == line_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    sale.lines.remove(line)
    await db.delete(line)
    await db.flush()
    await _recompute_and_persist_totals(db, tenant, sale)
    await db.commit()
    sale = await _load_sale(db, ctx, sale_id)
    return _sale_response(sale)


# ---------------------------------------------------------------------------
# CLOSE — the financial-and-inventory commit point
# ---------------------------------------------------------------------------


@router.post("/{sale_id}/close/", response_model=SaleResponse)
async def close_sale(
    sale_id: UUID,
    request: Request,
    mark_dispensed: bool = Query(False, alias="markDispensed"),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx, sale_id, require_open=True)
    staff = await resolve_staff(ctx, db)
    tenant = await _load_tenant(db, ctx.tenant_id)

    # Recompute totals defensively before checking remaining.
    await _recompute_and_persist_totals(db, tenant, sale)
    remaining = compute_remaining(sale.total, sale.payments or [])
    if remaining > Decimal("0.00"):
        raise HTTPException(
            status_code=409,
            detail=f"Sale can't close — ${remaining:.2f} still owed",
        )

    # Decrement stock for product + optical_order lines. Row-lock per line
    # (Pitfall 3): two concurrent close-sale calls cannot both read stock_qty=1.
    zero_stock_lines: list[UUID] = []
    for line in sale.lines:
        if line.source_type not in ("product", "optical_order"):
            continue
        # Resolve product_id: 'product' source_id IS the product_id; 'optical_order'
        # walks the FK populated by Plan 15-03 prefill (no fragile description match).
        if line.source_type == "product":
            product_id = line.source_id
        else:
            if not line.optical_order_line_item_id:
                continue
            oli = await db.get(OpticalOrderLineItem, line.optical_order_line_item_id)
            if not oli:
                continue
            product_id = oli.product_id
        if not product_id:
            continue
        product = (
            await db.execute(
                select(Product)
                .where(
                    Product.id == product_id,
                    Product.tenant_id == ctx.tenant_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if not product:
            continue
        if product.stock_qty <= 0:
            zero_stock_lines.append(line.id)
        product.stock_qty = product.stock_qty - line.qty
        db.add(
            InventoryTransaction(
                id=uuid.uuid4(),
                tenant_id=ctx.tenant_id,
                product_id=product.id,
                delta=-line.qty,
                reason="sale_placed",
                sale_id=sale.id,
                staff_id=staff.id if staff else None,
            )
        )

    dispensed_orders = await maybe_dispense_optical_orders(
        db, ctx, sale, mark_dispensed
    )

    receipt_number = await generate_receipt_number(db, ctx.tenant_id)
    sale.receipt_number = receipt_number
    sale.closed_at = datetime.now(timezone.utc)
    sale.status = "paid"

    await log_action(
        db, ctx, AuditAction.SALE_PAID, "sale", sale.id,
        staff_id=staff.id if staff else None,
        patient_id=sale.patient_id,
        metadata={
            "receipt_number": receipt_number,
            "total": str(sale.total),
            "payment_count": len(sale.payments or []),
            "zero_stock_lines": [str(lid) for lid in zero_stock_lines],
            "dispensed_orders": [str(o.id) for o in dispensed_orders],
        },
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()
    sale = await _load_sale(db, ctx, sale_id)
    return _sale_response(sale)


# ---------------------------------------------------------------------------
# Nested refunds list (Plan 15-05) — single-router pattern (WARNING #6).
# ---------------------------------------------------------------------------


def _refund_to_response(refund: Refund) -> RefundResponse:
    return RefundResponse.model_validate(
        {
            "id": refund.id,
            "sale_id": refund.sale_id,
            "total_amount": refund.total_amount,
            "reason": refund.reason,
            "processor_refund_id": refund.processor_refund_id,
            "refunded_by_id": refund.refunded_by_id,
            "created_at": refund.created_at,
            "line_items": [
                RefundLineItemResponse.model_validate(li) for li in refund.line_items
            ],
            "payment_refunds": [
                RefundPaymentResponse.model_validate(pa)
                for pa in refund.payment_allocations
            ],
        }
    )


@router.get("/{sale_id}/refunds/", response_model=list[RefundResponse])
async def list_sale_refunds(
    sale_id: UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.OPEN_POS)),
    db: AsyncSession = Depends(get_db),
):
    # Verify the sale exists in this tenant before returning refund rows.
    exists = (
        await db.execute(
            select(Sale.id).where(
                Sale.id == sale_id, Sale.tenant_id == ctx.tenant_id
            )
        )
    ).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=404, detail="Sale not found")
    rows = (
        await db.execute(
            select(Refund)
            .where(
                Refund.sale_id == sale_id,
                Refund.tenant_id == ctx.tenant_id,
            )
            .options(
                selectinload(Refund.line_items),
                selectinload(Refund.payment_allocations),
            )
            .order_by(Refund.created_at.desc())
        )
    ).scalars().all()
    return [_refund_to_response(r) for r in rows]
