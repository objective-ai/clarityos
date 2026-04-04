/**
 * lib/scheduleUtils.test.ts
 *
 * Unit tests for schedule utility functions.
 * Run: npx vitest run lib/scheduleUtils.test.ts --reporter=verbose
 */

import { describe, it, expect } from "vitest";
import {
  getWeekDays,
  getWaitMinutes,
  getWaitColor,
  getRoleDefaultView,
  isSlotOccupied,
} from "./scheduleUtils";

// ---------------------------------------------------------------------------
// getWeekDays
// ---------------------------------------------------------------------------

describe("getWeekDays", () => {
  it("returns 7 strings starting Monday for a Monday input", () => {
    const days = getWeekDays("2026-04-06"); // Monday
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-04-06"); // Mon
    expect(days[6]).toBe("2026-04-12"); // Sun
  });

  it("returns the same week Mon-Sun for a Wednesday input", () => {
    const days = getWeekDays("2026-04-08"); // Wednesday
    expect(days[0]).toBe("2026-04-06"); // Mon
    expect(days[6]).toBe("2026-04-12"); // Sun
  });

  it("returns the same week Mon-Sun for a Sunday input", () => {
    const days = getWeekDays("2026-04-12"); // Sunday
    expect(days[0]).toBe("2026-04-06"); // Mon
    expect(days[6]).toBe("2026-04-12"); // Sun
  });

  it("returns consecutive days with no gaps", () => {
    const days = getWeekDays("2026-04-07");
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1] + "T12:00:00");
      const curr = new Date(days[i] + "T12:00:00");
      expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("handles month boundary correctly", () => {
    // 2026-03-30 is a Monday
    const days = getWeekDays("2026-04-01"); // Wednesday
    expect(days[0]).toBe("2026-03-30"); // Mon
    expect(days[6]).toBe("2026-04-05"); // Sun
  });
});

// ---------------------------------------------------------------------------
// getWaitMinutes
// ---------------------------------------------------------------------------

