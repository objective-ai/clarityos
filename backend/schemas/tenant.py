"""
schemas/tenant.py

Request/response models for tenant settings.
"""

from backend.schemas.common import AppBaseModel


class TenantSettingsUpdate(AppBaseModel):
    timezone: str | None = None


class TenantSettingsResponse(AppBaseModel):
    name: str
    timezone: str
