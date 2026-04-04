"use client";

import { useMemo } from "react";
import type { Appointment } from "@/types/appointment";
import { APPOINTMENT_TYPE_LABELS, STATUS_COLORS } from "@/types/appointment";
import { getWeekDays } from "@/lib/scheduleUtils";
import { clinicHoursMinutes, clinicNow, clinicToday, formatClinicTime } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Constants (matching TimelineView pattern)
// ---------------------------------------------------------------------------

const START_HOUR = 8;
const END_HOUR = 18;
const SLOT_MINUTES = 30;
const ROW_HEIGHT = 48; // px per 30-min slot — matches TimelineView

const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;
const TOTAL_HEIGHT = TOTAL_SLOTS * ROW_HEIGHT;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------------------------------------------------------------------------
// Time axis slots
// ---------------------------------------------------------------------------

function buildSlots() {
  const slots: { hour: number; min: number; label: string }[] = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const totalMin = i * SLOT_MINUTES;
    const hour = START_HOUR + Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const ampm = hour >= 12 ? "PM" : "AM";
    const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    slots.push({ hour, min, label: `${h}:${String(min).padStart(2, "0")} ${ampm}` });
  }
  return slots;
}

const SLOTS = buildSlots();

// ---------------------------------------------------------------------------
// Now indicator (today's column only)
// ---------------------------------------------------------------------------

function NowIndicator({ timezone }: { timezone: string }) {
  const { hours, minutes } = clinicNow(timezone);
  const mins = (hours - START_HOUR) * 60 + minutes;
  if (mins < 0 || mins > (END_HOUR - START_HOUR) * 60) return null;
  const top = (mins / SLOT_MINUTES) * ROW_HEIGHT;
  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ top }}
    >
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-[var(--accent)] -ml-0.5 shrink-0" />
        <div className="flex-1 h-px bg-[var(--accent)]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appointment block (absolutely positioned within column)
// ---------------------------------------------------------------------------

function WeekApptBlock({
  appointment,
  timezone,
  onCardClick,
}: {
  appointment: Appointment;
  timezone: string;
  onCardClick: (a: Appointment) => void;
}) {
  const { hours, minutes } = clinicHoursMinutes(appointment.startTime, timezone);
  const minsFromStart = (hours - START_HOUR) * 60 + minutes;
  const top = (minsFromStart / SLOT_MINUTES) * ROW_HEIGHT;
  const height = Math.max((appointment.durationMinutes / SLOT_MINUTES) * ROW_HEIGHT - 2, 20);
  const color = STATUS_COLORS[appointment.status];

  return (
    <button
      type="button"
      className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 text-left overflow-hidden hover:brightness-110 transition-all cursor-pointer"
      style={{
        top,
        height,
        backgroundColor: `${color}28`,
        border: `1px solid ${color}40`,
      }}
      onClick={() => onCardClick(appointment)}
      title={`${appointment.patientName ?? "Unknown"} · ${formatClinicTime(appointment.startTime, timezone)}`}
    >
      <p className="text-[10px] font-semibold text-[var(--text-primary)] truncate leading-tight">
        {appointment.patientName ?? "Unknown"}
      </p>
      {height > 28 && (
        <p className="text-[9px] text-[var(--text-muted)] truncate leading-tight mt-0.5">
          {APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}
        </p>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WeekViewProps {
  selectedDate: string;
  weekAppointments: Appointment[];
  isLoading: boolean;
  onCardClick: (appointment: Appointment) => void;
  onCheckIn: (id: string) => Promise<void>;
  onStartExam: (id: string) => Promise<void>;
  tenant: string;
  timezone: string;
}

// ---------------------------------------------------------------------------
// WeekView
// ---------------------------------------------------------------------------

export function WeekView({
  selectedDate,
  weekAppointments,
  isLoading,
  onCardClick,
  timezone,
}: WeekViewProps) {
  const days = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const todayStr = clinicToday(timezone);

  // Group appointments by day
  const appointmentsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const day of days) map[day] = [];
    for (const appt of weekAppointments) {
      const apptDate = appt.startTime.slice(0, 10);
      if (map[apptDate]) map[apptDate].push(appt);
    }
    return map;
  }, [weekAppointments, days]);

  return (
    <div className="glass-card overflow-hidden">
      {/* Scrollable container */}
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
        <div style={{ minWidth: 700 }}>
          {/* Day column headers */}
          <div className="flex sticky top-0 z-20 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
            {/* Time axis spacer */}
            <div className="w-14 shrink-0" />
            {days.map((day, i) => {
              const [, , dd] = day.split("-");
              const isToday = day === todayStr;
              const isSelected = day === selectedDate;
              return (
                <div
                  key={day}
                  className="flex-1 text-center py-2 border-l border-[var(--border-subtle)]"
                  style={{ minWidth: 120 }}
                >
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      isToday
                        ? "text-[var(--accent)]"
                        : isSelected
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {DAY_NAMES[i]}
                  </p>
                  <p
                    className={`text-lg font-bold leading-tight ${
                      isToday
                        ? "text-[var(--accent)]"
                        : isSelected
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {parseInt(dd, 10)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Loading skeleton */}
          {isLoading ? (
            <div
              className="flex animate-pulse"
              style={{ height: TOTAL_HEIGHT }}
            >
              <div className="w-14 shrink-0" />
              {days.map((day) => (
                <div
                  key={day}
                  className="flex-1 border-l border-[var(--border-subtle)]"
                  style={{ minWidth: 120 }}
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="mx-1 my-3 h-8 rounded-md bg-[var(--bg-elevated)]"
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            /* Time grid + appointment blocks */
            <div className="flex" style={{ height: TOTAL_HEIGHT }}>
              {/* Time axis */}
              <div className="w-14 shrink-0 relative">
                {SLOTS.map((slot, i) => (
                  <div
                    key={i}
                    className="absolute right-2 text-right"
                    style={{ top: i * ROW_HEIGHT - 6 }}
                  >
                    {slot.min === 0 && (
                      <span className="text-[9px] text-[var(--text-muted)] leading-none whitespace-nowrap">
                        {slot.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((day) => {
                const isToday = day === todayStr;
                const dayAppts = appointmentsByDay[day] ?? [];
                return (
                  <div
                    key={day}
                    className="flex-1 relative border-l border-[var(--border-subtle)]"
                    style={{ minWidth: 120 }}
                  >
                    {/* Grid lines */}
                    {SLOTS.map((slot, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t"
                        style={{
                          top: i * ROW_HEIGHT,
                          height: ROW_HEIGHT,
                          borderColor: "var(--border-subtle)",
                          borderTopStyle: slot.min !== 0 ? "dashed" : "solid",
                        }}
                      />
                    ))}

                    {/* Now indicator (today only) */}
                    {isToday && <NowIndicator timezone={timezone} />}

                    {/* Appointment blocks */}
                    {dayAppts.map((appt) => (
                      <WeekApptBlock
                        key={appt.id}
                        appointment={appt}
                        timezone={timezone}
                        onCardClick={onCardClick}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
