"""
api/routes/payer.py

Insurance payer CRUD + fee schedule management (9 endpoints).
Registered at /api/payers in main.py.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import (
    AuditAction,
    FeeScheduleItem,
    InsurancePayer,
    PatientInsurance,
)
from backend.db.session import get_db
from backend.schemas.billing import (
    FeeScheduleItemResponse,
    FeeScheduleItemUpdate,
    PayerCreate,
    PayerResponse,
    PayerUpdate,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _payer_response(p: InsurancePayer) -> PayerResponse:
    return PayerResponse(
        id=p.id,
        name=p.name,
        payer_id=p.payer_id,
        phone=p.phone,
        address=p.address,
        is_active=p.is_active,
    )


def _fee_item_response(fi: FeeScheduleItem) -> FeeScheduleItemResponse:
    return FeeScheduleItemResponse(
        id=fi.id,
        payer_id=fi.payer_id,
        cpt_code=fi.cpt_code,
        description=fi.description,
        fee=float(fi.fee),
    )


# ---------------------------------------------------------------------------
# GET /fee-catalog — base fee rows (payer_id IS NULL)
# IMPORTANT: registered BEFORE /{payer_id} to avoid shadowing
# ---------------------------------------------------------------------------


@router.get("/fee-catalog", response_model=list[FeeScheduleItemResponse])
async def list_base_fee_catalog(
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Return all base fee catalog entries (payer_id IS NULL) for the tenant."""
    result = await db.execute(
        select(FeeScheduleItem)
        .where(
            FeeScheduleItem.tenant_id == ctx.tenant_id,
            FeeScheduleItem.payer_id == None,  # noqa: E711
        )
        .order_by(FeeScheduleItem.cpt_code)
    )
    return [_fee_item_response(fi) for fi in result.scalars().all()]


# ---------------------------------------------------------------------------
# PUT /fee-catalog — bulk update base fee rows
# ---------------------------------------------------------------------------


