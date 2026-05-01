import { describe, it, expect } from "vitest";
import { scanForPhi } from "./phi-scan";

describe("scanForPhi", () => {
  it("returns hasPhi: false for benign reminder", () => {
    expect(scanForPhi("Reminder for tomorrow at 10am").hasPhi).toBe(false);
  });

  it("flags glaucoma diagnosis term", () => {
    const r = scanForPhi("Your glaucoma checkup is Friday");
    expect(r.hasPhi).toBe(true);
    expect(r.matches).toContain("glaucoma");
  });

  it("flags ICD-10 codes", () => {
    const r = scanForPhi("ICD-10: H40.10 follow-up");
    expect(r.hasPhi).toBe(true);
    expect(r.matches.some((m) => m.includes("H40.10"))).toBe(true);
  });

  it("flags Rx values like OD -2.50", () => {
    expect(scanForPhi("OD -2.50 -1.00 x 180").hasPhi).toBe(true);
  });

  it("flags acuity 20/40", () => {
    expect(scanForPhi("Vision today: 20/40 OS").hasPhi).toBe(true);
  });

  it("flags add power +2.00 add", () => {
    expect(scanForPhi("Try +2.00 add bifocals").hasPhi).toBe(true);
  });

  it("flags Rx medication names", () => {
    expect(scanForPhi("Your latanoprost is ready").hasPhi).toBe(true);
  });

  it("matches multiple PHI markers in same body", () => {
    const r = scanForPhi("Latanoprost for glaucoma 20/40");
    expect(r.matches.length).toBeGreaterThanOrEqual(3);
  });
});
