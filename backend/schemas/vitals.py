"""
schemas/vitals.py

Pydantic schemas for the VitalsAndPretest module.

These measurements are taken by the technician before the doctor enters the
exam room.  They form the clinical baseline for the entire visit.

Key validation decisions:
  - IOP (intraocular pressure) is stored as Decimal to match Numeric(5,1).
    Normal range is 10–21 mmHg.  We don't REJECT values outside this range
    because abnormally high or low pressures are valid clinical findings —
    we just store them accurately.  The UI layer adds a visual alert.
  - Visual Acuity is a string because the Snellen scale is not purely numeric:
    "CF" (Count Fingers), "HM" (Hand Motion), "LP" (Light Perception),
    "NLP" (No Light Perception) are all valid.
  - Blood pressure is stored as "systolic/diastolic" string.  We validate
    the format with a regex but do not parse the integers — that's a UI
    concern (flagging hypertensive readings).
"""

from __future__ import annotations

import re
import uuid
from decimal import Decimal
from typing import Annotated

from pydantic import Field, field_validator

from backend.schemas.common import CamelCaseModel, TimestampSchema

# IOP (mmHg): physiologically possible range is ~0–80 mmHg.
# We allow up to 80 to capture pathological cases (angle closure crisis).
IOP = Annotated[
    Decimal,
    Field(
        ge=Decimal("0.0"),
        le=Decimal("80.0"),
        decimal_places=1,
        description="Intraocular pressure in mmHg (0.0–80.0). Normal: 10–21 mmHg.",
    ),
]

# Snellen acuity string, e.g. "20/20", "20/200", "CF", "HM", "LP", "NLP"
SNELLEN_PATTERN = re.compile(
    r"^(\d{2,3}/\d{1,4}|CF|HM|LP|NLP|PL|count fingers|hand motion)$",
    re.IGNORECASE,
)

# Blood pressure: "120/80" — we validate format, not clinical range.
BP_PATTERN = re.compile(r"^\d{2,3}/\d{2,3}$")


