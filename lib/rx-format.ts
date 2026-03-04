/**
 * lib/rx-format.ts
 *
 * Formatting, parsing, and validation utilities for optical prescription values.
 *
 * These mirror the Python-side validation in app/schemas/refraction.py:
 *   - Sphere / Cylinder round to nearest 0.25 D (backend does this too)
 *   - Axis clamps to integer 1–180 (no zero, wraps from 180→1)
 *   - Format conventions match what optometrists expect to SEE on screen
 *
 * Display formats:
 *   Sphere     -2.25     → "-2.25"   (always 2 decimal places, sign explicit for +)
 *   Cylinder   -1.00     → "-1.00"   (same; almost always negative)
 *   Axis       90        → "090"     (always 3 digits, no sign, no decimal)
 *   Add        +2.00     → "+2.00"   (always positive, always explicit + sign)
 *   VA         20/20     → "20/20"   (free string, no formatting)
 *   PD         63.5      → "63.5"    (one decimal, no sign)
 *
 * Raw formats (what the input shows while focused):
 *   Sphere     -2.25     → "-2.25"   (no change)
 *   Cylinder   -1.00     → "-1.00"
 *   Axis       090       → "90"      (strip leading zeros)
 *   Add        +2.00     → "2"       (strip sign, let user type raw)
 */

import type { RowKey } from "@/types/refraction";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SPHERE_MIN  = -25.00;
export const SPHERE_MAX  =  25.00;
export const CYLINDER_MIN = -8.00;
export const CYLINDER_MAX =  8.00;
export const ADD_MIN      =  0.75;
export const ADD_MAX      =  3.50;
export const AXIS_MIN     =  1;
export const AXIS_MAX     =  180;
export const PD_MIN       = 40.0;
export const PD_MAX       = 80.0;
export const STEP         =  0.25;

// ---------------------------------------------------------------------------
// Rounding
// ---------------------------------------------------------------------------

/**
 * Round to the nearest 0.25 diopter — the standard clinical step.
 * Mirrors Python's _round_to_quarter_diopter().
 *
 * -2.1  → -2.00   -2.13 → -2.25   +0.10 → 0.00
 */
export function roundToQuarter(value: number): number {
  return Math.round(value / STEP) * STEP;
}

// ---------------------------------------------------------------------------
// Display formatters (called on blur — what the doctor SEES when not editing)
// ---------------------------------------------------------------------------

/**
 * Format sphere or cylinder for display.
 * Always 2 decimal places; explicit + sign for positive values.
 *   -2.25  → "-2.25"
 *    0.00  → "0.00"
 *   +1.50  → "+1.50"
 */
export function formatDiopter(value: number | null): string {
  if (value === null) return "";
  const rounded = roundToQuarter(value);
  const abs = Math.abs(rounded).toFixed(2);
  if (rounded > 0) return `+${abs}`;
  if (rounded < 0) return `-${abs.replace("-", "")}`;
  return abs; // 0.00
}

/**
 * Format axis for display: always 3 digits, no decimal.
 *   90  → "090"   1  → "001"   180 → "180"
 */
export function formatAxis(value: number | null): string {
  if (value === null) return "";
  const clamped = clampAxis(Math.round(value));
  return String(clamped).padStart(3, "0");
}

/**
 * Format Add power for display: always positive, explicit + sign.
 *   2.00 → "+2.00"
 */
export function formatAdd(value: number | null): string {
  if (value === null) return "";
  const rounded = roundToQuarter(Math.abs(value));
  return `+${rounded.toFixed(2)}`;
}

/**
 * Format PD for display: one decimal place.
 *   63.5 → "63.5"
 */
export function formatPD(value: number | null): string {
  if (value === null) return "";
  return value.toFixed(1);
}

/**
 * Dispatch to the right formatter based on the row key.
 */
