"use client";

import type { ConflictRow, ConflictSection } from "./buildConflicts";
import { ConflictRowItem } from "./ConflictRowItem";

const SECTION_LABELS: Record<ConflictSection, string> = {
  chief_complaint: "Chief Complaint",
  vitals: "Vitals",
  exam_anterior: "Anterior Segment",
  exam_posterior: "Posterior Segment",
  diagnoses: "Diagnoses",
  refraction: "Refraction (Final Rx)",
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
}

export function ConflictTable({ rows, onToggle }: ConflictTableProps) {
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
      {/* Header row */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 px-3 py-2 border-b border-[var(--glass-border)] text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
        <div>Field</div>
        <div>Your Entry</div>
        <div>AI Suggestion</div>
        <div className="w-[120px]">Action</div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
        {SECTION_ORDER.map((section) => {
          const sectionRows = grouped.get(section);
          if (!sectionRows || sectionRows.length === 0) return null;

          return (
            <div key={section}>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-3 mb-1">
                {SECTION_LABELS[section]}
              </div>
              <div className="space-y-0.5">
                {sectionRows.map((row) => (
                  <ConflictRowItem
                    key={row.fieldKey}
                    row={row}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
