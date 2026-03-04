/**
 * hooks/useEntitlements.ts
 *
 * The primary feature-gating hook for the entire frontend.
 *
 * Reads the entitlements Set from the Zustand session store and exposes
 * a clean API for components to check access without touching the store directly.
 *
 * API:
 *   has(key)         → boolean: true if this tenant has the feature active
 *   hasAll(...keys)  → boolean: true if ALL listed features are active
 *   hasAny(...keys)  → boolean: true if ANY listed feature is active
 *   requireRole(...) → boolean: true if current user's role is in the allowed set
 *   planName         → string: the tenant's current plan ("Core" / "Plus" / "Premium")
 *   role             → StaffRole: the current user's role
 *   isSuperuser      → boolean
 *
 * Usage examples:
 *
 *   // Simple boolean gate
 *   const { has } = useEntitlements()
 *   if (has(Entitlement.AI_SCRIBE)) { ... }
 *
 *   // Conditional render with upsell fallback
 *   const { has } = useEntitlements()
 *   return has(Entitlement.AI_SCRIBE)
 *     ? <AiScribePanel />
 *     : <UpsellModal feature={Entitlement.AI_SCRIBE} />
 *
 *   // Role guard
 *   const { requireRole } = useEntitlements()
 *   const canFinalize = requireRole('doctor')
 *
 *   // Multiple feature check
 *   const { hasAll } = useEntitlements()
 *   const canExport = hasAll(Entitlement.BILLING_EXPORT, Entitlement.ICD10_DIAGNOSES)
 *
 * IMPORTANT: This hook never throws when the session is null.  It returns
 * safe "no access" defaults so components can render the upsell / login state
 * without conditional hook call violations.
 */

"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/store/sessionStore";
import type { EntitlementKey, StaffRole } from "@/types/session";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseEntitlementsReturn {
  /**
   * Check if the tenant has a single feature entitlement active.
   * Returns false if the session is null.
   *
   * @example
   *   const { has } = useEntitlements()
   *   const canUseAiScribe = has(Entitlement.AI_SCRIBE)
   */
  has: (key: EntitlementKey) => boolean;

  /**
   * Returns true only if ALL provided feature keys are active.
   * Short-circuits on the first missing key.
   *
   * @example
   *   hasAll(Entitlement.BILLING_EXPORT, Entitlement.ICD10_DIAGNOSES)
   */
  hasAll: (...keys: EntitlementKey[]) => boolean;

  /**
   * Returns true if ANY of the provided feature keys are active.
   *
   * @example
   *   hasAny(Entitlement.AI_SCRIBE, Entitlement.ADVANCED_ANALYTICS)
   */
  hasAny: (...keys: EntitlementKey[]) => boolean;

  /**
   * Returns true if the current user's role is in the allowed set.
   * Superusers always return true.
   *
   * @example
   *   const canFinalize = requireRole('doctor')
   *   const canEditVitals = requireRole('doctor', 'technician')
   */
  requireRole: (...allowedRoles: StaffRole[]) => boolean;

  /** The tenant's active subscription plan name */
  planName: string;

  /** The current user's staff role */
  role: StaffRole | null;

  /** Whether the current user has superuser access */
  isSuperuser: boolean;

  /** True if the session is loaded and not expired */
  isAuthenticated: boolean;

  /**
   * The complete entitlements Set — for advanced use cases where you need
   * to iterate or pass the entire set to a child component.
   * Prefer has() / hasAll() / hasAny() for individual checks.
   */
  entitlements: ReadonlySet<EntitlementKey>;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useEntitlements(): UseEntitlementsReturn {
  const session = useSessionStore((s) => s.session);

  return useMemo((): UseEntitlementsReturn => {
    // --- Safe defaults when no session exists ---
    if (!session) {
      const emptySet = new Set<EntitlementKey>() as ReadonlySet<EntitlementKey>;
      return {
        has: () => false,
        hasAll: () => false,
        hasAny: () => false,
        requireRole: () => false,
        planName: "",
        role: null,
        isSuperuser: false,
        isAuthenticated: false,
        entitlements: emptySet,
      };
    }

    const { user, tenant } = session;
    const entitlementSet = tenant.entitlements as ReadonlySet<EntitlementKey>;

    return {
      /**
       * O(1) Set lookup.
       * Superusers implicitly have all entitlements.
       */
      has: (key: EntitlementKey): boolean => {
        if (user.isSuperuser) return true;
        return entitlementSet.has(key);
      },

      hasAll: (...keys: EntitlementKey[]): boolean => {
        if (user.isSuperuser) return true;
        return keys.every((k) => entitlementSet.has(k));
      },

      hasAny: (...keys: EntitlementKey[]): boolean => {
        if (user.isSuperuser) return true;
        return keys.some((k) => entitlementSet.has(k));
      },

      requireRole: (...allowedRoles: StaffRole[]): boolean => {
        if (user.isSuperuser) return true;
        return (allowedRoles as string[]).includes(user.role);
      },

      planName: tenant.planName,
      role: user.role,
      isSuperuser: user.isSuperuser,
      isAuthenticated: true,
      entitlements: entitlementSet,
    };
  }, [session]);
}

// ---------------------------------------------------------------------------
// Convenience hook variants
// ---------------------------------------------------------------------------

/**
 * Returns true if the current user has the specified entitlement.
 * Thin wrapper around useEntitlements().has() for single-check use cases.
 *
 * @example
 *   const hasAiScribe = useHasEntitlement(Entitlement.AI_SCRIBE)
 */
export function useHasEntitlement(key: EntitlementKey): boolean {
  const { has } = useEntitlements();
  return has(key);
}

/**
 * Returns true if the current user's role is in the allowed set.
 *
 * @example
 *   const isDoctor = useRequireRole('doctor')
 */
export function useRequireRole(...allowedRoles: StaffRole[]): boolean {
  const { requireRole } = useEntitlements();
  return requireRole(...allowedRoles);
}
