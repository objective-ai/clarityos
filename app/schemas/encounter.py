"""
schemas/encounter.py

Pydantic request and response schemas for the Encounter module.

Covers three interrelated resources:
  1. Encounter       — the master visit record (POST /encounters)
  2. VitalsAndPretest — technician measurements (PUT /encounters/{id}/vitals)
  3. Embedded sub-schemas for diagnoses and exam findings summaries

These schemas form the contract between the React frontend and the FastAPI
backend.  The OpenAPI spec auto-generated from these types is what the
frontend team uses to build the TypeScript client types.

Validation philosophy:
  - Clinical measurements are validated to real-world physiological ranges.
    IOP of 0 mmHg or 200 mmHg would indicate a data entry error, not a patient
    condition, so we reject them at the API layer.
  - Free-text fields (chief_complaint, assessment_and_plan) are length-capped
    but otherwise unrestricted — doctors must be able to write what they observe.
  - ICD-10 codes are regex-validated for format.  We do not validate against a
    full ICD-10 lookup table at this layer (that would require a 70k-entry DB
    table and is a Phase 2 concern).
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, field_validator

from app.db.models.tenant.clinical import AppointmentStatus, EyeAffected, FindingCategory
from app.schemas.common import AppBaseModel
from app.schemas.refraction import RefractionSummary

# ---------------------------------------------------------------------------
# ICD-10 code validation
# ---------------------------------------------------------------------------

# ICD-10-CM format: 1 letter, 2 digits, optional decimal, 1-4 alphanumeric.
# Examples: "H40.1130", "Z00.01", "H52.13"
ICD10_PATTERN = re.compile(r"^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$", re.IGNORECASE)


# ---------------------------------------------------------------------------
# VitalsAndPretest schemas
# ---------------------------------------------------------------------------


class VitalsUpdateRequest(AppBaseModel):
    """
    Request body for PUT /encounters/{id}/vitals

    Captures all technician-recorded measurements.  This endpoint uses PUT
    (not PATCH) because vitals are treated as an atomic record — the technician
    fills in the whole section before saving, not field by field.

    All fields are optional so the frontend can auto-save partial data as the
    technician types without waiting for the entire section to be complete.
    The route handler distinguishes between 'draft save' and 'mark complete'
    via the `is_complete` flag rather than field presence.

    Clinical ranges enforced:
      IOP (Intraocular Pressure): 0–80 mmHg.
        Normal: 10–21 mmHg.  >21 is flagged as glaucoma suspect.
        Values >80 are physiologically impossible in a living eye.

      Visual Acuity: Free string — clinicians use Snellen (20/20),
        metric (6/6), LogMAR (0.0), or descriptive (CF, HM, NLP).
        We cannot constrain this to a fixed enum.

      Blood Pressure: Validated as "systolic/diastolic" string pattern.
        Range: systolic 60–250, diastolic 30–150.

      Pulse: 30–250 bpm.  Anything outside this is a data entry error.
    """

    # Intraocular Pressure (mmHg)
    iop_od: Decimal | None = Field(
        default=None,
        ge=Decimal("0.0"),
        le=Decimal("80.0"),
        description="Right eye intraocular pressure in mmHg (0–80). Normal: 10–21.",
    )
    iop_os: Decimal | None = Field(
        default=None,
        ge=Decimal("0.0"),
        le=Decimal("80.0"),
        description="Left eye intraocular pressure in mmHg (0–80). Normal: 10–21.",
    )
    iop_method: str | None = Field(
        default=None,
        max_length=50,
        description="Tonometry method: 'Goldmann', 'iCare', 'Air Puff', etc.",
    )

    # Uncorrected Visual Acuity (without glasses)
    ucva_od: str | None = Field(
        default=None, max_length=20,
        description="Uncorrected distance VA right eye (e.g. '20/200', 'CF').",
    )
    ucva_os: str | None = Field(
        default=None, max_length=20,
        description="Uncorrected distance VA left eye.",
    )

    # Best Corrected Visual Acuity (with current glasses or pinhole)
    bcva_od: str | None = Field(
        default=None, max_length=20,
        description="Best corrected distance VA right eye (e.g. '20/20').",
    )
    bcva_os: str | None = Field(
        default=None, max_length=20,
        description="Best corrected distance VA left eye.",
    )

    # Near VA
    near_va_od: str | None = Field(
        default=None, max_length=20,
        description="Near visual acuity right eye (e.g. 'J1', '20/20 at 40cm').",
    )
    near_va_os: str | None = Field(
        default=None, max_length=20,
        description="Near visual acuity left eye.",
    )

    # Systemic vitals
    blood_pressure: str | None = Field(
        default=None,
        max_length=20,
        description="Blood pressure as 'systolic/diastolic' (e.g. '120/80').",
    )
    pulse: int | None = Field(
        default=None,
        ge=30,
        le=250,
        description="Heart rate in beats per minute (30–250).",
    )

    # Pupil assessment
    pupils_equal_round_reactive: bool | None = Field(
        default=None,
        description="True if pupils are equal, round, and reactive to light (PERRLA).",
    )
    relative_afferent_pupillary_defect: bool | None = Field(
        default=None,
        description=(
            "True if a relative afferent pupillary defect (RAPD) is present. "
            "A positive RAPD is a significant sign of optic nerve or retinal disease."
        ),
    )

    cover_test_notes: str | None = Field(
        default=None,
        max_length=500,
        description="Findings from cover/uncover test for eye alignment assessment.",
    )
    technician_notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Freeform notes for the doctor from the technician.",
    )

    @field_validator("blood_pressure")
    @classmethod
    def validate_blood_pressure_format(cls, v: str | None) -> str | None:
        """
        Validate blood pressure is in 'systolic/diastolic' format with
        physiologically plausible values.

        We accept:
          - "120/80"    ✓
          - "140/90"    ✓
          - "300/50"    ✗ (systolic too high)
          - "120"       ✗ (missing diastolic)
          - "abc"       ✗ (not numeric)
        """
        if v is None:
            return v

        pattern = re.compile(r"^(\d{2,3})/(\d{2,3})$")
        match = pattern.match(v.strip())

        if not match:
            raise ValueError(
                "Blood pressure must be in 'systolic/diastolic' format (e.g. '120/80')."
            )

        systolic = int(match.group(1))
        diastolic = int(match.group(2))

        if not (60 <= systolic <= 250):
            raise ValueError(
                f"Systolic blood pressure {systolic} is outside the plausible range "
                f"(60–250 mmHg). Please verify the reading."
            )
        if not (30 <= diastolic <= 150):
            raise ValueError(
                f"Diastolic blood pressure {diastolic} is outside the plausible range "
                f"(30–150 mmHg). Please verify the reading."
            )
        if diastolic >= systolic:
            raise ValueError(
                "Diastolic pressure cannot be equal to or greater than systolic pressure."
            )

        return v.strip()

    @field_validator("iop_method")
    @classmethod
    def normalize_iop_method(cls, v: str | None) -> str | None:
        """Title-case the tonometry method for display consistency."""
        if v is None:
            return v
        return v.strip().title()


class VitalsResponse(AppBaseModel):
    """Full response for a VitalsAndPretest record."""

    id: uuid.UUID
    encounter_id: uuid.UUID

    iop_od: Decimal | None = None
    iop_os: Decimal | None = None
    iop_method: str | None = None

    ucva_od: str | None = None
    ucva_os: str | None = None
    bcva_od: str | None = None
    bcva_os: str | None = None
    near_va_od: str | None = None
    near_va_os: str | None = None

    blood_pressure: str | None = None
    pulse: int | None = None

    pupils_equal_round_reactive: bool | None = None
    relative_afferent_pupillary_defect: bool | None = None
    cover_test_notes: str | None = None
    technician_notes: str | None = None

    recorded_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    @property
    def iop_od_elevated(self) -> bool | None:
        """Convenience property: True if right eye IOP is above normal (>21 mmHg)."""
        if self.iop_od is None:
            return None
        return self.iop_od > Decimal("21.0")

    @property
    def iop_os_elevated(self) -> bool | None:
        """Convenience property: True if left eye IOP is above normal (>21 mmHg)."""
        if self.iop_os is None:
            return None
        return self.iop_os > Decimal("21.0")


# ---------------------------------------------------------------------------
# Diagnosis sub-schemas (for embedding in encounter detail responses)
# ---------------------------------------------------------------------------


class DiagnosisResponse(AppBaseModel):
    """Embedded diagnosis response in encounter detail."""

    id: uuid.UUID
    icd10_code: str
    description: str
    eye_affected: EyeAffected | None = None
    severity: str | None = None
    status: str
    notes: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# ExamFindings sub-schemas (for embedding in encounter detail responses)
# ---------------------------------------------------------------------------


class ExamFindingsResponse(AppBaseModel):
    """Embedded exam findings response in encounter detail."""

    id: uuid.UUID
    category: FindingCategory
    details_jsonb: dict
    recorded_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Encounter: Create Request
# ---------------------------------------------------------------------------


class EncounterCreateRequest(AppBaseModel):
    """
    Request body for POST /encounters

    Creates the master Encounter record that anchors the entire clinical visit.
    Sub-resources (vitals, refractions, findings, diagnoses) are created
    via their own endpoints after the encounter exists.

    Why not create everything in one big nested POST?
      - The exam is filled in incrementally over 20–60 minutes.
      - Different staff fill in different sections (tech → vitals, doctor → Rx).
      - Atomic all-or-nothing creation would force the frontend to buffer the
        entire exam state before submitting — bad UX and bad for data safety.
      - The encounter record acts as a session anchor so auto-save can PATCH
        sub-resources as the doctor types.

    appointment_id links back to the scheduled appointment.  It is optional
    because walk-in patients can have an encounter created without a prior
    appointment.  If provided, the appointment's status is updated to IN_EXAM.
    """

    patient_id: uuid.UUID = Field(
        ...,
        description="The patient this encounter belongs to.",
    )
    provider_id: uuid.UUID = Field(
        ...,
        description="The staff member (doctor) conducting the exam.",
    )
    appointment_id: uuid.UUID | None = Field(
        default=None,
        description=(
            "Optional link to a scheduled appointment. "
            "If provided, the appointment status will be advanced to IN_EXAM."
        ),
    )
    encounter_date: date = Field(
        ...,
        description="Date of the encounter (YYYY-MM-DD). Usually today.",
    )
    chief_complaint: str | None = Field(
        default=None,
        max_length=1000,
        description=(
            "The patient's primary reason for the visit, in their own words. "
            "E.g. 'Blurry vision at distance', 'Annual eye exam', 'Flashes and floaters'."
        ),
    )

    @field_validator("encounter_date")
    @classmethod
    def validate_encounter_date_not_future(cls, v: date) -> date:
        """
        Encounters cannot be created for future dates.

        Clinical records represent observations that happened.  A future
        encounter_date would indicate a scheduling record, not a clinical record.
        Use the Appointment model for future scheduling.
        """
        from datetime import date as date_type
        if v > date_type.today():
            raise ValueError(
                "encounter_date cannot be in the future. "
                "Encounters represent clinical observations that have already occurred. "
                "Use the Appointments module to schedule future visits."
            )
        return v


# ---------------------------------------------------------------------------
# Encounter: Finalize Request
# ---------------------------------------------------------------------------


class EncounterFinalizeRequest(AppBaseModel):
    """
    Request body for POST /encounters/{id}/finalize

    The doctor's electronic signature that locks the encounter for editing.
    Once finalized:
      - No further edits are allowed (the UI becomes read-only).
      - The AI Scribe job is triggered (if the tenant has the entitlement).
      - The encounter is included in billing export queries.

    assessment_and_plan is required at finalization — a finalized encounter
    must have a documented clinical plan.
    """

    assessment_and_plan: str = Field(
        ...,
        min_length=10,
        max_length=10000,
        description="Doctor's assessment and clinical plan. Required to finalize.",
    )
    additional_notes: str | None = Field(
        default=None,
        max_length=5000,
        description="Any additional free-text notes to append before finalizing.",
    )


# ---------------------------------------------------------------------------
# Encounter: Response schemas
# ---------------------------------------------------------------------------


class EncounterResponse(AppBaseModel):
    """
    Full encounter detail response.

    Returned by:
      - POST /encounters          (201 Created — newly initialized encounter)
      - GET  /encounters/{id}     (full detail view)

    Sub-resources are embedded as lists so the frontend can render the entire
    encounter in one request.  For the exam room UI, this is the single API
    call that populates the entire page.

    Note: vitals is a single nullable object (one per encounter); refractions,
    diagnoses, and exam_findings are lists (multiple per encounter).
    """

    id: uuid.UUID
    patient_id: uuid.UUID
    provider_id: uuid.UUID
    appointment_id: uuid.UUID | None = None
    encounter_date: date
    chief_complaint: str | None = None
    assessment_and_plan: str | None = None

    # Populated by AI Scribe worker (may be None if not generated yet)
    ai_summary_text: str | None = None
    ai_summary_generated_at: datetime | None = None

    is_finalized: bool
    finalized_at: datetime | None = None
    is_deleted: bool

    # Sub-resources embedded for the exam room single-page fetch
    vitals: VitalsResponse | None = None
    refractions: list[RefractionSummary] = Field(default_factory=list)
    diagnoses: list[DiagnosisResponse] = Field(default_factory=list)
    exam_findings: list[ExamFindingsResponse] = Field(default_factory=list)

    created_at: datetime
    updated_at: datetime


class EncounterSummary(AppBaseModel):
    """
    Abbreviated encounter for list views (patient history sidebar, patient dashboard).

    Returns enough information to render a visit history entry without
    loading every refraction and finding.
    """

    id: uuid.UUID
    encounter_date: date
    provider_id: uuid.UUID
    chief_complaint: str | None = None
    is_finalized: bool

    # Show the final Rx summary if it exists (drives the history sidebar display)
    final_rx: RefractionSummary | None = None

    # Top-level diagnosis count for the list item badge
    diagnosis_count: int = 0

    created_at: datetime


class EncounterListResponse(AppBaseModel):
    """Paginated encounter list for GET /patients/{id}/encounters."""

    items: list[EncounterSummary]
    total: int
    page: int
    page_size: int
