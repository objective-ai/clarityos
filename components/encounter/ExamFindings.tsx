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
    <div className="space-y-3">
      {!filterSection && (
        <>
          <h2 className="section-title">Exam Findings</h2>
          <p className="text-caption mt-0.5 text-[var(--text-muted)]">
            Slit lamp &amp; fundus examination
          </p>
        </>
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
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <span className="text-overline text-[var(--text-primary)]">{label}</span>
          {draft.is_normal_wnl && (
            <Badge variant="success">WNL</Badge>
          )}
          {saveStatus !== "idle" && saveStatus !== "dirty" && (
            <Badge variant={saveStatus === "saving" ? "info" : saveStatus === "saved" ? "success" : "destructive"}>
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Error"}
            </Badge>
          )}
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleWNL}
              className="text-xs"
            >
              Set WNL
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyOdToOs}
              className="text-xs"
            >
              OD → OS
            </Button>
          </div>
        )}
      </div>

      {/* OD / OS Grid */}
      <div className="px-5 pb-4">
        {/* Column headers */}
        <div className="grid grid-cols-[140px_1fr_1fr] gap-3 py-2 border-b border-[var(--border-subtle)]">
          <span className="text-overline text-[var(--text-muted)]">Structure</span>
          <span className="text-overline text-center text-[var(--text-muted)]">OD (Right)</span>
          <span className="text-overline text-center text-[var(--text-muted)]">OS (Left)</span>
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
              className="grid grid-cols-[140px_1fr_1fr] gap-3 py-2 border-b border-[var(--border-subtle)] last:border-b-0"
            >
              <label className="text-xs font-medium text-[var(--text-secondary)] self-center">
                {field.label}
              </label>

              {/* OD cell */}
              <div className="space-y-1">
                <select
                  value={odFinding.status}
                  onChange={(e) => handleStatusChange("od", field.key, e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs glass-input ${
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
                    className="w-full px-2.5 py-1 rounded-lg text-xs glass-input"
                  />
                )}
              </div>

              {/* OS cell */}
              <div className="space-y-1">
                <select
                  value={osFinding.status}
                  onChange={(e) => handleStatusChange("os", field.key, e.target.value)}
                  disabled={isReadOnly}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs glass-input ${
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
                    className="w-full px-2.5 py-1 rounded-lg text-xs glass-input"
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Provider notes */}
        <div className="mt-3">
          <label className="block text-overline mb-1.5">Provider Notes</label>
          <textarea
            value={draft.provider_notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            disabled={isReadOnly}
            rows={2}
            placeholder="Additional notes for this section…"
            className="w-full px-3 py-2 rounded-xl text-xs glass-input resize-none"
            style={{ minHeight: "60px" }}
          />
        </div>
      </div>
    </div>
  );
}
