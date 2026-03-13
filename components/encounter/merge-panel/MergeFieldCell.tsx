"use client";

import type { ConfidenceLevel } from "@/types/scribe";
import { ConfidenceBadge } from "../validation-station/ConfidenceBadge";

interface MergeFieldCellProps {
  status: string;
  notes: string;
  confidence: ConfidenceLevel;
  inserted: boolean;
}

export function MergeFieldCell({
  status,
  notes,
  confidence,
  inserted,
}: MergeFieldCellProps) {
  return (
    <div className="min-w-0">
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
  );
}
