/**
 * applyResolutions.ts
 *
 * Dispatches selected AI values to their respective Zustand stores
 * and fires an audit log.
 */

import type { ConflictRow } from "./buildConflicts";
import type { RowKey } from "@/types/refraction";
import type { ExamSection, StructureFinding } from "@/types/exam-findings";
import type { EyeLaterality } from "@/types/diagnosis";
import { mapAiStatus } from "@/lib/ai-status-mapper";
import { useEncounterStore } from "@/store/encounterStore";
import { useVitalsStore } from "@/store/vitalsStore";
import { useExamFindingsStore } from "@/store/examFindingsStore";
import { useDiagnosisStore } from "@/store/diagnosisStore";
import { useRefractionStore } from "@/store/refractionStore";

// Refraction field mapping (moved from page.tsx)
const RX_FIELD_TO_ROW: Record<string, { od: RowKey; os: RowKey }> = {
  sphere:   { od: "od_sphere",   os: "os_sphere" },
  cylinder: { od: "od_cylinder", os: "os_cylinder" },
  axis:     { od: "od_axis",     os: "os_axis" },
  add:      { od: "od_add",      os: "os_add" },
};
const MANIFEST_RX_COL = 2;

// Vitals: AI key → store key mapping
const VITALS_AI_TO_STORE: Record<string, string> = {
  "vitals.iop_od": "iop_od",
  "vitals.iop_os": "iop_os",
  "vitals.ucva_od": "ucva_od",
  "vitals.ucva_os": "ucva_os",
  "vitals.near_va_od": "near_va_od",
  "vitals.near_va_os": "near_va_os",
  "vitals.blood_pressure": "blood_pressure",
  "vitals.pupils_equal_round_reactive": "pupils_equal_round_reactive",
  "vitals.relative_afferent_pupillary_defect": "relative_afferent_pupillary_defect",
};

export async function applyResolutions(
  encounterId: string,
  rows: ConflictRow[],
  soapText: string,
): Promise<number> {
  if (rows.length === 0) return 0;

  const diff: Record<string, { old: unknown; new: unknown }> = {};

  const setChiefComplaint = useEncounterStore.getState().setChiefComplaint;
  const setAssessmentAndPlan = useEncounterStore.getState().setAssessmentAndPlan;
  const setAiSummary = useEncounterStore.getState().setAiSummary;
  const setVitalsField = useVitalsStore.getState().setField;
  const setStructureField = useExamFindingsStore.getState().setStructureField;
  const addDiagnosis = useDiagnosisStore.getState().addDiagnosis;
  const setCellValue = useRefractionStore.getState().setCellValue;

  for (const row of rows) {
    diff[row.fieldKey] = { old: row.humanValue, new: row.aiValue };

    // --- Chief Complaint ---
    if (row.fieldKey === "chief_complaint") {
      const existing = useEncounterStore.getState().encounters[encounterId]?.chiefComplaint ?? "";
      const updated = existing.trim() ? `${existing} | ${row.aiValue}` : row.aiValue;
      setChiefComplaint(encounterId, updated);
      continue;
    }

    // --- Assessment & Plan ---
    if (row.fieldKey === "assessment_and_plan") {
      setAssessmentAndPlan(encounterId, row.aiValue);
      continue;
    }

    // --- Vitals ---
    if (row.fieldKey.startsWith("vitals.")) {
      const storeKey = VITALS_AI_TO_STORE[row.fieldKey];
      if (storeKey) {
        // Boolean fields stored as "Yes"/"No" display strings
        if (storeKey === "pupils_equal_round_reactive" || storeKey === "relative_afferent_pupillary_defect") {
          setVitalsField(encounterId, storeKey as never, row.aiValue === "Yes");
        } else {
          setVitalsField(encounterId, storeKey as never, row.aiValue);
        }
      }
      continue;
    }

    // --- Exam Findings ---
    if (row.fieldKey.startsWith("exam.")) {
      // exam.anterior.od.cornea.status → [exam, anterior, od, cornea, status]
      const parts = row.fieldKey.split(".");
      if (parts.length >= 5) {
        const [, sectionShort, eye, structure, fieldName] = parts;
        const section = (sectionShort === "anterior" ? "anterior_segment" : "posterior_segment") as ExamSection;

        // Map AI status through the fuzzy mapper for dropdown compliance
        let value = row.aiValue;
        if (fieldName === "status") {
          const mapped = mapAiStatus(section, structure, row.aiValue, "");
          // If mapper returns "Other" for ambiguous input, default to "Abnormal"
          // (false positive > missed finding)
          value = mapped.status === "Other" ? "Abnormal" : mapped.status;
        }

        setStructureField(
          encounterId,
          section,
          eye as "od" | "os",
          structure,
          fieldName as keyof StructureFinding,
          value,
        );
      }
      continue;
    }

    // --- Diagnoses (laterality update) ---
    if (row.fieldKey.startsWith("dx.") && row.fieldKey.endsWith(".laterality")) {
      // ICD codes contain dots (e.g. "H52.13"), so can't use split — extract between "dx." and ".laterality"
      const icdCode = row.fieldKey.slice("dx.".length, -".laterality".length);
      const dxStore = useDiagnosisStore.getState();
      const existing = dxStore.encounters[encounterId]?.diagnoses?.find(
        (d) => d.icd10Code === icdCode,
      );
      if (existing) {
        await dxStore.updateDiagnosis(encounterId, existing.id, {
          eyeAffected: row.aiValue as EyeLaterality,
        });
      }
      continue;
    }

    // --- Diagnoses (description — display-only, schema change needed) ---
    if (row.fieldKey.startsWith("dx.") && row.fieldKey.endsWith(".description")) {
      continue;
    }

    // --- Diagnoses (new additions) ---
    if (row.fieldKey.startsWith("dx.") && row.fieldKey.endsWith(".new")) {
      // Use aiRawData for reliable extraction (no regex parsing of display strings)
      if (row.aiRawData) {
        await addDiagnosis(encounterId, {
          icd10Code: row.aiRawData.icdCode as string,
          description: row.aiRawData.description as string,
          eyeAffected: row.aiRawData.laterality as EyeLaterality,
        });
      }
      continue;
    }

    // --- Refraction ---
    if (row.fieldKey.startsWith("refraction.")) {
      const [, eye, field] = row.fieldKey.split(".");
      const mapping = RX_FIELD_TO_ROW[field];
      if (mapping) {
        const rowKey = eye === "OD" ? mapping.od : mapping.os;
        setCellValue(MANIFEST_RX_COL, rowKey, row.aiValue);
      }
      continue;
    }
  }

  // Save SOAP narrative
  if (soapText) {
    setAiSummary(encounterId, soapText);
  }

  // Fire-and-forget audit log
  fetch(`/api/encounters/${encounterId}/ai-scribe/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes: diff }),
  }).catch((e) => console.error("Audit log failed:", e));

  return rows.length;
}
