"use client";

import { useMemo } from "react";
import type { Appointment } from "@/types/appointment";
import {
  APPOINTMENT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_SHORT_LABELS,
  STATUS_COLORS,
} from "@/types/appointment";

// ---------------------------------------------------------------------------
// Constants (defaults — grid expands dynamically for outlier appointments)
// ---------------------------------------------------------------------------

const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;
const SLOT_MINUTES = 30;
const ROW_HEIGHT = 48;
const COL_MIN_WIDTH = 180; // px per provider column

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
// Appointment Block (compact for multi-column)
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
  const height = Math.max((appointment.durationMinutes / SLOT_MINUTES) * ROW_HEIGHT - 6, 18); // -6 for top+bottom gap
  const color = STATUS_COLORS[appointment.status];
  const borderColor = appointment.triageFlags?.urgency === "urgent" ? "#ef4444" : color;
  const compact = height < 36;

  return (
    <button
      className="absolute left-1.5 right-1.5 rounded-md overflow-hidden cursor-pointer transition-all hover:brightness-110 hover:shadow-lg text-left"
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
        <div className="w-1 shrink-0 rounded-l-md" style={{ backgroundColor: borderColor }} />

        {/* Left: patient info */}
        <div className={`flex-1 min-w-0 px-1.5 overflow-hidden ${compact ? "py-0.5" : "py-1"}`}>
          <div className="flex items-center gap-1">
            <p className="text-[11px] font-semibold text-[var(--text-primary)] truncate flex-1 min-w-0">
              {appointment.patientName ?? "Unknown"}
            </p>
            {/* Icon-only alert indicators — top-right of block */}
            {appointment.triageFlags?.urgency === "urgent" && (
              <span title={`URGENT: ${appointment.triageFlags.flags?.join(", ")}\n${appointment.triageFlags.reasoning}`}>
                <svg className="w-3.5 h-3.5 shrink-0 text-red-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                </svg>
              </span>
            )}
            {appointment.triageFlags?.urgency === "moderate" && (
              <span title={`Moderate: ${appointment.triageFlags.reasoning}`}>
                <svg className="w-3.5 h-3.5 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                </svg>
              </span>
            )}
            {appointment.intakeStatus === "pending" && (
              <span title="Intake form pending">
                <svg className="w-3.5 h-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </span>
            )}
          </div>
          {!compact && (
            <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
              {APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}
              {" · "}
              <span style={{ color }} className="font-medium">
                {STATUS_SHORT_LABELS[appointment.status]}
              </span>
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ClinicView (multi-column, one per provider)
// ---------------------------------------------------------------------------

export default function ClinicView({
  appointments,
  selectedDate,
  onAppointmentClick,
  onSlotClick,
  selectedProviderId,
}: {
  appointments: Appointment[];
  selectedDate: string;
  onAppointmentClick: (appt: Appointment) => void;
  onSlotClick?: (time: string, providerId?: string) => void;
  selectedProviderId?: string;
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

  // Derive unique providers from appointments + group appointments by provider
  const { providers, byProvider } = useMemo(() => {
    const provMap = new Map<string, { id: string; name: string }>();
    const grouped = new Map<string, Appointment[]>();

    for (const appt of appointments) {
      const pid = appt.providerId;
      if (!provMap.has(pid)) {
        provMap.set(pid, {
          id: pid,
          name: appt.providerName ?? "Unknown Provider",
        });
      }
      const list = grouped.get(pid) ?? [];
      list.push(appt);
      grouped.set(pid, list);
    }

    // If a provider is selected, show only that provider
    let providerList = Array.from(provMap.values());
    if (selectedProviderId) {
      providerList = providerList.filter((p) => p.id === selectedProviderId);
    }

    return { providers: providerList, byProvider: grouped };
  }, [appointments, selectedProviderId]);

  // Generate time slots
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

  if (providers.length === 0) {
    return (
      <div className="glass-card flex items-center justify-center py-16">
        <p className="text-body text-[var(--text-muted)]">
          No provider appointments to display.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Sticky provider header */}
      <div className="flex border-b border-[var(--border-default)] bg-[var(--bg-surface)] sticky top-0 z-20">
        {/* Time column header */}
        <div className="w-16 shrink-0 px-2 py-2">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
            Time
          </span>
        </div>
        {/* Provider columns */}
        {providers.map((prov) => (
          <div
            key={prov.id}
            className="flex-1 px-3 py-2 text-center border-l border-[var(--border-subtle)]"
            style={{ minWidth: COL_MIN_WIDTH }}
          >
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
              {prov.name}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {(byProvider.get(prov.id) ?? []).length} appts
            </p>
          </div>
        ))}
      </div>

      {/* Scrollable body */}
      <div className="overflow-auto max-h-[calc(100vh-340px)]">
        <div className="flex pt-2" style={{ minHeight: totalHeight + 8 }}>
          {/* Time labels column */}
          <div className="w-16 shrink-0 relative" style={{ height: totalHeight }}>
            {slots.map((slot, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 pr-2 text-right"
                style={{ top: i * ROW_HEIGHT }}
              >
                {slot.min === 0 && (
                  <span className="text-[10px] text-[var(--text-muted)] leading-none -mt-1.5 block">
                    {slot.label}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Provider columns */}
          {providers.map((prov) => {
            const provAppts = byProvider.get(prov.id) ?? [];

            return (
              <div
                key={prov.id}
                className="flex-1 relative border-l border-[var(--border-subtle)]"
                style={{ minWidth: COL_MIN_WIDTH, height: totalHeight }}
              >
                {/* Grid lines */}
                {slots.map((slot, i) => (
                  <button
                    key={i}
                    className="absolute left-0 right-0 border-t border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]/50 transition-colors cursor-pointer"
                    style={{
                      top: i * ROW_HEIGHT,
                      height: ROW_HEIGHT,
                      borderTopStyle: slot.min !== 0 ? "dashed" : "solid",
                    }}
                    onClick={() => {
                      const h = String(slot.hour).padStart(2, "0");
                      const m = String(slot.min).padStart(2, "0");
                      onSlotClick?.(`${h}:${m}`, prov.id);
                    }}
                    title={`Book ${prov.name} at ${slot.label}`}
                  />
                ))}

                {/* Appointment blocks */}
                {provAppts.map((appt) => (
                  <AppointmentBlock
                    key={appt.id}
                    appointment={appt}
                    onClick={onAppointmentClick}
                    startHour={effectiveStart}
                  />
                ))}

                <NowIndicator dateStr={selectedDate} startHour={effectiveStart} endHour={effectiveEnd} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
