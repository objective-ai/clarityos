import type {
  Appointment,
  AppointmentListResponse,
  StartExamResponse,
} from "@/types/appointment";

export function makeAppointment(
  overrides?: Partial<Appointment>
): Appointment {
  return {
    id: "appt-1",
    tenantId: "b0000000-0000-0000-0000-000000000001",
    patientId: "pat-1",
    providerId: "prov-1",
    bookedById: null,
    appointmentType: "comprehensive_exam",
    status: "scheduled",
    startTime: "2026-03-10T09:00:00Z",
    endTime: "2026-03-10T09:45:00Z",
    durationMinutes: 45,
    chiefComplaint: "Annual exam",
    internalNotes: null,
    cancellationReason: null,
    reminderSentAt: null,
    encounterId: null,
    encounterShortId: null,
    intakeStatus: null,
    triageFlags: null,
    patientName: "Jane Doe",
    patientChartNumber: 10001,
    providerName: "Dr. Smith",
    createdAt: "2026-03-05T10:00:00Z",
    updatedAt: "2026-03-05T10:00:00Z",
    ...overrides,
  };
}

export function makeAppointmentListResponse(
  items?: Appointment[]
): AppointmentListResponse {
  const list = items ?? [makeAppointment()];
  return { items: list, total: list.length, timezone: "America/Los_Angeles" };
}

export function makeStartExamResponse(
  overrides?: Partial<StartExamResponse>
): StartExamResponse {
  return {
    encounterId: "enc-1",
    encounterShortId: "abc12345",
    alreadyExisted: false,
    ...overrides,
  };
}
