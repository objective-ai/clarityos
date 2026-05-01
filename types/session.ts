/**
 * types/session.ts
 *
 * TypeScript mirrors of the Python backend's TenantContext and UserContext
 * dataclasses (app/dependencies/auth.py).
 *
 * These types describe the decoded JWT payload shape.  The backend mints this
 * token at login and the frontend reads it on every render cycle via the
 * useSession hook and Zustand store.
 *
 * Keeping these in sync with the Python side is critical — if the backend adds
 * a new field to the JWT payload, it must be reflected here.  In a mature
 * codebase this would be auto-generated from the OpenAPI spec.
 *
 * Feature key strings must match app/core/entitlements.py exactly.
 */

// ---------------------------------------------------------------------------
// Entitlement key type — exhaustive union of all possible feature strings
// ---------------------------------------------------------------------------

export type EntitlementKey =
  // Core — all paid plans
  | "scheduling"
  | "patient_demographics"
  | "basic_exam"
  | "icd10_diagnoses"
  // Plus tier
  | "billing_export"
  | "multi_provider"
  // Premium / add-ons
  | "ai_scribe"
  | "advanced_analytics"
  | "equipment_import"
  // Internal
  | "super_admin"
  // System / admin (role-derived; OWNER-only)
  | "view_system_status"
  // CRM (Phase 12)
  | "messaging"
  // Retail & POS (Phase 13 + Phase 15) — bundled add-on
  | "retail_pos";

// ---------------------------------------------------------------------------
// Staff role — mirrors Python StaffRole enum
// ---------------------------------------------------------------------------

export type StaffRole =
  | "doctor"
  | "technician"
  | "receptionist"
  | "admin"
  | "owner";

// ---------------------------------------------------------------------------
// Plan names — mirrors SubscriptionPlan.name values
// ---------------------------------------------------------------------------

export type PlanName = "Core" | "Plus" | "Premium" | (string & {});

// ---------------------------------------------------------------------------
// Decoded JWT payload shape (what's baked into the token at login)
// ---------------------------------------------------------------------------

export interface JwtPayload {
  /** GlobalUser.id — the primary auth identity */
  sub: string;
  /** Tenant.id */
  tenant_id: string;
  /** PostgreSQL schema name (e.g. "clinic_a3f9b2") */
  schema_name: string;
  /** Staff role within this clinic */
  role: StaffRole;
  /** Clinical role if the owner also practices (e.g. owner-OD) */
  clinical_role?: StaffRole;
  /** Union of plan base features + active add-ons */
  entitlements: EntitlementKey[];
  /** Whether this user has cross-tenant superuser access */
  is_superuser: boolean;
  /** JWT standard claims */
  iat: number;
  exp: number;
}

// ---------------------------------------------------------------------------
// Application-level session objects (hydrated from JWT + any extra DB fields)
// ---------------------------------------------------------------------------

export interface TenantSession {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  clinicName: string;
  planName: PlanName;
  /** Set — O(1) lookup via .has() */
  entitlements: Set<EntitlementKey>;
}

export interface UserSession {
  userId: string;
  staffId: string;
  email: string;
  fullName: string;
  role: StaffRole;
  /** Set when owner is also a clinician — RBAC checks both role and clinicalRole */
  clinicalRole?: StaffRole;
  isSuperuser: boolean;
  avatarInitials: string;
}

/** The complete session context available to all authenticated components */
export interface AppSession {
  user: UserSession;
  tenant: TenantSession;
  /** Raw JWT string — attached to every API request as Bearer token */
  accessToken: string;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Medical alert types for PatientStickyHeader
// ---------------------------------------------------------------------------

export type AlertSeverity = "critical" | "warning" | "info";

export interface PatientAlert {
  id: string;
  severity: AlertSeverity;
  label: string;
}

// ---------------------------------------------------------------------------
// Abbreviated patient shape for the sticky header
// ---------------------------------------------------------------------------

export interface PatientHeaderData {
  id: string;
  chartNumber?: number;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  dob: string; // ISO date string
  sex: "male" | "female" | "other" | "prefer_not_to_say";
  alerts: PatientAlert[];
}
