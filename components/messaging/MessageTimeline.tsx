"use client";

import { Badge } from "@/components/ui/badge";
import { MessageStatusIcon } from "./MessageStatusIcon";
import type { MessageLog } from "@/types/messaging";

interface MessageTimelineProps {
  messages: MessageLog[];
}

function formatRelative(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pickStatusTimestamp(m: MessageLog): string {
  return m.readAt ?? m.deliveredAt ?? m.sentAt ?? m.failedAt ?? m.createdAt;
}

export function MessageTimeline({ messages }: MessageTimelineProps) {
  if (messages.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <h3 className="text-subhead mb-1" style={{ color: "var(--text-primary)" }}>
          No messages sent to this patient yet
        </h3>
        <p className="text-caption" style={{ color: "var(--text-muted)" }}>
          Use the Message button above to send an appointment reminder or note.
        </p>
      </div>
    );
  }

  return (
    <ol
      className="relative space-y-4 pl-6"
      aria-label="Message history"
    >
      <span
        aria-hidden="true"
        className="absolute left-2 top-1 bottom-1 w-px"
        style={{ background: "var(--border-subtle)" }}
      />
      {messages.map((m) => (
        <li key={m.id} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-4 top-1 inline-flex h-3 w-3 items-center justify-center rounded-full"
            style={{
              background: "var(--bg-elevated)",
              border: "2px solid var(--border-subtle)",
            }}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <MessageStatusIcon
                  status={m.status}
                  timestamp={formatRelative(pickStatusTimestamp(m))}
                  failureReason={m.failureReason}
                />
                <Badge variant="secondary">{m.channel === "sms" ? "SMS" : "Email"}</Badge>
              </div>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                {m.body}
              </p>
            </div>
            <span
              className="text-caption shrink-0"
              style={{ color: "var(--text-muted)" }}
            >
              {formatRelative(m.createdAt)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
