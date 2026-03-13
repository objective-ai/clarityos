/**
 * buildConflicts.ts
 *
 * Pure function that compares AI Scribe structured data against current store
 * values and returns a list of conflict rows for the merge UI.
 */

import type { ScribeStructuredDataV2, ConfidenceLevel } from "@/types/scribe";
import { ANTERIOR_FIELD_META, POSTERIOR_FIELD_META } from "@/lib/exam-findings-fields";
import { mapAiStatus } from "@/lib/ai-status-mapper";
import type { ExamSection } from "@/types/exam-findings";

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
  tier: "auto" | "review";
  /** Raw structured data for complex fields (e.g., diagnosis, pupils) */
  aiRawData?: Record<string, unknown>;
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
  refractionManifest: {
    od: Record<string, unknown>;
    os: Record<string, unknown>;
  } | null;
  examAnteriorSaved: boolean;
  examPosteriorSaved: boolean;
}

// ---------------------------------------------------------------------------
// Normal-value lookup (derived from field metadata — single source of truth)
// ---------------------------------------------------------------------------

const NORMAL_VALUES: Record<string, string> = {};
for (const field of [...ANTERIOR_FIELD_META, ...POSTERIOR_FIELD_META]) {
  NORMAL_VALUES[field.key] = field.defaultStatus;
}

