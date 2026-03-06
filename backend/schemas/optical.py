"""
schemas/optical.py

Pydantic request and response schemas for the Optical Handoff module.

The optical queue shows patients who have completed their exam (encounter
finalized) and are ready for glasses/contact lens dispensing.  Each queue
entry includes the final prescription, provider info, and an Rx change
alert if the spherical equivalent shifted >0.50D from the previous year.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import Field

from backend.schemas.common import AppBaseModel


# ---------------------------------------------------------------------------
# Optical order status
# ---------------------------------------------------------------------------


class OpticalStatus(StrEnum):
    """Workflow status for an optical queue entry."""

    WAITING = "waiting"          # Patient finalized, waiting for optical
    IN_PROGRESS = "in_progress"  # Optical staff working on order
    DISPENSED = "dispensed"       # Glasses/contacts handed to patient


# ---------------------------------------------------------------------------
# Eye Rx summary (flat, for queue display)
# ---------------------------------------------------------------------------


class EyeRxSummary(AppBaseModel):
    """Abbreviated Rx values for a single eye, used in queue cards."""

    sphere: Decimal | None = None
    cylinder: Decimal | None = None
    axis: int | None = None
    add: Decimal | None = None
    prism: Decimal | None = None
    prism_base: str | None = None
    visual_acuity: str | None = None


# ---------------------------------------------------------------------------
# Rx Change Alert
# ---------------------------------------------------------------------------


class RxChangeAlert(AppBaseModel):
    """Spherical equivalent change alert for one or both eyes."""

    has_change: bool = False
    od_previous_se: Decimal | None = None
    od_current_se: Decimal | None = None
    od_delta: Decimal | None = None
    os_previous_se: Decimal | None = None
    os_current_se: Decimal | None = None
    os_delta: Decimal | None = None
    message: str | None = None


# ---------------------------------------------------------------------------
# Optical Queue Item
# ---------------------------------------------------------------------------


class OpticalQueueItem(AppBaseModel):
    """A single entry in the optical queue."""

    encounter_id: uuid.UUID
    patient_id: uuid.UUID
    patient_first_name: str
    patient_last_name: str
    patient_dob: date

    provider_id: uuid.UUID
    provider_name: str
    provider_license_number: str | None = None

    finalized_at: datetime
    encounter_date: date

    # Final Rx
    od: EyeRxSummary
    os: EyeRxSummary
    pd_distance: Decimal | None = None
    pd_near: Decimal | None = None
    pd_od: Decimal | None = None
    pd_os: Decimal | None = None

    # Rx change detection
    rx_change_alert: RxChangeAlert = Field(default_factory=RxChangeAlert)

    # Workflow status
    status: OpticalStatus = OpticalStatus.WAITING


# ---------------------------------------------------------------------------
# Queue Response
# ---------------------------------------------------------------------------


class OpticalQueueResponse(AppBaseModel):
    """Response for GET /api/optical/queue."""

    items: list[OpticalQueueItem]
    total: int
    date: date


# ---------------------------------------------------------------------------
# Status Update
# ---------------------------------------------------------------------------


class OpticalStatusUpdateRequest(AppBaseModel):
    """Request body for PATCH /api/optical/{encounter_id}/status."""

    status: OpticalStatus


class OpticalStatusUpdateResponse(AppBaseModel):
    """Response after updating optical status."""

    encounter_id: uuid.UUID
    status: OpticalStatus
    updated_at: datetime


# ---------------------------------------------------------------------------
# Rx PDF Data (used by frontend to render the printable Rx)
# ---------------------------------------------------------------------------


class RxPdfData(AppBaseModel):
    """All data needed to render a printable prescription."""

    # Clinic info
    clinic_name: str
    clinic_address: str | None = None
    clinic_phone: str | None = None

    # Patient info
    patient_first_name: str
    patient_last_name: str
    patient_dob: date

    # Exam info
    encounter_date: date
    encounter_id: uuid.UUID

    # Prescription
    od: EyeRxSummary
    os: EyeRxSummary
    pd_distance: Decimal | None = None
    pd_near: Decimal | None = None
    pd_od: Decimal | None = None
    pd_os: Decimal | None = None

    # Provider info
    provider_name: str
    provider_license_number: str | None = None
    provider_npi: str | None = None

    # Expiration (typically 1-2 years from exam)
    expiration_date: date
    expiration_months: int = 12

    # Rx change info
    rx_change_alert: RxChangeAlert = Field(default_factory=RxChangeAlert)
