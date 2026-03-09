"""
api/routes/public_booking.py

Public (unauthenticated) booking endpoints for patient self-scheduling.

All routes are mounted under /api/public/booking — no JWT required.

Endpoints:
  GET  /{slug}/info/          — clinic info, providers, bookable types
  GET  /{slug}/availability/  — available time slots for a date/provider/type
  POST /{slug}/book/          — create patient + appointment + intake token
"""

from __future__ import annotations

import secrets
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
    AuditAction,
    AuditLog,
    Patient,
    Sex,
    Staff,
    StaffRole,
)
from backend.db.models.tenant.intake import IntakeStatus, IntakeToken
from backend.db.session import get_db
from backend.schemas.public_booking import (
    AvailabilityResponse,
    BookableType,
    BookingClinicInfoResponse,
    BookingProvider,
    PublicBookingRequest,
    PublicBookingResponse,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Durations per appointment type (mirrors types/appointment.ts)
APPOINTMENT_TYPE_DURATIONS: dict[str, int] = {
    "comprehensive_exam": 45,
    "contact_lens_exam": 30,
    "follow_up": 20,
    "urgent_care": 30,
    "pediatric_exam": 45,
}

APPOINTMENT_TYPE_LABELS: dict[str, str] = {
    "comprehensive_exam": "Comprehensive Exam",
    "contact_lens_exam": "Contact Lens Exam",
    "follow_up": "Follow-Up",
    "urgent_care": "Urgent Care",
    "pediatric_exam": "Pediatric Exam",
}

DEFAULT_BOOKABLE_TYPES = ["comprehensive_exam", "contact_lens_exam", "pediatric_exam"]

DEFAULT_HOURS: dict[str, dict | None] = {
    "mon": {"start": "08:00", "end": "17:00"},
    "tue": {"start": "08:00", "end": "17:00"},
    "wed": {"start": "08:00", "end": "17:00"},
    "thu": {"start": "08:00", "end": "17:00"},
    "fri": {"start": "08:00", "end": "16:00"},
    "sat": None,
    "sun": None,
}

DEFAULT_SLOT_INTERVAL = 15  # minutes
DEFAULT_MAX_ADVANCE_DAYS = 90
INTAKE_TOKEN_TTL_HOURS = 72

# Sentinel UUID for public (anonymous) audit entries
PUBLIC_USER_UUID = uuid.UUID("00000000-0000-0000-0000-000000000000")

# Simple in-memory rate limiter (IP -> list of timestamps)
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds

DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_tenant_by_slug(slug: str, db: AsyncSession) -> Tenant:
    """Fetch an active tenant by slug or raise 404."""
    tenant = (
        await db.execute(select(Tenant).where(Tenant.slug == slug))
    ).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Clinic not found.")
    if tenant.status.value != "active" if hasattr(tenant.status, "value") else tenant.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Clinic not found.")
    return tenant


def _get_booking_config(tenant: Tenant) -> dict:
    """Extract booking config from tenant settings_jsonb with defaults."""
    settings = tenant.settings_jsonb or {}
    booking = settings.get("booking", {})
    return {
        "enabled": booking.get("enabled", True),
        "hours": booking.get("hours", DEFAULT_HOURS),
        "slot_interval_minutes": booking.get("slot_interval_minutes", DEFAULT_SLOT_INTERVAL),
        "bookable_types": booking.get("bookable_types", DEFAULT_BOOKABLE_TYPES),
        "max_advance_days": booking.get("max_advance_days", DEFAULT_MAX_ADVANCE_DAYS),
    }


def _check_rate_limit(ip: str) -> None:
    """Simple in-memory IP rate limiter. Raises 429 if exceeded."""
    import time

    now = time.time()
    # Prune old entries
    _rate_limit_store[ip] = [t for t in _rate_limit_store[ip] if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limit_store[ip]) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many booking attempts. Please try again later.",
        )
    _rate_limit_store[ip].append(now)


