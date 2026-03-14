/**
 * tests/unit/hooks/useAiScribe.test.ts
 *
 * Unit tests for the AI Scribe hook — covers:
 *  1. Markdown fence stripping (the bug that hid "Review AI Note" button)
 *  2. Malformed JSON → error state, not crash
 *  3. Delimiter splitting (SOAP vs JSON buffer)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAiScribe } from "@/hooks/useAiScribe";
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
    expect(result.current.isDone).toBe(false);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("enters mock fallback when fetch throws — isStreaming becomes true, no immediate error", async () => {
    // The full mock stream takes ~20s (per-word delays) so we only verify the
    // fallback path is entered, not that it fully completes.
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
