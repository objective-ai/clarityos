"use client";

import { useState } from "react";
import type { Appointment, AppointmentStatus } from "@/types/appointment";
import {
  APPOINTMENT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/types/appointment";
import { Button } from "@/components/ui/button";
import { OverflowMenu } from "@/components/schedule/OverflowMenu";
import type { OverflowMenuItem } from "@/components/schedule/OverflowMenu";
import { formatClinicTime } from "@/lib/timezone";
import { getWaitMinutes, getWaitColor } from "@/lib/scheduleUtils";
import { Send, SendHorizonal, CheckCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Eligibility dot color map
// ---------------------------------------------------------------------------

const SCHED_ELIG_DOT: Record<string, string> = {
  active: "bg-emerald-400",
  inactive: "bg-red-400",
  pending_verification: "bg-yellow-400",
  expired: "bg-orange-400",
  unknown: "bg-gray-400",
};

// ---------------------------------------------------------------------------
// Status Badge (private to this file)
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase select-none"
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Wait Time Badge (private to this file)
// ---------------------------------------------------------------------------

function WaitBadge({ waitMinutes, color }: { waitMinutes: number; color: "amber" | "red" }) {
  const styles =
    color === "red"
      ? "bg-[#F87171]/15 text-[#F87171]"
      : "bg-[#FBBF24]/15 text-[#FBBF24]";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors duration-300 ${styles}`}
    >
      {waitMinutes} min
    </span>
  );
}

// ---------------------------------------------------------------------------
// Intake Status Icon (private to this file)
// ---------------------------------------------------------------------------

function IntakeIcon({ status }: { status: "pending" | "submitted" | null }) {
  if (status === "submitted") {
    return (
      <span title="Intake submitted" className="shrink-0 inline-flex">
        <CheckCircle className="w-4 h-4 text-[var(--state-normal,#22c55e)]" />
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span title="Intake sent" className="shrink-0 inline-flex">
        <SendHorizonal className="w-4 h-4 text-[var(--state-info,#3b82f6)]" />
      </span>
    );
  }
  return (
    <span title="Intake not sent" className="shrink-0 inline-flex">
      <Send className="w-4 h-4 text-[var(--text-secondary)]" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Appointment Card
// ---------------------------------------------------------------------------

export function AppointmentCard({
  appointment,
  tz,
  onCheckIn,
  onStartExam,
  onCancel,
  onRevertCheckIn,
  onReschedule,
  onFollowUp,
  onViewEncounter,
  onSendIntake,
  onMarkNoShow,
  onCardClick,
}: {
  appointment: Appointment;
  tz: string;
  onCheckIn: (id: string) => void;
  onStartExam: (id: string) => void;
  onCancel: (id: string) => void;
  onRevertCheckIn: (id: string) => void;
  onReschedule: (appt: Appointment) => void;
  onFollowUp: (appt: Appointment) => void;
  onViewEncounter: (encounterId: string) => void;
  onSendIntake: (appt: Appointment) => void;
  onMarkNoShow: (id: string) => void;
  onCardClick?: (appointment: Appointment) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const canCheckIn =
    appointment.status === "scheduled" || appointment.status === "confirmed";
  const canStartExam = appointment.status === "arrived";
  const canContinuePretest = appointment.status === "in_pretest";
  const canContinueExam = appointment.status === "in_exam";
  const canViewEncounter =
    appointment.status === "completed" || appointment.status === "finalized";
  const hasEncounter = !!appointment.encounterId;

  // Wait time
  const waitMinutes = getWaitMinutes(appointment);
  const waitColor = getWaitColor(waitMinutes);

  // Build overflow menu items based on status
  const overflowItems: OverflowMenuItem[] = [];

  if (canCheckIn) {
    overflowItems.push({
      label: appointment.intakeStatus ? "Resend Intake Form" : "Send Intake Form",
      onClick: () => onSendIntake(appointment),
    });
    overflowItems.push({
      label: "Reschedule",
      onClick: () => onReschedule(appointment),
    });
    overflowItems.push({
      label: "Mark as No-Show",
      onClick: () => onMarkNoShow(appointment.id),
      variant: "danger",
    });
    overflowItems.push({
      label: "Cancel Appointment",
      onClick: () => onCancel(appointment.id),
      variant: "danger",
    });
  }

  if (canStartExam) {
    overflowItems.push({
      label: "Undo Check-In",
      onClick: () => onRevertCheckIn(appointment.id),
    });
    overflowItems.push({
      label: "Reschedule",
      onClick: () => onReschedule(appointment),
    });
    overflowItems.push({
      label: "Mark as No-Show",
      onClick: () => onMarkNoShow(appointment.id),
      variant: "danger",
    });
    overflowItems.push({
      label: "Cancel Appointment",
      onClick: () => onCancel(appointment.id),
      variant: "danger",
    });
  }

  if (canContinuePretest || canContinueExam) {
    overflowItems.push({
      label: "Reschedule",
      onClick: () => onReschedule(appointment),
    });
    overflowItems.push({
      label: "Cancel Appointment",
      onClick: () => onCancel(appointment.id),
      variant: "danger",
    });
  }

  if (appointment.status === "completed") {
    overflowItems.push({
      label: "Schedule Follow-Up",
      onClick: () => onFollowUp(appointment),
    });
  }

  return (
    <div
      className="glass-card glass-card-hover border-l-4 p-4 transition-all cursor-pointer"
      style={{
        borderLeftColor: STATUS_COLORS[appointment.status],
        ...(menuOpen ? { position: "relative", zIndex: 50 } : {}),
      }}
      onClick={() => onCardClick?.(appointment)}
    >
      <div className="flex items-center gap-4">
        {/* Time */}
        <div className="shrink-0 w-[4.5rem] text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {formatClinicTime(appointment.startTime, tz)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            {appointment.durationMinutes} min
          </p>
        </div>

        {/* Patient info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {appointment.patientName ?? "Unknown Patient"}
            </p>
            {appointment.insuranceEligibility && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--glass-bg)] border border-[var(--glass-border)] flex-shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${SCHED_ELIG_DOT[appointment.insuranceEligibility] ?? "bg-gray-400"}`} />
                {appointment.insurancePayerName?.split(" ")[0] ?? "Ins"}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}
            {appointment.providerName && (
              <span> &middot; {appointment.providerName}</span>
            )}
          </p>
          {appointment.chiefComplaint && (
            <p className="text-xs text-[var(--text-secondary)] mt-1 truncate italic">
              {appointment.chiefComplaint}
            </p>
          )}
        </div>

        {/* Intake icon · Wait badge · Status badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Intake status icon */}
          <IntakeIcon status={appointment.intakeStatus} />

          {/* Wait time badge */}
          {waitColor !== null && waitMinutes !== null && (
            <WaitBadge waitMinutes={waitMinutes} color={waitColor} />
          )}

          {appointment.triageFlags?.urgency === "urgent" && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/25 animate-pulse"
              title={`AI-generated triage — requires clinical review\n${appointment.triageFlags.reasoning}\nFlags: ${appointment.triageFlags.flags?.join(", ") || "none"}`}
            >
              Urgent
            </span>
          )}
          {appointment.triageFlags?.urgency === "moderate" && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25"
              title={`AI-generated triage — requires clinical review\n${appointment.triageFlags.reasoning}`}
            >
              Moderate
            </span>
          )}
          <StatusBadge status={appointment.status} />
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {canCheckIn && (
            <Button size="sm" onClick={() => onCheckIn(appointment.id)}>
              Check In
            </Button>
          )}
          {canStartExam && (
            <Button size="sm" onClick={() => onStartExam(appointment.id)}>
              Start Pre-Test
            </Button>
          )}
          {canContinuePretest && (
            <Button size="sm" onClick={() => onViewEncounter(appointment.encounterShortId ?? appointment.id)}>
              Continue Pre-Test
            </Button>
          )}
          {canContinueExam && (
            <Button size="sm" onClick={() => onViewEncounter(appointment.encounterShortId ?? appointment.id)}>
              Continue Exam
            </Button>
          )}
          {canViewEncounter && hasEncounter && (
            <Button size="sm" variant="outline" onClick={() => onViewEncounter(appointment.encounterShortId!)}>
              View Encounter
            </Button>
          )}
          {overflowItems.length > 0 && (
            <OverflowMenu items={overflowItems} onOpenChange={setMenuOpen} />
          )}
        </div>
      </div>
    </div>
  );
}
