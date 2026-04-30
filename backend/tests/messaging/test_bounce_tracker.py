"""Tests for backend/services/messaging/bounce_tracker.py (CRM-20).

Mocks AsyncSession.execute to return a fake Patient — same pattern as
test_cost_cap. record_bounce mutates contact_info_jsonb in place and writes
an audit log entry.
"""
from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

import backend.db.models.tenant.intake  # noqa: F401  (mapper bootstrap — Appointment→IntakeToken relationship)
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction, Patient, Sex
from backend.services.messaging.bounce_tracker import record_bounce


def _fake_patient(contact: dict | None = None) -> Patient:
    p = Patient(
        id=uuid4(),
        tenant_id=uuid4(),
        first_name="Test",
        last_name="Patient",
        dob=date(1990, 1, 1),
        sex=Sex.FEMALE,
        chart_number=12345,
        contact_info_jsonb=contact if contact is not None else {},
    )
    return p


def _fake_session(patient: Patient):
    captured: list = []

    def _execute(_stmt):
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=patient)
        return result

    session = MagicMock()
    session.execute = AsyncMock(side_effect=_execute)
    session.flush = AsyncMock()
    session.add = MagicMock(side_effect=lambda obj: captured.append(obj))
    session.captured_added = captured  # for inspection
    return session


def _system_ctx(tenant_id):
    return TenantContext(user_id=uuid4(), tenant_id=tenant_id, role="system")


@pytest.mark.asyncio
async def test_first_bounce_increments_counter_no_flip():
    patient = _fake_patient({"preferred_channel": "sms", "phone_e164": "+15555550100"})
    session = _fake_session(patient)
    ctx = _system_ctx(patient.tenant_id)

    await record_bounce(session, ctx, patient_id=patient.id, channel="sms")

    assert patient.contact_info_jsonb["consecutive_bounces"]["sms"] == 1
    assert patient.contact_info_jsonb["preferred_channel"] == "sms"  # not flipped yet
    assert "needs_contact_update" not in patient.contact_info_jsonb


@pytest.mark.asyncio
async def test_third_bounce_flips_channel_and_resets_counter():
    patient = _fake_patient({
        "preferred_channel": "sms",
        "phone_e164": "+15555550100",
        "email": "p@example.com",
        "consecutive_bounces": {"sms": 2},
    })
    session = _fake_session(patient)
    ctx = _system_ctx(patient.tenant_id)

    await record_bounce(session, ctx, patient_id=patient.id, channel="sms")

    assert patient.contact_info_jsonb["preferred_channel"] == "email"
    assert patient.contact_info_jsonb["consecutive_bounces"]["sms"] == 0
    assert patient.contact_info_jsonb["needs_contact_update"] is True
    # Audit log entry was added
    assert any(
        getattr(a, "action", None) == AuditAction.CHANNEL_PREFERENCE_UPDATED.value
        for a in session.captured_added
    )


@pytest.mark.asyncio
async def test_email_bounces_flip_to_sms():
    patient = _fake_patient({
        "preferred_channel": "email",
        "consecutive_bounces": {"email": 2},
    })
    session = _fake_session(patient)
    ctx = _system_ctx(patient.tenant_id)

    await record_bounce(session, ctx, patient_id=patient.id, channel="email")

    assert patient.contact_info_jsonb["preferred_channel"] == "sms"
    assert patient.contact_info_jsonb["consecutive_bounces"]["email"] == 0


@pytest.mark.asyncio
async def test_unknown_channel_is_ignored():
    patient = _fake_patient({"preferred_channel": "sms"})
    session = _fake_session(patient)
    ctx = _system_ctx(patient.tenant_id)

    await record_bounce(session, ctx, patient_id=patient.id, channel="fax")

    # No mutation; no audit log
    assert "consecutive_bounces" not in patient.contact_info_jsonb
    assert session.add.call_count == 0


@pytest.mark.asyncio
async def test_missing_patient_is_logged_not_raised():
    # scalar_one_or_none returns None
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=result)
    session.add = MagicMock()
    ctx = _system_ctx(uuid4())

    # No exception; just a warning + return
    await record_bounce(session, ctx, patient_id=uuid4(), channel="sms")
    assert session.add.call_count == 0


@pytest.mark.asyncio
async def test_independent_counters_per_channel():
    patient = _fake_patient({
        "preferred_channel": "sms",
        "consecutive_bounces": {"sms": 1, "email": 2},
    })
    session = _fake_session(patient)
    ctx = _system_ctx(patient.tenant_id)

    await record_bounce(session, ctx, patient_id=patient.id, channel="sms")

    # sms went 1→2, email untouched
    assert patient.contact_info_jsonb["consecutive_bounces"]["sms"] == 2
    assert patient.contact_info_jsonb["consecutive_bounces"]["email"] == 2
    # Not flipped — sms still <3
    assert patient.contact_info_jsonb["preferred_channel"] == "sms"
