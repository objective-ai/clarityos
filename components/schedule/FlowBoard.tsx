"use client";

import { useEffect, useMemo } from "react";
import type { Appointment } from "@/types/appointment";
import {
  APPOINTMENT_TYPE_LABELS,
  STATUS_COLORS,
} from "@/types/appointment";
import { FLOW_COLUMNS } from "@/types/schedule";
import { getWaitMinutes, getWaitColor } from "@/lib/scheduleUtils";
import { formatClinicTime } from "@/lib/timezone";
import { useAppointmentStore } from "@/store/appointmentStore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FlowBoardProps {
  appointments: Appointment[];
  selectedDate: string;
  selectedProviderId: string;
  onCardClick: (appointment: Appointment) => void;
  onCheckIn: (id: string) => Promise<void>;
  onStartExam: (id: string) => Promise<void>;
  tenant: string;
  timezone: string;
}

// ---------------------------------------------------------------------------
// Wait Time Badge
// ---------------------------------------------------------------------------

function WaitBadge({ appointment }: { appointment: Appointment }) {
  const waitMins = getWaitMinutes(appointment);
  const color = getWaitColor(waitMins);
  if (color === null || waitMins === null) return null;

  const cls =
    color === "red"
      ? "bg-red-500/15 text-red-400 border border-red-500/25"
      : "bg-amber-500/15 text-amber-400 border border-amber-500/25";

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      {waitMins} min
    </span>
  );
}

// ---------------------------------------------------------------------------
// Kanban Card
// ---------------------------------------------------------------------------

function KanbanCard({
  appointment,
  onCardClick,
  onStartExam,
  timezone,
}: {
  appointment: Appointment;
  onCardClick: (a: Appointment) => void;
  onCheckIn: (id: string) => Promise<void>;
  onStartExam: (id: string) => Promise<void>;
  timezone: string;
}) {
  const color = STATUS_COLORS[appointment.status];

  // Primary action button label
  let actionLabel: string | null = null;
  let onAction: (() => void) | null = null;
  if (appointment.status === "arrived") {
    actionLabel = "Start Pre-Test";
    onAction = () => onStartExam(appointment.id);
  } else if (appointment.status === "in_pretest") {
    actionLabel = "Start Exam";
    onAction = () => onStartExam(appointment.id);
  }
  // in_exam → "View" button handled by clicking card
  // done → no action button

  return (
    <div
      className="animate-enter bg-[var(--bg-surface)] rounded-md p-3 border-l-4 cursor-pointer hover:brightness-110 transition-all"
      style={{ borderLeftColor: color }}
      onClick={() => onCardClick(appointment)}
    >
      {/* Patient name */}
      <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-snug">
        {appointment.patientName ?? "Unknown Patient"}
      </p>

      {/* Time + type */}
      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
        {formatClinicTime(appointment.startTime, timezone)}{" "}
        &middot;{" "}
        {APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}
      </p>

      {/* Wait badge */}
      <div className="mt-1.5">
        <WaitBadge appointment={appointment} />
      </div>

      {/* Primary action button */}
      {actionLabel && onAction && (
        <button
          type="button"
          className="mt-2 w-full h-7 rounded-lg text-xs font-medium bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/25 hover:bg-[var(--accent)]/25 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onAction!();
          }}
        >
          {actionLabel}
        </button>
      )}

      {/* In-exam: View button */}
      {appointment.status === "in_exam" && (
        <button
          type="button"
          className="mt-2 w-full h-7 rounded-lg text-xs font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onCardClick(appointment);
          }}
        >
          View
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upcoming Strip (scheduled/confirmed appointments)
// ---------------------------------------------------------------------------

function UpcomingStrip({
  appointments,
  timezone,
  onCardClick,
}: {
  appointments: Appointment[];
  timezone: string;
  onCardClick: (a: Appointment) => void;
}) {
  const upcoming = appointments.filter(
    (a) => a.status === "scheduled" || a.status === "confirmed"
  );
  if (upcoming.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
        Upcoming
      </p>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-3" style={{ minWidth: "max-content" }}>
          {upcoming.map((appt) => {
            const color = STATUS_COLORS[appt.status];
            return (
              <button
                key={appt.id}
                type="button"
                onClick={() => onCardClick(appt)}
                className="flex flex-col gap-0.5 px-3 py-2 rounded-lg border text-left hover:brightness-110 transition-all animate-enter"
                style={{
                  borderColor: `${color}30`,
                  backgroundColor: `${color}10`,
                  minWidth: 140,
                }}
              >
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate max-w-[140px]">
                  {appt.patientName ?? "Unknown"}
                </p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {formatClinicTime(appt.startTime, timezone)}
                </p>
                <span
                  className="mt-0.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
                  style={{
                    color,
                    backgroundColor: `${color}15`,
                    border: `1px solid ${color}25`,
                  }}
                >
                  {APPOINTMENT_TYPE_LABELS[appt.appointmentType]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FlowBoard
// ---------------------------------------------------------------------------

export function FlowBoard({
  appointments,
  selectedDate,
  selectedProviderId,
  onCardClick,
  onCheckIn,
  onStartExam,
  timezone,
}: FlowBoardProps) {
  const { fetchAppointments } = useAppointmentStore();

  // 30-second polling — only active when FlowBoard is mounted (viewMode === "flow")
  useEffect(() => {
    const id = setInterval(() => {
      fetchAppointments(selectedDate, selectedProviderId || undefined);
    }, 30_000);
    return () => clearInterval(id);
  }, [selectedDate, selectedProviderId, fetchAppointments]);

  // Filter appointments per column
  const columnAppointments = useMemo(() => {
    return FLOW_COLUMNS.map((col) => {
      let filtered = appointments.filter((a) =>
        col.statuses.includes(a.status)
      );
      if (selectedProviderId) {
        filtered = filtered.filter((a) => a.providerId === selectedProviderId);
      }
      return { col, appointments: filtered };
    });
  }, [appointments, selectedProviderId]);

  return (
    <div className="glass-card p-4">
      {/* Upcoming strip */}
      <UpcomingStrip
        appointments={
          selectedProviderId
            ? appointments.filter((a) => a.providerId === selectedProviderId)
            : appointments
        }
        timezone={timezone}
        onCardClick={onCardClick}
      />

      {/* 4 Kanban columns */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {columnAppointments.map(({ col, appointments: colAppts }) => (
          <div
            key={col.id}
            className="flex flex-col gap-3 min-w-0"
            style={{ minWidth: 220 }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                {col.label}
              </span>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--bg-elevated)] text-[10px] font-semibold text-[var(--text-muted)]">
                {colAppts.length}
              </span>
            </div>

            {/* Column body */}
            <div className="flex flex-col gap-2 min-h-[120px] bg-[var(--bg-elevated)] rounded-lg p-2">
              {colAppts.length === 0 ? (
                <div className="flex items-center justify-center flex-1 py-6">
                  <p className="text-xs text-[var(--text-muted)] italic">
                    {col.label} is clear
                  </p>
                </div>
              ) : (
                colAppts.map((appt) => (
                  <KanbanCard
                    key={appt.id}
                    appointment={appt}
                    onCardClick={onCardClick}
                    onCheckIn={onCheckIn}
                    onStartExam={onStartExam}
                    timezone={timezone}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
