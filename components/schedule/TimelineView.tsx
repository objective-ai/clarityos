"use client";

import { useMemo } from "react";
import type { Appointment, AppointmentStatus } from "@/types/appointment";
import {
  APPOINTMENT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/types/appointment";

// ---------------------------------------------------------------------------
// Constants (defaults — grid expands dynamically for outlier appointments)
// ---------------------------------------------------------------------------

const DEFAULT_START_HOUR = 7; // 7 AM
const DEFAULT_END_HOUR = 19; // 7 PM
const SLOT_MINUTES = 30;
const ROW_HEIGHT = 48; // px per 30-min slot

function formatSlotTime(hour: number, min: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:${String(min).padStart(2, "0")} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Current Time Indicator
// ---------------------------------------------------------------------------

function NowIndicator({ dateStr, startHour, endHour }: { dateStr: string; startHour: number; endHour: number }) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (dateStr !== todayStr) return null;

  const mins = (now.getHours() - startHour) * 60 + now.getMinutes();
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
// Appointment Block
// ---------------------------------------------------------------------------

function AppointmentBlock({
  appointment,
  onClick,
  startHour,
}: {
  appointment: Appointment;
  onClick: (appt: Appointment) => void;
  startHour: number;
}) {
  const d = new Date(appointment.startTime);
  const mins = (d.getHours() - startHour) * 60 + d.getMinutes();
  const top = (mins / SLOT_MINUTES) * ROW_HEIGHT + 2; // +2 top inset
  const height = Math.max((appointment.durationMinutes / SLOT_MINUTES) * ROW_HEIGHT - 6, 22); // -6 for top+bottom gap
  const color = STATUS_COLORS[appointment.status];
  const borderColor = appointment.triageFlags?.urgency === "urgent" ? "#ef4444" : color;
  const compact = appointment.durationMinutes <= 15;

  return (
    <button
      className="absolute left-2 right-2 rounded-lg overflow-hidden cursor-pointer transition-all hover:brightness-110 hover:shadow-lg text-left"
      style={{
        top,
        height,
        backgroundColor: `${color}28`,
        border: `1px solid ${color}40`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(appointment);
      }}
    >
      <div className="flex h-full">
        {/* Color bar — wider, red override for urgent */}
        <div className="w-1.5 shrink-0 rounded-l-lg" style={{ backgroundColor: borderColor }} />

        {/* Left column: patient info */}
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

        {/* Right: single row — alert chips + status label */}
        <div className="flex items-center gap-1.5 shrink-0 self-center pr-2">
          {appointment.triageFlags?.urgency === "urgent" && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-500/15 text-red-400 border border-red-500/25 animate-pulse"
              title={`URGENT: ${appointment.triageFlags.flags?.join(", ")}\n${appointment.triageFlags.reasoning}`}
            >
              <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
              </svg>
              Urgent
            </span>
          )}
          {appointment.triageFlags?.urgency === "moderate" && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25"
              title={`Moderate: ${appointment.triageFlags.reasoning}`}
            >
              <svg className="w-2.5 h-2.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
              </svg>
              Mod
            </span>
          )}
          {appointment.intakeStatus === "pending" && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20"
              title="Intake form sent but not yet completed"
            >
              <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Pending
            </span>
          )}
          {/* Status label */}
          <span
            className="text-[9px] font-medium leading-none whitespace-nowrap"
            style={{ color }}
          >
            {STATUS_LABELS[appointment.status]}
          </span>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// TimelineView (single column)
// ---------------------------------------------------------------------------

export default function TimelineView({
  appointments,
  selectedDate,
  onAppointmentClick,
  onSlotClick,
}: {
  appointments: Appointment[];
  selectedDate: string;
  onAppointmentClick: (appt: Appointment) => void;
  onSlotClick?: (time: string) => void;
}) {
  // Compute dynamic time range based on appointments
  const { effectiveStart, effectiveEnd } = useMemo(() => {
    let minHour = DEFAULT_START_HOUR;
    let maxHour = DEFAULT_END_HOUR;
    for (const appt of appointments) {
      const sd = new Date(appt.startTime);
      const startH = sd.getHours();
      const ed = new Date(appt.endTime);
      const endH = ed.getHours() + (ed.getMinutes() > 0 ? 1 : 0);
      if (startH < minHour) minHour = startH;
      if (endH > maxHour) maxHour = endH;
    }
    return { effectiveStart: minHour, effectiveEnd: maxHour };
  }, [appointments]);

  const totalSlots = ((effectiveEnd - effectiveStart) * 60) / SLOT_MINUTES;

  // Generate time labels
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
        <div className="relative pt-2" style={{ height: totalHeight + 8 }}>
          {/* Grid lines + time labels */}
          {slots.map((slot, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 flex"
              style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              {/* Time label */}
              <div className="w-16 shrink-0 pr-2 text-right">
                {slot.min === 0 && (
                  <span className="text-[10px] text-[var(--text-muted)] leading-none -mt-1.5 block">
                    {slot.label}
                  </span>
                )}
              </div>
              {/* Grid row — clickable empty slot */}
              <button
                className="flex-1 border-t border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]/50 transition-colors cursor-pointer"
                style={slot.min !== 0 ? { borderTopStyle: "dashed" } : undefined}
                onClick={() => {
                  const h = String(slot.hour).padStart(2, "0");
                  const m = String(slot.min).padStart(2, "0");
                  onSlotClick?.(`${h}:${m}`);
                }}
                title={`Book at ${slot.label}`}
              />
            </div>
          ))}

          {/* Appointment blocks */}
          <div
            className="absolute top-0 bottom-0 right-0"
            style={{ left: 64 }}
          >
            <div className="relative h-full">
              {appointments.map((appt) => (
                <AppointmentBlock
                  key={appt.id}
                  appointment={appt}
                  onClick={onAppointmentClick}
                  startHour={effectiveStart}
                />
              ))}
              <NowIndicator dateStr={selectedDate} startHour={effectiveStart} endHour={effectiveEnd} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
