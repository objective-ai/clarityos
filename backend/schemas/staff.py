"""
schemas/staff.py

Pydantic request and response schemas for Staff management.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from backend.schemas.common import AppBaseModel


class StaffListItem(AppBaseModel):
    """Staff member summary for list views."""

    id: UUID
    first_name: str
    last_name: str
    role: str
    is_active: bool
    created_at: datetime


class StaffDetailResponse(StaffListItem):
    """Full staff member detail."""

    tenant_id: UUID
    global_user_id: UUID
    license_number: str | None = None
    npi_number: str | None = None
    updated_at: datetime | None = None


class StaffUpdateRequest(BaseModel):
    """Partial update for a staff member (all fields optional)."""

    role: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    license_number: str | None = None
    npi_number: str | None = None
    is_active: bool | None = None