@router.put("/fee-catalog", response_model=list[FeeScheduleItemResponse])
async def update_base_fee_catalog(
    items: list[FeeScheduleItemUpdate],
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Bulk upsert base fee catalog entries (payer_id IS NULL)."""
    staff = await resolve_staff(ctx, db)
    results = []

    for item in items:
        existing = (
            await db.execute(
                select(FeeScheduleItem).where(
                    FeeScheduleItem.tenant_id == ctx.tenant_id,
                    FeeScheduleItem.payer_id == None,  # noqa: E711
                    FeeScheduleItem.cpt_code == item.cpt_code,
                )
            )
        ).scalar_one_or_none()

        if existing:
            existing.fee = item.fee
            if item.description:
                existing.description = item.description
            results.append(existing)
        else:
            new_fi = FeeScheduleItem(
                tenant_id=ctx.tenant_id,
                payer_id=None,
                cpt_code=item.cpt_code,
                description=item.description or item.cpt_code,
                fee=item.fee,
            )
            db.add(new_fi)
            results.append(new_fi)

    await db.flush()

    await log_action(
        db, ctx, AuditAction.UPDATE_SUPERBILL, "fee_schedule", ctx.tenant_id,
        staff_id=staff.id if staff else None,
        detail=f"Updated base fee catalog: {len(items)} items",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    # Re-fetch to get generated IDs
    result = await db.execute(
        select(FeeScheduleItem)
        .where(
            FeeScheduleItem.tenant_id == ctx.tenant_id,
            FeeScheduleItem.payer_id == None,  # noqa: E711
        )
        .order_by(FeeScheduleItem.cpt_code)
    )
    return [_fee_item_response(fi) for fi in result.scalars().all()]


# ---------------------------------------------------------------------------
# GET / — list payers
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[PayerResponse])
async def list_payers(
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """List all insurance payers for the tenant."""
    result = await db.execute(
        select(InsurancePayer)
        .where(InsurancePayer.tenant_id == ctx.tenant_id)
        .order_by(InsurancePayer.name)
    )
    return [_payer_response(p) for p in result.scalars().all()]


# ---------------------------------------------------------------------------
# POST / — create payer
# ---------------------------------------------------------------------------


@router.post("/", response_model=PayerResponse, status_code=status.HTTP_201_CREATED)
async def create_payer(
    payload: PayerCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new insurance payer."""
    staff = await resolve_staff(ctx, db)

    payer = InsurancePayer(
        tenant_id=ctx.tenant_id,
        name=payload.name,
        payer_id=payload.payer_id,
        phone=payload.phone,
        address=payload.address,
        is_active=payload.is_active,
    )
    db.add(payer)
    await db.flush()

    await log_action(
        db, ctx, AuditAction.CREATE, "insurance_payer", payer.id,
        staff_id=staff.id if staff else None,
        detail=f"Created payer: {payer.name}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    # Re-fetch after commit
    payer = (
        await db.execute(
            select(InsurancePayer).where(InsurancePayer.id == payer.id)
        )
    ).scalar_one()

    return _payer_response(payer)


# ---------------------------------------------------------------------------
# GET /{payer_id} — get single payer
# ---------------------------------------------------------------------------


@router.get("/{payer_id}", response_model=PayerResponse)
async def get_payer(
    payer_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Get a single payer by ID."""
    payer = (
        await db.execute(
            select(InsurancePayer).where(
                InsurancePayer.id == payer_id,
                InsurancePayer.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not payer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payer not found")

    return _payer_response(payer)


# ---------------------------------------------------------------------------
# PATCH /{payer_id} — update payer
# ---------------------------------------------------------------------------


@router.patch("/{payer_id}", response_model=PayerResponse)
async def update_payer(
    payer_id: UUID,
    payload: PayerUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Update payer fields."""
    staff = await resolve_staff(ctx, db)

    payer = (
        await db.execute(
            select(InsurancePayer).where(
                InsurancePayer.id == payer_id,
                InsurancePayer.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not payer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payer not found")

    updates = payload.model_dump(exclude_unset=True)
    changes: dict = {}
    for field, new_val in updates.items():
        old_val = getattr(payer, field)
        if old_val != new_val:
            changes[field] = {"old": str(old_val), "new": str(new_val)}
            setattr(payer, field, new_val)

    if changes:
        await log_action(
            db, ctx, AuditAction.UPDATE, "insurance_payer", payer.id,
            staff_id=staff.id if staff else None,
            detail=f"Updated payer: {', '.join(changes.keys())}",
            changes=changes,
            ip_address=request.client.host if request.client else None,
        )

    await db.commit()

    payer = (
        await db.execute(
            select(InsurancePayer).where(InsurancePayer.id == payer.id)
        )
    ).scalar_one()

    return _payer_response(payer)


# ---------------------------------------------------------------------------
# DELETE /{payer_id} — soft-delete (set is_active=False)
# ---------------------------------------------------------------------------


@router.delete("/{payer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payer(
    payer_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a payer (set is_active=False). Returns 409 if patients reference it."""
    staff = await resolve_staff(ctx, db)

    payer = (
        await db.execute(
            select(InsurancePayer).where(
                InsurancePayer.id == payer_id,
                InsurancePayer.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not payer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payer not found")

    # Check if any PatientInsurance references this payer
    ref_count = (
        await db.execute(
            select(PatientInsurance.id).where(
                PatientInsurance.payer_id == payer_id,
                PatientInsurance.tenant_id == ctx.tenant_id,
            ).limit(1)
        )
    ).scalar_one_or_none()

    if ref_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot deactivate payer: patients have active insurance referencing this payer.",
        )

    payer.is_active = False

    await log_action(
        db, ctx, AuditAction.DELETE, "insurance_payer", payer.id,
        staff_id=staff.id if staff else None,
        detail=f"Deactivated payer: {payer.name}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()


# ---------------------------------------------------------------------------
# GET /{payer_id}/fee-schedule — payer fee overrides
# ---------------------------------------------------------------------------


@router.get("/{payer_id}/fee-schedule", response_model=list[FeeScheduleItemResponse])
async def get_payer_fee_schedule(
    payer_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Return fee schedule overrides for a specific payer."""
    result = await db.execute(
        select(FeeScheduleItem)
        .where(
            FeeScheduleItem.tenant_id == ctx.tenant_id,
            FeeScheduleItem.payer_id == payer_id,
        )
        .order_by(FeeScheduleItem.cpt_code)
    )
    return [_fee_item_response(fi) for fi in result.scalars().all()]


# ---------------------------------------------------------------------------
# PUT /{payer_id}/fee-schedule — bulk replace payer fee overrides
# ---------------------------------------------------------------------------


@router.put("/{payer_id}/fee-schedule", response_model=list[FeeScheduleItemResponse])
async def update_payer_fee_schedule(
    payer_id: UUID,
    items: list[FeeScheduleItemUpdate],
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Bulk replace payer fee overrides: delete existing rows, insert new list."""
    staff = await resolve_staff(ctx, db)

    # Verify payer exists
    payer = (
        await db.execute(
            select(InsurancePayer).where(
                InsurancePayer.id == payer_id,
                InsurancePayer.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not payer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payer not found")

    # Delete existing overrides for this payer
    await db.execute(
        delete(FeeScheduleItem).where(
            FeeScheduleItem.tenant_id == ctx.tenant_id,
            FeeScheduleItem.payer_id == payer_id,
        )
    )

    # Insert new overrides
    new_items = []
    for item in items:
        fi = FeeScheduleItem(
            tenant_id=ctx.tenant_id,
            payer_id=payer_id,
            cpt_code=item.cpt_code,
            description=item.description or item.cpt_code,
            fee=item.fee,
        )
        db.add(fi)
        new_items.append(fi)

    await db.flush()

    await log_action(
        db, ctx, AuditAction.UPDATE, "fee_schedule", payer.id,
        staff_id=staff.id if staff else None,
        detail=f"Updated payer fee schedule for {payer.name}: {len(items)} items",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    # Re-fetch
    result = await db.execute(
        select(FeeScheduleItem)
        .where(
            FeeScheduleItem.tenant_id == ctx.tenant_id,
            FeeScheduleItem.payer_id == payer_id,
        )
        .order_by(FeeScheduleItem.cpt_code)
    )
    return [_fee_item_response(fi) for fi in result.scalars().all()]
