"""Tests for backend/services/messaging/reminder_cadence.py.

Heavy DB ops are mocked — these tests cover the cadence math, idempotency
counters, and CRM-19 household bundling. End-to-end dispatch is covered
in test_scheduler.py.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from freezegun import freeze_time

# Mapper bootstrap
import backend.db.models.tenant.intake  # noqa: F401
from backend.core.security import TenantContext
from backend.services.messaging import reminder_cadence as rc
from backend.services.messaging.opt_out_guard import OptOutBlocked
from backend.services.messaging.reminder_cadence import (
    DueReminder,
    REMINDER_OFFSETS,
    bundle_household_reminders,
    compute_due_reminders,
    dispatch_bundled_reminder,
    dispatch_reminder,
    render_bundled_body,
)


# -----------------------------------------------------------------------------
# Fakes
# -----------------------------------------------------------------------------


@dataclass
class FakeAppointment:
    id: UUID
    patient_id: UUID
    start_time: datetime
    status: str = "scheduled"
    patient_confirmed_at: datetime | None = None
    reminders_sent_count: int = 0


class FakeDB:
    """In-memory AsyncSession stand-in.

    Holds a list of appointments + a captured-update list. compute_due_reminders
    issues one select per touch_index — we apply that filter in Python.
    """

    def __init__(self, appointments: list[FakeAppointment], tenant_id: UUID):
        self.appointments = appointments
        self.tenant_id = tenant_id
        self.updates: list[dict] = []

    async def execute(self, stmt):
        # Inspect the compiled SQL — duck-type the filter rather than parse it.
        # Easier: stash the filter intent in the test and let the helper apply it.
        compiled = str(stmt)
        # All compute_due_reminders queries select Appointment.
        if "FROM appointments" in compiled or "appointments" in compiled.lower():
            # Pull bound params from the where clause
            params = stmt.compile().params if hasattr(stmt, "compile") else {}
            start_lower = params.get("start_time_1")
            start_upper = params.get("start_time_2")
            touch_idx_max = params.get("reminders_sent_count_1")

            rows = [
                a
                for a in self.appointments
                if a.status not in ("cancelled", "no_show")
                and a.patient_confirmed_at is None
                and (start_lower is None or a.start_time >= start_lower)
                and (start_upper is None or a.start_time < start_upper)
                and (touch_idx_max is None or a.reminders_sent_count <= touch_idx_max)
            ]

            class _Result:
                def __init__(self, items):
                    self._items = items

                def scalars(self):
                    return self

                def all(self):
                    return list(self._items)

            return _Result(rows)
        return SimpleNamespace(scalar_one=lambda: None)


class FakeUpdateDB(FakeDB):
    """Adds in-memory tracking of update(Appointment).values(...) calls."""

    async def execute(self, stmt):
        compiled_str = str(stmt)
        if "UPDATE appointments" in compiled_str:
            # Capture the WHERE id == X + values dict
            try:
                params = stmt.compile().params
            except Exception:
                params = {}
            self.updates.append(params)
            # Apply to in-memory rows by matching id_1 param
            target_id = params.get("id_1")
            if target_id is not None:
                for a in self.appointments:
                    if a.id == target_id:
                        if "reminders_sent_count" in params:
                            a.reminders_sent_count = params["reminders_sent_count"]
            return SimpleNamespace()
        return await super().execute(stmt)


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture
def tenant_id():
    return uuid4()


@pytest.fixture
def ctx(tenant_id):
    return TenantContext(user_id=uuid4(), tenant_id=tenant_id, role="system")


@pytest.fixture
def now_utc():
    return datetime(2026, 5, 1, 15, 0, tzinfo=timezone.utc)


def _make_appt(
    *,
    patient_id: UUID | None = None,
    start_offset_hours: float = 24,
    now: datetime,
    status: str = "scheduled",
    confirmed: bool = False,
    sent_count: int = 0,
) -> FakeAppointment:
    return FakeAppointment(
        id=uuid4(),
        patient_id=patient_id or uuid4(),
        start_time=now + timedelta(hours=start_offset_hours),
        status=status,
        patient_confirmed_at=(now if confirmed else None),
        reminders_sent_count=sent_count,
    )


# -----------------------------------------------------------------------------
# Tests
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_offsets_constant_matches_truths():
    assert REMINDER_OFFSETS == [
        (0, 7 * 24, "reminder_7d"),
        (1, 72, "reminder_72h"),
        (2, 24, "reminder_24h"),
    ]


@pytest.mark.asyncio
async def test_compute_picks_up_7d_appointments(tenant_id, now_utc):
    appt = _make_appt(start_offset_hours=7 * 24 + 0.05, now=now_utc)
    db = FakeDB([appt], tenant_id)
    due = await compute_due_reminders(db, tenant_id, now=now_utc)
    assert len(due) == 1
    assert due[0].template_kind == "reminder_7d"
    assert due[0].touch_index == 0


@pytest.mark.asyncio
async def test_compute_picks_up_72h_appointments(tenant_id, now_utc):
    appt = _make_appt(start_offset_hours=72 + 0.05, now=now_utc)
    db = FakeDB([appt], tenant_id)
    due = await compute_due_reminders(db, tenant_id, now=now_utc)
    kinds = {d.template_kind for d in due}
    assert "reminder_72h" in kinds


@pytest.mark.asyncio
async def test_compute_picks_up_24h_appointments(tenant_id, now_utc):
    appt = _make_appt(start_offset_hours=24 + 0.05, now=now_utc)
    db = FakeDB([appt], tenant_id)
    due = await compute_due_reminders(db, tenant_id, now=now_utc)
    kinds = {d.template_kind for d in due}
    assert "reminder_24h" in kinds


@pytest.mark.asyncio
async def test_compute_skips_confirmed_appointments(tenant_id, now_utc):
    appt = _make_appt(start_offset_hours=24 + 0.05, now=now_utc, confirmed=True)
    db = FakeDB([appt], tenant_id)
    due = await compute_due_reminders(db, tenant_id, now=now_utc)
    assert due == []


@pytest.mark.asyncio
async def test_compute_skips_cancelled_and_no_show(tenant_id, now_utc):
    a1 = _make_appt(start_offset_hours=24 + 0.05, now=now_utc, status="cancelled")
    a2 = _make_appt(start_offset_hours=24 + 0.05, now=now_utc, status="no_show")
    db = FakeDB([a1, a2], tenant_id)
    due = await compute_due_reminders(db, tenant_id, now=now_utc)
    assert due == []


@pytest.mark.asyncio
async def test_compute_idempotent_via_sent_count(tenant_id, now_utc):
    """If reminders_sent_count == 1, the 24h touch (idx=2) is still due but the
    7d touch (idx=0) is not. The where clause is `sent_count <= touch_idx`.
    """
    appt = _make_appt(start_offset_hours=24 + 0.05, now=now_utc, sent_count=2)
    db = FakeDB([appt], tenant_id)
    due = await compute_due_reminders(db, tenant_id, now=now_utc)
    # sent_count=2 means only touches 0..2 are covered; touch 2 is the 24h reminder
    # which should still fire if its window matches AND sent_count <= 2.
    assert any(d.template_kind == "reminder_24h" for d in due)
    # But for a 7d-out appt with sent_count=2, the 7d touch (idx=0) should NOT fire.
    appt7 = _make_appt(start_offset_hours=7 * 24 + 0.05, now=now_utc, sent_count=2)
    db2 = FakeDB([appt7], tenant_id)
    due2 = await compute_due_reminders(db2, tenant_id, now=now_utc)
    assert all(d.template_kind != "reminder_7d" for d in due2)


@pytest.mark.asyncio
async def test_dispatch_reminder_calls_dispatch_with_template_kind(
    monkeypatch, ctx, now_utc
):
    """dispatch_reminder constructs DispatchRequest with the correct template_kind + tokens."""
    captured: dict = {}

    async def fake_dispatch(db, c, req, **kw):
        captured["req"] = req
        captured["patient"] = kw.get("patient")
        captured["tenant"] = kw.get("tenant")
        return MagicMock()

    monkeypatch.setattr(rc, "dispatch", fake_dispatch)

    appt_id = uuid4()
    pid = uuid4()
    start = now_utc + timedelta(hours=24)
    due = DueReminder(
        appointment_id=appt_id,
        patient_id=pid,
        touch_index=2,
        template_kind="reminder_24h",
        appt_start_time=start,
    )

    async def fetch_patient(_pid):
        return {
            "id": pid,
            "first_name": "Jane",
            "contact_info_jsonb": {"phone_e164": "+14155550100", "preferred_channel": "sms"},
        }

    async def fetch_template(kind, channel, lang):
        return {
            "id": uuid4(),
            "kind": kind,
            "channel": channel,
            "language": lang,
            "body": "Hi {{patient_first_name}}",
            "subject": None,
        }

    async def fetch_tenant():
        return {"id": ctx.tenant_id, "timezone": "America/Los_Angeles", "name": "Test Clinic"}

    db = FakeUpdateDB([], ctx.tenant_id)
    await dispatch_reminder(
        db,
        ctx,
        due=due,
        fetch_patient=fetch_patient,
        fetch_template=fetch_template,
        fetch_tenant=fetch_tenant,
    )
    req = captured["req"]
    assert req.template_kind == "reminder_24h"
    assert req.tokens["patient_first_name"] == "Jane"
    assert "appt_date" in req.tokens
    assert "appt_time" in req.tokens
    assert req.appointment_id == appt_id


@pytest.mark.asyncio
async def test_dispatch_reminder_increments_sent_count(monkeypatch, ctx, now_utc):
    monkeypatch.setattr(rc, "dispatch", AsyncMock())

    appt_id = uuid4()
    pid = uuid4()
    due = DueReminder(
        appointment_id=appt_id,
        patient_id=pid,
        touch_index=2,
        template_kind="reminder_24h",
        appt_start_time=now_utc + timedelta(hours=24),
    )

    async def fetch_patient(_pid):
        return {"id": pid, "first_name": "Jane", "contact_info_jsonb": {"phone_e164": "+1"}}

    async def fetch_template(*_a):
        return {"id": uuid4(), "body": "x", "subject": None}

    async def fetch_tenant():
        return {"id": ctx.tenant_id, "name": "Clinic", "timezone": "UTC"}

    appt = FakeAppointment(
        id=appt_id, patient_id=pid, start_time=now_utc + timedelta(hours=24)
    )
    db = FakeUpdateDB([appt], ctx.tenant_id)
    await dispatch_reminder(
        db,
        ctx,
        due=due,
        fetch_patient=fetch_patient,
        fetch_template=fetch_template,
        fetch_tenant=fetch_tenant,
    )
    assert any(u.get("reminders_sent_count") == 3 for u in db.updates)


@pytest.mark.asyncio
async def test_bundle_household_groups_shared_phone_same_date(now_utc):
    """Two patients sharing phone_e164 on the same date + touch get one group."""
    p1, p2 = uuid4(), uuid4()
    phone = "+14155550199"
    d1 = DueReminder(
        appointment_id=uuid4(),
        patient_id=p1,
        touch_index=2,
        template_kind="reminder_24h",
        appt_start_time=now_utc + timedelta(hours=24),
    )
    d2 = DueReminder(
        appointment_id=uuid4(),
        patient_id=p2,
        touch_index=2,
        template_kind="reminder_24h",
        appt_start_time=now_utc + timedelta(hours=24, minutes=30),
    )

    async def fetch_patient(pid):
        return {
            "id": pid,
            "first_name": "Jane" if pid == p1 else "Bob",
            "contact_info_jsonb": {"phone_e164": phone},
        }

    groups = await bundle_household_reminders([d1, d2], fetch_patient=fetch_patient)
    assert len(groups) == 1
    only_group = next(iter(groups.values()))
    assert {d.patient_id for d in only_group} == {p1, p2}


@pytest.mark.asyncio
async def test_render_bundled_body_names_two_patients(now_utc):
    bundle = [
        DueReminder(
            appointment_id=uuid4(),
            patient_id=uuid4(),
            touch_index=2,
            template_kind="reminder_24h",
            appt_start_time=now_utc + timedelta(hours=24),
        )
    ]
    body = render_bundled_body(bundle, patient_first_names=["Jane", "Bob"], clinic_name="EyeCare")
    assert "Jane and Bob" in body
    assert "EyeCare" in body
    assert "Reply YES" in body


@pytest.mark.asyncio
async def test_dispatch_bundled_reminder_one_dispatch_call_increments_all(
    monkeypatch, ctx, now_utc
):
    """CRM-19 cadence-side: one dispatch() call, ALL bundled appointments incremented."""
    dispatch_mock = AsyncMock()
    monkeypatch.setattr(rc, "dispatch", dispatch_mock)

    p1, p2 = uuid4(), uuid4()
    phone = "+14155550199"
    a1, a2 = uuid4(), uuid4()
    bundle = [
        DueReminder(
            appointment_id=a1,
            patient_id=p1,
            touch_index=2,
            template_kind="reminder_24h",
            appt_start_time=now_utc + timedelta(hours=24),
        ),
        DueReminder(
            appointment_id=a2,
            patient_id=p2,
            touch_index=2,
            template_kind="reminder_24h",
            appt_start_time=now_utc + timedelta(hours=24, minutes=30),
        ),
    ]

    async def fetch_patient(pid):
        return {
            "id": pid,
            "first_name": "Jane" if pid == p1 else "Bob",
            "contact_info_jsonb": {"phone_e164": phone, "preferred_channel": "sms"},
        }

    async def fetch_template(kind, channel, lang):
        return {"id": uuid4(), "body": "x", "subject": None}

    async def fetch_tenant():
        return {"id": ctx.tenant_id, "name": "Clinic", "timezone": "UTC"}

    appt1 = FakeAppointment(id=a1, patient_id=p1, start_time=now_utc + timedelta(hours=24))
    appt2 = FakeAppointment(id=a2, patient_id=p2, start_time=now_utc + timedelta(hours=24))
    db = FakeUpdateDB([appt1, appt2], ctx.tenant_id)

    await dispatch_bundled_reminder(
        db,
        ctx,
        bundle=bundle,
        fetch_patient=fetch_patient,
        fetch_template=fetch_template,
        fetch_tenant=fetch_tenant,
    )

    assert dispatch_mock.call_count == 1
    # Both appointments saw an UPDATE
    updated_ids = {u.get("id_1") for u in db.updates}
    assert {a1, a2}.issubset(updated_ids)
