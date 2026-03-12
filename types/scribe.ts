/**
 * types/scribe.ts
 *
 * Types for the AI Scribe Validation Station.
 * Confidence-wrapped values returned by Claude for doctor review.
 */

// ---------------------------------------------------------------------------
// Confidence wrapper
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceValue<T> {
  value: T | null;
  confidence: ConfidenceLevel;
}

// ---------------------------------------------------------------------------
// Structured data from Claude (with confidence)
// ---------------------------------------------------------------------------

export interface ScribeVitalsV2 {
  iop_od: ConfidenceValue<number>;
  iop_os: ConfidenceValue<number>;
  va_od_distance: ConfidenceValue<string>;
  va_os_distance: ConfidenceValue<string>;
  va_od_near: ConfidenceValue<string>;
  va_os_near: ConfidenceValue<string>;
  bp_systolic: ConfidenceValue<number>;
  bp_diastolic: ConfidenceValue<number>;
  pupils_od: ConfidenceValue<string>;
  pupils_os: ConfidenceValue<string>;
}

export interface ScribeStructureFindingV2 {
  status: "normal" | "abnormal";
  notes: string;
  confidence: ConfidenceLevel;
}

export interface ScribeExamFindingsV2 {
  anterior?: {
    OD?: Record<string, ScribeStructureFindingV2>;
    OS?: Record<string, ScribeStructureFindingV2>;
  };
  posterior?: {
    OD?: Record<string, ScribeStructureFindingV2>;
    OS?: Record<string, ScribeStructureFindingV2>;
  };
}

export interface ScribeDiagnosisV2 {
  icdCode: string;
  description: string;
  laterality: "OD" | "OS" | "OU";
  confidence: ConfidenceLevel;
}

export interface ScribeEyeRefractionV2 {
  sphere: string;
  cylinder: string;
  axis: string;
  add: string;
  confidence: ConfidenceLevel;
}

export interface ScribeRefractionV2 {
  OD?: ScribeEyeRefractionV2;
  OS?: ScribeEyeRefractionV2;
}

export interface ScribeStructuredDataV2 {
  chief_complaint: ConfidenceValue<string>;
  assessment_and_plan: ConfidenceValue<string>;
  vitals?: ScribeVitalsV2;
  exam_findings?: ScribeExamFindingsV2;
  diagnoses?: ScribeDiagnosisV2[];
  refraction?: ScribeRefractionV2;
}
