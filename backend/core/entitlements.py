"""
core/entitlements.py

Feature entitlement keys — mirrors frontend lib/entitlements.ts.

`require_entitlement(key)` is a FastAPI dependency factory that maps the
caller's `plan_name` (Core/Plus/Premium) to the set of entitlements granted by
that plan, AND unions in any per-tenant `public.tenant_addons.feature_key`
rows for the caller's tenant. Raises 403 if neither source grants `key`.

Plan → entitlements mapping is the source of truth on the backend; the JWT
hook injects `plan_name` plus a server-authoritative `entitlements` array
(union of subscription_plans.base_features_jsonb ∪ tenant_addons.feature_key).
Keep PLAN_FEATURES below in sync with `lib/entitlements.ts` (frontend mirror).
"""
from __future__ import annotations

from enum import StrEnum
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import TenantContext, get_current_tenant
from backend.db.models.public.saas import TenantAddon
from backend.db.session import get_db


class Entitlement(StrEnum):
    SCHEDULING = "scheduling"
    PATIENT_DEMOGRAPHICS = "patient_demographics"
    BASIC_EXAM = "basic_exam"
    ICD10_DIAGNOSES = "icd10_diagnoses"
    BILLING_EXPORT = "billing_export"
    MULTI_PROVIDER = "multi_provider"
    AI_SCRIBE = "ai_scribe"
    ADVANCED_ANALYTICS = "advanced_analytics"
    EQUIPMENT_IMPORT = "equipment_import"
    # CRM (Phase 12) — patient messaging (SMS + email reminders, recall, manual,
    # inbound triage). Lowercase wire key 'messaging' is what the JWT hook /
    # PLAN_FEATURES (lib/entitlements.ts) references; included in Plus + Premium.
    MESSAGING = "messaging"
    # Retail & POS (Phase 13 + Phase 15) — bundled add-on ($150/mo). Purchased
    # separately; NOT included in Core / Plus / Premium PLAN_FEATURES below.
    # Granted via public.tenant_addons rows (read by require_entitlement).
    RETAIL_POS = "retail_pos"


# Mirrors lib/entitlements.ts PLAN_FEATURES — keep in sync.
PLAN_FEATURES: dict[str, set[str]] = {
    "Core": {
        Entitlement.SCHEDULING,
        Entitlement.PATIENT_DEMOGRAPHICS,
        Entitlement.BASIC_EXAM,
        Entitlement.ICD10_DIAGNOSES,
    },
    "Plus": {
        Entitlement.SCHEDULING,
        Entitlement.PATIENT_DEMOGRAPHICS,
        Entitlement.BASIC_EXAM,
        Entitlement.ICD10_DIAGNOSES,
        Entitlement.BILLING_EXPORT,
        Entitlement.MULTI_PROVIDER,
        Entitlement.MESSAGING,
    },
    "Premium": {
        Entitlement.SCHEDULING,
        Entitlement.PATIENT_DEMOGRAPHICS,
        Entitlement.BASIC_EXAM,
        Entitlement.ICD10_DIAGNOSES,
        Entitlement.BILLING_EXPORT,
        Entitlement.MULTI_PROVIDER,
        Entitlement.AI_SCRIBE,
        Entitlement.ADVANCED_ANALYTICS,
        Entitlement.EQUIPMENT_IMPORT,
        Entitlement.MESSAGING,
    },
}


def has_entitlement(
    plan_name: str,
    key: str,
    *,
    addon_keys: set[str] | None = None,
) -> bool:
    """True if `key` is granted by the plan's PLAN_FEATURES OR by any tenant add-on.

    `addon_keys` is the set of `tenant_addons.feature_key` values for the caller's
    tenant, fetched once per request by `require_entitlement`. None or empty set
    means "no add-ons" (back-compat with existing 2-arg call sites in tests).
    """
    if key in PLAN_FEATURES.get(plan_name, set()):
        return True
    if addon_keys and key in addon_keys:
        return True
    return False


def require_entitlement(key: str):
    """FastAPI dependency factory — 403 unless caller's plan OR a tenant add-on grants `key`.

    Reads `public.tenant_addons` once per request to check for add-on grants
    (Phase 13 introduced `retail_pos` as the first true add-on, NOT bundled
    into Core/Plus/Premium PLAN_FEATURES).

    Back-compat: `db` is Optional with default None. In production FastAPI
    injects an AsyncSession via `Depends(get_db)`; in unit tests calling
    `await dep(ctx)` directly (no kwarg), `db` is None and the addon-lookup
    is skipped (treated as empty set). The 403 path is then identical to the
    pre-Phase-13 behaviour, preserving the existing
    `tests/messaging/test_routes_send.py` call shape verbatim.
    """
    # Normalize: Entitlement is a StrEnum, so str(key) yields the wire value.
    wire_key = str(key)

    async def _check(
        ctx: Annotated[TenantContext, Depends(get_current_tenant)],
        db: Annotated[AsyncSession | None, Depends(get_db)] = None,
    ) -> TenantContext:
        # Fast path: PLAN_FEATURES grants it — no DB roundtrip needed.
        if has_entitlement(ctx.plan_name, wire_key):
            return ctx

        # Slow path: check tenant_addons IFF a session was provided.
        addon_keys: set[str] = set()
        if db is not None:
            addon_keys = set(
                (
                    await db.execute(
                        select(TenantAddon.feature_key).where(
                            TenantAddon.tenant_id == ctx.tenant_id,
                        )
                    )
                ).scalars().all()
            )

        if has_entitlement(ctx.plan_name, wire_key, addon_keys=addon_keys):
            return ctx

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ENTITLEMENT_REQUIRED",
                "entitlement": wire_key,
                "plan": ctx.plan_name,
            },
        )

    return _check
