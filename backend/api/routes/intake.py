"""
api/routes/intake.py

Public (unauthenticated) intake endpoints + staff-facing token generation.

Public routes:
  GET  /api/public/intake/{token}/            — validate token, return minimal info
  POST /api/public/intake/{token}/verify-dob/ — DOB verification gate
  POST /api/public/intake/{token}/            — submit intake form

Staff routes (authenticated, mounted under /api/appointments):
  POST /api/appointments/{appointment_id}/generate-intake-token/ — generate token
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.audit import log_action
from backend.core.intake_auth import MAX_DOB_ATTEMPTS, IntakeContext, get_intake_context
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.core.triage import triage_chief_complaint
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import (
    Appointment,
    AppointmentStatus,
    AuditAction,
    Patient,
)
from backend.db.models.tenant.intake import IntakeStatus, IntakeToken
from backend.db.session import get_db
from backend.schemas.intake import (
    DobVerifyRequest,
    DobVerifyResponse,
    IntakeFormSubmission,
    IntakeSubmissionResponse,
    IntakeTokenResponse,
    IntakeValidationResponse,
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

public_router = APIRouter()
staff_router = APIRouter()

INTAKE_TOKEN_TTL_HOURS = 72


# ---------------------------------------------------------------------------
# Public: GET /api/public/intake/{token}/ — validate token, minimal info
# ---------------------------------------------------------------------------


@public_router.get("/{token}/", response_model=IntakeValidationResponse)
async def validate_intake_token(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Validate token and return minimal non-PHI info (clinic name, date, type)."""
    ictx = await get_intake_context(token, db)
    appt = ictx.token_record.appointment

    # Fetch clinic name from public.tenants
    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == ictx.tenant_id))
    ).scalar_one_or_none()
    clinic_name = tenant.name if tenant else "Your Clinic"

    return IntakeValidationResponse(
        clinic_name=clinic_name,
        appointment_date=appt.start_time.strftime("%B %d, %Y at %I:%M %p"),
        appointment_type=appt.appointment_type.value if hasattr(appt.appointment_type, "value") else str(appt.appointment_type),
        requires_dob_verification=not ictx.token_record.dob_verified,
    )


# ---------------------------------------------------------------------------
# Public: POST /api/public/intake/{token}/verify-dob/ — DOB gate
# ---------------------------------------------------------------------------


