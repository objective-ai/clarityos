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
from datetime import datetime, timezone
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
    InventoryTransaction,
    LensType,
    OpticalOrder,
    OpticalOrderLineItem,
    Product,
    Refraction,
)
from backend.db.session import get_db
from backend.schemas.optical_order import (
    OpticalOrderActionWarning,
    OpticalOrderCreate,
    OpticalOrderPlaceResponse,
    OpticalOrderResponse,
    PatchOpticalOrderRequest,
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

    # Phase 14: auto-fill final_refraction_id from the encounter's most recent
    # FINAL refraction (or the patient's most recent FINAL refraction across
    # history for walk-in retail orders per CONTEXT §C Open Q #1).
    final_refraction_id: uuid.UUID | None = None
    if payload.encounter_id:
        stmt = (
            select(Refraction.id)
            .where(
                Refraction.encounter_id == payload.encounter_id,
                Refraction.is_final_rx.is_(True),
            )
            .order_by(Refraction.created_at.desc())
            .limit(1)
        )
    else:
        stmt = (
            select(Refraction.id)
            .where(
                Refraction.patient_id == payload.patient_id,
                Refraction.is_final_rx.is_(True),
            )
            .order_by(Refraction.created_at.desc())
            .limit(1)
        )
    final_refraction_id = (await db.execute(stmt)).scalar_one_or_none()

    total = Decimal("0.00")
    order = OpticalOrder(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=payload.patient_id,
        encounter_id=payload.encounter_id,
        status="draft",
        total_price=Decimal("0.00"),
        created_by_id=staff.id,
        final_refraction_id=final_refraction_id,
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


# ---------------------------------------------------------------------------
# PATCH /{order_id}/ — configurator autosave (Phase 14)
# ---------------------------------------------------------------------------


@router.patch("/{order_id}/", response_model=OpticalOrderResponse)
async def patch_optical_order(
    order_id: uuid.UUID,
    payload: PatchOpticalOrderRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CREATE_OPTICAL_ORDER)),
    db: AsyncSession = Depends(get_db),
):
    """Configurator autosave — accepts partial JSONB updates.

    Rejects with 409 when ``status != 'draft'`` (Pitfall 11; configurator
    UI must no-op once the order is placed). Writes a single
    ``OPTICAL_ORDER_CONFIGURE_UPDATE`` audit row with
    ``metadata.fields_changed`` listing every field touched — keeps the
    HIPAA log readable without flooding it on rapid autosave.
    """
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
    if order.status != "draft":
        raise HTTPException(
            status_code=409,
            detail={
                "error": "not_draft",
                "message": (
                    f"Order is {order.status}; PATCH only allowed in draft"
                ),
            },
        )

    staff = await resolve_staff(ctx, db)
    fields_changed: list[str] = []

    if payload.vision_plan is not None:
        order.vision_plan_jsonb = payload.vision_plan
        fields_changed.append("vision_plan")
    if payload.fitting is not None:
        order.fitting_jsonb = payload.fitting
        fields_changed.append("fitting")
    if payload.final_refraction_id is not None:
        order.final_refraction_id = payload.final_refraction_id
        fields_changed.append("final_refraction_id")
    if payload.habitual_refraction_id is not None:
        order.habitual_refraction_id = payload.habitual_refraction_id
        fields_changed.append("habitual_refraction_id")
    if payload.line_items:
        by_id = {li.id: li for li in order.line_items}
        for patch_line in payload.line_items:
            if patch_line.id not in by_id:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "unknown_line_item",
                        "id": str(patch_line.id),
                    },
                )
            if patch_line.lens_config is not None:
                by_id[patch_line.id].lens_config_jsonb = patch_line.lens_config
                fields_changed.append(
                    f"line_items[{patch_line.id}].lens_config"
                )

    if fields_changed:
        await log_action(
            db, ctx, AuditAction.OPTICAL_ORDER_CONFIGURE_UPDATE,
            "optical_order", order.id,
            staff_id=staff.id if staff else None,
            patient_id=order.patient_id,
            encounter_id=order.encounter_id,
            metadata={"fields_changed": fields_changed},
            ip_address=request.client.host if request.client else None,
        )
    await db.flush()
    order = (
        await db.execute(
            select(OpticalOrder)
            .where(OpticalOrder.id == order_id)
            .options(selectinload(OpticalOrder.line_items))
        )
    ).scalar_one()
    await db.commit()
    return _order_response(order)


