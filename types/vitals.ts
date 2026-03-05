// ---------------------------------------------------------------------------
// Types — mirrors Python VitalsAndPretest schema
// ---------------------------------------------------------------------------

export type IopMethod = "goldmann" | "icare" | "air_puff";

export interface VitalsDraft {
  id: string | null;
  encounter_id: string;

  // IOP
  iop_od: number | null;
  iop_os: number | null;
  iop_method: IopMethod | null;

  // Visual Acuity (Snellen strings like "20/20")
  ucva_od: string | null;
  ucva_os: string | null;
  bcva_od: string | null;
  bcva_os: string | null;
  near_va_od: string | null;
  near_va_os: string | null;

  // Systemic
  blood_pressure: string | null; // "120/80"
  pulse: number | null; // 30-250

  // Pupil assessment
  pupils_equal_round_reactive: boolean;
  relative_afferent_pupillary_defect: boolean;

  // Notes
  cover_test_notes: string | null;
  technician_notes: string | null;
}

export type VitalsSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface VitalsFieldError {
  field: string;
  message: string;
}

export interface VitalsState {
  draft: VitalsDraft;
  committed: VitalsDraft | null;
  saveStatus: VitalsSaveStatus;
  errors: VitalsFieldError[];
  lastSavedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function blankVitalsDraft(encounterId: string): VitalsDraft {
  return {
    id: null,
    encounter_id: encounterId,
    iop_od: null,
    iop_os: null,
    iop_method: null,
    ucva_od: null,
    ucva_os: null,
    bcva_od: null,
    bcva_os: null,
    near_va_od: null,
    near_va_os: null,
    blood_pressure: null,
    pulse: null,
    pupils_equal_round_reactive: true,
    relative_afferent_pupillary_defect: false,
    cover_test_notes: null,
    technician_notes: null,
  };
}

export function isIopElevated(value: number | null): boolean {
  return value !== null && value > 21;
}