@public_router.post("/{token}/verify-dob/", response_model=DobVerifyResponse)
async def verify_dob(
    token: str,
    payload: DobVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify patient DOB to unlock the intake form. Max 3 attempts."""
    ictx = await get_intake_context(token, db)
    intake_token = ictx.token_record
    appt = intake_token.appointment

    # Already verified — return patient info
    if intake_token.dob_verified:
        patient = (
            await db.execute(
                select(Patient).where(Patient.id == appt.patient_id, Patient.tenant_id == ictx.tenant_id)
            )
        ).scalar_one_or_none()
        return _build_dob_success(patient)

    # Fetch patient to compare DOB
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == appt.patient_id, Patient.tenant_id == ictx.tenant_id)
        )
    ).scalar_one_or_none()

    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Patient record not found. Please contact your clinic.",
        )

    # Compare DOB
    if str(patient.dob) == str(payload.dob):
        intake_token.dob_verified = True
        await db.flush()
        return _build_dob_success(patient)

    # Failed attempt
    intake_token.dob_attempts += 1
    remaining = MAX_DOB_ATTEMPTS - intake_token.dob_attempts
    await db.flush()

    if remaining <= 0:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Too many failed verification attempts. Please contact your clinic.",
        )

    return DobVerifyResponse(
        verified=False,
        remaining_attempts=remaining,
    )


def _build_dob_success(patient: Patient) -> DobVerifyResponse:
    contact = patient.contact_info_jsonb or {}
    return DobVerifyResponse(
        verified=True,
        patient_first_name=patient.first_name,
        patient_last_name=patient.last_name,
        patient_dob=patient.dob,
        patient_sex=patient.sex.value if hasattr(patient.sex, "value") else str(patient.sex),
        phone=contact.get("phone"),
        email=contact.get("email"),
    )


# ---------------------------------------------------------------------------
# Public: POST /api/public/intake/{token}/ — submit form
# ---------------------------------------------------------------------------


@public_router.post("/{token}/", response_model=IntakeSubmissionResponse)
async def submit_intake_form(
    token: str,
    payload: IntakeFormSubmission,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Submit intake form (only allowed after DOB verified)."""
    ictx = await get_intake_context(token, db)
    intake_token = ictx.token_record

    if not intake_token.dob_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Date of birth verification required before submitting.",
        )

    # --- Validate required consents ---
    if not payload.consent_treat_bill or not payload.consent_privacy_notice:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Consent to treatment/billing and privacy notice acknowledgment are required.",
        )

    appt = intake_token.appointment

    # --- Update Patient record ---
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == appt.patient_id, Patient.tenant_id == ictx.tenant_id)
        )
    ).scalar_one_or_none()

    if patient:
        patient.first_name = payload.first_name
        patient.last_name = payload.last_name
        patient.preferred_name = payload.preferred_name
        patient.sex = payload.sex

        # Update contact info
        contact = patient.contact_info_jsonb or {}
        if payload.phone:
            contact["phone"] = payload.phone
        if payload.email:
            contact["email"] = payload.email
        if payload.address_line1:
            contact["address_line1"] = payload.address_line1
            contact["address_line2"] = payload.address_line2
            contact["city"] = payload.city
            contact["state"] = payload.state
            contact["zip_code"] = payload.zip_code
        if payload.emergency_contact_name:
            contact["emergency_contact_name"] = payload.emergency_contact_name
            contact["emergency_contact_phone"] = payload.emergency_contact_phone
            contact["emergency_contact_relation"] = payload.emergency_contact_relation
        if payload.insurance_provider:
            contact["insurance_provider"] = payload.insurance_provider
            contact["insurance_member_id"] = payload.insurance_member_id
            contact["insurance_group"] = payload.insurance_group
        patient.contact_info_jsonb = contact

        # Medical history
        if payload.medical_history:
            patient.medical_history_jsonb = payload.medical_history.model_dump()

        # --- Store consent audit trail ---
        now_iso = datetime.now(timezone.utc).isoformat()
        ip_address = request.client.host if request.client else None
        patient.privacy_flags_jsonb = {
            **(patient.privacy_flags_jsonb or {}),
            "consent_treat_bill": True,
            "consent_treat_bill_at": now_iso,
            "consent_privacy_notice": True,
            "consent_privacy_notice_at": now_iso,
            "consent_digital_comm": payload.consent_digital_comm,
            "consent_digital_comm_at": now_iso if payload.consent_digital_comm else None,
            "consent_ip": ip_address,
        }

    # --- Update Appointment ---
    appt.chief_complaint = payload.chief_complaint

    # --- AI Triage ---
    ros_dict = payload.review_of_systems.model_dump() if payload.review_of_systems else None
    triage_result = await triage_chief_complaint(payload.chief_complaint, ros_dict)

    # --- Store on IntakeToken ---
    intake_token.intake_data_jsonb = payload.model_dump(mode="json")
    intake_token.triage_flags_jsonb = triage_result
    intake_token.status = IntakeStatus.SUBMITTED.value
    intake_token.submitted_at = datetime.now(timezone.utc)
    intake_token.ip_address = request.client.host if request.client else None

    # --- Update Appointment intake fields ---
    appt.intake_status = "submitted"
    appt.triage_flags_jsonb = triage_result

    await db.flush()

    return IntakeSubmissionResponse(
        success=True,
        message="Your information has been received. Thank you!",
        appointment_date=appt.start_time.strftime("%B %d, %Y at %I:%M %p"),
    )


# ---------------------------------------------------------------------------
# Staff: POST /{appointment_id}/generate-intake-token/ — authenticated
# ---------------------------------------------------------------------------


@staff_router.post(
    "/{appointment_id}/generate-intake-token/",
    response_model=IntakeTokenResponse,
)
async def generate_intake_token(
    appointment_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_APPOINTMENT)),
    db: AsyncSession = Depends(get_db),
):
    """Generate an intake token for an appointment (staff only)."""
    staff = await resolve_staff(ctx, db)

    # Fetch appointment
    appt = (
        await db.execute(
            select(Appointment)
            .where(
                Appointment.id == appointment_id,
                Appointment.tenant_id == ctx.tenant_id,
            )
            .options(selectinload(Appointment.intake_token))
        )
    ).scalar_one_or_none()

    if appt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found.",
        )

    if appt.status not in (
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CONFIRMED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Intake tokens can only be generated for scheduled or confirmed appointments.",
        )

    # Revoke existing token if any
    if appt.intake_token and appt.intake_token.status == IntakeStatus.PENDING.value:
        appt.intake_token.status = IntakeStatus.REVOKED.value

    # Generate new token
    token_str = secrets.token_hex(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=INTAKE_TOKEN_TTL_HOURS)

    new_token = IntakeToken(
        tenant_id=ctx.tenant_id,
        appointment_id=appointment_id,
        token=token_str,
        status=IntakeStatus.PENDING.value,
        expires_at=expires,
    )
    db.add(new_token)

    # Update appointment intake status
    appt.intake_status = "pending"

    await db.flush()

    # Audit log
    await log_action(
        db,
        ctx,
        AuditAction.GENERATE_INTAKE_TOKEN,
        resource_type="intake_token",
        resource_id=new_token.id,
        staff_id=staff.id if staff else None,
        patient_id=appt.patient_id,
        detail=f"Generated intake token for appointment {appointment_id}",
        ip_address=request.client.host if request.client else None,
    )

    # Build URL — frontend will serve /intake/{token}
    base_url = str(request.base_url).rstrip("/")
    intake_url = f"{base_url.replace(':8000', ':3000')}/intake/{token_str}"

    return IntakeTokenResponse(
        token=token_str,
        url=intake_url,
        expires_at=expires,
    )
