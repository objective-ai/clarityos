"""
schemas/patient.py

Pydantic request/response schemas for Patient CRUD operations.

Covers:
  - PatientCreateRequest  (POST /api/patients)
  - PatientUpdateRequest  (PATCH /api/patients/{id})
  - PatientResponse       (single patient detail with encounters + problems)
  - PatientListResponse   (paginated list for the patient table)

Privacy note: SSN last 4 is accepted on create/update but NEVER exposed in
list responses — only in the detail response (PHI access is audit-logged).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, field_validator

from backend.db.models.tenant.clinical import Sex
from backend.schemas.common import AppBaseModel


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class PatientCreateRequest(AppBaseModel):
    """Request body for POST /api/patients"""

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    preferred_name: str | None = Field(default=None, max_length=100)
    dob: date = Field(..., description="Date of birth (YYYY-MM-DD)")
    sex: Sex

    # Contact info stored as JSONB
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=200)
    address_line1: str | None = Field(default=None, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=50)
    zip_code: str | None = Field(default=None, max_length=20)

    # Sensitive
    ssn_last4: str | None = Field(default=None, min_length=4, max_length=4)

    # Insurance
    insurance_provider: str | None = Field(default=None, max_length=200)
    insurance_member_id: str | None = Field(default=None, max_length=100)
    insurance_group: str | None = Field(default=None, max_length=100)

    # Emergency contact
    emergency_contact_name: str | None = Field(default=None, max_length=200)
    emergency_contact_phone: str | None = Field(default=None, max_length=20)
    emergency_contact_relation: str | None = Field(default=None, max_length=100)

    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("dob")
    @classmethod
    def validate_dob_not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Date of birth cannot be in the future.")
        return v

    @field_validator("ssn_last4")
    @classmethod
    def validate_ssn_digits(cls, v: str | None) -> str | None:
        if v is not None and not v.isdigit():
            raise ValueError("SSN last 4 must be numeric digits only.")
        return v


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


class PatientUpdateRequest(AppBaseModel):
    """Request body for PATCH /api/patients/{id}"""

    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    preferred_name: str | None = Field(default=None, max_length=100)
    dob: date | None = None
    sex: Sex | None = None

    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=200)
    address_line1: str | None = Field(default=None, max_length=200)
    address_line2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=50)
    zip_code: str | None = Field(default=None, max_length=20)

    ssn_last4: str | None = Field(default=None, min_length=4, max_length=4)

    insurance_provider: str | None = Field(default=None, max_length=200)
    insurance_member_id: str | None = Field(default=None, max_length=100)
    insurance_group: str | None = Field(default=None, max_length=100)

    emergency_contact_name: str | None = Field(default=None, max_length=200)
    emergency_contact_phone: str | None = Field(default=None, max_length=20)
    emergency_contact_relation: str | None = Field(default=None, max_length=100)

    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("dob")
    @classmethod
    def validate_dob_not_future(cls, v: date | None) -> date | None:
        if v is not None and v > date.today():
            raise ValueError("Date of birth cannot be in the future.")
        return v


# ---------------------------------------------------------------------------
# Encounter summary (embedded in patient detail)
# ---------------------------------------------------------------------------


class PatientEncounterSummary(AppBaseModel):
    """Abbreviated encounter for the patient timeline."""

    id: uuid.UUID
    short_id: str
    encounter_date: date
    provider_id: uuid.UUID
    provider_name: str | None = None
    chief_complaint: str | None = None
    assessment_and_plan: str | None = None
    ai_summary_text: str | None = None
    is_finalized: bool
    diagnosis_count: int = 0
    created_at: datetime


# ---------------------------------------------------------------------------
# Flowsheet row (IOP + Rx per visit)
# ---------------------------------------------------------------------------


class FlowsheetRow(AppBaseModel):
    """One row in the clinical flowsheet (one visit)."""

    encounter_id: uuid.UUID
    encounter_date: date
    iop_od: Decimal | None = None
    iop_os: Decimal | None = None
    sphere_od: Decimal | None = None
    sphere_os: Decimal | None = None
    cylinder_od: Decimal | None = None
    cylinder_os: Decimal | None = None
    add_od: Decimal | None = None
    add_os: Decimal | None = None


# ---------------------------------------------------------------------------
# Rx History row (finalized prescriptions over time)
# ---------------------------------------------------------------------------


class RxHistoryRow(AppBaseModel):
    """One finalized prescription from a past encounter."""

    encounter_id: uuid.UUID
    encounter_date: date
    provider_name: str | None = None
    rx_modality: str = "glasses"
    rx_type: str
    od_sphere: Decimal | None = None
    od_cylinder: Decimal | None = None
    od_axis: int | None = None
    od_add: Decimal | None = None
    os_sphere: Decimal | None = None
    os_cylinder: Decimal | None = None
    os_axis: int | None = None
    os_add: Decimal | None = None


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class PatientSummary(AppBaseModel):
    """Abbreviated patient for list views."""

    id: uuid.UUID
    chart_number: int
    first_name: str
    last_name: str
    preferred_name: str | None = None
    dob: date
    sex: Sex
    phone: str | None = None
    email: str | None = None
    last_visit: date | None = None
    created_at: datetime


class PatientListResponse(AppBaseModel):
    """Paginated patient list."""

    items: list[PatientSummary]
    total: int
    limit: int
    offset: int


class PatientResponse(AppBaseModel):
    """Full patient detail response (for the patient detail page)."""

    id: uuid.UUID
    chart_number: int
    first_name: str
    last_name: str
    preferred_name: str | None = None
    dob: date
    sex: Sex

    # Contact
    phone: str | None = None
    email: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None

    # Sensitive (only in detail, not list)
    ssn_last4: str | None = None

    # Insurance
    insurance_provider: str | None = None
    insurance_member_id: str | None = None
    insurance_group: str | None = None

    # Emergency contact
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relation: str | None = None

    notes: str | None = None

    # Alerts from medical_history_jsonb
    alerts: list[dict] = Field(default_factory=list)

    is_deleted: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Prep Me response
# ---------------------------------------------------------------------------


class PrepMeResponse(AppBaseModel):
    """AI-generated pre-visit clinical summary."""

    summary: str
    encounter_count: int = 0
    last_encounter_date: date | None = None
