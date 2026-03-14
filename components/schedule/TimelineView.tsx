"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import type { Appointment, AppointmentStatus } from "@/types/appointment";
import {
  APPOINTMENT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/types/appointment";
import { Button } from "@/components/ui/button";
import {
  clinicHoursMinutes,
  clinicNow,
  clinicToday,
  formatClinicTime,
} from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;
const SLOT_MINUTES = 30;
const ROW_HEIGHT = 48; // px per 30-min slot

function formatSlotTime(hour: number, min: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:${String(min).padStart(2, "0")} ${ampm}`;
}

function formatTimeRange(startIso: string, endIso: string, tz: string): string {
  return `${formatClinicTime(startIso, tz)} – ${formatClinicTime(endIso, tz)}`;
}

// ---------------------------------------------------------------------------
// Current Time Indicator
// ---------------------------------------------------------------------------

function NowIndicator({
  dateStr,
  startHour,
  endHour,
  clinicTimezone,
}: {
  dateStr: string;
  startHour: number;
  endHour: number;
  clinicTimezone: string;
}) {
  const todayStr = clinicToday(clinicTimezone);
  if (dateStr !== todayStr) return null;

  const { hours, minutes } = clinicNow(clinicTimezone);
  const mins = (hours - startHour) * 60 + minutes;
  if (mins < 0 || mins > (endHour - startHour) * 60) return null;

  const top = (mins / SLOT_MINUTES) * ROW_HEIGHT;

  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ top }}
    >
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-[var(--accent)] -ml-1" />
        <div className="flex-1 h-px bg-[var(--accent)]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status Badge (inline)
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase select-none"
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Panel action button (secondary style for inline actions in expanded panel)
// ---------------------------------------------------------------------------

function PanelBtn({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
        danger
          ? "text-red-400 border-red-500/25 hover:bg-red-500/10"
          : "text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Appointment Block (with expand-overlay)
// ---------------------------------------------------------------------------

function AppointmentBlock({
  appointment,
  startHour,
  isExpanded,
  onToggleExpand,
  onCheckIn,
  onStartExam,
  onViewEncounter,
  onCancel,
  onRevertCheckIn,
  onReschedule,
  onFollowUp,
  onSendIntake,
  onMarkNoShow,
  clinicTimezone,
}: {
  appointment: Appointment;
  startHour: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCheckIn: (id: string) => void;
  onStartExam: (id: string) => void;
  onViewEncounter: (shortId: string) => void;
  onCancel: (id: string) => void;
  onRevertCheckIn: (id: string) => void;
  onReschedule: (appt: Appointment) => void;
  onFollowUp: (appt: Appointment) => void;
  onSendIntake: (appt: Appointment) => void;
  onMarkNoShow: (id: string) => void;
  clinicTimezone: string;
}) {
  const { hours, minutes } = clinicHoursMinutes(appointment.startTime, clinicTimezone);
  const mins = (hours - startHour) * 60 + minutes;
  const top = (mins / SLOT_MINUTES) * ROW_HEIGHT + 2;
  const height = Math.max(
    (appointment.durationMinutes / SLOT_MINUTES) * ROW_HEIGHT - 6,
    22
  );
  const color = STATUS_COLORS[appointment.status];
  const borderColor =
    appointment.triageFlags?.urgency === "urgent" ? "#ef4444" : color;
  const compact = appointment.durationMinutes <= 15;

  const canCheckIn =
    appointment.status === "scheduled" || appointment.status === "confirmed";
  const canStartExam = appointment.status === "arrived";
  const canContinuePretest = appointment.status === "in_pretest";
  const canContinueExam = appointment.status === "in_exam";
  const canViewEncounter =
    appointment.status === "completed" || appointment.status === "finalized";
  const hasEncounter = !!appointment.encounterId;

  return (
    <div
      className="absolute left-2 right-2"
      style={{ top, zIndex: isExpanded ? 50 : undefined }}
    >
      {/* The clickable block button */}
      <button
        className="w-full rounded-lg overflow-hidden cursor-pointer transition-all hover:brightness-110 hover:shadow-lg text-left"
        style={{
          height,
          backgroundColor: `${color}28`,
          border: `1px solid ${color}40`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        <div className="flex h-full">
          <div className="w-1.5 shrink-0 rounded-l-lg" style={{ backgroundColor: borderColor }} />
          <div className={`flex-1 min-w-0 px-2 overflow-hidden ${compact ? "py-0.5" : "py-1.5"}`}>
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
              {appointment.patientName ?? "Unknown"}
            </p>
            {!compact && (
              <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                {APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}
                {appointment.providerName && ` · ${appointment.providerName}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 self-center pr-2">
            {appointment.triageFlags?.urgency === "urgent" && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-500/15 text-red-400 border border-red-500/25 animate-pulse"
                title={`URGENT: ${appointment.triageFlags.flags?.join(", ")}\n${appointment.triageFlags.reasoning}`}
              >
                <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                Urgent
              </span>
            )}
            <span className="text-[9px] font-medium leading-none whitespace-nowrap" style={{ color }}>
              {STATUS_LABELS[appointment.status]}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded overlay panel */}
      {isExpanded && (
        <div
          className="absolute left-0 top-full mt-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-lg)] z-20 min-w-[280px] w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {appointment.patientName ?? "Unknown Patient"}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}
                  {appointment.providerName && ` · ${appointment.providerName}`}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {formatTimeRange(appointment.startTime, appointment.endTime, clinicTimezone)}{" "}
                  <span className="text-[var(--text-secondary)]">({appointment.durationMinutes} min)</span>
                </p>
              </div>
              <StatusBadge status={appointment.status} />
            </div>

            {/* Chief complaint */}
            {appointment.chiefComplaint && (
              <p className="text-xs text-[var(--text-secondary)] italic border-t border-[var(--border-subtle)] pt-2">
                {appointment.chiefComplaint}
              </p>
            )}

            {/* Intake status */}
            {appointment.intakeStatus === "submitted" && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Intake submitted
              </span>
            )}
            {appointment.intakeStatus === "pending" && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Intake pending
              </span>
            )}

            {/* Action buttons — inline, no 3-dot */}
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--border-subtle)] pt-2">
              {canCheckIn && (
                <Button size="sm" onClick={() => { onToggleExpand(); onCheckIn(appointment.id); }}>
                  Check In
                </Button>
              )}
              {canStartExam && (
                <Button size="sm" onClick={() => { onToggleExpand(); onStartExam(appointment.id); }}>
                  Start Pre-Test
                </Button>
              )}
              {canContinuePretest && hasEncounter && (
                <Button size="sm" onClick={() => { onToggleExpand(); onViewEncounter(appointment.encounterShortId!); }}>
                  Continue Pre-Test
                </Button>
              )}
              {canContinueExam && hasEncounter && (
                <Button size="sm" onClick={() => { onToggleExpand(); onViewEncounter(appointment.encounterShortId!); }}>
                  Continue Exam
                </Button>
              )}
              {canViewEncounter && hasEncounter && (
                <Button size="sm" variant="outline" onClick={() => { onToggleExpand(); onViewEncounter(appointment.encounterShortId!); }}>
                  View Encounter
                </Button>
              )}
              {(canCheckIn || canStartExam) && (
                <PanelBtn label={appointment.intakeStatus ? "Resend Intake" : "Send Intake"} onClick={() => { onToggleExpand(); onSendIntake(appointment); }} />
              )}
              {(canCheckIn || canStartExam || canContinuePretest || canContinueExam) && (
                <PanelBtn label="Reschedule" onClick={() => { onToggleExpand(); onReschedule(appointment); }} />
              )}
              {appointment.status === "completed" && (
                <PanelBtn label="Schedule Follow-Up" onClick={() => { onToggleExpand(); onFollowUp(appointment); }} />
              )}
              {canStartExam && (
                <PanelBtn label="Undo Check-In" onClick={() => { onToggleExpand(); onRevertCheckIn(appointment.id); }} />
              )}
              {(canCheckIn || canStartExam) && (
                <PanelBtn label="No-Show" danger onClick={() => { onToggleExpand(); onMarkNoShow(appointment.id); }} />
              )}
              {(canCheckIn || canStartExam || canContinuePretest || canContinueExam) && (
                <PanelBtn label="Cancel" danger onClick={() => { onToggleExpand(); onCancel(appointment.id); }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimelineView (single column)
// ---------------------------------------------------------------------------

export default function TimelineView({
  appointments,
  selectedDate,
  clinicTimezone,
  onCheckIn,
  onStartExam,
  onViewEncounter,
  onCancel,
  onRevertCheckIn,
  onReschedule,
  onFollowUp,
  onSendIntake,
  onMarkNoShow,
  onSlotClick,
}: {
  appointments: Appointment[];
  selectedDate: string;
  clinicTimezone: string;
  onCheckIn: (id: string) => void;
  onStartExam: (id: string) => void;
  onViewEncounter: (shortId: string) => void;
  onCancel: (id: string) => void;
  onRevertCheckIn: (id: string) => void;
  onReschedule: (appt: Appointment) => void;
  onFollowUp: (appt: Appointment) => void;
  onSendIntake: (appt: Appointment) => void;
  onMarkNoShow: (id: string) => void;
  onSlotClick?: (time: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close expanded block on outside click
  useEffect(() => {
    if (!expandedId) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpandedId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expandedId]);

  // Close on Escape
  useEffect(() => {
    if (!expandedId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expandedId]);

  const { effectiveStart, effectiveEnd } = useMemo(() => {
    let minHour = DEFAULT_START_HOUR;
    let maxHour = DEFAULT_END_HOUR;
    for (const appt of appointments) {
      const s = clinicHoursMinutes(appt.startTime, clinicTimezone);
      const e = clinicHoursMinutes(appt.endTime, clinicTimezone);
      const endH = e.hours + (e.minutes > 0 ? 1 : 0);
      if (s.hours < minHour) minHour = s.hours;
      if (endH > maxHour) maxHour = endH;
    }
    return { effectiveStart: minHour, effectiveEnd: maxHour };
  }, [appointments, clinicTimezone]);

  const totalSlots = ((effectiveEnd - effectiveStart) * 60) / SLOT_MINUTES;

  const slots = useMemo(() => {
    const result: { hour: number; min: number; label: string }[] = [];
    for (let i = 0; i < totalSlots; i++) {
      const totalMin = i * SLOT_MINUTES;
      const hour = effectiveStart + Math.floor(totalMin / 60);
      const min = totalMin % 60;
      result.push({ hour, min, label: formatSlotTime(hour, min) });
    }
    return result;
  }, [effectiveStart, totalSlots]);

  const totalHeight = totalSlots * ROW_HEIGHT;

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
        <div
          ref={containerRef}
          className="relative pt-2"
          style={{ height: totalHeight + 8 }}
        >
          {/* Grid lines + time labels */}
          {slots.map((slot, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 flex"
              style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              <div className="w-16 shrink-0 pr-2 text-right">
                {slot.min === 0 && (
                  <span className="text-[10px] text-[var(--text-muted)] leading-none -mt-1.5 block">
                    {slot.label}
                  </span>
                )}
              </div>
              <button
                className="flex-1 border-t border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]/50 transition-colors cursor-pointer"
                style={slot.min !== 0 ? { borderTopStyle: "dashed" } : undefined}
                onClick={() => {
                  setExpandedId(null);
                  const h = String(slot.hour).padStart(2, "0");
                  const m = String(slot.min).padStart(2, "0");
                  onSlotClick?.(`${h}:${m}`);
                }}
                title={`Book at ${slot.label}`}
              />
            </div>
          ))}

          {/* Appointment blocks */}
          <div className="absolute top-0 bottom-0 right-0" style={{ left: 64 }}>
            <div className="relative h-full">
              {appointments.map((appt) => (
                <AppointmentBlock
                  key={appt.id}
                  appointment={appt}
                  startHour={effectiveStart}
                  clinicTimezone={clinicTimezone}
                  isExpanded={expandedId === appt.id}
                  onToggleExpand={() =>
                    setExpandedId((cur) => (cur === appt.id ? null : appt.id))
                  }
                  onCheckIn={onCheckIn}
                  onStartExam={onStartExam}
                  onViewEncounter={onViewEncounter}
                  onCancel={onCancel}
                  onRevertCheckIn={onRevertCheckIn}
                  onReschedule={onReschedule}
                  onFollowUp={onFollowUp}
                  onSendIntake={onSendIntake}
                  onMarkNoShow={onMarkNoShow}
                />
              ))}
              <NowIndicator
                dateStr={selectedDate}
                startHour={effectiveStart}
                endHour={effectiveEnd}
                clinicTimezone={clinicTimezone}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