export function formatCellValue(rowKey: RowKey, value: number | string | null): string {
  if (value === null) return "";
  switch (rowKey) {
    case "od_sphere":
    case "os_sphere":
    case "od_cylinder":
    case "os_cylinder":
      return formatDiopter(value as number);
    case "od_axis":
    case "os_axis":
      return formatAxis(value as number);
    case "od_add":
    case "os_add":
      return formatAdd(value as number);
    case "od_va":
    case "os_va":
      return String(value);
    case "pd_distance":
    case "pd_near":
      return formatPD(value as number);
  }
}

/**
 * Raw value for the focused input (stripped of display formatting).
 * This is what populates the <input> when the doctor focuses a cell.
 */
export function rawCellValue(rowKey: RowKey, value: number | string | null): string {
  if (value === null) return "";
  switch (rowKey) {
    case "od_sphere":
    case "os_sphere":
    case "od_cylinder":
    case "os_cylinder":
      return String(value); // e.g. "-2.25"
    case "od_axis":
    case "os_axis":
      return String(Math.round(value as number)); // strip leading zeros
    case "od_add":
    case "os_add":
      return String(Math.abs(value as number));
    case "od_va":
    case "os_va":
      return String(value);
    case "pd_distance":
    case "pd_near":
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

export function clampAxis(value: number): number {
  if (value <= 0) return 180 + (value % 180);
  if (value > 180) return value % 180 || 180;
  return value;
}

export function clampSphere(value: number): number {
  return Math.max(SPHERE_MIN, Math.min(SPHERE_MAX, roundToQuarter(value)));
}

export function clampCylinder(value: number): number {
  return Math.max(CYLINDER_MIN, Math.min(CYLINDER_MAX, roundToQuarter(value)));
}

export function clampAdd(value: number): number {
  return Math.max(ADD_MIN, Math.min(ADD_MAX, roundToQuarter(value)));
}

// ---------------------------------------------------------------------------
// Parsing (raw string → typed number or null)
// ---------------------------------------------------------------------------

/**
 * Parse a diopter input string into a number.
 * Returns null for empty / invalid inputs.
 *
 * Handles: "−2.25" (unicode minus), "+1.5", ".5", "2" (implicit .00)
 */
export function parseDiopter(raw: string): number | null {
  if (!raw.trim()) return null;
  // Normalise unicode minus sign to ASCII
  const normalized = raw.trim().replace("−", "-").replace("–", "-");
  const num = parseFloat(normalized);
  if (isNaN(num)) return null;
  return roundToQuarter(num);
}

/**
 * Parse axis input: integer 1–180.
 */
export function parseAxis(raw: string): number | null {
  if (!raw.trim()) return null;
  const num = parseInt(raw, 10);
  if (isNaN(num)) return null;
  return clampAxis(num);
}

/**
 * Parse Add input: always positive.
 */
export function parseAdd(raw: string): number | null {
  if (!raw.trim()) return null;
  const num = parseFloat(raw.replace("+", ""));
  if (isNaN(num) || num < 0) return null;
  return roundToQuarter(Math.abs(num));
}

/**
 * Parse PD input.
 */
export function parsePD(raw: string): number | null {
  if (!raw.trim()) return null;
  const num = parseFloat(raw);
  if (isNaN(num)) return null;
  return Math.max(PD_MIN, Math.min(PD_MAX, Math.round(num * 2) / 2)); // round to 0.5
}

/**
 * Dispatch to the right parser based on the row key.
 * Returns { value: number|string|null, error: string|null }
 */
export function parseCellValue(
  rowKey: RowKey,
  raw: string
): { value: number | string | null; error: string | null } {
  const empty = !raw.trim();

  switch (rowKey) {
    case "od_sphere":
    case "os_sphere": {
      if (empty) return { value: null, error: null };
      const v = parseDiopter(raw);
      if (v === null) return { value: null, error: "Must be a number (e.g. -2.25)" };
      if (v < SPHERE_MIN || v > SPHERE_MAX) return { value: null, error: `Range: ${SPHERE_MIN} to +${SPHERE_MAX}` };
      return { value: v, error: null };
    }

    case "od_cylinder":
    case "os_cylinder": {
      if (empty) return { value: null, error: null };
      const v = parseDiopter(raw);
      if (v === null) return { value: null, error: "Must be a number (e.g. -1.00)" };
      if (v < CYLINDER_MIN || v > CYLINDER_MAX) return { value: null, error: `Range: ${CYLINDER_MIN} to +${CYLINDER_MAX}` };
      return { value: v, error: null };
    }

    case "od_axis":
    case "os_axis": {
      if (empty) return { value: null, error: null };
      const v = parseAxis(raw);
      if (v === null) return { value: null, error: "Integer 1–180" };
      return { value: v, error: null };
    }

    case "od_add":
    case "os_add": {
      if (empty) return { value: null, error: null };
      const v = parseAdd(raw);
      if (v === null) return { value: null, error: "Must be a positive number" };
      if (v < ADD_MIN || v > ADD_MAX) return { value: null, error: `Range: +${ADD_MIN} to +${ADD_MAX}` };
      return { value: v, error: null };
    }

    case "od_va":
    case "os_va":
      return { value: empty ? null : raw.trim(), error: null };

    case "pd_distance":
    case "pd_near": {
      if (empty) return { value: null, error: null };
      const v = parsePD(raw);
      if (v === null) return { value: null, error: `Range: ${PD_MIN}–${PD_MAX} mm` };
      return { value: v, error: null };
    }
  }
}

// ---------------------------------------------------------------------------
// Increment / decrement (for +/- keyboard shortcuts)
// ---------------------------------------------------------------------------

/**
 * Increment a sphere or cylinder value by one 0.25D step.
 * Handles the null → 0.00 → +0.25 progression.
 */
export function incrementDiopter(current: number | null): number {
  const base = current ?? 0;
  return clampSphere(base + STEP);
}

export function decrementDiopter(current: number | null): number {
  const base = current ?? 0;
  return clampSphere(base - STEP);
}

export function incrementAxis(current: number | null): number {
  return clampAxis((current ?? 0) + 1);
}

export function decrementAxis(current: number | null): number {
  return clampAxis((current ?? 1) - 1);
}

// ---------------------------------------------------------------------------
// Field type classification (used by keyboard handler)
// ---------------------------------------------------------------------------

export type FieldType = "diopter" | "axis" | "add" | "va" | "pd";

export function getFieldType(rowKey: RowKey): FieldType {
  switch (rowKey) {
    case "od_sphere":
    case "os_sphere":
    case "od_cylinder":
    case "os_cylinder":
      return "diopter";
    case "od_axis":
    case "os_axis":
      return "axis";
    case "od_add":
    case "os_add":
      return "add";
    case "od_va":
    case "os_va":
      return "va";
    case "pd_distance":
    case "pd_near":
      return "pd";
  }
}

/**
 * Does this row belong to OD or OS section?
 */
export function getEyeForRow(rowKey: RowKey): "OD" | "OS" | "binocular" {
  if (rowKey.startsWith("od_")) return "OD";
  if (rowKey.startsWith("os_")) return "OS";
  return "binocular";
}

/**
 * Placeholder text for each field type — shown when cell is empty.
 */
export function getPlaceholder(rowKey: RowKey): string {
  const type = getFieldType(rowKey);
  switch (type) {
    case "diopter": return "0.00";
    case "axis":    return "---";
    case "add":     return "+0.00";
    case "va":      return "20/—";
    case "pd":      return "00.0";
  }
}

/**
 * Input mode: "numeric" for number pads, "text" for VA.
 */
export function getInputMode(rowKey: RowKey): React.HTMLAttributes<HTMLInputElement>["inputMode"] {
  return getFieldType(rowKey) === "va" ? "text" : "decimal";
}
