"use client";

import { useCallback } from "react";
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useExamFindingsStore,
  useFindingsState,
} from "@/store/examFindingsStore";
import { getFieldMeta } from "@/lib/exam-findings-fields";
import { mapAiStatus } from "@/lib/ai-status-mapper";
import type { ExamSection, StructureFinding } from "@/types/exam-findings";
import type { ScribeStructureFindingV2 } from "@/types/scribe";
import { MergeFieldCell } from "./MergeFieldCell";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExamMergeSectionGridProps {
  encounterId: string;
  section: ExamSection;
  label: string;
  aiOD: Record<string, ScribeStructureFindingV2> | undefined;
  aiOS: Record<string, ScribeStructureFindingV2> | undefined;
  sectionShort: string; // "anterior" | "posterior"
  isInserted: (sectionShort: string, eye: "od" | "os", structure: string) => boolean;
  onInsert: (sectionShort: string, eye: "od" | "os", structure: string, finding: ScribeStructureFindingV2) => void;
  onRevert: (sectionShort: string, eye: "od" | "os", structure: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExamMergeSectionGrid({
  encounterId,
  section,
  label,
  aiOD,
  aiOS,
  sectionShort,
  isInserted,
  onInsert,
  onRevert,
}: ExamMergeSectionGridProps) {
  const state = useFindingsState(encounterId, section);
  const store = useExamFindingsStore();
  const fields = getFieldMeta(section);

  const handleStatusChange = useCallback(
    (eye: "od" | "os", structure: string, value: string) => {
      store.setStructureField(encounterId, section, eye, structure, "status", value);
    },
    [encounterId, section, store],
  );

  const handleFindingChange = useCallback(
    (eye: "od" | "os", structure: string, value: string) => {
      store.setStructureField(encounterId, section, eye, structure, "finding", value);
    },
    [encounterId, section, store],
  );

  const handleWNL = useCallback(() => {
    store.setWNL(encounterId, section);
  }, [encounterId, section, store]);

  const handleCopyOdToOs = useCallback(() => {
    store.copyOdToOs(encounterId, section);
  }, [encounterId, section, store]);

  if (!state) return null;
  const { draft, saveStatus } = state;

  return (
    <div className="rounded-xl overflow-hidden bg-[var(--bg-glass)] border border-[var(--glass-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <span className="text-overline text-[var(--text-primary)]">{label}</span>
          {draft.is_normal_wnl && <Badge variant="success">WNL</Badge>}
          {saveStatus !== "idle" && saveStatus !== "dirty" && (
            <Badge variant={saveStatus === "saving" ? "info" : saveStatus === "saved" ? "success" : "destructive"}>
              {saveStatus === "saving" ? "Saving\u2026" : saveStatus === "saved" ? "Saved" : "Error"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleWNL} className="text-xs">
            Set WNL
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyOdToOs} className="text-xs">
            OD \u2192 OS
          </Button>
        </div>
      </div>

      {/* 5-column grid */}
      <div className="px-5 pb-4">
        {/* Column headers */}
        <div className="grid grid-cols-[120px_1fr_minmax(100px,1fr)_1fr_minmax(100px,1fr)] gap-2 py-2 border-b border-[var(--border-subtle)]">
          <span className="text-overline text-[var(--text-muted)]">Structure</span>
          <span className="text-overline text-center text-[var(--text-muted)]">OD (Doctor)</span>
          <span className="text-overline text-center text-[var(--accent)]/70">OD (AI)</span>
          <span className="text-overline text-center text-[var(--text-muted)]">OS (Doctor)</span>
          <span className="text-overline text-center text-[var(--accent)]/70">OS (AI)</span>
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

          const aiOdRaw = aiOD?.[field.key];
          const aiOsRaw = aiOS?.[field.key];
          const hasAiData = !!aiOdRaw || !!aiOsRaw;

          // Map AI status to dropdown values
          const aiOdMapped = aiOdRaw ? mapAiStatus(section, field.key, aiOdRaw.status, aiOdRaw.notes) : null;
          const aiOsMapped = aiOsRaw ? mapAiStatus(section, field.key, aiOsRaw.status, aiOsRaw.notes) : null;

          const odAbnormal = odFinding.status !== field.defaultStatus;
          const osAbnormal = osFinding.status !== field.defaultStatus;

          // Highlight row if AI suggests abnormal but doctor has default
          const aiOdAbnormal = aiOdMapped && aiOdMapped.status !== field.defaultStatus;
          const aiOsAbnormal = aiOsMapped && aiOsMapped.status !== field.defaultStatus;
          const odConflict = aiOdAbnormal && !odAbnormal;
          const osConflict = aiOsAbnormal && !osAbnormal;
          const odIsInserted = isInserted(sectionShort, "od", field.key);
          const osIsInserted = isInserted(sectionShort, "os", field.key);

          let rowHighlight = "";
          if (odIsInserted || osIsInserted) {
            rowHighlight = "border-l-2 border-emerald-400 bg-emerald-500/5";
          } else if (odConflict || osConflict) {
            rowHighlight = "border-l-2 border-amber-400 bg-amber-500/5";
          } else if (hasAiData) {
            rowHighlight = "bg-[var(--accent)]/5";
          }

          return (
            <div
              key={field.key}
              className={`grid grid-cols-[120px_1fr_minmax(100px,1fr)_1fr_minmax(100px,1fr)] gap-2 py-2 border-b border-[var(--border-subtle)] last:border-b-0 rounded-sm ${rowHighlight}`}
            >
              {/* Structure label */}
              <label className="text-xs font-medium text-[var(--text-secondary)] self-center pl-1">
                {field.label}
              </label>

              {/* OD Doctor */}
              <DoctorCell
                finding={odFinding}
                field={field}
                eye="od"
                structure={field.key}
                isAbnormal={odAbnormal}
                isInserted={odIsInserted}
                onStatusChange={handleStatusChange}
                onFindingChange={handleFindingChange}
                onRevert={() => onRevert(sectionShort, "od", field.key)}
              />

              {/* OD AI */}
              <div className="self-center">
                {aiOdRaw && aiOdMapped ? (
                  <MergeFieldCell
                    status={aiOdMapped.status}
                    notes={aiOdMapped.finding}
                    confidence={aiOdRaw.confidence}
                    inserted={odIsInserted}
                    onInsert={() => onInsert(sectionShort, "od", field.key, aiOdRaw)}
                  />
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]/50">\u2014</span>
                )}
              </div>

              {/* OS Doctor */}
              <DoctorCell
                finding={osFinding}
                field={field}
                eye="os"
                structure={field.key}
                isAbnormal={osAbnormal}
                isInserted={osIsInserted}
                onStatusChange={handleStatusChange}
                onFindingChange={handleFindingChange}
                onRevert={() => onRevert(sectionShort, "os", field.key)}
              />

              {/* OS AI */}
              <div className="self-center">
                {aiOsRaw && aiOsMapped ? (
                  <MergeFieldCell
                    status={aiOsMapped.status}
                    notes={aiOsMapped.finding}
                    confidence={aiOsRaw.confidence}
                    inserted={osIsInserted}
                    onInsert={() => onInsert(sectionShort, "os", field.key, aiOsRaw)}
                  />
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]/50">\u2014</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Doctor cell (editable)
// ---------------------------------------------------------------------------

interface DoctorCellProps {
  finding: StructureFinding;
  field: { key: string; options: string[]; defaultStatus: string };
  eye: "od" | "os";
  structure: string;
  isAbnormal: boolean;
  isInserted: boolean;
  onStatusChange: (eye: "od" | "os", structure: string, value: string) => void;
  onFindingChange: (eye: "od" | "os", structure: string, value: string) => void;
  onRevert: () => void;
}

function DoctorCell({
  finding,
  field,
  eye,
  structure,
  isAbnormal,
  isInserted,
  onStatusChange,
  onFindingChange,
  onRevert,
}: DoctorCellProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <select
          value={finding.status}
          onChange={(e) => onStatusChange(eye, structure, e.target.value)}
          className={`flex-1 px-2 py-1.5 rounded-lg text-xs glass-input ${
            isAbnormal ? "ring-1 ring-[var(--state-warning)]" : ""
          } ${isInserted ? "ring-1 ring-emerald-400/50" : ""}`}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {isInserted && (
          <button
            type="button"
            onClick={onRevert}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            title="Revert to original"
          >
            <Undo2 className="w-3 h-3" />
          </button>
        )}
      </div>
      {isAbnormal && (
        <input
          type="text"
          value={finding.finding}
          onChange={(e) => onFindingChange(eye, structure, e.target.value)}
          placeholder="Details\u2026"
          className="w-full px-2 py-1 rounded-lg text-xs glass-input"
        />
      )}
    </div>
  );
}
