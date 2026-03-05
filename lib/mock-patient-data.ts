import type { PatientDetail, PastEncounter } from "@/types/patient";

const PATIENTS: PatientDetail[] = [
  {
    id: "pat-001",
    firstName: "Margaret",
    lastName: "Chen",
    dob: "1958-03-12",
    sex: "F",
    phone: "(555) 234-5678",
    email: "m.chen@email.com",
    address: "1234 Oak Street, Suite 200, San Francisco, CA 94102",
    alerts: [
      { id: "a1", severity: "critical", label: "Allergy: Sulfa" },
      { id: "a2", severity: "warning", label: "Glaucoma Suspect" },
    ],
    insurance: { provider: "VSP Vision", memberId: "VSP-882341", group: "GRP-4400" },
    emergencyContact: { name: "David Chen", phone: "(555) 234-9999", relation: "Spouse" },
  },
  {
    id: "pat-002",
    firstName: "Robert",
    lastName: "Kim",
    dob: "1972-08-25",
    sex: "M",
    phone: "(555) 345-6789",
    email: "r.kim@email.com",
    address: "567 Pine Ave, Oakland, CA 94611",
    alerts: [{ id: "a3", severity: "info", label: "Contact lens wearer" }],
    insurance: { provider: "EyeMed", memberId: "EM-119822" },
    emergencyContact: { name: "Susan Kim", phone: "(555) 345-0000", relation: "Spouse" },
  },
  {
    id: "pat-003",
    firstName: "Sarah",
    lastName: "Johnson",
    dob: "1990-11-05",
    sex: "F",
    phone: "(555) 456-7890",
    email: "s.johnson@email.com",
    alerts: [],
    insurance: { provider: "Blue Cross", memberId: "BC-553219", group: "GRP-1100" },
  },
  {
    id: "pat-004",
    firstName: "James",
    lastName: "Wilson",
    dob: "1965-01-18",
    sex: "M",
    phone: "(555) 567-8901",
    alerts: [
      { id: "a4", severity: "warning", label: "Diabetic retinopathy" },
      { id: "a5", severity: "info", label: "Dilated last visit" },
    ],
    insurance: { provider: "Aetna", memberId: "AET-774532" },
  },
  {
    id: "pat-005",
    firstName: "Lisa",
    lastName: "Park",
    dob: "1988-07-22",
    sex: "F",
    phone: "(555) 678-9012",
    email: "l.park@email.com",
    alerts: [],
  },
  {
    id: "pat-006",
    firstName: "David",
    lastName: "Brown",
    dob: "1955-04-30",
    sex: "M",
    phone: "(555) 789-0123",
    alerts: [
      { id: "a6", severity: "critical", label: "Allergy: Fluorescein" },
      { id: "a7", severity: "warning", label: "Macular degeneration" },
    ],
    insurance: { provider: "Medicare", memberId: "MED-221098" },
    emergencyContact: { name: "Carol Brown", phone: "(555) 789-9999", relation: "Spouse" },
  },
  {
    id: "pat-007",
    firstName: "Emily",
    lastName: "Davis",
    dob: "1995-09-14",
    sex: "F",
    phone: "(555) 890-1234",
    alerts: [],
  },
  {
    id: "pat-008",
    firstName: "Michael",
    lastName: "Torres",
    dob: "1978-12-03",
    sex: "M",
    phone: "(555) 901-2345",
    email: "m.torres@email.com",
    alerts: [{ id: "a8", severity: "info", label: "High myopia (>-6.00)" }],
    insurance: { provider: "VSP Vision", memberId: "VSP-667312" },
  },
  {
    id: "pat-009",
    firstName: "Karen",
    lastName: "White",
    dob: "1960-06-17",
    sex: "F",
    phone: "(555) 012-3456",
    alerts: [{ id: "a9", severity: "warning", label: "Narrow angles" }],
    insurance: { provider: "Medicare", memberId: "MED-884521" },
  },
  {
    id: "pat-010",
    firstName: "Anna",
    lastName: "Lopez",
    dob: "1983-02-08",
    sex: "F",
    phone: "(555) 123-4567",
    email: "a.lopez@email.com",
    alerts: [],
    insurance: { provider: "Blue Cross", memberId: "BC-445102", group: "GRP-2200" },
  },
];

