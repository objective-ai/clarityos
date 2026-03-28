"use client";

import { useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useExamFindingsStore,
  useFindingsState,
} from "@/store/examFindingsStore";
import { getFieldMeta } from "@/lib/exam-findings-fields";
import type {
  ExamSection,
  FindingsDraft,
  StructureFinding,
} from "@/types/exam-findings";

// ---------------------------------------------------------------------------
// Section metadata
// ---------------------------------------------------------------------------

const SECTIONS: { key: ExamSection; label: string }[] = [
  { key: "anterior_segment", label: "Anterior Segment (Slit Lamp)" },
  { key: "posterior_segment", label: "Posterior Segment (Fundus)" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExamFindingsProps {
  encounterId: string;
  isReadOnly?: boolean;
  /** Render only this section. Omit to render both. */
  section?: ExamSection;
  initialAnterior?: Partial<FindingsDraft>;
  initialPosterior?: Partial<FindingsDraft>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExamFindings({
  encounterId,
  isReadOnly = false,
  section: filterSection,
  initialAnterior,
  initialPosterior,
}: ExamFindingsProps) {
  const store = useExamFindingsStore();

  // Initialize both sections on mount
  useEffect(() => {
    store.init(encounterId, "anterior_segment", initialAnterior);
    store.init(encounterId, "posterior_segment", initialPosterior);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId]);

  const sections = filterSection
    ? SECTIONS.filter((s) => s.key === filterSection)
    : SECTIONS;

  return (
    <div className="space-y-2">
      {!filterSection && (
        <h2 className="text-xs font-semibold text-[var(--text-primary)]">Exam Findings</h2>
      )}

      {sections.map((sec) => (
        <SectionPanel
          key={sec.key}
          encounterId={encounterId}
          section={sec.key}
          label={sec.label}
          isReadOnly={isReadOnly}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section panel (one per anterior / posterior)
// ---------------------------------------------------------------------------

interface SectionPanelProps {
  encounterId: string;
  section: ExamSection;
  label: string;
  isReadOnly: boolean;
}

function SectionPanel({
  encounterId,
  section,
  label,
  isReadOnly,
}: SectionPanelProps) {
  const state = useFindingsState(encounterId, section);
  const store = useExamFindingsStore();
  const fields = getFieldMeta(section);

  const handleStatusChange = useCallback(
    (eye: "od" | "os", structure: string, value: string) => {
      if (isReadOnly) return;
      store.setStructureField(encounterId, section, eye, structure, "status", value);
    },
    [encounterId, section, isReadOnly, store],
  );

  const handleFindingChange = useCallback(
    (eye: "od" | "os", structure: string, value: string) => {
      if (isReadOnly) return;
      store.setStructureField(encounterId, section, eye, structure, "finding", value);
    },
    [encounterId, section, isReadOnly, store],
  );

  const handleWNL = useCallback(() => {
    store.setWNL(encounterId, section);
  }, [encounterId, section, store]);

  const handleCopyOdToOs = useCallback(() => {
    store.copyOdToOs(encounterId, section);
  }, [encounterId, section, store]);

  const handleNotesChange = useCallback(
    (notes: string) => {
      if (isReadOnly) return;
      store.setProviderNotes(encounterId, section, notes);
    },
    [encounterId, section, isReadOnly, store],
  );

  if (!state) return null;

  const { draft, saveStatus } = state;

  return (
    <div className="rounded-xl overflow-hidden bg-[var(--bg-glass)] border border-[var(--glass-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">{label}</span>
          {draft.is_normal_wnl && (
            <Badge variant="success" className="text-xs py-0">WNL</Badge>
          )}
          {saveStatus !== "idle" && saveStatus !== "dirty" && (
            <Badge variant={saveStatus === "saving" ? "info" : saveStatus === "saved" ? "success" : "destructive"} className="text-xs py-0">
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Error"}
            </Badge>
          )}
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleWNL}
              className="text-xs h-6 px-2"
            >
              WNL
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyOdToOs}
              className="text-xs h-6 px-2"
            >
              OD→OS
            </Button>
          </div>
        )}
      </div>

      {/* OD / OS Grid */}
      <div className="px-3 pb-2">
        {/* Column headers */}
        <div className="grid grid-cols-[100px_1fr_1fr] gap-2 py-1.5 border-b border-[var(--border-subtle)]">
          <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Structure</span>
          <span className="text-xs uppercase tracking-wider text-center text-[var(--text-muted)]">OD</span>
          <span className="text-xs uppercase tracking-wider text-center text-[var(--text-muted)]">OS</span>
        </div>

        {/* Field rows */}
        {fields.map((field) => {
          const odFinding: StructureFinding = draft.findings_od[field.key] ?? {
            status: field.defaultStatus,
            severity: null,
            finding: "",
          };
          const osFinding: StructureFinding = draft.findings_os[field.key] ?? {
            status: field.defaultStatus,
            severity: null,
            finding: "",
          };

          const odAbnormal = odFinding.status !== field.defaultStatus;
          const osAbnormal = osFinding.status !== field.defaultStatus;

          return (
            <div
              key={field.key}
              className="grid grid-cols-[100px_1fr_1fr] gap-2 py-1 border-b border-[var(--border-subtle)] last:border-b-0"
            >
              <label className="text-xs font-medium text-[var(--text-secondary)] self-center">
                {field.label}
              </label>

              {/* OD cell */}
              <div className="space-y-0.5">
                <select
                  value={odFinding.status}
                  onChange={(e) => handleStatusChange("od", field.key, e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-2 py-1 rounded-lg text-xs glass-input ${
                    odAbnormal ? "ring-1 ring-[var(--state-warning)]" : ""
                  }`}
                >
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {odAbnormal && (
                  <input
                    type="text"
                    value={odFinding.finding}
                    onChange={(e) => handleFindingChange("od", field.key, e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Details…"
                    className="w-full px-2 py-0.5 rounded-lg text-xs glass-input"
                  />
                )}
              </div>

              {/* OS cell */}
              <div className="space-y-0.5">
                <select
                  value={osFinding.status}
                  onChange={(e) => handleStatusChange("os", field.key, e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-2 py-1 rounded-lg text-xs glass-input ${
                    osAbnormal ? "ring-1 ring-[var(--state-warning)]" : ""
                  }`}
                >
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {osAbnormal && (
                  <input
                    type="text"
                    value={osFinding.finding}
                    onChange={(e) => handleFindingChange("os", field.key, e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Details…"
                    className="w-full px-2 py-0.5 rounded-lg text-xs glass-input"
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Provider notes */}
        <div className="mt-2">
          <label className="block text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">Provider Notes</label>
          <textarea
            value={draft.provider_notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            disabled={isReadOnly}
            rows={1}
            placeholder="Additional notes…"
            className="w-full px-2 py-1.5 rounded-lg text-xs glass-input resize-y"
          />
        </div>
      </div>
    </div>
  );
}
