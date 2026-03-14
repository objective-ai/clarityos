"use client";

import { useEffect, useState } from "react";
import { useOpticalStore } from "@/store/opticalStore";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { OpticalQueueCard } from "@/components/optical/OpticalQueueCard";
import { RxPrintView } from "@/components/optical/RxPrintView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateLong, shiftDate, clinicToday, useClinicTimezone } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function OpticalPage() {
  const tz = useClinicTimezone();
  const items = useOpticalStore((s) => s.items);
  const total = useOpticalStore((s) => s.total);
  const queueDate = useOpticalStore((s) => s.queueDate);
  const isLoading = useOpticalStore((s) => s.isLoading);
  const error = useOpticalStore((s) => s.error);
  const fetchQueue = useOpticalStore((s) => s.fetchQueue);
  const setQueueDate = useOpticalStore((s) => s.setQueueDate);
  const clearError = useOpticalStore((s) => s.clearError);

  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);
  const [dateInput, setDateInput] = useState(queueDate);

  useEffect(() => {
    fetchQueue();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDateInput(queueDate);
  }, [queueDate]);

  // Subtitle
  useEffect(() => {
    const isToday = queueDate === clinicToday(tz);
    setSubtitle(formatDateLong(queueDate) + (isToday ? " · Today" : ""));
    return () => setSubtitle(null);
  }, [queueDate, setSubtitle]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDateInput(val);
    if (val) setQueueDate(val);
  };

  // Count items with Rx change alerts
  const alertCount = items.filter((i) => i.rxChangeAlert.hasChange).length;

  // Count by status
  const waitingCount = items.filter((i) => i.status === "waiting").length;
  const inProgressCount = items.filter((i) => i.status === "in_progress").length;
  const dispensedCount = items.filter((i) => i.status === "dispensed").length;

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Toolbar: summary left, controls right */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Left — summary badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {total > 0 ? (
            <>
              <Badge variant="secondary">{total} total</Badge>
              {waitingCount > 0 && (
                <Badge variant="warning">{waitingCount} waiting</Badge>
              )}
              {inProgressCount > 0 && (
                <Badge variant="info">{inProgressCount} in progress</Badge>
              )}
              {dispensedCount > 0 && (
                <Badge variant="success">{dispensedCount} dispensed</Badge>
              )}
              {alertCount > 0 && (
                <Badge variant="warning">
                  {alertCount} Rx change{alertCount > 1 ? "s" : ""}
                </Badge>
              )}
            </>
          ) : null}
        </div>

        {/* Right — date nav + refresh */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setQueueDate(shiftDate(queueDate, -1))}
            title="Previous day"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setQueueDate(clinicToday(tz))}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setQueueDate(shiftDate(queueDate, 1))}
            title="Next day"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
          <input
            type="date"
            value={dateInput}
            onChange={handleDateChange}
            className="glass-input text-sm px-3 py-1.5 rounded-lg"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchQueue()}
            title="Refresh queue"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1.5 7a5.5 5.5 0 019.37-3.9M12.5 7a5.5 5.5 0 01-9.37 3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M10.87 1v2.1h2.1M3.13 13v-2.1H1.03" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-[var(--text-muted)]">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-body">Loading optical queue...</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div className="glass-card flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="var(--text-muted)" strokeWidth="1.3" />
              <circle cx="10" cy="10" r="3" stroke="var(--text-muted)" strokeWidth="1.3" />
              <circle cx="10" cy="10" r="1" fill="var(--text-muted)" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-subhead">No patients in optical queue</p>
            <p className="text-caption text-[var(--text-muted)] mt-1 max-w-sm">
              Patients appear here after their encounter is finalized and a refraction
              is marked as the final Rx. If encounters are missing, check that
              &quot;Use as Final Rx&quot; is enabled on a refraction.
            </p>
          </div>
        </div>
      )}

      {/* Queue cards */}
      {!isLoading && items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <OpticalQueueCard key={item.encounterId} item={item} />
          ))}
        </div>
      )}

      {/* Optical future features marketing banner */}
      <div
        className="relative overflow-hidden rounded-2xl px-8 pt-12 pb-14 mt-8 mb-2 text-center"
        style={{
          background: "var(--bg-glass)",
          border: "1px solid var(--glass-border)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Left accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
          style={{ background: "linear-gradient(to bottom, #2DD4BF, #8B5CF6)" }}
        />

        {/* Radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 20% 50%, rgba(45,212,191,0.07) 0%, transparent 60%)" }}
        />

        {/* Decorative SVG — glasses + inventory illustration */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-[0.12] pointer-events-none hidden sm:block">
          <svg width="160" height="100" viewBox="0 0 160 100" fill="none">
            {/* Eyeglasses */}
            <circle cx="52" cy="42" r="22" stroke="var(--accent)" strokeWidth="1.6" />
            <circle cx="108" cy="42" r="22" stroke="var(--accent)" strokeWidth="1.6" />
            <path d="M74 42 Q80 36 86 42" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            <line x1="2" y1="36" x2="30" y2="36" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="130" y1="36" x2="158" y2="36" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" />
            {/* Dot grid (inventory) */}
            {[0,1,2].flatMap(row => [0,1,2].map(col => (
              <circle key={`${row}-${col}`} cx={20 + col * 12} cy={74 + row * 8} r="1.5" fill="#8B5CF6" />
            )))}
            {/* Sync arc */}
            <path d="M110 72 Q130 65 148 72" stroke="#8B5CF6" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            <polyline points="145,68 148,72 144,75" stroke="#8B5CF6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Content */}
        <div className="relative">
          <div className="flex items-center justify-center gap-2 mb-4">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(45,212,191,0.1)", color: "#2DD4BF", border: "1px solid rgba(45,212,191,0.3)" }}
            >
              ⚡ COMING SOON
            </span>
          </div>
          <p className="text-xl font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Optical inventory &amp; ordering — next</p>
          <p className="text-sm leading-relaxed text-[var(--text-muted)] mb-6 max-w-lg mx-auto">
            Frame catalog management, lens ordering with supplier integration, and real-time inventory tracking.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Frame Catalog", "Lens Ordering", "Inventory Sync"].map((pill) => (
              <span
                key={pill}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--glass-border)", color: "var(--text-secondary)" }}
              >
                {pill}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Rx Print View modal */}
      <RxPrintView />
    </div>
  );
}
