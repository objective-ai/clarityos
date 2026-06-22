/**
 * lib/scheduleUtils.ts
 *
 * Pure utility functions for schedule page.
 * Consumed by: WeekStrip, AppointmentCard, FlowBoard, BookingDrawer.
 */

import type { Appointment, AppointmentStatus } from "@/types/appointment";
import type { ViewMode } from "@/types/schedule";
import { ROLE_DEFAULT_VIEWS } from "@/types/schedule";

/** Local YYYY-MM-DD — toISOString returns UTC, which drifts a day for users
 *  east/west of UTC depending on time of day. Always extract the calendar
 *  date in the browser's local zone. */
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns array of 7 ISO date strings (Mon-Sun) for the week containing dateStr.
 * dateStr format: "YYYY-MM-DD"
 */
export function getWeekDays(dateStr: string): string[] {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return toLocalYMD(dd);
  });
}

/**
 * Returns elapsed minutes since check-in (or startTime as fallback) for active-wait statuses.
 * Active statuses: arrived, in_pretest, in_exam.
 */
export function getWaitMinutes(
  appointment: Pick<Appointment, "status" | "startTime" | "checkedInAt">,
  now?: Date
): number | null {
  const activeStatuses: AppointmentStatus[] = [
    "arrived",
    "in_pretest",
    "in_exam",
  ];
  if (!activeStatuses.includes(appointment.status)) return null;
  const currentTime = (now ?? new Date()).getTime();
  const anchor = appointment.checkedInAt ?? appointment.startTime;
  const start = new Date(anchor).getTime();
  const mins = Math.floor((currentTime - start) / 60000);
  return mins < 0 ? 0 : mins;
}

/**
 * Returns wait time color: null (no badge), "amber" (>15min), "red" (>30min).
 */
export function getWaitColor(
  waitMinutes: number | null
): "amber" | "red" | null {
  if (waitMinutes == null) return null;
  if (waitMinutes > 30) return "red";
  if (waitMinutes > 15) return "amber";
  return null;
}

/**
 * Returns the default view mode for a given role.
 * Falls back to "list" for unknown roles.
 */
export function getRoleDefaultView(role: string): ViewMode {
  return ROLE_DEFAULT_VIEWS[role] ?? "list";
}

/**
 * Checks if a proposed time slot overlaps with an existing appointment.
 */
export function isSlotOccupied(
  slotStart: string,
  slotEnd: string,
  appointments: Pick<Appointment, "startTime" | "endTime" | "status">[],
  excludeStatuses: AppointmentStatus[] = ["cancelled", "no_show"]
): boolean {
  const sStart = new Date(slotStart).getTime();
  const sEnd = new Date(slotEnd).getTime();
  return appointments
    .filter((a) => !excludeStatuses.includes(a.status))
    .some((a) => {
      const aStart = new Date(a.startTime).getTime();
      const aEnd = new Date(a.endTime).getTime();
      return sStart < aEnd && sEnd > aStart;
    });
}

/** 30-min time slots from 6:00 am to 10:00 pm (33 entries). */
export function generateTimeSlots(): { label: string; value: string }[] {
  const slots: { label: string; value: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break;
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "am" : "pm";
      const label = `${hour12}:${m === 0 ? "00" : "30"} ${ampm}`;
      const value = `${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`;
      slots.push({ label, value });
    }
  }
  return slots;
}

/**
 * Returns CSS left% and width% for a shift bar within a 6am–10pm (960-min) window.
 * Both startTime and endTime are "HH:MM" strings.
 */
export function calcShiftBar(
  startTime: string,
  endTime: string
): { left: string; width: string } {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const windowStart = 360; // 6am in minutes
  const windowSize = 960; // 6am–10pm
  const left = Math.max(0, ((startMin - windowStart) / windowSize) * 100);
  const width = Math.max(0, ((endMin - startMin) / windowSize) * 100);
  return { left: `${left.toFixed(1)}%`, width: `${width.toFixed(1)}%` };
}

/**
 * Groups blocks that share the same blockType + startTime(HH:MM) + endTime(HH:MM).
 * Returns only groups with 2+ members (recurring groups).
 * Key format: "blockType|HH:MM|HH:MM"
 */
export function inferRecurGroups(
  blocks: Array<{ id: string; blockType: string; startDatetime: string; endDatetime: string }>
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const b of blocks) {
    const key = `${b.blockType}|${b.startDatetime.slice(11, 16)}|${b.endDatetime.slice(11, 16)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b.id);
  }
  for (const [key, ids] of groups) {
    if (ids.length < 2) groups.delete(key);
  }
  return groups;
}

/**
 * Human-readable block display string.
 * Examples:
 *   lunch single  → "Today · 12:00 – 1:00 pm"
 *   personal      → "Apr 22 · 2:00 – 4:00 pm"
 *   holiday range → "Apr 28 – 30 · All day"
 */
export function formatBlockDisplay(
  startDatetime: string,
  endDatetime: string,
  blockType: string
): string {
  const start = new Date(startDatetime);
  const end = new Date(endDatetime);
  const isToday = start.toDateString() === new Date().toDateString();
  const dateStr = isToday
    ? "Today"
    : start.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (blockType === "holiday") {
    if (start.toDateString() !== end.toDateString()) {
      const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
      const endStr = sameMonth
        ? end.toLocaleDateString("en-US", { day: "numeric" })
        : end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${dateStr} – ${endStr} · All day`;
    }
    return `${dateStr} · All day`;
  }

  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return `${dateStr} · ${fmt(start)} – ${fmt(end)}`;
}