# ---------------------------------------------------------------------------
# POST /{order_id}/place/ — atomic draft -> placed (CROWN JEWEL)
# ---------------------------------------------------------------------------


@router.post(
    "/{order_id}/place/",
    response_model=OpticalOrderPlaceResponse,
)
async def place_order(
    order_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CREATE_OPTICAL_ORDER)),
    db: AsyncSession = Depends(get_db),
):
    """Transition draft -> placed atomically with stock decrement.

    Per .claude/rules/clinical-safety.md, this handler MUST execute the
    following in a single ``db.commit()``:
      1. ``SELECT ... FOR UPDATE`` on each line's Product row
         (``with_for_update()``) so concurrent /place calls cannot drive
         stock below 0 (Pitfall 5 in 13-RESEARCH.md).
      2. Decrement ``Product.stock_qty`` by ``line.qty``.
      3. Insert one ``InventoryTransaction(reason='order_placed', delta=-qty)``
         per line.
      4. Flip ``order.status`` to 'placed' and stamp ``placed_at``.
      5. Emit ``AuditAction.OPTICAL_ORDER_PLACE`` via ``log_action``.

    Zero-stock soft-block (CONTEXT §B): if any line's product has
    ``stock_qty <= 0`` BEFORE decrement, return 200 with
    ``warnings=[{code:'zero_stock', ...}]`` and let the order place anyway.
    Mirrors the Phase 10.2 overbooking pattern.
    """
    staff = await resolve_staff(ctx, db)

    # Row-lock the order so concurrent /place calls serialise — second
    # request waits, then re-reads status='placed' and 409s.
    order = (
        await db.execute(
            select(OpticalOrder)
            .where(
                OpticalOrder.id == order_id,
                OpticalOrder.tenant_id == ctx.tenant_id,
            )
            .with_for_update()
            .options(selectinload(OpticalOrder.line_items))
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "draft":
        raise HTTPException(
            status_code=409,
            detail=f"Order is {order.status}; only draft orders can be placed",
        )

    # Phase 14: lens-config validation runs synchronously BEFORE any row-locks
    # are taken (Pitfall 7 — a 400 must not leave stale FOR UPDATE locks held
    # by a partially-committed transaction). Validation pulls from in-memory
    # order.line_items (already eagerloaded above) plus per-unique LensType.
    field_errors: list[dict] = []
    lens_type_cache: dict[uuid.UUID, LensType | None] = {}
    fitting = order.fitting_jsonb or {}
    for idx, line in enumerate(order.line_items):
        lc = line.lens_config_jsonb or None
        if not lc:
            # Frame-only or contact-lens line — no spectacle-lens build.
            continue
        lens_type_id_raw = lc.get("lens_type_id")
        if not lens_type_id_raw:
            field_errors.append({
                "path": f"line_items[{idx}].lens_config.lens_type_id",
                "code": "required",
                "message": "Lens type required",
            })
            continue
        try:
            lens_type_uuid = (
                lens_type_id_raw
                if isinstance(lens_type_id_raw, uuid.UUID)
                else uuid.UUID(str(lens_type_id_raw))
            )
        except (TypeError, ValueError):
            field_errors.append({
                "path": f"line_items[{idx}].lens_config.lens_type_id",
                "code": "invalid",
                "message": "Lens type id is not a valid UUID",
            })
            continue
        if lens_type_uuid not in lens_type_cache:
            lens_type_cache[lens_type_uuid] = await db.get(LensType, lens_type_uuid)
        lens_type = lens_type_cache[lens_type_uuid]
        if (
            not lens_type
            or lens_type.tenant_id != ctx.tenant_id
            or not lens_type.is_active
        ):
            field_errors.append({
                "path": f"line_items[{idx}].lens_config.lens_type_id",
                "code": "invalid",
                "message": "Unknown or inactive lens type",
            })
            continue
        if not lc.get("material_id"):
            field_errors.append({
                "path": f"line_items[{idx}].lens_config.material_id",
                "code": "required",
                "message": "Lens material required",
            })
        if lens_type.requires_seg_height:
            if not fitting.get("seg_height_od") or not fitting.get("seg_height_os"):
                field_errors.append({
                    "path": "fitting.seg_height_od",
                    "code": "required",
                    "message": (
                        "Seg height OD/OS required for "
                        f"{lens_type.name} lenses"
                    ),
                })
        if lens_type.requires_vertex:
            if not fitting.get("vertex_distance"):
                field_errors.append({
                    "path": "fitting.vertex_distance",
                    "code": "required",
                    "message": (
                        f"Vertex distance required for {lens_type.name} lenses"
                    ),
                })

    if field_errors:
        # No row-locks have been taken yet — safe to bail out.
        raise HTTPException(
            status_code=400, detail={"field_errors": field_errors}
        )

    warnings: list[OpticalOrderActionWarning] = []

    # CRITICAL: row-lock each Product BEFORE mutating to prevent over-decrement
    # under concurrency. Pitfall 5 (13-RESEARCH.md) — without with_for_update,
    # two parallel /place calls can both read stock_qty=1 and both decrement
    # to 0 (then to -1 with no enforcement).
    for line in order.line_items:
        product = (
            await db.execute(
                select(Product)
                .where(
                    Product.id == line.product_id,
                    Product.tenant_id == ctx.tenant_id,
                )
                .with_for_update()
            )
        ).scalar_one()
        # Soft-block: warn but allow the transition (CONTEXT §B).
        new_stock = product.stock_qty - line.qty
        if product.stock_qty <= 0:
            warnings.append(
                OpticalOrderActionWarning(
                    code="zero_stock",
                    product_id=product.id,
                    message=f"{product.sku}: stock {new_stock}",
                )
            )
        elif product.stock_qty <= product.reorder_threshold:
            warnings.append(
                OpticalOrderActionWarning(
                    code="low_stock",
                    product_id=product.id,
                    message=f"{product.sku}: stock {new_stock}",
                )
            )
        product.stock_qty = new_stock
        db.add(
            InventoryTransaction(
                id=uuid.uuid4(),
                tenant_id=ctx.tenant_id,
                product_id=product.id,
                delta=-line.qty,
                reason="order_placed",
                optical_order_id=order.id,
                staff_id=staff.id if staff else None,
            )
        )

    order.status = "placed"
    order.placed_at = datetime.now(timezone.utc)

    await log_action(
        db, ctx, AuditAction.OPTICAL_ORDER_PLACE, "optical_order", order.id,
        staff_id=staff.id if staff else None,
        patient_id=order.patient_id,
        encounter_id=order.encounter_id,
        changes={"status": {"old": "draft", "new": "placed"}},
        detail=(
            f"Placed optical order {order.id} "
            f"({len(order.line_items)} line items, total {order.total_price})"
        ),
        ip_address=request.client.host if request.client else None,
    )
    await db.flush()

    # Re-fetch with selectinload before commit so the response carries line
    # items eagerly loaded (per backend-python rules — never db.refresh).
    order = (
        await db.execute(
            select(OpticalOrder)
            .where(OpticalOrder.id == order.id)
            .options(selectinload(OpticalOrder.line_items))
        )
    ).scalar_one()
    await db.commit()

    return OpticalOrderPlaceResponse(order=_order_response(order), warnings=warnings)


# ---------------------------------------------------------------------------
# POST /{order_id}/cancel/ — atomic * -> cancelled (restocks if was placed)
# ---------------------------------------------------------------------------


@router.post(
    "/{order_id}/cancel/",
    response_model=OpticalOrderResponse,
)
async def cancel_order(
    order_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CANCEL_OPTICAL_ORDER)),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an order atomically; restock if it was 'placed'.

    Cancelling a 'draft' order is a no-stock-movement transition (no
    InventoryTransaction is written) — only the status flip + audit row.
    Cancelling a 'placed' order restocks each line (positive delta) and
    writes one ``InventoryTransaction(reason='order_cancelled')`` per line.
    All in a single ``db.commit()``.
    """
    staff = await resolve_staff(ctx, db)

    # Row-lock the order itself so concurrent cancel/dispense calls serialise.
    # Without this, two simultaneous /cancel requests both observe
    # status='placed' before either commits, both restock, and inventory
    # ends up double-credited (UAT 2026-05-07: clicking Cancel twice
    # incremented stock by 2x the line qty). Locking forces the second
    # request to wait, then re-read the now-cancelled status and 409.
    order = (
        await db.execute(
            select(OpticalOrder)
            .where(
                OpticalOrder.id == order_id,
                OpticalOrder.tenant_id == ctx.tenant_id,
            )
            .with_for_update()
            .options(selectinload(OpticalOrder.line_items))
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "cancelled":
        raise HTTPException(status_code=409, detail="Order already cancelled")
    if order.status == "dispensed":
        raise HTTPException(status_code=409, detail="Cannot cancel a dispensed order")

    was_placed = order.status == "placed"
    if was_placed:
        # Row-lock each Product before restocking — needed to serialise vs any
        # concurrent /place that might be racing on the same product (Pitfall 5).
        for line in order.line_items:
            product = (
                await db.execute(
                    select(Product)
                    .where(
                        Product.id == line.product_id,
                        Product.tenant_id == ctx.tenant_id,
                    )
                    .with_for_update()
                )
            ).scalar_one()
            product.stock_qty = product.stock_qty + line.qty
            db.add(
                InventoryTransaction(
                    id=uuid.uuid4(),
                    tenant_id=ctx.tenant_id,
                    product_id=product.id,
                    delta=line.qty,
                    reason="order_cancelled",
                    optical_order_id=order.id,
                    staff_id=staff.id if staff else None,
                )
            )

    old_status = order.status
    order.status = "cancelled"
    order.cancelled_at = datetime.now(timezone.utc)

    await log_action(
        db, ctx, AuditAction.OPTICAL_ORDER_CANCEL, "optical_order", order.id,
        staff_id=staff.id if staff else None,
        patient_id=order.patient_id,
        encounter_id=order.encounter_id,
        changes={"status": {"old": old_status, "new": "cancelled"}},
        detail=(
            f"Cancelled optical order {order.id}"
            + (
                f" (restocked {len(order.line_items)} lines)"
                if was_placed
                else ""
            )
        ),
        ip_address=request.client.host if request.client else None,
    )
    await db.flush()

    order = (
        await db.execute(
            select(OpticalOrder)
            .where(OpticalOrder.id == order.id)
            .options(selectinload(OpticalOrder.line_items))
        )
    ).scalar_one()
    await db.commit()

    return _order_response(order)


# ---------------------------------------------------------------------------
# POST /{order_id}/dispense/ — placed -> dispensed (no stock movement)
# ---------------------------------------------------------------------------


@router.post(
    "/{order_id}/dispense/",
    response_model=OpticalOrderResponse,
)
async def dispense_order(
    order_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CREATE_OPTICAL_ORDER)),
    db: AsyncSession = Depends(get_db),
):
    """Transition placed -> dispensed; status + audit row only (no stock movement)."""
    staff = await resolve_staff(ctx, db)

    # Row-lock so concurrent /dispense calls serialise (second request waits,
    # re-reads status='dispensed', then 409s). No stock movement here, but
    # double-dispense would still write two audit rows without the lock.
    order = (
        await db.execute(
            select(OpticalOrder)
            .where(
                OpticalOrder.id == order_id,
                OpticalOrder.tenant_id == ctx.tenant_id,
            )
            .with_for_update()
            .options(selectinload(OpticalOrder.line_items))
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "placed":
        raise HTTPException(
            status_code=409,
            detail=f"Order is {order.status}; only placed orders can be dispensed",
        )

    order.status = "dispensed"
    order.dispensed_at = datetime.now(timezone.utc)

    await log_action(
        db, ctx, AuditAction.OPTICAL_ORDER_DISPENSE, "optical_order", order.id,
        staff_id=staff.id if staff else None,
        patient_id=order.patient_id,
        encounter_id=order.encounter_id,
        changes={"status": {"old": "placed", "new": "dispensed"}},
        detail=f"Dispensed optical order {order.id}",
        ip_address=request.client.host if request.client else None,
    )
    await db.flush()

    order = (
        await db.execute(
            select(OpticalOrder)
            .where(OpticalOrder.id == order.id)
            .options(selectinload(OpticalOrder.line_items))
        )
    ).scalar_one()
    await db.commit()

    return _order_response(order)
