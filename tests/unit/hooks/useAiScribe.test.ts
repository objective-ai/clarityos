/**
 * tests/unit/hooks/useAiScribe.test.ts
 *
 * Unit tests for the AI Scribe hook — covers:
 *  1. v2ToV1() pure converter
 *  2. Markdown fence stripping (the bug that hid "Review AI Note" button)
 *  3. Malformed JSON → error state, not crash
 *  4. Delimiter splitting (SOAP vs JSON buffer)
 *  5. V1 → V2 normalisation via the hook
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { v2ToV1, useAiScribe } from "@/hooks/useAiScribe";
import type { ScribeStructuredDataV2 } from "@/types/scribe";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JSON_DELIMITER = "___JSON_START___";

/** Build a minimal valid V2 payload */
function makeV2(overrides: Partial<ScribeStructuredDataV2> = {}): ScribeStructuredDataV2 {
  return {
    chief_complaint: { value: "Blurry vision", confidence: "high" },
    assessment_and_plan: { value: "Monitor and follow up", confidence: "medium" },
    ...overrides,
  };
}

/** Encode a string as SSE "data: ..." lines, terminated by done event */
function sseStream(soapText: string, jsonPayload: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const fullText = soapText + "\n\n" + JSON_DELIMITER + "\n" + jsonPayload;
  const words = fullText.split(/(\s+)/);

  return new ReadableStream({
    async start(controller) {
      for (const word of words) {
        const line = `data: ${JSON.stringify({ text: word })}\n\n`;
        controller.enqueue(encoder.encode(line));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      controller.close();
    },
  });
}

/** Mock fetch to return the given SSE stream */
function mockFetch(stream: ReadableStream<Uint8Array>) {
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
  );
}

// ---------------------------------------------------------------------------
// v2ToV1 — pure function, no hook needed
// ---------------------------------------------------------------------------

