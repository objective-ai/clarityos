"use client";

import { useState, useCallback, useMemo } from "react";
import type { ScribeStructuredDataV2 } from "@/types/scribe";
import { useEncounterStore } from "@/store/encounterStore";
import { useVitalsStore } from "@/store/vitalsStore";
import { useExamFindingsStore } from "@/store/examFindingsStore";
import { useDiagnosisStore } from "@/store/diagnosisStore";
import { useRefractionStore } from "@/store/refractionStore";
import type { FindingsStoreKey } from "@/types/exam-findings";
import { SOAPViewer } from "./validation-station/SOAPViewer";
import { ConflictTable } from "./conflict-resolver/ConflictTable";
import { buildConflicts, type ConflictRow, type StoreSnapshots } from "./conflict-resolver/buildConflicts";
import { applyResolutions } from "./conflict-resolver/applyResolutions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConflictResolverModalProps {
  open: boolean;
  onClose: () => void;
  soapText: string;
  structuredData: ScribeStructuredDataV2;
  generatedAt?: string;
  encounterId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConflictResolverModal({
  open,
  onClose,
  soapText,
  structuredData,
  generatedAt,
  encounterId,
}: ConflictResolverModalProps) {
  // Snapshot store values on mount for conflict detection
  const storeSnapshots = useMemo<StoreSnapshots>(() => {
    const encounter = useEncounterStore.getState().encounters[encounterId];
    const vitals = useVitalsStore.getState().encounters[encounterId]?.draft;
    const anteriorKey = `${encounterId}:anterior_segment` as FindingsStoreKey;
    const posteriorKey = `${encounterId}:posterior_segment` as FindingsStoreKey;
    const examAnterior = useExamFindingsStore.getState().findings[anteriorKey]?.draft;
    const examPosterior = useExamFindingsStore.getState().findings[posteriorKey]?.draft;
    const diagnoses = useDiagnosisStore.getState().encounters[encounterId]?.diagnoses ?? [];
    const refractionCol = useRefractionStore.getState().columns[3];

    return {
      chiefComplaint: encounter?.chiefComplaint ?? null,
      assessmentAndPlan: encounter?.assessmentAndPlan ?? null,
      vitals: vitals ? (vitals as unknown as Record<string, unknown>) : null,
      examAnterior: examAnterior
        ? {
            findings_od: examAnterior.findings_od as Record<string, { status: string; finding?: string }>,
            findings_os: examAnterior.findings_os as Record<string, { status: string; finding?: string }>,
          }
        : null,
      examPosterior: examPosterior
        ? {
            findings_od: examPosterior.findings_od as Record<string, { status: string; finding?: string }>,
            findings_os: examPosterior.findings_os as Record<string, { status: string; finding?: string }>,
          }
        : null,
      diagnoses: diagnoses.map((d) => ({
        icd10Code: d.icd10Code,
        description: d.description,
        eyeAffected: d.eyeAffected,
      })),
      refractionFinalRx: refractionCol?.draft
        ? {
            od: refractionCol.draft.od as unknown as Record<string, unknown>,
            os: refractionCol.draft.os as unknown as Record<string, unknown>,
          }
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId, open]);

  // Build conflicts
  const initialConflicts = useMemo(
    () => buildConflicts(structuredData, storeSnapshots),
    [structuredData, storeSnapshots],
  );

  const [conflicts, setConflicts] = useState<ConflictRow[]>(initialConflicts);
  const [applying, setApplying] = useState(false);

  const handleToggle = useCallback((fieldKey: string, resolution: "keep" | "use_ai") => {
    setConflicts((prev) =>
      prev.map((row) => (row.fieldKey === fieldKey ? { ...row, resolution } : row)),
    );
  }, []);

  const selectedCount = conflicts.filter((r) => r.resolution === "use_ai").length;

  const handleApply = useCallback(async () => {
    setApplying(true);
    try {
      await applyResolutions(encounterId, conflicts, soapText);
      onClose();
    } catch (err) {
      console.error("Apply resolutions failed:", err);
    } finally {
      setApplying(false);
    }
  }, [encounterId, conflicts, soapText, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 flex flex-col w-full max-w-[1400px] m-4 rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--glass-border)] bg-[var(--bg-glass)]">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Review & Merge
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
              {conflicts.length} suggestions
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        {/* Split pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: SOAP Narrative */}
          <div className="w-2/5 border-r border-[var(--glass-border)] overflow-hidden">
            <SOAPViewer soapText={soapText} generatedAt={generatedAt} />
          </div>

          {/* Right: Conflict Table */}
          <div className="w-3/5 overflow-hidden">
            <ConflictTable rows={conflicts} onToggle={handleToggle} />
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--glass-border)] bg-[var(--bg-glass)]">
          <div className="text-xs text-[var(--text-muted)]">
            {conflicts.filter((r) => r.hasConflict).length > 0 && (
              <span className="text-amber-400">
                {conflicts.filter((r) => r.hasConflict).length} conflict{conflicts.filter((r) => r.hasConflict).length !== 1 ? "s" : ""} detected
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-xl font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || selectedCount === 0}
              className="text-xs px-5 py-2 rounded-xl font-semibold bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {applying ? "Applying..." : `Apply ${selectedCount} Selected`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
