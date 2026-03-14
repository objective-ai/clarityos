// ---------------------------------------------------------------------------
// Types — mirrors Python diagnosis schemas
// ---------------------------------------------------------------------------

export type EyeLaterality = "OD" | "OS" | "OU";

export interface Diagnosis {
  id: string;
  encounterId: string;
  icd10Code: string;
  description: string;
  eyeAffected: EyeLaterality | null;
  severity: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosisCreateRequest {
  icd10Code: string;
  description: string;
  eyeAffected?: EyeLaterality | null;
  severity?: string | null;
  status?: string;
  notes?: string | null;
}

export interface DiagnosisUpdateRequest {
  description?: string;
  eyeAffected?: EyeLaterality | null;
  severity?: string | null;
  status?: string | null;
  notes?: string | null;
}
