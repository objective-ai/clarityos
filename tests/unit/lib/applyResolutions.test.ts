import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock all stores before importing applyResolutions
vi.mock("@/store/encounterStore", () => ({
  useEncounterStore: {
    getState: vi.fn(() => ({
      encounters: { "enc-1": { chiefComplaint: "" } },
      setChiefComplaint: vi.fn(),
      setAssessmentAndPlan: vi.fn(),
      setAiSummary: vi.fn(),
    })),
  },
}));
vi.mock("@/store/vitalsStore", () => ({
  useVitalsStore: { getState: vi.fn(() => ({ setField: vi.fn() })) },
}));
vi.mock("@/store/examFindingsStore", () => ({
  useExamFindingsStore: { getState: vi.fn(() => ({ setStructureField: vi.fn() })) },
}));
vi.mock("@/store/diagnosisStore", () => ({
  useDiagnosisStore: {
    getState: vi.fn(() => ({
      addDiagnosis: vi.fn(),
      encounters: {
        "enc-1": {
          diagnoses: [
            { id: "dx-1", icd10Code: "H52.13", description: "Myopia", eyeAffected: "OD" },
          ],
        },
      },
      updateDiagnosis: vi.fn(),
    })),
  },
}));
vi.mock("@/store/refractionStore", () => ({
  useRefractionStore: { getState: vi.fn(() => ({ setCellValue: vi.fn() })) },
}));
vi.mock("@/lib/ai-status-mapper", () => ({
  mapAiStatus: vi.fn((_s: string, _str: string, v: string) => ({ status: v, finding: "" })),
}));

import { applyResolutions } from
  "@/components/encounter/conflict-resolver/applyResolutions";
import type { ConflictRow } from
  "@/components/encounter/conflict-resolver/buildConflicts";

// Suppress audit fetch
beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok"));
});

function makeRow(overrides: Partial<ConflictRow>): ConflictRow {
  return {
    section: "chief_complaint",
    fieldKey: "chief_complaint",
    label: "Chief Complaint",
    humanValue: null,
    aiValue: "Blurry vision",
    confidence: "high",
    hasConflict: false,
    resolution: "use_ai",
    tier: "auto",
    ...overrides,
  };
}

describe("applyResolutions", () => {
  test("returns count of applied rows", async () => {
    const rows = [makeRow({}), makeRow({ fieldKey: "assessment_and_plan", section: "assessment", label: "A&P", aiValue: "Follow up" })];
    const count = await applyResolutions("enc-1", rows, "SOAP text");
    expect(count).toBe(2);
  });

  test("returns 0 for empty rows array", async () => {
    const count = await applyResolutions("enc-1", [], "SOAP text");
    expect(count).toBe(0);
  });

  test("dx laterality: calls updateDiagnosis with correct eyeAffected when applying laterality row", async () => {
    const { useDiagnosisStore } = await import("@/store/diagnosisStore");
    const updateDiagnosis = vi.fn();
    vi.mocked(useDiagnosisStore.getState).mockReturnValue({
      addDiagnosis: vi.fn(),
      encounters: {
        "enc-1": {
          diagnoses: [
            { id: "dx-1", icd10Code: "H52.13", description: "Myopia", eyeAffected: "OD" },
          ],
          saveStatus: "idle" as const,
          error: null,
        },
      },
      updateDiagnosis,
    } as unknown as ReturnType<typeof useDiagnosisStore.getState>);

    const row = makeRow({
      section: "diagnoses",
      fieldKey: "dx.H52.13.laterality",
      label: "H52.13 Laterality",
      aiValue: "OU",
      resolution: "use_ai",
    });

    await applyResolutions("enc-1", [row], "SOAP text");

    // updateDiagnosis signature: (encounterId, diagnosisId, updates)
    expect(updateDiagnosis).toHaveBeenCalledWith("enc-1", "dx-1", { eyeAffected: "OU" });
  });
});
