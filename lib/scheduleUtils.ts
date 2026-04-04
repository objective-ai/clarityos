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
