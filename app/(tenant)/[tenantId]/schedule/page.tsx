"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import {
  getAppointmentsForDate,
  getAppointmentsForWeek,
  getAppointmentCountByDate,
} from "@/lib/mock-schedule-data";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getMonday(d: Date): Date {
  const result = new Date(d);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Mon=1, Sun→-6
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_VARIANT: Record<string, "success" | "warning" | "info"> = {
  completed: "success",
  in_progress: "warning",
  scheduled: "info",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  scheduled: "Scheduled",
};

const STATUS_COLOR: Record<string, string> = {
  completed: "var(--state-normal)",
  in_progress: "var(--state-warning)",
  scheduled: "var(--state-info)",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const { has } = useEntitlements();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  // Entitlement gate
  if (!has(Entitlement.SCHEDULING)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card p-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="8" width="14" height="10" rx="2" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M6 8V6a4 4 0 018 0v2" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-subhead mb-2">Scheduling Locked</h2>
          <p className="text-caption text-[var(--text-muted)]">
            Upgrade your plan to access the appointment calendar.
          </p>
        </div>
      </div>
    );
  }

  // Week days array (Mon-Sun)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  // Date keys for the week
  const weekDateKeys = useMemo(() => weekDays.map(formatDateKey), [weekDays]);

  // Appointment counts per day
  const dayCounts = useMemo(
    () => getAppointmentCountByDate(weekDateKeys),
    [weekDateKeys]
  );

  // Today's appointments
  const selectedDateKey = formatDateKey(selectedDate);
  const dayAppointments = useMemo(
    () => getAppointmentsForDate(selectedDateKey),
    [selectedDateKey]
  );

  // Week stats
  const weekAppointments = useMemo(
    () => getAppointmentsForWeek(weekStart),
    [weekStart]
  );
  const weekTotal = weekAppointments.length;
  const weekCompleted = weekAppointments.filter((a) => a.status === "completed").length;
  const utilization = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;

  // Next scheduled appointment today
  const nextAppt = dayAppointments.find((a) => a.status === "scheduled");

  // Navigation
  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setWeekStart(getMonday(today));
  };
  const goPrevWeek = () => setWeekStart((ws) => addDays(ws, -7));
  const goNextWeek = () => setWeekStart((ws) => addDays(ws, 7));
  const selectDay = (d: Date) => setSelectedDate(d);

  const showTodayBtn = !isSameDay(selectedDate, new Date());

  // Month/year label from week
  const monthLabel = weekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Selected date label
  const selectedLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-display text-2xl">Schedule</h1>
        <div className="flex items-center gap-2">
          {showTodayBtn && (
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
          )}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goPrevWeek} aria-label="Previous week">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
            <span className="text-subhead min-w-[140px] text-center">{monthLabel}</span>
            <Button variant="ghost" size="icon" onClick={goNextWeek} aria-label="Next week">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Week Strip ── */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day, i) => {
          const key = weekDateKeys[i];
          const count = dayCounts[key] ?? 0;
          const selected = isSameDay(day, selectedDate);
          const today = isToday(day);
          return (
            <button
              key={key}
              onClick={() => selectDay(day)}
              className={`glass-card flex flex-col items-center gap-1 py-3 px-2 transition-all cursor-pointer border ${
                selected
                  ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                  : "border-transparent hover:border-[var(--border-default)]"
              }`}
              style={{ minHeight: "var(--touch-target)" }}
            >
              <span className="text-overline text-[var(--text-muted)]">{DAY_NAMES[i]}</span>
              <span
                className={`text-lg font-mono font-semibold ${
                  selected
                    ? "text-[var(--accent)]"
                    : today
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                {day.getDate()}
              </span>
              {today && !selected && (
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] absolute" style={{ marginTop: "2px" }} />
              )}
              {count > 0 ? (
                <Badge variant={selected ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                    <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M3 14c0-2.761 2.239-4.5 5-4.5s5 1.739 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  {count}
                </Badge>
              ) : (
                <span className="text-[10px] text-[var(--text-muted)]">—</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Stats Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Today"
          value={dayAppointments.length}
          trend={`${dayAppointments.filter((a) => a.status === "completed").length} completed`}
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3.5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 8h16" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          }
        />
        <StatCard
          label="This Week"
          value={weekTotal}
          trend={`${weekCompleted} completed`}
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3.5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 8h16M7 3.5v4M13 3.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          label="Utilization"
          value={`${utilization}%`}
          trend="completed / total"
          accent
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          label="Next Appt"
          value={nextAppt?.time ?? "—"}
          trend={nextAppt?.patient ?? "No upcoming"}
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3 17c0-3.866 3.134-6.5 7-6.5s7 2.634 7 6.5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          }
        />
      </div>

      {/* ── Day Label ── */}
      <div className="flex items-center justify-between">
        <p className="text-body">{selectedLabel}</p>
        <Badge variant="default">{dayAppointments.length} appointments</Badge>
      </div>

      {/* ── Appointment Timeline ── */}
      {dayAppointments.length > 0 ? (
        <div className="flex flex-col gap-3">
          {dayAppointments.map((apt) => (
            <Link
              key={apt.id}
              href={`/${tenantId}/encounter/${apt.id}`}
              className={`glass-card glass-card-hover flex items-center gap-5 px-5 py-4 no-underline ${
                apt.status === "completed" ? "opacity-60" : ""
              }`}
              style={{
                borderLeft: `3px solid ${STATUS_COLOR[apt.status]}`,
              }}
            >
              <span className="text-lg font-mono font-semibold w-20 flex-shrink-0 text-right text-[var(--text-primary)]">
                {apt.time}
              </span>
              <div
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  apt.status === "in_progress" ? "animate-glow" : ""
                }`}
                style={{ background: STATUS_COLOR[apt.status] }}
              />
              <div className="flex-1 min-w-0">
                <span className="text-subhead">{apt.patient}</span>
                <span className="text-caption ml-3 text-[var(--text-muted)]">{apt.type}</span>
              </div>
              <Badge variant={STATUS_VARIANT[apt.status]}>
                {STATUS_LABEL[apt.status]}
              </Badge>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass-card flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3.5" width="16" height="14" rx="2.5" stroke="var(--text-muted)" strokeWidth="1.3" />
              <path d="M2 8h16" stroke="var(--text-muted)" strokeWidth="1.3" />
              <path d="M7 12h6" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-subhead">No appointments scheduled</p>
          <p className="text-caption text-[var(--text-muted)]">
            {isToday(selectedDate) ? "Your day is clear." : "Nothing booked for this day."}
          </p>
        </div>
      )}
    </div>
  );
}
