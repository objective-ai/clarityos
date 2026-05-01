"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChannelPreferenceChip } from "./ChannelPreferenceChip";
import type { RecallCandidate } from "@/types/messaging";

interface RecallQueueRowProps {
  candidate: RecallCandidate;
  /** Patient consents (fetched at queue load) — used to render channel chip + opt-out badge. */
  consents?: import("@/types/messaging").ConsentFlags;
  isSelected: boolean;
  onSelectChange: (selected: boolean) => void;
  onSendOne: () => void;
  onRemove: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RecallQueueRow({
  candidate,
  consents,
  isSelected,
  onSelectChange,
  onSendOne,
  onRemove,
}: RecallQueueRowProps) {
  const preferred: "sms" | "email" | "both" =
    candidate.phoneE164 && candidate.email
      ? "both"
      : candidate.phoneE164
        ? "sms"
        : "email";

  const hasContact = !!(candidate.phoneE164 || candidate.email);

  return (
    <tr className="hover-row border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <td className="px-3 py-3 align-middle">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelectChange(e.target.checked)}
          aria-label={`Select ${candidate.firstName} ${candidate.lastName}`}
          disabled={!hasContact}
        />
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="text-sm" style={{ color: "var(--text-primary)" }}>
          {candidate.firstName} {candidate.lastName}
        </div>
        <div className="text-caption" style={{ color: "var(--text-muted)" }}>
          Last visit {formatDate(candidate.lastFinalizedAt)}
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        {consents ? (
          <ChannelPreferenceChip consents={consents} preferredChannel={preferred} />
        ) : (
          <Badge variant="outline">{preferred}</Badge>
        )}
      </td>
      <td className="px-3 py-3 align-middle">
        {candidate.hasMarketingConsentSms || candidate.hasMarketingConsentEmail ? (
          <Badge variant="success">Marketing consent</Badge>
        ) : (
          <Badge variant="warning">No marketing consent</Badge>
        )}
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSendOne}
            disabled={!hasContact}
            className="min-h-[var(--touch-target)]"
            aria-label={`Send recall to ${candidate.firstName} ${candidate.lastName}`}
          >
            Send
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="min-h-[var(--touch-target)]"
            style={{ color: "var(--state-critical)" }}
            aria-label={`Remove ${candidate.firstName} ${candidate.lastName} from queue`}
          >
            Remove
          </Button>
        </div>
      </td>
    </tr>
  );
}
