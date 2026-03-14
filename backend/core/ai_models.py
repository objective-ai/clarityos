"""
core/ai_models.py

Single source of truth for AI model configuration.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models.public.saas import Tenant

DEFAULT_AI_MODEL = "claude-sonnet-4-6"

KNOWN_AI_MODELS = [
    {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6 (recommended)"},
    {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5 (faster, cheaper)"},
    {"id": "claude-opus-4-6", "label": "Claude Opus 4.6 (most capable)"},
]

# Map stale/legacy model IDs (e.g. with date suffixes) to their canonical form.
_MODEL_ALIASES: dict[str, str] = {
    "claude-sonnet-4-6-20250514": "claude-sonnet-4-6",
    "claude-opus-4-6-20250514": "claude-opus-4-6",
}

VALID_MODEL_IDS = {m["id"] for m in KNOWN_AI_MODELS}


def _resolve_model_id(raw: str) -> str:
    """Return a valid Anthropic model ID, normalising known aliases."""
    if raw in VALID_MODEL_IDS:
        return raw
    if raw in _MODEL_ALIASES:
        return _MODEL_ALIASES[raw]
    return DEFAULT_AI_MODEL


async def get_tenant_ai_model(tenant_id, db: AsyncSession) -> str:
    """Read ai_model from tenant settings_jsonb, falling back to DEFAULT_AI_MODEL."""
    result = await db.execute(select(Tenant.settings_jsonb).where(Tenant.id == tenant_id))
    settings = result.scalar_one_or_none()
    if settings:
        raw = settings.get("ai_model", DEFAULT_AI_MODEL)
        return _resolve_model_id(raw)
    return DEFAULT_AI_MODEL
