export interface MockAppointment {
  id: string;
  date: string; // ISO date "2026-03-04"
  time: string;
  patient: string;
  patientId: string;
  type: string;
  status: "completed" | "in_progress" | "scheduled";
  provider: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getAppointmentsForDate(dateKey: string): MockAppointment[] {
  return MOCK_APPOINTMENTS.filter((a) => a.date === dateKey);
}

export function getAppointmentsForWeek(weekStart: Date): MockAppointment[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    keys.push(formatDateKey(d));
  }
  return MOCK_APPOINTMENTS.filter((a) => keys.includes(a.date));
}

export function getPatientIdForAppointment(appointmentId: string): string | null {
  return MOCK_APPOINTMENTS.find((a) => a.id === appointmentId)?.patientId ?? null;
}

export function getAppointmentCountByDate(dates: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of dates) counts[d] = 0;
  for (const a of MOCK_APPOINTMENTS) {
    if (a.date in counts) counts[a.date]++;
  }
  return counts;
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Data: 2 weeks centered around 2026-03-04 (Wednesday)
// Week 1: Mon 2026-03-02 → Sun 2026-03-08
// Week 2: Mon 2026-03-09 → Sun 2026-03-15
// ---------------------------------------------------------------------------

export const MOCK_APPOINTMENTS: MockAppointment[] = [
  // ── Monday 2026-03-02 (8 appts) ──
  { id: "apt-100", date: "2026-03-02", time: "8:00 AM", patient: "James Wilson", patientId: "pat-004", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-101", date: "2026-03-02", time: "8:30 AM", patient: "Karen White", patientId: "pat-009", type: "Glaucoma Check", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-102", date: "2026-03-02", time: "9:15 AM", patient: "Anna Lopez", patientId: "pat-010", type: "Contact Lens Follow-up", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-103", date: "2026-03-02", time: "10:00 AM", patient: "Robert Kim", patientId: "pat-002", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-104", date: "2026-03-02", time: "11:00 AM", patient: "Emily Davis", patientId: "pat-007", type: "Dry Eye Evaluation", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-105", date: "2026-03-02", time: "1:00 PM", patient: "Sarah Johnson", patientId: "pat-003", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-106", date: "2026-03-02", time: "2:30 PM", patient: "Lisa Park", patientId: "pat-005", type: "Contact Lens Fitting", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-107", date: "2026-03-02", time: "3:30 PM", patient: "David Brown", patientId: "pat-006", type: "Retinal Photo Review", status: "completed", provider: "Dr. Morgan" },

  // ── Tuesday 2026-03-03 (10 appts) ──
  { id: "apt-110", date: "2026-03-03", time: "8:00 AM", patient: "Margaret Chen", patientId: "pat-001", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-111", date: "2026-03-03", time: "8:30 AM", patient: "Michael Torres", patientId: "pat-008", type: "Contact Lens Follow-up", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-112", date: "2026-03-03", time: "9:15 AM", patient: "James Wilson", patientId: "pat-004", type: "Diabetic Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-113", date: "2026-03-03", time: "10:00 AM", patient: "Lisa Park", patientId: "pat-005", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-114", date: "2026-03-03", time: "10:45 AM", patient: "David Brown", patientId: "pat-006", type: "Glaucoma Check", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-115", date: "2026-03-03", time: "11:30 AM", patient: "Anna Lopez", patientId: "pat-010", type: "Dry Eye Evaluation", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-116", date: "2026-03-03", time: "1:00 PM", patient: "Robert Kim", patientId: "pat-002", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-117", date: "2026-03-03", time: "2:00 PM", patient: "Emily Davis", patientId: "pat-007", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-118", date: "2026-03-03", time: "3:00 PM", patient: "Sarah Johnson", patientId: "pat-003", type: "Post-Op Check", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-119", date: "2026-03-03", time: "4:00 PM", patient: "Karen White", patientId: "pat-009", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },

  // ── Wednesday 2026-03-04 — TODAY (11 appts) ──
  { id: "apt-001", date: "2026-03-04", time: "8:00 AM", patient: "James Wilson", patientId: "pat-004", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-002", date: "2026-03-04", time: "9:00 AM", patient: "Lisa Park", patientId: "pat-005", type: "Contact Lens Follow-up", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-003", date: "2026-03-04", time: "9:30 AM", patient: "David Brown", patientId: "pat-006", type: "Glaucoma Check", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-004", date: "2026-03-04", time: "10:15 AM", patient: "Emily Davis", patientId: "pat-007", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-005", date: "2026-03-04", time: "11:00 AM", patient: "Robert Kim", patientId: "pat-002", type: "Comprehensive Eye Exam", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-006", date: "2026-03-04", time: "11:30 AM", patient: "Anna Lopez", patientId: "pat-010", type: "Dry Eye Evaluation", status: "completed", provider: "Dr. Morgan" },
  { id: "apt-007", date: "2026-03-04", time: "1:15 PM", patient: "Margaret Chen", patientId: "pat-001", type: "Comprehensive Eye Exam", status: "in_progress", provider: "Dr. Morgan" },
  { id: "apt-008", date: "2026-03-04", time: "2:30 PM", patient: "Robert Kim", patientId: "pat-002", type: "Retinal Photo Review", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-009", date: "2026-03-04", time: "3:00 PM", patient: "Sarah Johnson", patientId: "pat-003", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-010", date: "2026-03-04", time: "3:45 PM", patient: "Michael Torres", patientId: "pat-008", type: "Contact Lens Fitting", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-011", date: "2026-03-04", time: "4:30 PM", patient: "Karen White", patientId: "pat-009", type: "Post-Op Check", status: "scheduled", provider: "Dr. Morgan" },

  // ── Thursday 2026-03-05 (9 appts) ──
  { id: "apt-120", date: "2026-03-05", time: "8:00 AM", patient: "Margaret Chen", patientId: "pat-001", type: "Glaucoma Follow-up", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-121", date: "2026-03-05", time: "8:45 AM", patient: "Anna Lopez", patientId: "pat-010", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-122", date: "2026-03-05", time: "9:30 AM", patient: "Michael Torres", patientId: "pat-008", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-123", date: "2026-03-05", time: "10:15 AM", patient: "Karen White", patientId: "pat-009", type: "Dry Eye Evaluation", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-124", date: "2026-03-05", time: "11:00 AM", patient: "Robert Kim", patientId: "pat-002", type: "Contact Lens Follow-up", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-125", date: "2026-03-05", time: "1:00 PM", patient: "Lisa Park", patientId: "pat-005", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-126", date: "2026-03-05", time: "2:00 PM", patient: "James Wilson", patientId: "pat-004", type: "Retinal Photo Review", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-127", date: "2026-03-05", time: "3:00 PM", patient: "Emily Davis", patientId: "pat-007", type: "Contact Lens Fitting", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-128", date: "2026-03-05", time: "4:00 PM", patient: "David Brown", patientId: "pat-006", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },

  // ── Friday 2026-03-06 (10 appts) ──
  { id: "apt-130", date: "2026-03-06", time: "8:00 AM", patient: "Sarah Johnson", patientId: "pat-003", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-131", date: "2026-03-06", time: "8:45 AM", patient: "David Brown", patientId: "pat-006", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-132", date: "2026-03-06", time: "9:30 AM", patient: "Margaret Chen", patientId: "pat-001", type: "Contact Lens Follow-up", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-133", date: "2026-03-06", time: "10:15 AM", patient: "Robert Kim", patientId: "pat-002", type: "Diabetic Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-134", date: "2026-03-06", time: "11:00 AM", patient: "Emily Davis", patientId: "pat-007", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-135", date: "2026-03-06", time: "11:45 AM", patient: "Karen White", patientId: "pat-009", type: "Glaucoma Check", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-136", date: "2026-03-06", time: "1:00 PM", patient: "Anna Lopez", patientId: "pat-010", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-137", date: "2026-03-06", time: "2:00 PM", patient: "Michael Torres", patientId: "pat-008", type: "Post-Op Check", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-138", date: "2026-03-06", time: "3:00 PM", patient: "Lisa Park", patientId: "pat-005", type: "Dry Eye Evaluation", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-139", date: "2026-03-06", time: "4:00 PM", patient: "James Wilson", patientId: "pat-004", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },

  // ── Saturday 2026-03-07 (3 appts — half day) ──
  { id: "apt-140", date: "2026-03-07", time: "9:00 AM", patient: "Anna Lopez", patientId: "pat-010", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-141", date: "2026-03-07", time: "10:00 AM", patient: "Lisa Park", patientId: "pat-005", type: "Contact Lens Follow-up", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-142", date: "2026-03-07", time: "11:00 AM", patient: "Robert Kim", patientId: "pat-002", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },

  // ── Sunday 2026-03-08 — CLOSED ──

  // ── Monday 2026-03-09 (9 appts) ──
  { id: "apt-150", date: "2026-03-09", time: "8:00 AM", patient: "Emily Davis", patientId: "pat-007", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-151", date: "2026-03-09", time: "9:00 AM", patient: "James Wilson", patientId: "pat-004", type: "Contact Lens Follow-up", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-152", date: "2026-03-09", time: "9:45 AM", patient: "Karen White", patientId: "pat-009", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-153", date: "2026-03-09", time: "10:30 AM", patient: "Margaret Chen", patientId: "pat-001", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-154", date: "2026-03-09", time: "11:15 AM", patient: "Sarah Johnson", patientId: "pat-003", type: "Dry Eye Evaluation", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-155", date: "2026-03-09", time: "1:00 PM", patient: "David Brown", patientId: "pat-006", type: "Glaucoma Check", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-156", date: "2026-03-09", time: "2:00 PM", patient: "Anna Lopez", patientId: "pat-010", type: "Contact Lens Fitting", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-157", date: "2026-03-09", time: "3:00 PM", patient: "Michael Torres", patientId: "pat-008", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-158", date: "2026-03-09", time: "4:00 PM", patient: "Robert Kim", patientId: "pat-002", type: "Retinal Photo Review", status: "scheduled", provider: "Dr. Morgan" },

  // ── Tuesday 2026-03-10 (8 appts) ──
  { id: "apt-160", date: "2026-03-10", time: "8:00 AM", patient: "Lisa Park", patientId: "pat-005", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-161", date: "2026-03-10", time: "9:00 AM", patient: "David Brown", patientId: "pat-006", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-162", date: "2026-03-10", time: "10:00 AM", patient: "Emily Davis", patientId: "pat-007", type: "Post-Op Check", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-163", date: "2026-03-10", time: "10:45 AM", patient: "Karen White", patientId: "pat-009", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-164", date: "2026-03-10", time: "11:30 AM", patient: "Margaret Chen", patientId: "pat-001", type: "Dry Eye Evaluation", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-165", date: "2026-03-10", time: "1:00 PM", patient: "James Wilson", patientId: "pat-004", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-166", date: "2026-03-10", time: "2:30 PM", patient: "Sarah Johnson", patientId: "pat-003", type: "Contact Lens Fitting", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-167", date: "2026-03-10", time: "3:30 PM", patient: "Michael Torres", patientId: "pat-008", type: "Glaucoma Check", status: "scheduled", provider: "Dr. Morgan" },

  // ── Wednesday 2026-03-11 (10 appts) ──
  { id: "apt-170", date: "2026-03-11", time: "8:00 AM", patient: "Robert Kim", patientId: "pat-002", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-171", date: "2026-03-11", time: "8:45 AM", patient: "Anna Lopez", patientId: "pat-010", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-172", date: "2026-03-11", time: "9:30 AM", patient: "Lisa Park", patientId: "pat-005", type: "Dry Eye Evaluation", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-173", date: "2026-03-11", time: "10:15 AM", patient: "Karen White", patientId: "pat-009", type: "Contact Lens Follow-up", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-174", date: "2026-03-11", time: "11:00 AM", patient: "James Wilson", patientId: "pat-004", type: "Diabetic Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-175", date: "2026-03-11", time: "1:00 PM", patient: "Margaret Chen", patientId: "pat-001", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-176", date: "2026-03-11", time: "2:00 PM", patient: "David Brown", patientId: "pat-006", type: "Retinal Photo Review", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-177", date: "2026-03-11", time: "3:00 PM", patient: "Emily Davis", patientId: "pat-007", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-178", date: "2026-03-11", time: "3:45 PM", patient: "Sarah Johnson", patientId: "pat-003", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-179", date: "2026-03-11", time: "4:30 PM", patient: "Michael Torres", patientId: "pat-008", type: "Contact Lens Follow-up", status: "scheduled", provider: "Dr. Morgan" },

  // ── Thursday 2026-03-12 (7 appts) ──
  { id: "apt-180", date: "2026-03-12", time: "8:00 AM", patient: "Anna Lopez", patientId: "pat-010", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-181", date: "2026-03-12", time: "9:00 AM", patient: "Robert Kim", patientId: "pat-002", type: "Glaucoma Check", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-182", date: "2026-03-12", time: "10:00 AM", patient: "Lisa Park", patientId: "pat-005", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-183", date: "2026-03-12", time: "11:00 AM", patient: "Karen White", patientId: "pat-009", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-184", date: "2026-03-12", time: "1:00 PM", patient: "James Wilson", patientId: "pat-004", type: "Post-Op Check", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-185", date: "2026-03-12", time: "2:30 PM", patient: "David Brown", patientId: "pat-006", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-186", date: "2026-03-12", time: "3:30 PM", patient: "Emily Davis", patientId: "pat-007", type: "Contact Lens Follow-up", status: "scheduled", provider: "Dr. Morgan" },

  // ── Friday 2026-03-13 (8 appts) ──
  { id: "apt-190", date: "2026-03-13", time: "8:00 AM", patient: "Margaret Chen", patientId: "pat-001", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-191", date: "2026-03-13", time: "9:00 AM", patient: "Michael Torres", patientId: "pat-008", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-192", date: "2026-03-13", time: "10:00 AM", patient: "Sarah Johnson", patientId: "pat-003", type: "Glaucoma Check", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-193", date: "2026-03-13", time: "10:45 AM", patient: "Anna Lopez", patientId: "pat-010", type: "Dry Eye Evaluation", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-194", date: "2026-03-13", time: "11:30 AM", patient: "Robert Kim", patientId: "pat-002", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-195", date: "2026-03-13", time: "1:00 PM", patient: "Lisa Park", patientId: "pat-005", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-196", date: "2026-03-13", time: "2:30 PM", patient: "David Brown", patientId: "pat-006", type: "Contact Lens Fitting", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-197", date: "2026-03-13", time: "3:30 PM", patient: "Karen White", patientId: "pat-009", type: "Post-Op Check", status: "scheduled", provider: "Dr. Morgan" },

  // ── Saturday 2026-03-14 (2 appts — half day) ──
  { id: "apt-200", date: "2026-03-14", time: "9:00 AM", patient: "James Wilson", patientId: "pat-004", type: "Comprehensive Eye Exam", status: "scheduled", provider: "Dr. Morgan" },
  { id: "apt-201", date: "2026-03-14", time: "10:00 AM", patient: "Emily Davis", patientId: "pat-007", type: "Contact Lens Follow-up", status: "scheduled", provider: "Dr. Morgan" },
];
