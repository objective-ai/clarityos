"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getWeekDays } from "@/lib/scheduleUtils";
import { clinicToday } from "@/lib/timezone";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface WeekStripProps {
  selectedDate: string;
  countsByDate: Record<string, number>;
  onSelectDay: (date: string) => void;
  onShiftWeek: (direction: -1 | 1) => void;
  clinicTimezone?: string;
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

  return (
    <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-elevated)] px-2 py-1.5">
      {/* Previous week */}
      <button
        onClick={() => onShiftWeek(-1)}
        className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors duration-120"
        aria-label="Previous week"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Day cells */}
      <div className="flex flex-1 gap-0.5 overflow-x-auto scroll-snap-type-x-mandatory">
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
                  : "border border-transparent hover:bg-white/5"
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
        className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors duration-120"
        aria-label="Next week"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
