"""Phase 13 — Optical Order routes (thin primitive; Phase 14 extends).

State transitions:
  create   -> draft
  place    -> draft -> placed       (atomic stock decrement + InventoryTransaction)
  cancel   -> * (non-cancelled) -> cancelled  (atomic restock + InventoryTransaction)
  dispense -> placed -> dispensed   (no stock movement)

All transitions log via log_action() in primary TXN per .claude/rules/clinical-safety.md.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.audit import log_action
from backend.core.entitlements import require_entitlement
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import (
    AuditAction,
    OpticalOrder,
    OpticalOrderLineItem,
    Product,
)
from backend.db.session import get_db
from backend.schemas.optical_order import (
    OpticalOrderCreate,
    OpticalOrderResponse,
)

router = APIRouter(dependencies=[Depends(require_entitlement("retail_pos"))])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _order_response(order: OpticalOrder) -> OpticalOrderResponse:
    return OpticalOrderResponse.model_validate(order, from_attributes=True)


# ---------------------------------------------------------------------------
# GET / — list orders (filterable by patient or encounter)
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[OpticalOrderResponse])
async def list_orders(
    patient_id: Optional[uuid.UUID] = Query(None),
    encounter_id: Optional[uuid.UUID] = Query(None),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_OPTICAL_ORDER)),
    db: AsyncSession = Depends(get_db),
):
    """List optical orders for the tenant — newest first.

    Returns ``[]`` (NOT 204) when no orders match (Pitfall 4 in 13-RESEARCH.md).
    """
    stmt = (
        select(OpticalOrder)
        .where(OpticalOrder.tenant_id == ctx.tenant_id)
        .options(selectinload(OpticalOrder.line_items))
        .order_by(OpticalOrder.created_at.desc())
    )
    if patient_id:
        stmt = stmt.where(OpticalOrder.patient_id == patient_id)
    if encounter_id:
        stmt = stmt.where(OpticalOrder.encounter_id == encounter_id)
    rows = (await db.execute(stmt)).scalars().all()
    return [_order_response(o) for o in rows]


# ---------------------------------------------------------------------------
# POST / — create draft order
# ---------------------------------------------------------------------------


@router.post("/", response_model=OpticalOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OpticalOrderCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CREATE_OPTICAL_ORDER)),
    db: AsyncSession = Depends(get_db),
):
    """Create a draft OpticalOrder with line items.

    ``encounter_id`` is optional: walk-in retail orders flow straight through
    with ``encounter_id=None`` (INV-10).
    """
    if not payload.line_items:
        raise HTTPException(status_code=400, detail="line_items must not be empty")

    staff = await resolve_staff(ctx, db)
    if not staff:
        raise HTTPException(
            status_code=403,
            detail="Order creator must be a staff member",
        )

    # Validate every product exists and is active BEFORE creating any rows —
    # fail-fast prevents partial writes.
    product_ids = [li.product_id for li in payload.line_items]
    products = (
        await db.execute(
            select(Product).where(
                Product.tenant_id == ctx.tenant_id,
                Product.id.in_(product_ids),
            )
        )
    ).scalars().all()
    by_id = {p.id: p for p in products}
    for li in payload.line_items:
        p = by_id.get(li.product_id)
        if not p:
            raise HTTPException(
                status_code=404,
                detail=f"Product {li.product_id} not found",
            )
        if not p.is_active:
            raise HTTPException(
                status_code=409,
                detail=f"Product {p.sku} is inactive",
            )

    total = Decimal("0.00")
    order = OpticalOrder(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=payload.patient_id,
        encounter_id=payload.encounter_id,
        status="draft",
        total_price=Decimal("0.00"),
        created_by_id=staff.id,
    )
    db.add(order)
    await db.flush()

    for li in payload.line_items:
        unit = Decimal(str(li.unit_price))
        line_total = unit * li.qty
        total += line_total
        db.add(
            OpticalOrderLineItem(
                id=uuid.uuid4(),
                tenant_id=ctx.tenant_id,
                order_id=order.id,
                product_id=li.product_id,
                qty=li.qty,
                unit_price=unit,
                line_total=line_total,
            )
        )
    order.total_price = total
    await db.flush()

    await log_action(
        db, ctx, AuditAction.OPTICAL_ORDER_CREATE, "optical_order", order.id,
        staff_id=staff.id,
        patient_id=order.patient_id,
        encounter_id=order.encounter_id,
        detail=(
            f"Created draft optical order ({len(payload.line_items)} line items, "
            f"total {total})"
        ),
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    # Re-fetch with selectinload so the response has line items eagerly loaded
    # (per .claude/rules/backend-python.md — never db.refresh).
    order = (
        await db.execute(
            select(OpticalOrder)
            .where(OpticalOrder.id == order.id)
            .options(selectinload(OpticalOrder.line_items))
        )
    ).scalar_one()
    return _order_response(order)


# ---------------------------------------------------------------------------
# GET /{order_id}/ — order detail
# ---------------------------------------------------------------------------


@router.get("/{order_id}/", response_model=OpticalOrderResponse)
async def get_order(
    order_id: uuid.UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_OPTICAL_ORDER)),
    db: AsyncSession = Depends(get_db),
):
    order = (
        await db.execute(
            select(OpticalOrder)
            .where(
                OpticalOrder.id == order_id,
                OpticalOrder.tenant_id == ctx.tenant_id,
            )
            .options(selectinload(OpticalOrder.line_items))
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _order_response(order)
