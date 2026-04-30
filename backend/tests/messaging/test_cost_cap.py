"""Tests for backend/services/messaging/cost_cap.py.

Mocks the AsyncSession.execute path to avoid an async-SQLite dependency.
The cost_cap functions only depend on a single SELECT + flush, so a fake
session keeps the test fast and dep-free.
"""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from backend.db.models.public.saas import Tenant
from backend.services.messaging.cost_cap import (
    DEFAULT_CAP_CENTS,
    CostCapExceeded,
    Reservation,
    get_cap_state,
    refund_reservation,
    reserve_spend_or_raise,
)


def _fake_tenant(messaging_settings: dict | None = None) -> Tenant:
    """Build a transient Tenant ORM object (not persisted) — needed so
    SQLAlchemy's `flag_modified` is satisfied inside cost_cap functions.
    """
    t = Tenant(
        id=uuid4(),
        name="Test Clinic",
        slug=f"clinic-{uuid4().hex[:8]}",
        schema_name=f"clinic_{uuid4().hex[:8]}",
        timezone="America/Los_Angeles",
        settings_jsonb={"messaging": messaging_settings or {}},
    )
    return t


def _fake_session(tenant):
    """Build a fake AsyncSession whose execute() returns `tenant` from scalar_one()."""

    def _execute(_stmt):
        result = MagicMock()
        result.scalar_one = MagicMock(return_value=tenant)
        return result

    session = MagicMock()
    session.execute = AsyncMock(side_effect=_execute)
    session.flush = AsyncMock()
    return session


@pytest.mark.asyncio
async def test_get_cap_state_fresh_tenant():
    """Test 16: Fresh tenant returns 0 spent / default cap / 0%."""
    tenant = _fake_tenant({})
    session = _fake_session(tenant)
    state = await get_cap_state(session, tenant.id)
    assert state.spent_cents == 0
    assert state.cap_cents == DEFAULT_CAP_CENTS
    assert state.pct == 0.0
    assert not state.is_warn_zone
    assert not state.is_hard_stop


@pytest.mark.asyncio
async def test_reserve_increments_daily_spend():
    """Test 17: reserve_spend_or_raise increments by per-segment cost."""
    tenant = _fake_tenant({})
    session = _fake_session(tenant)
    res = await reserve_spend_or_raise(session, tenant.id, "sms", segments=1)
    assert isinstance(res, Reservation)
    assert res.cost_cents == 1
    assert tenant.settings_jsonb["messaging"]["daily_spend_cents"] == 1
    session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_reserve_raises_when_cap_exceeded():
    """Test 18: Raises CostCapExceeded when reservation would breach cap."""
    tenant = _fake_tenant({
        "daily_sms_cap_cents": DEFAULT_CAP_CENTS,
        "daily_spend_cents": DEFAULT_CAP_CENTS,
        "daily_spend_date": date.today().isoformat(),
    })
    session = _fake_session(tenant)
    with pytest.raises(CostCapExceeded):
        await reserve_spend_or_raise(session, tenant.id, "sms", segments=1)


@pytest.mark.asyncio
async def test_admin_override_bypasses_cap():
    """Test 22: admin_override flag bypasses 100% cap."""
    tenant = _fake_tenant({
        "daily_sms_cap_cents": DEFAULT_CAP_CENTS,
        "daily_spend_cents": DEFAULT_CAP_CENTS,
        "daily_spend_date": date.today().isoformat(),
    })
    session = _fake_session(tenant)
    res = await reserve_spend_or_raise(
        session, tenant.id, "sms", segments=1, admin_override=True
    )
    assert res.override is True


@pytest.mark.asyncio
async def test_refund_decrements_daily_spend():
    """Test 19: refund_reservation decrements daily_spend_cents."""
    tenant = _fake_tenant({})
    session = _fake_session(tenant)
    res = await reserve_spend_or_raise(session, tenant.id, "sms", segments=3)
    assert tenant.settings_jsonb["messaging"]["daily_spend_cents"] == 3
    await refund_reservation(session, tenant.id, res)
    assert tenant.settings_jsonb["messaging"]["daily_spend_cents"] == 0


@pytest.mark.asyncio
async def test_daily_counter_resets_at_midnight():
    """Test 20: when daily_spend_date != today, the counter resets."""
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    tenant = _fake_tenant({
        "daily_sms_cap_cents": DEFAULT_CAP_CENTS,
        "daily_spend_cents": 999,
        "daily_spend_date": yesterday,
    })
    session = _fake_session(tenant)
    state = await get_cap_state(session, tenant.id)
    assert state.spent_cents == 0


@pytest.mark.asyncio
async def test_warn_zone_at_80_percent():
    """Test 21: 80% threshold detector returns is_warn_zone=True."""
    eighty_pct = int(DEFAULT_CAP_CENTS * 0.8)
    tenant = _fake_tenant({
        "daily_sms_cap_cents": DEFAULT_CAP_CENTS,
        "daily_spend_cents": eighty_pct,
        "daily_spend_date": date.today().isoformat(),
    })
    session = _fake_session(tenant)
    state = await get_cap_state(session, tenant.id)
    assert state.is_warn_zone is True
    assert state.is_hard_stop is False


@pytest.mark.asyncio
async def test_email_costs_one_cent():
    """Email reservation costs flat 1 cent regardless of segments arg."""
    tenant = _fake_tenant({})
    session = _fake_session(tenant)
    res = await reserve_spend_or_raise(session, tenant.id, "email", segments=10)
    assert res.cost_cents == 1
