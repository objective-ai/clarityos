/**
 * types/refraction.ts
 *
 * TypeScript types for the refraction grid, mirroring the backend
 * EyeRx and RefractionCreate Pydantic schemas (app/schemas/refraction.py).
 *
 * Key conventions that match the Python side:
 *   - Sphere / Cylinder / Add are stored as numbers (Decimal on backend).
 *     We use `number | null` and round to nearest 0.25 on serialisation.
 *   - Axis is an integer 1–180.  Display-formatted as a 3-digit string ("090").
 *   - RefractionType enum values are lowercase strings matching Python enum.
 *   - PD is stored binocular (pdDistance/pdNear) OR monocular (pdOd/pdOs),
 *     never both simultaneously.
 *
 * GridCoord: the cell addressing scheme used for keyboard navigation.
 *   col  = refraction column index (0=Habitual, 1=Auto, 2=Manifest, 3=Final)
 *   row  = field row key (e.g. "od_sphere", "os_axis", "pd_distance")
 */

// ---------------------------------------------------------------------------
// Refraction type enum — matches Python RefractionType
// ---------------------------------------------------------------------------

export type RefractionType =
  | "habitual"
  | "auto"
  | "manifest"
  | "cycloplegic"
  | "final";

export const REFRACTION_COLUMNS: RefractionType[] = [
  "habitual",
  "auto",
  "manifest",
  "final",
];

export const REFRACTION_COLUMN_LABELS: Record<RefractionType, string> = {
  habitual:    "Habitual",
  auto:        "Auto Ref",
  manifest:    "Manifest",
  cycloplegic: "Cycloplegic",
  final:       "Final Rx",
};

// ---------------------------------------------------------------------------
// Per-eye prescription fields
// ---------------------------------------------------------------------------

export interface EyeRxDraft {
  sphere:        number | null;
  cylinder:      number | null;
  axis:          number | null;  // integer 1–180
  add:           number | null;
  prism:         number | null;
  prism_base:    "UP" | "DOWN" | "IN" | "OUT" | null;
  visual_acuity: string | null;
}

// ---------------------------------------------------------------------------
// A single refraction measurement (one column in the grid)
// ---------------------------------------------------------------------------

export interface RefractionDraft {
  /** Stable server-assigned UUID — null until first save */
  id:              string | null;
  refraction_type: RefractionType;
  od:              EyeRxDraft;
  os:              EyeRxDraft;
  pd_distance:     number | null;
  pd_near:         number | null;
  pd_od:           number | null;
  pd_os:           number | null;
  is_final_rx:     boolean;
  notes:           string | null;
}

// ---------------------------------------------------------------------------
// Validation error shape (mirrors Pydantic field error structure)
// ---------------------------------------------------------------------------

export interface FieldError {
  field: string;   // e.g. "od.axis"
  message: string;
}

// ---------------------------------------------------------------------------
// Per-column save lifecycle
// ---------------------------------------------------------------------------

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface ColumnState {
  draft:      RefractionDraft;
  committed:  RefractionDraft | null; // last successfully saved state
  saveStatus: SaveStatus;
  errors:     FieldError[];
  lastSavedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Grid row keys — the row addressing scheme for keyboard navigation
// ---------------------------------------------------------------------------

export type EyeSection = "OD" | "OS";

export type RowKey =
  | "od_sphere"
  | "od_cylinder"
  | "od_axis"
  | "od_add"
  | "od_va"
  | "os_sphere"
  | "os_cylinder"
  | "os_axis"
  | "os_add"
  | "os_va"
  | "pd_distance"
  | "pd_near";

export const ROW_KEYS: RowKey[] = [
  "od_sphere",
  "od_cylinder",
  "od_axis",
  "od_add",
  "od_va",
  "os_sphere",
  "os_cylinder",
  "os_axis",
  "os_add",
  "os_va",
  "pd_distance",
  "pd_near",
];

export const ROW_LABELS: Record<RowKey, string> = {
  od_sphere:   "SPH",
  od_cylinder: "CYL",
  od_axis:     "AXIS",
  od_add:      "ADD",
  od_va:       "VA",
  os_sphere:   "SPH",
  os_cylinder: "CYL",
  os_axis:     "AXIS",
  os_add:      "ADD",
  os_va:       "VA",
  pd_distance: "PD dist",
  pd_near:     "PD near",
};

// ---------------------------------------------------------------------------
// Grid coordinate — uniquely identifies one input cell
// ---------------------------------------------------------------------------

export interface GridCoord {
  colIndex: number;  // 0–3 (Habitual/Auto/Manifest/Final)
  rowKey:   RowKey;
}

/** Build the DOM element ID for a cell — used by keyboard navigation */
export function cellId(colIndex: number, rowKey: RowKey): string {
  return `rx-cell-${colIndex}-${rowKey}`;
}

// ---------------------------------------------------------------------------
// Blank drafts for initialising the store
// ---------------------------------------------------------------------------

const BLANK_EYE: EyeRxDraft = {
  sphere:        null,
  cylinder:      null,
  axis:          null,
  add:           null,
  prism:         null,
  prism_base:    null,
  visual_acuity: null,
};

export function blankDraft(type: RefractionType): RefractionDraft {
  return {
    id:              null,
    refraction_type: type,
    od:              { ...BLANK_EYE },
    os:              { ...BLANK_EYE },
    pd_distance:     null,
    pd_near:         null,
    pd_od:           null,
    pd_os:           null,
    is_final_rx:     type === "final",
    notes:           null,
  };
}

// ---------------------------------------------------------------------------
// Value accessors — read/write a RowKey on a RefractionDraft
// (avoids switch statements scattered across the grid)
// ---------------------------------------------------------------------------

export function getDraftValue(
  draft: RefractionDraft,
  rowKey: RowKey
): number | string | null {
  switch (rowKey) {
    case "od_sphere":   return draft.od.sphere;
    case "od_cylinder": return draft.od.cylinder;
    case "od_axis":     return draft.od.axis;
    case "od_add":      return draft.od.add;
    case "od_va":       return draft.od.visual_acuity;
    case "os_sphere":   return draft.os.sphere;
    case "os_cylinder": return draft.os.cylinder;
    case "os_axis":     return draft.os.axis;
    case "os_add":      return draft.os.add;
    case "os_va":       return draft.os.visual_acuity;
    case "pd_distance": return draft.pd_distance;
    case "pd_near":     return draft.pd_near;
  }
}

export function setDraftValue(
  draft: RefractionDraft,
  rowKey: RowKey,
  value: number | string | null
): RefractionDraft {
  const d = structuredClone(draft);
  switch (rowKey) {
    case "od_sphere":   d.od.sphere        = value as number | null; break;
    case "od_cylinder": d.od.cylinder      = value as number | null; break;
    case "od_axis":     d.od.axis          = value as number | null; break;
    case "od_add":      d.od.add           = value as number | null; break;
    case "od_va":       d.od.visual_acuity = value as string | null; break;
    case "os_sphere":   d.os.sphere        = value as number | null; break;
    case "os_cylinder": d.os.cylinder      = value as number | null; break;
    case "os_axis":     d.os.axis          = value as number | null; break;
    case "os_add":      d.os.add           = value as number | null; break;
    case "os_va":       d.os.visual_acuity = value as string | null; break;
    case "pd_distance": d.pd_distance      = value as number | null; break;
    case "pd_near":     d.pd_near          = value as number | null; break;
  }
  return d;
}
