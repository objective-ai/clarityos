"""
api/routes/staff_schedule.py

Staff scheduling, blocked time, clock-in/out, attendance log, and CSV export.

ROUTE ORDER: All literal-path routes (/availability/, /clock-in/, /clock-out/,
/clock-status/, /attendance/export/, /attendance/) appear TEXTUALLY BEFORE any
parameterized /{staff_id}/... route — required by FastAPI's top-down matching.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, time
from datetime import timezone as dt_timezone
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import (
    Staff,
    StaffAttendance,
    StaffBlockedTime,
    StaffWeeklySchedule,
)
from backend.db.session import get_db
from backend.schemas.staff_schedule import (
    AttendanceRecord,
    BlockedTimeRequest,
    BlockedTimeResponse,
    ClockInResponse,
    ClockOutResponse,
    ClockStatusResponse,
    StaffAvailabilityEntry,
    WeeklyAvailabilityResponse,
    WeeklyScheduleBulkRequest,
    WeeklyScheduleDayResponse,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Timezone helpers (STRICT — no silent UTC fallback)
# ---------------------------------------------------------------------------


async def _resolve_tenant_tz(db: AsyncSession, tenant_id) -> ZoneInfo:
    """Strict resolver: returns ZoneInfo for the tenant's configured timezone.

    Uses the Tenant.timezone direct column (not settings_jsonb).
    Raises HTTP 400 if the Tenant row is missing or has an empty timezone.
    NEVER silently falls back to UTC — clock-in/out must be anchored to a real
    clinic timezone so the derived `date` column is meaningful.
    """
    tenant = await db.get(Tenant, tenant_id)
    if not tenant or not tenant.timezone:
        raise HTTPException(status_code=400, detail="Tenant timezone not configured")
    tz_name = tenant.timezone.strip()
    if not tz_name:
        raise HTTPException(status_code=400, detail="Tenant timezone not configured")
    return ZoneInfo(tz_name)


def _clinic_date_from_utc(dt: datetime, tz: ZoneInfo) -> date:
    """Convert a UTC (or aware) datetime to a clinic-local date.

    Accepts only a ZoneInfo (not a string) — callers MUST resolve tenant tz
    via `_resolve_tenant_tz` first. There is NO UTC fallback in this helper.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=dt_timezone.utc)
    return dt.astimezone(tz).date()


# ---------------------------------------------------------------------------
# Literal route #1: /availability/  (MUST be first route in file)
# ---------------------------------------------------------------------------


@router.get("/availability/", response_model=WeeklyAvailabilityResponse)
async def get_weekly_availability(
    week_start: date = Query(...),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_SCHEDULE)),
    db: AsyncSession = Depends(get_db),
) -> WeeklyAvailabilityResponse:
    """Return all active staff with their weekly schedule for the given week."""
    staff_result = await db.execute(
        select(Staff)
        .where(Staff.tenant_id == ctx.tenant_id)
        .where(Staff.is_active == True)  # noqa: E712
        .options(selectinload(Staff.weekly_schedules))
        .order_by(Staff.last_name, Staff.first_name)
    )
    entries: list[StaffAvailabilityEntry] = []
    for s in staff_result.scalars().all():
        active_days = [
            WeeklyScheduleDayResponse.model_validate(ws)
            for ws in s.weekly_schedules
            if ws.is_active
        ]
        active_days.sort(key=lambda w: w.day_of_week)
        entries.append(
            StaffAvailabilityEntry(
                staff_id=s.id,
                first_name=s.first_name,
                last_name=s.last_name,
                role=getattr(s, "role", ""),
                schedule=active_days,
            )
        )
    return WeeklyAvailabilityResponse(week_start=week_start.isoformat(), staff=entries)


# ---------------------------------------------------------------------------
# Literal routes #2-#6: clock-in, clock-out, clock-status, attendance/export,
# attendance  — all BEFORE any /{staff_id}/... parameterized route
# ---------------------------------------------------------------------------


