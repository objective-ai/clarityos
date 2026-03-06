/**
 * lib/utils/generateRxPdf.ts
 *
 * Utility to trigger Rx prescription printing via window.print().
 *
 * For MVP, the Rx is rendered as an HTML component (RxPrintView) and
 * printed using the browser's native print dialog.  The print styles
 * in RxPrintView hide all non-prescription content during printing.
 *
 * Future: Replace with server-side PDF generation (e.g., Puppeteer,
 * react-pdf, or a dedicated PDF service) for email/fax workflows.
 */

import type { RxPdfData, EyeRxSummary } from "@/types/optical";

// ---------------------------------------------------------------------------
// Spherical Equivalent calculation
// ---------------------------------------------------------------------------

/**
 * Compute the spherical equivalent: SE = sphere + (cylinder / 2)
 * Used for Rx change detection on the frontend.
 */
export function computeSphericalEquivalent(
  sphere: number | null,
  cylinder: number | null
): number | null {
  if (sphere == null) return null;
  const cyl = cylinder ?? 0;
  return sphere + cyl / 2;
}

// ---------------------------------------------------------------------------
// Rx formatting helpers
// ---------------------------------------------------------------------------

/** Format a diopter value with sign (e.g., +1.50, -2.25) */
export function formatDiopter(value: number | null): string {
  if (value == null) return "--";
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

/** Format axis as zero-padded 3-digit string (e.g., 090) */
export function formatAxis(axis: number | null): string {
  if (axis == null) return "--";
  return String(axis).padStart(3, "0");
}

/** Format a complete Rx line: sphere / cylinder x axis */
export function formatRxLine(eye: EyeRxSummary): string {
  const sph = formatDiopter(eye.sphere);
  if (eye.cylinder == null || eye.cylinder === 0) return sph;
  return `${sph} / ${formatDiopter(eye.cylinder)} x ${formatAxis(eye.axis)}`;
}

// ---------------------------------------------------------------------------
// Rx change detection
// ---------------------------------------------------------------------------

/**
 * Determine if the Rx has changed significantly (>0.50D SE) between
 * current and previous prescriptions.
 *
 * @returns true if either eye's SE changed by more than 0.50D
 */
export function hasSignificantRxChange(
  currentOd: EyeRxSummary,
  currentOs: EyeRxSummary,
  previousOd: EyeRxSummary | null,
  previousOs: EyeRxSummary | null
): boolean {
  const THRESHOLD = 0.50;

  if (previousOd) {
    const currentSE = computeSphericalEquivalent(currentOd.sphere, currentOd.cylinder);
    const previousSE = computeSphericalEquivalent(previousOd.sphere, previousOd.cylinder);
    if (currentSE != null && previousSE != null) {
      if (Math.abs(currentSE - previousSE) > THRESHOLD) return true;
    }
  }

  if (previousOs) {
    const currentSE = computeSphericalEquivalent(currentOs.sphere, currentOs.cylinder);
    const previousSE = computeSphericalEquivalent(previousOs.sphere, previousOs.cylinder);
    if (currentSE != null && previousSE != null) {
      if (Math.abs(currentSE - previousSE) > THRESHOLD) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Print trigger
// ---------------------------------------------------------------------------

/**
 * Trigger the browser print dialog for the Rx prescription.
 *
 * The RxPrintView component renders a print-optimized view that
 * uses @media print CSS to hide everything except the prescription.
 * This function simply calls window.print().
 */
export function printRx(): void {
  window.print();
}
