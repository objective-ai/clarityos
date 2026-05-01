import { describe, it, expect } from "vitest";
import { countSmsSegments } from "./sms-segments";

describe("countSmsSegments", () => {
  it("counts a short ASCII string as 1 GSM-7 segment", () => {
    const r = countSmsSegments("Hello");
    expect(r.count).toBe(1);
    expect(r.encoding).toBe("GSM-7");
    expect(r.remainingChars).toBe(155);
    expect(r.totalChars).toBe(5);
  });

  it("treats 160-char ASCII as exactly 1 segment", () => {
    const r = countSmsSegments("A".repeat(160));
    expect(r.count).toBe(1);
    expect(r.encoding).toBe("GSM-7");
    expect(r.remainingChars).toBe(0);
    expect(r.perSegmentLimit).toBe(160);
  });

  it("treats 161-char ASCII as 2 GSM-7 segments (153 limit)", () => {
    const r = countSmsSegments("A".repeat(161));
    expect(r.count).toBe(2);
    expect(r.encoding).toBe("GSM-7");
    expect(r.perSegmentLimit).toBe(153);
  });

  it("falls back to UCS-2 when emoji present", () => {
    const r = countSmsSegments("Hi 👋");
    expect(r.encoding).toBe("UCS-2");
  });

  it("treats 70-char emoji string as 1 UCS-2 segment", () => {
    const r = countSmsSegments("👋".repeat(70));
    expect(r.count).toBe(1);
    expect(r.encoding).toBe("UCS-2");
    expect(r.perSegmentLimit).toBe(70);
  });

  it("treats 71-char emoji string as 2 UCS-2 segments", () => {
    const r = countSmsSegments("👋".repeat(71));
    expect(r.count).toBe(2);
    expect(r.encoding).toBe("UCS-2");
    expect(r.perSegmentLimit).toBe(67);
  });

  it("handles 306-char ASCII as 2 segments (153*2)", () => {
    const r = countSmsSegments("A".repeat(306));
    expect(r.count).toBe(2);
    expect(r.remainingChars).toBe(0);
  });

  it("handles 307-char ASCII as 3 segments", () => {
    const r = countSmsSegments("A".repeat(307));
    expect(r.count).toBe(3);
  });
});
