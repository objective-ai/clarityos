import { describe, test, expect } from "vitest";
import {
  computeSphericalEquivalent,
  formatDiopter,
  formatAxis,
  formatRxLine,
  hasSignificantRxChange,
} from "@/lib/utils/generateRxPdf";
import type { EyeRxSummary } from "@/types/optical";
import { makeEyeRx } from "../../helpers/fixtures/optical";

// ---------------------------------------------------------------------------
// computeSphericalEquivalent
// ---------------------------------------------------------------------------

describe("computeSphericalEquivalent", () => {
  test("computes SE = sphere + cylinder/2", () => {
    expect(computeSphericalEquivalent(-2.0, -1.0)).toBe(-2.5);
  });

  test("treats null cylinder as 0", () => {
    expect(computeSphericalEquivalent(-2.0, null)).toBe(-2.0);
  });

  test("returns null when sphere is null", () => {
    expect(computeSphericalEquivalent(null, -1.0)).toBeNull();
  });

  test("handles positive values", () => {
    expect(computeSphericalEquivalent(+1.0, -0.5)).toBe(0.75);
  });

  test("handles zero values", () => {
    expect(computeSphericalEquivalent(0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatDiopter
// ---------------------------------------------------------------------------

describe("formatDiopter", () => {
  test("formats positive value with + sign", () => {
    expect(formatDiopter(1.5)).toBe("+1.50");
  });

  test("formats negative value", () => {
    expect(formatDiopter(-2.25)).toBe("-2.25");
  });

  test("formats zero with + sign", () => {
    expect(formatDiopter(0)).toBe("+0.00");
  });

  test("returns -- for null", () => {
    expect(formatDiopter(null)).toBe("--");
  });
});

// ---------------------------------------------------------------------------
// formatAxis
// ---------------------------------------------------------------------------

describe("formatAxis", () => {
  test("pads single digit to 3 digits", () => {
    expect(formatAxis(5)).toBe("005");
  });

  test("pads double digit to 3 digits", () => {
    expect(formatAxis(90)).toBe("090");
  });

  test("leaves 3-digit axis as-is", () => {
    expect(formatAxis(180)).toBe("180");
  });

  test("returns -- for null", () => {
    expect(formatAxis(null)).toBe("--");
  });
});

// ---------------------------------------------------------------------------
// formatRxLine
// ---------------------------------------------------------------------------

describe("formatRxLine", () => {
  test("formats full Rx with sphere / cylinder x axis", () => {
    const eye = makeEyeRx({ sphere: -2.0, cylinder: -0.5, axis: 90 });
    expect(formatRxLine(eye)).toBe("-2.00 / -0.50 x 090");
  });

  test("returns sphere only when cylinder is null", () => {
    const eye = makeEyeRx({ sphere: -2.0, cylinder: null });
    expect(formatRxLine(eye)).toBe("-2.00");
  });

  test("returns sphere only when cylinder is 0", () => {
    const eye = makeEyeRx({ sphere: +1.0, cylinder: 0 });
    expect(formatRxLine(eye)).toBe("+1.00");
  });
});

// ---------------------------------------------------------------------------
// hasSignificantRxChange
// ---------------------------------------------------------------------------

describe("hasSignificantRxChange", () => {
  test("returns true when OD SE change > 0.50D", () => {
    const currentOd = makeEyeRx({ sphere: -3.0, cylinder: -1.0 }); // SE = -3.5
    const currentOs = makeEyeRx({ sphere: -2.0, cylinder: -0.5 }); // SE = -2.25
    const previousOd = makeEyeRx({ sphere: -2.0, cylinder: -1.0 }); // SE = -2.5
    const previousOs = makeEyeRx({ sphere: -2.0, cylinder: -0.5 }); // SE = -2.25

    // OD delta = |-3.5 - (-2.5)| = 1.0 > 0.50
    expect(hasSignificantRxChange(currentOd, currentOs, previousOd, previousOs)).toBe(true);
  });

  test("returns true when OS SE change > 0.50D", () => {
    const currentOd = makeEyeRx({ sphere: -2.0, cylinder: -0.5 });
    const currentOs = makeEyeRx({ sphere: -3.0, cylinder: -1.0 }); // SE = -3.5
    const previousOd = makeEyeRx({ sphere: -2.0, cylinder: -0.5 });
    const previousOs = makeEyeRx({ sphere: -2.0, cylinder: -0.5 }); // SE = -2.25

    // OS delta = |-3.5 - (-2.25)| = 1.25 > 0.50
    expect(hasSignificantRxChange(currentOd, currentOs, previousOd, previousOs)).toBe(true);
  });

  test("returns false when SE change <= 0.50D", () => {
    const currentOd = makeEyeRx({ sphere: -2.25, cylinder: -0.5 }); // SE = -2.5
    const currentOs = makeEyeRx({ sphere: -2.0, cylinder: -0.5 }); // SE = -2.25
    const previousOd = makeEyeRx({ sphere: -2.0, cylinder: -0.5 }); // SE = -2.25
    const previousOs = makeEyeRx({ sphere: -2.0, cylinder: -0.5 }); // SE = -2.25

    // OD delta = |-2.5 - (-2.25)| = 0.25 <= 0.50
    expect(hasSignificantRxChange(currentOd, currentOs, previousOd, previousOs)).toBe(false);
  });

  test("returns false when no previous data", () => {
    const currentOd = makeEyeRx();
    const currentOs = makeEyeRx();

    expect(hasSignificantRxChange(currentOd, currentOs, null, null)).toBe(false);
  });

  test("returns false when current sphere is null", () => {
    const currentOd = makeEyeRx({ sphere: null });
    const currentOs = makeEyeRx({ sphere: null });
    const previousOd = makeEyeRx();
    const previousOs = makeEyeRx();

    expect(hasSignificantRxChange(currentOd, currentOs, previousOd, previousOs)).toBe(false);
  });
});
