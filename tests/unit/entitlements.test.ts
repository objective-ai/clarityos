/**
 * tests/unit/entitlements.test.ts
 *
 * Covers the `view_system_status` entitlement — OWNER-only, role-derived
 * (bypasses the plan-feature Set). Verifies useEntitlements().has('view_system_status')
 * returns true for OWNER and false for every other role.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useSessionStore } from "@/store/sessionStore";
import type { AppSession, StaffRole, EntitlementKey } from "@/types/session";

function buildSession(role: StaffRole): AppSession {
  return {
    user: {
      userId: "user-1",
      staffId: "staff-1",
      email: "u@example.com",
      fullName: "Test User",
      role,
      isSuperuser: false,
      avatarInitials: "TU",
    },
    tenant: {
      tenantId: "tenant-1",
      tenantSlug: "sunview",
      schemaName: "clinic_sunview",
      clinicName: "Sunview Optometry",
      planName: "Core",
      // No 'view_system_status' in the set — must come purely from role
      entitlements: new Set<EntitlementKey>([
        "scheduling",
        "patient_demographics",
        "basic_exam",
        "icd10_diagnoses",
      ]),
    },
    accessToken: "test-token",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  };
}

describe("view_system_status entitlement (OWNER-only, role-derived)", () => {
  beforeEach(() => {
    useSessionStore.setState({ session: null, isLoading: false });
  });

  it("owner has view_system_status", () => {
    useSessionStore.setState({ session: buildSession("owner"), isLoading: false });
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.has("view_system_status")).toBe(true);
  });

  it.each<StaffRole>(["doctor", "technician", "receptionist", "admin"])(
    "%s does NOT have view_system_status",
    (role) => {
      useSessionStore.setState({ session: buildSession(role), isLoading: false });
      const { result } = renderHook(() => useEntitlements());
      expect(result.current.has("view_system_status")).toBe(false);
    }
  );

  it("null session → false", () => {
    useSessionStore.setState({ session: null, isLoading: false });
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.has("view_system_status")).toBe(false);
  });

  it("superuser non-owner still gets true (superuser bypass)", () => {
    const s = buildSession("doctor");
    s.user.isSuperuser = true;
    useSessionStore.setState({ session: s, isLoading: false });
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.has("view_system_status")).toBe(true);
  });
});
