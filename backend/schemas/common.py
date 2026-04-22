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
    """Base model that serializes fields as camelCase in JSON.

    Overrides model_dump/model_dump_json to default by_alias=True so
    FastAPI response serialization always emits camelCase without requiring
    response_model_by_alias=True on every route.
    """

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    def model_dump(self, **kwargs):
        kwargs.setdefault("by_alias", True)
        return super().model_dump(**kwargs)

    def model_dump_json(self, **kwargs):
        kwargs.setdefault("by_alias", True)
        return super().model_dump_json(**kwargs)


class TimestampSchema(AppBaseModel):
    """Mixin schema for timestamp fields."""

    created_at: datetime
    updated_at: datetime


class AuditInfo(TimestampSchema):
    """Mixin schema for audit fields (recorded_by + timestamps)."""

    recorded_by_id: UUID | None = None
