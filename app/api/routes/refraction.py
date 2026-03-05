from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.permissions import ClinicalAction, require_permission
from app.core.security import TenantContext, resolve_staff
from app.db.models.tenant.clinical import AuditAction, Encounter, Refraction, RefractionType
from app.db.session import get_db
from app.schemas.refraction import RefractionUpdateRequest, RefractionResponse

router = APIRouter()

COLUMN_MAP = {
    0: RefractionType.HABITUAL,
    1: RefractionType.AUTO,
    2: RefractionType.MANIFEST,
    3: RefractionType.FINAL,
}


@router.patch("/{encounter_id}/column/{col_index}", response_model=RefractionResponse)
async def sync_refraction(
    encounter_id: UUID,
    col_index: int,
    payload: RefractionUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.EDIT_REFRACTION)),
    db: AsyncSession = Depends(get_db),
):
    """Upsert a refraction column for a given encounter."""
    rx_type = COLUMN_MAP.get(col_index)
    if rx_type is None:
        raise HTTPException(status_code=400, detail=f"Invalid column index: {col_index}")

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

    # Find or create refraction
    rx = (
        await db.execute(
            select(Refraction).where(
                Refraction.encounter_id == encounter_id,
                Refraction.tenant_id == ctx.tenant_id,
                Refraction.refraction_type == rx_type,
            )
        )
    ).scalar_one_or_none()

    if not rx:
        rx = Refraction(
            encounter_id=encounter_id,
            tenant_id=ctx.tenant_id,
            refraction_type=rx_type,
            recorded_by_id=staff.id if staff else None,
        )
        db.add(rx)

    if payload.od:
        rx.od_sphere = payload.od.sphere
        rx.od_cylinder = payload.od.cylinder
        rx.od_axis = payload.od.axis
    if payload.os:
        rx.os_sphere = payload.os.sphere
        rx.os_cylinder = payload.os.cylinder
        rx.os_axis = payload.os.axis

    await db.flush()
    await log_action(
        db, ctx, AuditAction.UPDATE, "refraction", rx.id,
        staff_id=staff.id if staff else None,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        detail=f"Upserted {rx_type.value} refraction",
        ip_address=request.client.host if request.client else None,
    )
    await db.refresh(rx)
    return RefractionResponse.from_orm_model(rx)