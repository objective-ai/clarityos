/**
 * buildConflicts.ts
 *
 * Pure function that compares AI Scribe structured data against current store
 * values and returns a list of conflict rows for the merge UI.
 */

import type { ScribeStructuredDataV2, ConfidenceLevel } from "@/types/scribe";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConflictSection =
  | "chief_complaint"
  | "vitals"
  | "exam_anterior"
  | "exam_posterior"
  | "diagnoses"
  | "refraction"
  | "assessment";

export interface ConflictRow {
  section: ConflictSection;
  fieldKey: string;
  label: string;
  humanValue: string | null;
  aiValue: string;
  confidence: ConfidenceLevel;
  hasConflict: boolean;
  resolution: "keep" | "use_ai";
}

// Store snapshots passed in (avoids coupling to Zustand hooks)
export interface StoreSnapshots {
  chiefComplaint: string | null;
  assessmentAndPlan: string | null;
  vitals: Record<string, unknown> | null;
  examAnterior: {
    findings_od: Record<string, { status: string; finding?: string }>;
    findings_os: Record<string, { status: string; finding?: string }>;
  } | null;
  examPosterior: {
    findings_od: Record<string, { status: string; finding?: string }>;
    findings_os: Record<string, { status: string; finding?: string }>;
  } | null;
  diagnoses: Array<{ icd10Code: string; description: string; eyeAffected: string | null }>;
  refractionFinalRx: {
    od: Record<string, unknown>;
    os: Record<string, unknown>;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(val: unknown): string | null {
  if (val == null || val === "") return null;
  return String(val);
}

function addRow(
  rows: ConflictRow[],
  section: ConflictSection,
  fieldKey: string,
  label: string,
  humanValue: string | null,
  aiValue: string | null,
  confidence: ConfidenceLevel,
) {
  if (!aiValue) return; // AI has nothing to suggest

  const humanStr = humanValue?.trim() || null;
  const aiStr = aiValue.trim();
  if (!aiStr) return;

  // Both match → skip (auto-accepted silently)
  if (humanStr && humanStr === aiStr) return;

  const hasConflict = humanStr != null && humanStr !== aiStr;

  rows.push({
    section,
    fieldKey,
    label,
    humanValue: humanStr,
    aiValue: aiStr,
    confidence,
    hasConflict,
    // Default: keep doctor's entry on conflict, use AI when doctor field is empty
    resolution: hasConflict ? "keep" : "use_ai",
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const VITALS_MAP: Array<{
  aiKey: keyof NonNullable<ScribeStructuredDataV2["vitals"]>;
  storeKey: string;
  label: string;
}> = [
  { aiKey: "iop_od", storeKey: "iop_od", label: "IOP OD" },
  { aiKey: "iop_os", storeKey: "iop_os", label: "IOP OS" },
  { aiKey: "va_od_distance", storeKey: "ucva_od", label: "VA OD (Distance)" },
  { aiKey: "va_os_distance", storeKey: "ucva_os", label: "VA OS (Distance)" },
  { aiKey: "va_od_near", storeKey: "near_va_od", label: "VA OD (Near)" },
  { aiKey: "va_os_near", storeKey: "near_va_os", label: "VA OS (Near)" },
  // BP handled separately — store has combined "120/80" field
  { aiKey: "pupils_od", storeKey: "pupils_od", label: "Pupils OD" },
  { aiKey: "pupils_os", storeKey: "pupils_os", label: "Pupils OS" },
];

export function buildConflicts(
  aiData: ScribeStructuredDataV2,
  stores: StoreSnapshots,
): ConflictRow[] {
  const rows: ConflictRow[] = [];

  // --- Chief Complaint ---
  if (aiData.chief_complaint?.value) {
    addRow(
      rows,
      "chief_complaint",
      "chief_complaint",
      "Chief Complaint",
      stores.chiefComplaint,
      aiData.chief_complaint.value,
      aiData.chief_complaint.confidence,
    );
  }

  // --- Vitals ---
  if (aiData.vitals) {
    for (const { aiKey, storeKey, label } of VITALS_MAP) {
      const aiField = aiData.vitals[aiKey];
      if (!aiField?.value) continue;
      const humanVal = str(stores.vitals?.[storeKey]);
      addRow(rows, "vitals", `vitals.${storeKey}`, label, humanVal, str(aiField.value), aiField.confidence);
    }

    // Blood pressure: AI sends separate systolic/diastolic, store has combined "120/80"
    const sys = aiData.vitals.bp_systolic;
    const dia = aiData.vitals.bp_diastolic;
    if (sys?.value || dia?.value) {
      const aiVal = `${sys?.value ?? "?"}/${dia?.value ?? "?"}`;
      const confidence = sys?.confidence ?? dia?.confidence ?? "low";
      const humanVal = str(stores.vitals?.["blood_pressure"]);
      addRow(rows, "vitals", "vitals.blood_pressure", "Blood Pressure", humanVal, aiVal, confidence);
    }
  }

  // --- Exam Findings (Anterior + Posterior) ---
  for (const [sectionKey, sectionLabel, examData, storeDraft] of [
    ["exam_anterior", "Anterior", aiData.exam_findings?.anterior, stores.examAnterior] as const,
    ["exam_posterior", "Posterior", aiData.exam_findings?.posterior, stores.examPosterior] as const,
  ]) {
    if (!examData) continue;

    for (const eye of ["OD", "OS"] as const) {
      const structures = examData[eye];
      if (!structures) continue;
      const eyeLower = eye.toLowerCase() as "od" | "os";
      const eyeFindings = eyeLower === "od" ? storeDraft?.findings_od : storeDraft?.findings_os;

      for (const [structure, finding] of Object.entries(structures)) {
        const prettyStructure = structure.replace(/_/g, " ");

        // Status
        if (finding.status) {
          const humanStatus = str(eyeFindings?.[structure]?.status);
          addRow(
            rows,
            sectionKey as ConflictSection,
            `exam.${sectionKey.replace("exam_", "")}.${eyeLower}.${structure}.status`,
            `${prettyStructure} ${eye} — Status`,
            humanStatus,
            finding.status,
            finding.confidence,
          );
        }

        // Notes/Finding
        if (finding.notes) {
          const humanNotes = str(eyeFindings?.[structure]?.finding);
          addRow(
            rows,
            sectionKey as ConflictSection,
            `exam.${sectionKey.replace("exam_", "")}.${eyeLower}.${structure}.finding`,
            `${prettyStructure} ${eye} — Notes`,
            humanNotes,
            finding.notes,
            finding.confidence,
          );
        }
      }
    }
  }

  // --- Diagnoses ---
  if (aiData.diagnoses) {
    for (const aiDx of aiData.diagnoses) {
      const existing = stores.diagnoses.find((d) => d.icd10Code === aiDx.icdCode);
      if (existing) {
        // Same ICD code exists — check for laterality/description conflicts
        if (existing.description !== aiDx.description) {
          addRow(
            rows,
            "diagnoses",
            `dx.${aiDx.icdCode}.description`,
            `${aiDx.icdCode} — Description`,
            existing.description,
            aiDx.description,
            aiDx.confidence,
          );
        }
        if (existing.eyeAffected !== aiDx.laterality) {
          addRow(
            rows,
            "diagnoses",
            `dx.${aiDx.icdCode}.laterality`,
            `${aiDx.icdCode} — Laterality`,
            existing.eyeAffected,
            aiDx.laterality,
            aiDx.confidence,
          );
        }
      } else {
        // New diagnosis — show as addition
        addRow(
          rows,
          "diagnoses",
          `dx.${aiDx.icdCode}.new`,
          `${aiDx.icdCode} ${aiDx.description}`,
          null,
          `${aiDx.icdCode} — ${aiDx.description} (${aiDx.laterality})`,
          aiDx.confidence,
        );
      }
    }
  }

  // --- Refraction (Final Rx column) ---
  if (aiData.refraction) {
    for (const eye of ["OD", "OS"] as const) {
      const aiRx = aiData.refraction[eye];
      if (!aiRx) continue;
      const eyeLower = eye.toLowerCase() as "od" | "os";
      const humanRx = stores.refractionFinalRx?.[eyeLower];

      for (const field of ["sphere", "cylinder", "axis", "add"] as const) {
        const aiVal = aiRx[field];
        if (!aiVal) continue;
        const humanVal = str(humanRx?.[field]);
        addRow(
          rows,
          "refraction",
          `refraction.${eye}.${field}`,
          `${field.charAt(0).toUpperCase() + field.slice(1)} ${eye}`,
          humanVal,
          aiVal,
          aiRx.confidence,
        );
      }
    }
  }

  // --- Assessment & Plan ---
  if (aiData.assessment_and_plan?.value) {
    addRow(
      rows,
      "assessment",
      "assessment_and_plan",
      "Assessment & Plan",
      stores.assessmentAndPlan,
      aiData.assessment_and_plan.value,
      aiData.assessment_and_plan.confidence,
    );
  }

  return rows;
}
