"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BlockType,
  WeeklyScheduleDay,
  BlockedTime,
  WeeklyAvailabilityResponse,
  AttendanceRecord,
  camelizeSchedule,
  camelizeBlockedTime,
  camelizeAttendance,
} from "@/types/staffSchedule";
import {
  getWeekDays,
  generateTimeSlots,
  calcShiftBar,
  inferRecurGroups as _inferRecurGroups,
  formatBlockDisplay as _formatBlockDisplay,
  generateRepeatDates,
} from "@/lib/scheduleUtils";

type StaffLite = { id: string; firstName: string; lastName: string; role: string; isActive: boolean };

const TIME_SLOTS = generateTimeSlots();

function TimeDropdown({
  value,
  onChange,
  className = "",
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded px-2 py-1 text-[var(--text-primary)] text-sm ${className}`}
    >
      {TIME_SLOTS.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4BF] focus-visible:ring-offset-1 ${checked ? "bg-[#2DD4BF]" : "bg-[var(--glass-border)]"}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

const DAY_PILL_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function DayPills({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (days: number[]) => void;
}) {
  function toggle(i: number) {
    onChange(
      selected.includes(i) ? selected.filter(d => d !== i) : [...selected, i]
    );
  }
  return (
    <div className="flex gap-1">
      {DAY_PILL_LABELS.map((label, i) => (
        <button
          key={i}
          type="button"
          onClick={() => toggle(i)}
          className={`w-7 h-7 rounded-full text-xs font-semibold border transition-colors ${
            selected.includes(i)
              ? "bg-[#2DD4BF] text-black border-[#2DD4BF]"
              : "border-[var(--glass-border)] text-[var(--text-muted)] hover:border-[#2DD4BF]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DEFAULT_SCHEDULE: Omit<WeeklyScheduleDay, "id" | "staffId">[] = [
  { dayOfWeek: 0, startTime: "09:00", endTime: "17:00", isActive: true },
  { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: true },
  { dayOfWeek: 2, startTime: "09:00", endTime: "17:00", isActive: true },
  { dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true },
  { dayOfWeek: 4, startTime: "09:00", endTime: "17:00", isActive: true },
  { dayOfWeek: 5, startTime: "09:00", endTime: "17:00", isActive: false },
  { dayOfWeek: 6, startTime: "09:00", endTime: "17:00", isActive: false },
];

function toYMD(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

type NewBlockState = {
  type: BlockType;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  repeatWeekdays: number[];
  dateFrom: string;
  dateTo: string;
  note: string;
};

function makeDefaultBlock(): NewBlockState {
  const today = toYMD(new Date());
  return {
    type: "lunch",
    date: today,
    startTime: "12:00",
    endTime: "13:00",
    reason: "",
    repeatWeekdays: [],
    dateFrom: today,
    dateTo: toYMD(addDays(new Date(), 1)),
    note: "",
  };
}

export default function ScheduleSection() {
  // --- Task 2a state ---
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [scheduleDays, setScheduleDays] = useState<Array<Omit<WeeklyScheduleDay, "id" | "staffId">>>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [blocks, setBlocks] = useState<BlockedTime[]>([]);

  const [newBlock, setNewBlock] = useState<NewBlockState>(makeDefaultBlock);

  // --- Task 2b state ---
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [availability, setAvailability] = useState<WeeklyAvailabilityResponse | null>(null);

  const [attFrom, setAttFrom] = useState(() => toYMD(addDays(new Date(), -14)));
  const [attTo, setAttTo] = useState(() => toYMD(new Date()));
  const [attStaffFilter, setAttStaffFilter] = useState<string>("");
  const [attRecords, setAttRecords] = useState<AttendanceRecord[]>([]);

  // --- fetch staff list on mount ---
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/staff/");
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          setStaffError(`HTTP ${res.status}: ${body.slice(0, 120)}`);
          return;
        }
        const raw = await res.json();
        const lite: StaffLite[] = raw
          .filter((s: any) => s.is_active ?? s.isActive)
          .map((s: any) => ({
            id: s.id,
            firstName: s.first_name ?? s.firstName,
            lastName: s.last_name ?? s.lastName,
            role: s.role,
            isActive: s.is_active ?? s.isActive,
          }));
        setStaff(lite);
        if (lite.length === 0) setStaffError("No active staff found.");
        if (lite[0]) setSelectedStaffId(lite[0].id);
      } catch (e) {
        setStaffError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }, []);

  // --- load schedule + blocks when selectedStaffId changes ---
  useEffect(() => {
    if (!selectedStaffId) return;
    setScheduleLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/staff-schedule/${selectedStaffId}/schedule/`);
        if (!res.ok) { setScheduleLoading(false); return; }
        const raw = await res.json();
        const days: WeeklyScheduleDay[] = raw.map(camelizeSchedule);
        if (days.length === 0) {
          setScheduleDays(DEFAULT_SCHEDULE);
        } else {
          const byDow = new Map(days.map(d => [d.dayOfWeek, d]));
          setScheduleDays(Array.from({ length: 7 }, (_, dow) => {
            const existing = byDow.get(dow);
            return existing
              ? { dayOfWeek: dow, startTime: existing.startTime, endTime: existing.endTime, isActive: existing.isActive }
              : { dayOfWeek: dow, startTime: "09:00", endTime: "17:00", isActive: false };
          }));
        }
        setScheduleLoading(false);
      } catch { setScheduleLoading(false); }
    })();
    (async () => {
      try {
        const today = toYMD(new Date());
        const future = toYMD(addDays(new Date(), 365));
        const res = await fetch(`/api/staff-schedule/${selectedStaffId}/blocked-times/?from_date=${today}&to_date=${future}`);
        if (res.ok) {
          const raw = await res.json();
          setBlocks(raw.map(camelizeBlockedTime));
        }
      } catch { /* non-critical */ }
    })();
  }, [selectedStaffId]);

  // --- Task 2b: shift overview ---
  const fetchAvailability = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff-schedule/availability/?week_start=${toYMD(weekStart)}`);
      if (res.ok) {
        const raw = await res.json();
        setAvailability({
          weekStart: raw.week_start,
          staff: raw.staff.map((s: any) => ({
            staffId: s.staff_id,
            firstName: s.first_name,
            lastName: s.last_name,
            role: s.role,
            schedule: s.schedule.map(camelizeSchedule),
          })),
        });
      }
    } catch { /* non-critical */ }
  }, [weekStart]);

  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  // --- Task 2b: attendance ---
  async function loadAttendance() {
    try {
      const params = new URLSearchParams({ from_date: attFrom, to_date: attTo });
      if (attStaffFilter) params.set("staff_id", attStaffFilter);
      const res = await fetch(`/api/staff-schedule/attendance/?${params.toString()}`);
      if (res.ok) {
        const raw = await res.json();
        setAttRecords(raw.map(camelizeAttendance));
      }
    } catch { /* non-critical */ }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAttendance(); }, [attFrom, attTo, attStaffFilter]);

  function exportCsv() {
    const params = new URLSearchParams({ from_date: attFrom, to_date: attTo });
    window.location.href = `/api/staff-schedule/attendance/export/?${params.toString()}`;
  }

  const weekDates = useMemo(() => getWeekDays(toYMD(weekStart)), [weekStart]);

  async function saveSchedule() {
    if (!selectedStaffId) return;
    setScheduleSaving(true);
    const res = await fetch(`/api/staff-schedule/${selectedStaffId}/schedule/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days: scheduleDays.map(d => ({
          day_of_week: d.dayOfWeek,
          start_time: d.startTime,
          end_time: d.endTime,
          is_active: d.isActive,
        })),
      }),
    });
    setScheduleSaving(false);
    if (!res.ok) alert("Failed to save schedule");
    else fetchAvailability();
  }

  async function addBlock() {
    if (!selectedStaffId) return;

    let entries: Array<{ start: string; end: string }> = [];

    if (newBlock.type === "holiday") {
      if (!newBlock.dateFrom || !newBlock.dateTo) return;
      entries = [{
        start: `${newBlock.dateFrom}T00:00:00`,
        end: `${newBlock.dateTo}T23:59:59`,
      }];
    } else if (newBlock.type === "lunch" && newBlock.repeatWeekdays.length > 0) {
      if (!newBlock.date || !newBlock.startTime || !newBlock.endTime) return;
      const dates = generateRepeatDates(newBlock.date, newBlock.repeatWeekdays, 52);
      entries = dates.map(d => ({
        start: `${d}T${newBlock.startTime}:00`,
        end: `${d}T${newBlock.endTime}:00`,
      }));
    } else {
      if (!newBlock.date || !newBlock.startTime || !newBlock.endTime) return;
      entries = [{
        start: `${newBlock.date}T${newBlock.startTime}:00`,
        end: `${newBlock.date}T${newBlock.endTime}:00`,
      }];
    }

    const newEntries: BlockedTime[] = [];
    for (const { start, end } of entries) {
      try {
        const res = await fetch(`/api/staff-schedule/${selectedStaffId}/blocked-times/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_datetime: start,
            end_datetime: end,
            reason: newBlock.type === "holiday" ? (newBlock.note || null) : (newBlock.reason || null),
            block_type: newBlock.type,
          }),
        });
        if (res.ok) newEntries.push(camelizeBlockedTime(await res.json()));
      } catch { break; }
    }

    if (newEntries.length > 0) {
      setBlocks(prev => [...prev, ...newEntries]);
      setNewBlock(makeDefaultBlock());
    }
  }

  async function deleteBlock(blockId: string) {
    if (!selectedStaffId) return;
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    await fetch(`/api/staff-schedule/${selectedStaffId}/blocked-times/${blockId}/`, { method: "DELETE" });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* --- Provider selector --- */}
      <Card className="glass-card p-4">
        <h2 className="text-lg font-semibold mb-3">Provider</h2>
        {staffError && <p className="text-sm text-red-400 mb-2">{staffError}</p>}
        <div className="flex flex-wrap gap-2">
          {staff.map(s => (
            <button
              key={s.id}
              data-testid={`schedule-provider-pill-${s.id}`}
              onClick={() => setSelectedStaffId(s.id)}
              className={`px-3 py-1.5 rounded-full text-sm border ${selectedStaffId === s.id ? "bg-[#2DD4BF] text-black border-[#2DD4BF]" : "border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg)]"}`}
            >
              {s.firstName} {s.lastName}
            </button>
          ))}
        </div>
      </Card>

      {/* --- Weekly Hours editor --- */}
      <Card className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Weekly Hours</h2>
          <Button data-testid="schedule-save-weekly" onClick={saveSchedule} disabled={scheduleSaving || !selectedStaffId}>
            {scheduleSaving ? "Saving…" : "Save"}
          </Button>
        </div>
        {scheduleLoading ? <p className="text-[var(--text-muted)]">Loading…</p> : (
          <div className="flex flex-col gap-2">
            {scheduleDays.map((d, i) => {
              const bar = d.isActive ? calcShiftBar(d.startTime, d.endTime) : null;
              return (
                <div key={d.dayOfWeek} className="flex items-center gap-3 py-1">
                  <ToggleSwitch
                    checked={d.isActive}
                    aria-label={`${DAY_LABELS[d.dayOfWeek]} active`}
                    data-testid={`schedule-day-toggle-${d.dayOfWeek}`}
                    onChange={active =>
                      setScheduleDays(prev =>
                        prev.map((x, ix) => (ix === i ? { ...x, isActive: active } : x))
                      )
                    }
                  />
                  <span
                    className={`text-sm w-8 shrink-0 ${d.isActive ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-muted)]"}`}
                  >
                    {DAY_LABELS[d.dayOfWeek]}
                  </span>
                  {d.isActive ? (
                    <>
                      <TimeDropdown
                        value={d.startTime}
                        aria-label={`${DAY_LABELS[d.dayOfWeek]} start`}
                        data-testid={`schedule-day-start-${d.dayOfWeek}`}
                        onChange={v =>
                          setScheduleDays(prev =>
                            prev.map((x, ix) => (ix === i ? { ...x, startTime: v } : x))
                          )
                        }
                      />
                      <span className="text-[var(--text-muted)] text-xs">–</span>
                      <TimeDropdown
                        value={d.endTime}
                        aria-label={`${DAY_LABELS[d.dayOfWeek]} end`}
                        data-testid={`schedule-day-end-${d.dayOfWeek}`}
                        onChange={v =>
                          setScheduleDays(prev =>
                            prev.map((x, ix) => (ix === i ? { ...x, endTime: v } : x))
                          )
                        }
                      />
                      <div className="flex-1 h-2 bg-[var(--glass-bg)] rounded-full overflow-hidden min-w-[60px]">
                        <div
                          className="h-full rounded-full bg-[#2DD4BF] opacity-70"
                          style={{ marginLeft: bar!.left, width: bar!.width }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">Off</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* --- Blocked Times --- */}
      <Card className="glass-card p-4">
        <h2 className="text-lg font-semibold mb-3">Blocked Times</h2>
        {/* Type selector — always visible */}
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Type</label>
            <select
              value={newBlock.type}
              aria-label="Block type"
              onChange={e => {
                const type = e.target.value as BlockType;
                const today = toYMD(new Date());
                if (type === "lunch") {
                  setNewBlock({ type, date: today, startTime: "12:00", endTime: "13:00", reason: "", repeatWeekdays: [], dateFrom: today, dateTo: toYMD(addDays(new Date(), 1)), note: "" });
                } else {
                  setNewBlock({ type, date: today, startTime: "", endTime: "", reason: "", repeatWeekdays: [], dateFrom: today, dateTo: toYMD(addDays(new Date(), 1)), note: "" });
                }
              }}
              className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded px-2 py-1 text-[var(--text-primary)] text-sm"
            >
              <option value="lunch">Lunch</option>
              <option value="holiday">Holiday / Vacation</option>
              <option value="personal">Personal</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Lunch + Personal/Other: date + time range */}
          {newBlock.type !== "holiday" && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  aria-label="Block date"
                  value={newBlock.date}
                  onChange={e => setNewBlock(b => ({ ...b, date: e.target.value }))}
                  className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded px-2 py-1 text-[var(--text-primary)] text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Start</label>
                <TimeDropdown
                  value={newBlock.startTime}
                  aria-label="Block start"
                  onChange={v => setNewBlock(b => ({ ...b, startTime: v }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">End</label>
                <TimeDropdown
                  value={newBlock.endTime}
                  aria-label="Block end"
                  onChange={v => setNewBlock(b => ({ ...b, endTime: v }))}
                />
              </div>
              {newBlock.type !== "lunch" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Reason</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={newBlock.reason}
                    onChange={e => setNewBlock(b => ({ ...b, reason: e.target.value }))}
                    className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded px-2 py-1 text-[var(--text-primary)] text-sm w-36"
                  />
                </div>
              )}
              {newBlock.type === "lunch" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Repeat on</label>
                  <DayPills
                    selected={newBlock.repeatWeekdays}
                    onChange={days => setNewBlock(b => ({ ...b, repeatWeekdays: days }))}
                  />
                </div>
              )}
            </>
          )}

          {/* Holiday: date range + note */}
          {newBlock.type === "holiday" && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">From</label>
                <input
                  type="date"
                  aria-label="Holiday from date"
                  value={newBlock.dateFrom}
                  onChange={e => setNewBlock(b => ({ ...b, dateFrom: e.target.value }))}
                  className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded px-2 py-1 text-[var(--text-primary)] text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">To</label>
                <input
                  type="date"
                  aria-label="Holiday to date"
                  value={newBlock.dateTo}
                  onChange={e => setNewBlock(b => ({ ...b, dateTo: e.target.value }))}
                  className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded px-2 py-1 text-[var(--text-primary)] text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Note</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={newBlock.note}
                  onChange={e => setNewBlock(b => ({ ...b, note: e.target.value }))}
                  className="bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded px-2 py-1 text-[var(--text-primary)] text-sm w-36"
                />
              </div>
            </>
          )}

          <Button
            data-testid="blocked-time-add"
            onClick={addBlock}
            disabled={!selectedStaffId}
            className="self-end"
          >
            Add
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {blocks.map(b => (
            <li
              key={b.id}
              data-testid={`blocked-time-item-${b.id}`}
              className="flex items-center gap-3 bg-[var(--glass-bg)] rounded px-3 py-2"
            >
              <Badge>{b.blockType}</Badge>
              <span className="text-sm text-[var(--text-primary)]">{b.startDatetime} → {b.endDatetime}</span>
              <span className="text-sm text-[var(--text-secondary)]">{b.reason}</span>
              <button
                data-testid={`blocked-time-delete-${b.id}`}
                className="ml-auto text-red-400 text-sm"
                onClick={() => deleteBlock(b.id)}
              >
                Delete
              </button>
            </li>
          ))}
          {blocks.length === 0 && <li className="text-[var(--text-muted)] text-sm">No upcoming blocks</li>}
        </ul>
      </Card>

      {/* --- Shift Overview --- */}
      <Card className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Shift Overview</h2>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setWeekStart(prev => addDays(prev, -7))}>Prev</Button>
            <span className="self-center text-sm">Week of {toYMD(weekStart)}</span>
            <Button variant="ghost" onClick={() => setWeekStart(prev => addDays(prev, 7))}>Next</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2">Staff</th>
                {weekDates.map((d, i) => (
                  <th key={i} className="p-2 text-left">{DAY_LABELS[i]}<br /><span className="text-[var(--text-muted)] text-xs">{d}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {availability?.staff.map(s => (
                <tr key={s.staffId}>
                  <td className="p-2 font-medium">{s.firstName} {s.lastName}</td>
                  {[0,1,2,3,4,5,6].map(dow => {
                    const day = s.schedule.find(x => x.dayOfWeek === dow && x.isActive);
                    return (
                      <td
                        key={dow}
                        data-testid={`shift-cell-${s.staffId}-${dow}`}
                        className="p-2"
                      >
                        {day ? (
                          <span className="inline-block rounded-full px-2 py-0.5 text-xs text-black" style={{ background: "#2DD4BF" }}>
                            {day.startTime}–{day.endTime}
                          </span>
                        ) : <span className="text-[var(--text-muted)]">Off</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* --- Attendance Log + CSV --- */}
      <Card className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Attendance</h2>
          <Button data-testid="attendance-export-csv" onClick={exportCsv}>Export CSV</Button>
        </div>
        <div className="flex gap-2 mb-3">
          <input type="date" value={attFrom} onChange={e => setAttFrom(e.target.value)} aria-label="From date" className="bg-[var(--glass-bg)] rounded px-2 py-1" />
          <input type="date" value={attTo} onChange={e => setAttTo(e.target.value)} aria-label="To date" className="bg-[var(--glass-bg)] rounded px-2 py-1" />
          <select value={attStaffFilter} onChange={e => setAttStaffFilter(e.target.value)} aria-label="Staff filter" className="bg-[var(--glass-bg)] rounded px-2 py-1">
            <option value="">All staff</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
          </select>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--text-secondary)]">
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Clock in</th>
              <th className="text-left p-2">Clock out</th>
              <th className="text-left p-2">Hours</th>
            </tr>
          </thead>
          <tbody>
            {attRecords.map(r => (
              <tr key={r.id} data-testid={`attendance-row-${r.id}`}>
                <td className="p-2">{r.firstName} {r.lastName}</td>
                <td className="p-2">{r.date}</td>
                <td className="p-2">{new Date(r.clockInAt).toLocaleTimeString()}</td>
                <td className="p-2">{r.clockOutAt ? new Date(r.clockOutAt).toLocaleTimeString() : "—"}</td>
                <td className="p-2">{r.totalMinutes == null ? "—" : (r.totalMinutes / 60).toFixed(2)}</td>
              </tr>
            ))}
            {attRecords.length === 0 && <tr><td className="p-2 text-[var(--text-muted)]" colSpan={5}>No records</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
