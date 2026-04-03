"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import type { PrepMeResponse } from "@/types/patient";
import { formatClinicDate } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PrepMeButtonProps {
  patientId: string;
}

// ---------------------------------------------------------------------------
// Component — auto-loads prep me summary and displays inline
// ---------------------------------------------------------------------------

type Status = "idle" | "loading" | "loaded" | "error";

export function PrepMeButton({ patientId }: PrepMeButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<string | null>(null);
  const [encounterCount, setEncounterCount] = useState(0);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const applyResponse = useCallback((res: PrepMeResponse) => {
    setSummary(res.summary);
    setEncounterCount(res.encounterCount);
    setLastDate(res.lastEncounterDate);
    setStatus("loaded");
  }, []);

  const fetchPrepMe = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setError(null);
    try {
      const res = await apiFetch<PrepMeResponse>(
        `/api/patients/${patientId}/prep-me`,
        { method: "POST", signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      applyResponse(res);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load summary");
      setStatus("error");
    }
  }, [patientId, applyResponse]);

  // Auto-fetch on mount
  useEffect(() => {
    if (patientId) fetchPrepMe();
    return () => abortRef.current?.abort();
  }, [patientId, fetchPrepMe]);

  // Don't render for new patients (no finalized encounters)
  if (status === "loaded" && encounterCount === 0) return null;

  // Don't render while idle
  if (status === "idle") return null;

  const formattedDate = lastDate ? formatClinicDate(lastDate) : null;

  return (
    <div data-testid="prep-me-inline" className="glass-card overflow-hidden border-[var(--border-glow)] mt-3">
      {/* Header */}
      <div className="flex items-center px-3 py-2 gap-3">
        <div className="w-5 h-5 rounded-md flex items-center justify-center bg-[var(--accent-dim)] shrink-0">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1a6 6 0 100 12A6 6 0 007 1z"
              stroke="var(--accent)"
              strokeWidth="1.2"
            />
            <path
              d="M5 5.5a2 2 0 113.5 1.5c-.5.5-1 .8-1 1.5v.5"
              stroke="var(--accent)"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <circle cx="7.5" cy="10.5" r="0.5" fill="var(--accent)" />
          </svg>
        </div>

        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
          AI Pre-Visit Summary
        </span>

        {formattedDate && (
          <>
            <span className="text-caption text-[var(--text-muted)]">&middot;</span>
            <span className="text-caption text-[var(--text-secondary)]">
              Last seen: {formattedDate}
            </span>
          </>
        )}

        {status === "loaded" && encounterCount > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {encounterCount} visit{encounterCount > 1 ? "s" : ""}
          </Badge>
        )}

        {status === "loading" && (
          <div className="ml-auto w-3 h-3 rounded-full border-2 animate-spin border-[var(--accent)] border-t-transparent" />
        )}

        {status === "loaded" && (
          <button
            type="button"
            onClick={fetchPrepMe}
            className="ml-auto p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            title="Refresh summary"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M11.5 7a4.5 4.5 0 11-1.2-3.1M10.5 1v3h-3"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="border-t border-[var(--border-subtle)] px-3 py-3">
        {status === "loading" && (
          <div className="flex items-center gap-3 py-1">
            <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-secondary)]">
              Reading clinical history...
            </p>
          </div>
        )}

        {status === "loaded" && summary && (
          <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
            {summary
              .split("\n")
              .map((line) => line.replace(/^[-•]\s*/, "").trim())
              .filter(Boolean)
              .map((line, i) => (
                <li key={i} className="flex gap-2 leading-snug">
                  <span className="text-[var(--accent)] mt-0.5 shrink-0">•</span>
                  <span>{line}</span>
                </li>
              ))}
          </ul>
        )}

        {status === "error" && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-[var(--state-critical)]">
              {error}
            </p>
            <button
              type="button"
              onClick={fetchPrepMe}
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-[var(--accent)] border border-[var(--accent)]/30 hover-btn"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
