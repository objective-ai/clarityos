"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
  onCommit: (autoRows: ConflictRow[], reviewRows: ConflictRow[], soapText: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InlineReviewSection({
  encounterId,
  onClose,
  onCommit,
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
  // Capture the structured data value at mount time for stale-data detection
  const mountedStructuredDataRef = useRef(structuredData);

  // Snapshot store values once for conflict detection
  const storeSnapshots = useMemo<StoreSnapshots>(() => {
    const encounter = useEncounterStore.getState().encounters[encounterId];
    const vitals = useVitalsStore.getState().encounters[encounterId]?.draft;
    const anteriorKey = `${encounterId}:anterior_segment` as FindingsStoreKey;
    const posteriorKey = `${encounterId}:posterior_segment` as FindingsStoreKey;
    const anteriorSlice = useExamFindingsStore.getState().findings[anteriorKey];
    const posteriorSlice = useExamFindingsStore.getState().findings[posteriorKey];
    const examAnterior = anteriorSlice?.draft;
    const examPosterior = posteriorSlice?.draft;
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
      examAnteriorSaved: anteriorSlice?.committed != null,
      examPosteriorSaved: posteriorSlice?.committed != null,
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

  // Split conflicts by tier
  const autoRows = useMemo(
    () => conflicts.filter((r) => r.tier === "auto"),
    [conflicts],
  );
  const reviewRows = useMemo(
    () => conflicts.filter((r) => r.tier === "review"),
    [conflicts],
  );

  // Banner counts
  const confirmedCount = autoRows.filter((r) => r.humanValue != null).length;
  const autoStagedCount = autoRows.length - confirmedCount;
  const newDxCount = reviewRows.filter(
    (r) => r.section === "diagnoses" && r.fieldKey.endsWith(".new"),
  ).length;
  const reviewConflictCount = reviewRows.filter((r) => r.hasConflict).length;

  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus container on mount
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Derive counts
  const selectedCount = conflicts.filter(
    (r) => r.resolution === "use_ai",
  ).length;

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

  // Commit handler -- calls parent with auto + review rows
  const handleCommit = useCallback(async () => {
    setApplying(true);
    try {
      await onCommit(autoRows, reviewRows, soapText);
    } finally {
      setApplying(false);
    }
  }, [autoRows, reviewRows, soapText, onCommit]);

  // Keyboard handler -- scoped to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Input guard
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, reviewRows.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "a":
          e.preventDefault();
          if (reviewRows[focusedIndex]) {
            handleToggle(reviewRows[focusedIndex].fieldKey, "use_ai");
            setFocusedIndex((prev) => Math.min(prev + 1, reviewRows.length - 1));
          }
          break;
        case "i":
          e.preventDefault();
          if (reviewRows[focusedIndex]) {
            handleToggle(reviewRows[focusedIndex].fieldKey, "keep");
            setFocusedIndex((prev) => Math.min(prev + 1, reviewRows.length - 1));
          }
          break;
        case "Enter":
          e.preventDefault();
          handleCommit();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [reviewRows, focusedIndex, handleToggle, handleCommit, onClose]);

  // Concurrent generation guard -- detect stale data
  // structuredData is live; mountedStructuredDataRef holds the value at review open time
  const hasStaleData = structuredData !== mountedStructuredDataRef.current && structuredData !== null;

  if (!structuredData) {
    return (
      <div className="glass-card p-8 text-center text-sm text-[var(--text-muted)]">
        No AI suggestions available. Generate a note first.
      </div>
    );
  }

  return (
    <div ref={containerRef} tabIndex={0} className="flex flex-col gap-0 animate-fade-in outline-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-3 rounded-t-xl border border-[var(--glass-border)] bg-[var(--bg-glass)]">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Review & Merge
          </h2>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              reviewConflictCount > 0
                ? "bg-amber-500/10 text-amber-400"
                : "bg-[var(--accent)]/10 text-[var(--accent)]"
            }`}
          >
            {reviewRows.length} to review
            {reviewConflictCount > 0 ? ` · ${reviewConflictCount} conflict${reviewConflictCount !== 1 ? "s" : ""}` : ""}
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
          <ConflictTable
            rows={reviewRows}
            onToggle={handleToggle}
            focusedIndex={focusedIndex}
            autoCount={autoStagedCount}
            confirmedCount={confirmedCount}
            conflictCount={reviewConflictCount}
            newDxCount={newDxCount}
          />
        </div>
      </div>

      {hasStaleData && (
        <div className="px-4 py-2 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg mx-6">
          New AI data available — close and re-open review.
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between px-6 py-3 rounded-b-xl border border-[var(--glass-border)] bg-[var(--bg-glass)]">
        <div className="text-xs text-[var(--text-muted)]">
          {reviewConflictCount > 0 && (
            <span className="text-amber-400">
              {reviewConflictCount} conflict{reviewConflictCount !== 1 ? "s" : ""} detected
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

          <button
            type="button"
            onClick={handleCommit}
            disabled={applying}
            className="text-xs px-5 py-2 rounded-xl font-semibold bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {applying
              ? "Committing..."
              : `Commit (${autoRows.filter((r) => r.resolution === "use_ai").length + reviewRows.filter((r) => r.resolution === "use_ai").length})`}
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