describe("v2ToV1", () => {
  test("extracts chief_complaint from V2", () => {
    const v2 = makeV2({ chief_complaint: { value: "Eye pain", confidence: "high" } });
    const v1 = v2ToV1(v2);
    expect(v1.chief_complaint).toBe("Eye pain");
  });

  test("omits chief_complaint when value is null", () => {
    const v2 = makeV2({ chief_complaint: { value: null, confidence: "low" } });
    const v1 = v2ToV1(v2);
    expect(v1.chief_complaint).toBeUndefined();
  });

  test("converts vitals — numeric values unwrapped", () => {
    const v2 = makeV2({
      vitals: {
        iop_od: { value: 21, confidence: "high" },
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
    });
    const v1 = v2ToV1(v2);
    expect(v1.vitals?.iop_od).toBe(21);
    expect(v1.vitals?.iop_os).toBe(18);
    expect(v1.vitals?.va_od_distance).toBe("20/25");
    expect(v1.vitals?.va_os_distance).toBe("20/20");
    expect(v1.vitals?.bp_systolic).toBeNull();
  });

  test("converts diagnoses — laterality and icdCode preserved", () => {
    const v2 = makeV2({
      diagnoses: [
        { icdCode: "H52.13", description: "Myopia, bilateral", laterality: "OU", confidence: "high" },
        { icdCode: "H40.001", description: "Glaucoma suspect", laterality: "OD", confidence: "medium" },
      ],
    });
    const v1 = v2ToV1(v2);
    expect(v1.diagnoses).toHaveLength(2);
    expect(v1.diagnoses![0].icdCode).toBe("H52.13");
    expect(v1.diagnoses![1].laterality).toBe("OD");
  });

  test("converts refraction — string values per eye", () => {
    const v2 = makeV2({
      refraction: {
        OD: { sphere: "-2.00", cylinder: "-0.75", axis: "180", add: "+2.00", confidence: "low" },
        OS: { sphere: "-1.75", cylinder: "-0.50", axis: "175", add: "+2.00", confidence: "low" },
      },
    });
    const v1 = v2ToV1(v2);
    expect(v1.refraction?.OD?.sphere).toBe("-2.00");
    expect(v1.refraction?.OS?.cylinder).toBe("-0.50");
  });

  test("exam_findings: status and notes survive round-trip", () => {
    const v2 = makeV2({
      exam_findings: {
        anterior: {
          OD: {
            lens: { status: "abnormal", notes: "Trace nuclear sclerosis", confidence: "high" },
          },
        },
      },
    });
    const v1 = v2ToV1(v2);
    const lens = v1.exam_findings?.anterior?.OD?.lens;
    expect(lens?.status).toBe("abnormal");
    expect(lens?.notes).toBe("Trace nuclear sclerosis");
  });
});

// ---------------------------------------------------------------------------
// useAiScribe hook — integration via renderHook + mocked fetch
// ---------------------------------------------------------------------------

describe("useAiScribe hook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("populates structuredDataV2 and soapText when backend returns clean JSON", async () => {
    const v2 = makeV2({ chief_complaint: { value: "Test complaint", confidence: "high" } });
    mockFetch(sseStream("S: patient reports blurry vision", JSON.stringify(v2)));

    const { result } = renderHook(() => useAiScribe("enc-123"));

    act(() => {
      result.current.generate("patient transcript");
    });

    await waitFor(() => expect(result.current.isDone).toBe(true), { timeout: 5000 });

    expect(result.current.error).toBeNull();
    expect(result.current.structuredDataV2).not.toBeNull();
    expect(result.current.structuredDataV2?.chief_complaint.value).toBe("Test complaint");
    expect(result.current.soapText).toContain("blurry vision");
  });

  test("strips markdown code fences and still parses JSON", async () => {
    const v2 = makeV2({ chief_complaint: { value: "Fence test", confidence: "high" } });
    // Claude sometimes wraps JSON in ```json ... ``` — this is the bug we fixed
    const fencedJson = "```json\n" + JSON.stringify(v2) + "\n```";
    mockFetch(sseStream("SOAP note text", fencedJson));

    const { result } = renderHook(() => useAiScribe("enc-456"));

    act(() => {
      result.current.generate("transcript");
    });

    await waitFor(() => expect(result.current.isDone).toBe(true), { timeout: 5000 });

    expect(result.current.error).toBeNull();
    expect(result.current.structuredDataV2?.chief_complaint.value).toBe("Fence test");
  });

  test("sets error state (not crash) when JSON is truly malformed", async () => {
    mockFetch(sseStream("SOAP text", "this is not json at all {{{"));

    const { result } = renderHook(() => useAiScribe("enc-789"));

    act(() => {
      result.current.generate("transcript");
    });

    await waitFor(() => expect(result.current.isDone).toBe(true), { timeout: 5000 });

    expect(result.current.error).toMatch(/malformed/i);
    expect(result.current.structuredDataV2).toBeNull();
    // SOAP text is still available even when JSON fails
    expect(result.current.soapText).toContain("SOAP text");
  });

  test("normalises V1 backend JSON to V2 internally", async () => {
    // V1 format: flat fields, no { value, confidence } wrappers
    const v1Json = JSON.stringify({
      chief_complaint: "V1 chief complaint",
      vitals: { iop_od: 22, iop_os: 17 },
      diagnoses: [{ icdCode: "H52.0", description: "Hyperopia", laterality: "OU" }],
    });

    mockFetch(sseStream("SOAP from V1 backend", v1Json));

    const { result } = renderHook(() => useAiScribe("enc-v1"));

    act(() => {
      result.current.generate("transcript");
    });

    await waitFor(() => expect(result.current.isDone).toBe(true), { timeout: 5000 });

    expect(result.current.error).toBeNull();
    // After normalisation, V2 fields should have confidence wrappers
    expect(result.current.structuredDataV2?.chief_complaint).toEqual({
      value: "V1 chief complaint",
      confidence: "high",
    });
    // V1 is also available for existing accept handler
    expect(result.current.structuredData?.chief_complaint).toBe("V1 chief complaint");
  });

  test("reset clears all state", async () => {
    const v2 = makeV2();
    mockFetch(sseStream("SOAP", JSON.stringify(v2)));

    const { result } = renderHook(() => useAiScribe("enc-reset"));

    act(() => {
      result.current.generate("transcript");
    });

    await waitFor(() => expect(result.current.isDone).toBe(true), { timeout: 5000 });
    expect(result.current.soapText).not.toBe("");

    act(() => {
      result.current.reset();
    });

    expect(result.current.soapText).toBe("");
    expect(result.current.structuredDataV2).toBeNull();
    expect(result.current.structuredData).toBeNull();
    expect(result.current.isDone).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("enters mock fallback when fetch throws — isStreaming becomes true, no immediate error", async () => {
    // The full mock stream takes ~20s (per-word delays) so we only verify the
    // fallback path is entered, not that it fully completes. Full-path coverage
    // is handled by the E2E smoke test.
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useAiScribe("enc-fallback"));

    act(() => {
      result.current.generate("transcript");
    });

    // Wait for the async fetch rejection to be handled and mock stream to start
    await waitFor(() => expect(result.current.isStreaming).toBe(true), { timeout: 2000 });

    // No error at start of mock stream (error only if JSON parse fails)
    expect(result.current.error).toBeNull();
    expect(result.current.isDone).toBe(false);

    // Clean up — reset aborts the in-flight mock stream
    act(() => {
      result.current.reset();
    });
  });
});
