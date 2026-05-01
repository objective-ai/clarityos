"use client";

import { AlertTriangle } from "lucide-react";
import type { MessageChannel } from "@/types/messaging";

interface OptOutWarningProps {
  channel: MessageChannel;
  reason?: "OPT_OUT" | "PAUSED" | "INVALID_INPUT";
  pausedUntil?: string;
}

export function OptOutWarning({ channel, reason = "OPT_OUT", pausedUntil }: OptOutWarningProps) {
  const channelLabel = channel === "sms" ? "SMS" : "email";

  let copy: string;
  if (reason === "PAUSED") {
    copy = pausedUntil
      ? `Messaging paused until ${pausedUntil}.`
      : "Messaging paused for this patient.";
  } else if (reason === "INVALID_INPUT") {
    copy = `Cannot send — invalid recipient ${channelLabel}.`;
  } else {
    copy = `This patient has opted out of ${channelLabel}. Message blocked.`;
  }

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs"
      style={{
        borderColor: "rgba(248,113,113,0.25)",
        background: "rgba(248,113,113,0.08)",
        color: "var(--state-critical)",
      }}
    >
      <AlertTriangle size={14} aria-hidden="true" />
      <span>{copy}</span>
    </div>
  );
}
