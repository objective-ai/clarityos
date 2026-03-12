"use client";

import type { ConfidenceLevel } from "@/types/scribe";

const BADGE_CONFIG: Record<ConfidenceLevel, { color: string; label: string }> = {
  high: { color: "bg-emerald-400", label: "High confidence" },
  medium: { color: "bg-amber-400", label: "Verify this value" },
  low: { color: "bg-red-400", label: "Low confidence — likely needs correction" },
};

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  className?: string;
}

export function ConfidenceBadge({ level, className = "" }: ConfidenceBadgeProps) {
  const config = BADGE_CONFIG[level];
  return (
    <span
      title={config.label}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${config.color} ${className}`}
    />
  );
}
