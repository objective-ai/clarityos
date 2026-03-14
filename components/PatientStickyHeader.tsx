"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PatientChartModal } from "@/components/PatientChartModal";
import type { PatientAlert, PatientHeaderData } from "@/types/session";
import { Badge } from "@/components/ui/badge";
import { useEncounterStore } from "@/store/encounterStore";
import { useVitalsDraft } from "@/store/vitalsStore";
import { formatClinicDate } from "@/lib/timezone";
import { isIopElevated } from "@/types/vitals";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientStickyHeaderProps {
  patient: PatientHeaderData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDob(dob: string): string {
  return formatClinicDate(dob);
}

function formatSex(sex: PatientHeaderData["sex"]): string {
  const labels: Record<typeof sex, string> = {
    male: "M",
    female: "F",
    other: "O",
    prefer_not_to_say: "—",
  };
  return labels[sex];
}

const STATUS_CONFIG = {
  pre_test: { label: "Pre-Test", variant: "info" as const, pulse: true, action: "Start Exam" },
  in_exam: { label: "In Exam", variant: "warning" as const, pulse: true, action: "Finalize" },
  finalized: { label: "Finalized", variant: "success" as const, pulse: false, action: null },
};

// ---------------------------------------------------------------------------
// Alert Badge
// ---------------------------------------------------------------------------

function AlertBadge({ alert }: { alert: PatientAlert }) {
  const variant =
    alert.severity === "critical" ? "destructive" :
    alert.severity === "warning" ? "warning" : "info";
  return (
    <Badge variant={variant} className="gap-1.5">
      {alert.severity === "critical" && (
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse-dot bg-current" />
      )}
      {alert.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// IOP Alert Chip
// ---------------------------------------------------------------------------

function IopAlertChip({ eye }: { eye: "OD" | "OS" }) {
  return (
    <Badge variant="warning" className="gap-1 font-mono">
      IOP {eye}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PatientStickyHeader({
  patient,
}: PatientStickyHeaderProps) {
  const params = useParams<{ tenant: string; encounterId?: string }>();
  const tenant = params.tenant;
  const encounterId = params.encounterId ?? null;

  const [chartOpen, setChartOpen] = useState(false);
  const advanceStatus = useEncounterStore((s) => s.advanceStatus);
  const setFinalizeModalOpen = useEncounterStore((s) => s.setFinalizeModalOpen);
  const encounter = useEncounterStore((s) =>
    encounterId ? s.encounters[encounterId] : undefined
  );

  // Derive IOP elevation from vitals store (not hardcoded flags)
  const vitalsDraft = useVitalsDraft(encounterId ?? "");
  const iopOdElevated = isIopElevated(vitalsDraft?.iop_od ?? null);
  const iopOsElevated = isIopElevated(vitalsDraft?.iop_os ?? null);

  const hasDob = !!patient.dob;
  const age = useMemo(() => (hasDob ? calculateAge(patient.dob) : null), [patient.dob, hasDob]);
  const statusConfig = encounter ? STATUS_CONFIG[encounter.status] : null;
  const patientDetailHref = `/${tenant}/patients/${patient.chartNumber ?? patient.id}`;

  const handleAdvance = () => {
    if (!encounterId || !encounter) return;
    if (encounter.status === "in_exam") {
      setFinalizeModalOpen(true);
    } else {
      advanceStatus(encounterId);
    }
  };

  const criticalAlerts = patient.alerts.filter((a) => a.severity === "critical");
  const otherAlerts = patient.alerts.filter((a) => a.severity !== "critical");

  return (
    <header
      className="sticky z-30 w-full animate-slide-down"
      style={{
        top: "var(--header-height)",
        background: "var(--bg-sticky-header)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--glass-border)",
        minHeight: "var(--sticky-height)",
      }}
    >
      <div className="flex flex-col px-6 py-3 gap-2">
        {/* Row 1: Patient Identity + Status/Provider/Button */}
        <div className="flex items-center justify-between gap-4">
          {/* Patient Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-[var(--accent-dim)] text-[var(--accent)] border-2 border-[var(--mono-border)] font-mono animate-glow">
              {patient.firstName[0]}{patient.lastName[0]}
            </div>

            <div className="min-w-0">
              <h1 className="text-sm font-semibold leading-none text-[var(--text-primary)]">
                <Link href={patientDetailHref} className="hover:text-[var(--accent)] transition-colors">
                  {patient.lastName}, {patient.firstName}
                </Link>
                {patient.preferredName && (
                  <span className="text-caption font-normal ml-1.5 text-[var(--text-secondary)]">
                    &ldquo;{patient.preferredName}&rdquo;
                  </span>
                )}
              </h1>

              <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--text-secondary)]">
                {hasDob && (
                  <>
                    <span>{formatDob(patient.dob)}</span>
                    <span className="text-[var(--border-strong)]">&middot;</span>
                    <span>{age}y</span>
                    <span className="text-[var(--border-strong)]">&middot;</span>
                  </>
                )}
                <span>{formatSex(patient.sex)}</span>
                <span className="text-[var(--border-strong)]">&middot;</span>
                <span className="font-mono text-[var(--text-muted)]">
                  #{patient.id.slice(0, 8)}
                </span>
              </div>
            </div>
          </div>

          {/* Status + Provider + Button */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {statusConfig && encounter && (
              <>
                <Badge variant={statusConfig.variant} className="gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${statusConfig.pulse ? "animate-glow" : ""}`}
                    style={{ background: "currentColor" }}
                  />
                  {encounter.isFinalized && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-70">
                      <rect x="1.5" y="5.5" width="9" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  )}
                  {statusConfig.label}
                </Badge>

                <div className="h-5 w-px bg-[var(--border-subtle)]" />

                <div className="text-right hidden sm:block">
                  <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                    {encounter.providerName}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {formatClinicDate(encounter.encounterDate)}
                  </div>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setChartOpen(true)}
              className="text-xs px-3 py-1.5 rounded-xl font-medium hover-btn bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--glass-border)]"
            >
              Full chart &rarr;
            </button>

            {statusConfig?.action && (
              <button
                type="button"
                onClick={handleAdvance}
                className="text-xs px-3 py-1.5 rounded-xl font-semibold transition-all bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)]"
              >
                {statusConfig.action} &rarr;
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Alerts (only if present) */}
        {(patient.alerts.length > 0 || iopOdElevated || iopOsElevated) && (
          <div className="flex items-center gap-2 flex-wrap pt-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            {criticalAlerts.map((alert) => (
              <AlertBadge key={alert.id} alert={alert} />
            ))}
            {iopOdElevated && <IopAlertChip eye="OD" />}
            {iopOsElevated && <IopAlertChip eye="OS" />}
            {criticalAlerts.length > 0 && otherAlerts.length > 0 && (
              <span className="text-[var(--border-strong)] text-xs">|</span>
            )}
            {otherAlerts.map((alert) => (
              <AlertBadge key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </div>

      <PatientChartModal
        patientId={patient.id}
        open={chartOpen}
        onOpenChange={setChartOpen}
      />

    </header>
  );
}
