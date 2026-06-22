export type BlockType = "lunch" | "holiday" | "personal" | "other";

export interface WeeklyScheduleDay {
  id: string;
  staffId: string;
  dayOfWeek: number; // 0=Mon..6=Sun
  startTime: string; // "HH:MM"
  endTime: string;
  isActive: boolean;
}

export interface BlockedTime {
  id: string;
  staffId: string;
  startDatetime: string; // ISO 8601
  endDatetime: string;
  reason: string | null;
  blockType: BlockType;
  createdAt: string;
}

export interface StaffAvailabilityEntry {
  staffId: string;
  firstName: string;
  lastName: string;
  role: string;
  schedule: WeeklyScheduleDay[];
  blocks: BlockedTime[];
}

export interface WeeklyAvailabilityResponse {
  weekStart: string;
  staff: StaffAvailabilityEntry[];
}

export interface ClockStatus {
  clockedIn: boolean;
  clockInAt: string | null;
}

export interface AttendanceRecord {
  id: string;
  staffId: string;
  firstName: string;
  lastName: string;
  date: string; // YYYY-MM-DD
  clockInAt: string;
  clockOutAt: string | null;
  totalMinutes: number | null;
}

export interface AttendanceSummary {
  staffId: string;
  fullName: string;
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
  records: AttendanceRecord[];
}

// --- snake_case → camelCase transforms (explicit, not generic) ---
// Explicit transforms per MEMORY.md feedback_camelizekeys_nested rule —
// generic recursive camelize breaks nested JSONB domain keys.

type RawSchedule = {
  id: string;
  staff_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export function camelizeSchedule(r: RawSchedule): WeeklyScheduleDay {
  return {
    id: r.id,
    staffId: r.staff_id,
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    endTime: r.end_time,
    isActive: r.is_active,
  };
}

type RawBlockedTime = {
  id: string;
  staff_id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
  block_type: BlockType;
  created_at: string;
};

export function camelizeBlockedTime(r: RawBlockedTime): BlockedTime {
  return {
    id: r.id,
    staffId: r.staff_id,
    startDatetime: r.start_datetime,
    endDatetime: r.end_datetime,
    reason: r.reason,
    blockType: r.block_type,
    createdAt: r.created_at,
  };
}

type RawAttendance = {
  id: string;
  staff_id: string;
  first_name: string;
  last_name: string;
  date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  total_minutes: number | null;
};

export function camelizeAttendance(r: RawAttendance): AttendanceRecord {
  return {
    id: r.id,
    staffId: r.staff_id,
    firstName: r.first_name,
    lastName: r.last_name,
    date: r.date,
    clockInAt: r.clock_in_at,
    clockOutAt: r.clock_out_at,
    totalMinutes: r.total_minutes,
  };
}

type RawClockStatus = {
  clocked_in: boolean;
  clock_in_at: string | null;
};

export function camelizeClockStatus(r: RawClockStatus): ClockStatus {
  return {
    clockedIn: r.clocked_in,
    clockInAt: r.clock_in_at,
  };
}