@router.post("/clock-in/", response_model=ClockInResponse, status_code=201)
async def clock_in(
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CLOCK_IN_OUT)),
    db: AsyncSession = Depends(get_db),
) -> ClockInResponse:
    """Clock the current user in. Returns 409 if already clocked in.
    Raises 400 if tenant timezone is not configured (STRICT — no UTC fallback).
    """
    staff = await resolve_staff(ctx, db)
    if not staff:
        raise HTTPException(403, "No staff record linked to this user")
    existing = await db.execute(
        select(StaffAttendance)
        .where(StaffAttendance.tenant_id == ctx.tenant_id)
        .where(StaffAttendance.staff_id == staff.id)
        .where(StaffAttendance.clock_out_at.is_(None))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Already clocked in")
    # STRICT: resolve clinic tz; 400 if missing. NO UTC fallback.
    tz = await _resolve_tenant_tz(db, ctx.tenant_id)
    now = datetime.now(dt_timezone.utc)
    record = StaffAttendance(
        tenant_id=ctx.tenant_id,
        staff_id=staff.id,
        clock_in_at=now,
        clock_out_at=None,
        date=_clinic_date_from_utc(now, tz),
    )
    db.add(record)
    await db.flush()
    result = await db.execute(
        select(StaffAttendance).where(StaffAttendance.id == record.id)
    )
    fetched = result.scalar_one()
    serialized = ClockInResponse.model_validate(fetched)  # materialize BEFORE commit
    await db.commit()
    return serialized


@router.post("/clock-out/", response_model=ClockOutResponse)
async def clock_out(
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CLOCK_IN_OUT)),
    db: AsyncSession = Depends(get_db),
) -> ClockOutResponse:
    """Clock the current user out. Returns 409 if not currently clocked in.
    Raises 400 if tenant timezone is not configured (STRICT — symmetric with clock-in).
    """
    staff = await resolve_staff(ctx, db)
    if not staff:
        raise HTTPException(403, "No staff record linked to this user")
    # STRICT: resolve clinic tz up-front so clock-out cannot succeed on a
    # tenant with a broken timezone config.
    tz = await _resolve_tenant_tz(db, ctx.tenant_id)
    _ = tz  # reference retained so ZoneInfo path is grep-visible in this route
    result = await db.execute(
        select(StaffAttendance)
        .where(StaffAttendance.tenant_id == ctx.tenant_id)
        .where(StaffAttendance.staff_id == staff.id)
        .where(StaffAttendance.clock_out_at.is_(None))
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status.HTTP_409_CONFLICT, "Not currently clocked in")
    record.clock_out_at = datetime.now(dt_timezone.utc)
    await db.flush()
    refetch = await db.execute(
        select(StaffAttendance).where(StaffAttendance.id == record.id)
    )
    fetched = refetch.scalar_one()
    total_minutes = int(
        (fetched.clock_out_at - fetched.clock_in_at).total_seconds() // 60
    )
    serialized = ClockOutResponse(
        id=fetched.id,
        staff_id=fetched.staff_id,
        clock_in_at=fetched.clock_in_at,
        clock_out_at=fetched.clock_out_at,
        date=fetched.date,
        total_minutes=total_minutes,
    )  # materialize BEFORE commit
    await db.commit()
    return serialized


@router.get("/clock-status/", response_model=ClockStatusResponse)
async def clock_status(
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CLOCK_IN_OUT)),
    db: AsyncSession = Depends(get_db),
) -> ClockStatusResponse:
    """Return whether the current user is clocked in and when they clocked in."""
    staff = await resolve_staff(ctx, db)
    if not staff:
        return ClockStatusResponse(clocked_in=False, clock_in_at=None)
    result = await db.execute(
        select(StaffAttendance)
        .where(StaffAttendance.tenant_id == ctx.tenant_id)
        .where(StaffAttendance.staff_id == staff.id)
        .where(StaffAttendance.clock_out_at.is_(None))
    )
    rec = result.scalar_one_or_none()
    return ClockStatusResponse(
        clocked_in=rec is not None,
        clock_in_at=rec.clock_in_at if rec else None,
    )


async def _query_attendance(
    db: AsyncSession,
    tenant_id,
    from_date: date,
    to_date: date,
    staff_id=None,
):
    """Shared attendance query helper used by list and export endpoints."""
    stmt = (
        select(StaffAttendance, Staff)
        .join(Staff, Staff.id == StaffAttendance.staff_id)
        .where(StaffAttendance.tenant_id == tenant_id)
        .where(StaffAttendance.date >= from_date)
        .where(StaffAttendance.date <= to_date)
        .order_by(StaffAttendance.date.desc(), Staff.last_name)
    )
    if staff_id:
        stmt = stmt.where(StaffAttendance.staff_id == staff_id)
    return await db.execute(stmt)