async def _next_chart_number(tenant_id: uuid.UUID, db: AsyncSession) -> int:
    """Generate next sequential chart number for a tenant."""
    result = await db.execute(
        select(func.max(Patient.chart_number)).where(Patient.tenant_id == tenant_id)
    )
    current_max = result.scalar_one_or_none()
    return (current_max or 1000) + 1


def _parse_time(t: str) -> tuple[int, int]:
    """Parse 'HH:MM' to (hour, minute)."""
    parts = t.split(":")
    return int(parts[0]), int(parts[1])


# ---------------------------------------------------------------------------
# GET /{slug}/info/ — clinic info + providers + bookable types
# ---------------------------------------------------------------------------


@router.get("/{slug}/info/", response_model=BookingClinicInfoResponse)
async def get_booking_info(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Return non-PHI clinic info for the public booking page."""
    tenant = await _get_tenant_by_slug(slug, db)
    config = _get_booking_config(tenant)

    if not config["enabled"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Online booking is not available for this clinic.")

    # Fetch active providers (doctors and owners only)
    providers = (
        await db.execute(
            select(Staff)
            .where(
                Staff.tenant_id == tenant.id,
                Staff.is_active.is_(True),
                Staff.role.in_([StaffRole.DOCTOR.value, StaffRole.OWNER.value]),
            )
            .order_by(Staff.last_name, Staff.first_name)
        )
    ).scalars().all()

    # Build bookable type list
    bookable_types = []
    for type_value in config["bookable_types"]:
        if type_value in APPOINTMENT_TYPE_LABELS:
            bookable_types.append(
                BookableType(
                    value=type_value,
                    label=APPOINTMENT_TYPE_LABELS[type_value],
                    duration_minutes=APPOINTMENT_TYPE_DURATIONS[type_value],
                )
            )

    return BookingClinicInfoResponse(
        clinic_name=tenant.name,
        timezone=tenant.timezone or "America/Los_Angeles",
        bookable_types=bookable_types,
        providers=[
            BookingProvider(id=p.id, first_name=p.first_name, last_name=p.last_name)
            for p in providers
        ],
    )


# ---------------------------------------------------------------------------
# GET /{slug}/availability/ — available slots for a date/provider/type
# ---------------------------------------------------------------------------


@router.get("/{slug}/availability/", response_model=AvailabilityResponse)
async def get_availability(
    slug: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format."),
    provider_id: uuid.UUID = Query(..., description="Provider UUID."),
    appointment_type: str = Query(..., description="Appointment type value."),
    db: AsyncSession = Depends(get_db),
):
    """Return available time slots for a given date, provider, and type."""
    tenant = await _get_tenant_by_slug(slug, db)
    config = _get_booking_config(tenant)
    tz_name = tenant.timezone or "America/Los_Angeles"

    # Validate appointment type is bookable
    if appointment_type not in config["bookable_types"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Appointment type '{appointment_type}' is not available for online booking.")

    duration = APPOINTMENT_TYPE_DURATIONS.get(appointment_type, 30)

    # Parse the date
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid date format. Use YYYY-MM-DD.")

    # Reject past dates
    today = datetime.now(timezone.utc).date()
    if target_date < today:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot book appointments in the past.")

    # Reject dates too far in the future
    max_date = today + timedelta(days=config["max_advance_days"])
    if target_date > max_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot book more than {config['max_advance_days']} days in advance.")

    # Get hours for day of week
    day_name = DAY_NAMES[target_date.weekday()]
    hours = config["hours"].get(day_name)
    if hours is None:
        # Clinic closed on this day
        provider = (
            await db.execute(
                select(Staff).where(Staff.id == provider_id, Staff.tenant_id == tenant.id)
            )
        ).scalar_one_or_none()
        return AvailabilityResponse(
            date=date,
            provider_id=provider_id,
            provider_name=f"{provider.first_name} {provider.last_name}" if provider else "Unknown",
            slots=[],
            timezone=tz_name,
        )

    # Validate provider
    provider = (
        await db.execute(
            select(Staff).where(
                Staff.id == provider_id,
                Staff.tenant_id == tenant.id,
                Staff.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if provider is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provider not found or inactive.")

    # Generate candidate slots
    start_h, start_m = _parse_time(hours["start"])
    end_h, end_m = _parse_time(hours["end"])
    interval = config["slot_interval_minutes"]

    # Build slot start times (in UTC for DB queries)
    # We work in naive "clinic local" time, then store as UTC-aware for consistency
    slots: list[datetime] = []
    current = datetime(target_date.year, target_date.month, target_date.day, start_h, start_m, tzinfo=timezone.utc)
    clinic_end = datetime(target_date.year, target_date.month, target_date.day, end_h, end_m, tzinfo=timezone.utc)

    while current + timedelta(minutes=duration) <= clinic_end:
        slots.append(current)
        current += timedelta(minutes=interval)

    if not slots:
        return AvailabilityResponse(
            date=date,
            provider_id=provider_id,
            provider_name=f"{provider.first_name} {provider.last_name}",
            slots=[],
            timezone=tz_name,
        )

    # Fetch existing non-cancelled appointments for this provider on this date
    day_start = datetime(target_date.year, target_date.month, target_date.day, 0, 0, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    existing = (
        await db.execute(
            select(Appointment.start_time, Appointment.end_time).where(
                Appointment.tenant_id == tenant.id,
                Appointment.provider_id == provider_id,
                Appointment.status.notin_(["cancelled", "no_show"]),
                Appointment.start_time >= day_start,
                Appointment.start_time < day_end,
            )
        )
    ).all()

    # Filter out slots that overlap with existing appointments
    available: list[str] = []
    now = datetime.now(timezone.utc)

    for slot_start in slots:
        # Skip past slots (if today)
        if slot_start <= now:
            continue

        slot_end = slot_start + timedelta(minutes=duration)
        overlaps = False
        for appt_start, appt_end in existing:
            # Ensure tz-aware
            a_start = appt_start if appt_start.tzinfo else appt_start.replace(tzinfo=timezone.utc)
            a_end = appt_end if appt_end.tzinfo else appt_end.replace(tzinfo=timezone.utc)
            if slot_start < a_end and slot_end > a_start:
                overlaps = True
                break

        if not overlaps:
            available.append(slot_start.isoformat())

    return AvailabilityResponse(
        date=date,
        provider_id=provider_id,
        provider_name=f"{provider.first_name} {provider.last_name}",
        slots=available,
        timezone=tz_name,
    )


# ---------------------------------------------------------------------------
# POST /{slug}/book/ — create patient + appointment + intake token
# ---------------------------------------------------------------------------


@router.post("/{slug}/book/", response_model=PublicBookingResponse, status_code=status.HTTP_201_CREATED)
async def create_public_booking(
    slug: str,
    payload: PublicBookingRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a patient (or reuse existing), appointment, and intake token."""
    # Rate limit
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    tenant = await _get_tenant_by_slug(slug, db)
    config = _get_booking_config(tenant)

    if not config["enabled"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Online booking is not available for this clinic.")

    # Validate appointment type
    if payload.appointment_type not in config["bookable_types"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Appointment type '{payload.appointment_type}' is not available for online booking.")

    duration = APPOINTMENT_TYPE_DURATIONS.get(payload.appointment_type, 30)

    # Validate sex
    try:
        sex_enum = Sex(payload.sex)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid sex value: {payload.sex}. Use: male, female, other, prefer_not_to_say.")

    # Validate start_time is in the future
    now = datetime.now(timezone.utc)
    start_time = payload.start_time
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if start_time <= now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Appointment time must be in the future.")

    # Validate not too far in advance
    max_date = now + timedelta(days=config["max_advance_days"])
    if start_time > max_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot book more than {config['max_advance_days']} days in advance.")

    end_time = start_time + timedelta(minutes=duration)

    # Validate provider exists and is active doctor/owner
    provider = (
        await db.execute(
            select(Staff).where(
                Staff.id == payload.provider_id,
                Staff.tenant_id == tenant.id,
                Staff.is_active.is_(True),
                Staff.role.in_([StaffRole.DOCTOR.value, StaffRole.OWNER.value]),
            )
        )
    ).scalar_one_or_none()
    if provider is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provider not found or not available.")

    # --- HARD-BLOCK OVERLAP CHECK (public only, staff can double-book) ---
    overlap = (
        await db.execute(
            select(Appointment.id).where(
                Appointment.tenant_id == tenant.id,
                Appointment.provider_id == payload.provider_id,
                Appointment.status.notin_(["cancelled", "no_show"]),
                Appointment.start_time < end_time,
                Appointment.end_time > start_time,
            )
        )
    ).first()
    if overlap:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This time slot is no longer available. Please select a different time.",
        )

    # --- Find or create patient ---
    patient = (
        await db.execute(
            select(Patient).where(
                Patient.tenant_id == tenant.id,
                func.lower(Patient.first_name) == payload.first_name.strip().lower(),
                func.lower(Patient.last_name) == payload.last_name.strip().lower(),
                Patient.dob == payload.dob,
                Patient.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()

    if patient is None:
        chart_number = await _next_chart_number(tenant.id, db)
        contact_jsonb: dict = {}
        if payload.phone:
            contact_jsonb["phone"] = payload.phone
        if payload.email:
            contact_jsonb["email"] = payload.email

        patient = Patient(
            tenant_id=tenant.id,
            chart_number=chart_number,
            first_name=payload.first_name.strip(),
            last_name=payload.last_name.strip(),
            dob=payload.dob,
            sex=sex_enum,
            contact_info_jsonb=contact_jsonb,
            medical_history_jsonb={},
            privacy_flags_jsonb={},
        )
        db.add(patient)
        await db.flush()

    # --- Create appointment ---
    appt = Appointment(
        tenant_id=tenant.id,
        patient_id=patient.id,
        provider_id=provider.id,
        booked_by_id=None,  # public booking — no staff
        appointment_type=AppointmentType(payload.appointment_type),
        status=AppointmentStatus.SCHEDULED,
        start_time=start_time,
        end_time=end_time,
        duration_minutes=duration,
        chief_complaint=payload.chief_complaint,
    )
    db.add(appt)
    await db.flush()

    # --- Create intake token ---
    token_str = secrets.token_hex(32)
    expires = now + timedelta(hours=INTAKE_TOKEN_TTL_HOURS)

    intake_token = IntakeToken(
        tenant_id=tenant.id,
        appointment_id=appt.id,
        token=token_str,
        status=IntakeStatus.PENDING.value,
        expires_at=expires,
    )
    db.add(intake_token)

    # Update appointment intake status
    appt.intake_status = "pending"

    await db.flush()

    # --- Audit log (public — use sentinel user_id) ---
    audit_entry = AuditLog(
        tenant_id=tenant.id,
        user_id=PUBLIC_USER_UUID,
        staff_id=None,
        action="public_booking",
        resource_type="appointment",
        resource_id=appt.id,
        patient_id=patient.id,
        detail=f"Public booking: {payload.first_name} {payload.last_name} with Dr. {provider.last_name}",
        ip_address=ip,
    )
    db.add(audit_entry)

    # Build intake URL
    base_url = str(request.base_url).rstrip("/")
    intake_url = f"{base_url.replace(':8000', ':3000')}/intake/{token_str}"

    provider_name = f"Dr. {provider.first_name} {provider.last_name}"
    type_label = APPOINTMENT_TYPE_LABELS.get(payload.appointment_type, payload.appointment_type)

    return PublicBookingResponse(
        success=True,
        appointment_id=appt.id,
        appointment_date=start_time.strftime("%B %d, %Y at %I:%M %p"),
        provider_name=provider_name,
        appointment_type_label=type_label,
        intake_url=intake_url,
        message="Your appointment has been booked! Please complete the intake form before your visit.",
    )