const ENCOUNTERS: Record<string, PastEncounter[]> = {
  "pat-001": [
    {
      id: "enc-001",
      date: "2026-03-03",
      status: "finalized",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "Blurry distance vision, headaches",
      diagnoses: ["H52.11 — Myopia, bilateral", "H52.211 — Astigmatism, regular, right eye"],
      finalRx: { od: "-2.50 -1.00 x090", os: "-2.25 -0.75 x085" },
    },
    {
      id: "enc-010",
      date: "2025-09-15",
      status: "finalized",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "Annual comprehensive exam",
      diagnoses: ["H52.11 — Myopia, bilateral", "H40.001 — Glaucoma suspect"],
      finalRx: { od: "-2.25 -0.75 x090", os: "-2.00 -0.75 x080" },
    },
    {
      id: "enc-020",
      date: "2024-09-20",
      status: "finalized",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "Routine eye exam",
      diagnoses: ["H52.11 — Myopia, bilateral"],
      finalRx: { od: "-2.00 -0.75 x090", os: "-2.00 -0.50 x085" },
    },
  ],
  "pat-002": [
    {
      id: "enc-002",
      date: "2026-03-03",
      status: "in_exam",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "Contact lens follow-up",
      diagnoses: [],
    },
    {
      id: "enc-011",
      date: "2025-10-01",
      status: "finalized",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "Annual CL fitting",
      diagnoses: ["H52.11 — Myopia, bilateral"],
      finalRx: { od: "-3.75 -0.50 x175", os: "-4.00 -0.25 x010" },
    },
  ],
  "pat-003": [
    {
      id: "enc-003",
      date: "2026-03-02",
      status: "finalized",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "New patient comprehensive exam",
      diagnoses: ["H52.11 — Myopia, right eye"],
      finalRx: { od: "-1.25 -0.50 x180", os: "Plano" },
    },
  ],
  "pat-004": [
    {
      id: "enc-004",
      date: "2026-03-03",
      status: "finalized",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "Diabetic eye exam, floaters",
      diagnoses: ["E11.319 — DM2 with mild NPDR", "H43.10 — Vitreous floaters"],
      finalRx: { od: "+1.50 -0.75 x045", os: "+1.25 -0.50 x135" },
    },
    {
      id: "enc-012",
      date: "2025-09-10",
      status: "finalized",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "Diabetic eye exam",
      diagnoses: ["E11.319 — DM2 with mild NPDR"],
      finalRx: { od: "+1.25 -0.75 x045", os: "+1.00 -0.50 x130" },
    },
  ],
  "pat-005": [
    {
      id: "enc-005",
      date: "2026-03-03",
      status: "pre_test",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "Routine annual exam",
      diagnoses: [],
    },
  ],
  "pat-006": [
    {
      id: "enc-006",
      date: "2026-03-03",
      status: "finalized",
      provider: "Dr. Amara Okafor",
      chiefComplaint: "AMD follow-up, vision changes",
      diagnoses: ["H35.31 — Dry AMD, bilateral", "H52.4 — Presbyopia"],
      finalRx: { od: "+2.75 -1.25 x060", os: "+3.00 -1.00 x120" },
    },
  ],
};

export function getAllPatients(): PatientDetail[] {
  return PATIENTS;
}

export function getPatientById(id: string): PatientDetail | null {
  return PATIENTS.find((p) => p.id === id) ?? null;
}

export function getPatientEncounters(id: string): PastEncounter[] {
  return ENCOUNTERS[id] ?? [];
}

export function getPatientIdForEncounter(encounterId: string): string | null {
  for (const [patientId, encs] of Object.entries(ENCOUNTERS)) {
    if (encs.some((e) => e.id === encounterId)) return patientId;
  }
  return null;
}
