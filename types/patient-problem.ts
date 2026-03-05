// ---------------------------------------------------------------------------
// Types — mirrors Python patient_problem schemas
// ---------------------------------------------------------------------------

import type { EyeLaterality } from "./diagnosis";

export type ProblemStatus = "active" | "inactive" | "resolved";

export interface PatientProblem {
  id: string;
  patient_id: string;
  icd10_code: string;
  description: string;
  eye_affected: EyeLaterality | null;
  severity: string | null;
  status: ProblemStatus;
  onset_date: string | null;
  resolved_date: string | null;
  source_encounter_id: string | null;
  notes: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProblemCreateRequest {
  icd10_code: string;
  description: string;
  eye_affected?: EyeLaterality | null;
  severity?: string | null;
  status?: ProblemStatus;
  onset_date?: string | null;
  source_encounter_id?: string | null;
  notes?: string | null;
}

export interface ProblemUpdateRequest {
  eye_affected?: EyeLaterality | null;
  severity?: string | null;
  status?: ProblemStatus | null;
  onset_date?: string | null;
  resolved_date?: string | null;
  notes?: string | null;
}
