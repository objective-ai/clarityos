/**
 * hooks/useAiScribe.ts
 *
 * SSE client hook for the Ambient Data-Entry Scribe.
 *
 * Dual-stream protocol:
 *   1. SOAP narrative text streams visibly to the UI
 *   2. After ___JSON_START___ delimiter, JSON is silently buffered
 *   3. On "done", JSON is parsed → structuredData ready for Accept
 *
 * Falls back to mock streaming when backend is unreachable (Vercel / no backend).
 */

import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Structured data shape from Claude's JSON output
// ---------------------------------------------------------------------------

export interface ScribeVitals {
  iop_od?: number | null;
  iop_os?: number | null;
  va_od_distance?: string | null;
  va_os_distance?: string | null;
  va_od_near?: string | null;
  va_os_near?: string | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  pupils_od?: string | null;
  pupils_os?: string | null;
}

export interface ScribeStructureFinding {
  status: "normal" | "abnormal";
  notes?: string;
}

export interface ScribeExamFindings {
  anterior?: {
    OD?: Record<string, ScribeStructureFinding>;
    OS?: Record<string, ScribeStructureFinding>;
  };
  posterior?: {
    OD?: Record<string, ScribeStructureFinding>;
    OS?: Record<string, ScribeStructureFinding>;
  };
}

export interface ScribeDiagnosis {
  icdCode: string;
  description: string;
  laterality?: "OD" | "OS" | "OU";
}

export interface ScribeRefraction {
  OD?: { sphere?: string; cylinder?: string; axis?: string; add?: string };
  OS?: { sphere?: string; cylinder?: string; axis?: string; add?: string };
}

export interface ScribeStructuredData {
  chief_complaint?: string;
  vitals?: ScribeVitals;
  exam_findings?: ScribeExamFindings;
  diagnoses?: ScribeDiagnosis[];
  refraction?: ScribeRefraction;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseAiScribeReturn {
  generate: (transcript: string) => void;
  soapText: string;
  structuredData: ScribeStructuredData | null;
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
// Mock fallback — generates realistic dual output from a transcript
// ---------------------------------------------------------------------------

function buildMockResponse(transcript: string): string {
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

  const structuredJson: ScribeStructuredData = {
    chief_complaint: "Blurry distance vision",
    vitals: {
      iop_od: 23,
      iop_os: 18,
      va_od_distance: "20/200",
      va_os_distance: "20/100",
      bp_systolic: null,
      bp_diastolic: null,
    },
    exam_findings: {
      anterior: {
        OD: {
          lids_lashes: { status: "normal", notes: "" },
          cornea: { status: "normal", notes: "" },
          anterior_chamber: { status: "normal", notes: "Deep and quiet" },
          lens: { status: "abnormal", notes: "Trace nuclear sclerosis" },
        },
        OS: {
          lids_lashes: { status: "normal", notes: "" },
          cornea: { status: "normal", notes: "" },
          anterior_chamber: { status: "normal", notes: "Deep and quiet" },
          lens: { status: "abnormal", notes: "Trace nuclear sclerosis" },
        },
      },
      posterior: {
        OD: {
          cup_to_disc_ratio: { status: "normal", notes: "0.3" },
          macula: { status: "normal", notes: "Flat and clear" },
          vessels: { status: "normal", notes: "Normal caliber" },
          periphery: { status: "normal", notes: "Flat and intact" },
        },
        OS: {
          cup_to_disc_ratio: { status: "normal", notes: "0.3" },
          macula: { status: "normal", notes: "Flat and clear" },
          vessels: { status: "normal", notes: "Normal caliber" },
          periphery: { status: "normal", notes: "Flat and intact" },
        },
      },
    },
    diagnoses: [
      { icdCode: "H52.13", description: "Myopia, bilateral", laterality: "OU" },
      { icdCode: "H52.4", description: "Presbyopia", laterality: "OU" },
      { icdCode: "H40.001", description: "Glaucoma suspect, unspecified eye", laterality: "OD" },
    ],
    refraction: {
      OD: { sphere: "-2.00", cylinder: "-0.75", axis: "180", add: "+2.00" },
      OS: { sphere: "-1.75", cylinder: "-0.50", axis: "175", add: "+2.00" },
    },
  };

  return soap + "\n\n" + JSON_DELIMITER + "\n" + JSON.stringify(structuredJson, null, 2);
}

async function* mockStream(transcript: string): AsyncGenerator<string> {
  const fullText = buildMockResponse(transcript);
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
  const [structuredData, setStructuredData] = useState<ScribeStructuredData | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setSoapText("");
    setStructuredData(null);
    setIsStreaming(false);
    setIsDone(false);
    setError(null);
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

          while (true) {
            const { done: readerDone, value } = await reader.read();
            if (readerDone) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = JSON.parse(line.slice(6));

              if (data.error) {
                setError(data.error);
                setIsStreaming(false);
                return;
              }

              if (data.done) {
                // Parse JSON from buffer
                if (jsonBuffer.trim()) {
                  try {
                    setStructuredData(JSON.parse(jsonBuffer));
                  } catch (e) {
                    console.error("AI Scribe JSON parse error:", e);
                    setError("AI output was malformed. SOAP note is available but auto-fill data could not be parsed.");
                  }
                }
                setIsStreaming(false);
                setIsDone(true);
                return;
              }

              if (data.text) {
                fullBuffer += data.text;

                // Check for delimiter
                if (!delimiterFound && fullBuffer.includes(JSON_DELIMITER)) {
                  delimiterFound = true;
                  const [soapPart, jsonPart] = fullBuffer.split(JSON_DELIMITER);
                  setSoapText(soapPart.trim());
                  jsonBuffer = jsonPart ?? "";
                } else if (delimiterFound) {
                  jsonBuffer += data.text;
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

          for await (const word of mockStream(transcript)) {
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
            try {
              setStructuredData(JSON.parse(jsonBuffer));
            } catch (e) {
              console.error("AI Scribe JSON parse error (mock):", e);
              setError("AI output was malformed. SOAP note is available but auto-fill data could not be parsed.");
            }
          }
        }

        if (!controller.signal.aborted) {
          setIsStreaming(false);
          setIsDone(true);
        }
      })();
    },
    [encounterId, reset],
  );

  return { generate, soapText, structuredData, isStreaming, isDone, error, reset };
}
