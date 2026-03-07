// ---------------------------------------------------------------------------
// Types — mirrors Python patient_problem schemas
// ---------------------------------------------------------------------------

import type { EyeLaterality } from "./diagnosis";

export type ProblemStatus = "active" | "inactive" | "resolved";

export interface PatientProblem {
  id: string;
  patientId: string;
  icd10Code: string;
  description: string;
  eyeAffected: EyeLaterality | null;
  severity: string | null;
  status: ProblemStatus;
  onsetDate: string | null;
  resolvedDate: string | null;
  sourceEncounterId: string | null;
  notes: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemCreateRequest {
  icd10Code: string;
  description: string;
  eyeAffected?: EyeLaterality | null;
  severity?: string | null;
  status?: ProblemStatus;
  onsetDate?: string | null;
  sourceEncounterId?: string | null;
  notes?: string | null;
}

export interface ProblemUpdateRequest {
  eyeAffected?: EyeLaterality | null;
  severity?: string | null;
  status?: ProblemStatus | null;
  onsetDate?: string | null;
  resolvedDate?: string | null;
  notes?: string | null;
}
