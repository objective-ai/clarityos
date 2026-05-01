"""Tests for backend/services/messaging/scheduler.py.

Critical: test_household_bundling_dispatches_one_sms verifies CRM-19 production
wiring — _process_tenant must call bundle_household_reminders BEFORE the dispatch
loop and produce ONE dispatch() call for a 2-member household, not two.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

# Mapper bootstrap
import backend.db.models.tenant.intake  # noqa: F401
from backend.services.messaging import scheduler as scheduler_module
from backend.services.messaging.scheduler import (
    _process_deferred,
    start_scheduler,
    stop_scheduler,
    tick_messaging_scheduler,
)


# -----------------------------------------------------------------------------
# Fakes
# -----------------------------------------------------------------------------


@dataclass
class FakeTenant:
    id: UUID
    name: str = "Clinic"
    timezone: str = "UTC"
    settings_jsonb: dict | None = None


@dataclass
class FakeMessageLog:
    id: UUID
    tenant_id: UUID
    status: str
    deferred_until: datetime | None
    deleted_at: datetime | None = None
    failure_reason: str | None = None


class FakeSchedulerDB:
    """Stand-in AsyncSession for the scheduler.

    Captures calls to db.execute() and routes them to canned responses keyed on
    the SQL substring. Tests can override `tenants`, `due`, `deferred_logs`.
    """

    def __init__(
        self,
        *,
        advisory_lock_returns: bool = True,
        tenants: list[FakeTenant] | None = None,
        deferred_logs: list[FakeMessageLog] | None = None,
    ):
        self.advisory_lock_returns = advisory_lock_returns
        self.tenants = tenants or []
        self.deferred_logs = deferred_logs or []
        self.executed_sql: list[str] = []
        self.committed = False
        self.flushed = False

    async def execute(self, stmt):
        sql = str(stmt)
        self.executed_sql.append(sql)

        if "pg_try_advisory_lock" in sql:
            return SimpleNamespace(scalar=lambda: self.advisory_lock_returns)
        if "pg_advisory_unlock" in sql:
            return SimpleNamespace(scalar=lambda: True)
        if "tenants" in sql:
            return SimpleNamespace(
                scalars=lambda: SimpleNamespace(all=lambda: self.tenants)
            )
        if "message_log" in sql:
            return SimpleNamespace(
                scalars=lambda: SimpleNamespace(all=lambda: self.deferred_logs)
            )
        return SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=lambda: []),
            scalar=lambda: None,
            scalar_one=lambda: None,
            scalar_one_or_none=lambda: None,
        )

    async def commit(self):
        self.committed = True

    async def flush(self):
        self.flushed = True


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_scheduler_task():
    scheduler_module._task = None
    yield
    scheduler_module._task = None


@pytest.fixture
def tenant_id():
    return uuid4()


@pytest.fixture
def now_utc():
    return datetime(2026, 5, 1, 15, 0, tzinfo=timezone.utc)


# -----------------------------------------------------------------------------
# Tests
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tick_no_due_no_deferred_returns_zero(monkeypatch, tenant_id):
    db = FakeSchedulerDB(tenants=[])
    counts = await tick_messaging_scheduler(db)
    assert counts["due_count"] == 0
    assert counts["sent"] == 0
    assert counts["bundled_groups"] == 0
    assert counts["skipped_lock"] == 0


@pytest.mark.asyncio
async def test_tick_singleton_due_dispatches_via_dispatch_reminder(
    monkeypatch, tenant_id, now_utc
):
    """One due reminder for one patient → dispatch_reminder called once (singleton path)."""
    p1 = uuid4()
    a1 = uuid4()

    tenant = FakeTenant(
        id=tenant_id,
        settings_jsonb={"messaging": {"messaging_enabled": True}},
    )

    from backend.services.messaging.reminder_cadence import DueReminder

    due = [
        DueReminder(
            appointment_id=a1,
            patient_id=p1,
            touch_index=2,
            template_kind="reminder_24h",
            appt_start_time=now_utc + timedelta(hours=24),
        )
    ]

    monkeypatch.setattr(
        scheduler_module,
        "_process_deferred",
        AsyncMock(return_value=0),
    )
    monkeypatch.setattr(
        "backend.services.messaging.reminder_cadence.compute_due_reminders",
        AsyncMock(return_value=due),
    )
    dispatch_reminder_mock = AsyncMock()
    dispatch_bundled_mock = AsyncMock()
    monkeypatch.setattr(
        "backend.services.messaging.reminder_cadence.dispatch_reminder",
        dispatch_reminder_mock,
    )
    monkeypatch.setattr(
        "backend.services.messaging.reminder_cadence.dispatch_bundled_reminder",
        dispatch_bundled_mock,
    )

    async def fake_bundle(due_list, *, fetch_patient):
        # simulate one singleton group
        return {("phone", "date", 2, "reminder_24h"): list(due_list)}

    monkeypatch.setattr(
        "backend.services.messaging.reminder_cadence.bundle_household_reminders",
        fake_bundle,
    )

    db = FakeSchedulerDB(tenants=[tenant])
    counts = await tick_messaging_scheduler(db)

    assert dispatch_reminder_mock.await_count == 1
    assert dispatch_bundled_mock.await_count == 0
    assert counts["sent"] == 1
    assert counts["bundled_groups"] == 1


@pytest.mark.asyncio
async def test_household_bundling_dispatches_one_sms(monkeypatch, tenant_id, now_utc):
    """CRM-19 production wiring: 2 due reminders sharing phone → ONE dispatch_bundled_reminder."""
    p1, p2 = uuid4(), uuid4()
    a1, a2 = uuid4(), uuid4()

    tenant = FakeTenant(
        id=tenant_id,
        settings_jsonb={"messaging": {"messaging_enabled": True}},
    )

    from backend.services.messaging.reminder_cadence import DueReminder

    due = [
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

    monkeypatch.setattr(
        scheduler_module, "_process_deferred", AsyncMock(return_value=0)
    )
    monkeypatch.setattr(
        "backend.services.messaging.reminder_cadence.compute_due_reminders",
        AsyncMock(return_value=due),
    )
    dispatch_reminder_mock = AsyncMock()
    dispatch_bundled_mock = AsyncMock()
    monkeypatch.setattr(
        "backend.services.messaging.reminder_cadence.dispatch_reminder",
        dispatch_reminder_mock,
    )
    monkeypatch.setattr(
        "backend.services.messaging.reminder_cadence.dispatch_bundled_reminder",
        dispatch_bundled_mock,
    )

    async def fake_bundle(due_list, *, fetch_patient):
        # simulate ONE group of 2 (shared household)
        return {("+14155550199", "2026-05-02", 2, "reminder_24h"): list(due_list)}

    monkeypatch.setattr(
        "backend.services.messaging.reminder_cadence.bundle_household_reminders",
        fake_bundle,
    )

    db = FakeSchedulerDB(tenants=[tenant])
    counts = await tick_messaging_scheduler(db)

    assert dispatch_bundled_mock.await_count == 1, "CRM-19: one bundled SMS, not two"
    assert dispatch_reminder_mock.await_count == 0
    assert counts["bundled_groups"] == 1
    assert counts["sent"] == 1


@pytest.mark.asyncio
async def test_tick_cancels_expired_deferred_messages(monkeypatch, tenant_id, now_utc):
    """v1 limitation: scheduler CANCELS deferred messages whose window passed."""
    log = FakeMessageLog(
        id=uuid4(),
        tenant_id=tenant_id,
        status="deferred",
        deferred_until=now_utc - timedelta(hours=1),
    )
    db = FakeSchedulerDB(deferred_logs=[log])

    count = await _process_deferred(db, tenant_id)
    assert count == 1
    assert log.status == "cancelled"
    assert log.failure_reason and "v1" in log.failure_reason


@pytest.mark.asyncio
async def test_messaging_scheduler_disabled_env_is_noop(monkeypatch):
    """Pitfall 7: MESSAGING_SCHEDULER_ENABLED=false makes start_scheduler a no-op."""
    monkeypatch.setenv("MESSAGING_SCHEDULER_ENABLED", "false")
    task = start_scheduler()
    assert task is None
    assert scheduler_module._task is None


@pytest.mark.asyncio
async def test_advisory_lock_failure_skips_tick(monkeypatch, tenant_id):
    """If pg_try_advisory_lock returns False, the tick exits without processing."""
    db = FakeSchedulerDB(advisory_lock_returns=False, tenants=[FakeTenant(id=tenant_id)])
    counts = await tick_messaging_scheduler(db)
    assert counts["skipped_lock"] == 1
    # No tenant rows fetched because we exit before the SELECT
    tenant_queries = [s for s in db.executed_sql if "FROM tenants" in s]
    assert tenant_queries == []


@pytest.mark.asyncio
async def test_loop_exception_is_swallowed_and_loop_continues(monkeypatch):
    """An exception inside tick_messaging_scheduler must not crash the loop."""
    from backend.services.messaging import scheduler as sched

    iteration_count = {"n": 0}

    async def failing_tick(db):
        iteration_count["n"] += 1
        if iteration_count["n"] == 1:
            raise RuntimeError("boom")
        # Stop the loop on second iteration by cancelling
        raise asyncio.CancelledError()

    import asyncio

    monkeypatch.setattr(sched, "tick_messaging_scheduler", failing_tick)
    monkeypatch.setattr(sched, "_TICK_SECONDS", 0)

    class _CtxMgr:
        async def __aenter__(self):
            return MagicMock()

        async def __aexit__(self, *a):
            return False

    class _Maker:
        def __call__(self):
            return _CtxMgr()

    monkeypatch.setattr("backend.db.session.AsyncSessionLocal", _Maker())

    with pytest.raises(asyncio.CancelledError):
        await sched._scheduler_loop()
    assert iteration_count["n"] == 2  # second iter ran after first one's exception
