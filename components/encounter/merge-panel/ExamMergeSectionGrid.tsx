"use client";

import { useCallback } from "react";
import { Undo2, ArrowLeft } from "lucide-react";
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

// 7-column layout: Structure | Dr OD | icon | AI OD | Dr OS | icon | AI OS
const GRID = "grid grid-cols-[120px_1fr_28px_minmax(100px,1fr)_1fr_28px_minmax(100px,1fr)] gap-2";

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
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Error"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleWNL} className="text-xs">
            Set WNL
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopyOdToOs} className="text-xs">
            OD → OS
          </Button>
        </div>
      </div>

      {/* 7-column grid */}
      <div className="px-5 pb-4">
        {/* Column headers */}
        <div className={`${GRID} py-2 border-b border-[var(--border-subtle)]`}>
          <span className="text-overline text-[var(--text-muted)]">Structure</span>
          <span className="text-overline text-center text-[var(--text-muted)]">OD (Doctor)</span>
          <span />
          <span className="text-overline text-center text-[var(--accent)]/70">OD (AI)</span>
          <span className="text-overline text-center text-[var(--text-muted)]">OS (Doctor)</span>
          <span />
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

          const aiOdMapped = aiOdRaw ? mapAiStatus(section, field.key, aiOdRaw.status, aiOdRaw.notes) : null;
          const aiOsMapped = aiOsRaw ? mapAiStatus(section, field.key, aiOsRaw.status, aiOsRaw.notes) : null;

          const odAbnormal = odFinding.status !== field.defaultStatus;
          const osAbnormal = osFinding.status !== field.defaultStatus;

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
              className={`${GRID} py-2 border-b border-[var(--border-subtle)] last:border-b-0 rounded-sm ${rowHighlight}`}
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
                onStatusChange={handleStatusChange}
                onFindingChange={handleFindingChange}
              />

              {/* OD icon: insert or revert */}
              <div className="self-center flex justify-center">
                {aiOdRaw && aiOdMapped ? (
                  odIsInserted ? (
                    <button
                      type="button"
                      onClick={() => onRevert(sectionShort, "od", field.key)}
                      className="w-6 h-6 flex items-center justify-center rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                      title="Revert to original"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onInsert(sectionShort, "od", field.key, aiOdRaw)}
                      className="w-6 h-6 flex items-center justify-center rounded text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                      title="Insert AI value"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  )
                ) : null}
              </div>

              {/* OD AI */}
              <div className="self-center">
                {aiOdRaw && aiOdMapped ? (
                  <MergeFieldCell
                    status={aiOdMapped.status}
                    notes={aiOdMapped.finding}
                    confidence={aiOdRaw.confidence}
                    inserted={odIsInserted}
                  />
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]/50">—</span>
                )}
              </div>

              {/* OS Doctor */}
              <DoctorCell
                finding={osFinding}
                field={field}
                eye="os"
                structure={field.key}
                isAbnormal={osAbnormal}
                onStatusChange={handleStatusChange}
                onFindingChange={handleFindingChange}
              />

              {/* OS icon: insert or revert */}
              <div className="self-center flex justify-center">
                {aiOsRaw && aiOsMapped ? (
                  osIsInserted ? (
                    <button
                      type="button"
                      onClick={() => onRevert(sectionShort, "os", field.key)}
                      className="w-6 h-6 flex items-center justify-center rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                      title="Revert to original"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onInsert(sectionShort, "os", field.key, aiOsRaw)}
                      className="w-6 h-6 flex items-center justify-center rounded text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                      title="Insert AI value"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  )
                ) : null}
              </div>

              {/* OS AI */}
              <div className="self-center">
                {aiOsRaw && aiOsMapped ? (
                  <MergeFieldCell
                    status={aiOsMapped.status}
                    notes={aiOsMapped.finding}
                    confidence={aiOsRaw.confidence}
                    inserted={osIsInserted}
                  />
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]/50">—</span>
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
  onStatusChange: (eye: "od" | "os", structure: string, value: string) => void;
  onFindingChange: (eye: "od" | "os", structure: string, value: string) => void;
}

function DoctorCell({
  finding,
  field,
  eye,
  structure,
  isAbnormal,
  onStatusChange,
  onFindingChange,
}: DoctorCellProps) {
  return (
    <div className="space-y-1">
      <select
        value={finding.status}
        onChange={(e) => onStatusChange(eye, structure, e.target.value)}
        className={`w-full px-2 py-1.5 rounded-lg text-xs glass-input ${
          isAbnormal ? "ring-1 ring-[var(--state-warning)]" : ""
        }`}
      >
        {field.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {isAbnormal && (
        <input
          type="text"
          value={finding.finding}
          onChange={(e) => onFindingChange(eye, structure, e.target.value)}
          placeholder="Details…"
          className="w-full px-2 py-1 rounded-lg text-xs glass-input"
        />
      )}
    </div>
  );
}
