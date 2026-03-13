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
      className="glass-card glass-card-hover p-4 transition-all"
      style={menuOpen ? { position: "relative", zIndex: 50 } : undefined}
    >
      <div className="flex items-center gap-4">
        {/* Color bar */}
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: STATUS_COLORS[appointment.status] }}
        />

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
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {appointment.patientName ?? "Unknown Patient"}
          </p>
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

        {/* Intake · Status badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {appointment.intakeStatus === "submitted" && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Intake
            </span>
          )}
          {appointment.intakeStatus === "pending" && (
            <button
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
              onClick={(e) => { e.stopPropagation(); onSendIntake(appointment); }}
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              Intake Form
            </button>
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
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
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
