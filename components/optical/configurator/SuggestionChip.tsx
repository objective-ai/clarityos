"use client";

import { useOpticalOrderConfigStore } from "@/store/opticalOrderConfigStore";

interface Suggestion {
  field: string;
  value: string | string[];
  matched: string[];
}

interface Props {
  suggestion: Suggestion;
  onAccept: () => void;
  fieldName: string;
}

export function SuggestionChip({ suggestion, onAccept, fieldName }: Props) {
  const { acceptSuggestion, dismissSuggestion } = useOpticalOrderConfigStore();
  const display = Array.isArray(suggestion.value)
    ? suggestion.value.join(", ")
    : suggestion.value;
  const matchedTooltip = `AI suggests ${display} (matched: ${(
    suggestion.matched ?? []
  ).join(", ")})`;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[#2DD4BF]/40 bg-[#2DD4BF]/10 px-2 py-0.5 text-xs text-[var(--text-primary)]"
      title={matchedTooltip}
    >
      <button
        type="button"
        onClick={async () => {
          onAccept();
          await acceptSuggestion(fieldName);
        }}
        aria-label={`Accept ${suggestion.field} suggestion`}
        className="font-medium"
      >
        ✨ {display}
      </button>
      <button
        type="button"
        onClick={() => dismissSuggestion(fieldName)}
        aria-label={`Dismiss ${suggestion.field} suggestion`}
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        ×
      </button>
    </span>
  );
}
