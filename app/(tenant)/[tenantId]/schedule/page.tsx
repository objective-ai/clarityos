"use client";

import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const { has } = useEntitlements();

  // Entitlement gate
  if (!has(Entitlement.SCHEDULING)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card p-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="8" width="14" height="10" rx="2" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M6 8V6a4 4 0 018 0v2" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-subhead mb-2">Scheduling Locked</h2>
          <p className="text-caption text-[var(--text-muted)]">
            Upgrade your plan to access the appointment calendar.
          </p>
        </div>
      </div>
    );
  }

  // Phase 3 will wire real appointment data from the API.
  // For now, show an appropriate placeholder instead of crashing.
  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex items-center justify-between">
        <h1 className="text-display text-2xl">Schedule</h1>
      </div>

      <div className="glass-card flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="3.5" width="16" height="14" rx="2.5" stroke="var(--text-muted)" strokeWidth="1.3" />
            <path d="M2 8h16M7 3.5v4M13 3.5v4" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-subhead">No appointments loaded</p>
          <p className="text-caption text-[var(--text-muted)] mt-1">
            Scheduling integration coming in Phase 3.
          </p>
        </div>
      </div>
    </div>
  );
}
