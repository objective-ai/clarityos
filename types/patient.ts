import type { PatientAlert } from "@/types/session";

// ---------------------------------------------------------------------------
// Patient detail (full record from GET /api/patients/{id})
// ---------------------------------------------------------------------------

export interface PatientDetail {
  id: string;
  chartNumber: number;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  dob: string;
  sex: "male" | "female" | "other" | "prefer_not_to_say";
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  ssnLast4?: string | null;
  insuranceProvider?: string | null;
  insuranceMemberId?: string | null;
  insuranceGroup?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  notes?: string | null;
  alerts: PatientAlert[];
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Patient summary (from GET /api/patients list)
// ---------------------------------------------------------------------------

export interface PatientSummary {
  id: string;
  chartNumber: number;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  dob: string;
  sex: "male" | "female" | "other" | "prefer_not_to_say";
  phone?: string | null;
  email?: string | null;
  lastVisit?: string | null;
  createdAt: string;
}

export interface PatientListResponse {
  items: PatientSummary[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Patient create/update payloads
// ---------------------------------------------------------------------------

export interface PatientCreatePayload {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  dob: string;
  sex: "male" | "female" | "other" | "prefer_not_to_say";
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  ssnLast4?: string | null;
  insuranceProvider?: string | null;
  insuranceMemberId?: string | null;
  insuranceGroup?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  notes?: string | null;
}

export type PatientUpdatePayload = Partial<PatientCreatePayload>;

// ---------------------------------------------------------------------------
// Encounter timeline entry
// ---------------------------------------------------------------------------

export interface PatientEncounterSummary {
  id: string;
  shortId: string;
  encounterDate: string;
  providerId: string;
  providerName?: string | null;
  chiefComplaint?: string | null;
  assessmentAndPlan?: string | null;
  aiSummaryText?: string | null;
  isFinalized: boolean;
  diagnosisCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Clinical flowsheet row
// ---------------------------------------------------------------------------

export interface FlowsheetRow {
  encounterId: string;
  encounterDate: string;
  iopOd?: number | null;
  iopOs?: number | null;
  sphereOd?: number | null;
  sphereOs?: number | null;
  cylinderOd?: number | null;
  cylinderOs?: number | null;
  addOd?: number | null;
  addOs?: number | null;
}

// ---------------------------------------------------------------------------
// AI Prep Me
// ---------------------------------------------------------------------------

export interface PrepMeResponse {
  summary: string;
  encounterCount: number;
}

// ---------------------------------------------------------------------------
// Legacy types (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface PastEncounter {
  id: string;
  date: string;
  status: "pre_test" | "in_exam" | "finalized";
  provider: string;
  chiefComplaint: string;
  diagnoses: string[];
  finalRx?: { od: string; os: string };
}
