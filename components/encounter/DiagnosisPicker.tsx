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
// Common optometry ICD-10 codes
// ---------------------------------------------------------------------------

interface ICD10Code {
  code: string;
  description: string;
  category: string;
}

const COMMON_CODES: ICD10Code[] = [
  { code: "H52.13", description: "Myopia, bilateral", category: "Refractive" },
  { code: "H52.11", description: "Myopia, right eye", category: "Refractive" },
  { code: "H52.12", description: "Myopia, left eye", category: "Refractive" },
  { code: "H52.03", description: "Hypermetropia, bilateral", category: "Refractive" },
  { code: "H52.223", description: "Regular astigmatism, bilateral", category: "Refractive" },
  { code: "H52.4", description: "Presbyopia", category: "Refractive" },
  { code: "H40.001", description: "Preglaucoma, unspecified, right eye", category: "Glaucoma" },
  { code: "H40.002", description: "Preglaucoma, unspecified, left eye", category: "Glaucoma" },
  { code: "H40.11X0", description: "Primary open-angle glaucoma, stage unspecified", category: "Glaucoma" },
  { code: "H40.053", description: "Ocular hypertension, bilateral", category: "Glaucoma" },
  { code: "H25.10", description: "Age-related nuclear cataract, unspecified eye", category: "Cataract" },
  { code: "H25.11", description: "Age-related nuclear cataract, right eye", category: "Cataract" },
  { code: "H25.12", description: "Age-related nuclear cataract, left eye", category: "Cataract" },
  { code: "H35.30", description: "Unspecified macular degeneration", category: "Retinal" },
  { code: "E11.319", description: "Type 2 DM with unspec diabetic retinopathy without macular edema", category: "Retinal" },
  { code: "H35.3110", description: "Nonexudative AMD, right eye, stage unspec", category: "Retinal" },
  { code: "H04.123", description: "Dry eye syndrome, bilateral", category: "Dry Eye" },
  { code: "H04.121", description: "Dry eye syndrome, right eye", category: "Dry Eye" },
  { code: "H04.122", description: "Dry eye syndrome, left eye", category: "Dry Eye" },
  { code: "Z01.00", description: "Encounter for examination of eyes without abnormal findings", category: "General" },
  { code: "Z01.01", description: "Encounter for examination of eyes with abnormal findings", category: "General" },
];

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

  // Initialize on mount
  useEffect(() => {
    store.init(encounterId, initialDiagnoses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return COMMON_CODES;
    const q = search.toLowerCase();
    return COMMON_CODES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [search]);

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
