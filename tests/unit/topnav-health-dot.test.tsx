/**
 * tests/unit/topnav-health-dot.test.tsx
 *
 * Covers the OWNER-only TopNav HealthDot:
 *   - renders null for non-owner sessions
 *   - dot color maps from health rollup (green/amber/red)
 *   - click navigates to /{tenant}/admin?section=system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HealthDot } from "@/components/topnav/HealthDot";
import { useSessionStore } from "@/store/sessionStore";
import type { AppSession, StaffRole, EntitlementKey } from "@/types/session";

// Router mock — override the default useRouter from tests/setup.ts so we can
// assert push() calls. useParams already resolves to { tenant: "sunview" }.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ tenant: "sunview" }),
  usePathname: () => "/sunview/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

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
      entitlements: new Set<EntitlementKey>([]),
    },
    accessToken: "t",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  };
}

type StatusLevel = "ok" | "degraded" | "down";

function stubHealthFetch(level: StatusLevel | "allOk") {
  const body = {
    api: "ok" as const,
    postgres: {
      status: level === "allOk" ? "ok" : level,
      latencyMs: 1,
    },
    supabaseAuth: { status: "ok", latencyMs: 1 },
    version: "abc1234",
    checkedAt: new Date().toISOString(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => body }))
  );
}

beforeEach(() => {
  pushMock.mockReset();
  useSessionStore.setState({ session: null, isLoading: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HealthDot", () => {
  it("renders null for non-owner (doctor)", () => {
    useSessionStore.setState({ session: buildSession("doctor"), isLoading: false });
    stubHealthFetch("allOk");
    const { container } = render(<HealthDot />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null for technician", () => {
    useSessionStore.setState({
      session: buildSession("technician"),
      isLoading: false,
    });
    stubHealthFetch("allOk");
    const { container } = render(<HealthDot />);
    expect(container.firstChild).toBeNull();
  });

  it("renders green dot for owner + all ok", async () => {
    useSessionStore.setState({ session: buildSession("owner"), isLoading: false });
    stubHealthFetch("allOk");
    render(<HealthDot />);
    await waitFor(() => {
      const span = screen.getByTestId("health-dot").querySelector("span");
      expect(span?.className).toMatch(/bg-\[#2DD4BF\]/);
    });
  });

  it("renders amber dot for owner + degraded", async () => {
    useSessionStore.setState({ session: buildSession("owner"), isLoading: false });
    stubHealthFetch("degraded");
    render(<HealthDot />);
    await waitFor(() => {
      const span = screen.getByTestId("health-dot").querySelector("span");
      expect(span?.className).toMatch(/bg-amber-400/);
    });
  });

  it("renders red dot for owner + down", async () => {
    useSessionStore.setState({ session: buildSession("owner"), isLoading: false });
    stubHealthFetch("down");
    render(<HealthDot />);
    await waitFor(() => {
      const span = screen.getByTestId("health-dot").querySelector("span");
      expect(span?.className).toMatch(/bg-red-500/);
    });
  });

  it("click navigates to /{tenant}/admin?section=system", async () => {
    useSessionStore.setState({ session: buildSession("owner"), isLoading: false });
    stubHealthFetch("allOk");
    render(<HealthDot />);
    const btn = await screen.findByTestId("health-dot");
    fireEvent.click(btn);
    expect(pushMock).toHaveBeenCalledWith("/sunview/admin?section=system");
  });
});
