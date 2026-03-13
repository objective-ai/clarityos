"use client";

import { ArrowLeft, Check } from "lucide-react";
import type { ConfidenceLevel } from "@/types/scribe";
import { ConfidenceBadge } from "../validation-station/ConfidenceBadge";

interface MergeFieldCellProps {
  status: string;
  notes: string;
  confidence: ConfidenceLevel;
  inserted: boolean;
  onInsert: () => void;
}

export function MergeFieldCell({
  status,
  notes,
  confidence,
  inserted,
  onInsert,
}: MergeFieldCellProps) {
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <div className="flex-1 min-w-0">
        {/* Status value */}
        <div className="flex items-center gap-1">
          <span
            className={`text-xs truncate ${
              inserted
                ? "text-emerald-400 line-through"
                : "text-[var(--text-muted)] italic"
            }`}
            title={status}
          >
            {status}
          </span>
          <ConfidenceBadge level={confidence} />
        </div>

        {/* Notes */}
        {notes && (
          <span
            className={`text-[10px] truncate block mt-0.5 ${
              inserted
                ? "text-emerald-400/60 line-through"
                : "text-[var(--text-muted)]/70"
            }`}
            title={notes}
          >
            {notes}
          </span>
        )}
      </div>

      {/* Insert / Inserted icon */}
      <button
        type="button"
        onClick={onInsert}
        disabled={inserted}
        className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-colors ${
          inserted
            ? "bg-emerald-500/10 text-emerald-400 cursor-default"
            : "bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 cursor-pointer"
        }`}
        title={inserted ? "Inserted" : "Insert into doctor field"}
      >
        {inserted ? (
          <Check className="w-3 h-3" />
        ) : (
          <ArrowLeft className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
