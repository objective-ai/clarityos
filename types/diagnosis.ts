// ---------------------------------------------------------------------------
// Types — mirrors Python diagnosis schemas
// ---------------------------------------------------------------------------

export type EyeLaterality = "OD" | "OS" | "OU";

export interface Diagnosis {
  id: string;
  encounter_id: string;
  icd10_code: string;
  description: string;
  eye_affected: EyeLaterality | null;
  severity: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagnosisCreateRequest {
  icd10_code: string;
  description: string;
  eye_affected?: EyeLaterality | null;
  severity?: string | null;
  status?: string;
  notes?: string | null;
}

export interface DiagnosisUpdateRequest {
  eye_affected?: EyeLaterality | null;
  severity?: string | null;
  status?: string | null;
  notes?: string | null;
}
