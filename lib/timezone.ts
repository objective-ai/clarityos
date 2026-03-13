/**
 * lib/timezone.ts
 *
 * Centralized clinic-timezone utilities using native Intl.DateTimeFormat.
 * Zero external dependencies.
 *
 * All display functions require an explicit `tz` (IANA timezone string)
 * so TypeScript catches missing timezone at compile time — no silent
 * browser-timezone fallback.
 *
 * Usage:
 *   import { useClinicTimezone, formatClinicTime } from "@/lib/timezone";
 *   const tz = useClinicTimezone();
 *   formatClinicTime(appointment.startTime, tz);  // "9:30 AM"
 */

import { useAppointmentStore } from "@/store/appointmentStore";

// ---------------------------------------------------------------------------
// Hook — one-liner for any React component
// ---------------------------------------------------------------------------

/** Read clinic timezone from the appointment store (reactive). */
export const useClinicTimezone = () =>
  useAppointmentStore((s) => s.clinicTimezone);

// ---------------------------------------------------------------------------
// Current date/time (clinic-aware)
// ---------------------------------------------------------------------------

/** "Today" in the clinic's timezone as YYYY-MM-DD. Replaces localDateISO(). */
export function clinicToday(tz: string): string {
  return _datePartsToISO(_dateParts(new Date(), tz));
}

/** Current moment in clinic tz — for NowIndicator positioning. */
export function clinicNow(tz: string): { hours: number; minutes: number } {
  return _timeParts(new Date(), tz);
}

// ---------------------------------------------------------------------------
// Parsing / positioning
// ---------------------------------------------------------------------------

/** Extract date part of a Date or ISO string in clinic tz. */
export function clinicDateISO(d: Date | string, tz: string): string {
  const dateObj = typeof d === "string" ? new Date(d) : d;
  return _datePartsToISO(_dateParts(dateObj, tz));
}

/** Hours + minutes for grid positioning. An 8:00 AM PST appt stays at 8 AM. */
export function clinicHoursMinutes(
  iso: string,
  tz: string
): { hours: number; minutes: number } {
  return _timeParts(new Date(iso), tz);
}

/** Convert clinic-local date + time to UTC ISO string for DB storage. */
export function clinicLocalToUTC(
  dateStr: string,
  timeStr: string,
  tz: string
): string {
  // Build a probe date at noon to detect the UTC offset for this tz on this date
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const offsetPart =
    fmt.formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ||
    "";
  let offsetMinutes = 0;
  const m = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (m) {
    const sign = m[1] === "+" ? 1 : -1;
    offsetMinutes = sign * (parseInt(m[2]) * 60 + parseInt(m[3] || "0"));
  }
  const [h, min] = timeStr.split(":").map(Number);
  const ms = Date.UTC(
    parseInt(dateStr.slice(0, 4)),
    parseInt(dateStr.slice(5, 7)) - 1,
    parseInt(dateStr.slice(8, 10)),
    h,
    min,
    0
  );
  return new Date(ms - offsetMinutes * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Display — all require tz so TypeScript catches missing timezone
// ---------------------------------------------------------------------------

/** Format time for display: "9:30 AM" */
export function formatClinicTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

/** Format datetime: "Mar 13, 9:30 AM" */
export function formatClinicDateTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

/**
 * Format a date-only value: "Mar 13, 2026".
 * Handles both YYYY-MM-DD strings and full ISO datetimes.
 * For date-only strings, appends T12:00:00 to avoid UTC date shift.
 */
export function formatClinicDate(dateOrIso: string): string {
  const d = dateOrIso.includes("T")
    ? new Date(dateOrIso)
    : new Date(dateOrIso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Long-form date for schedule header: "Friday, March 13, 2026" */
export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Date arithmetic
// ---------------------------------------------------------------------------

/** Shift a YYYY-MM-DD string by N days. */
export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return _datePartsToISO({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _dateParts(
  d: Date,
  tz: string
): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formats as YYYY-MM-DD
  const str = fmt.format(d);
  const [y, m, day] = str.split("-").map(Number);
  return { year: y, month: m, day };
}

function _timeParts(
  d: Date,
  tz: string
): { hours: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const str = fmt.format(d); // "09:30" or "14:05"
  const [h, m] = str.split(":").map(Number);
  return { hours: h, minutes: m };
}

function _datePartsToISO(p: {
  year: number;
  month: number;
  day: number;
}): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
