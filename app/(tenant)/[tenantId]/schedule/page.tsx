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
  const diff = day === 0 ? -6 : 1 - day;
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
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_BADGE_VARIANT: Record<string, "info" | "warning" | "success"> = {
  scheduled: "info",
  in_progress: "warning",
  completed: "success",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Waiting",
  in_progress: "In Exam",
  completed: "Finalized",
};

const STATUS_DOT_COLOR: Record<string, string> = {
  scheduled: "var(--state-info)",
  in_progress: "var(--state-warning)",
  completed: "var(--state-normal)",
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="inline-block mr-1 flex-shrink-0">
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 6.5v3.5l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SchedulePage() {
  const { has } = useEntitlements();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [query, setQuery] = useState("");

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
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekDateKeys = useMemo(() => weekDays.map(formatDateKey), [weekDays]);
  const dayCounts = useMemo(
    () => getAppointmentCountByDate(weekDateKeys),
    [weekDateKeys]
  );

  // Selected day appointments
  const selectedDateKey = formatDateKey(selectedDate);
  const dayAppointments = useMemo(
    () => getAppointmentsForDate(selectedDateKey),
    [selectedDateKey]
  );

  // Search-filtered appointments
  const filteredAppointments = useMemo(() => {
    if (!query.trim()) return dayAppointments;
    const q = query.toLowerCase();
    return dayAppointments.filter((a) =>
      a.patient.toLowerCase().includes(q)
    );
  }, [dayAppointments, query]);

  // Stats derived from full day (not filtered)
  const inProgressCount = dayAppointments.filter((a) => a.status === "in_progress").length;
  const completedCount = dayAppointments.filter((a) => a.status === "completed").length;
  const nextAppt = dayAppointments.find((a) => a.status === "scheduled");

  // Week stats (for week completion context via utilization)
  const weekAppointments = useMemo(
    () => getAppointmentsForWeek(weekStart),
    [weekStart]
  );
  void weekAppointments; // retained for future week metrics

  // Navigation
  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setWeekStart(getMonday(today));
  };
  const goPrevWeek = () => setWeekStart((ws) => addDays(ws, -7));
  const goNextWeek = () => setWeekStart((ws) => addDays(ws, 7));

  const showTodayBtn = !isSameDay(selectedDate, new Date());
  const monthLabel = weekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selectedLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-display text-2xl">Schedule</h1>
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
        <Button variant="default" size="sm">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mr-1.5">
            <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M3 14c0-2.761 2.239-4.5 5-4.5s5 1.739 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M12 2v4M10 4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Check-in Patient
        </Button>
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
              onClick={() => setSelectedDate(day)}
              className={`glass-card relative flex flex-col items-center gap-1 py-3 px-2 transition-all cursor-pointer border ${
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
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              )}
              {count > 0 ? (
                <Badge
                  variant={selected ? "default" : "secondary"}
                  className="text-[10px] px-1.5 py-0 flex items-center gap-0.5"
                >
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

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Appts"
          value={dayAppointments.length}
          trend={`${completedCount} finalized`}
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3.5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 8h16M7 3.5v4M13 3.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
        />
        <StatCard
          label="In Progress"
          value={inProgressCount}
          trend={inProgressCount === 1 ? "patient in exam" : "patients in exam"}
          accent
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <StatCard
          label="Completed"
          value={completedCount}
          trend={`of ${dayAppointments.length} today`}
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 10l5 5 9-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <StatCard
          label="Avg. Wait"
          value="12 min"
          trend="below clinic avg"
          icon={<ClockIcon />}
        />
      </div>

      {/* ── Toolbar: Day label + Search ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-body text-[var(--text-secondary)]">{selectedLabel}</p>
          <Badge variant="default">{dayAppointments.length} appointments</Badge>
        </div>
        <div
          className="glass-input flex items-center gap-2 px-3 py-2 w-64"
          style={{ borderRadius: "12px" }}
        >
          <span className="text-[var(--text-muted)]">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patient..."
            className="bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] w-full"
          />
        </div>
      </div>

      {/* ── Patient Queue Table ── */}
      {filteredAppointments.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--glass-border)]">
                <th className="text-left text-overline text-[var(--text-muted)] px-5 py-3 w-28">Time</th>
                <th className="text-left text-overline text-[var(--text-muted)] px-4 py-3">Patient</th>
                <th className="text-left text-overline text-[var(--text-muted)] px-4 py-3 hidden md:table-cell">Chief Complaint</th>
                <th className="text-left text-overline text-[var(--text-muted)] px-4 py-3 hidden lg:table-cell">Type</th>
                <th className="text-left text-overline text-[var(--text-muted)] px-4 py-3 w-36">Status</th>
                <th className="text-right text-overline text-[var(--text-muted)] px-5 py-3 w-36">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map((apt) => {
                const isFinalized = apt.status === "completed";
                const isInExam = apt.status === "in_progress";
                return (
                  <tr
                    key={apt.id}
                    className={`hover-row border-b border-[var(--glass-border)] last:border-0 transition-opacity ${
                      isFinalized ? "opacity-70" : ""
                    }`}
                  >
                    {/* Time */}
                    <td className="px-5 py-4">
                      <span className="font-mono text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap">
                        {apt.time}
                      </span>
                    </td>

                    {/* Patient */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold text-[var(--accent)]"
                          style={{ background: "var(--accent-dim)" }}
                        >
                          {apt.patient.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <span className="text-subhead text-[var(--text-primary)] whitespace-nowrap">{apt.patient}</span>
                      </div>
                    </td>

                    {/* Chief Complaint */}
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className="text-body text-[var(--text-secondary)] line-clamp-1 max-w-[220px]">
                        {apt.reason ?? "—"}
                      </span>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <span className="text-caption text-[var(--text-muted)]">{apt.type}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${isInExam ? "animate-glow" : ""}`}
                          style={{ background: STATUS_DOT_COLOR[apt.status] }}
                        />
                        <Badge variant={STATUS_BADGE_VARIANT[apt.status]}>
                          {isFinalized && <LockIcon />}
                          {STATUS_LABEL[apt.status]}
                        </Badge>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-5 py-4 text-right">
                      <Button
                        variant={isFinalized ? "outline" : "default"}
                        size="sm"
                        asChild
                      >
                        <Link href={`/${tenantId}/encounter/${apt.id}`}>
                          {apt.status === "scheduled" && "Start Exam"}
                          {apt.status === "in_progress" && "Resume"}
                          {apt.status === "completed" && "View Record"}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : dayAppointments.length === 0 ? (
        // No appointments at all
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
      ) : (
        // Appointments exist but search returned no results
        <div className="glass-card flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <SearchIcon />
          </div>
          <p className="text-subhead">No patients match &ldquo;{query}&rdquo;</p>
          <p className="text-caption text-[var(--text-muted)]">Try a different name.</p>
        </div>
      )}
    </div>
  );
}
