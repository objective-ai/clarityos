"""Tests for backend/services/messaging/recipient_resolver.py.

Covers age math at boundary, guardian routing for minors, and household bundling.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest

from backend.services.messaging.recipient_resolver import (
    NoValidRecipient,
    Recipient,
    bundle_household_recipients,
    render_bundled_body,
    resolve_recipient,
)


NOW = datetime(2026, 5, 1, 15, 0, tzinfo=timezone.utc)


def _patient(*, age_years: int, **overrides):
    """Build a patient dict with a dob age_years before NOW."""
    dob = (date(NOW.year - age_years, NOW.month, NOW.day)).isoformat()
    base = {
        "id": uuid4(),
        "first_name": "Alex",
        "last_name": "Doe",
        "dob": dob,
        "phone_e164": "+14155550100",
        "email": "alex@example.com",
    }
    base.update(overrides)
    return base


def test_adult_returns_patient_phone():
    """Test 1: Adult patient → recipient is the patient themselves (sms)."""
    patient = _patient(age_years=42)
    rec = resolve_recipient(patient=patient, channel="sms", now=NOW)
    assert rec.kind == "patient"
    assert rec.phone_e164 == "+14155550100"
    assert rec.email is None  # only sms field populated


def test_adult_returns_patient_email():
    rec = resolve_recipient(patient=_patient(age_years=30), channel="email", now=NOW)
    assert rec.kind == "patient"
    assert rec.email == "alex@example.com"
    assert rec.phone_e164 is None


def test_minor_routes_to_guardian_phone():
    """Test 2: Patient < 18 → recipient is guardian, not patient."""
    patient = _patient(
        age_years=12,
        guardian={
            "name": "Pat Doe",
            "phone_e164": "+14155559999",
            "email": "pat@example.com",
            "relationship": "mother",
        },
    )
    rec = resolve_recipient(patient=patient, channel="sms", now=NOW)
    assert rec.kind == "guardian"
    assert rec.phone_e164 == "+14155559999"
    assert rec.name == "Pat Doe"


def test_minor_routes_to_guardian_email():
    patient = _patient(
        age_years=10,
        guardian={"name": "Pat Doe", "email": "pat@example.com"},
    )
    rec = resolve_recipient(patient=patient, channel="email", now=NOW)
    assert rec.kind == "guardian"
    assert rec.email == "pat@example.com"


def test_minor_without_guardian_phone_raises():
    """Test 3: Minor with no guardian phone → NoValidRecipient (sms channel)."""
    patient = _patient(age_years=10, guardian={"name": "Pat", "email": "pat@e.com"})
    with pytest.raises(NoValidRecipient):
        resolve_recipient(patient=patient, channel="sms", now=NOW)


def test_adult_without_phone_raises():
    patient = _patient(age_years=30, phone_e164=None)
    with pytest.raises(NoValidRecipient):
        resolve_recipient(patient=patient, channel="sms", now=NOW)


def test_age_boundary_18th_birthday_is_adult():
    """A patient whose 18th birthday is exactly NOW is treated as adult."""
    dob = date(NOW.year - 18, NOW.month, NOW.day).isoformat()
    patient = {
        "id": uuid4(),
        "first_name": "Riley",
        "dob": dob,
        "phone_e164": "+14155550101",
    }
    rec = resolve_recipient(patient=patient, channel="sms", now=NOW)
    assert rec.kind == "patient"


def test_age_boundary_day_before_18th_is_minor():
    """One day before 18th birthday — still routed to guardian."""
    dob = (date(NOW.year - 18, NOW.month, NOW.day) + timedelta(days=1)).isoformat()
    patient = {
        "id": uuid4(),
        "first_name": "Riley",
        "dob": dob,
        "phone_e164": "+14155550101",
        "guardian": {"name": "Mom", "phone_e164": "+14155550102"},
    }
    rec = resolve_recipient(patient=patient, channel="sms", now=NOW)
    assert rec.kind == "guardian"


def test_bundle_household_groups_shared_phone_same_day():
    """Test 5: Two recipients sharing phone + same appt-day → 1 bundled Recipient."""
    appt_dt = NOW
    rec_a = Recipient(
        patient_id=str(uuid4()),
        kind="guardian",
        name="Pat",
        phone_e164="+14155551000",
        email=None,
    )
    rec_b = Recipient(
        patient_id=str(uuid4()),
        kind="guardian",
        name="Pat",
        phone_e164="+14155551000",
        email=None,
    )
    out = bundle_household_recipients(
        recipients_with_appts=[
            (rec_a, "appt-1", appt_dt),
            (rec_b, "appt-2", appt_dt),
        ],
    )
    assert len(out) == 1
    assert out[0].bundled_appointment_ids == ["appt-1", "appt-2"]


def test_bundle_does_not_group_different_days():
    """Same phone but different dates → 2 separate recipients (no bundle)."""
    rec = Recipient(
        patient_id=str(uuid4()),
        kind="patient",
        name="Pat",
        phone_e164="+14155551000",
        email=None,
    )
    rec2 = Recipient(
        patient_id=str(uuid4()),
        kind="patient",
        name="Sam",
        phone_e164="+14155551000",
        email=None,
    )
    out = bundle_household_recipients(
        recipients_with_appts=[
            (rec, "a1", NOW),
            (rec2, "a2", NOW + timedelta(days=1)),
        ],
    )
    assert len(out) == 2
    assert all(r.bundled_appointment_ids is None for r in out)


def test_single_appointment_passes_through_unchanged():
    """Test 7: Single recipient → not bundled."""
    rec = Recipient(
        patient_id=str(uuid4()),
        kind="patient",
        name="Sole",
        phone_e164="+14155552000",
        email=None,
    )
    out = bundle_household_recipients(recipients_with_appts=[(rec, "a1", NOW)])
    assert len(out) == 1
    assert out[0].bundled_appointment_ids is None


def test_render_bundled_body_matches_context_example():
    """Test 6: bundled body shape matches CONTEXT example."""
    body = render_bundled_body(count=3, clinic_name="Sunset Eye Clinic", link="https://x.test/v")
    assert "3 family appointments" in body
    assert "Sunset Eye Clinic" in body
    assert "https://x.test/v" in body


def test_no_dob_treats_as_adult():
    """Patient missing dob defaults to adult flow (caller's responsibility to handle)."""
    patient = {
        "id": uuid4(),
        "first_name": "Pat",
        "phone_e164": "+14155553000",
    }
    rec = resolve_recipient(patient=patient, channel="sms", now=NOW)
    assert rec.kind == "patient"
