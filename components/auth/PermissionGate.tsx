"use client";

import type { ReactNode } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";
import type { StaffRole } from "@/types/session";

interface PermissionGateProps {
  /** Roles allowed to see/interact with the children. */
  roles: StaffRole[];
  children: ReactNode;
  /** What to render when the user lacks access (default: nothing). */
  fallback?: ReactNode;
  /**
   * - "hide" (default): removes children from the DOM entirely.
   * - "disable": renders children but visually disabled (opacity + pointer-events-none).
   */
  mode?: "hide" | "disable";
}

/**
 * Declarative role gate for clinical UI elements.
 *
 * @example
 *   <PermissionGate roles={["doctor", "owner"]}>
 *     <button onClick={finalize}>Sign & Finalize</button>
 *   </PermissionGate>
 *
 * @example
 *   <PermissionGate roles={["doctor", "technician", "owner"]} mode="disable">
 *     <VitalsForm />
 *   </PermissionGate>
 */
export function PermissionGate({
  roles,
  children,
  fallback,
  mode = "hide",
}: PermissionGateProps) {
  const { requireRole } = useEntitlements();
  const allowed = requireRole(...roles);

  if (!allowed) {
    if (mode === "disable") {
      return (
        <div className="opacity-50 pointer-events-none select-none" aria-disabled="true">
          {children}
        </div>
      );
    }
    return <>{fallback ?? null}</>;
  }

  return <>{children}</>;
}
