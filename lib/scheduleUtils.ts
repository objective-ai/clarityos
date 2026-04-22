/**
 * lib/scheduleUtils.ts
 *
 * Pure utility functions for schedule page.
 * Consumed by: WeekStrip, AppointmentCard, FlowBoard, BookingDrawer.
 */

import type { Appointment, AppointmentStatus } from "@/types/appointment";
import type { ViewMode } from "@/types/schedule";
import { ROLE_DEFAULT_VIEWS } from "@/types/schedule";

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
    return dd.toISOString().slice(0, 10);
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
      const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
 * starting from startDate, for `weeks` consecutive weeks.
 * Only returns dates >= startDate.
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
      if (d >= start) dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates.sort();
}
