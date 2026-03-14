import { describe, test, expect } from "vitest";
import { buildConflicts, type StoreSnapshots } from
  "@/components/encounter/conflict-resolver/buildConflicts";
import type { ScribeStructuredDataV2 } from "@/types/scribe";

function realisticAiData(): ScribeStructuredDataV2 {
  return {
    chief_complaint: { value: "Comprehensive eye exam", confidence: "high" },
    assessment_and_plan: {
      value: "1. Myopia — updated Rx.\n2. Elevated IOP OD — order OCT.",
      confidence: "high",
    },
    vitals: {
      iop_od: { value: 23, confidence: "high" },
      iop_os: { value: 18, confidence: "high" },
      va_od_distance: { value: "20/200", confidence: "high" },
      va_os_distance: { value: "20/100", confidence: "high" },
      va_od_near: { value: null, confidence: "high" },
      va_os_near: { value: null, confidence: "high" },
      bp_systolic: { value: null, confidence: "high" },
      bp_diastolic: { value: null, confidence: "high" },
      pupils_od: { value: null, confidence: "high" },
      pupils_os: { value: null, confidence: "high" },
    },
    exam_findings: {
      anterior: {
        OD: {
          cornea: { status: "Clear", notes: "", confidence: "high" },
          lids_lashes: { status: "Normal", notes: "", confidence: "high" },
          lens: { status: "2+ NS", notes: "Nuclear sclerosis", confidence: "high" },
          anterior_chamber: { status: "Deep & quiet", notes: "", confidence: "high" },
        },
        OS: {
          cornea: { status: "Clear", notes: "", confidence: "high" },
          lids_lashes: { status: "Normal", notes: "", confidence: "high" },
          lens: { status: "2+ NS", notes: "Nuclear sclerosis", confidence: "high" },
          anterior_chamber: { status: "Deep & quiet", notes: "", confidence: "high" },
        },
      },
      posterior: {
        OD: {
          macula: { status: "Flat & intact", notes: "", confidence: "high" },
          vessels: { status: "Normal A/V ratio", notes: "", confidence: "high" },
        },
        OS: {
          macula: { status: "Flat & intact", notes: "", confidence: "high" },
          vessels: { status: "Normal A/V ratio", notes: "", confidence: "high" },
        },
      },
    },
    diagnoses: [
      { icdCode: "H52.13", description: "Myopia, bilateral", laterality: "OU", confidence: "high" },
      { icdCode: "H40.001", description: "Glaucoma suspect", laterality: "OD", confidence: "medium" },
    ],
    refraction: {
      OD: { sphere: "-2.00", cylinder: "-0.75", axis: "180", add: "+2.00", confidence: "low" },
      OS: { sphere: "-1.75", cylinder: "-0.50", axis: "175", add: "+2.00", confidence: "low" },
    },
  };
}

function emptySnapshots(): StoreSnapshots {
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
  };
}

describe("Realistic encounter — tier split", () => {
  test("normal findings → auto, abnormal + dx + low-conf → review", () => {
    const rows = buildConflicts(realisticAiData(), emptySnapshots());
    const autoRows = rows.filter((r) => r.tier === "auto");
    const reviewRows = rows.filter((r) => r.tier === "review");

    // Normal findings: cornea Clear (OD+OS), lids Normal (OD+OS),
    // AC Deep & quiet (OD+OS), macula Flat & intact (OD+OS),
    // vessels Normal A/V (OD+OS) = 10 auto status rows
    // Plus chief complaint (high conf + empty) and vitals (high conf + empty)
    expect(autoRows.length).toBeGreaterThanOrEqual(10);

    // Abnormal: lens 2+ NS (OD+OS status + notes = 4 rows)
    // Dx: 2 diagnoses (always review)
    // Refraction: low confidence → review (8 fields)
    // A&P: review (always)
    expect(reviewRows.length).toBeGreaterThanOrEqual(5);

    // Diagnoses are always review tier
    const dxRows = rows.filter((r) => r.section === "diagnoses");
    for (const dx of dxRows) {
      expect(dx.tier).toBe("review");
    }

    // Low confidence refraction → review
    const rxRows = rows.filter((r) => r.section === "refraction");
    for (const rx of rxRows) {
      expect(rx.tier).toBe("review");
    }
  });

  test("auto-tier rows default to resolution use_ai", () => {
    const rows = buildConflicts(realisticAiData(), emptySnapshots());
    const autoRows = rows.filter((r) => r.tier === "auto");
    for (const row of autoRows) {
      expect(row.resolution).toBe("use_ai");
    }
  });

  test("review-tier conflict rows default to keep, non-conflict to use_ai", () => {
    const rows = buildConflicts(realisticAiData(), emptySnapshots());
    const reviewRows = rows.filter((r) => r.tier === "review");
    for (const row of reviewRows) {
      if (row.hasConflict) {
        expect(row.resolution).toBe("keep");
      } else if (row.section === "diagnoses" && row.fieldKey.endsWith(".new")) {
        // New diagnoses default to "keep" for clinical safety
        expect(row.resolution).toBe("keep");
      } else {
        expect(row.resolution).toBe("use_ai");
      }
    }
  });

  test("A&P always review tier even with high confidence", () => {
    const rows = buildConflicts(realisticAiData(), emptySnapshots());
    const apRow = rows.find((r) => r.fieldKey === "assessment_and_plan");
    expect(apRow).toBeDefined();
    expect(apRow!.tier).toBe("review");
  });
});
