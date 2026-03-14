"use client";

import type { ConflictRow } from "./buildConflicts";
import { ConfidenceBadge } from "../validation-station/ConfidenceBadge";

interface ConflictRowItemProps {
  row: ConflictRow;
  onToggle: (fieldKey: string, resolution: "keep" | "use_ai") => void;
  isFocused?: boolean;
  id?: string;
}

export function ConflictRowItem({ row, onToggle, isFocused, id }: ConflictRowItemProps) {
  const isNew = !row.hasConflict && row.humanValue == null;
  const isConflict = row.hasConflict;

  return (
    <div
      id={id}
      role="option"
      aria-selected={row.resolution === "use_ai"}
      className={`grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all ${
        isFocused
          ? "ring-2 ring-[var(--accent)]/40 bg-[var(--bg-elevated)] border-l-2 border-l-[var(--accent)]"
          : isConflict
            ? "border border-amber-500/30 bg-amber-500/5"
            : "border border-transparent"
      }`}
    >
      {/* Label */}
      <div className="font-medium text-[var(--text-primary)] truncate" title={row.label}>
        {row.label}
        {isNew && (
          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] font-medium">
            new
          </span>
        )}
      </div>

      {/* Human value */}
      <div className="text-[var(--text-secondary)] truncate" title={row.humanValue ?? ""}>
        {row.humanValue || <span className="text-[var(--text-muted)] italic">empty</span>}
      </div>

      {/* AI value + confidence */}
      <div className="flex flex-col gap-0.5 truncate">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-[var(--text-primary)] truncate" title={row.aiValue}>
            {row.aiValue}
          </span>
          <ConfidenceBadge level={row.confidence} />
        </div>
        {/* Show raw pupil text so doctor sees context behind boolean */}
        {typeof row.aiRawData?.rawPupilText === "string" && (
          <span className="text-[9px] italic text-[var(--text-muted)] truncate" title={row.aiRawData.rawPupilText}>
            AI heard: &ldquo;{row.aiRawData.rawPupilText}&rdquo;
          </span>
        )}
      </div>

      {/* Toggle buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {isNew ? (
          <>
            <button
              onClick={() => onToggle(row.fieldKey, "use_ai")}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                row.resolution === "use_ai"
                  ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--glass-border)]"
              }`}
            >
              Add
            </button>
            <button
              onClick={() => onToggle(row.fieldKey, "keep")}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                row.resolution === "keep"
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--glass-border)]"
              }`}
            >
              Skip
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onToggle(row.fieldKey, "keep")}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                row.resolution === "keep"
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--glass-border)]"
              }`}
            >
              Keep Mine
            </button>
            <button
              onClick={() => onToggle(row.fieldKey, "use_ai")}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                row.resolution === "use_ai"
                  ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--glass-border)]"
              }`}
            >
              Use AI
            </button>
          </>
        )}
      </div>
    </div>
  );
}
