/**
 * lib/auth/mock-session.ts
 *
 * Mock session data for development — mirrors the Python backend's
 * MOCK_TENANT and MOCK_DOCTOR_USER constants in app/dependencies/auth.py.
 *
 * This module provides:
 *   1. A realistic mock JWT payload (what the decoded token looks like)
 *   2. Hydrated AppSession objects for different role scenarios
 *   3. A getMockSession() factory for use in the Zustand store
 *
 * HOW MOCK → REAL AUTH SWAP WORKS:
 *   Development : sessionStore.ts initializes with getMockSession()
 *   Production  : After /api/v1/global/auth/login succeeds, the store is
 *                 initialized with hydrateSession(jwtString) which decodes
 *                 the real token and calls the same AppSession constructor.
 *   Components never know which one is active.
 *
 * TESTING DIFFERENT ROLES:
 *   Pass a MockScenario key to getMockSession() to simulate role-gated flows:
 *     getMockSession("technician")  → no ai_scribe, no finalizeEncounter
 *     getMockSession("core_plan")   → basic features only, upsell modals visible
 *     getMockSession("receptionist") → scheduling only
 */

import type { AppSession, EntitlementKey, JwtPayload } from "@/types/session";
import { Entitlement } from "@/lib/entitlements";

// ---------------------------------------------------------------------------
// Mock JWT payloads (what a decoded token looks like per scenario)
// ---------------------------------------------------------------------------

const PREMIUM_DOCTOR_JWT: JwtPayload = {
  sub: "00000000-0000-0000-0000-000000000003",
  tenant_id: "00000000-0000-0000-0000-000000000001",
  schema_name: "clinic_demo_01",
  role: "doctor",
  entitlements: [
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
  is_superuser: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const TECHNICIAN_JWT: JwtPayload = {
  ...PREMIUM_DOCTOR_JWT,
  sub: "00000000-0000-0000-0000-000000000004",
  role: "technician",
  // Technicians don't get AI scribe or advanced analytics
  entitlements: [
    Entitlement.SCHEDULING,
    Entitlement.PATIENT_DEMOGRAPHICS,
    Entitlement.BASIC_EXAM,
    Entitlement.ICD10_DIAGNOSES,
  ],
};

const CORE_PLAN_DOCTOR_JWT: JwtPayload = {
  ...PREMIUM_DOCTOR_JWT,
  entitlements: [
    Entitlement.SCHEDULING,
    Entitlement.PATIENT_DEMOGRAPHICS,
    Entitlement.BASIC_EXAM,
    Entitlement.ICD10_DIAGNOSES,
  ],
};

const RECEPTIONIST_JWT: JwtPayload = {
  ...PREMIUM_DOCTOR_JWT,
  sub: "00000000-0000-0000-0000-000000000005",
  role: "receptionist",
  entitlements: [Entitlement.SCHEDULING, Entitlement.PATIENT_DEMOGRAPHICS],
};

const OWNER_JWT: JwtPayload = {
  ...PREMIUM_DOCTOR_JWT,
  sub: "00000000-0000-0000-0000-000000000006",
  role: "owner",
  clinical_role: "doctor",
};

// ---------------------------------------------------------------------------
// Session hydration — converts a JWT payload into an AppSession
// ---------------------------------------------------------------------------

function hydrateSession(payload: JwtPayload, accessToken: string): AppSession {
  const roleLabels: Record<string, string> = {
    doctor: "Dr.",
    technician: "",
    receptionist: "",
    admin: "",
    owner: "",
  };

  const fullNames: Record<string, string> = {
    "00000000-0000-0000-0000-000000000003": "Alex Morgan",
    "00000000-0000-0000-0000-000000000004": "Sam Rivera",
    "00000000-0000-0000-0000-000000000005": "Jordan Lee",
    "00000000-0000-0000-0000-000000000006": "Casey Patel",
  };

  const rawName = fullNames[payload.sub] ?? "Demo User";
  // Use clinical role for title prefix (owner-OD gets "Dr." even though their role is "owner")
  const effectiveRole = payload.clinical_role ?? payload.role;
  const prefix = roleLabels[effectiveRole] ?? "";
  const fullName = prefix ? `${prefix} ${rawName}` : rawName;
  const initials = rawName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return {
    user: {
      userId: payload.sub,
      staffId: `staff-${payload.sub.slice(-8)}`,
      email: `${payload.role}@demo-clinic.dev`,
      fullName,
      role: payload.role,
      clinicalRole: payload.clinical_role,
      isSuperuser: payload.is_superuser,
      avatarInitials: initials,
    },
    tenant: {
      tenantId: payload.tenant_id,
      schemaName: payload.schema_name,
      clinicName: "Sunview Eye Care",
      planName:
        payload.entitlements.includes(Entitlement.AI_SCRIBE)
          ? "Premium"
          : payload.entitlements.includes(Entitlement.BILLING_EXPORT)
          ? "Plus"
          : "Core",
      entitlements: new Set(payload.entitlements as EntitlementKey[]),
    },
    accessToken,
    expiresAt: new Date(payload.exp * 1000),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type MockScenario =
  | "premium_doctor"   // Full access — all features active
  | "technician"       // Clinical staff — no AI, no billing
  | "core_plan"        // Core plan only — upsell modals visible for premium features
  | "receptionist"     // Scheduling only
  | "owner";           // Full access + admin/staff management

const SCENARIO_JWTS: Record<MockScenario, JwtPayload> = {
  premium_doctor: PREMIUM_DOCTOR_JWT,
  technician: TECHNICIAN_JWT,
  core_plan: CORE_PLAN_DOCTOR_JWT,
  receptionist: RECEPTIONIST_JWT,
  owner: OWNER_JWT,
};

/**
 * Returns a fully hydrated mock AppSession for development.
 *
 * @param scenario - Which mock persona to use. Defaults to "premium_doctor".
 *
 * Usage in sessionStore.ts:
 *   const session = getMockSession("core_plan"); // test upsell flows
 */
export function getMockSession(
  scenario: MockScenario = "premium_doctor"
): AppSession {
  const payload = SCENARIO_JWTS[scenario];
  // In real auth, this would be the raw JWT string from the login response.
  const mockToken = `mock.${btoa(JSON.stringify(payload))}.signature`;
  return hydrateSession(payload, mockToken);
}

/**
 * Hydrates a real JWT string into an AppSession.
 * Used when the production auth flow replaces the mock.
 *
 * @param jwtString - Raw JWT from Authorization header / cookie
 */
export function hydrateRealSession(jwtString: string): AppSession {
  // Decode payload (middle segment of "header.payload.signature")
  const segments = jwtString.split(".");
  if (segments.length !== 3) throw new Error("Invalid JWT format");

  const payloadJson = atob(segments[1].replace(/-/g, "+").replace(/_/g, "/"));
  const payload = JSON.parse(payloadJson) as JwtPayload;

  return hydrateSession(payload, jwtString);
}
