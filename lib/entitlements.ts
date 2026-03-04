/**
 * lib/entitlements.ts
 *
 * TypeScript mirror of app/core/entitlements.py.
 *
 * These string constants are the single source of truth for feature keys on
 * the frontend.  Every call to useEntitlements().has(...) should reference
 * a constant from this object rather than an inline string literal.
 *
 * This prevents typo bugs like "ai-scribe" vs "ai_scribe" from silently
 * granting or denying access without a type error.
 *
 * Usage:
 *   import { Entitlement } from '@/lib/entitlements'
 *   const { has } = useEntitlements()
 *   if (has(Entitlement.AI_SCRIBE)) { ... }
 */

import type { EntitlementKey } from "@/types/session";

// ---------------------------------------------------------------------------
// Entitlement key constants
// ---------------------------------------------------------------------------

export const Entitlement = {
  // ---- Core (all paid plans) ----
  SCHEDULING: "scheduling" as const,
  PATIENT_DEMOGRAPHICS: "patient_demographics" as const,
  BASIC_EXAM: "basic_exam" as const,
  ICD10_DIAGNOSES: "icd10_diagnoses" as const,

  // ---- Plus tier ----
  BILLING_EXPORT: "billing_export" as const,
  MULTI_PROVIDER: "multi_provider" as const,

  // ---- Premium / purchasable add-ons ----
  AI_SCRIBE: "ai_scribe" as const,
  ADVANCED_ANALYTICS: "advanced_analytics" as const,
  EQUIPMENT_IMPORT: "equipment_import" as const,

  // ---- Internal ----
  SUPER_ADMIN: "super_admin" as const,
} satisfies Record<string, EntitlementKey>;

// ---------------------------------------------------------------------------
// Plan → feature mapping (mirrors subscription_plans.base_features_jsonb)
// Used in the upsell modal to describe what a plan includes.
// ---------------------------------------------------------------------------

export const PLAN_FEATURES: Record<string, EntitlementKey[]> = {
  Core: [
    Entitlement.SCHEDULING,
    Entitlement.PATIENT_DEMOGRAPHICS,
    Entitlement.BASIC_EXAM,
    Entitlement.ICD10_DIAGNOSES,
  ],
  Plus: [
    Entitlement.SCHEDULING,
    Entitlement.PATIENT_DEMOGRAPHICS,
    Entitlement.BASIC_EXAM,
    Entitlement.ICD10_DIAGNOSES,
    Entitlement.BILLING_EXPORT,
    Entitlement.MULTI_PROVIDER,
  ],
  Premium: [
    Entitlement.SCHEDULING,
    Entitlement.PATIENT_DEMOGRAPHICS,
    Entitlement.BASIC_EXAM,
    Entitlement.ICD10_DIAGNOSES,
    Entitlement.BILLING_EXPORT,
    Entitlement.MULTI_PROVIDER,
    Entitlement.AI_SCRIBE,
    Entitlement.ADVANCED_ANALYTICS,
    Entitlement.EQUIPMENT_IMPORT,
  ],
};

// ---------------------------------------------------------------------------
// Human-readable feature descriptions (for the upsell modal UI)
// ---------------------------------------------------------------------------

export const ENTITLEMENT_META: Record<
  EntitlementKey,
  { label: string; description: string; plan: "Core" | "Plus" | "Premium" | "Add-on" }
> = {
  scheduling: {
    label: "Scheduling",
    description: "Appointment calendar, patient check-in, and reminders.",
    plan: "Core",
  },
  patient_demographics: {
    label: "Patient Records",
    description: "Demographics, medical history, and contact management.",
    plan: "Core",
  },
  basic_exam: {
    label: "Clinical Exam",
    description: "Full encounter workflow: vitals, refractions, findings.",
    plan: "Core",
  },
  icd10_diagnoses: {
    label: "ICD-10 Diagnoses",
    description: "Attach medical billing codes to encounters.",
    plan: "Core",
  },
  billing_export: {
    label: "Billing Export",
    description: "Export encounter data for insurance claim submission.",
    plan: "Plus",
  },
  multi_provider: {
    label: "Multi-Provider",
    description: "Manage schedules and records across multiple doctors.",
    plan: "Plus",
  },
  ai_scribe: {
    label: "AI Scribe",
    description:
      "AI-generated SOAP notes and visit summaries. Saves 12–15 minutes per exam.",
    plan: "Premium",
  },
  advanced_analytics: {
    label: "Advanced Analytics",
    description: "Prescription trend analysis, patient retention metrics, revenue dashboards.",
    plan: "Premium",
  },
  equipment_import: {
    label: "Equipment Import",
    description: "Auto-import readings from autorefractors and OCT machines.",
    plan: "Add-on",
  },
  super_admin: {
    label: "Super Admin",
    description: "Internal cross-tenant support access.",
    plan: "Add-on",
  },
};
