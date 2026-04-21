from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class WeeklyScheduleDayRequest(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: str  # "HH:MM"
    end_time: str    # "HH:MM"
    is_active: bool = True


class WeeklyScheduleBulkRequest(BaseModel):
    days: list[WeeklyScheduleDayRequest]


class WeeklyScheduleDayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    staff_id: UUID
    day_of_week: int
    start_time: time
    end_time: time
    is_active: bool

    @field_serializer("start_time", "end_time")
    def serialize_time(self, value: time) -> str:
        return value.strftime("%H:%M")


class BlockedTimeRequest(BaseModel):
    start_datetime: datetime
    end_datetime: datetime
    reason: Optional[str] = None
    block_type: str = "other"


class BlockedTimeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    staff_id: UUID
    start_datetime: datetime
    end_datetime: datetime
    reason: Optional[str] = None
    block_type: str
    created_at: datetime


class StaffAvailabilityEntry(BaseModel):
    staff_id: UUID
    first_name: str
    last_name: str
    role: str
    schedule: list[WeeklyScheduleDayResponse]


class WeeklyAvailabilityResponse(BaseModel):
    week_start: str  # YYYY-MM-DD
    staff: list[StaffAvailabilityEntry]


class ClockInResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    staff_id: UUID
    clock_in_at: datetime
    clock_out_at: Optional[datetime] = None
    date: date


class ClockOutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    staff_id: UUID
    clock_in_at: datetime
    clock_out_at: datetime
    date: date
    total_minutes: int


class ClockStatusResponse(BaseModel):
    clocked_in: bool
    clock_in_at: Optional[datetime] = None


class AttendanceRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    staff_id: UUID
    first_name: str
    last_name: str
    date: date
    clock_in_at: datetime
    clock_out_at: Optional[datetime] = None
    total_minutes: Optional[int] = None


class AttendanceSummary(BaseModel):
    staff_id: UUID
    full_name: str
    period_start: date
    period_end: date
    total_minutes: int
    records: list[AttendanceRecord]