function isNormalFinding(
  section: ConflictSection,
  fieldKey: string,
  aiValue: string,
): boolean {
  if (section !== "exam_anterior" && section !== "exam_posterior") return false;

  // Extract structure name from fieldKey: "exam.anterior.od.cornea.status" → "cornea"
  const parts = fieldKey.split(".");
  if (parts.length < 5) return false;
  const structure = parts[3];
  const fieldName = parts[4];

  // Only check status fields, not notes
  if (fieldName !== "status") return false;

  const normalValue = NORMAL_VALUES[structure];
  if (!normalValue) return false;

  // Normalize AI value through mapAiStatus for case-insensitive matching
  const examSection = (section === "exam_anterior" ? "anterior_segment" : "posterior_segment") as ExamSection;
  const mapped = mapAiStatus(examSection, structure, aiValue, "");
  return mapped.status === normalValue;
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
  opts?: { examSaved?: boolean },
) {
  if (!aiValue) return; // AI has nothing to suggest

  const humanStr = humanValue?.trim() || null;
  const aiStr = aiValue.trim();
  if (!aiStr) return;

  // Both match — skip IF the exam data was explicitly saved by doctor
  if (humanStr && humanStr === aiStr) {
    if (opts?.examSaved !== false) return; // genuine match, skip
    // examSaved === false: default data, fall through to create auto-tier row
  }

  const hasConflict = humanStr != null && humanStr !== aiStr && opts?.examSaved !== false;

  // Tier classification
  const isEmptyOrDefault = humanStr == null || opts?.examSaved === false;
  const isHighConf = confidence === "high";
  const isDx = section === "diagnoses";
  const isNormal = isNormalFinding(section, fieldKey, aiStr);
  const isAP = section === "assessment";

  let tier: "auto" | "review";
  if (isHighConf && isEmptyOrDefault && !isDx && !isAP && !hasConflict) {
    if (section === "exam_anterior" || section === "exam_posterior") {
      tier = isNormal ? "auto" : "review";
    } else {
      tier = "auto";
    }
  } else {
    tier = "review";
  }

  rows.push({
    section,
    fieldKey,
    label,
    humanValue: humanStr,
    aiValue: aiStr,
    confidence,
    hasConflict,
    resolution: tier === "auto" ? "use_ai" : (hasConflict ? "keep" : "use_ai"),
    tier,
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
  // Pupils handled separately — AI sends text, store has booleans
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

    // Pupils: AI sends free text, store has booleans
    const pupilOd = aiData.vitals.pupils_od?.value;
    const pupilOs = aiData.vitals.pupils_os?.value;
    const rawPupilText = [pupilOd, pupilOs].filter(Boolean).join("; ");
    if (rawPupilText) {
      const lower = rawPupilText.toLowerCase();
      const pupilConfidence = aiData.vitals.pupils_od?.confidence ?? aiData.vitals.pupils_os?.confidence ?? "medium";

      // Parse PERRL/PERRLA → pupils_equal_round_reactive
      const isPerrl = /perrl|perrla/.test(lower);
      const isSluggish = /sluggish|irregular|unequal|anisocoria/.test(lower);
      const perrlValue = isPerrl && !isSluggish;

      const humanPerrl = stores.vitals?.["pupils_equal_round_reactive"];
      const perrlRow: ConflictRow = {
        section: "vitals",
        fieldKey: "vitals.pupils_equal_round_reactive",
        label: "Pupils Equal/Round/Reactive",
        humanValue: humanPerrl != null ? (humanPerrl ? "Yes" : "No") : null,
        aiValue: perrlValue ? "Yes" : "No",
        confidence: pupilConfidence,
        hasConflict: humanPerrl != null && (!!humanPerrl) !== perrlValue,
        resolution: humanPerrl != null && (!!humanPerrl) !== perrlValue ? "keep" : "use_ai",
        tier: "review",
        aiRawData: { rawPupilText },
      };
      if (humanPerrl == null || (!!humanPerrl) !== perrlValue) {
        rows.push(perrlRow);
      }

      // Parse APD/RAPD
      const hasApd = /\+apd|positive apd|rapd present|apd present/.test(lower);
      const noApd = /no apd|-apd|rapd absent|apd absent|no rapd/.test(lower);
      if (hasApd || noApd) {
        const rapdValue = hasApd;
        const humanRapd = stores.vitals?.["relative_afferent_pupillary_defect"];
        const rapdRow: ConflictRow = {
          section: "vitals",
          fieldKey: "vitals.relative_afferent_pupillary_defect",
          label: "RAPD",
          humanValue: humanRapd != null ? (humanRapd ? "Yes" : "No") : null,
          aiValue: rapdValue ? "Yes" : "No",
          confidence: pupilConfidence,
          hasConflict: humanRapd != null && (!!humanRapd) !== rapdValue,
          resolution: humanRapd != null && (!!humanRapd) !== rapdValue ? "keep" : "use_ai",
          tier: "review",
          aiRawData: { rawPupilText },
        };
        if (humanRapd == null || (!!humanRapd) !== rapdValue) {
          rows.push(rapdRow);
        }
      }
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

        const examSaved = sectionKey === "exam_anterior"
          ? stores.examAnteriorSaved
          : stores.examPosteriorSaved;

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
            { examSaved },
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
            { examSaved },
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
        // New diagnosis — show as addition, defaulting to Skip (clinical safety)
        const aiDisplayVal = `${aiDx.icdCode} — ${aiDx.description} (${aiDx.laterality})`;
        rows.push({
          section: "diagnoses",
          fieldKey: `dx.${aiDx.icdCode}.new`,
          label: `${aiDx.icdCode} ${aiDx.description}`,
          humanValue: null,
          aiValue: aiDisplayVal,
          confidence: aiDx.confidence,
          hasConflict: false,
          resolution: "keep", // Doctor must explicitly confirm new ICD-10 codes
          tier: "review",
          aiRawData: {
            icdCode: aiDx.icdCode,
            description: aiDx.description,
            laterality: aiDx.laterality,
          },
        });
      }
    }
  }

  // --- Refraction (Manifest column) ---
  if (aiData.refraction) {
    for (const eye of ["OD", "OS"] as const) {
      const aiRx = aiData.refraction[eye];
      if (!aiRx) continue;
      const eyeLower = eye.toLowerCase() as "od" | "os";
      const humanRx = stores.refractionManifest?.[eyeLower];

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
