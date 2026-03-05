"use client";

/**
 * components/ui/save-status-dot.tsx
 *
 * SaveStatusDot — ambient 2px colored dot for save state awareness.
 * Per design decision: "ambient awareness not progress bar" — keep it minimal.
 */

export type SaveStatus = "idle" | "loading" | "dirty" | "saving" | "saved" | "error";

const STATUS_COLORS: Record<Exclude<SaveStatus, "idle">, string> = {
  dirty: "var(--text-muted)",
  loading: "var(--accent)",
  saving: "var(--accent)",
  saved: "var(--state-normal)",
  error: "var(--state-critical)",
};

const STATUS_LABELS: Record<SaveStatus, string> = {
  idle: "",
  dirty: "Unsaved changes",
  loading: "Loading",
  saving: "Saving",
  saved: "Saved",
  error: "Save failed",
};

export function SaveStatusDot({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  const color = STATUS_COLORS[status];
  const isPulsing = status === "loading" || status === "saving";

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full transition-colors${isPulsing ? " animate-pulse" : ""}`}
      style={{ backgroundColor: color }}
      title={STATUS_LABELS[status]}
      aria-label={STATUS_LABELS[status]}
    />
  );
}
