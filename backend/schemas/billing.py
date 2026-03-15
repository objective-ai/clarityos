"""
schemas/billing.py

Pydantic request and response schemas for the Billing & Coding module.

Covers:
  1. Superbill — billing record linked to a finalized encounter
  2. SuperbillLineItem — individual CPT codes with diagnosis pointers
  3. MDM calculation — AI Medical Decision Making complexity assessment
  4. CPT-ICD validation — pointer validation warnings
  5. Payer, Fee Schedule, Patient Insurance (Phase 9)
"""

from __future__ import annotations

import re
import uuid as _uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field, field_validator

from backend.schemas.common import AppBaseModel


# ---------------------------------------------------------------------------
# CPT code validation
# ---------------------------------------------------------------------------

# CPT codes are 5 digits, optionally followed by a modifier
CPT_PATTERN = re.compile(r"^\d{5}$")

# ICD-10-CM format: 1 letter, 2 digits, optional decimal, 1-4 alphanumeric.
ICD10_PATTERN = re.compile(r"^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Line Item schemas
# ---------------------------------------------------------------------------


class LineItemCreateRequest(AppBaseModel):
    """Request body for adding a CPT line item to a superbill."""

    cpt_code: str = Field(
        ...,
        min_length=5,
        max_length=10,
        description="CPT procedure code (e.g. '92014', '99213').",
    )
    description: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Human-readable description of the procedure.",
    )
    fee: Decimal = Field(
        default=Decimal("0.00"),
        ge=Decimal("0.00"),
        le=Decimal("99999.99"),
        description="Fee for this line item in USD.",
    )
    units: int = Field(
        default=1,
        ge=1,
        le=99,
        description="Number of units billed.",
    )
    diagnosis_pointers: list[str] = Field(
        default_factory=list,
        description="ICD-10 codes that justify this CPT code.",
    )
    modifiers: list[str] = Field(
        default_factory=list,
        description="CPT modifier codes (e.g. '-25', '-59').",
    )

    @field_validator("diagnosis_pointers", mode="before")
    @classmethod
    def validate_icd10_pointers(cls, v: list[str]) -> list[str]:
        if not isinstance(v, list):
            raise ValueError("diagnosis_pointers must be a list of ICD-10 codes.")
        for code in v:
            if not ICD10_PATTERN.match(code):
                raise ValueError(
                    f"Invalid ICD-10 code format: '{code}'. "
                    "Expected format: letter + 2 digits + optional decimal + 1-4 alphanumeric."
                )
        return v


class LineItemUpdateRequest(AppBaseModel):
    """Partial update for a superbill line item."""

    fee: Decimal | None = Field(default=None, ge=Decimal("0.00"), le=Decimal("99999.99"))
    units: int | None = Field(default=None, ge=1, le=99)
    diagnosis_pointers: list[str] | None = None
    modifiers: list[str] | None = None


class LineItemResponse(AppBaseModel):
    """Response schema for a single superbill line item."""

    id: _uuid.UUID
    superbill_id: _uuid.UUID
    cpt_code: str
    description: str
    fee: float
    units: int
    diagnosis_pointers: list[str]
    modifiers: list[str]
    is_fee_overridden: bool = False
    fee_source: str = "base_rate"
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# CPT-ICD Validation Warning
# ---------------------------------------------------------------------------


class CptIcdWarning(AppBaseModel):
    """Warning when a CPT code lacks a supporting diagnosis pointer."""

    cpt_code: str
    description: str
    warning: str


# ---------------------------------------------------------------------------
# Superbill schemas
# ---------------------------------------------------------------------------


class SuperbillCreateRequest(AppBaseModel):
    """Request body for POST /encounters/{id}/superbill.

    The superbill is auto-populated with suggested CPT codes based on
    the encounter's diagnoses and procedures performed.
    """

    line_items: list[LineItemCreateRequest] = Field(
        default_factory=list,
        description="Initial line items. If empty, system auto-suggests based on encounter data.",
    )
    notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Optional billing notes.",
    )
    billed_payer_id: _uuid.UUID | None = Field(
        default=None,
        description="Insurance payer to bill. None = self-pay or unassigned.",
    )
    is_self_pay: bool = Field(
        default=False,
        description="True if patient is paying out of pocket.",
    )


class SuperbillUpdateRequest(AppBaseModel):
    """Partial update for a superbill."""

    claim_status: str | None = Field(
        default=None,
        description="New claim status: 'draft', 'ready_to_bill', 'submitted'.",
    )
    notes: str | None = None

    @field_validator("claim_status")
    @classmethod
    def validate_claim_status(cls, v: str | None) -> str | None:
        if v is not None:
            valid = {"draft", "ready_to_bill", "submitted", "accepted", "rejected"}
            if v not in valid:
                raise ValueError(f"Invalid claim_status '{v}'. Must be one of: {valid}")
        return v


