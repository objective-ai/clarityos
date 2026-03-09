"""
schemas/intake.py

Pydantic request/response schemas for Patient Intake (Phase 7).
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import Field

from backend.schemas.common import AppBaseModel, CamelCaseModel


# ---------------------------------------------------------------------------
# Token generation (staff-facing, authenticated)
# ---------------------------------------------------------------------------


class IntakeTokenResponse(AppBaseModel):
    """Returned when staff generates an intake token."""

    token: str
    url: str
    expires_at: datetime


# ---------------------------------------------------------------------------
# Token validation (public, no auth)
# ---------------------------------------------------------------------------


class IntakeValidationResponse(CamelCaseModel):
    """Returned on GET /api/public/intake/{token}/ — minimal info, no PHI."""

    clinic_name: str
    appointment_date: str
    appointment_type: str
    requires_dob_verification: bool = True


# ---------------------------------------------------------------------------
# DOB verification gate (public, no auth)
# ---------------------------------------------------------------------------


class DobVerifyRequest(AppBaseModel):
    """Patient submits their DOB to unlock the intake form."""

    dob: date


class DobVerifyResponse(CamelCaseModel):
    """Returned after successful DOB verification — includes patient info."""

    verified: bool
    patient_first_name: str | None = None
    patient_last_name: str | None = None
    patient_dob: date | None = None
    patient_sex: str | None = None
    # Pre-filled contact info (if exists)
    phone: str | None = None
    email: str | None = None
    remaining_attempts: int | None = None  # only set on failure


# ---------------------------------------------------------------------------
# Intake form submission (public, after DOB verified)
# ---------------------------------------------------------------------------


class MedicalHistoryData(AppBaseModel):
    """Structured medical history from intake form."""

    # Ocular history (checkbox booleans)
    glaucoma: bool = False
    cataracts: bool = False
    macular_degeneration: bool = False
    retinal_detachment: bool = False
    lazy_eye: bool = False
    eye_surgery: bool = False
    eye_injury: bool = False
    # Systemic conditions
    diabetes: bool = False
    hypertension: bool = False
    autoimmune: bool = False
    thyroid: bool = False
    heart_disease: bool = False
    # Free text
    current_medications: str | None = Field(default=None, max_length=2000)
    allergies: str | None = Field(default=None, max_length=1000)
    family_ocular_history: str | None = Field(default=None, max_length=1000)
    other_conditions: str | None = Field(default=None, max_length=2000)


class ReviewOfSystemsData(AppBaseModel):
    """Optometric review of systems checkboxes."""

    # Vision
    blurry_vision: bool = False
    double_vision: bool = False
    flashing_lights: bool = False
    floaters: bool = False
    loss_of_vision: bool = False
    # Eye comfort
    eye_pain: bool = False
    eye_redness: bool = False
    eye_discharge: bool = False
    eye_itching: bool = False
    dry_eyes: bool = False
    tearing: bool = False
    light_sensitivity: bool = False
    # General
    headaches: bool = False
    dizziness: bool = False


class IntakeFormSubmission(AppBaseModel):
    """Full intake form payload submitted by patient."""

    # Demographics (may update existing patient record)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    preferred_name: str | None = Field(default=None, max_length=100)
    dob: date
    sex: str = Field(..., description="male, female, other, prefer_not_to_say")

    # Contact
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=200)
    address_line1: str | None = Field(default=None, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=50)
    zip_code: str | None = Field(default=None, max_length=20)

    # Insurance
    insurance_provider: str | None = Field(default=None, max_length=200)
    insurance_member_id: str | None = Field(default=None, max_length=100)
    insurance_group: str | None = Field(default=None, max_length=100)

    # Emergency contact
    emergency_contact_name: str | None = Field(default=None, max_length=200)
    emergency_contact_phone: str | None = Field(default=None, max_length=20)
    emergency_contact_relation: str | None = Field(default=None, max_length=100)

    # Clinical
    medical_history: MedicalHistoryData | None = None
    review_of_systems: ReviewOfSystemsData | None = None
    chief_complaint: str = Field(..., min_length=1, max_length=2000)

    # Consent
    consent_treat_bill: bool = Field(..., description="Required: consent to treatment and billing")
    consent_privacy_notice: bool = Field(..., description="Required: HIPAA/CMIA privacy notice acknowledgment")
    consent_digital_comm: bool = Field(default=False, description="Optional: digital communication consent")


class IntakeSubmissionResponse(CamelCaseModel):
    """Returned after successful intake form submission."""

    success: bool = True
    message: str = "Your information has been received. Thank you!"
    appointment_date: str | None = None
