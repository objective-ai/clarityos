"use client";

import { useEffect, useState } from "react";
import { X, History, Bot, User, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClinicalDiffViewer } from "@/components/encounter/ClinicalDiffViewer";
import type { DiffEntry } from "@/components/encounter/ClinicalDiffViewer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_id: string;
  staff_name: string | null;
  encounter_id: string | null;
  patient_id: string | null;
  action_type: string;
  resource_type: string;
  detail: string | null;
  changes: Record<string, { old?: unknown; new?: unknown }> | null;
  metadata: Record<string, unknown> | null;
}

interface AuditTrailSidebarProps {
  encounterId: string;
  isOpen: boolean;
  onClose: () => void;
  isReadOnly?: boolean;
  onRevert?: (field: string, oldValue: unknown) => void;
}

// ---------------------------------------------------------------------------
// Action display helpers
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  read: "Viewed",
  update: "Updated",
  delete: "Deleted",
  finalize: "Finalized",
  promote: "Promoted",
  ai_scribe_generated: "AI Generated",
  ai_scribe_autofill: "AI Auto-Fill",
  manual_edit: "Manual Edit",
  phi_viewed: "PHI Viewed",
};

function isAiAction(action: string): boolean {
  return action.startsWith("ai_scribe");
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ---------------------------------------------------------------------------
// ChangesDiff — expandable before/after view
// ---------------------------------------------------------------------------

function ChangesDiff({ changes }: { changes: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 text-[11px] font-medium hover:underline"
        style={{ color: "var(--text-secondary)" }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {entries.length} field{entries.length !== 1 ? "s" : ""} changed
      </button>
      {expanded && (
        <div
          className="mt-1.5 rounded-lg p-2.5 text-[11px] space-y-1.5 font-mono"
          style={{ background: "var(--bg-inset)", border: "1px solid var(--border-subtle)" }}
        >
          {entries.map(([key, val]) => {
            const change = val as { old?: unknown; new?: unknown } | null;
            return (
              <div key={key}>
                <span style={{ color: "var(--text-muted)" }}>{key}:</span>{" "}
                {change && typeof change === "object" && "old" in change ? (
                  <>
                    <span style={{ color: "var(--state-caution)" }}>
                      {JSON.stringify(change.old ?? null)}
                    </span>
                    {" → "}
                    <span style={{ color: "var(--state-normal)" }}>
                      {JSON.stringify(change.new ?? null)}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "var(--text-primary)" }}>
                    {typeof val === "string" ? val : JSON.stringify(val)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuditTrailSidebar({ encounterId, isOpen, onClose, isReadOnly = false, onRevert }: AuditTrailSidebarProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    fetch(`/api/encounters/${encounterId}/audit-logs`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setLogs(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, encounterId]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Slide-over panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full flex flex-col"
        style={{
          width: 380,
          background: "var(--bg-elevated)",
          borderLeft: "1px solid var(--border-default)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 250ms var(--ease-out-expo)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border-default)" }}
        >
          <div className="flex items-center gap-2">
            <History size={18} style={{ color: "var(--accent)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Audit Trail
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover-btn"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading audit trail...</p>
          )}

          {error && (
            <p className="text-sm" style={{ color: "var(--state-critical)" }}>
              Failed to load: {error}
            </p>
          )}

          {!loading && !error && logs.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No audit entries yet.</p>
          )}

          {!loading && !error && logs.length > 0 && (
            <div className="space-y-0">
              {logs.map((log, i) => {
                const ai = isAiAction(log.action_type);
                return (
                  <div key={log.id} className="relative pl-6 pb-5">
                    {/* Timeline line */}
                    {i < logs.length - 1 && (
                      <div
                        className="absolute left-[9px] top-6 bottom-0 w-px"
                        style={{ background: "var(--border-subtle)" }}
                      />
                    )}

                    {/* Timeline dot */}
                    <div
                      className="absolute left-0 top-1 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                      style={{
                        background: ai ? "var(--accent-dim)" : "var(--bg-inset)",
                        border: `1.5px solid ${ai ? "var(--accent)" : "var(--border-default)"}`,
                      }}
                    >
                      {ai ? (
                        <Bot size={10} style={{ color: "var(--accent)" }} />
                      ) : (
                        <User size={10} style={{ color: "var(--text-secondary)" }} />
                      )}
                    </div>

                    {/* Entry content */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={ai ? "default" : "secondary"} className="text-[10px]">
                          {ai && "AI "}{ACTION_LABELS[log.action_type] ?? log.action_type}
                        </Badge>
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {log.resource_type}
                        </span>
                      </div>

                      <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                        {log.staff_name ?? "System"} — {formatTimestamp(log.timestamp)}
                      </p>

                      {log.detail && (
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {log.detail}
                        </p>
                      )}

                      {log.changes && (
                        log.action_type === "ai_scribe_autofill" ? (
                          <ClinicalDiffViewer
                            changes={log.changes as Record<string, DiffEntry>}
                            encounterId={encounterId}
                            onRevert={onRevert}
                            isReadOnly={isReadOnly}
                          />
                        ) : (
                          <ChangesDiff changes={log.changes} />
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
