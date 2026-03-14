/**
 * lib/scribe-normalizer.ts
 *
 * Post-parse normalizer for AI Scribe structured data.
 * Runs AFTER JSON.parse() in handleParsedJson(), BEFORE the conflict resolver.
 *
 * Fixes formatting issues Claude's output may have:
 *   - Refraction: ensures 2dp with correct sign convention
 *   - Axis: clamps to 1–180, rounds to integer
 *   - IOP: rounds to integer mmHg
 *
 * Reuses existing rx-format.ts parsers/formatters for consistency with
 * what the refraction grid already accepts.
 */

import type { ScribeStructuredDataV2, ConfidenceValue } from "@/types/scribe";
import {
  parseDiopter,
  parseAdd,
  parseAxis,
  formatDiopter,
  formatAdd,
} from "@/lib/rx-format";

// ---------------------------------------------------------------------------
// Field-level normalizers
// ---------------------------------------------------------------------------

/**
 * Normalize a refraction string (sphere or cylinder).
 * Uses rx-format's parseDiopter (rounds to 0.25D) + formatDiopter (2dp with sign).
 *
 * Cylinder is forced negative (minus-cylinder convention).
 * "plano" / "0" / "0.00" → null (skip rather than write zero sphere/cyl).
 */
export function normalizeRxString(
  val: string | null | undefined,
  field: "sphere" | "cylinder" | "add",
): string | null {
  if (val == null || !val.trim()) return null;

  const trimmed = val.trim().toLowerCase();
  if (trimmed === "plano" || trimmed === "pl") return null;

  if (field === "add") {
    const parsed = parseAdd(val);
    if (parsed == null) return null;
    return formatAdd(parsed); // "+2.00"
  }

  const parsed = parseDiopter(val);
  if (parsed == null) return null;

  // Zero sphere/cylinder → null (not clinically meaningful to write)
  if (parsed === 0) return null;

  if (field === "cylinder") {
    // Minus-cylinder convention: cylinder is always negative
    const forced = parsed > 0 ? -parsed : parsed;
    return formatDiopter(forced);
  }

  return formatDiopter(parsed);
}

/**
 * Normalize axis string: clamp 1–180, round to integer, return as string.
 * Uses rx-format's parseAxis (handles clamping + integer parse).
 * Display format: no leading zeros (AI context, not grid display).
 */
export function normalizeAxis(val: string | null | undefined): string | null {
  if (val == null || !val.trim()) return null;
  const parsed = parseAxis(val);
  if (parsed == null) return null;
  // Return plain integer string (not 3-digit padded — that's for grid display)
  return String(parsed);
}

/**
 * Normalize IOP: round to integer mmHg, preserve confidence.
 */
export function normalizeIopValue(
  cv: ConfidenceValue<number>,
): ConfidenceValue<number> {
  if (cv.value == null) return cv;
  return { value: Math.round(cv.value), confidence: cv.confidence };
}

// ---------------------------------------------------------------------------
// Top-level normalizer
// ---------------------------------------------------------------------------

/**
 * Normalize an entire ScribeStructuredDataV2 payload.
 * Returns a new object — no mutation.
 */
export function normalizeScribeData(
  data: ScribeStructuredDataV2,
): ScribeStructuredDataV2 {
  const result = { ...data };

  // --- Vitals: IOP rounding ---
  if (result.vitals) {
    result.vitals = {
      ...result.vitals,
      iop_od: normalizeIopValue(result.vitals.iop_od),
      iop_os: normalizeIopValue(result.vitals.iop_os),
    };
  }

  // --- Refraction: sign + 2dp + axis clamping ---
  if (result.refraction) {
    result.refraction = { ...result.refraction };
    for (const eye of ["OD", "OS"] as const) {
      const eyeRx = result.refraction[eye];
      if (!eyeRx) continue;
      result.refraction[eye] = {
        ...eyeRx,
        sphere: normalizeRxString(eyeRx.sphere, "sphere") ?? "",
        cylinder: normalizeRxString(eyeRx.cylinder, "cylinder") ?? "",
        axis: normalizeAxis(eyeRx.axis) ?? "",
        add: normalizeRxString(eyeRx.add, "add") ?? "",
      };
    }
  }

  return result;
}
