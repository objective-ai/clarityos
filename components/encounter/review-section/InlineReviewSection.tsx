"use client";

import { useState, useCallback, useMemo } from "react";
import type { ScribeStructuredDataV2 } from "@/types/scribe";
import type { FindingsStoreKey } from "@/types/exam-findings";
import { useEncounterStore } from "@/store/encounterStore";
import { useVitalsStore } from "@/store/vitalsStore";
import { useExamFindingsStore } from "@/store/examFindingsStore";
import { useDiagnosisStore } from "@/store/diagnosisStore";
import { useRefractionStore } from "@/store/refractionStore";
import {
  buildConflicts,
  type ConflictRow,
  type ConflictSection,
  type StoreSnapshots,
} from "../conflict-resolver/buildConflicts";
import { applyResolutions } from "../conflict-resolver/applyResolutions";
import { ConflictTable } from "../conflict-resolver/ConflictTable";
import { StickySoapNote } from "./StickySoapNote";
import { QuickNav } from "./QuickNav";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_RX_COL = 2;
const SCROLL_CONTAINER_ID = "review-conflict-scroll";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InlineReviewSectionProps {
  encounterId: string;
  onClose: () => void;
  onApply: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InlineReviewSection({
  encounterId,
  onClose,
  onApply,
}: InlineReviewSectionProps) {
  const soapText = useEncounterStore(
    (s) => s.encounters[encounterId]?.aiSummaryText ?? "",
  );
  const generatedAt = useEncounterStore(
    (s) => s.encounters[encounterId]?.aiSummaryGeneratedAt,
  );
  const structuredData = useEncounterStore(
    (s) => s.encounters[encounterId]?.aiStructuredData ?? null,
  );

  // Snapshot store values once for conflict detection
  const storeSnapshots = useMemo<StoreSnapshots>(() => {
    const encounter = useEncounterStore.getState().encounters[encounterId];
    const vitals = useVitalsStore.getState().encounters[encounterId]?.draft;
    const anteriorKey = `${encounterId}:anterior_segment` as FindingsStoreKey;
    const posteriorKey = `${encounterId}:posterior_segment` as FindingsStoreKey;
    const examAnterior =
      useExamFindingsStore.getState().findings[anteriorKey]?.draft;
    const examPosterior =
      useExamFindingsStore.getState().findings[posteriorKey]?.draft;
    const diagnoses =
      useDiagnosisStore.getState().encounters[encounterId]?.diagnoses ?? [];
    const refractionCol =
      useRefractionStore.getState().columns[MANIFEST_RX_COL];

    return {
      chiefComplaint: encounter?.chiefComplaint ?? null,
      assessmentAndPlan: encounter?.assessmentAndPlan ?? null,
      vitals: vitals
        ? (vitals as unknown as Record<string, unknown>)
        : null,
      examAnterior: examAnterior
        ? {
            findings_od: examAnterior.findings_od as Record<
              string,
              { status: string; finding?: string }
            >,
            findings_os: examAnterior.findings_os as Record<
              string,
              { status: string; finding?: string }
            >,
          }
        : null,
      examPosterior: examPosterior
        ? {
            findings_od: examPosterior.findings_od as Record<
              string,
              { status: string; finding?: string }
            >,
            findings_os: examPosterior.findings_os as Record<
              string,
              { status: string; finding?: string }
            >,
          }
        : null,
      diagnoses: diagnoses.map((d) => ({
        icd10Code: d.icd10Code,
        description: d.description,
        eyeAffected: d.eyeAffected,
      })),
      refractionManifest: refractionCol?.draft
        ? {
            od: refractionCol.draft.od as unknown as Record<string, unknown>,
            os: refractionCol.draft.os as unknown as Record<string, unknown>,
          }
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId]);

  // Build initial conflicts from AI data vs store snapshots
  const initialConflicts = useMemo(() => {
    if (!structuredData) return [];
    return buildConflicts(structuredData, storeSnapshots);
  }, [structuredData, storeSnapshots]);

  const [conflicts, setConflicts] = useState<ConflictRow[]>(initialConflicts);
  const [applying, setApplying] = useState(false);

  // Derive counts
  const selectedCount = conflicts.filter(
    (r) => r.resolution === "use_ai",
  ).length;
  const conflictCount = conflicts.filter((r) => r.hasConflict).length;
  const hasConflicts = conflictCount > 0;

  // Sections that have at least one suggestion
  const activeSections = useMemo(() => {
    const set = new Set<ConflictSection>();
    for (const row of conflicts) set.add(row.section);
    return set;
  }, [conflicts]);

  // Toggle a single row's resolution
  const handleToggle = useCallback(
    (fieldKey: string, resolution: "keep" | "use_ai") => {
      setConflicts((prev) =>
        prev.map((row) =>
          row.fieldKey === fieldKey ? { ...row, resolution } : row,
        ),
      );
    },
    [],
  );

  // Apply selected resolutions to stores
  const handleApply = useCallback(async () => {
    setApplying(true);
    try {
      await applyResolutions(encounterId, conflicts, soapText);
      onApply();
    } catch (err) {
      console.error("Apply resolutions failed:", err);
    } finally {
      setApplying(false);
    }
  }, [encounterId, conflicts, soapText, onApply]);

  // Approve all safe (non-conflict, non-diagnosis) rows then apply
  const handleApproveAllSafe = useCallback(async () => {
    // Auto-select all non-conflict rows that aren't diagnoses
    const updated = conflicts.map((row) => {
      if (!row.hasConflict && row.section !== "diagnoses") {
        return { ...row, resolution: "use_ai" as const };
      }
      return row;
    });
    setConflicts(updated);

    // Apply immediately
    setApplying(true);
    try {
      await applyResolutions(encounterId, updated, soapText);
      onApply();
    } catch (err) {
      console.error("Approve all safe failed:", err);
    } finally {
      setApplying(false);
    }
  }, [conflicts, encounterId, soapText, onApply]);

  if (!structuredData) {
    return (
      <div className="glass-card p-8 text-center text-sm text-[var(--text-muted)]">
        No AI suggestions available. Generate a note first.
      </div>
    );
  }

  const safeCount = conflicts.filter(
    (r) => !r.hasConflict && r.section !== "diagnoses",
  ).length;

  return (
    <div className="flex flex-col gap-0 animate-fade-in">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 rounded-t-xl border border-[var(--glass-border)] bg-[var(--bg-glass)]">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Review & Merge
          </h2>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              hasConflicts
                ? "bg-amber-500/10 text-amber-400"
                : "bg-[var(--accent)]/10 text-[var(--accent)]"
            }`}
          >
            {conflicts.length} suggestion{conflicts.length !== 1 ? "s" : ""}
            {hasConflicts ? ` · ${conflictCount} conflict${conflictCount !== 1 ? "s" : ""}` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      {/* Split pane: sticky SOAP left, scrollable conflicts right */}
      <div className="flex gap-0 border-x border-[var(--glass-border)] min-h-[60vh]">
        {/* Left: Sticky SOAP Note (40%) */}
        <div className="w-2/5 border-r border-[var(--glass-border)]">
          <StickySoapNote soapText={soapText} generatedAt={generatedAt} />
        </div>

        {/* Right: Conflict Table (60%) */}
        <div
          id={SCROLL_CONTAINER_ID}
          className="w-3/5 overflow-y-auto max-h-[calc(100vh-160px)]"
        >
          <ConflictTable rows={conflicts} onToggle={handleToggle} />
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between px-6 py-3 rounded-b-xl border border-[var(--glass-border)] bg-[var(--bg-glass)]">
        <div className="text-xs text-[var(--text-muted)]">
          {hasConflicts && (
            <span className="text-amber-400">
              {conflictCount} conflict{conflictCount !== 1 ? "s" : ""} detected
              — defaulting to &quot;Keep Mine&quot;
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

          {safeCount > 0 && (
            <button
              type="button"
              onClick={handleApproveAllSafe}
              disabled={applying}
              className="text-xs px-4 py-2 rounded-xl font-medium text-[var(--text-secondary)] border border-[var(--glass-border)] hover-btn disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {applying
                ? "Applying..."
                : `Approve All Safe (${safeCount})`}
            </button>
          )}

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

      {/* QuickNav floating dots */}
      <QuickNav
        activeSections={activeSections}
        scrollContainerId={SCROLL_CONTAINER_ID}
      />
    </div>
  );
}
