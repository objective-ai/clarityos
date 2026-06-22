"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  formatBlockDisplay,
  generateRepeatDates,
  formatIsoTimeShort,
  formatTimeShort,
  groupBlocksForDisplay,
  blockForDate,
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

// Local YYYY-MM-DD — toISOString returns UTC, which rolls over a day late
// for negative offsets in the evening (and early for positive offsets in
// the morning). Always extract the calendar date in the user's local zone.
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

/**
 * Build an ISO 8601 datetime string with the browser's local UTC offset.
 * Postgres TIMESTAMPTZ requires an explicit offset; sending a naked datetime
 * causes the column to be interpreted as UTC and shifts the displayed time
 * by the user's offset.
 */
function localIso(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const local = new Date(y, m - 1, d, h, min, 0);
  const offsetMin = -local.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateStr}T${pad(h)}:${pad(min)}:00${sign}${hh}:${mm}`;
}

function formatRoleLabel(role: string): string {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = sameMonth
    ? end.toLocaleDateString("en-US", { day: "numeric" })
    : end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const yr = sameYear ? start.getFullYear() : `${start.getFullYear()}–${end.getFullYear()}`;
  return `${startStr} – ${endStr}, ${yr}`;
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3 px-1">
      <h2 className="text-xs font-semibold tracking-[0.14em] uppercase text-[var(--text-secondary)]">
        {title}
      </h2>
      <span className="text-xs text-[var(--text-muted)]">{hint}</span>
    </div>
  );
}

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
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [scheduleDays, setScheduleDays] = useState<Array<Omit<WeeklyScheduleDay, "id" | "staffId">>>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [blocks, setBlocks] = useState<BlockedTime[]>([]);
  const [blockBusy, setBlockBusy] = useState<"adding" | "deleting" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; groupIds: string[] } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [newBlock, setNewBlock] = useState<NewBlockState>(makeDefaultBlock);

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

  const todayYMD = useMemo(() => toYMD(new Date()), []);

  const selectedStaff = useMemo(
    () => staff.find(s => s.id === selectedStaffId) ?? null,
    [staff, selectedStaffId]
  );

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

  // --- shift overview (now includes blocks per staff) ---
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
            blocks: (s.blocks ?? []).map(camelizeBlockedTime),
          })),
        });
      }
    } catch { /* non-critical */ }
  }, [weekStart]);

  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  // --- attendance ---
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

  // Group blocks by weekday + time slot. A Tuesday-12pm-1pm lunch and a
  // Thursday-12pm-1pm lunch are SEPARATE groups so the user can manage them
  // independently. Holidays remain one row each (keyed off id).
  const blockGroups = useMemo(() => groupBlocksForDisplay(blocks), [blocks]);

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
    if (!selectedStaffId || blockBusy) return;

    let entries: Array<{ start: string; end: string }> = [];

    if (newBlock.type === "holiday") {
      if (!newBlock.dateFrom || !newBlock.dateTo) return;
      entries = [{
        start: localIso(newBlock.dateFrom, "00:00"),
        end: localIso(newBlock.dateTo, "23:59"),
      }];
    } else if (newBlock.type === "lunch" && newBlock.repeatWeekdays.length > 0) {
      if (!newBlock.date || !newBlock.startTime || !newBlock.endTime) return;
      const dates = generateRepeatDates(newBlock.date, newBlock.repeatWeekdays, 52);
      entries = dates.map(d => ({
        start: localIso(d, newBlock.startTime),
        end: localIso(d, newBlock.endTime),
      }));
    } else {
      if (!newBlock.date || !newBlock.startTime || !newBlock.endTime) return;
      entries = [{
        start: localIso(newBlock.date, newBlock.startTime),
        end: localIso(newBlock.date, newBlock.endTime),
      }];
    }

    setBlockBusy("adding");
    try {
      const results = await Promise.all(
        entries.map(({ start, end }) =>
          fetch(`/api/staff-schedule/${selectedStaffId}/blocked-times/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              start_datetime: start,
              end_datetime: end,
              reason: newBlock.type === "holiday" ? (newBlock.note || null) : (newBlock.reason || null),
              block_type: newBlock.type,
            }),
          })
            .then(async r => (r.ok ? camelizeBlockedTime(await r.json()) : null))
            .catch(() => null)
        )
      );
      const newEntries = results.filter((b): b is BlockedTime => b !== null);
      if (newEntries.length > 0) {
        setBlocks(prev => [...prev, ...newEntries]);
        setNewBlock(makeDefaultBlock());
        fetchAvailability();
      }
    } finally {
      setBlockBusy(null);
    }
  }

  async function deleteBlock(blockId: string) {
    if (!selectedStaffId) return;
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    await fetch(`/api/staff-schedule/${selectedStaffId}/blocked-times/${blockId}/`, { method: "DELETE" });
    fetchAvailability();
  }

  async function deleteSeries(groupIds: string[]) {
    if (!selectedStaffId || blockBusy) return;
    setDeleteTarget(null);
    setBlockBusy("deleting");
    setBlocks(prev => prev.filter(b => !groupIds.includes(b.id)));
    try {
      await Promise.all(
        groupIds.map(id =>
          fetch(`/api/staff-schedule/${selectedStaffId}/blocked-times/${id}/`, { method: "DELETE" })
        )
      );
      fetchAvailability();
    } finally {
      setBlockBusy(null);
    }
  }

  function toggleGroupExpand(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* SECTION 1 — Per-provider settings */}
      <section>
        <SectionHeader title="Per-provider settings" hint="Edit one staff member's schedule" />

        <Card className="glass-card p-5 border-[#2DD4BF]/20 bg-[#2DD4BF]/[0.025]">
          <div className="flex items-start justify-between gap-4 pb-4 mb-4 border-b border-white/[0.06] flex-wrap">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                {selectedStaff
                  ? <>Schedule for <span className="text-[#2DD4BF]">{selectedStaff.firstName} {selectedStaff.lastName}</span></>
                  : "Select a staff member"}
              </h3>
              {selectedStaff && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {formatRoleLabel(selectedStaff.role)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {staff.map(s => (
                <button
                  key={s.id}
                  data-testid={`schedule-provider-pill-${s.id}`}
                  onClick={() => setSelectedStaffId(s.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    selectedStaffId === s.id
                      ? "bg-[#2DD4BF] text-black border-[#2DD4BF]"
                      : "border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg)]"
                  }`}
                >
                  {s.firstName} {s.lastName}
                </button>
              ))}
            </div>
          </div>
          {staffError && <p className="text-sm text-red-400 mb-3">{staffError}</p>}

          {/* Sub-section: Weekly Hours */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Weekly Hours
              </h4>
              <Button
                size="sm"
                data-testid="schedule-save-weekly"
                onClick={saveSchedule}
                disabled={scheduleSaving || !selectedStaffId}
              >
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
          </div>

          {/* Sub-section: Blocked Times */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-3">
              Blocked Times
            </h4>

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
                disabled={!selectedStaffId || blockBusy !== null}
                className="self-end"
              >
                {blockBusy === "adding" ? "Adding…" : "Add"}
              </Button>
            </div>

            {/* Delete-series confirmation */}
            {deleteTarget && (
              <div className="mb-3 glass-card border border-[var(--glass-border)] px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-[220px]">
                  <span className="w-1.5 h-9 rounded-full bg-red-500/60 shrink-0" aria-hidden />
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">Remove this recurring block?</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Choose to remove just this date or the entire series.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { deleteBlock(deleteTarget.id); setDeleteTarget(null); }}
                  >
                    Just this one
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={blockBusy !== null}
                    onClick={() => deleteSeries(deleteTarget.groupIds)}
                  >
                    {blockBusy === "deleting" ? "Deleting…" : "Delete series"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Grouped block list — one row per (type, weekday, time) group.
                Tuesday-12pm-1pm lunch and Thursday-12pm-1pm lunch are now
                independent rows. Single occurrences and holidays render as
                their own row. */}
            <ul className="flex flex-col gap-2">
              {blockGroups.map(group => {
                const isRecurring = group.members.length >= 2;
                const isExpanded = expandedGroups.has(group.key);
                const sample = group.members[0];
                const badgeClass =
                  group.blockType === "lunch"
                    ? "bg-[#2DD4BF]/15 text-[#2DD4BF] border border-[#2DD4BF]/30"
                    : group.blockType === "holiday"
                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                    : group.blockType === "personal"
                    ? "bg-violet-500/15 text-violet-400 border border-violet-500/30"
                    : "bg-[var(--glass-bg)] text-[var(--text-muted)] border border-[var(--glass-border)]";
                const groupIds = group.members.map(m => m.id);

                return (
                  <li
                    key={group.key}
                    data-testid={isRecurring ? `blocked-time-group-${group.key}` : `blocked-time-item-${sample.id}`}
                    className="flex flex-col gap-1 bg-[var(--glass-bg)] rounded px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                        {group.blockType}
                      </span>
                      <span className="text-sm text-[var(--text-primary)]">
                        {isRecurring
                          ? `${DAY_LABELS[group.weekday]} · ${formatTimeShort(group.startTime)} – ${formatTimeShort(group.endTime)}`
                          : formatBlockDisplay(sample.startDatetime, sample.endDatetime, sample.blockType)}
                      </span>
                      {isRecurring && (
                        <span className="text-[10px] bg-[#2DD4BF]/10 text-[#2DD4BF] rounded-full px-2 py-0.5">
                          recurring · {group.members.length} dates
                        </span>
                      )}
                      {sample.reason && !isRecurring && (
                        <span className="text-xs text-[var(--text-muted)]">{sample.reason}</span>
                      )}
                      {isRecurring && (
                        <button
                          type="button"
                          onClick={() => toggleGroupExpand(group.key)}
                          className="text-xs text-[#2DD4BF] hover:underline"
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? "▾ Hide dates" : "▸ Show dates"}
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid={
                          isRecurring
                            ? `blocked-time-delete-series-${group.key}`
                            : `blocked-time-delete-${sample.id}`
                        }
                        className="ml-auto text-red-400 text-xs hover:text-red-300"
                        onClick={() => {
                          if (isRecurring) {
                            setDeleteTarget({ id: sample.id, groupIds });
                          } else {
                            deleteBlock(sample.id);
                          }
                        }}
                      >
                        {isRecurring ? "Delete series" : "Delete"}
                      </button>
                    </div>

                    {isRecurring && isExpanded && (
                      <ul className="ml-4 pl-3 border-l border-[#2DD4BF]/20 mt-1 flex flex-col gap-0.5">
                        {group.members.map(m => (
                          <li
                            key={m.id}
                            data-testid={`blocked-time-item-${m.id}`}
                            className="flex items-center gap-3 text-xs text-[var(--text-secondary)] py-1"
                          >
                            <span>{formatBlockDisplay(m.startDatetime, m.endDatetime, m.blockType)}</span>
                            <button
                              type="button"
                              data-testid={`blocked-time-delete-${m.id}`}
                              className="text-red-400 hover:text-red-300"
                              onClick={() => deleteBlock(m.id)}
                            >
                              remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
              {blockGroups.length === 0 && (
                <li className="text-[var(--text-muted)] text-sm py-1">No upcoming blocks</li>
              )}
            </ul>
          </div>
        </Card>
      </section>

      {/* SECTION 2 — Clinic-wide */}
      <section>
        <SectionHeader title="Clinic-wide" hint="All staff combined" />

        {/* Shift Overview */}
        <Card className="glass-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-base font-semibold">Shift Overview</h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous week"
                onClick={() => setWeekStart(prev => addDays(prev, -7))}
                className="w-7 h-7 inline-flex items-center justify-center rounded border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]"
              >
                ‹
              </button>
              <span className="text-sm text-[var(--text-primary)] px-3 min-w-[160px] text-center">
                {formatWeekRange(weekStart)}
              </span>
              <button
                type="button"
                aria-label="Next week"
                onClick={() => setWeekStart(prev => addDays(prev, 7))}
                className="w-7 h-7 inline-flex items-center justify-center rounded border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const day = d.getDay();
                  const diff = day === 0 ? -6 : 1 - day;
                  d.setDate(d.getDate() + diff);
                  d.setHours(0, 0, 0, 0);
                  setWeekStart(d);
                }}
                className="text-xs text-[#2DD4BF] hover:underline pl-2 ml-1 border-l border-[var(--glass-border)]"
              >
                Today
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 align-top text-xs uppercase tracking-wide text-[var(--text-muted)] font-medium">
                    Staff
                  </th>
                  {weekDates.map((d, i) => {
                    const isToday = d === todayYMD;
                    return (
                      <th
                        key={i}
                        className={`p-2 text-left align-top text-xs font-medium ${
                          isToday
                            ? "bg-[#2DD4BF]/[0.06] border-x border-t border-[#2DD4BF]/35 text-[#2DD4BF]"
                            : "text-[var(--text-muted)]"
                        }`}
                      >
                        <div className={isToday ? "font-bold" : ""}>{DAY_LABELS[i]}</div>
                        <div className={`text-[10px] font-normal ${isToday ? "text-[#2DD4BF]/80" : "text-[var(--text-muted)]/60"}`}>
                          {new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
                        {isToday && (
                          <div className="text-[9px] tracking-[0.1em] text-[#2DD4BF] font-semibold mt-0.5">
                            TODAY
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {availability?.staff.map((s, rowIdx) => {
                  const isLastRow = rowIdx === (availability.staff.length - 1);
                  return (
                    <tr key={s.staffId}>
                      <td className="p-2 align-top font-medium text-[var(--text-primary)]">
                        {s.firstName} {s.lastName}
                      </td>
                      {[0, 1, 2, 3, 4, 5, 6].map(dow => {
                        const dateStr = weekDates[dow];
                        const isToday = dateStr === todayYMD;
                        const day = s.schedule.find(x => x.dayOfWeek === dow && x.isActive);
                        const block = blockForDate(s.blocks, dateStr);
                        const todayBorder = isToday
                          ? `bg-[#2DD4BF]/[0.06] border-x border-[#2DD4BF]/35 ${isLastRow ? "border-b" : ""}`
                          : "";

                        return (
                          <td
                            key={dow}
                            data-testid={`shift-cell-${s.staffId}-${dow}`}
                            className={`p-2 align-top ${todayBorder}`}
                          >
                            {day ? (
                              <div className="flex flex-col gap-1 items-start">
                                <span
                                  className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-black"
                                  style={{ background: "#2DD4BF" }}
                                >
                                  {day.startTime}–{day.endTime}
                                </span>
                                {block && (
                                  <span
                                    className={`text-[10px] flex items-center gap-1 ${
                                      block.blockType === "lunch"
                                        ? "text-[var(--text-muted)]"
                                        : "text-red-400/80"
                                    }`}
                                  >
                                    <span
                                      className="w-1 h-1 rounded-full"
                                      style={{
                                        background: block.blockType === "lunch" ? "rgba(45,212,191,0.6)" : "rgba(239,68,68,0.6)",
                                      }}
                                    />
                                    {formatIsoTimeShort(block.startDatetime)}–{formatIsoTimeShort(block.endDatetime)} {block.blockType}
                                  </span>
                                )}
                              </div>
                            ) : block ? (
                              // Off-day with a block — surface it so admins can spot
                              // misconfigured lunches/holidays scheduled when staff isn't working.
                              <div className="flex flex-col gap-1 items-start">
                                <span className="text-[var(--text-muted)] text-xs">Off</span>
                                <span
                                  className="text-[10px] flex items-center gap-1 text-amber-500/80"
                                  title="Block scheduled on a non-working day"
                                >
                                  <span
                                    className="w-1 h-1 rounded-full"
                                    style={{ background: "rgba(245,158,11,0.7)" }}
                                  />
                                  {formatIsoTimeShort(block.startDatetime)}–{formatIsoTimeShort(block.endDatetime)} {block.blockType}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[var(--text-muted)] text-xs">Off</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Attendance */}
        <Card className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Attendance</h3>
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
      </section>
    </div>
  );
}
