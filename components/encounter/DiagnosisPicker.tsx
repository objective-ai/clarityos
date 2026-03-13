"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useDiagnosisStore,
  useDiagnoses,
  useDiagnosisSaveStatus,
} from "@/store/diagnosisStore";
import type { EyeLaterality, Diagnosis } from "@/types/diagnosis";

// ---------------------------------------------------------------------------
// ICD-10 codes loaded from JSON
// ---------------------------------------------------------------------------

interface ICD10Code {
  code: string;
  description: string;
  category: string;
}

let ICD10_CODES_CACHE: ICD10Code[] | null = null;

async function loadICD10Codes(): Promise<ICD10Code[]> {
  if (ICD10_CODES_CACHE) return ICD10_CODES_CACHE;

  try {
    const response = await fetch("/icd10-codes.json");
    const data = await response.json() as { codes: ICD10Code[] };
    ICD10_CODES_CACHE = data.codes;
    return data.codes;
  } catch (error) {
    console.error("Failed to load ICD-10 codes:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiagnosisPickerProps {
  encounterId: string;
  isReadOnly?: boolean;
  /** Display diagnoses in N columns (default 1) */
  columns?: 1 | 2;
  initialDiagnoses?: Diagnosis[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiagnosisPicker({
  encounterId,
  isReadOnly = false,
  columns = 1,
  initialDiagnoses,
}: DiagnosisPickerProps) {
  const store = useDiagnosisStore();
  const diagnoses = useDiagnoses(encounterId);
  const saveStatus = useDiagnosisSaveStatus(encounterId);
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [codes, setCodes] = useState<ICD10Code[]>([]);

  // Load ICD-10 codes on mount
  useEffect(() => {
    loadICD10Codes().then(setCodes);
  }, []);

  // Initialize store on mount
  useEffect(() => {
    store.init(encounterId, initialDiagnoses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return codes;
    const q = search.toLowerCase();
    return codes.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [search, codes]);

  const addDiagnosis = useCallback(
    async (code: ICD10Code, eye: EyeLaterality) => {
      if (isReadOnly) return;
      await store.addDiagnosis(encounterId, {
        icd10Code: code.code,
        description: code.description,
        eyeAffected: eye,
      });
      setShowPicker(false);
      setSearch("");
    },
    [encounterId, isReadOnly, store],
  );

  const removeDiagnosis = useCallback(
    async (id: string) => {
      if (isReadOnly) return;
      await store.removeDiagnosis(encounterId, id);
    },
    [encounterId, isReadOnly, store],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="section-title">Diagnoses</h2>
            <p className="text-caption mt-0.5 text-[var(--text-muted)]">
              ICD-10 codes for this encounter
            </p>
          </div>
          {saveStatus === "saving" && (
            <Badge variant="info">Saving…</Badge>
          )}
        </div>
        {!isReadOnly && (
          <Button
            variant={showPicker ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPicker(!showPicker)}
          >
            {showPicker ? "Close" : "+ Add Diagnosis"}
          </Button>
        )}
      </div>

      {/* Current diagnoses */}
      {diagnoses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {diagnoses.map((dx) => {
            const isOD = dx.eyeAffected === "OD";
            const isOS = dx.eyeAffected === "OS";
            return (
            <div
              key={dx.id}
              title={dx.description}
              className="group inline-flex items-center gap-0 rounded-full overflow-hidden cursor-default"
              style={{
                border: isOD
                  ? "1px solid #93C5FD"
                  : isOS
                  ? "1px solid #C4B5FD"
                  : "1px solid #5EEAD4",
              }}
            >
              <span
                className="text-xs font-mono font-bold px-3 py-1.5"
                style={{
                  background: isOD ? "#DBEAFE" : isOS ? "#EDE9FE" : "#CCFBF1",
                  color: isOD ? "#1E40AF" : isOS ? "#5B21B6" : "#115E59",
                }}
              >
                {dx.icd10Code}
              </span>
              {dx.eyeAffected && (
                <span
                  className="text-[11px] font-mono font-semibold px-2.5 py-1.5"
                  style={{
                    color: isOD ? "#1E40AF" : isOS ? "#5B21B6" : "#115E59",
                  }}
                >
                  {dx.eyeAffected}
                </span>
              )}
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => removeDiagnosis(dx.id)}
                  className="text-xs hover-danger text-[var(--text-muted)] px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${dx.icd10Code}`}
                >
                  &times;
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}

      {diagnoses.length === 0 && !showPicker && (
        <div className="rounded-xl p-8 text-center bg-[var(--bg-glass)] border border-[var(--glass-border)]">
          <p className="text-caption text-[var(--text-muted)]">
            No diagnoses added yet.{" "}
            {!isReadOnly && "Click \u201C+ Add Diagnosis\u201D to search ICD-10 codes."}
          </p>
        </div>
      )}

      {/* Code picker */}
      {showPicker && (
        <div className="rounded-xl overflow-hidden bg-[var(--bg-glass)] border border-[var(--glass-border)]">
          <div className="p-3 border-b border-[var(--border-subtle)]">
            <input
              type="text"
              placeholder="Search ICD-10 codes (e.g. myopia, H52, glaucoma)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl text-xs glass-input"
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-caption text-[var(--text-muted)]">
                No codes match &quot;{search}&quot;
              </div>
            ) : (
              filtered.map((code, i) => (
                <div
                  key={code.code}
                  className={`flex items-center gap-3 px-4 py-3 hover-row ${
                    i > 0 ? "border-t border-[var(--border-subtle)]" : ""
                  }`}
                >
                  <span className="text-xs font-mono font-bold w-20 flex-shrink-0 text-[var(--accent)]">
                    {code.code}
                  </span>
                  <span className="flex-1 text-xs text-[var(--text-primary)]">
                    {code.description}
                  </span>
                  <span className="text-overline text-[var(--text-muted)]">
                    {code.category}
                  </span>
                  <div className="flex gap-1.5">
                    {(["OD", "OS", "OU"] as EyeLaterality[]).map((eye) => (
                      <button
                        key={eye}
                        type="button"
                        onClick={() => addDiagnosis(code, eye)}
                        className="text-[11px] font-mono font-semibold px-3 py-1.5 rounded-lg hover-laterality bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)]"
                      >
                        {eye}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
