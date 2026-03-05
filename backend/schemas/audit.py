"""
schemas/audit.py

Pydantic models for audit log responses and requests.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from backend.schemas.common import AppBaseModel


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class AiScribeAcceptRequest(BaseModel):
    """Payload sent when the doctor accepts AI auto-fill."""

    changes: dict[str, Any] = Field(
        ..., description="The structured JSON that was auto-filled into encounter fields"
    )


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class AuditLogResponse(AppBaseModel):
    """Single audit log entry."""

    id: UUID
    timestamp: datetime
    user_id: UUID
    staff_name: str | None = None
    encounter_id: UUID | None = None
    patient_id: UUID | None = None
    action_type: str
    resource_type: str
    detail: str | None = None
    changes: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class AuditLogListResponse(AppBaseModel):
    """Paginated list of audit log entries."""

    logs: list[AuditLogResponse]
    total: int
    page: int
    per_page: int
