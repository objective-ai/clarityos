"""
api/routes/patient_insurance.py

Patient insurance CRUD + patient superbill summary.
Registered at /api/patients in main.py (alongside patient.router).
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.resolvers import resolve_patient_id
from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import (
    AuditAction,
    ClaimStatus,
    Encounter,
    InsurancePayer,
    Patient,
    PatientInsurance,
    Superbill,
    SuperbillLineItem,
)
from backend.db.session import get_db
from backend.schemas.billing import (
    PatientInsuranceCreate,
    PatientInsuranceResponse,
    PatientInsuranceUpdate,
    PatientSuperbillSummary,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _insurance_response(ins: PatientInsurance) -> PatientInsuranceResponse:
    return PatientInsuranceResponse(
        id=ins.id,
        patient_id=ins.patient_id,
        payer_id=ins.payer_id,
        payer_name=ins.payer.name if ins.payer else "Unknown",
        priority=ins.priority,
        plan_type=ins.plan_type,
        subscriber_id=ins.subscriber_id,
        group_number=ins.group_number,
        plan_name=ins.plan_name,
        relationship_to_subscriber=ins.relationship_to_subscriber,
        subscriber_name=ins.subscriber_name,
        subscriber_dob=str(ins.subscriber_dob) if ins.subscriber_dob else None,
    )


async def _get_patient_or_404(
    patient_id: UUID, tenant_id: UUID, db: AsyncSession
) -> Patient:
    """Fetch a patient or raise 404."""
    patient = (
        await db.execute(
            select(Patient).where(
                Patient.id == patient_id,
                Patient.tenant_id == tenant_id,
                Patient.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


# ---------------------------------------------------------------------------
# GET /{patient_id}/insurance — list insurance records
# ---------------------------------------------------------------------------


@router.get(
    "/{patient_id}/insurance",
    response_model=list[PatientInsuranceResponse],
)
async def list_patient_insurance(
    patient_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """List insurance records for a patient."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    result = await db.execute(
        select(PatientInsurance)
        .where(
            PatientInsurance.patient_id == patient_id,
            PatientInsurance.tenant_id == ctx.tenant_id,
        )
        .options(selectinload(PatientInsurance.payer))
        .order_by(PatientInsurance.priority)
    )
    return [_insurance_response(ins) for ins in result.scalars().all()]


# ---------------------------------------------------------------------------
# POST /{patient_id}/insurance — create insurance record
# ---------------------------------------------------------------------------