/**
 * Generates YYYY-MM-DD strings for the given weekday indices (0=Mon…6=Sun)
 * for the week containing startDate, plus the next (weeks-1) weeks.
 *
 * The startDate anchors the WEEK, not the day. Picking Wed Apr 29 with
 * weekdays [Tue, Wed] yields [Apr 28, Apr 29, May 5, May 6, …] — Tue Apr 28
 * is included even though it's earlier in the same week than the picked
 * start. This matches user intent for "weekly recurring lunches starting
 * this week."
 */
export function generateRepeatDates(
  startDate: string,
  weekdays: number[],
  weeks: number
): string[] {
  const start = new Date(startDate + "T00:00:00");
  const monBased = (start.getDay() + 6) % 7; // convert JS Sun=0 to Mon=0
  const monday = new Date(start);
  monday.setDate(monday.getDate() - monBased);
  const dates: string[] = [];
  for (let w = 0; w < weeks; w++) {
    for (const wd of weekdays) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + w * 7 + wd);
      dates.push(toLocalYMD(d));
    }
  }
  return dates.sort();
}

type BlockLike = {
  id: string;
  blockType: string;
  startDatetime: string;
  endDatetime: string;
  reason?: string | null;
};

export type BlockGroup = {
  key: string;
  blockType: string;
  startTime: string; // local "HH:MM"
  endTime: string;   // local "HH:MM"
  weekday: number;   // 0=Mon..6=Sun (single weekday per group)
  members: BlockLike[];
};

/**
 * Local HH:MM extracted from an ISO datetime string. Slicing the raw string
 * yields the UTC component when an offset is present, which is wrong for
 * display — always go through Date so the browser's local timezone is honored.
 */
function localHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Groups blocks for list rendering. Keyed by blockType + weekday + start/end
 * time, so Tuesday lunches and Thursday lunches at 12-1 are SEPARATE rows
 * (not merged into "Tue, Thu") even though they share the time slot.
 *
 * Single-occurrence blocks become one-member groups; recurring weekday
 * patterns collapse into one group per weekday.
 */
export function groupBlocksForDisplay(blocks: BlockLike[]): BlockGroup[] {
  const map = new Map<string, BlockGroup>();
  for (const b of blocks) {
    const startTime = localHHMM(b.startDatetime);
    const endTime = localHHMM(b.endDatetime);
    const d = new Date(b.startDatetime);
    const weekday = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    // Holidays span date ranges, not weekday recurrences — key off date instead
    // so each holiday remains its own row.
    const groupKey =
      b.blockType === "holiday"
        ? `holiday|${b.id}`
        : `${b.blockType}|${weekday}|${startTime}|${endTime}`;
    let g = map.get(groupKey);
    if (!g) {
      g = { key: groupKey, blockType: b.blockType, startTime, endTime, weekday, members: [] };
      map.set(groupKey, g);
    }
    g.members.push(b);
  }
  for (const g of map.values()) {
    g.members.sort((a, b) => a.startDatetime.localeCompare(b.startDatetime));
  }
  return Array.from(map.values()).sort((a, b) => {
    // Order by earliest occurrence so the user sees upcoming series first
    return a.members[0].startDatetime.localeCompare(b.members[0].startDatetime);
  });
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Format weekdays as compact range when contiguous, comma-separated otherwise.
 * [0,1,2,3,4] → "Mon–Fri", [0,2,4] → "Mon, Wed, Fri"
 */
export function formatWeekdays(weekdays: number[]): string {
  if (weekdays.length === 0) return "";
  const sorted = [...weekdays].sort((a, b) => a - b);
  const contiguous = sorted.every((wd, i) => i === 0 || wd === sorted[i - 1] + 1);
  if (contiguous && sorted.length >= 3) {
    return `${WEEKDAY_SHORT[sorted[0]]}–${WEEKDAY_SHORT[sorted[sorted.length - 1]]}`;
  }
  return sorted.map(wd => WEEKDAY_SHORT[wd]).join(", ");
}

/** Compact 12-h time. "12:00" → "12 pm", "12:30" → "12:30 pm", "09:00" → "9 am". */
export function formatTimeShort(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${mStr.padStart(2, "0")} ${suffix}`;
}

/** Same as formatTimeShort but accepts an ISO datetime and uses local timezone. */
export function formatIsoTimeShort(iso: string): string {
  return formatTimeShort(localHHMM(iso));
}

/**
 * Find the block (if any) overlapping a given calendar date for a staff member.
 * Returns the FIRST matching block — prefers lunch when multiple exist same day.
 */
export function blockForDate(blocks: BlockLike[], dateStr: string): BlockLike | null {
  const matches = blocks.filter(b => {
    // Compare in local time — convert ISO to local YYYY-MM-DD
    const startLocal = new Date(b.startDatetime);
    const endLocal = new Date(b.endDatetime);
    const startYMD = `${startLocal.getFullYear()}-${String(startLocal.getMonth() + 1).padStart(2, "0")}-${String(startLocal.getDate()).padStart(2, "0")}`;
    const endYMD = `${endLocal.getFullYear()}-${String(endLocal.getMonth() + 1).padStart(2, "0")}-${String(endLocal.getDate()).padStart(2, "0")}`;
    return dateStr >= startYMD && dateStr <= endYMD;
  });
  if (matches.length === 0) return null;
  return matches.find(b => b.blockType === "lunch") ?? matches[0];
}
