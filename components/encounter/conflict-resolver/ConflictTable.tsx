"use client";

import type { ConflictRow, ConflictSection } from "./buildConflicts";
import { ConflictRowItem } from "./ConflictRowItem";

const SECTION_LABELS: Record<ConflictSection, string> = {
  chief_complaint: "Chief Complaint",
  vitals: "Vitals",
  exam_anterior: "Anterior Segment",
  exam_posterior: "Posterior Segment",
  diagnoses: "Diagnoses",
  refraction: "Refraction (Manifest)",
  assessment: "Assessment & Plan",
};

const SECTION_ORDER: ConflictSection[] = [
  "chief_complaint",
  "vitals",
  "exam_anterior",
  "exam_posterior",
  "diagnoses",
  "refraction",
  "assessment",
];

interface ConflictTableProps {
  rows: ConflictRow[];
  onToggle: (fieldKey: string, resolution: "keep" | "use_ai") => void;
  focusedIndex: number;
  autoCount: number;
  confirmedCount: number;
  conflictCount: number;
  newDxCount: number;
}

export function ConflictTable({ rows, onToggle, focusedIndex, autoCount, confirmedCount, conflictCount, newDxCount }: ConflictTableProps) {
  // Group rows by section
  const grouped = new Map<ConflictSection, ConflictRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.section) ?? [];
    list.push(row);
    grouped.set(row.section, list);
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">
        No suggestions — all fields match or AI had nothing to add.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tier banner */}
      {(autoCount > 0 || confirmedCount > 0) && (
        <div className="px-4 py-3 rounded-lg mb-3 mx-1 bg-[var(--accent)]/5 border border-[var(--accent)]/20">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--accent)]">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 7.5l2.5 2.5 4.5-5" />
            </svg>
            {confirmedCount > 0
              ? `${confirmedCount + autoCount} findings confirmed by AI`
              : `${autoCount} findings staged`}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5 ml-6">
            Review {rows.length} item{rows.length !== 1 ? "s" : ""} below
            {conflictCount > 0 && ` (${conflictCount} conflict${conflictCount !== 1 ? "s" : ""})`}
            {newDxCount > 0 && `${conflictCount > 0 ? "," : ""} ${newDxCount} new Dx`}
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 px-3 py-2 border-b border-[var(--glass-border)] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
        <div>Field</div>
        <div>Your Entry</div>
        <div>AI Suggestion</div>
        <div className="w-[120px]">Action</div>
      </div>

      {/* Scrollable body */}
      <div
        className="flex-1 overflow-y-auto px-1 py-2 space-y-4"
        role="listbox"
        aria-activedescendant={rows[focusedIndex] ? `conflict-row-${rows[focusedIndex].fieldKey}` : undefined}
        aria-label="AI suggestions for review"
      >
        {SECTION_ORDER.map((section) => {
          const sectionRows = grouped.get(section);
          if (!sectionRows || sectionRows.length === 0) return null;

          return (
            <div key={section}>
              <div
                data-section={section}
                className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-3 mb-1"
              >
                {SECTION_LABELS[section]}
              </div>
              <div className="space-y-0.5">
                {sectionRows.map((row) => {
                  const globalIdx = rows.indexOf(row);
                  return (
                    <ConflictRowItem
                      key={row.fieldKey}
                      row={row}
                      onToggle={onToggle}
                      isFocused={globalIdx === focusedIndex}
                      id={`conflict-row-${row.fieldKey}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Keyboard legend */}
      <div className="flex items-center justify-center gap-4 px-4 py-2.5 border-t border-[var(--border-subtle)]">
        {[
          { keys: "j/k", label: "Nav" },
          { keys: "a", label: "Accept" },
          { keys: "i", label: "Ignore" },
          { keys: "Enter", label: "Commit" },
        ].map(({ keys, label }) => (
          <span key={keys} className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--glass-border)] bg-[var(--bg-glass)] font-mono text-[10px] text-[var(--text-secondary)]">
              {keys}
            </kbd>
            <span className="text-[10px]">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
