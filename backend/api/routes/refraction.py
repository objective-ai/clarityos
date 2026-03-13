from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.resolvers import resolve_encounter_id
from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import AuditAction, Encounter, Refraction, RefractionType
from backend.db.session import get_db
from backend.schemas.refraction import RefractionUpdateRequest, RefractionResponse

router = APIRouter()

COLUMN_MAP = {
    0: RefractionType.HABITUAL,
    1: RefractionType.AUTO,
    2: RefractionType.MANIFEST,
    3: RefractionType.FINAL,
}


@router.patch("/{encounter_id}/column/{col_index}", response_model=RefractionResponse)
async def sync_refraction(
    encounter_id: str,
    col_index: int,
    payload: RefractionUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.EDIT_REFRACTION)),
    db: AsyncSession = Depends(get_db),
):
    """Upsert a refraction column for a given encounter."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
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

    # Update OD fields
    if payload.od:
        rx.od_sphere = payload.od.sphere
        rx.od_cylinder = payload.od.cylinder
        rx.od_axis = payload.od.axis
        rx.od_add = payload.od.add
        rx.od_prism = payload.od.prism
        rx.od_prism_base = payload.od.prism_base
        rx.od_visual_acuity = payload.od.visual_acuity

    # Update OS fields
    if payload.os:
        rx.os_sphere = payload.os.sphere
        rx.os_cylinder = payload.os.cylinder
        rx.os_axis = payload.os.axis
        rx.os_add = payload.os.add
        rx.os_prism = payload.os.prism
        rx.os_prism_base = payload.os.prism_base
        rx.os_visual_acuity = payload.os.visual_acuity

    # Update PD fields
    if payload.pd_distance is not None:
        rx.pd_distance = payload.pd_distance
    if payload.pd_near is not None:
        rx.pd_near = payload.pd_near
    if payload.pd_od is not None:
        rx.pd_od = payload.pd_od
    if payload.pd_os is not None:
        rx.pd_os = payload.pd_os

    # Update other fields
    if payload.is_final_rx is not None:
        rx.is_final_rx = payload.is_final_rx
    if payload.notes is not None:
        rx.notes = payload.notes

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