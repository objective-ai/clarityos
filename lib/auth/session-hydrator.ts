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
  const meta = user.app_metadata ?? {};
  const userMeta = user.user_metadata ?? {};

  const fullName: string =
    userMeta.full_name ?? userMeta.name ?? meta.full_name ?? user.email ?? "";
  const email: string = user.email ?? "";

  const role: StaffRole = meta.role ?? "doctor";
  const entitlements: EntitlementKey[] = meta.entitlements ?? [];

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
      tenantId: meta.tenant_id ?? "demo-clinic",
      schemaName: meta.schema_name ?? "public",
      clinicName: meta.clinic_name ?? "ClarityOS Clinic",
      planName: (meta.plan_name ?? "Core") as PlanName,
      entitlements: new Set(entitlements),
    },
    accessToken: session.access_token,
    expiresAt: new Date(session.expires_at! * 1000),
  };
}
