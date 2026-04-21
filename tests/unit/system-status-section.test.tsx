/**
 * tests/unit/system-status-section.test.tsx
 *
 * Covers the SystemStatusSection composer:
 *   - renders three panels (Service Health, Recent Errors, Uptime & Deploy)
 *   - shows "Updated HH:MM:SS" timestamp
 *   - clicking Refresh re-invokes the fetches
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SystemStatusSection } from "@/components/admin/SystemStatusSection";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/health")) {
        return {
          ok: true,
          json: async () => ({
            api: "ok",
            postgres: { status: "ok", latencyMs: 3 },
            supabaseAuth: { status: "ok", latencyMs: 50 },
            version: "abc1234",
            checkedAt: new Date().toISOString(),
          }),
        };
      }
      if (url.includes("/errors")) {
        return {
          ok: true,
          json: async () => ({
            issues: [],
            fetchedAt: new Date().toISOString(),
            cached: false,
          }),
        };
      }
      if (url.includes("/uptime")) {
        return {
          ok: true,
          json: async () => ({
            uptimePct: 99.9,
            samplesTotal: 100,
            samplesGreen: 99,
            windowStart: new Date().toISOString(),
            windowEnd: new Date().toISOString(),
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SystemStatusSection", () => {
  it("renders three panels after fetch", async () => {
    render(<SystemStatusSection />);
    await waitFor(() => {
      expect(screen.getByText("Service Health")).toBeTruthy();
      expect(screen.getByText(/Recent Errors/)).toBeTruthy();
      expect(screen.getByText(/Uptime & Deploy/)).toBeTruthy();
    });
  });

  it("shows Updated timestamp and refreshes on click", async () => {
    render(<SystemStatusSection />);
    await waitFor(() =>
      expect(screen.getByTestId("system-status-updated").textContent).toMatch(/Updated/)
    );
    const initialCalls = (global.fetch as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => {
      const now = (global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls
        .length;
      expect(now).toBeGreaterThan(initialCalls);
    });
  });
});
