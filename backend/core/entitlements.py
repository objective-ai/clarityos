"""
core/entitlements.py

Feature entitlement keys — mirrors frontend lib/entitlements.ts.
"""

from enum import StrEnum


class Entitlement(StrEnum):
    SCHEDULING = "SCHEDULING"
    PATIENT_DEMOGRAPHICS = "PATIENT_DEMOGRAPHICS"
    BASIC_EXAM = "BASIC_EXAM"
    ICD10_DIAGNOSES = "ICD10_DIAGNOSES"
    BILLING_EXPORT = "BILLING_EXPORT"
    MULTI_PROVIDER = "MULTI_PROVIDER"
    AI_SCRIBE = "AI_SCRIBE"
    ADVANCED_ANALYTICS = "ADVANCED_ANALYTICS"
    # CRM (Phase 12) — patient messaging (SMS + email reminders, recall, manual,
    # inbound triage). Lowercase wire key 'messaging' is what the JWT hook /
    # PLAN_FEATURES (lib/entitlements.ts) references; included in Plus + Premium.
    MESSAGING = "MESSAGING"
