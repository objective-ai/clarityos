"""
schemas/diagnosis.py

Pydantic request/response schemas for encounter-level diagnoses.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import Field, field_validator

from backend.db.models.tenant.clinical import EyeAffected
from backend.schemas.common import AppBaseModel

# ICD-10-CM format: 1 letter, 2 digits, optional decimal, 1-4 alphanumeric.
ICD10_PATTERN = re.compile(r"^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$", re.IGNORECASE)


class DiagnosisCreateRequest(AppBaseModel):
    """POST /encounters/{enc_id}/diagnoses"""

    icd10_code: str = Field(..., max_length=20)
    description: str = Field(..., max_length=500)
    eye_affected: EyeAffected | None = None
    severity: str | None = Field(default=None, max_length=50)
    status: str = Field(default="active", max_length=50)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("icd10_code")
    @classmethod
    def validate_icd10(cls, v: str) -> str:
        v = v.strip().upper()
        if not ICD10_PATTERN.match(v):
            raise ValueError(
                f"'{v}' is not a valid ICD-10-CM code. "
                "Expected format: letter + 2 digits + optional decimal + 1-4 alphanumeric "
                "(e.g. H52.13, Z00.01)."
            )
        return v


class DiagnosisUpdateRequest(AppBaseModel):
    """PATCH /encounters/{enc_id}/diagnoses/{dx_id}"""

    eye_affected: EyeAffected | None = None
    severity: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=2000)


class DiagnosisResponse(AppBaseModel):
    """Full diagnosis response."""

    id: uuid.UUID
    encounter_id: uuid.UUID
    icd10_code: str
    description: str
    eye_affected: EyeAffected | None = None
    severity: str | None = None
    status: str
    notes: str | None = None
    recorded_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