@router.get("/attendance/export/")
async def export_attendance_csv(
    from_date: date = Query(...),
    to_date: date = Query(...),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_ATTENDANCE)),
    db: AsyncSession = Depends(get_db),
):
    """Stream attendance records as CSV. Admin/owner only."""
    result = await _query_attendance(db, ctx.tenant_id, from_date, to_date)
    rows = result.all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["staff_name", "date", "clock_in", "clock_out", "hours_worked"])
    for att, staff in rows:
        hours = ""
        if att.clock_out_at:
            hours = f"{((att.clock_out_at - att.clock_in_at).total_seconds() / 3600):.2f}"
        writer.writerow(
            [
                f"{staff.first_name} {staff.last_name}",
                att.date.isoformat(),
                att.clock_in_at.isoformat(),
                att.clock_out_at.isoformat() if att.clock_out_at else "",
                hours,
            ]
        )
    buf.seek(0)
    filename = f"attendance_{from_date.isoformat()}_{to_date.isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/attendance/", response_model=list[AttendanceRecord])
async def list_attendance(
    from_date: date = Query(...),
    to_date: date = Query(...),
    staff_id: Optional[UUID] = Query(None),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_ATTENDANCE)),
    db: AsyncSession = Depends(get_db),
) -> list[AttendanceRecord]:
    """List attendance records for all staff (or one staff member). Admin/owner only."""
    result = await _query_attendance(db, ctx.tenant_id, from_date, to_date, staff_id)
    out: list[AttendanceRecord] = []
    for att, staff in result.all():
        total = None
        if att.clock_out_at:
            total = int(
                (att.clock_out_at - att.clock_in_at).total_seconds() // 60
            )
        out.append(
            AttendanceRecord(
                id=att.id,
                staff_id=att.staff_id,
                first_name=staff.first_name,
                last_name=staff.last_name,
                date=att.date,
                clock_in_at=att.clock_in_at,
                clock_out_at=att.clock_out_at,
                total_minutes=total,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Parameterized routes /{staff_id}/...
# (MUST appear textually AFTER all literal-path routes above)
# ---------------------------------------------------------------------------


@router.get("/{staff_id}/schedule/", response_model=list[WeeklyScheduleDayResponse])
async def get_weekly_schedule(
    staff_id: UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_SCHEDULE)),
    db: AsyncSession = Depends(get_db),
) -> list[WeeklyScheduleDayResponse]:
    """Return the weekly schedule rows for a specific staff member."""
    result = await db.execute(
        select(StaffWeeklySchedule)
        .where(StaffWeeklySchedule.tenant_id == ctx.tenant_id)
        .where(StaffWeeklySchedule.staff_id == staff_id)
        .order_by(StaffWeeklySchedule.day_of_week)
    )
    return [WeeklyScheduleDayResponse.model_validate(row) for row in result.scalars().all()]


@router.put("/{staff_id}/schedule/", response_model=list[WeeklyScheduleDayResponse])
async def bulk_upsert_weekly_schedule(
    staff_id: UUID,
    payload: WeeklyScheduleBulkRequest,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_SCHEDULE)),
    db: AsyncSession = Depends(get_db),
) -> list[WeeklyScheduleDayResponse]:
    """Bulk-replace the weekly schedule for a staff member (delete-then-insert)."""
    await db.execute(
        delete(StaffWeeklySchedule)
        .where(StaffWeeklySchedule.tenant_id == ctx.tenant_id)
        .where(StaffWeeklySchedule.staff_id == staff_id)
    )
    for d in payload.days:
        db.add(
            StaffWeeklySchedule(
                tenant_id=ctx.tenant_id,
                staff_id=staff_id,
                day_of_week=d.day_of_week,
                start_time=time.fromisoformat(d.start_time),
                end_time=time.fromisoformat(d.end_time),
                is_active=d.is_active,
            )
        )
    await db.flush()
    result = await db.execute(
        select(StaffWeeklySchedule)
        .where(StaffWeeklySchedule.tenant_id == ctx.tenant_id)
        .where(StaffWeeklySchedule.staff_id == staff_id)
        .order_by(StaffWeeklySchedule.day_of_week)
    )
    # CRITICAL: materialize BEFORE commit (detached-instance safety)
    rows = result.scalars().all()
    serialized = [WeeklyScheduleDayResponse.model_validate(r) for r in rows]
    await db.commit()
    return serialized


