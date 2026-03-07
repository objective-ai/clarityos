/**
 * lib/auth/mock-session.ts
 *
 * DevMode role switcher — creates modified sessions for testing different
 * roles and plans while preserving the real auth token for API calls.
 *
 * REAL STAFF MAPPING (Sunview Eye Care):
 *   owner          → Duy Tran         (Premium, full access + admin)
 *   premium_doctor → Sarah Lin        (Premium, full clinical)
 *   technician     → Marcus Webb      (Premium, clinical staff — no AI, no billing)
 *   receptionist   → Emily Nguyen     (Premium, scheduling only)
 *   core_plan      → (mock) Doctor on Core plan — no real staff match
 *
 * switchDevRole() overlays the real session with the target role's
 * staff identity and permissions while keeping the real access token.
 */

import type {
  AppSession,
  EntitlementKey,
  PlanName,
  StaffRole,
} from "@/types/session";
import { Entitlement, PLAN_FEATURES } from "@/lib/entitlements";

// ---------------------------------------------------------------------------
// Sunview staff directory — matches seed data in the database
// ---------------------------------------------------------------------------

interface StaffProfile {
  staffId: string;
  fullName: string;
  email: string;
  role: StaffRole;
  clinicalRole?: StaffRole;
  planName: PlanName;
}

const SUNVIEW_STAFF: Record<string, StaffProfile> = {
  owner: {
    staffId: "c0000000-0000-0000-0000-000000000003",
    fullName: "Duy Tran",
    email: "duytran@yahoo.com",
    role: "owner",
    clinicalRole: "doctor",
    planName: "Premium",
  },
  premium_doctor: {
    staffId: "c0000000-0000-0000-0000-000000000001",
    fullName: "Sarah Lin",
    email: "sarah.lin@sunview.dev",
    role: "doctor",
    planName: "Premium",
  },
  technician: {
    staffId: "c0000000-0000-0000-0000-000000000002",
    fullName: "Marcus Webb",
    email: "marcus.webb@sunview.dev",
    role: "technician",
    planName: "Premium",
  },
  receptionist: {
    staffId: "c0000000-0000-0000-0000-000000000004",
    fullName: "Emily Nguyen",
    email: "emily.nguyen@sunview.dev",
    role: "receptionist",
    planName: "Premium",
  },
  core_plan: {
    staffId: "c0000000-0000-0000-0000-000000000099",
    fullName: "Core Doctor",
    email: "core.doctor@demo.dev",
    role: "doctor",
    planName: "Core",
  },
};

// Entitlements per role (what they can access)
const ROLE_ENTITLEMENTS: Record<string, EntitlementKey[]> = {
  owner: PLAN_FEATURES.Premium,
  premium_doctor: PLAN_FEATURES.Premium,
  technician: [
    Entitlement.SCHEDULING,
    Entitlement.PATIENT_DEMOGRAPHICS,
    Entitlement.BASIC_EXAM,
    Entitlement.ICD10_DIAGNOSES,
  ],
  receptionist: [
    Entitlement.SCHEDULING,
    Entitlement.PATIENT_DEMOGRAPHICS,
  ],
  core_plan: PLAN_FEATURES.Core,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rolePrefix(role: StaffRole, clinicalRole?: StaffRole): string {
  const effectiveRole = clinicalRole ?? role;
  return effectiveRole === "doctor" ? "Dr. " : "";
}

function buildInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type MockScenario =
  | "premium_doctor"   // Sarah Lin — full clinical access
  | "technician"       // Marcus Webb — clinical staff, no AI/billing
  | "core_plan"        // (mock) Doctor on Core plan — upsell modals visible
  | "receptionist"     // Emily Nguyen — scheduling only
  | "owner";           // Duy Tran — full access + admin

/**
 * Create a DevMode session by overlaying a real session with a different role.
 * Preserves the real access token so API calls still authenticate.
 */
export function switchDevRole(
  currentSession: AppSession,
  scenario: MockScenario
): AppSession {
  const staff = SUNVIEW_STAFF[scenario];
  const entitlements = ROLE_ENTITLEMENTS[scenario];
  const prefix = rolePrefix(staff.role, staff.clinicalRole);

  return {
    ...currentSession,
    user: {
      ...currentSession.user,
      staffId: staff.staffId,
      fullName: `${prefix}${staff.fullName}`,
      email: staff.email,
      role: staff.role,
      clinicalRole: staff.clinicalRole,
      isSuperuser: false,
      avatarInitials: buildInitials(staff.fullName),
    },
    tenant: {
      ...currentSession.tenant,
      planName: staff.planName,
      entitlements: new Set(entitlements),
    },
  };
}

/**
 * Returns a fully hydrated mock AppSession for development
 * when no real session is available (e.g., before auth).
 *
 * @param scenario - Which mock persona to use. Defaults to "owner".
 */
export function getMockSession(
  scenario: MockScenario = "owner"
): AppSession {
  const staff = SUNVIEW_STAFF[scenario];
  const entitlements = ROLE_ENTITLEMENTS[scenario];
  const prefix = rolePrefix(staff.role, staff.clinicalRole);

  return {
    user: {
      userId: "00000000-0000-0000-0000-000000000000",
      staffId: staff.staffId,
      email: staff.email,
      fullName: `${prefix}${staff.fullName}`,
      role: staff.role,
      clinicalRole: staff.clinicalRole,
      isSuperuser: false,
      avatarInitials: buildInitials(staff.fullName),
    },
    tenant: {
      tenantId: "b0000000-0000-0000-0000-000000000001",
      tenantSlug: "sunview",
      schemaName: "clinic_sunview",
      clinicName: "Sunview Eye Care",
      planName: staff.planName,
      entitlements: new Set(entitlements),
    },
    accessToken: "mock-token",
    expiresAt: new Date(Date.now() + 3600_000),
  };
}

