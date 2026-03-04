import type { PatientAlert } from "@/types/session";

export interface PatientDetail {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  dob: string;
  sex: "M" | "F";
  phone: string;
  email?: string;
  address?: string;
  alerts: PatientAlert[];
  insurance?: { provider: string; memberId: string; group?: string };
  emergencyContact?: { name: string; phone: string; relation: string };
}

export interface PastEncounter {
  id: string;
  date: string;
  status: "pre_test" | "in_exam" | "finalized";
  provider: string;
  chiefComplaint: string;
  diagnoses: string[];
  finalRx?: { od: string; os: string };
}
