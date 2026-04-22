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
  generateTimeSlots,
  calcShiftBar,
  inferRecurGroups,
  formatBlockDisplay,
  generateRepeatDates,
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

// ---------------------------------------------------------------------------
// generateTimeSlots
// ---------------------------------------------------------------------------

describe("generateTimeSlots", () => {
  it("returns 33 slots from 6:00 am to 10:00 pm", () => {
    const slots = generateTimeSlots();
    expect(slots).toHaveLength(33);
    expect(slots[0]).toEqual({ label: "6:00 am", value: "06:00" });
    expect(slots[slots.length - 1]).toEqual({ label: "10:00 pm", value: "22:00" });
  });
  it("includes 12:00 pm and 1:00 pm", () => {
    const slots = generateTimeSlots();
    expect(slots.find(s => s.value === "12:00")?.label).toBe("12:00 pm");
    expect(slots.find(s => s.value === "13:00")?.label).toBe("1:00 pm");
  });
});

// ---------------------------------------------------------------------------
// calcShiftBar
// ---------------------------------------------------------------------------

describe("calcShiftBar", () => {
  it("9am–5pm fills correct width starting at ~18.8%", () => {
    // 9am = 540min, window start = 360 (6am), window size = 960
    // left = (540-360)/960*100 = 18.75% → toFixed(1) → "18.8%"
    // width = (1020-540)/960*100 = 50.0%
    const { left, width } = calcShiftBar("09:00", "17:00");
    expect(left).toBe("18.8%");
    expect(width).toBe("50.0%");
  });
  it("clamps negative left to 0%", () => {
    const { left } = calcShiftBar("04:00", "05:00");
    expect(left).toBe("0.0%");
  });
});

// ---------------------------------------------------------------------------
// inferRecurGroups
// ---------------------------------------------------------------------------

describe("inferRecurGroups", () => {
  const blocks = [
    { id: "a", blockType: "lunch", startDatetime: "2026-04-21T12:00:00", endDatetime: "2026-04-21T13:00:00" },
    { id: "b", blockType: "lunch", startDatetime: "2026-04-22T12:00:00", endDatetime: "2026-04-22T13:00:00" },
    { id: "c", blockType: "personal", startDatetime: "2026-04-22T14:00:00", endDatetime: "2026-04-22T15:00:00" },
  ];
  it("groups 2 lunch blocks with same time", () => {
    const groups = inferRecurGroups(blocks);
    expect(groups.has("lunch|12:00|13:00")).toBe(true);
    expect(groups.get("lunch|12:00|13:00")).toEqual(["a", "b"]);
  });
  it("excludes single blocks", () => {
    const groups = inferRecurGroups(blocks);
    expect(groups.has("personal|14:00|15:00")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatBlockDisplay
// ---------------------------------------------------------------------------

describe("formatBlockDisplay", () => {
  it("shows Today for same-day lunch", () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = formatBlockDisplay(`${today}T12:00:00`, `${today}T13:00:00`, "lunch");
    expect(result).toMatch(/^Today · /);
    expect(result).toMatch(/12:00/);
  });
  it("shows date range for multi-day holiday", () => {
    const result = formatBlockDisplay("2026-04-28T00:00:00", "2026-04-30T23:59:59", "holiday");
    expect(result).toMatch(/Apr 28/);
    expect(result).toMatch(/Apr 30/);
    expect(result).toContain("All day");
  });
});

// ---------------------------------------------------------------------------
// generateRepeatDates
// ---------------------------------------------------------------------------

describe("generateRepeatDates", () => {
  it("generates Mon/Wed for 2 weeks from a Wednesday start", () => {
    // Apr 22 = Wednesday, weekdays [0,2] = Mon+Wed
    const dates = generateRepeatDates("2026-04-22", [0, 2], 2);
    expect(dates).toContain("2026-04-22"); // Wed of week 1
    expect(dates).toContain("2026-04-27"); // Mon of week 2
    expect(dates).toContain("2026-04-29"); // Wed of week 2
    expect(dates).not.toContain("2026-04-20"); // Mon before start — excluded
  });
  it("returns sorted dates", () => {
    const dates = generateRepeatDates("2026-04-22", [0, 2, 4], 2);
    expect(dates).toEqual([...dates].sort());
  });
});
