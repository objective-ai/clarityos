"use client";

/**
 * Close of day — daily-close totals + cash reconciliation (POS-04, POS-05).
 *
 * OWNER + ADMIN only. Shows summary KPIs, by-method + by-category tables, and a
 * cash reconciliation card. Historical closed dates render read-only. Export
 * PDF / CSV stream from the BFF once a run exists.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { posApi } from "@/lib/pos/api";
import { useEntitlements } from "@/hooks/useEntitlements";
import { DailyCloseTotalsCard } from "@/components/pos/DailyCloseTotalsCard";
import { CashReconciliationCard } from "@/components/pos/CashReconciliationCard";
import type { DailyCloseResponse } from "@/types/sales";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CloseOfDayPage() {
  useParams<{ tenant: string }>();
  const { requireRole } = useEntitlements();
  const canView = requireRole("owner", "admin");

  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState<DailyCloseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClose = useCallback(async (iso: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await posApi.getDailyClose(iso);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load daily close");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void fetchClose(date);
    else setLoading(false);
  }, [canView, date, fetchClose]);

  const handleSave = useCallback(
    async (countedCash: string, notes: string) => {
      await posApi.saveDailyClose({ closeDate: date, countedCash, notes });
      await fetchClose(date);
    },
    [date, fetchClose],
  );

  // Role guard
  if (!canView) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card" style={{ padding: "40px" }}>
          <h2 className="text-subhead mb-2">Owner or admin access required</h2>
          <p className="text-caption" style={{ color: "var(--text-muted)" }}>
            Only owners and admins can run the daily close.
          </p>
        </div>
      </div>
    );
  }

  const runId = data?.runId ?? null;
  const exportUrl = (format: "pdf" | "csv") =>
    runId ? `/api/pos/daily-close/${runId}/export/?format=${format}` : "#";

  return (
    <div style={{ background: "var(--bg-base)", padding: "32px", minHeight: "100vh" }}>
      {/* Header */}
      <header className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-heading" style={{ color: "var(--text-primary)" }}>
          Close of day
        </h1>
        <div className="flex flex-col gap-1">
          <label htmlFor="close-date" className="text-overline" style={{ color: "var(--text-muted)" }}>
            Date
          </label>
          <input
            id="close-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="glass-input"
            style={{ minHeight: "44px" }}
          />
        </div>
      </header>

      {loading ? (
        <p className="text-body" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : error ? (
        <p className="text-body" style={{ color: "var(--state-critical)" }}>
          {error}
        </p>
      ) : !data ? null : data.summary.salesCount === 0 && !data.isClosed ? (
        <div className="glass-card" style={{ padding: "40px", textAlign: "center" }}>
          <p className="text-subhead" style={{ color: "var(--text-primary)" }}>
            No sales on this date
          </p>
          <p className="text-body" style={{ color: "var(--text-muted)" }}>
            Pick another date or check the schedule.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Section 1 — Sales summary KPIs */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Sales count" value={String(data.summary.salesCount)} mono />
            <KpiCard label="Gross" value={`$${Number(data.summary.gross).toFixed(2)}`} mono />
            <KpiCard
              label="Refunds out"
              value={`-$${Number(data.summary.refunds).toFixed(2)}`}
              mono
              color="var(--state-critical)"
            />
            <KpiCard
              label="Net"
              value={`$${Number(data.summary.net).toFixed(2)}`}
              mono
              color="var(--accent)"
            />
          </section>

          {/* Section 2 + 3 — by method / by category */}
          <div className="grid gap-6 lg:grid-cols-2">
            <DailyCloseTotalsCard title="By payment method" rows={data.byMethod} />
            <DailyCloseTotalsCard title="By category" rows={data.byCategory} />
          </div>

          {/* Section 4 — cash reconciliation */}
          <CashReconciliationCard
            expectedCash={data.expectedCash}
            isClosed={data.isClosed}
            initialCountedCash={data.countedCash}
            initialVariance={data.variance}
            onSave={handleSave}
          />

          {/* Footer — export */}
          <footer className="flex items-center gap-3">
            <a
              href={exportUrl("pdf")}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!runId}
              className="text-caption py-2 px-4 rounded-md"
              style={{
                background: "transparent",
                color: runId ? "var(--text-primary)" : "var(--text-muted)",
                border: "1px solid var(--border-default)",
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                pointerEvents: runId ? "auto" : "none",
                opacity: runId ? 1 : 0.45,
              }}
            >
              Export PDF
            </a>
            <a
              href={exportUrl("csv")}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!runId}
              className="text-caption py-2 px-4 rounded-md"
              style={{
                background: "transparent",
                color: runId ? "var(--text-primary)" : "var(--text-muted)",
                border: "1px solid var(--border-default)",
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                pointerEvents: runId ? "auto" : "none",
                opacity: runId ? 1 : 0.45,
              }}
            >
              Export CSV
            </a>
            {!runId && (
              <span className="text-caption" style={{ color: "var(--text-muted)" }}>
                Save the close to enable export.
              </span>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <p className="text-overline mb-2" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className={`text-display ${mono ? "font-mono-data data-value" : ""}`}
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}
