"""
schemas/patient_problem.py

Pydantic request/response schemas for the master patient problem list.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime

from pydantic import Field, field_validator

from app.db.models.tenant.clinical import EyeAffected
from app.schemas.common import AppBaseModel

ICD10_PATTERN = re.compile(r"^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$", re.IGNORECASE)


class PatientProblemCreate(AppBaseModel):
    """POST /patients/{patient_id}/problems"""

    icd10_code: str = Field(..., max_length=20)
    description: str = Field(..., max_length=500)
    eye_affected: EyeAffected | None = None
    severity: str | None = Field(default=None, max_length=50)
    status: str = Field(default="active", max_length=50)
    onset_date: date | None = None
    source_encounter_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("icd10_code")
    @classmethod
    def validate_icd10(cls, v: str) -> str:
        v = v.strip().upper()
        if not ICD10_PATTERN.match(v):
            raise ValueError(
                f"'{v}' is not a valid ICD-10-CM code. "
                "Expected format: letter + 2 digits + optional decimal + 1-4 alphanumeric."
            )
        return v


class PatientProblemUpdate(AppBaseModel):
    """PATCH /patients/{patient_id}/problems/{problem_id}"""

    eye_affected: EyeAffected | None = None
    severity: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, max_length=50)
    onset_date: date | None = None
    resolved_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class PatientProblemResponse(AppBaseModel):
    """Full problem response."""

    id: uuid.UUID
    patient_id: uuid.UUID
    icd10_code: str
    description: str
    eye_affected: EyeAffected | None = None
    severity: str | None = None
    status: str
    onset_date: date | None = None
    resolved_date: date | None = None
    source_encounter_id: uuid.UUID | None = None
    notes: str | None = None
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
