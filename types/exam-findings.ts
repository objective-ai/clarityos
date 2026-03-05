// ---------------------------------------------------------------------------
// Types — mirrors Python exam_findings schemas
// ---------------------------------------------------------------------------

/** Atomic unit: one anatomical structure, one eye */
export interface StructureFinding {
  status: string;
  severity: string | null;
  finding: string;
}

// -- Anterior Segment (per eye) --

export interface AnteriorSegmentFindings {
  lids_lashes: StructureFinding;
  conjunctiva_sclera: StructureFinding;
  cornea: StructureFinding;
  anterior_chamber: StructureFinding;
  iris: StructureFinding;
  lens: StructureFinding;
  tear_film: StructureFinding;
  angles: StructureFinding;
}

// -- Posterior Segment (per eye) --

export interface PosteriorSegmentFindings {
  cup_to_disc_ratio: StructureFinding;
  optic_nerve: StructureFinding;
  macula: StructureFinding;
  vitreous: StructureFinding;
  vessels: StructureFinding;
  periphery: StructureFinding;
}

// -- Union & section key --

export type ExamSection = "anterior_segment" | "posterior_segment";
export type SectionFindings = AnteriorSegmentFindings | PosteriorSegmentFindings;

export type FindingsSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface FindingsFieldError {
  field: string;
  message: string;
}

/** Store key = "encounterId:section" */
export type FindingsStoreKey = `${string}:${ExamSection}`;

/** Draft shape stored in Zustand */
export interface FindingsDraft {
  is_normal_wnl: boolean;
  findings_od: Record<string, StructureFinding>;
  findings_os: Record<string, StructureFinding>;
  provider_notes: string;
}

export interface FindingsState {
  draft: FindingsDraft;
  committed: FindingsDraft | null;
  saveStatus: FindingsSaveStatus;
  errors: FindingsFieldError[];
  lastSavedAt: Date | null;
}

// -- Field metadata (drives the grid UI) --

export interface FindingFieldMeta {
  key: string;
  label: string;
  options: string[];
  defaultStatus: string;
}

// ---------------------------------------------------------------------------
// Blank factories
// ---------------------------------------------------------------------------

export function blankStructure(defaultStatus: string): StructureFinding {
  return { status: defaultStatus, severity: null, finding: "" };
}

export function blankAnteriorFindings(): Record<string, StructureFinding> {
  return {
    lids_lashes: blankStructure("Normal"),
    conjunctiva_sclera: blankStructure("White & quiet"),
    cornea: blankStructure("Clear"),
    anterior_chamber: blankStructure("Deep & quiet"),
    iris: blankStructure("Flat, normal architecture"),
    lens: blankStructure("Clear"),
    tear_film: blankStructure("Stable"),
    angles: blankStructure("Open (Grade 4)"),
  };
}

export function blankPosteriorFindings(): Record<string, StructureFinding> {
  return {
    cup_to_disc_ratio: blankStructure("0.3"),
    optic_nerve: blankStructure("Healthy, pink"),
    macula: blankStructure("Flat & intact"),
    vitreous: blankStructure("Clear"),
    vessels: blankStructure("Normal A/V ratio"),
    periphery: blankStructure("Flat & intact"),
  };
}

export function blankDraft(section: ExamSection): FindingsDraft {
  const findings =
    section === "anterior_segment"
      ? blankAnteriorFindings()
      : blankPosteriorFindings();
  return {
    is_normal_wnl: false,
    findings_od: findings,
    findings_os:
      section === "anterior_segment"
        ? blankAnteriorFindings()
        : blankPosteriorFindings(),
    provider_notes: "",
  };
}
