import { describe, test, expect } from "vitest";
import { buildConflicts, type StoreSnapshots } from
  "@/components/encounter/conflict-resolver/buildConflicts";
import type { ScribeStructuredDataV2 } from "@/types/scribe";

// ---------------------------------------------------------------------------
// Factory: empty store snapshots (no doctor data, exam not saved)
// ---------------------------------------------------------------------------
function emptySnapshots(overrides?: Partial<StoreSnapshots>): StoreSnapshots {
  return {
    chiefComplaint: null,
    assessmentAndPlan: null,
    vitals: null,
    examAnterior: null,
    examPosterior: null,
    diagnoses: [],
    refractionManifest: null,
    examAnteriorSaved: false,
    examPosteriorSaved: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Factory: minimal AI data with one high-confidence normal finding
// ---------------------------------------------------------------------------
function aiDataWithNormalCornea(): ScribeStructuredDataV2 {
  return {
    chief_complaint: { value: "Blurry vision", confidence: "high" },
    assessment_and_plan: { value: null, confidence: "high" },
    exam_findings: {
      anterior: {
        OD: {
          cornea: { status: "Clear", notes: "", confidence: "high" },
        },
        OS: {
          cornea: { status: "Clear", notes: "", confidence: "high" },
        },
      },
    },
  };
}

describe("buildConflicts — tier classification", () => {
  test("high-confidence normal finding on empty field → auto tier", () => {
    const rows = buildConflicts(aiDataWithNormalCornea(), emptySnapshots());
    const corneaRows = rows.filter((r) => r.fieldKey.includes("cornea"));
    expect(corneaRows.length).toBeGreaterThan(0);
    for (const row of corneaRows) {
      expect(row.tier).toBe("auto");
      expect(row.resolution).toBe("use_ai");
    }
  });

  test("high-confidence abnormal finding on empty field → review tier", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      exam_findings: {
        anterior: {
          OD: { lens: { status: "2+ NS", notes: "", confidence: "high" } },
        },
      },
    };
    const rows = buildConflicts(data, emptySnapshots());
    const lensRow = rows.find((r) => r.fieldKey.includes("lens"));
    expect(lensRow).toBeDefined();
    expect(lensRow!.tier).toBe("review");
  });

  test("diagnosis always → review tier regardless of confidence", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      diagnoses: [
        { icdCode: "H52.13", description: "Myopia bilateral", laterality: "OU", confidence: "high" },
      ],
    };
    const rows = buildConflicts(data, emptySnapshots());
    const dxRow = rows.find((r) => r.section === "diagnoses");
    expect(dxRow).toBeDefined();
    expect(dxRow!.tier).toBe("review");
  });

  test("medium confidence + empty field → review tier", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      vitals: {
        iop_od: { value: 14, confidence: "medium" },
        iop_os: { value: null, confidence: "high" },
        va_od_distance: { value: null, confidence: "high" },
        va_os_distance: { value: null, confidence: "high" },
        va_od_near: { value: null, confidence: "high" },
        va_os_near: { value: null, confidence: "high" },
        bp_systolic: { value: null, confidence: "high" },
        bp_diastolic: { value: null, confidence: "high" },
        pupils_od: { value: null, confidence: "high" },
        pupils_os: { value: null, confidence: "high" },
      },
    };
    const rows = buildConflicts(data, emptySnapshots());
    const iopRow = rows.find((r) => r.fieldKey === "vitals.iop_od");
    expect(iopRow).toBeDefined();
    expect(iopRow!.tier).toBe("review");
  });

  test("A&P always → review tier regardless of confidence", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: "1. Myopia — updated Rx.", confidence: "high" },
    };
    const rows = buildConflicts(data, emptySnapshots());
    const apRow = rows.find((r) => r.fieldKey === "assessment_and_plan");
    expect(apRow).toBeDefined();
    expect(apRow!.tier).toBe("review");
  });

  test("conflict (human has value, AI differs) → review tier", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: "Dry eyes", confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
    };
    const rows = buildConflicts(data, emptySnapshots({
      chiefComplaint: "Blurry vision",
    }));
    const ccRow = rows.find((r) => r.fieldKey === "chief_complaint");
    expect(ccRow).toBeDefined();
    expect(ccRow!.tier).toBe("review");
    expect(ccRow!.hasConflict).toBe(true);
  });

  test("case-insensitive normal check via mapAiStatus: 'clear' matches 'Clear'", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      exam_findings: {
        anterior: {
          OD: { cornea: { status: "clear", notes: "", confidence: "high" } },
        },
      },
    };
    const rows = buildConflicts(data, emptySnapshots());
    const corneaRow = rows.find((r) => r.fieldKey.includes("cornea.status"));
    expect(corneaRow).toBeDefined();
    expect(corneaRow!.tier).toBe("auto");
  });
});

describe("buildConflicts — default detection", () => {
  test("AI matches unsaved default → row created as auto tier (confirmed)", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      exam_findings: {
        anterior: {
          OD: { cornea: { status: "Clear", notes: "", confidence: "high" } },
        },
      },
    };
    // examAnteriorSaved: false → defaults are virtual empty
    const rows = buildConflicts(data, emptySnapshots({
      examAnterior: {
        findings_od: { cornea: { status: "Clear" } } as Record<string, { status: string }>,
        findings_os: {} as Record<string, { status: string }>,
      },
      examAnteriorSaved: false,
    }));
    const corneaRow = rows.find((r) => r.fieldKey.includes("cornea"));
    expect(corneaRow).toBeDefined();
    expect(corneaRow!.tier).toBe("auto");
  });

  test("AI matches saved real data → row skipped (genuine match)", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      exam_findings: {
        anterior: {
          OD: { cornea: { status: "Clear", notes: "", confidence: "high" } },
        },
      },
    };
    // examAnteriorSaved: true → this is real data, match = skip
    const rows = buildConflicts(data, emptySnapshots({
      examAnterior: {
        findings_od: { cornea: { status: "Clear" } } as Record<string, { status: string }>,
        findings_os: {} as Record<string, { status: string }>,
      },
      examAnteriorSaved: true,
    }));
    const corneaRow = rows.find((r) => r.fieldKey.includes("cornea"));
    expect(corneaRow).toBeUndefined();
  });
});