@router.post(
    "/{patient_id}/insurance",
    response_model=PatientInsuranceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_patient_insurance(
    patient_id: str,
    payload: PatientInsuranceCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new insurance record for a patient."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    staff = await resolve_staff(ctx, db)
    await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    # Verify payer exists
    payer = (
        await db.execute(
            select(InsurancePayer).where(
                InsurancePayer.id == payload.payer_id,
                InsurancePayer.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not payer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payer not found")

    # Enforce uniqueness: patient + priority
    existing = (
        await db.execute(
            select(PatientInsurance).where(
                PatientInsurance.patient_id == patient_id,
                PatientInsurance.priority == payload.priority,
                PatientInsurance.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Patient already has a {payload.priority} insurance on file. "
            "Update or delete the existing one first.",
        )

    # Parse subscriber_dob if provided
    sub_dob = None
    if payload.subscriber_dob:
        try:
            sub_dob = date.fromisoformat(payload.subscriber_dob)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="subscriber_dob must be ISO date format (YYYY-MM-DD)",
            )

    ins = PatientInsurance(
        tenant_id=ctx.tenant_id,
        patient_id=patient_id,
        payer_id=payload.payer_id,
        priority=payload.priority,
        plan_type=payload.plan_type,
        subscriber_id=payload.subscriber_id,
        group_number=payload.group_number,
        plan_name=payload.plan_name,
        relationship_to_subscriber=payload.relationship_to_subscriber,
        subscriber_name=payload.subscriber_name,
        subscriber_dob=sub_dob,
    )
    db.add(ins)
    await db.flush()

    await log_action(
        db, ctx, AuditAction.CREATE, "patient_insurance", ins.id,
        staff_id=staff.id if staff else None,
        patient_id=patient_id,
        detail=f"Created {payload.priority} insurance: {payer.name}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    # Re-fetch with payer loaded
    ins = (
        await db.execute(
            select(PatientInsurance)
            .where(PatientInsurance.id == ins.id)
            .options(selectinload(PatientInsurance.payer))
        )
    ).scalar_one()

    return _insurance_response(ins)


# ---------------------------------------------------------------------------
# PATCH /{patient_id}/insurance/{insurance_id} — update
# ---------------------------------------------------------------------------


@router.patch(
    "/{patient_id}/insurance/{insurance_id}",
    response_model=PatientInsuranceResponse,
)
async def update_patient_insurance(
    patient_id: str,
    insurance_id: UUID,
    payload: PatientInsuranceUpdate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Update a patient insurance record."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    staff = await resolve_staff(ctx, db)

    ins = (
        await db.execute(
            select(PatientInsurance)
            .where(
                PatientInsurance.id == insurance_id,
                PatientInsurance.patient_id == patient_id,
                PatientInsurance.tenant_id == ctx.tenant_id,
            )
            .options(selectinload(PatientInsurance.payer))
        )
    ).scalar_one_or_none()

    if not ins:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Insurance record not found")

    updates = payload.model_dump(exclude_unset=True)
    changes: dict = {}

    # Handle subscriber_dob conversion
    if "subscriber_dob" in updates and updates["subscriber_dob"] is not None:
        try:
            updates["subscriber_dob"] = date.fromisoformat(updates["subscriber_dob"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="subscriber_dob must be ISO date format (YYYY-MM-DD)",
            )

    for field, new_val in updates.items():
        old_val = getattr(ins, field)
        if old_val != new_val:
            changes[field] = {"old": str(old_val), "new": str(new_val)}
            setattr(ins, field, new_val)

    if changes:
        await log_action(
            db, ctx, AuditAction.UPDATE, "patient_insurance", ins.id,
            staff_id=staff.id if staff else None,
            patient_id=patient_id,
            detail=f"Updated insurance: {', '.join(changes.keys())}",
            changes=changes,
            ip_address=request.client.host if request.client else None,
        )

    await db.commit()

    # Re-fetch with payer loaded
    ins = (
        await db.execute(
            select(PatientInsurance)
            .where(PatientInsurance.id == ins.id)
            .options(selectinload(PatientInsurance.payer))
        )
    ).scalar_one()

    return _insurance_response(ins)


# ---------------------------------------------------------------------------
# DELETE /{patient_id}/insurance/{insurance_id} — hard delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{patient_id}/insurance/{insurance_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_patient_insurance(
    patient_id: str,
    insurance_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Delete a patient insurance record."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    staff = await resolve_staff(ctx, db)

    ins = (
        await db.execute(
            select(PatientInsurance)
            .where(
                PatientInsurance.id == insurance_id,
                PatientInsurance.patient_id == patient_id,
                PatientInsurance.tenant_id == ctx.tenant_id,
            )
            .options(selectinload(PatientInsurance.payer))
        )
    ).scalar_one_or_none()

    if not ins:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Insurance record not found")

    payer_name = ins.payer.name if ins.payer else "Unknown"
    priority = ins.priority

    await log_action(
        db, ctx, AuditAction.DELETE, "patient_insurance", ins.id,
        staff_id=staff.id if staff else None,
        patient_id=patient_id,
        detail=f"Deleted {priority} insurance: {payer_name}",
        ip_address=request.client.host if request.client else None,
    )

    await db.delete(ins)
    await db.commit()


# ---------------------------------------------------------------------------
# GET /{patient_id}/superbills — patient superbill summary list
# ---------------------------------------------------------------------------


@router.get(
    "/{patient_id}/superbills",
    response_model=list[PatientSuperbillSummary],
)
async def list_patient_superbills(
    patient_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """List all superbills for a patient — powers the patient Billing tab."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    result = await db.execute(
        select(Superbill)
        .where(
            Superbill.patient_id == patient_id,
            Superbill.tenant_id == ctx.tenant_id,
        )
        .options(
            selectinload(Superbill.line_items),
            selectinload(Superbill.encounter),
        )
        .order_by(Superbill.created_at.desc())
    )
    superbills = result.scalars().all()

    summaries = []
    for sb in superbills:
        active_items = [li for li in (sb.line_items or []) if not li.is_deleted]
        cpt_codes = [li.cpt_code for li in active_items]
        enc_date = str(sb.encounter.encounter_date) if sb.encounter else ""

        summaries.append(PatientSuperbillSummary(
            id=sb.id,
            encounter_id=sb.encounter_id,
            encounter_date=enc_date,
            claim_status=sb.claim_status.value if isinstance(sb.claim_status, ClaimStatus) else sb.claim_status,
            total_fee=float(sb.total_fee),
            mdm_level=sb.mdm_level,
            suggested_em_code=sb.suggested_em_code,
            cpt_codes=cpt_codes,
        ))

    return summaries
