"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPatientById, getPatientEncounters } from "@/lib/mock-patient-data";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "info"> = {
  finalized: "success",
  in_exam: "warning",
  pre_test: "info",
};

const STATUS_LABEL: Record<string, string> = {
  finalized: "Finalized",
  in_exam: "In Exam",
  pre_test: "Pre-Test",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PatientChartModalProps {
  patientId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PatientChartModal({
  patientId,
  open,
  onOpenChange,
}: PatientChartModalProps) {
  const { tenantId } = useParams<{ tenantId: string }>();

  const patient = useMemo(
    () => (patientId ? getPatientById(patientId) : null),
    [patientId]
  );

  const encounters = useMemo(
    () => (patientId ? getPatientEncounters(patientId) : []),
    [patientId]
  );

  if (!patient) return null;

  const age = calculateAge(patient.dob);
  const rxEncounters = encounters.filter((e) => e.finalRx);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {/* Header */}
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--mono-border)] font-mono">
              {patient.firstName[0]}
              {patient.lastName[0]}
            </div>
            <div>
              <DialogTitle>
                {patient.firstName} {patient.lastName}
                {patient.preferredName && (
                  <span className="text-[var(--text-muted)] font-normal text-base ml-2">
                    &ldquo;{patient.preferredName}&rdquo;
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="font-mono">
                {formatDate(patient.dob)} &middot; {age}y &middot;{" "}
                {patient.sex}
                <span className="text-[var(--text-muted)] ml-3">
                  {patient.id}
                </span>
              </DialogDescription>
            </div>
          </div>

          {/* Alerts */}
          {patient.alerts.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {patient.alerts.map((alert) => (
                <Badge
                  key={alert.id}
                  variant={
                    alert.severity === "critical"
                      ? "destructive"
                      : alert.severity === "warning"
                        ? "warning"
                        : "info"
                  }
                >
                  {alert.label}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 pb-6 flex flex-col gap-5">
          {/* Contact info row */}
          <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)] flex-wrap">
            <span>{patient.phone}</span>
            {patient.email && (
              <>
                <span className="text-[var(--border-strong)]">&middot;</span>
                <span>{patient.email}</span>
              </>
            )}
            {patient.insurance && (
              <>
                <span className="text-[var(--border-strong)]">&middot;</span>
                <span>
                  {patient.insurance.provider}{" "}
                  <span className="font-mono text-xs">
                    {patient.insurance.memberId}
                  </span>
                </span>
              </>
            )}
          </div>

          {/* Encounters */}
          <div>
            <h3 className="text-overline mb-3">
              Encounters ({encounters.length})
            </h3>
            {encounters.length === 0 ? (
              <p className="text-caption text-[var(--text-muted)]">
                No encounters on record.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                {encounters.map((enc) => (
                  <Link
                    key={enc.id}
                    href={`/${tenantId}/encounter/${enc.id}`}
                    onClick={() => onOpenChange(false)}
                    className="flex flex-col gap-1.5 px-4 py-3 hover-row transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {formatDate(enc.date)}
                        </span>
                        <Badge
                          variant={STATUS_VARIANT[enc.status] ?? "secondary"}
                        >
                          {STATUS_LABEL[enc.status] ?? enc.status}
                        </Badge>
                      </div>
                      <span className="text-caption text-[var(--text-secondary)]">
                        {enc.provider}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {enc.chiefComplaint}
                    </p>
                    {enc.diagnoses.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {enc.diagnoses.map((dx) => (
                          <span
                            key={dx}
                            className="text-xs font-mono px-2 py-0.5 rounded-lg bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--mono-border)]"
                          >
                            {dx}
                          </span>
                        ))}
                      </div>
                    )}
                    {enc.finalRx && (
                      <div className="flex items-center gap-4 mt-0.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          Rx:
                        </span>
                        <span className="text-xs font-mono text-[var(--text-primary)]">
                          OD {enc.finalRx.od}
                        </span>
                        <span className="text-xs font-mono text-[var(--text-primary)]">
                          OS {enc.finalRx.os}
                        </span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Rx History */}
          {rxEncounters.length >= 2 && (
            <div>
              <h3 className="text-overline mb-3">Rx History</h3>
              <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-default)]">
                      {["Date", "OD Rx", "OS Rx"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-2.5 text-overline"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rxEncounters.map((enc) => (
                      <tr
                        key={enc.id}
                        className="border-t border-[var(--border-subtle)]"
                      >
                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                          {formatDate(enc.date)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--text-primary)]">
                          {enc.finalRx!.od}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--text-primary)]">
                          {enc.finalRx!.os}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Link to full page */}
          <div className="pt-2">
            <Link
              href={`/${tenantId}/patients/${patient.id}`}
              onClick={() => onOpenChange(false)}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Open full patient record &rarr;
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
