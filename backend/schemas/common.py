"""
schemas/common.py

Base Pydantic models used across all schemas.
"""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


def to_camel(string: str) -> str:
    """Convert snake_case to camelCase for JSON serialization."""
    parts = string.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


class AppBaseModel(BaseModel):
    """Base model with ORM mode enabled."""

    model_config = ConfigDict(from_attributes=True)


class CamelCaseModel(AppBaseModel):
    """Base model that serializes fields as camelCase in JSON."""

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class TimestampSchema(AppBaseModel):
    """Mixin schema for timestamp fields."""

    created_at: datetime
    updated_at: datetime


class AuditInfo(TimestampSchema):
    """Mixin schema for audit fields (recorded_by + timestamps)."""

    recorded_by_id: UUID | None = None
