"use client";

import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PatientsPage() {
  const { has } = useEntitlements();

  if (!has(Entitlement.PATIENT_DEMOGRAPHICS)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card p-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="8" width="14" height="10" rx="2" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M6 8V6a4 4 0 018 0v2" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-subhead mb-2">Patient Records Locked</h2>
          <p className="text-caption text-[var(--text-muted)]">
            Upgrade your plan to access patient demographics.
          </p>
        </div>
      </div>
    );
  }

  // Phase 5 will wire real patient CRUD from the API.
  // For now, show an appropriate placeholder instead of crashing.
  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display text-2xl">Patients</h1>
          <p className="text-body mt-1">0 patients on file</p>
        </div>
      </div>

      <div className="glass-card flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="7" r="3.5" stroke="var(--text-muted)" strokeWidth="1.4" />
            <path d="M3 17c0-3.866 3.134-6.5 7-6.5s7 2.634 7 6.5" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-subhead">No patients loaded</p>
          <p className="text-caption text-[var(--text-muted)] mt-1">
            Patient CRUD integration coming in Phase 5.
          </p>
        </div>
      </div>
    </div>
  );
}
