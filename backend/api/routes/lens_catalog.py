"""Phase 14 — Admin-managed lens reference catalog (types, materials, coatings).

15 routes — 5 per resource (list, create, get, patch, soft-delete) for each of
``LensType``, ``LensMaterial``, ``LensCoating``. Mirrors the Phase 13 Product
CRUD pattern at backend/api/routes/inventory.py.

Permission model (CONTEXT §G):
- All reads gated on ``VIEW_INVENTORY`` (any clinical role — frame picker in
  configurator needs broad read access).
- All mutations gated on ``MANAGE_LENS_CATALOG`` (admin/owner only).
- Router-level ``Entitlement.RETAIL_POS`` gate prevents tenants without the
  retail add-on from touching lens catalog at all.

Audit model (CONTEXT §H):
- Every CREATE writes a ``LENS_{TYPE|MATERIAL|COATING}_CREATE`` row in the
  primary TXN before ``db.commit()``.
- PATCH reuses the CREATE action with ``metadata={"action": "update"}``;
  DELETE reuses with ``metadata={"action": "deactivate"}``.
- Partial unique index violations (409) are caught and converted to
  ``{"error": "duplicate_name", "field": "name"}`` payloads.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.entitlements import Entitlement, require_entitlement
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import (
    AuditAction,
    LensCoating,
    LensMaterial,
    LensType,
)
from backend.db.session import get_db
from backend.schemas.lens_catalog import (
    LensCoatingCreate,
    LensCoatingResponse,
    LensCoatingUpdate,
    LensMaterialCreate,
    LensMaterialResponse,
    LensMaterialUpdate,
    LensTypeCreate,
    LensTypeResponse,
    LensTypeUpdate,
)


router = APIRouter(
    dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))]
)


_DUP_NAME = {"error": "duplicate_name", "field": "name"}


# ---------------------------------------------------------------------------
# LensType
# ---------------------------------------------------------------------------


@router.get("/types/", response_model=list[LensTypeResponse])
async def list_lens_types(
    include_inactive: bool = Query(False),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(LensType).where(LensType.tenant_id == ctx.tenant_id)
    if not include_inactive:
        stmt = stmt.where(LensType.is_active.is_(True))
    stmt = stmt.order_by(LensType.display_order, LensType.name)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


@router.post(
    "/types/",
    response_model=LensTypeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_lens_type(
    payload: LensTypeCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_LENS_CATALOG)),
    db: AsyncSession = Depends(get_db),
):
    staff = await resolve_staff(ctx, db)
    row = LensType(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        **payload.model_dump(by_alias=False),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=_DUP_NAME) from exc

    await log_action(
        db, ctx, AuditAction.LENS_TYPE_CREATE, "lens_type", row.id,
        staff_id=staff.id if staff else None,
        detail=f"Created lens type {row.name!r}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    row = (await db.execute(select(LensType).where(LensType.id == row.id))).scalar_one()
    return row


@router.get("/types/{type_id}/", response_model=LensTypeResponse)
async def get_lens_type(
    type_id: uuid.UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(LensType).where(
                LensType.id == type_id,
                LensType.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lens type not found")
    return row


@router.patch("/types/{type_id}/", response_model=LensTypeResponse)
async def update_lens_type(
    type_id: uuid.UUID,
    payload: LensTypeUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_LENS_CATALOG)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(LensType).where(
                LensType.id == type_id,
                LensType.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lens type not found")
    staff = await resolve_staff(ctx, db)

    changes: dict[str, dict] = {}
    for field, new in payload.model_dump(exclude_unset=True, by_alias=False).items():
        old = getattr(row, field, None)
        if old != new:
            changes[field] = {
                "old": str(old) if old is not None else None,
                "new": str(new) if new is not None else None,
            }
            setattr(row, field, new)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=_DUP_NAME) from exc

    await log_action(
        db, ctx, AuditAction.LENS_TYPE_CREATE, "lens_type", row.id,
        staff_id=staff.id if staff else None,
        changes=changes if changes else None,
        metadata={"action": "update"},
        detail=f"Updated lens type {row.name!r}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    row = (await db.execute(select(LensType).where(LensType.id == row.id))).scalar_one()
    return row


@router.delete(
    "/types/{type_id}/",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def deactivate_lens_type(
    type_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_LENS_CATALOG)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(LensType).where(
                LensType.id == type_id,
                LensType.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lens type not found")
    if not row.is_active:
        # Idempotent — already deactivated.
        return
    staff = await resolve_staff(ctx, db)
    row.is_active = False
    await db.flush()
    await log_action(
        db, ctx, AuditAction.LENS_TYPE_CREATE, "lens_type", row.id,
        staff_id=staff.id if staff else None,
        metadata={"action": "deactivate"},
        detail=f"Deactivated lens type {row.name!r}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()


# ---------------------------------------------------------------------------
# LensMaterial
# ---------------------------------------------------------------------------


@router.get("/materials/", response_model=list[LensMaterialResponse])
async def list_lens_materials(
    include_inactive: bool = Query(False),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(LensMaterial).where(LensMaterial.tenant_id == ctx.tenant_id)
    if not include_inactive:
        stmt = stmt.where(LensMaterial.is_active.is_(True))
    stmt = stmt.order_by(LensMaterial.display_order, LensMaterial.name)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


@router.post(
    "/materials/",
    response_model=LensMaterialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_lens_material(
    payload: LensMaterialCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_LENS_CATALOG)),
    db: AsyncSession = Depends(get_db),
):
    staff = await resolve_staff(ctx, db)
    row = LensMaterial(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        **payload.model_dump(by_alias=False),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=_DUP_NAME) from exc

    await log_action(
        db, ctx, AuditAction.LENS_MATERIAL_CREATE, "lens_material", row.id,
        staff_id=staff.id if staff else None,
        detail=f"Created lens material {row.name!r}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    row = (await db.execute(select(LensMaterial).where(LensMaterial.id == row.id))).scalar_one()
    return row


@router.get("/materials/{material_id}/", response_model=LensMaterialResponse)
async def get_lens_material(
    material_id: uuid.UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(LensMaterial).where(
                LensMaterial.id == material_id,
                LensMaterial.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lens material not found")
    return row


@router.patch("/materials/{material_id}/", response_model=LensMaterialResponse)
async def update_lens_material(
    material_id: uuid.UUID,
    payload: LensMaterialUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_LENS_CATALOG)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(LensMaterial).where(
                LensMaterial.id == material_id,
                LensMaterial.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lens material not found")
    staff = await resolve_staff(ctx, db)

    changes: dict[str, dict] = {}
    for field, new in payload.model_dump(exclude_unset=True, by_alias=False).items():
        old = getattr(row, field, None)
        if old != new:
            changes[field] = {
                "old": str(old) if old is not None else None,
                "new": str(new) if new is not None else None,
            }
            setattr(row, field, new)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=_DUP_NAME) from exc

    await log_action(
        db, ctx, AuditAction.LENS_MATERIAL_CREATE, "lens_material", row.id,
        staff_id=staff.id if staff else None,
        changes=changes if changes else None,
        metadata={"action": "update"},
        detail=f"Updated lens material {row.name!r}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    row = (await db.execute(select(LensMaterial).where(LensMaterial.id == row.id))).scalar_one()
    return row


@router.delete(
    "/materials/{material_id}/",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def deactivate_lens_material(
    material_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_LENS_CATALOG)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(LensMaterial).where(
                LensMaterial.id == material_id,
                LensMaterial.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lens material not found")
    if not row.is_active:
        return
    staff = await resolve_staff(ctx, db)
    row.is_active = False
    await db.flush()
    await log_action(
        db, ctx, AuditAction.LENS_MATERIAL_CREATE, "lens_material", row.id,
        staff_id=staff.id if staff else None,
        metadata={"action": "deactivate"},
        detail=f"Deactivated lens material {row.name!r}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()


# ---------------------------------------------------------------------------
# LensCoating
# ---------------------------------------------------------------------------


@router.get("/coatings/", response_model=list[LensCoatingResponse])
async def list_lens_coatings(
    include_inactive: bool = Query(False),
    category: Optional[str] = Query(None, max_length=20),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(LensCoating).where(LensCoating.tenant_id == ctx.tenant_id)
    if not include_inactive:
        stmt = stmt.where(LensCoating.is_active.is_(True))
    if category:
        stmt = stmt.where(LensCoating.category == category)
    stmt = stmt.order_by(LensCoating.display_order, LensCoating.name)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


@router.post(
    "/coatings/",
    response_model=LensCoatingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_lens_coating(
    payload: LensCoatingCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_LENS_CATALOG)),
    db: AsyncSession = Depends(get_db),
):
    staff = await resolve_staff(ctx, db)
    row = LensCoating(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        **payload.model_dump(by_alias=False),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=_DUP_NAME) from exc

    await log_action(
        db, ctx, AuditAction.LENS_COATING_CREATE, "lens_coating", row.id,
        staff_id=staff.id if staff else None,
        detail=f"Created lens coating {row.name!r}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    row = (await db.execute(select(LensCoating).where(LensCoating.id == row.id))).scalar_one()
    return row


@router.get("/coatings/{coating_id}/", response_model=LensCoatingResponse)
async def get_lens_coating(
    coating_id: uuid.UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_INVENTORY)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(LensCoating).where(
                LensCoating.id == coating_id,
                LensCoating.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lens coating not found")
    return row


@router.patch("/coatings/{coating_id}/", response_model=LensCoatingResponse)
async def update_lens_coating(
    coating_id: uuid.UUID,
    payload: LensCoatingUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_LENS_CATALOG)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(LensCoating).where(
                LensCoating.id == coating_id,
                LensCoating.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lens coating not found")
    staff = await resolve_staff(ctx, db)

    changes: dict[str, dict] = {}
    for field, new in payload.model_dump(exclude_unset=True, by_alias=False).items():
        old = getattr(row, field, None)
        if old != new:
            changes[field] = {
                "old": str(old) if old is not None else None,
                "new": str(new) if new is not None else None,
            }
            setattr(row, field, new)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail=_DUP_NAME) from exc

    await log_action(
        db, ctx, AuditAction.LENS_COATING_CREATE, "lens_coating", row.id,
        staff_id=staff.id if staff else None,
        changes=changes if changes else None,
        metadata={"action": "update"},
        detail=f"Updated lens coating {row.name!r}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    row = (await db.execute(select(LensCoating).where(LensCoating.id == row.id))).scalar_one()
    return row


@router.delete(
    "/coatings/{coating_id}/",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def deactivate_lens_coating(
    coating_id: uuid.UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_LENS_CATALOG)),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(LensCoating).where(
                LensCoating.id == coating_id,
                LensCoating.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lens coating not found")
    if not row.is_active:
        return
    staff = await resolve_staff(ctx, db)
    row.is_active = False
    await db.flush()
    await log_action(
        db, ctx, AuditAction.LENS_COATING_CREATE, "lens_coating", row.id,
        staff_id=staff.id if staff else None,
        metadata={"action": "deactivate"},
        detail=f"Deactivated lens coating {row.name!r}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
