"""
api/routes/optical.py

Optical handoff queue endpoints.

Provides:
  GET  /queue              — List finalized encounters ready for optical
  GET  /{encounter_id}/rx  — Full Rx data for PDF generation
  PATCH /{encounter_id}/status — Update optical workflow status

The optical queue surfaces finalized encounters that have a final Rx
(is_final_rx=True on at least one Refraction record).  Each item includes
Rx change detection by comparing today's final SE against the most recent
previous final Rx for the same patient.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.resolvers import resolve_encounter_id
from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import (
    AuditAction,
    Encounter,
    Patient,
    Refraction,
    RefractionType,
    Staff,
)
from backend.db.session import get_db
from backend.schemas.optical import (
    EyeRxSummary,
    OpticalQueueItem,
    OpticalQueueResponse,
    OpticalStatus,
    OpticalStatusUpdateRequest,
    OpticalStatusUpdateResponse,
    RxChangeAlert,
    RxPdfData,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compute_se(sphere: Decimal | None, cylinder: Decimal | None) -> Decimal | None:
    """Compute spherical equivalent: SE = sphere + (cylinder / 2)."""
    if sphere is None:
        return None
    cyl = cylinder if cylinder is not None else Decimal("0.00")
    return sphere + (cyl / 2)


def _build_eye_summary(rx: Refraction, eye: str) -> EyeRxSummary:
    """Build an EyeRxSummary from a Refraction ORM object for a given eye (od/os)."""
    return EyeRxSummary(
        sphere=getattr(rx, f"{eye}_sphere"),
        cylinder=getattr(rx, f"{eye}_cylinder"),
        axis=getattr(rx, f"{eye}_axis"),
        add=getattr(rx, f"{eye}_add"),
        prism=getattr(rx, f"{eye}_prism"),
        prism_base=getattr(rx, f"{eye}_prism_base"),
        visual_acuity=getattr(rx, f"{eye}_visual_acuity"),
    )


async def _get_previous_final_rx(
    db: AsyncSession,
    tenant_id: UUID,
    patient_id: UUID,
    current_encounter_id: UUID,
) -> Refraction | None:
    """Find the most recent previous final Rx for a patient (excluding current encounter)."""
    stmt = (
        select(Refraction)
        .join(Encounter, Refraction.encounter_id == Encounter.id)
        .where(
            Refraction.tenant_id == tenant_id,
            Encounter.patient_id == patient_id,
            Encounter.is_finalized == True,  # noqa: E712
            Encounter.is_deleted == False,  # noqa: E712
            Encounter.id != current_encounter_id,
            Refraction.is_final_rx == True,  # noqa: E712
        )
        .order_by(Encounter.encounter_date.desc(), Refraction.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _compute_rx_change_alert(
    current_rx: Refraction,
    previous_rx: Refraction | None,
) -> RxChangeAlert:
    """Compare current and previous final Rx spherical equivalents."""
    if previous_rx is None:
        return RxChangeAlert(has_change=False, message="No previous Rx for comparison")

    od_current_se = _compute_se(current_rx.od_sphere, current_rx.od_cylinder)
    od_previous_se = _compute_se(previous_rx.od_sphere, previous_rx.od_cylinder)
    os_current_se = _compute_se(current_rx.os_sphere, current_rx.os_cylinder)
    os_previous_se = _compute_se(previous_rx.os_sphere, previous_rx.os_cylinder)

    od_delta: Decimal | None = None
    os_delta: Decimal | None = None

    if od_current_se is not None and od_previous_se is not None:
        od_delta = abs(od_current_se - od_previous_se)
    if os_current_se is not None and os_previous_se is not None:
        os_delta = abs(os_current_se - os_previous_se)

    threshold = Decimal("0.50")
    od_changed = od_delta is not None and od_delta > threshold
    os_changed = os_delta is not None and os_delta > threshold
    has_change = od_changed or os_changed

    message = None
    if has_change:
        parts = []
        if od_changed:
            parts.append(f"OD: {od_delta:+.2f}D")
        if os_changed:
            parts.append(f"OS: {os_delta:+.2f}D")
        message = f"Rx Changed >0.50D ({', '.join(parts)})"

    return RxChangeAlert(
        has_change=has_change,
        od_previous_se=od_previous_se,
        od_current_se=od_current_se,
        od_delta=od_delta,
        os_previous_se=os_previous_se,
        os_current_se=os_current_se,
        os_delta=os_delta,
        message=message,
    )


# ---------------------------------------------------------------------------
# GET /queue — optical queue for a given date
# ---------------------------------------------------------------------------


@router.get("/queue", response_model=OpticalQueueResponse)
async def get_optical_queue(
    request: Request,
    queue_date: date = Query(None, description="Date filter (defaults to today)"),
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_OPTICAL)),
):
    """Return the optical queue — finalized encounters with final Rx for a given date."""
    target_date = queue_date or date.today()

    # Query finalized encounters for the target date with final Rx
    stmt = (
        select(Encounter)
        .where(
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_finalized == True,  # noqa: E712
            Encounter.is_deleted == False,  # noqa: E712
            Encounter.encounter_date == target_date,
        )
        .options(
            selectinload(Encounter.patient),
            selectinload(Encounter.refractions),
            selectinload(Encounter.provider),
            selectinload(Encounter.signed_by),
        )
        .order_by(Encounter.finalized_at.desc())
    )

    result = await db.execute(stmt)
    encounters = result.scalars().all()

    items: list[OpticalQueueItem] = []

    for enc in encounters:
        # Find the final Rx for this encounter
        final_rx = next(
            (rx for rx in enc.refractions if rx.is_final_rx),
            None,
        )
        if final_rx is None:
            continue  # No final Rx — not ready for optical

        # Get previous Rx for change detection
        previous_rx = await _get_previous_final_rx(
            db, ctx.tenant_id, enc.patient_id, enc.id
        )
        rx_change_alert = _compute_rx_change_alert(final_rx, previous_rx)

        # Determine provider info (signed_by takes precedence)
        provider = enc.signed_by or enc.provider
        patient = enc.patient

        items.append(
            OpticalQueueItem(
                encounter_id=enc.id,
                patient_id=patient.id,
                patient_first_name=patient.first_name,
                patient_last_name=patient.last_name,
                patient_dob=patient.dob,
                provider_id=provider.id,
                provider_name=provider.full_name,
                provider_license_number=provider.license_number,
                finalized_at=enc.finalized_at,
                encounter_date=enc.encounter_date,
                od=_build_eye_summary(final_rx, "od"),
                os=_build_eye_summary(final_rx, "os"),
                pd_distance=final_rx.pd_distance,
                pd_near=final_rx.pd_near,
                pd_od=final_rx.pd_od,
                pd_os=final_rx.pd_os,
                rx_change_alert=rx_change_alert,
                status=OpticalStatus.WAITING,
            )
        )

    # Audit log
    staff = await resolve_staff(ctx, db)
    await log_action(
        db, ctx, AuditAction.VIEW_OPTICAL_QUEUE, "optical_queue", ctx.tenant_id,
        staff_id=staff.id if staff else None,
        detail=f"Viewed optical queue for {target_date}",
        ip_address=request.client.host if request.client else None,
    )

    return OpticalQueueResponse(
        items=items,
        total=len(items),
        date=target_date,
    )


# ---------------------------------------------------------------------------
# GET /{encounter_id}/rx — Full Rx data for PDF generation
# ---------------------------------------------------------------------------


@router.get("/{encounter_id}/rx", response_model=RxPdfData)
async def get_rx_pdf_data(
    encounter_id: str,
    request: Request,
    expiration_months: int = Query(12, ge=6, le=24, description="Rx validity in months"),
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_OPTICAL)),
):
    """Return all data needed to render a printable Rx prescription."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    stmt = (
        select(Encounter)
        .where(
            Encounter.id == encounter_id,
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_finalized == True,  # noqa: E712
            Encounter.is_deleted == False,  # noqa: E712
        )
        .options(
            selectinload(Encounter.patient),
            selectinload(Encounter.refractions),
            selectinload(Encounter.provider),
            selectinload(Encounter.signed_by),
        )
    )
    enc = (await db.execute(stmt)).scalar_one_or_none()
    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Finalized encounter not found",
        )

    final_rx = next(
        (rx for rx in enc.refractions if rx.is_final_rx),
        None,
    )
    if not final_rx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No final Rx found for this encounter",
        )

    # Previous Rx for change detection
    previous_rx = await _get_previous_final_rx(
        db, ctx.tenant_id, enc.patient_id, enc.id
    )
    rx_change_alert = _compute_rx_change_alert(final_rx, previous_rx)

    provider = enc.signed_by or enc.provider
    patient = enc.patient

    # Calculate expiration date
    expiration_date = enc.encounter_date + timedelta(days=expiration_months * 30)

    # Audit log
    staff = await resolve_staff(ctx, db)
    await log_action(
        db, ctx, AuditAction.GENERATE_RX_PDF, "refraction", final_rx.id,
        staff_id=staff.id if staff else None,
        encounter_id=enc.id,
        patient_id=patient.id,
        detail=f"Generated Rx PDF for encounter {enc.id}",
        ip_address=request.client.host if request.client else None,
    )

    return RxPdfData(
        clinic_name="ClarityOS Clinic",  # TODO: from tenant settings
        clinic_address=None,
        clinic_phone=None,
        patient_first_name=patient.first_name,
        patient_last_name=patient.last_name,
        patient_dob=patient.dob,
        encounter_date=enc.encounter_date,
        encounter_id=enc.id,
        od=_build_eye_summary(final_rx, "od"),
        os=_build_eye_summary(final_rx, "os"),
        pd_distance=final_rx.pd_distance,
        pd_near=final_rx.pd_near,
        pd_od=final_rx.pd_od,
        pd_os=final_rx.pd_os,
        provider_name=provider.full_name,
        provider_license_number=provider.license_number,
        provider_npi=provider.npi_number,
        expiration_date=expiration_date,
        expiration_months=expiration_months,
        rx_change_alert=rx_change_alert,
    )


