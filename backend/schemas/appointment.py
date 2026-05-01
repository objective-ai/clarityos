"""
schemas/appointment.py

Pydantic request and response schemas for the Appointment module.

Covers the full appointment lifecycle:
  - AppointmentCreateRequest  — POST /appointments
  - AppointmentUpdateRequest  — PATCH /appointments/{id}
  - AppointmentCancelRequest  — POST /appointments/{id}/cancel
  - AppointmentResponse       — full appointment detail
  - AppointmentListResponse   — date-range list view

Validation philosophy:
  - start_time must be a timezone-aware datetime.
  - end_time is derived automatically from start_time + duration_minutes;
    it is never accepted as a direct user input.
  - duration_minutes is bounded to 5–240 minutes (5 min minimum slot,
    4 hr maximum for any single visit type).
  - cancellation_reason requires at least 3 characters so the front-end
    cannot accidentally submit an empty cancellation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from pydantic import Field, model_validator

from backend.db.models.tenant.clinical import AppointmentStatus, AppointmentType
from backend.schemas.common import AppBaseModel


# ---------------------------------------------------------------------------
# Create Request
# ---------------------------------------------------------------------------


class AppointmentCreateRequest(AppBaseModel):
    """
    Request body for POST /appointments

    end_time is derived automatically: start_time + duration_minutes.
    The caller never provides end_time directly.
    """

    patient_id: uuid.UUID = Field(
        ...,
        description="The patient being scheduled.",
    )
    provider_id: uuid.UUID = Field(
        ...,
        description="The staff member (doctor) who will conduct the exam.",
    )
    appointment_type: AppointmentType = Field(
        ...,
        description=(
            "Type of appointment: comprehensive_exam, contact_lens_exam, "
            "follow_up, urgent_care, or pediatric_exam."
        ),
    )
    start_time: datetime = Field(
        ...,
        description="Appointment start time (timezone-aware ISO 8601, e.g. '2026-03-10T09:00:00Z').",
    )
    duration_minutes: int = Field(
        default=30,
        ge=5,
        le=240,
        description="Duration in minutes (5–240). Defaults to 30.",
    )
    chief_complaint: str | None = Field(
        default=None,
        max_length=1000,
        description="Patient's primary reason for the visit (captured at booking).",
    )
    internal_notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Internal staff notes (not visible to the patient).",
    )

    # Derived field — populated by the model_validator, never supplied by client.
    end_time: datetime | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def compute_end_time(self) -> "AppointmentCreateRequest":
        """Compute end_time = start_time + duration_minutes."""
        if self.start_time is not None and self.duration_minutes is not None:
            # Ensure start_time is timezone-aware.
            st = self.start_time
            if st.tzinfo is None:
                st = st.replace(tzinfo=timezone.utc)
                self.start_time = st
            object.__setattr__(
                self,
                "end_time",
                st + timedelta(minutes=self.duration_minutes),
            )
        return self


# ---------------------------------------------------------------------------
# Update Request
# ---------------------------------------------------------------------------


class AppointmentUpdateRequest(AppBaseModel):
    """
    Request body for PATCH /appointments/{id}

    All fields are optional.  Only fields explicitly included in the request
    body are applied (model_dump(exclude_unset=True) pattern).

    Updates are only permitted when the appointment status is SCHEDULED or
    CONFIRMED — enforced at the route level.

    end_time is recomputed whenever start_time or duration_minutes changes.
    """

    appointment_type: AppointmentType | None = Field(
        default=None,
        description="Override appointment type.",
    )
    start_time: datetime | None = Field(
        default=None,
        description="New start time (timezone-aware ISO 8601).",
    )
    duration_minutes: int | None = Field(
        default=None,
        ge=5,
        le=240,
        description="New duration in minutes (5–240).",
    )
    chief_complaint: str | None = Field(
        default=None,
        max_length=1000,
        description="Updated chief complaint.",
    )
    internal_notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Updated internal notes.",
    )

    # Derived — route handler computes this before writing to the ORM.
    end_time: datetime | None = Field(default=None, exclude=True)

    @model_validator(mode="after")
    def compute_end_time(self) -> "AppointmentUpdateRequest":
        """Recompute end_time only when timing fields are provided."""
        if self.start_time is not None or self.duration_minutes is not None:
            # Both must be present to recompute; the route handler will read
            # the existing record's values for any that are missing here.
            # We store what we can; the route handler fills in the gap.
            if self.start_time is not None and self.duration_minutes is not None:
                st = self.start_time
                if st.tzinfo is None:
                    st = st.replace(tzinfo=timezone.utc)
                    self.start_time = st
                object.__setattr__(
                    self,
                    "end_time",
                    st + timedelta(minutes=self.duration_minutes),
                )
        return self


# ---------------------------------------------------------------------------
# Cancel Request
# ---------------------------------------------------------------------------


class AppointmentCancelRequest(AppBaseModel):
    """
    Request body for POST /appointments/{id}/cancel

    cancellation_reason is required (min 3 characters) — staff must provide
    a brief justification so the audit trail is meaningful.
    """

    cancellation_reason: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Why the appointment is being cancelled (required, min 3 chars).",
    )


# ---------------------------------------------------------------------------
# Reschedule Request
# ---------------------------------------------------------------------------


class AppointmentRescheduleRequest(AppBaseModel):
    """
    Request body for POST /appointments/{id}/reschedule

    Moves an appointment to a new time slot. Duration defaults to the
    existing value if not provided.
    """

    new_start_time: datetime = Field(
        ...,
        description="New appointment start time (timezone-aware ISO 8601).",
    )
    new_duration_minutes: int | None = Field(
        default=None,
        ge=5,
        le=240,
        description="New duration in minutes (5–240). If omitted, keeps current duration.",
    )


# ---------------------------------------------------------------------------
# Response
# ---------------------------------------------------------------------------


class AppointmentResponse(AppBaseModel):
    """
    Full appointment detail response.

    Returned by POST, GET, PATCH, and all action endpoints.

    patient_name and provider_name are joined from the Patient and Staff
    tables — convenient for list rendering without a second request.
    """

    id: uuid.UUID
    tenant_id: uuid.UUID
    patient_id: uuid.UUID
    provider_id: uuid.UUID
    booked_by_id: uuid.UUID | None = None

    appointment_type: AppointmentType
    status: AppointmentStatus

    start_time: datetime
    end_time: datetime
    duration_minutes: int

    chief_complaint: str | None = None
    internal_notes: str | None = None
    cancellation_reason: str | None = None
    reminder_sent_at: datetime | None = None

    # Patient engagement (Phase 12)
    patient_confirmed_at: datetime | None = None
    last_reminder_sent_at: datetime | None = None
    reminders_sent_count: int = 0

    # Joined display fields
    patient_name: str | None = None
    patient_chart_number: int | None = None
    provider_name: str | None = None
    encounter_id: uuid.UUID | None = None
    encounter_short_id: str | None = None

    # Intake (Phase 7)
    intake_status: str | None = None
    triage_flags_jsonb: dict | None = None

    # Insurance summary (Phase 10.1)
    insurance_payer_name: str | None = None
    insurance_copay: float | None = None
    insurance_eligibility: str | None = None  # "active" | "inactive" | ... | None if no insurance

    # Wait time tracking (Phase 10.2)
    checked_in_at: datetime | None = None

    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# List Response
# ---------------------------------------------------------------------------


class AppointmentListResponse(AppBaseModel):
    """
    Paginated / date-scoped appointment list.

    Returned by GET /appointments?date=YYYY-MM-DD
    """

    items: list[AppointmentResponse]
    total: int
    timezone: str = "America/Los_Angeles"
