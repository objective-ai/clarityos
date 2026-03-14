import { describe, test, expect } from "vitest";
import {
  normalizeRxString,
  normalizeAxis,
  normalizeIopValue,
  normalizeScribeData,
} from "@/lib/scribe-normalizer";
import type { ScribeStructuredDataV2 } from "@/types/scribe";

// ---------------------------------------------------------------------------
// normalizeRxString
// ---------------------------------------------------------------------------

describe("normalizeRxString", () => {
  test("null/empty → null", () => {
    expect(normalizeRxString(null, "sphere")).toBeNull();
    expect(normalizeRxString("", "sphere")).toBeNull();
    expect(normalizeRxString("  ", "cylinder")).toBeNull();
  });

  test("plano → null", () => {
    expect(normalizeRxString("plano", "sphere")).toBeNull();
    expect(normalizeRxString("PL", "sphere")).toBeNull();
    expect(normalizeRxString("0", "sphere")).toBeNull();
    expect(normalizeRxString("0.00", "cylinder")).toBeNull();
  });

  test("sphere: formats to 2dp with sign", () => {
    expect(normalizeRxString("-2.00", "sphere")).toBe("-2.00");
    expect(normalizeRxString("-1.5", "sphere")).toBe("-1.50");
    expect(normalizeRxString("+1.25", "sphere")).toBe("+1.25");
  });

  test("cylinder: always negative (minus-cyl convention)", () => {
    expect(normalizeRxString("-0.75", "cylinder")).toBe("-0.75");
    expect(normalizeRxString("0.75", "cylinder")).toBe("-0.75");
    expect(normalizeRxString("+1.00", "cylinder")).toBe("-1.00");
  });

  test("add: always positive with + sign", () => {
    expect(normalizeRxString("2.00", "add")).toBe("+2.00");
    expect(normalizeRxString("+2.00", "add")).toBe("+2.00");
    expect(normalizeRxString("1.5", "add")).toBe("+1.50");
  });

  test("rounds to nearest 0.25D", () => {
    expect(normalizeRxString("-2.10", "sphere")).toBe("-2.00");
    expect(normalizeRxString("-2.13", "sphere")).toBe("-2.25");
    expect(normalizeRxString("+1.40", "add")).toBe("+1.50");
  });
});

// ---------------------------------------------------------------------------
// normalizeAxis
// ---------------------------------------------------------------------------

describe("normalizeAxis", () => {
  test("null/empty → null", () => {
    expect(normalizeAxis(null)).toBeNull();
    expect(normalizeAxis("")).toBeNull();
  });

  test("normal values pass through as integer strings", () => {
    expect(normalizeAxis("90")).toBe("90");
    expect(normalizeAxis("180")).toBe("180");
    expect(normalizeAxis("1")).toBe("1");
  });

  test("clamps out-of-range values", () => {
    // 0 wraps to 180 via clampAxis
    expect(normalizeAxis("0")).toBe("180");
    // >180 wraps via modulo
    expect(normalizeAxis("185")).toBe("5");
  });

  test("rounds decimals", () => {
    // parseAxis uses parseInt which truncates, then clamps
    expect(normalizeAxis("90.7")).toBe("90");
  });
});

// ---------------------------------------------------------------------------
// normalizeIopValue
// ---------------------------------------------------------------------------

describe("normalizeIopValue", () => {
  test("null value → unchanged", () => {
    const cv = { value: null, confidence: "high" as const };
    expect(normalizeIopValue(cv)).toEqual(cv);
  });

  test("rounds to integer", () => {
    expect(normalizeIopValue({ value: 14.7, confidence: "high" })).toEqual({
      value: 15,
      confidence: "high",
    });
    expect(normalizeIopValue({ value: 18.3, confidence: "medium" })).toEqual({
      value: 18,
      confidence: "medium",
    });
  });

  test("preserves integer values", () => {
    expect(normalizeIopValue({ value: 21, confidence: "low" })).toEqual({
      value: 21,
      confidence: "low",
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeScribeData (integration)
// ---------------------------------------------------------------------------

describe("normalizeScribeData", () => {
  const baseData: ScribeStructuredDataV2 = {
    chief_complaint: { value: "Blurry vision", confidence: "high" },
    assessment_and_plan: { value: "Follow up in 6 months", confidence: "high" },
    vitals: {
      iop_od: { value: 14.7, confidence: "high" },
      iop_os: { value: 18, confidence: "high" },
      va_od_distance: { value: "20/25", confidence: "high" },
      va_os_distance: { value: "20/20", confidence: "high" },
      va_od_near: { value: null, confidence: "high" },
      va_os_near: { value: null, confidence: "high" },
      bp_systolic: { value: null, confidence: "high" },
      bp_diastolic: { value: null, confidence: "high" },
      pupils_od: { value: null, confidence: "high" },
      pupils_os: { value: null, confidence: "high" },
    },
    refraction: {
      OD: { sphere: "-2", cylinder: "-0.75", axis: "180", add: "2.00", confidence: "high" },
      OS: { sphere: "-1.5", cylinder: "0.50", axis: "90.5", add: "+1.50", confidence: "low" },
    },
  };

  test("normalizes IOP to integers", () => {
    const result = normalizeScribeData(baseData);
    expect(result.vitals?.iop_od.value).toBe(15);
    expect(result.vitals?.iop_os.value).toBe(18);
  });

  test("normalizes refraction strings", () => {
    const result = normalizeScribeData(baseData);
    // OD
    expect(result.refraction?.OD?.sphere).toBe("-2.00");
    expect(result.refraction?.OD?.cylinder).toBe("-0.75");
    expect(result.refraction?.OD?.axis).toBe("180");
    expect(result.refraction?.OD?.add).toBe("+2.00");
    // OS
    expect(result.refraction?.OS?.sphere).toBe("-1.50");
    expect(result.refraction?.OS?.cylinder).toBe("-0.50"); // forced negative
    expect(result.refraction?.OS?.axis).toBe("90"); // truncated from 90.5
    expect(result.refraction?.OS?.add).toBe("+1.50");
  });

  test("does not mutate original data", () => {
    const copy = JSON.parse(JSON.stringify(baseData));
    normalizeScribeData(baseData);
    expect(baseData).toEqual(copy);
  });

  test("passes through non-refraction/IOP fields unchanged", () => {
    const result = normalizeScribeData(baseData);
    expect(result.chief_complaint).toEqual(baseData.chief_complaint);
    expect(result.assessment_and_plan).toEqual(baseData.assessment_and_plan);
    expect(result.vitals?.va_od_distance).toEqual(baseData.vitals?.va_od_distance);
    expect(result.vitals?.pupils_od).toEqual(baseData.vitals?.pupils_od);
  });

  test("handles missing vitals/refraction gracefully", () => {
    const minimal: ScribeStructuredDataV2 = {
      chief_complaint: { value: "Follow up", confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
    };
    const result = normalizeScribeData(minimal);
    expect(result.vitals).toBeUndefined();
    expect(result.refraction).toBeUndefined();
  });
});
