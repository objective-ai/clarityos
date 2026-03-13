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
const FINAL_RX_COL = 3;

// Vitals: AI key → store key mapping
const VITALS_AI_TO_STORE: Record<string, string> = {
  "vitals.iop_od": "iop_od",
  "vitals.iop_os": "iop_os",
  "vitals.ucva_od": "ucva_od",
  "vitals.ucva_os": "ucva_os",
  "vitals.near_va_od": "near_va_od",
  "vitals.near_va_os": "near_va_os",
  "vitals.blood_pressure": "blood_pressure",
  "vitals.pupils_od": "pupils_od",
  "vitals.pupils_os": "pupils_os",
};

export async function applyResolutions(
  encounterId: string,
  rows: ConflictRow[],
  soapText: string,
): Promise<void> {
  const selected = rows.filter((r) => r.resolution === "use_ai");
  if (selected.length === 0) return;

  const diff: Record<string, { old: unknown; new: unknown }> = {};

  const setChiefComplaint = useEncounterStore.getState().setChiefComplaint;
  const setAssessmentAndPlan = useEncounterStore.getState().setAssessmentAndPlan;
  const setAiSummary = useEncounterStore.getState().setAiSummary;
  const setVitalsField = useVitalsStore.getState().setField;
  const setStructureField = useExamFindingsStore.getState().setStructureField;
  const addDiagnosis = useDiagnosisStore.getState().addDiagnosis;
  const setCellValue = useRefractionStore.getState().setCellValue;

  for (const row of selected) {
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
        setVitalsField(encounterId, storeKey as never, row.aiValue);
      }
      continue;
    }

    // --- Exam Findings ---
    if (row.fieldKey.startsWith("exam.")) {
      // exam.anterior.od.cornea.status → [exam, anterior, od, cornea, status]
      const parts = row.fieldKey.split(".");
      if (parts.length >= 5) {
        const [, sectionShort, eye, structure, fieldName] = parts;
        const section = sectionShort === "anterior" ? "anterior_segment" : "posterior_segment";
        setStructureField(
          encounterId,
          section as ExamSection,
          eye as "od" | "os",
          structure,
          fieldName as keyof StructureFinding,
          row.aiValue,
        );
      }
      continue;
    }

    // --- Diagnoses (new additions) ---
    if (row.fieldKey.startsWith("dx.") && row.fieldKey.endsWith(".new")) {
      // Extract ICD code from fieldKey: dx.H52.03.new
      // The aiValue format: "H52.03 — Description (Laterality)"
      const match = row.aiValue.match(/^(.+?)\s*—\s*(.+?)\s*\((\w+)\)$/);
      if (match) {
        const [, icdCode, description, laterality] = match;
        await addDiagnosis(encounterId, {
          icd10Code: icdCode,
          description,
          eyeAffected: laterality as EyeLaterality,
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
        setCellValue(FINAL_RX_COL, rowKey, row.aiValue);
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
}
