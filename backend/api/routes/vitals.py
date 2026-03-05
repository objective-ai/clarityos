from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import AuditAction, Encounter, VitalsAndPretest
from backend.db.session import get_db
from backend.schemas.vitals import VitalsCreate, VitalsResponse

router = APIRouter()


@router.put("/{encounter_id}/vitals", response_model=VitalsResponse)
async def update_vitals(
    encounter_id: UUID,
    payload: VitalsCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.EDIT_VITALS)),
    db: AsyncSession = Depends(get_db),
):
    """Upsert vitals for a given encounter (idempotent PUT)."""
    # Verify encounter belongs to tenant
    enc = (
        await db.execute(
            select(Encounter).where(
                Encounter.id == encounter_id,
                Encounter.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")
    if enc.is_finalized:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Encounter is finalized")

    # Resolve staff identity for attribution
    staff = await resolve_staff(ctx, db)

    # Find or create vitals record
    vitals = (
        await db.execute(
            select(VitalsAndPretest).where(
                VitalsAndPretest.encounter_id == encounter_id,
                VitalsAndPretest.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not vitals:
        vitals = VitalsAndPretest(encounter_id=encounter_id, tenant_id=ctx.tenant_id)
        db.add(vitals)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(vitals, field, value)

    # Always update attribution to current user
    vitals.recorded_by_id = staff.id if staff else None

    await db.flush()
    await log_action(
        db, ctx, AuditAction.UPDATE, "vitals", vitals.id,
        staff_id=staff.id if staff else None,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        detail="Upserted vitals",
        ip_address=request.client.host if request.client else None,
    )
    await db.refresh(vitals)
    return vitals