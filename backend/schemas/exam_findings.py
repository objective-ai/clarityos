"""
schemas/exam_findings.py

Pydantic schemas for the JSONB-based Ocular Health Grids.

Each anatomical structure stores { status, severity, finding } per eye.
The JSONB payloads (findings_od / findings_os) are validated against
section-specific Pydantic models before insertion.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from backend.schemas.common import AppBaseModel


# ---------------------------------------------------------------------------
# Atomic structure finding (one structure, one eye)
# ---------------------------------------------------------------------------


class StructureFinding(AppBaseModel):
    """A single anatomical structure observation for one eye."""

    status: str = Field(
        default="Normal",
        max_length=100,
        description="Clinical status, e.g. 'Normal', 'Clear', 'SPK'",
    )
    severity: str | None = Field(
        default=None,
        max_length=50,
        description="Severity when abnormal: 'mild', 'moderate', 'severe'",
    )
    finding: str = Field(
        default="",
        max_length=2000,
        description="Detailed finding text or free-text notes",
    )


# ---------------------------------------------------------------------------
# Anterior Segment (per eye)
# ---------------------------------------------------------------------------


class AnteriorSegmentSchema(AppBaseModel):
    """Validates findings_od / findings_os for anterior_segment."""

    lids_lashes: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Normal")
    )
    conjunctiva_sclera: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="White & quiet")
    )
    cornea: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Clear")
    )
    anterior_chamber: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Deep & quiet")
    )
    iris: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Flat, normal architecture")
    )
    lens: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Clear")
    )
    tear_film: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Stable")
    )
    angles: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Open (Grade 4)")
    )


# ---------------------------------------------------------------------------
# Posterior Segment (per eye)
# ---------------------------------------------------------------------------


class PosteriorSegmentSchema(AppBaseModel):
    """Validates findings_od / findings_os for posterior_segment."""

    cup_to_disc_ratio: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="0.3")
    )
    optic_nerve: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Healthy, pink")
    )
    macula: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Flat & intact")
    )
    vitreous: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Clear")
    )
    vessels: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Normal A/V ratio")
    )
    periphery: StructureFinding = Field(
        default_factory=lambda: StructureFinding(status="Flat & intact")
    )


# ---------------------------------------------------------------------------
# Validation dispatch
# ---------------------------------------------------------------------------

SECTION_SCHEMA_MAP: dict[str, type[AppBaseModel]] = {
    "anterior_segment": AnteriorSegmentSchema,
    "posterior_segment": PosteriorSegmentSchema,
}


# ---------------------------------------------------------------------------
# Request / Response
# ---------------------------------------------------------------------------


class ExamFindingsUpdateRequest(AppBaseModel):
    """PUT /encounters/{id}/exam-findings/{exam_section}"""

    is_normal_wnl: bool = False
    findings_od: dict | None = None
    findings_os: dict | None = None
    provider_notes: str | None = Field(default=None, max_length=5000)


class ExamFindingsDetailResponse(AppBaseModel):
    """Full response for a single exam findings record."""

    id: uuid.UUID
    encounter_id: uuid.UUID
    patient_id: uuid.UUID
    exam_section: str
    is_normal_wnl: bool
    findings_od: dict | None = None
    findings_os: dict | None = None
    ai_raw_transcript: str | None = None
    provider_notes: str | None = None
    recorded_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