# ---------------------------------------------------------------------------
# PATCH /{encounter_id}/status — update optical workflow status
# ---------------------------------------------------------------------------


@router.patch("/{encounter_id}/status", response_model=OpticalStatusUpdateResponse)
async def update_optical_status(
    encounter_id: str,
    payload: OpticalStatusUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.UPDATE_OPTICAL_STATUS)),
):
    """Update the optical workflow status for an encounter."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    # Verify encounter exists and is finalized
    enc = (
        await db.execute(
            select(Encounter).where(
                Encounter.id == encounter_id,
                Encounter.tenant_id == ctx.tenant_id,
                Encounter.is_finalized == True,  # noqa: E712
                Encounter.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Finalized encounter not found",
        )

    # Audit log the status change
    staff = await resolve_staff(ctx, db)
    await log_action(
        db, ctx, AuditAction.UPDATE_OPTICAL_STATUS, "encounter", enc.id,
        staff_id=staff.id if staff else None,
        encounter_id=enc.id,
        patient_id=enc.patient_id,
        detail=f"Updated optical status to {payload.status.value}",
        ip_address=request.client.host if request.client else None,
    )

    return OpticalStatusUpdateResponse(
        encounter_id=enc.id,
        status=payload.status,
        updated_at=datetime.now(timezone.utc),
    )
