"""
core/entitlements.py

Feature entitlement keys — mirrors frontend lib/entitlements.ts.

`require_entitlement(key)` is a FastAPI dependency factory that maps the
caller's `plan_name` (Core/Plus/Premium) to the set of entitlements granted by
that plan, and raises 403 if the requested key is missing.

Plan → entitlements mapping is the source of truth on the backend; the JWT
hook only injects `plan_name`. Keep PLAN_FEATURES below in sync with
`lib/entitlements.ts` (frontend mirror).
"""
from __future__ import annotations

from enum import StrEnum
from typing import Annotated

from fastapi import Depends, HTTPException, status

from backend.core.security import TenantContext, get_current_tenant


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
    # Billing-layer concern lives in subscription_plans (out of scope here).
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


def has_entitlement(plan_name: str, key: str) -> bool:
    return key in PLAN_FEATURES.get(plan_name, set())


def require_entitlement(key: str):
    """FastAPI dependency factory — 403 unless caller's plan grants `key`."""

    async def _check(
        ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    ) -> TenantContext:
        if not has_entitlement(ctx.plan_name, key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "ENTITLEMENT_REQUIRED",
                    "entitlement": key,
                    "plan": ctx.plan_name,
                },
            )
        return ctx

    return _check
