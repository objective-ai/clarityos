"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  InboundClassification,
  InboundMessage,
} from "@/types/messaging";

interface InboxItemProps {
  inbound: InboundMessage;
  patientName: string | null;
  isSelected: boolean;
  onClick: () => void;
}

const CLASS_LABELS: Record<InboundClassification, string> = {
  reschedule_request: "Reschedule",
  cancellation: "Cancellation",
  question_clinical: "Clinical Q",
  question_billing: "Billing Q",
  thank_you: "Thank you",
  spam: "Spam",
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function InboxItem({
  inbound,
  patientName,
  isSelected,
  onClick,
}: InboxItemProps) {
  const isUnread = !inbound.isRead;
  const snippet =
    inbound.body.length > 80 ? `${inbound.body.slice(0, 80).trim()}…` : inbound.body;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        "hover-row flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
        isSelected && "bg-[var(--bg-overlay)]"
      )}
    >
      <span
        aria-hidden="true"
        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
        style={{
          background: isUnread ? "var(--accent)" : "transparent",
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate text-sm"
            style={{
              color: "var(--text-primary)",
              fontWeight: isUnread ? 600 : 500,
            }}
          >
            {patientName ?? inbound.fromE164}
          </span>
          <span className="text-caption shrink-0" style={{ color: "var(--text-muted)" }}>
            {formatTimestamp(inbound.receivedAt)}
          </span>
        </div>
        <p
          className="mt-0.5 truncate text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          {snippet}
        </p>
        {inbound.classification && (
          <div className="mt-1.5">
            <Badge variant="info">{CLASS_LABELS[inbound.classification]}</Badge>
          </div>
        )}
      </div>
    </button>
  );
}
