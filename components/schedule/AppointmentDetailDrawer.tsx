"use client";

import { useEffect } from "react";
import type { Appointment } from "@/types/appointment";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  APPOINTMENT_TYPE_LABELS,
} from "@/types/appointment";
import { Button } from "@/components/ui/button";
import { formatClinicTime, formatDateLong } from "@/lib/timezone";
import { getWaitMinutes, getWaitColor } from "@/lib/scheduleUtils";
import { X, Send, SendHorizonal, CheckCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AppointmentDetailDrawerProps {
  appointment: Appointment | null;
  open: boolean;
  onClose: () => void;
  onCheckIn: (id: string) => Promise<void>;
  onStartExam: (id: string) => Promise<void>;
  onCancel: (id: string) => void;
  onReschedule: (appointment: Appointment) => void;
  onIntake: (appt: Appointment) => Promise<void>;
  tenant: string;
  timezone: string;
}

// ---------------------------------------------------------------------------
// Detail row helper
// ---------------------------------------------------------------------------

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer component
// ---------------------------------------------------------------------------

export function AppointmentDetailDrawer({
  appointment,
  open,
  onClose,
  onCheckIn,
  onStartExam,
  onCancel,
  onReschedule,
  onIntake,
  timezone,
}: AppointmentDetailDrawerProps) {
  // ESC key closes drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const appt = appointment;

  // Derived status booleans (same logic as AppointmentCard)
  const canCheckIn = appt
    ? appt.status === "scheduled" || appt.status === "confirmed"
    : false;
  const canStartExam = appt?.status === "arrived";
  const canContinuePretest = appt?.status === "in_pretest";
  const canContinueExam = appt?.status === "in_exam";
  const canViewEncounter =
    appt?.status === "completed" || appt?.status === "finalized";
  const hasEncounter = !!appt?.encounterId;
  const canCancelOrReschedule =
    appt &&
    ["scheduled", "confirmed", "arrived"].includes(appt.status);

  // Wait time
  const waitMinutes = appt ? getWaitMinutes(appt) : null;
  const waitColor = getWaitColor(waitMinutes);

  // Intake label
  const intakeActionLabel =
    appt?.intakeStatus === "submitted"
      ? "View Submission"
      : appt?.intakeStatus === "pending"
      ? "Resend Intake"
      : "Send Intake";

  // Bug A: prevent drawer from rendering at all when nothing is selected
  if (!open && !appt) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-[480px] max-md:w-full bg-[var(--bg-surface)] border-l border-[var(--border-default)] shadow-2xl flex flex-col transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={appt ? `Appointment details for ${appt.patientName ?? "patient"}` : "Appointment details"}
      >
        {/* Bug B: always-visible close button, outside appt ternary */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          aria-label="Close drawer"
        >
          <X className="w-5 h-5" />
        </button>

        {appt ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--text-primary)] truncate">
                  {appt.patientName ?? "Unknown Patient"}
                </h2>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  {APPOINTMENT_TYPE_LABELS[appt.appointmentType]}
                </p>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Status + wait time */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold tracking-wider uppercase"
                  style={{
                    backgroundColor: `${STATUS_COLORS[appt.status]}20`,
                    color: STATUS_COLORS[appt.status],
                    border: `1px solid ${STATUS_COLORS[appt.status]}30`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[appt.status] }}
                  />
                  {STATUS_LABELS[appt.status]}
                </span>
                {waitColor !== null && waitMinutes !== null && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold transition-colors duration-300 ${
                      waitColor === "red"
                        ? "bg-[#F87171]/15 text-[#F87171]"
                        : "bg-[#FBBF24]/15 text-[#FBBF24]"
                    }`}
                  >
                    {waitMinutes} min wait
                  </span>
                )}
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <DetailRow
                  label="Date"
                  value={formatDateLong(appt.startTime.split("T")[0])}
                />
                <DetailRow
                  label="Time"
                  value={`${formatClinicTime(appt.startTime, timezone)} – ${formatClinicTime(appt.endTime, timezone)}`}
                />
                <DetailRow label="Duration" value={`${appt.durationMinutes} min`} />
                <DetailRow label="Provider" value={appt.providerName} />
                <DetailRow
                  label="Type"
                  value={APPOINTMENT_TYPE_LABELS[appt.appointmentType]}
                />
                {appt.chiefComplaint && (
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Chief Complaint
                    </span>
                    <span className="text-sm text-[var(--text-primary)]">
                      {appt.chiefComplaint}
                    </span>
                  </div>
                )}
                {appt.insurancePayerName && (
                  <DetailRow label="Insurance" value={appt.insurancePayerName} />
                )}
                {appt.insuranceCopay != null && (
                  <DetailRow label="Copay" value={`$${appt.insuranceCopay}`} />
                )}
                {appt.internalNotes && (
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Internal Notes
                    </span>
                    <span className="text-sm text-[var(--text-secondary)]">
                      {appt.internalNotes}
                    </span>
                  </div>
                )}
              </div>

              {/* Intake section */}
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {appt.intakeStatus === "submitted" ? (
                    <CheckCircle className="w-4 h-4 text-[var(--state-normal,#22c55e)]" />
                  ) : appt.intakeStatus === "pending" ? (
                    <SendHorizonal className="w-4 h-4 text-[var(--state-info,#3b82f6)]" />
                  ) : (
                    <Send className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Intake Form
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {appt.intakeStatus === "submitted"
                        ? "Patient has submitted their intake form"
                        : appt.intakeStatus === "pending"
                        ? "Intake form sent, awaiting submission"
                        : "Intake form not yet sent"}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onIntake(appt)}
                >
                  {intakeActionLabel}
                </Button>
              </div>
            </div>

            {/* Actions footer */}
            <div className="border-t border-[var(--border-subtle)] px-6 py-4 space-y-2">
              {/* Primary action */}
              {canCheckIn && (
                <Button
                  className="w-full"
                  onClick={() => { void onCheckIn(appt.id); onClose(); }}
                >
                  Check In
                </Button>
              )}
              {canStartExam && (
                <Button
                  className="w-full"
                  onClick={() => { void onStartExam(appt.id); onClose(); }}
                >
                  Start Pre-Test
                </Button>
              )}
              {(canContinuePretest || canContinueExam) && hasEncounter && (
                <Button
                  className="w-full"
                  onClick={onClose}
                >
                  {canContinuePretest ? "Continue Pre-Test" : "Continue Exam"}
                </Button>
              )}
              {canViewEncounter && hasEncounter && (
                <Button className="w-full" variant="outline" onClick={onClose}>
                  View Encounter
                </Button>
              )}

              {/* Secondary actions */}
              {canCancelOrReschedule && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => { onReschedule(appt); onClose(); }}
                >
                  Reschedule
                </Button>
              )}
              {canCancelOrReschedule && (
                <Button
                  className="w-full"
                  variant="destructive"
                  onClick={() => { onCancel(appt.id); onClose(); }}
                >
                  Cancel Appointment
                </Button>
              )}
            </div>
          </>
        ) : (
          // Empty state while appointment is null but drawer might still animate
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-[var(--text-muted)]">No appointment selected</p>
          </div>
        )}
      </div>
    </>
  );
}