class SuperbillResponse(AppBaseModel):
    """Full superbill response with line items."""

    id: _uuid.UUID
    encounter_id: _uuid.UUID
    patient_id: _uuid.UUID
    provider_id: _uuid.UUID
    claim_status: str
    mdm_level: str | None = None
    mdm_reasoning: str | None = None
    suggested_em_code: str | None = None
    total_fee: float
    notes: str | None = None
    created_by_id: _uuid.UUID | None = None
    billed_payer_id: _uuid.UUID | None = None
    is_self_pay: bool = False
    line_items: list[LineItemResponse] = Field(default_factory=list)
    warnings: list[CptIcdWarning] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# MDM Calculation schemas
# ---------------------------------------------------------------------------


class MdmCalculationResult(AppBaseModel):
    """Result of the AI MDM complexity calculation."""

    mdm_level: str = Field(
        ...,
        description="MDM complexity: 'straightforward', 'low', 'moderate', 'high'.",
    )
    suggested_em_code: str = Field(
        ...,
        description="Suggested E&M CPT code (99213, 99214, or 99215).",
    )
    reasoning: str = Field(
        ...,
        description="Explanation of how the MDM level was determined.",
    )
    problem_points: int = Field(
        ...,
        description="Number of problems/complexity points from diagnoses.",
    )
    data_points: int = Field(
        ...,
        description="Points from data reviewed (tests, imaging, etc.).",
    )
    risk_level: str = Field(
        ...,
        description="Risk of complications or mortality assessment.",
    )
    is_new_patient: bool = Field(
        default=False,
        description="Whether the patient is new (no prior finalized encounters).",
    )


# ---------------------------------------------------------------------------
# Superbill List (dashboard)
# ---------------------------------------------------------------------------


class SuperbillListItem(AppBaseModel):
    """Lightweight superbill for dashboard list view."""

    id: _uuid.UUID
    encounter_id: _uuid.UUID
    patient_id: _uuid.UUID
    patient_name: str
    provider_name: str
    claim_status: str
    cpt_codes: list[str]
    icd_codes: list[str] = []
    total_fee: float
    billed_payer_id: _uuid.UUID | None = None
    is_self_pay: bool = False
    created_at: datetime
    last_pdf_generated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Payer schemas (Phase 9)
# ---------------------------------------------------------------------------


class PayerCreate(AppBaseModel):
    name: str
    payer_id: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool = True


class PayerUpdate(AppBaseModel):
    name: str | None = None
    payer_id: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool | None = None


class PayerResponse(AppBaseModel):
    id: _uuid.UUID
    name: str
    payer_id: str | None
    phone: str | None
    address: str | None
    is_active: bool


# ---------------------------------------------------------------------------
# Fee Schedule schemas (Phase 9)
# ---------------------------------------------------------------------------


class FeeScheduleItemResponse(AppBaseModel):
    id: _uuid.UUID
    payer_id: _uuid.UUID | None
    cpt_code: str
    description: str
    fee: float


class FeeScheduleItemUpdate(AppBaseModel):
    cpt_code: str
    description: str = ""
    fee: float


# ---------------------------------------------------------------------------
# Patient Insurance schemas (Phase 9)
# ---------------------------------------------------------------------------


class PatientInsuranceCreate(AppBaseModel):
    payer_id: _uuid.UUID
    priority: str  # "primary" | "secondary"
    plan_type: str  # "medical" | "vision" | "other"
    subscriber_id: str | None = None
    group_number: str | None = None
    plan_name: str | None = None
    relationship_to_subscriber: str = "self"
    subscriber_name: str | None = None
    subscriber_dob: str | None = None  # ISO date string

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        if v not in ("primary", "secondary"):
            raise ValueError("priority must be 'primary' or 'secondary'")
        return v

    @field_validator("plan_type")
    @classmethod
    def validate_plan_type(cls, v: str) -> str:
        if v not in ("medical", "vision", "other"):
            raise ValueError("plan_type must be 'medical', 'vision', or 'other'")
        return v


class PatientInsuranceUpdate(AppBaseModel):
    payer_id: _uuid.UUID | None = None
    priority: str | None = None
    plan_type: str | None = None
    subscriber_id: str | None = None
    group_number: str | None = None
    plan_name: str | None = None
    relationship_to_subscriber: str | None = None
    subscriber_name: str | None = None
    subscriber_dob: str | None = None


class PatientInsuranceResponse(AppBaseModel):
    id: _uuid.UUID
    patient_id: _uuid.UUID
    payer_id: _uuid.UUID
    payer_name: str  # denormalized for display
    priority: str
    plan_type: str
    subscriber_id: str | None
    group_number: str | None
    plan_name: str | None
    relationship_to_subscriber: str
    subscriber_name: str | None
    subscriber_dob: str | None


# ---------------------------------------------------------------------------
# Patient Superbill Summary (Phase 9)
# ---------------------------------------------------------------------------


class PatientSuperbillSummary(AppBaseModel):
    id: _uuid.UUID
    encounter_id: _uuid.UUID
    encounter_date: str
    claim_status: str
    total_fee: float
    mdm_level: str | None = None
    suggested_em_code: str | None = None
    cpt_codes: list[str]