class VitalsCreate(CamelCaseModel):
    """
    Request body for PUT /encounters/{encounter_id}/vitals.

    All fields are optional — technicians record whatever is relevant for
    the visit type.  A contact lens check may skip blood pressure; a
    glaucoma follow-up will always have IOP.

    The PUT method is idempotent: calling it twice with the same data
    returns the same result, and calling it with new data replaces the
    previous vitals record (only one vitals record exists per encounter).
    """

    # --- Intraocular Pressure ---
    iop_od: IOP | None = Field(
        default=None,
        description="Right eye (OD) intraocular pressure in mmHg.",
    )
    iop_os: IOP | None = Field(
        default=None,
        description="Left eye (OS) intraocular pressure in mmHg.",
    )
    iop_method: str | None = Field(
        default=None,
        max_length=50,
        description='Tonometry method used, e.g. "Goldmann", "iCare", "Air Puff (NCT)".',
    )

    # --- Visual Acuity ---
    ucva_od: str | None = Field(
        default=None,
        max_length=20,
        description='Uncorrected VA right eye, e.g. "20/40". Without glasses/contacts.',
    )
    ucva_os: str | None = Field(
        default=None,
        max_length=20,
        description="Uncorrected VA left eye.",
    )
    bcva_od: str | None = Field(
        default=None,
        max_length=20,
        description='Best-corrected VA right eye with current glasses, e.g. "20/20".',
    )
    bcva_os: str | None = Field(
        default=None,
        max_length=20,
        description="Best-corrected VA left eye.",
    )
    near_va_od: str | None = Field(
        default=None,
        max_length=20,
        description='Near VA right eye, e.g. "J1", "20/25".',
    )
    near_va_os: str | None = Field(
        default=None,
        max_length=20,
        description="Near VA left eye.",
    )

    # --- Systemic vitals ---
    blood_pressure: str | None = Field(
        default=None,
        description='Blood pressure as "systolic/diastolic", e.g. "120/80".',
    )
    pulse: int | None = Field(
        default=None,
        ge=30,
        le=250,
        description="Heart rate in beats per minute (30–250).",
    )

    # --- Pupil assessment ---
    pupils_equal_round_reactive: bool | None = Field(
        default=None,
        description="PERRL — pupils are equal, round, and reactive to light.",
    )
    relative_afferent_pupillary_defect: bool | None = Field(
        default=None,
        description="RAPD — asymmetric pupil response; sign of optic nerve or retinal disease.",
    )

    cover_test_notes: str | None = Field(
        default=None,
        max_length=500,
        description='Ocular alignment result, e.g. "orthophoric", "4Δ esophoria at near".',
    )
    technician_notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Free-text notes for the doctor's attention before the exam.",
    )

    # --- Preliminary test fields (Phase 10) ---
    confrontation: str | None = Field(
        default=None,
        max_length=100,
        description='Confrontation visual field result, e.g. "Full", "Restricted temporal OD".',
    )
    motility: str | None = Field(
        default=None,
        max_length=100,
        description='Extraocular motility result, e.g. "Full", "Restricted upgaze OS".',
    )
    color_vision: str | None = Field(
        default=None,
        max_length=100,
        description='Color vision test result, e.g. "Normal", "8/14 Ishihara OD".',
    )
    npc: str | None = Field(
        default=None,
        max_length=100,
        description='Near point of convergence, e.g. "Normal", "Break 10cm / Recovery 14cm".',
    )
    pupils_od_mm: Decimal | None = Field(
        default=None,
        ge=Decimal("1.0"),
        le=Decimal("9.0"),
        decimal_places=1,
        description="Right eye pupil diameter in mm (1.0-9.0).",
    )
    pupils_os_mm: Decimal | None = Field(
        default=None,
        ge=Decimal("1.0"),
        le=Decimal("9.0"),
        decimal_places=1,
        description="Left eye pupil diameter in mm (1.0-9.0).",
    )
    autorefractor: str | None = Field(
        default=None,
        max_length=2000,
        description='Autorefractor readings, e.g. "OD: -2.00 -0.75x180, OS: -1.50 -0.50x175".',
    )
    keratometer: str | None = Field(
        default=None,
        max_length=2000,
        description='Keratometer readings, e.g. "OD: 43.00/44.25@090, OS: 42.75/43.50@085".',
    )
    entrance_rx: str | None = Field(
        default=None,
        max_length=2000,
        description='Current spectacle Rx, e.g. "OD: -2.00 -0.75x180, OS: -1.50 -0.50x175".',
    )

    @field_validator("blood_pressure")
    @classmethod
    def validate_blood_pressure_format(cls, v: str | None) -> str | None:
        """Validate that blood pressure follows the 'systolic/diastolic' format."""
        if v is None:
            return v
        if not BP_PATTERN.match(v):
            raise ValueError(
                f"blood_pressure must be in 'systolic/diastolic' format (e.g. '120/80'). "
                f"Received: '{v}'."
            )
        # Additional sanity bounds — not a medical rejection, just a typo catch.
        parts = v.split("/")
        systolic, diastolic = int(parts[0]), int(parts[1])
        if systolic <= diastolic:
            raise ValueError(
                f"Systolic pressure ({systolic}) must be greater than diastolic "
                f"({diastolic}). Received: '{v}'."
            )
        return v

    @field_validator("ucva_od", "ucva_os", "bcva_od", "bcva_os", "near_va_od", "near_va_os")
    @classmethod
    def validate_visual_acuity_format(cls, v: str | None) -> str | None:
        """
        Validate Snellen acuity string format.

        Accepts: "20/20", "20/200", "CF", "HM", "LP", "NLP", "PL"
        Rejects: "good", "perfect", "6/6" (we store Snellen 20-foot, not metric).

        Note: 6/6 (metric) is intentionally not accepted because the DB and
        billing modules assume 20-foot Snellen.  The tech should convert.
        """
        if v is None:
            return v
        if not SNELLEN_PATTERN.match(v):
            raise ValueError(
                f"Invalid visual acuity format: '{v}'. "
                "Expected Snellen notation (e.g. '20/20', '20/200') or "
                "descriptive values: CF, HM, LP, NLP, PL."
            )
        return v.upper() if v.upper() in {"CF", "HM", "LP", "NLP", "PL"} else v


class VitalsResponse(TimestampSchema):
    """
    Full read-model for a VitalsAndPretest record.

    Returned from:
      - PUT  /encounters/{id}/vitals → 200 OK
      - GET  /encounters/{id}        → nested inside EncounterDetailResponse
    """

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

    # Preliminary test fields (Phase 10)
    confrontation: str | None = None
    motility: str | None = None
    color_vision: str | None = None
    npc: str | None = None
    pupils_od_mm: Decimal | None = None
    pupils_os_mm: Decimal | None = None
    autorefractor: str | None = None
    keratometer: str | None = None
    entrance_rx: str | None = None

    recorded_by_id: uuid.UUID | None = None
