"""
api/routes/tenant.py

Tenant settings endpoints (admin/owner only).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.ai_models import DEFAULT_AI_MODEL, VALID_MODEL_IDS
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext
from backend.db.models.public.saas import Tenant
from backend.db.session import get_db
from backend.schemas.tenant import TenantSettingsResponse, TenantSettingsUpdate

router = APIRouter()

VALID_TIMEZONES = {
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "Pacific/Honolulu",
    "Asia/Ho_Chi_Minh",
    "Asia/Tokyo",
    "Europe/London",
    "Europe/Paris",
    "Australia/Sydney",
}


@router.get("/settings/", response_model=TenantSettingsResponse)
async def get_tenant_settings(
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """Return current tenant settings."""
    result = await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    ai_model = (tenant.settings_jsonb or {}).get("ai_model", DEFAULT_AI_MODEL)
    return TenantSettingsResponse(name=tenant.name, timezone=tenant.timezone, ai_model=ai_model)


@router.patch("/settings/", response_model=TenantSettingsResponse)
async def update_tenant_settings(
    payload: TenantSettingsUpdate,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """Update tenant settings (admin/owner only)."""
    result = await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    if payload.timezone is not None:
        if payload.timezone not in VALID_TIMEZONES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid timezone. Must be one of: {sorted(VALID_TIMEZONES)}",
            )
        tenant.timezone = payload.timezone

    if payload.ai_model is not None:
        model_id = payload.ai_model.strip()
        if not model_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="AI model cannot be empty",
            )
        if model_id not in VALID_MODEL_IDS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid AI model. Must be one of: {sorted(VALID_MODEL_IDS)}",
            )
        current = tenant.settings_jsonb or {}
        tenant.settings_jsonb = {**current, "ai_model": model_id}

    await db.flush()
    ai_model = (tenant.settings_jsonb or {}).get("ai_model", DEFAULT_AI_MODEL)
    return TenantSettingsResponse(name=tenant.name, timezone=tenant.timezone, ai_model=ai_model)
