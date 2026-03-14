/**
 * hooks/useAiScribe.ts
 *
 * SSE client hook for the Ambient Data-Entry Scribe.
 *
 * Dual-stream protocol:
 *   1. SOAP narrative text streams visibly to the UI
 *   2. After ___JSON_START___ delimiter, JSON is silently buffered
 *   3. On "done", JSON is parsed → structuredDataV2 ready for review
 *
 * Falls back to mock streaming when backend is unreachable (Vercel / no backend).
 */

import { useCallback, useRef, useState } from "react";
import type { ScribeStructuredDataV2 } from "@/types/scribe";
import { normalizeScribeData } from "@/lib/scribe-normalizer";

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseAiScribeReturn {
  generate: (transcript: string) => void;
  soapText: string;
  structuredDataV2: ScribeStructuredDataV2 | null;
  isStreaming: boolean;
  isDone: boolean;
  error: string | null;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Delimiter
// ---------------------------------------------------------------------------

const JSON_DELIMITER = "___JSON_START___";

// ---------------------------------------------------------------------------
// Mock fallback — generates realistic V2 dual output from a transcript
// ---------------------------------------------------------------------------

function buildMockResponse(): string {
  const soap = `SUBJECTIVE:
Pt presents for comprehensive eye exam. Pt reports gradual onset of blurry distance vision over the past several months, worse at night. No ocular pain, flashes, or floaters reported.

OBJECTIVE:
Visual acuity: OD 20/200 uncorrected, 20/25 best corrected. OS 20/100 uncorrected, 20/20 best corrected.
IOP: OD 23 mmHg, OS 18 mmHg (Goldmann applanation).
Manifest refraction: OD -2.00 -0.75 x 180, OS -1.75 -0.50 x 175, Add +2.00 OU.
Anterior segment: Lids and lashes clear OU. Cornea clear OU. Anterior chamber deep and quiet OU. Lens: trace nuclear sclerosis OU.
Posterior segment: C/D ratio 0.3 OD, 0.3 OS. Macula flat and clear OU. Vessels normal caliber OU. Periphery flat and intact OU.

ASSESSMENT:
1. Myopia, bilateral (H52.13)
2. Presbyopia (H52.4)
3. Elevated IOP OD — glaucoma suspect (H40.001)

PLAN:
1. Updated spectacle prescription dispensed.
2. Recommend OCT optic nerve and visual fields for IOP evaluation.
3. Return in 6 months for IOP recheck and comprehensive exam.`;

  const structuredJson: ScribeStructuredDataV2 = {
    chief_complaint: { value: "Blurry distance vision", confidence: "high" },
    assessment_and_plan: {
      value: "1. Myopia, bilateral — updated spectacle Rx dispensed.\n2. Presbyopia — Add +2.00 OU.\n3. Elevated IOP OD, glaucoma suspect — order OCT optic nerve + VF. RTC 6 months.",
      confidence: "high",
    },
    vitals: {
      iop_od: { value: 23, confidence: "high" },
      iop_os: { value: 18, confidence: "high" },
      va_od_distance: { value: "20/200", confidence: "high" },
      va_os_distance: { value: "20/100", confidence: "high" },
      va_od_near: { value: null, confidence: "high" },
      va_os_near: { value: null, confidence: "high" },
      bp_systolic: { value: null, confidence: "high" },
      bp_diastolic: { value: null, confidence: "high" },
      pupils_od: { value: null, confidence: "high" },
      pupils_os: { value: null, confidence: "high" },
    },
    exam_findings: {
      anterior: {
        OD: {
          lids_lashes: { status: "normal", notes: "", confidence: "high" },
          cornea: { status: "normal", notes: "", confidence: "high" },
          anterior_chamber: { status: "normal", notes: "Deep and quiet", confidence: "high" },
          lens: { status: "abnormal", notes: "Trace nuclear sclerosis", confidence: "high" },
        },
        OS: {
          lids_lashes: { status: "normal", notes: "", confidence: "high" },
          cornea: { status: "normal", notes: "", confidence: "high" },
          anterior_chamber: { status: "normal", notes: "Deep and quiet", confidence: "high" },
          lens: { status: "abnormal", notes: "Trace nuclear sclerosis", confidence: "high" },
        },
      },
      posterior: {
        OD: {
          cup_to_disc_ratio: { status: "normal", notes: "0.3", confidence: "high" },
          macula: { status: "normal", notes: "Flat and clear", confidence: "high" },
          vessels: { status: "normal", notes: "Normal caliber", confidence: "high" },
          periphery: { status: "normal", notes: "Flat and intact", confidence: "high" },
        },
        OS: {
          cup_to_disc_ratio: { status: "normal", notes: "0.3", confidence: "high" },
          macula: { status: "normal", notes: "Flat and clear", confidence: "high" },
          vessels: { status: "normal", notes: "Normal caliber", confidence: "high" },
          periphery: { status: "normal", notes: "Flat and intact", confidence: "high" },
        },
      },
    },
    diagnoses: [
      { icdCode: "H52.13", description: "Myopia, bilateral", laterality: "OU", confidence: "high" },
      { icdCode: "H52.4", description: "Presbyopia", laterality: "OU", confidence: "high" },
      { icdCode: "H40.001", description: "Glaucoma suspect, unspecified eye", laterality: "OD", confidence: "medium" },
    ],
    refraction: {
      OD: { sphere: "-2.00", cylinder: "-0.75", axis: "180", add: "+2.00", confidence: "low" },
      OS: { sphere: "-1.75", cylinder: "-0.50", axis: "175", add: "+2.00", confidence: "low" },
    },
  };

  return soap + "\n\n" + JSON_DELIMITER + "\n" + JSON.stringify(structuredJson, null, 2);
}

async function* mockStream(): AsyncGenerator<string> {
  const fullText = buildMockResponse();
  const words = fullText.split(/(\s+)/);
  for (const word of words) {
    yield word;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAiScribe(encounterId: string): UseAiScribeReturn {
  const [soapText, setSoapText] = useState("");
  const [structuredDataV2, setStructuredDataV2] = useState<ScribeStructuredDataV2 | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setSoapText("");
    setStructuredDataV2(null);
    setIsStreaming(false);
    setIsDone(false);
    setError(null);
  }, []);

  const handleParsedJson = useCallback((jsonStr: string) => {
    try {
      // Strip markdown code fences if Claude wraps JSON in ```json ... ```
      const cleaned = jsonStr.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      const parsed = JSON.parse(cleaned) as ScribeStructuredDataV2;
      setStructuredDataV2(normalizeScribeData(parsed));
    } catch (e) {
      console.error("AI Scribe JSON parse error:", e);
      setError("AI output was malformed. SOAP note is available but auto-fill data could not be parsed.");
    }
  }, []);

  const generate = useCallback(
    (transcript: string) => {
      // Reset previous state
      reset();
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // Try real backend first, fall back to mock
      (async () => {
        let fullBuffer = "";
        let delimiterFound = false;
        let jsonBuffer = "";

        try {
          // Attempt real backend SSE
          const res = await fetch(`/api/encounters/${encounterId}/ai-scribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            throw new Error("Backend unavailable");
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let lineBuffer = ""; // Buffer incomplete SSE lines across chunks

          while (true) {
            const { done: readerDone, value } = await reader.read();
            if (readerDone) break;

            const chunk = decoder.decode(value, { stream: true });
            lineBuffer += chunk;
            const parts = lineBuffer.split("\n");
            lineBuffer = parts.pop() ?? ""; // Keep incomplete last line in buffer

            for (const line of parts) {
              if (!line.startsWith("data: ")) continue;

              let data: Record<string, unknown>;
              try {
                data = JSON.parse(line.slice(6));
              } catch {
                continue; // Skip malformed SSE lines instead of crashing
              }

              if (data.error) {
                setError(data.error as string);
                setIsStreaming(false);
                return;
              }

              if (data.done) {
                if (jsonBuffer.trim()) {
                  handleParsedJson(jsonBuffer);
                } else {
                  // Fallback: extract JSON object from tail of fullBuffer
                  const lastBrace = fullBuffer.lastIndexOf("}");
                  const searchStart = Math.max(0, fullBuffer.length - 4000);
                  const firstBrace = fullBuffer.indexOf("{", searchStart);
                  if (lastBrace > firstBrace && firstBrace !== -1) {
                    handleParsedJson(fullBuffer.slice(firstBrace, lastBrace + 1));
                  }
                }
                setIsStreaming(false);
                setIsDone(true);
                return;
              }

              if (data.text) {
                fullBuffer += data.text as string;

                // Check for delimiter
                if (!delimiterFound && fullBuffer.includes(JSON_DELIMITER)) {
                  delimiterFound = true;
                  const [soapPart, jsonPart] = fullBuffer.split(JSON_DELIMITER);
                  setSoapText(soapPart.trim());
                  jsonBuffer = jsonPart ?? "";
                } else if (delimiterFound) {
                  jsonBuffer += data.text as string;
                } else {
                  setSoapText(fullBuffer);
                }
              }
            }
          }
        } catch {
          // Backend unreachable — fall back to mock streaming
          fullBuffer = "";
          delimiterFound = false;
          jsonBuffer = "";

          for await (const word of mockStream()) {
            if (controller.signal.aborted) return;

            fullBuffer += word;

            if (!delimiterFound && fullBuffer.includes(JSON_DELIMITER)) {
              delimiterFound = true;
              const [soapPart, jsonPart] = fullBuffer.split(JSON_DELIMITER);
              setSoapText(soapPart.trim());
              jsonBuffer = jsonPart ?? "";
            } else if (delimiterFound) {
              jsonBuffer += word;
            } else {
              setSoapText(fullBuffer);
            }
          }

          // Parse the mock JSON
          if (jsonBuffer.trim()) {
            handleParsedJson(jsonBuffer);
          } else {
            // Fallback: extract JSON object from tail of fullBuffer
            const lastBrace = fullBuffer.lastIndexOf("}");
            const searchStart = Math.max(0, fullBuffer.length - 4000);
            const firstBrace = fullBuffer.indexOf("{", searchStart);
            if (lastBrace > firstBrace && firstBrace !== -1) {
              handleParsedJson(fullBuffer.slice(firstBrace, lastBrace + 1));
            }
          }
        }

        if (!controller.signal.aborted) {
          setIsStreaming(false);
          setIsDone(true);
        }
      })();
    },
    [encounterId, reset, handleParsedJson],
  );

  return { generate, soapText, structuredDataV2, isStreaming, isDone, error, reset };
}
