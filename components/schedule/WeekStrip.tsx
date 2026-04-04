"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { getWeekDays } from "@/lib/scheduleUtils";
import { clinicToday } from "@/lib/timezone";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface WeekStripProps {
  selectedDate: string;
  countsByDate: Record<string, number>;
  onSelectDay: (date: string) => void;
  onShiftWeek: (direction: -1 | 1) => void;
  clinicTimezone?: string;
}

/** Build YYYY-MM-DD from year, month (0-based), day */
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Get the grid cells for a month calendar (Mon-start) */
function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Convert Sunday=0 to Monday-start: Mon=0, Tue=1, ..., Sun=6
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function MiniCalendar({
  selectedDate,
  today,
  onSelectDay,
  onClose,
}: {
  selectedDate: string;
  today: string;
  onSelectDay: (date: string) => void;
  onClose: () => void;
}) {
  const initYear = parseInt(selectedDate.slice(0, 4), 10);
  const initMonth = parseInt(selectedDate.slice(5, 7), 10) - 1;
  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const cells = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };
  const goToday = () => {
    onSelectDay(today);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-[100] w-[260px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] shadow-xl p-3"
    >
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]" aria-label="Previous month">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]" aria-label="Next month">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <span key={d} className="text-center text-[9px] font-medium text-[var(--text-muted)]">
            {d.slice(0, 2)}
          </span>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />;
          const dateStr = toDateStr(viewYear, viewMonth, day);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          return (
            <button
              key={dateStr}
              onClick={() => { onSelectDay(dateStr); onClose(); }}
              className={`
                h-7 w-full rounded text-[11px] font-medium transition-colors
                ${isSelected
                  ? "bg-[var(--accent)] text-white"
                  : isToday
                  ? "border border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                }
              `}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Today shortcut */}
      <button
        onClick={goToday}
        className="mt-2 w-full text-[10px] font-medium text-[var(--accent)] hover:underline"
      >
        Go to today
      </button>
    </div>
  );
}

export function WeekStrip({
  selectedDate,
  countsByDate,
  onSelectDay,
  onShiftWeek,
  clinicTimezone = "America/Los_Angeles",
}: WeekStripProps) {
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const today = useMemo(() => clinicToday(clinicTimezone), [clinicTimezone]);
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <div className="relative flex items-center gap-1 rounded-lg bg-[var(--bg-elevated)] px-2 py-1.5">
      {/* Calendar toggle */}
      <button
        onClick={() => setCalendarOpen(!calendarOpen)}
        className={`shrink-0 p-1.5 rounded-md transition-colors duration-120 ${
          calendarOpen
            ? "text-[var(--accent)] bg-[var(--accent)]/10"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
        }`}
        aria-label="Open calendar"
      >
        <CalendarDays size={16} />
      </button>

      {/* Previous week */}
      <button
        onClick={() => onShiftWeek(-1)}
        className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors duration-120"
        aria-label="Previous week"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Day cells */}
      <div className="flex gap-0.5 overflow-x-auto scroll-snap-type-x-mandatory">
        {weekDays.map((dateStr, i) => {
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          const count = countsByDate[dateStr];
          const dayNum = parseInt(dateStr.slice(8), 10);

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDay(dateStr)}
              className={`
                flex flex-col items-center justify-center min-w-[44px] h-14 px-1.5 rounded-md
                scroll-snap-align-start transition-all duration-120
                ${isSelected
                  ? "border border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border border-transparent hover:bg-[var(--bg-elevated)]"
                }
              `}
            >
              <span
                className={`text-[10px] font-medium leading-none ${
                  isSelected
                    ? "text-[var(--accent)]"
                    : isToday
                    ? "text-[var(--accent)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {isToday ? "Today" : DAY_NAMES[i]}
              </span>
              <span
                className={`text-sm font-semibold leading-tight mt-0.5 ${
                  isSelected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
                }`}
              >
                {dayNum}
              </span>
              <span
                className={`text-[9px] leading-none mt-0.5 font-medium ${
                  isSelected
                    ? "text-[var(--accent)]"
                    : count != null && count > 0
                    ? "text-[var(--text-secondary)]"
                    : "text-[var(--text-muted)]/50"
                }`}
              >
                {count != null ? count : "-"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Next week */}
      <button
        onClick={() => onShiftWeek(1)}
        className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors duration-120"
        aria-label="Next week"
      >
        <ChevronRight size={16} />
      </button>

      {/* Mini calendar dropdown */}
      {calendarOpen && (
        <MiniCalendar
          selectedDate={selectedDate}
          today={today}
          onSelectDay={onSelectDay}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </div>
  );
}
