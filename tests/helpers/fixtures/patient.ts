import type {
  PatientDetail,
  PatientSummary,
  PatientListResponse,
  PatientEncounterSummary,
  FlowsheetRow,
  PrepMeResponse,
} from "@/types/patient";

export function makePatientSummary(
  overrides?: Partial<PatientSummary>
): PatientSummary {
  return {
    id: "pat-1",
    chartNumber: 10001,
    firstName: "Jane",
    lastName: "Doe",
    dob: "1990-05-15",
    sex: "female",
    phone: "555-0100",
    email: "jane@example.com",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makePatientDetail(
  overrides?: Partial<PatientDetail>
): PatientDetail {
  return {
    id: "pat-1",
    chartNumber: 10001,
    firstName: "Jane",
    lastName: "Doe",
    dob: "1990-05-15",
    sex: "female",
    phone: "555-0100",
    email: "jane@example.com",
    alerts: [],
    isDeleted: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makePatientListResponse(
  items?: PatientSummary[]
): PatientListResponse {
  const list = items ?? [makePatientSummary()];
  return { items: list, total: list.length, limit: 20, offset: 0 };
}

export function makeEncounterSummary(
  overrides?: Partial<PatientEncounterSummary>
): PatientEncounterSummary {
  return {
    id: "enc-1",
    shortId: "abc12345",
    encounterDate: "2026-03-01",
    providerId: "prov-1",
    providerName: "Dr. Smith",
    chiefComplaint: "Annual exam",
    assessmentAndPlan: null,
    aiSummaryText: null,
    isFinalized: false,
    diagnosisCount: 2,
    createdAt: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

export function makeFlowsheetRow(
  overrides?: Partial<FlowsheetRow>
): FlowsheetRow {
  return {
    encounterId: "enc-1",
    encounterDate: "2026-03-01",
    iopOd: 16,
    iopOs: 18,
    sphereOd: -2.0,
    sphereOs: -1.75,
    cylinderOd: -0.5,
    cylinderOs: -0.25,
    addOd: null,
    addOs: null,
    ...overrides,
  };
}

export function makePrepMeResponse(
  overrides?: Partial<PrepMeResponse>
): PrepMeResponse {
  return {
    summary:
      "Patient presents for annual comprehensive exam. Previous visit showed stable myopia with IOP within normal limits.",
    encounterCount: 3,
    ...overrides,
  };
}