describe("getWaitMinutes", () => {
  it("returns null for status scheduled", () => {
    const result = getWaitMinutes({
      status: "scheduled",
      startTime: new Date().toISOString(),
    });
    expect(result).toBeNull();
  });

  it("returns null for status confirmed", () => {
    const result = getWaitMinutes({
      status: "confirmed",
      startTime: new Date().toISOString(),
    });
    expect(result).toBeNull();
  });

  it("returns null for status cancelled", () => {
    const result = getWaitMinutes({
      status: "cancelled",
      startTime: new Date().toISOString(),
    });
    expect(result).toBeNull();
  });

  it("returns null for status no_show", () => {
    const result = getWaitMinutes({
      status: "no_show",
      startTime: new Date().toISOString(),
    });
    expect(result).toBeNull();
  });

  it("returns positive number for arrived with startTime 20 minutes ago", () => {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const now = new Date();
    const result = getWaitMinutes(
      { status: "arrived", startTime: twentyMinutesAgo },
      now
    );
    expect(result).toBeGreaterThanOrEqual(20);
    expect(result).toBeLessThan(22);
  });

  it("returns positive number for in_pretest status", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const now = new Date();
    const result = getWaitMinutes(
      { status: "in_pretest", startTime: tenMinutesAgo },
      now
    );
    expect(result).toBeGreaterThanOrEqual(10);
  });

  it("returns positive number for in_exam status", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const now = new Date();
    const result = getWaitMinutes(
      { status: "in_exam", startTime: fiveMinutesAgo },
      now
    );
    expect(result).toBeGreaterThanOrEqual(5);
  });

  it("returns null for completed status", () => {
    const result = getWaitMinutes({
      status: "completed",
      startTime: new Date().toISOString(),
    });
    expect(result).toBeNull();
  });

  it("returns null for finalized status", () => {
    const result = getWaitMinutes({
      status: "finalized",
      startTime: new Date().toISOString(),
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getWaitColor
// ---------------------------------------------------------------------------

describe("getWaitColor", () => {
  it("returns null for null waitMinutes", () => {
    expect(getWaitColor(null)).toBeNull();
  });

  it("returns null for 10 minutes (under threshold)", () => {
    expect(getWaitColor(10)).toBeNull();
  });

  it("returns null for 15 minutes (at threshold, not over)", () => {
    expect(getWaitColor(15)).toBeNull();
  });

  it("returns amber for 16 minutes (over 15 threshold)", () => {
    expect(getWaitColor(16)).toBe("amber");
  });

  it("returns amber for 30 minutes (at 30, not over)", () => {
    expect(getWaitColor(30)).toBe("amber");
  });

  it("returns red for 31 minutes (over 30 threshold)", () => {
    expect(getWaitColor(31)).toBe("red");
  });

  it("returns red for 60 minutes", () => {
    expect(getWaitColor(60)).toBe("red");
  });
});

// ---------------------------------------------------------------------------
// getRoleDefaultView
// ---------------------------------------------------------------------------

describe("getRoleDefaultView", () => {
  it("returns flow for receptionist", () => {
    expect(getRoleDefaultView("receptionist")).toBe("flow");
  });

  it("returns flow for technician", () => {
    expect(getRoleDefaultView("technician")).toBe("flow");
  });

  it("returns clinic for doctor", () => {
    expect(getRoleDefaultView("doctor")).toBe("clinic");
  });

  it("returns list for owner", () => {
    expect(getRoleDefaultView("owner")).toBe("list");
  });

  it("returns list for empty string (unknown role)", () => {
    expect(getRoleDefaultView("")).toBe("list");
  });

  it("returns list for unknown role", () => {
    expect(getRoleDefaultView("unknownrole")).toBe("list");
  });
});

// ---------------------------------------------------------------------------
// isSlotOccupied
// ---------------------------------------------------------------------------

describe("isSlotOccupied", () => {
  const baseAppt = {
    startTime: "2026-04-06T09:00:00Z",
    endTime: "2026-04-06T09:45:00Z",
    status: "confirmed" as const,
  };

  it("returns true when slot overlaps an existing appointment", () => {
    const result = isSlotOccupied(
      "2026-04-06T09:15:00Z", // starts during existing
      "2026-04-06T10:00:00Z",
      [baseAppt]
    );
    expect(result).toBe(true);
  });

  it("returns true when slot completely contains an existing appointment", () => {
    const result = isSlotOccupied(
      "2026-04-06T08:30:00Z",
      "2026-04-06T10:00:00Z",
      [baseAppt]
    );
    expect(result).toBe(true);
  });

  it("returns false when slot is after the existing appointment", () => {
    const result = isSlotOccupied(
      "2026-04-06T10:00:00Z", // starts exactly when existing ends
      "2026-04-06T10:45:00Z",
      [baseAppt]
    );
    expect(result).toBe(false);
  });

  it("returns false when slot is before the existing appointment", () => {
    const result = isSlotOccupied(
      "2026-04-06T07:00:00Z",
      "2026-04-06T09:00:00Z", // ends exactly when existing starts
      [baseAppt]
    );
    expect(result).toBe(false);
  });

  it("returns false when appointments list is empty", () => {
    const result = isSlotOccupied(
      "2026-04-06T09:00:00Z",
      "2026-04-06T09:45:00Z",
      []
    );
    expect(result).toBe(false);
  });

  it("ignores cancelled appointments by default", () => {
    const cancelledAppt = { ...baseAppt, status: "cancelled" as const };
    const result = isSlotOccupied(
      "2026-04-06T09:00:00Z",
      "2026-04-06T09:45:00Z",
      [cancelledAppt]
    );
    expect(result).toBe(false);
  });

  it("ignores no_show appointments by default", () => {
    const noShowAppt = { ...baseAppt, status: "no_show" as const };
    const result = isSlotOccupied(
      "2026-04-06T09:00:00Z",
      "2026-04-06T09:45:00Z",
      [noShowAppt]
    );
    expect(result).toBe(false);
  });
});
