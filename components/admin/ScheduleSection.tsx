"use client";

import { useEffect, useMemo, useState } from "react";
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
import { getWeekDays } from "@/lib/scheduleUtils";

type StaffLite = { id: string; firstName: string; lastName: string; role: string; isActive: boolean };

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

export default function ScheduleSection() {
  // --- Task 2a state ---
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [scheduleDays, setScheduleDays] = useState<Array<Omit<WeeklyScheduleDay, "id" | "staffId">>>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [blocks, setBlocks] = useState<BlockedTime[]>([]);
  const [newBlock, setNewBlock] = useState({ start: "", end: "", reason: "", type: "other" as BlockType });

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
      const res = await fetch("/api/staff/");
      if (!res.ok) return;
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
      if (lite[0]) setSelectedStaffId(lite[0].id);
    })();
  }, []);

  // --- load schedule + blocks when selectedStaffId changes ---
  useEffect(() => {
    if (!selectedStaffId) return;
    setScheduleLoading(true);
    (async () => {
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
    })();
    (async () => {
      const today = toYMD(new Date());
      const future = toYMD(addDays(new Date(), 365));
      const res = await fetch(`/api/staff-schedule/${selectedStaffId}/blocked-times/?from_date=${today}&to_date=${future}`);
      if (res.ok) {
        const raw = await res.json();
        setBlocks(raw.map(camelizeBlockedTime));
      }
    })();
  }, [selectedStaffId]);

  // --- Task 2b: shift overview ---
  useEffect(() => {
    (async () => {
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
    })();
  }, [weekStart]);

  // --- Task 2b: attendance ---
  async function loadAttendance() {
    const params = new URLSearchParams({ from_date: attFrom, to_date: attTo });
    if (attStaffFilter) params.set("staff_id", attStaffFilter);
    const res = await fetch(`/api/staff-schedule/attendance/?${params.toString()}`);
    if (res.ok) {
      const raw = await res.json();
      setAttRecords(raw.map(camelizeAttendance));
    }
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
  }

  async function addBlock() {
    if (!selectedStaffId || !newBlock.start || !newBlock.end) return;
    const res = await fetch(`/api/staff-schedule/${selectedStaffId}/blocked-times/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_datetime: new Date(newBlock.start).toISOString(),
        end_datetime: new Date(newBlock.end).toISOString(),
        reason: newBlock.reason || null,
        block_type: newBlock.type,
      }),
    });
    if (res.ok) {
      const raw = await res.json();
      setBlocks(prev => [...prev, camelizeBlockedTime(raw)]);
      setNewBlock({ start: "", end: "", reason: "", type: "other" });
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
        {scheduleLoading ? <p className="text-white/60">Loading…</p> : (
          <div className="flex flex-col gap-2">
            {scheduleDays.map((d, i) => (
              <div key={d.dayOfWeek} className="grid grid-cols-[80px_auto_1fr_1fr] items-center gap-3">
                <label className="text-sm">{DAY_LABELS[d.dayOfWeek]}</label>
                <input
                  type="checkbox"
                  data-testid={`schedule-day-toggle-${d.dayOfWeek}`}
                  checked={d.isActive}
                  aria-label={`${DAY_LABELS[d.dayOfWeek]} active`}
                  onChange={e => setScheduleDays(prev => prev.map((x, ix) => ix === i ? { ...x, isActive: e.target.checked } : x))}
                />
                <input
                  type="time"
                  data-testid={`schedule-day-start-${d.dayOfWeek}`}
                  value={d.startTime}
                  disabled={!d.isActive}
                  onChange={e => setScheduleDays(prev => prev.map((x, ix) => ix === i ? { ...x, startTime: e.target.value } : x))}
                  className="bg-white/10 rounded px-2 py-1"
                />
                <input
                  type="time"
                  data-testid={`schedule-day-end-${d.dayOfWeek}`}
                  value={d.endTime}
                  disabled={!d.isActive}
                  onChange={e => setScheduleDays(prev => prev.map((x, ix) => ix === i ? { ...x, endTime: e.target.value } : x))}
                  className="bg-white/10 rounded px-2 py-1"
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* --- Blocked Times --- */}
      <Card className="glass-card p-4">
        <h2 className="text-lg font-semibold mb-3">Blocked Times</h2>
        <div className="grid grid-cols-[1fr_1fr_1fr_120px_auto] gap-2 mb-3">
          <input type="datetime-local" value={newBlock.start} onChange={e => setNewBlock(b => ({ ...b, start: e.target.value }))} aria-label="Block start" className="bg-white/10 rounded px-2 py-1" />
          <input type="datetime-local" value={newBlock.end} onChange={e => setNewBlock(b => ({ ...b, end: e.target.value }))} aria-label="Block end" className="bg-white/10 rounded px-2 py-1" />
          <input type="text" placeholder="Reason" value={newBlock.reason} onChange={e => setNewBlock(b => ({ ...b, reason: e.target.value }))} className="bg-white/10 rounded px-2 py-1" />
          <select value={newBlock.type} onChange={e => setNewBlock(b => ({ ...b, type: e.target.value as BlockType }))} aria-label="Block type" className="bg-white/10 rounded px-2 py-1">
            <option value="lunch">Lunch</option>
            <option value="holiday">Holiday</option>
            <option value="personal">Personal</option>
            <option value="other">Other</option>
          </select>
          <Button data-testid="blocked-time-add" onClick={addBlock} disabled={!selectedStaffId}>Add</Button>
        </div>
        <ul className="flex flex-col gap-2">
          {blocks.map(b => (
            <li
              key={b.id}
              data-testid={`blocked-time-item-${b.id}`}
              className="flex items-center gap-3 bg-white/5 rounded px-3 py-2"
            >
              <Badge>{b.blockType}</Badge>
              <span className="text-sm text-white/80">{b.startDatetime} → {b.endDatetime}</span>
              <span className="text-sm text-white/60">{b.reason}</span>
              <button
                data-testid={`blocked-time-delete-${b.id}`}
                className="ml-auto text-red-400 text-sm"
                onClick={() => deleteBlock(b.id)}
              >
                Delete
              </button>
            </li>
          ))}
          {blocks.length === 0 && <li className="text-white/50 text-sm">No upcoming blocks</li>}
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
                  <th key={i} className="p-2 text-left">{DAY_LABELS[i]}<br /><span className="text-white/50 text-xs">{d}</span></th>
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
                        ) : <span className="text-white/30">Off</span>}
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
          <input type="date" value={attFrom} onChange={e => setAttFrom(e.target.value)} aria-label="From date" className="bg-white/10 rounded px-2 py-1" />
          <input type="date" value={attTo} onChange={e => setAttTo(e.target.value)} aria-label="To date" className="bg-white/10 rounded px-2 py-1" />
          <select value={attStaffFilter} onChange={e => setAttStaffFilter(e.target.value)} aria-label="Staff filter" className="bg-white/10 rounded px-2 py-1">
            <option value="">All staff</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
          </select>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/70">
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
            {attRecords.length === 0 && <tr><td className="p-2 text-white/50" colSpan={5}>No records</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
