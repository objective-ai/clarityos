"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import type { PrepMeResponse } from "@/types/patient";
import { formatClinicDate } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PrepMeCardProps {
  patientId: string;
}

// ---------------------------------------------------------------------------
// Session cache (avoids repeat LLM calls within same browser session)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCached(patientId: string): PrepMeResponse | null {
  try {
    const raw = sessionStorage.getItem(`prep-me:${patientId}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: PrepMeResponse; ts: number };
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(`prep-me:${patientId}`);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(patientId: string, data: PrepMeResponse) {
  try {
    sessionStorage.setItem(
      `prep-me:${patientId}`,
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Status = "idle" | "loading" | "loaded" | "error";

export function PrepMeCard({ patientId }: PrepMeCardProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<string | null>(null);
  const [encounterCount, setEncounterCount] = useState(0);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const applyResponse = useCallback((res: PrepMeResponse) => {
    setSummary(res.summary);
    setEncounterCount(res.encounterCount);
    setLastDate(res.lastEncounterDate);
    setStatus("loaded");
  }, []);

  const fetchPrepMe = useCallback(async () => {
    // Check session cache first
    const cached = getCached(patientId);
    if (cached) {
      applyResponse(cached);
      return;
    }

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
      setCache(patientId, res);
      applyResponse(res);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load summary");
      setStatus("error");
    }
  }, [patientId, applyResponse]);

  useEffect(() => {
    if (patientId) fetchPrepMe();
    return () => abortRef.current?.abort();
  }, [patientId, fetchPrepMe]);

  // Don't render for new patients (no finalized encounters)
  if (status === "loaded" && encounterCount === 0) return null;

  // Don't render while idle
  if (status === "idle") return null;

  // Format the date label
  const formattedDate = lastDate ? formatClinicDate(lastDate) : null;

  return (
    <div data-testid="prep-me-card" className="glass-card overflow-hidden border-[var(--border-glow)]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center w-full px-3 py-2 hover-row transition-colors gap-3"
      >
        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={`transition-transform text-[var(--accent)] flex-shrink-0 ${
            collapsed ? "" : "rotate-180"
          }`}
        >
          <path
            d="M3 5.5L7 9.5L11 5.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Prep Me</span>

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
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="border-t border-[var(--border-subtle)] px-3 py-3">
          {status === "loading" && (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 rounded bg-[var(--bg-elevated)] w-full" />
              <div className="h-3 rounded bg-[var(--bg-elevated)] w-3/4" />
            </div>
          )}

          {status === "loaded" && summary && (
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {summary}
            </p>
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
      )}
    </div>
  );
}
