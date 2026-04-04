"""
schemas/public_booking.py

Pydantic request and response schemas for the public (unauthenticated) booking API.

Endpoints:
  GET  /api/public/booking/{slug}/info/          — clinic info + providers
  GET  /api/public/booking/{slug}/availability/   — available time slots
  POST /api/public/booking/{slug}/book/           — create patient + appointment
"""

import uuid
from datetime import date, datetime

from pydantic import Field

from backend.schemas.common import AppBaseModel


# ---------------------------------------------------------------------------
# GET /{slug}/info/ — Clinic Info Response
# ---------------------------------------------------------------------------


class BookableType(AppBaseModel):
    """A single appointment type available for public booking."""

    value: str
    label: str
    duration_minutes: int


class BookingProvider(AppBaseModel):
    """A provider available for public booking (minimal, no PHI)."""

    id: uuid.UUID
    first_name: str
    last_name: str


class BookingClinicInfoResponse(AppBaseModel):
    """Response for GET /{slug}/info/ — non-PHI clinic info."""

    clinic_name: str
    timezone: str
    bookable_types: list[BookableType]
    providers: list[BookingProvider]


# ---------------------------------------------------------------------------
# GET /{slug}/availability/ — Available Slots Response
# ---------------------------------------------------------------------------


class AvailabilityResponse(AppBaseModel):
    """Response for GET /{slug}/availability/ — list of open time slots."""

    date: str
    provider_id: uuid.UUID
    provider_name: str
    slots: list[str]  # ISO 8601 datetime strings in clinic timezone
    timezone: str


# ---------------------------------------------------------------------------
# POST /{slug}/book/ — Booking Request & Response
# ---------------------------------------------------------------------------


class PublicBookingRequest(AppBaseModel):
    """Request body for POST /{slug}/book/ — create patient + appointment."""

    # Patient info (minimal — full details collected via intake form)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    dob: date
    sex: str = Field(
        ...,
        description="Patient sex: male, female, other, or prefer_not_to_say.",
    )
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=200)

    # Appointment info
    provider_id: uuid.UUID
    appointment_type: str = Field(
        ...,
        description="One of the bookable types returned by GET /info/.",
    )
    start_time: datetime = Field(
        ...,
        description="Appointment start time (timezone-aware ISO 8601).",
    )
    chief_complaint: str | None = Field(default=None, max_length=1000)


class PublicBookingResponse(AppBaseModel):
    """Response for POST /{slug}/book/ — booking confirmation."""

    success: bool
    appointment_id: uuid.UUID
    appointment_date: str  # human-readable, e.g. "March 10, 2026 at 09:00 AM"
    provider_name: str
    appointment_type_label: str
    intake_url: str | None = None
    message: str
