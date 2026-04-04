/**
 * types/schedule.ts
 *
 * Shared types and constants for the schedule page.
 * Consumed by: schedule/page.tsx, WeekStrip, FlowBoard, WeekView, drawers.
 */

import type { Appointment, AppointmentStatus } from "./appointment";

// ---------------------------------------------------------------------------
// View modes
// ---------------------------------------------------------------------------

export type ViewMode = "list" | "timeline" | "clinic" | "flow" | "week";

export const VALID_VIEW_MODES: ViewMode[] = [
  "list",
  "timeline",
  "clinic",
  "flow",
  "week",
];

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  list: "List",
  timeline: "Timeline",
  clinic: "Clinic",
  flow: "Flow",
  week: "Week",
};

// ---------------------------------------------------------------------------
// Drawer state machine
// ---------------------------------------------------------------------------

export type DrawerState =
  | { mode: "closed" }
  | { mode: "detail"; appointment: Appointment }
  | { mode: "booking"; defaults?: BookingDefaults };

export interface BookingDefaults {
  date?: string;
  providerId?: string;
  startTime?: string;
  /** Pre-filled patient for quick-book from slot */
  patientId?: string;
  patientName?: string;
  providerName?: string;
}

// ---------------------------------------------------------------------------
// Flow board
// ---------------------------------------------------------------------------

export interface FlowColumn {
  id: string;
  label: string;
  statuses: AppointmentStatus[];
}

export const FLOW_COLUMNS: FlowColumn[] = [
  { id: "waiting", label: "Waiting", statuses: ["arrived"] },
  { id: "pretest", label: "Pre-Test", statuses: ["in_pretest"] },
  { id: "exam", label: "In Exam", statuses: ["in_exam"] },
  { id: "done", label: "Done", statuses: ["completed", "finalized"] },
];

// ---------------------------------------------------------------------------
// Role-based default views
// ---------------------------------------------------------------------------

export const ROLE_DEFAULT_VIEWS: Record<string, ViewMode> = {
  receptionist: "flow",
  technician: "flow",
  doctor: "clinic",
  owner: "list",
  admin: "list",
};
