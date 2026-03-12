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
import type {
  ScribeStructuredDataV2,
  ScribeVitalsV2,
  ScribeStructureFindingV2,
  ConfidenceLevel,
} from "@/types/scribe";

// ---------------------------------------------------------------------------
// Legacy V1 types (kept for backwards-compat with existing accept handler)
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
// V2 → V1 converter (for existing accept handler)
// ---------------------------------------------------------------------------

export function v2ToV1(data: ScribeStructuredDataV2): ScribeStructuredData {
  const result: ScribeStructuredData = {};

  if (data.chief_complaint?.value) {
    result.chief_complaint = data.chief_complaint.value;
  }

  if (data.vitals) {
    const v: ScribeVitals = {};
    const vitals = data.vitals;
    const keys: (keyof ScribeVitalsV2)[] = [
      "iop_od", "iop_os", "va_od_distance", "va_os_distance",
      "va_od_near", "va_os_near", "bp_systolic", "bp_diastolic",
      "pupils_od", "pupils_os",
    ];
    for (const k of keys) {
      const field = vitals[k];
      if (field) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (v as any)[k] = field.value;
      }
    }
    result.vitals = v;
  }

  if (data.exam_findings) {
    const ef: ScribeExamFindings = {};
    for (const section of ["anterior", "posterior"] as const) {
      const sectionData = data.exam_findings[section];
      if (!sectionData) continue;
      const converted: Record<string, Record<string, ScribeStructureFinding>> = {};
      for (const eye of ["OD", "OS"] as const) {
        const eyeData = sectionData[eye];
        if (!eyeData) continue;
        converted[eye] = {};
        for (const [structure, finding] of Object.entries(eyeData)) {
          converted[eye][structure] = {
            status: finding.status,
            notes: finding.notes || undefined,
          };
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ef as any)[section] = converted;
    }
    result.exam_findings = ef;
  }

  if (data.diagnoses) {
    result.diagnoses = data.diagnoses.map((d) => ({
      icdCode: d.icdCode,
      description: d.description,
      laterality: d.laterality,
    }));
  }

  if (data.refraction) {
    const rx: ScribeRefraction = {};
    for (const eye of ["OD", "OS"] as const) {
      const eyeData = data.refraction[eye];
      if (eyeData) {
        rx[eye] = {
          sphere: eyeData.sphere,
          cylinder: eyeData.cylinder,
          axis: eyeData.axis,
          add: eyeData.add,
        };
      }
    }
    result.refraction = rx;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Normalizer: handles both V1 (legacy backend) and V2 (new backend) JSON
// ---------------------------------------------------------------------------

function isV2(obj: Record<string, unknown>): boolean {
  // V2 format has chief_complaint as { value, confidence } object
  const cc = obj.chief_complaint;
  return cc != null && typeof cc === "object" && "confidence" in (cc as object);
}

function wrapConfidence<T>(value: T | null | undefined, confidence: ConfidenceLevel = "high"): { value: T | null; confidence: ConfidenceLevel } {
  return { value: value ?? null, confidence };
}

function normalizeToV2(raw: Record<string, unknown>): ScribeStructuredDataV2 {
  if (isV2(raw)) {
    return raw as unknown as ScribeStructuredDataV2;
  }

  // V1 → V2 normalization
  const v1 = raw as unknown as ScribeStructuredData;
  const result: ScribeStructuredDataV2 = {
    chief_complaint: wrapConfidence(v1.chief_complaint ?? null),
    assessment_and_plan: wrapConfidence(null),
  };

  if (v1.vitals) {
    const v = v1.vitals;
    result.vitals = {
      iop_od: wrapConfidence(v.iop_od),
      iop_os: wrapConfidence(v.iop_os),
      va_od_distance: wrapConfidence(v.va_od_distance),
      va_os_distance: wrapConfidence(v.va_os_distance),
      va_od_near: wrapConfidence(v.va_od_near),
      va_os_near: wrapConfidence(v.va_os_near),
      bp_systolic: wrapConfidence(v.bp_systolic),
      bp_diastolic: wrapConfidence(v.bp_diastolic),
      pupils_od: wrapConfidence(v.pupils_od),
      pupils_os: wrapConfidence(v.pupils_os),
    };
  }

  if (v1.exam_findings) {
    const ef: ScribeStructuredDataV2["exam_findings"] = {};
    for (const section of ["anterior", "posterior"] as const) {
      const sectionData = v1.exam_findings[section];
      if (!sectionData) continue;
      const converted: Record<string, Record<string, ScribeStructureFindingV2>> = {};
      for (const eye of ["OD", "OS"] as const) {
        const eyeData = sectionData[eye];
        if (!eyeData) continue;
        converted[eye] = {};
        for (const [structure, finding] of Object.entries(eyeData)) {
          converted[eye][structure] = {
            status: finding.status,
            notes: finding.notes ?? "",
            confidence: "high",
          };
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ef as any)[section] = converted;
    }
    result.exam_findings = ef;
  }

  if (v1.diagnoses) {
    result.diagnoses = v1.diagnoses.map((d) => ({
      icdCode: d.icdCode,
      description: d.description,
      laterality: (d.laterality ?? "OU") as "OD" | "OS" | "OU",
      confidence: "high" as ConfidenceLevel,
    }));
  }

  if (v1.refraction) {
    const rx: ScribeStructuredDataV2["refraction"] = {};
    for (const eye of ["OD", "OS"] as const) {
      const eyeData = v1.refraction[eye];
      if (eyeData) {
        rx[eye] = {
          sphere: eyeData.sphere ?? "",
          cylinder: eyeData.cylinder ?? "",
          axis: eyeData.axis ?? "",
          add: eyeData.add ?? "",
          confidence: "high",
        };
      }
    }
    result.refraction = rx;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseAiScribeReturn {
  generate: (transcript: string) => void;
  soapText: string;
  structuredData: ScribeStructuredData | null;
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
  const [structuredData, setStructuredData] = useState<ScribeStructuredData | null>(null);
  const [structuredDataV2, setStructuredDataV2] = useState<ScribeStructuredDataV2 | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setSoapText("");
    setStructuredData(null);
    setStructuredDataV2(null);
    setIsStreaming(false);
    setIsDone(false);
    setError(null);
  }, []);

  // Parse and store both V1 and V2 representations
  const handleParsedJson = useCallback((jsonStr: string) => {
    try {
      const raw = JSON.parse(jsonStr);
      const v2 = normalizeToV2(raw);
      setStructuredDataV2(v2);
      setStructuredData(v2ToV1(v2));
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
                if (jsonBuffer.trim()) {
                  handleParsedJson(jsonBuffer);
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

  return { generate, soapText, structuredData, structuredDataV2, isStreaming, isDone, error, reset };
}