@router.get("/{staff_id}/blocked-times/", response_model=list[BlockedTimeResponse])
async def list_blocked_times(
    staff_id: UUID,
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_SCHEDULE)),
    db: AsyncSession = Depends(get_db),
) -> list[BlockedTimeResponse]:
    """List blocked time entries for a staff member, with optional date range filter."""
    stmt = (
        select(StaffBlockedTime)
        .where(StaffBlockedTime.tenant_id == ctx.tenant_id)
        .where(StaffBlockedTime.staff_id == staff_id)
        .order_by(StaffBlockedTime.start_datetime)
    )
    if from_date:
        stmt = stmt.where(
            StaffBlockedTime.end_datetime >= datetime.combine(from_date, time.min)
        )
    if to_date:
        stmt = stmt.where(
            StaffBlockedTime.start_datetime <= datetime.combine(to_date, time.max)
        )
    result = await db.execute(stmt)
    return [BlockedTimeResponse.model_validate(b) for b in result.scalars().all()]


@router.post(
    "/{staff_id}/blocked-times/", response_model=BlockedTimeResponse, status_code=201
)
async def create_blocked_time(
    staff_id: UUID,
    payload: BlockedTimeRequest,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_SCHEDULE)),
    db: AsyncSession = Depends(get_db),
) -> BlockedTimeResponse:
    """Create a blocked time entry for a staff member."""
    if payload.end_datetime <= payload.start_datetime:
        raise HTTPException(422, "end_datetime must be after start_datetime")
    if payload.block_type not in {"lunch", "holiday", "personal", "other"}:
        raise HTTPException(422, "Invalid block_type")
    block = StaffBlockedTime(
        tenant_id=ctx.tenant_id,
        staff_id=staff_id,
        start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime,
        reason=payload.reason,
        block_type=payload.block_type,
    )
    db.add(block)
    await db.flush()
    result = await db.execute(
        select(StaffBlockedTime).where(StaffBlockedTime.id == block.id)
    )
    fetched = result.scalar_one()
    serialized = BlockedTimeResponse.model_validate(fetched)  # materialize BEFORE commit
    await db.commit()
    return serialized


@router.delete("/{staff_id}/blocked-times/{block_id}/", status_code=204)
async def delete_blocked_time(
    staff_id: UUID,
    block_id: UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_SCHEDULE)),
    db: AsyncSession = Depends(get_db),
):
    """Delete a blocked time entry."""
    result = await db.execute(
        select(StaffBlockedTime)
        .where(StaffBlockedTime.id == block_id)
        .where(StaffBlockedTime.tenant_id == ctx.tenant_id)
        .where(StaffBlockedTime.staff_id == staff_id)
    )
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(404, "Blocked time not found")
    await db.delete(block)
    await db.commit()
    return None


@router.get("/{staff_id}/attendance/", response_model=list[AttendanceRecord])
async def list_attendance_for_staff(
    staff_id: UUID,
    from_date: date = Query(...),
    to_date: date = Query(...),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_ATTENDANCE)),
    db: AsyncSession = Depends(get_db),
) -> list[AttendanceRecord]:
    """List attendance records for a specific staff member. Admin/owner only."""
    result = await _query_attendance(db, ctx.tenant_id, from_date, to_date, staff_id)
    out: list[AttendanceRecord] = []
    for att, staff in result.all():
        total = None
        if att.clock_out_at:
            total = int(
                (att.clock_out_at - att.clock_in_at).total_seconds() // 60
            )
        out.append(
            AttendanceRecord(
                id=att.id,
                staff_id=att.staff_id,
                first_name=staff.first_name,
                last_name=staff.last_name,
                date=att.date,
                clock_in_at=att.clock_in_at,
                clock_out_at=att.clock_out_at,
                total_minutes=total,
            )
        )
    return out
