"use client";

import { useEffect, useState } from "react";
import { useOpticalStore } from "@/store/opticalStore";
import { OpticalQueueCard } from "@/components/optical/OpticalQueueCard";
import { RxPrintView } from "@/components/optical/RxPrintView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Date navigation helpers
// ---------------------------------------------------------------------------

function formatDisplayDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function OpticalPage() {
  const items = useOpticalStore((s) => s.items);
  const total = useOpticalStore((s) => s.total);
  const queueDate = useOpticalStore((s) => s.queueDate);
  const isLoading = useOpticalStore((s) => s.isLoading);
  const error = useOpticalStore((s) => s.error);
  const fetchQueue = useOpticalStore((s) => s.fetchQueue);
  const setQueueDate = useOpticalStore((s) => s.setQueueDate);
  const clearError = useOpticalStore((s) => s.clearError);

  const [dateInput, setDateInput] = useState(queueDate);

  useEffect(() => {
    fetchQueue();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDateInput(queueDate);
  }, [queueDate]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDateInput(val);
    if (val) setQueueDate(val);
  };

  const isToday = queueDate === todayIso();

  // Count items with Rx change alerts
  const alertCount = items.filter((i) => i.rxChangeAlert.hasChange).length;

  // Count by status
  const waitingCount = items.filter((i) => i.status === "waiting").length;
  const inProgressCount = items.filter((i) => i.status === "in_progress").length;
  const dispensedCount = items.filter((i) => i.status === "dispensed").length;

  return (
    <div className="space-y-6 stagger">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-display text-[var(--text-primary)]">
            Optical Queue
          </h1>
          <p className="text-body text-[var(--text-secondary)] mt-1">
            Patients ready for glasses and contact lens dispensing
          </p>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQueueDate(addDays(queueDate, -1))}
            title="Previous day"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M8.5 3L4.5 7l4 4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Button>

          <input
            type="date"
            value={dateInput}
            onChange={handleDateChange}
            className="glass-input text-sm px-3 py-1.5 rounded-lg"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setQueueDate(addDays(queueDate, 1))}
            title="Next day"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M5.5 3l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Button>

          {!isToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQueueDate(todayIso())}
            >
              Today
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchQueue()}
            title="Refresh queue"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M1.5 7a5.5 5.5 0 019.37-3.9M12.5 7a5.5 5.5 0 01-9.37 3.9"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M10.87 1v2.1h2.1M3.13 13v-2.1H1.03"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Button>
        </div>
      </div>

      {/* Date display + summary badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-subhead text-[var(--text-primary)]">
          {formatDisplayDate(queueDate)}
        </span>
        {total > 0 && (
          <>
            <Badge variant="default">{total} total</Badge>
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
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg px-4 py-3 flex items-center justify-between"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            color: "var(--text-primary)",
          }}
        >
          <span className="text-sm">{error}</span>
          <Button variant="ghost" size="sm" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-body text-[var(--text-muted)] animate-pulse">
            Loading optical queue...
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div
          className="glass-card rounded-xl flex flex-col items-center justify-center py-16 px-8 text-center"
          style={{ border: "1px dashed var(--border-subtle)" }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            className="mb-4 opacity-30"
          >
            <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="2" />
            <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="2" />
            <circle cx="24" cy="24" r="2" fill="currentColor" />
          </svg>
          <h3 className="text-heading text-[var(--text-primary)] mb-1">
            No patients in optical queue
          </h3>
          <p className="text-body text-[var(--text-secondary)] max-w-md">
            Patients will appear here after their encounter is finalized with a
            final prescription. Check back later or select a different date.
          </p>
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

      {/* Rx Print View modal */}
      <RxPrintView />
    </div>
  );
}
