/**
 * lib/auth/session-hydrator.ts
 *
 * Maps a Supabase Auth Session to the application's AppSession type.
 * Extracts tenant context, role, entitlements, and user profile from
 * JWT app_metadata and user_metadata claims.
 */

import type { Session } from "@supabase/supabase-js";
import type {
  AppSession,
  EntitlementKey,
  PlanName,
  StaffRole,
} from "@/types/session";
import { PLAN_FEATURES } from "@/lib/entitlements";

// Module-level guard so the diagnostic warn fires at most once per session.
// HMR + React Strict Mode + repeated session refreshes can call
// hydrateFromSupabaseSession many times — we want one signal, not spam.
let __planFeaturesFallbackWarned = false;

/**
 * Decode the JWT payload (middle segment) without verifying the signature.
 * The session-hydrator runs only after Supabase JS has already validated the
 * token, so this is safe — we only need to read the claims.
 *
 * Why parse the JWT instead of trusting `session.user.app_metadata`?
 *   The Supabase auth-token cookie carries TWO copies of app_metadata:
 *   (1) the JWT's `app_metadata` claim (set by custom_access_token_hook at
 *       mint time — this is where `entitlements` lives), and
 *   (2) the envelope's `user.app_metadata` (a snapshot of
 *       `auth.users.raw_app_meta_data` at sign-in, which only contains the
 *       fields seeded by bootstrap_user.py and never gets `entitlements`).
 *   `supabase.auth.getSession()` returns (2), not (1). So we decode the JWT
 *   ourselves to get the hook-computed entitlements.
 */
function decodeJwtAppMetadata(accessToken: string | undefined): Record<string, unknown> | null {
  if (!accessToken) return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf-8");
    const payload = JSON.parse(json) as { app_metadata?: Record<string, unknown> };
    return payload.app_metadata ?? null;
  } catch {
    return null;
  }
}

/**
 * Build avatar initials from a name or email.
 * Takes first letter of each word (max 2 chars), uppercased.
 * Falls back to first letter of email if no name.
 */
function buildInitials(fullName: string | undefined, email: string): string {
  if (fullName && fullName.trim().length > 0) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

/**
 * Hydrate an AppSession from a Supabase Auth Session.
 *
 * Expected JWT app_metadata shape (set by Custom Access Token Hook):
 * {
 *   tenant_id: string,
 *   staff_id: string,
 *   role: StaffRole,
 *   schema_name: string,
 *   clinic_name: string,
 *   plan_name: PlanName,
 *   entitlements: EntitlementKey[],
 *   clinical_role?: StaffRole,
 *   is_superuser?: boolean,
 * }
 */
export function hydrateFromSupabaseSession(session: Session): AppSession {
  const { user } = session;
  const jwtMeta = decodeJwtAppMetadata(session.access_token);
  // Prefer JWT app_metadata (server-authoritative, includes hook-computed
  // entitlements) over user.app_metadata (database snapshot of
  // auth.users.raw_app_meta_data, which never carries entitlements).
  // Merge so any field present only in user.app_metadata still resolves.
  const meta = { ...(user.app_metadata ?? {}), ...(jwtMeta ?? {}) };
  const userMeta = user.user_metadata ?? {};

  const fullName: string =
    userMeta.full_name || userMeta.name || meta.full_name || user.email || "";
  const email: string = user.email ?? "";

  const role: StaffRole = meta.role ?? "doctor";
  const planName = (meta.plan_name ?? "Core") as PlanName;

  // If the JWT hook doesn't inject entitlements, derive from plan name
  const rawEntitlements: EntitlementKey[] = meta.entitlements ?? [];
  let entitlements: EntitlementKey[];
  if (rawEntitlements.length > 0) {
    entitlements = rawEntitlements;
  } else {
    entitlements = PLAN_FEATURES[planName] ?? [];
    if (!__planFeaturesFallbackWarned) {
      __planFeaturesFallbackWarned = true;
      // Diagnostic only — not an error. Saves ~30 min on the next recurrence
      // of the silent-fallback chain (see debugging_supabase_jwt_entitlements.md).
      // eslint-disable-next-line no-console
      console.warn(
        `[session-hydrator] No entitlements in JWT app_metadata; falling back to PLAN_FEATURES[${planName}]. ` +
        `If RETAIL_POS or other add-ons are missing, walk the chain at debugging_supabase_jwt_entitlements.md.`
      );
    }
  }

  // Fail loudly if tenant claims are missing — JWT hook must be enabled
  if (!meta.tenant_id || !meta.tenant_slug || !meta.schema_name) {
    throw new Error(
      "Missing tenant claims in JWT. Ensure custom_access_token_hook is enabled in Supabase Dashboard."
    );
  }

  return {
    user: {
      userId: user.id,
      staffId: meta.staff_id ?? user.id,
      email,
      fullName,
      role,
      clinicalRole: meta.clinical_role as StaffRole | undefined,
      isSuperuser: meta.is_superuser ?? false,
      avatarInitials: buildInitials(fullName, email),
    },
    tenant: {
      tenantId: meta.tenant_id,
      tenantSlug: meta.tenant_slug,
      schemaName: meta.schema_name,
      clinicName: meta.clinic_name ?? meta.tenant_slug,
      planName,
      entitlements: new Set(entitlements),
    },
    accessToken: session.access_token,
    expiresAt: new Date(session.expires_at! * 1000),
  };
}

/** Test-only: resets the once-per-session warn guard. Do not call from app code. */
export function __resetPlanFeaturesFallbackWarnedForTest(): void {
  __planFeaturesFallbackWarned = false;
}
