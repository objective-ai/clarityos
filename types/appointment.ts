/**
 * types/appointment.ts
 *
 * TypeScript types for the Appointment module.
 * Mirrors backend/schemas/appointment.py response shapes (camelCase).
 */

// ---- Enums (match backend AppointmentStatus / AppointmentType) ----

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "in_pretest"
  | "in_exam"
  | "completed"
  | "finalized"
  | "cancelled"
  | "no_show";

export type AppointmentType =
  | "comprehensive_exam"
  | "contact_lens_exam"
  | "follow_up"
  | "urgent_care"
  | "pediatric_exam";

// ---- Response types ----

export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  providerId: string;
  bookedById: string | null;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  startTime: string; // ISO 8601
  endTime: string;
  durationMinutes: number;
  chiefComplaint: string | null;
  internalNotes: string | null;
  cancellationReason: string | null;
  reminderSentAt: string | null;
  // Patient engagement (Phase 12)
  patientConfirmedAt: string | null;
  lastReminderSentAt: string | null;
  remindersSentCount: number;
  patientName: string | null;
  patientChartNumber: number | null;
  providerName: string | null;
  encounterId: string | null;
  encounterShortId: string | null;
  intakeStatus: "pending" | "submitted" | null;
  triageFlags: {
    urgency: string;
    flags: string[];
    reasoning: string;
  } | null;
  // Insurance summary (Phase 10.1)
  insurancePayerName?: string | null;
  insuranceCopay?: number | null;
  insuranceEligibility?: string | null;
  // Wait time tracking (Phase 10.2) — ISO 8601 UTC timestamp set on check-in
  checkedInAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentListResponse {
  items: Appointment[];
  total: number;
  timezone: string;
}

// ---- Request types ----

export interface AppointmentCreatePayload {
  patientId: string;
  providerId: string;
  appointmentType: AppointmentType;
  startTime: string; // ISO 8601
  durationMinutes?: number;
  chiefComplaint?: string;
  internalNotes?: string;
}

export interface AppointmentUpdatePayload {
  appointmentType?: AppointmentType;
  startTime?: string;
  durationMinutes?: number;
  chiefComplaint?: string;
  internalNotes?: string;
}

export interface AppointmentCancelPayload {
  cancellationReason: string;
}

export interface AppointmentReschedulePayload {
  newStartTime: string; // ISO 8601
  newDurationMinutes?: number;
}

export interface StartExamResponse {
  encounterId: string;
  encounterShortId: string;
  alreadyExisted: boolean;
}

// ---- UI helpers ----

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  comprehensive_exam: "Comprehensive Exam",
  contact_lens_exam: "Contact Lens Exam",
  follow_up: "Follow-Up",
  urgent_care: "Urgent Care",
  pediatric_exam: "Pediatric Exam",
};

export const APPOINTMENT_TYPE_DURATIONS: Record<AppointmentType, number> = {
  comprehensive_exam: 45,
  contact_lens_exam: 30,
  follow_up: 20,
  urgent_care: 30,
  pediatric_exam: 45,
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  arrived: "Checked In",
  in_pretest: "Pre-Test",
  in_exam: "In Exam",
  completed: "Completed",
  finalized: "Finalized",
  cancelled: "Cancelled",
  no_show: "No Show",
};

/** 3-4 char abbreviations for compact grid views (ClinicView) */
export const STATUS_SHORT_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Sched",
  confirmed: "Conf",
  arrived: "In",
  in_pretest: "Pre",
  in_exam: "Exam",
  completed: "Done",
  finalized: "Final",
  cancelled: "Canc",
  no_show: "N/S",
};

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: "#64748b",
  confirmed: "#2DD4BF",
  arrived: "#f59e0b",
  in_pretest: "#8b5cf6",
  in_exam: "#3b82f6",
  completed: "#22c55e",
  finalized: "#10b981",
  cancelled: "#ef4444",
  no_show: "#ef4444",
};
