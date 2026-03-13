"use client";

import { useState, useMemo } from "react";
import { Sparkles, ChevronUp, ChevronDown, X } from "lucide-react";
import type { ScribeStructuredDataV2 } from "@/types/scribe";
import { ExamMergeSectionGrid } from "./ExamMergeSectionGrid";
import { useMergeState } from "./useMergeState";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExamMergePanelProps {
  encounterId: string;
  structuredData: ScribeStructuredDataV2;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExamMergePanel({
  encounterId,
  structuredData,
  onDismiss,
}: ExamMergePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const examFindings = structuredData.exam_findings;

  const merge = useMergeState(encounterId, examFindings);

  // Count total AI suggestions across both sections
  const counts = useMemo(() => {
    const ant = merge.getCounts("anterior");
    const pos = merge.getCounts("posterior");
    return {
      total: ant.total + pos.total,
      inserted: ant.inserted + pos.inserted,
    };
  }, [merge]);

  if (!examFindings || counts.total === 0) return null;

  const hasAnterior = !!(examFindings.anterior?.OD || examFindings.anterior?.OS);
  const hasPosterior = !!(examFindings.posterior?.OD || examFindings.posterior?.OS);

  return (
    <div className="rounded-2xl overflow-hidden border border-[var(--accent)]/20 bg-[var(--bg-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-[var(--accent)]/5 border-b border-[var(--accent)]/10">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            AI Exam Suggestions
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-medium">
            {counts.inserted}/{counts.total} applied
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Insert All */}
          {counts.inserted < counts.total && (
            <button
              type="button"
              onClick={() => {
                if (hasAnterior) merge.insertAll("anterior");
                if (hasPosterior) merge.insertAll("posterior");
              }}
              className="text-[10px] px-3 py-1.5 rounded-lg font-medium bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 transition-all"
            >
              Insert All
            </button>
          )}

          {/* Collapse */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          {/* Dismiss */}
          <button
            type="button"
            onClick={onDismiss}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            title="Dismiss AI suggestions"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="space-y-4 p-4">
          {hasAnterior && (
            <ExamMergeSectionGrid
              encounterId={encounterId}
              section="anterior_segment"
              label="Anterior Segment (Slit Lamp)"
              aiOD={examFindings.anterior?.OD}
              aiOS={examFindings.anterior?.OS}
              sectionShort="anterior"
              isInserted={merge.isInserted}
              onInsert={merge.insertField}
              onRevert={merge.revertField}
            />
          )}

          {hasPosterior && (
            <ExamMergeSectionGrid
              encounterId={encounterId}
              section="posterior_segment"
              label="Posterior Segment (Fundus)"
              aiOD={examFindings.posterior?.OD}
              aiOS={examFindings.posterior?.OS}
              sectionShort="posterior"
              isInserted={merge.isInserted}
              onInsert={merge.insertField}
              onRevert={merge.revertField}
            />
          )}
        </div>
      )}
    </div>
  );
}
