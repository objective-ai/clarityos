"use client";

import { Clock, Check, CheckCheck, Eye, XCircle } from "lucide-react";
import type { MessageStatus } from "@/types/messaging";

interface IconConfig {
  Icon: typeof Clock;
  color: string;
  tooltip: (timestamp?: string, reason?: string | null) => string;
}

const ICON_MAP: Record<MessageStatus, IconConfig> = {
  queued: {
    Icon: Clock,
    color: "var(--text-muted)",
    tooltip: () => "Queued — scheduled to send",
  },
  sent: {
    Icon: Check,
    color: "var(--text-secondary)",
    tooltip: (ts) => `Sent ${ts ?? ""}`.trim(),
  },
  delivered: {
    Icon: CheckCheck,
    color: "var(--accent)",
    tooltip: (ts) => `Delivered ${ts ?? ""}`.trim(),
  },
  read: {
    Icon: Eye,
    color: "var(--state-info)",
    tooltip: (ts) => `Opened ${ts ?? ""}`.trim(),
  },
  failed: {
    Icon: XCircle,
    color: "var(--state-critical)",
    tooltip: (_ts, reason) => `${reason ?? "Failed"} — Resend Message?`,
  },
  deferred: {
    Icon: Clock,
    color: "var(--state-warning)",
    tooltip: () => "Deferred to next allowed window",
  },
  cancelled: {
    Icon: XCircle,
    color: "var(--text-muted)",
    tooltip: () => "Cancelled",
  },
};

interface MessageStatusIconProps {
  status: MessageStatus;
  timestamp?: string;
  failureReason?: string | null;
  onResend?: () => void;
  size?: number;
}

export function MessageStatusIcon({
  status,
  timestamp,
  failureReason,
  onResend,
  size = 16,
}: MessageStatusIconProps) {
  const cfg = ICON_MAP[status];
  const { Icon } = cfg;
  const label = cfg.tooltip(timestamp, failureReason);

  return (
    <span className="inline-flex items-center gap-2">
      <Icon
        size={size}
        style={{ color: cfg.color }}
        aria-label={label}
        role="img"
      >
        <title>{label}</title>
      </Icon>
      {status === "failed" && onResend && (
        <button
          type="button"
          onClick={onResend}
          className="text-xs underline underline-offset-2 hover:brightness-110"
          style={{ color: "var(--accent)" }}
          aria-label="Resend Message"
        >
          Resend Message
        </button>
      )}
    </span>
  );
}
