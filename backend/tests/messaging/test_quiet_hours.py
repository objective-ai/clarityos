"""Tests for backend/services/messaging/quiet_hours.py.

Covers boundary conditions around 8am / 9pm patient-local + DST transitions.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from backend.services.messaging.quiet_hours import (
    is_in_quiet_hours,
    next_allowed_window,
)


PT = ZoneInfo("America/Los_Angeles")


def _utc_for_pt(year, month, day, hour, minute=0):
    """Return a UTC datetime that maps to the given Pacific local wall-clock time."""
    local = datetime(year, month, day, hour, minute, tzinfo=PT)
    return local.astimezone(timezone.utc)


# Test 8: in quiet hours at 21:30 patient-local
def test_in_quiet_hours_at_21_30_local():
    now = _utc_for_pt(2026, 5, 1, 21, 30)
    assert is_in_quiet_hours(
        patient_contact_info={"timezone": "America/Los_Angeles"},
        tenant_timezone="America/Los_Angeles",
        now_utc=now,
    )


# Test 9: in quiet hours at 03:00 patient-local
def test_in_quiet_hours_at_03_00_local():
    now = _utc_for_pt(2026, 5, 1, 3, 0)
    assert is_in_quiet_hours(
        patient_contact_info={"timezone": "America/Los_Angeles"},
        tenant_timezone="America/Los_Angeles",
        now_utc=now,
    )


# Test 10: NOT in quiet hours at 09:00 patient-local
def test_not_in_quiet_hours_at_09_00_local():
    now = _utc_for_pt(2026, 5, 1, 9, 0)
    assert not is_in_quiet_hours(
        patient_contact_info={"timezone": "America/Los_Angeles"},
        tenant_timezone="America/Los_Angeles",
        now_utc=now,
    )


# Test 11: NOT in quiet hours at 20:30 patient-local (still allowed)
def test_not_in_quiet_hours_at_20_30_local():
    now = _utc_for_pt(2026, 5, 1, 20, 30)
    assert not is_in_quiet_hours(
        patient_contact_info={"timezone": "America/Los_Angeles"},
        tenant_timezone="America/Los_Angeles",
        now_utc=now,
    )


# Test 12: next_allowed_window from 22:00 -> 8am next day
def test_next_allowed_window_after_9pm_returns_8am_next_day():
    now = _utc_for_pt(2026, 5, 1, 22, 0)  # Thursday 10pm PT
    nxt = next_allowed_window(
        patient_contact_info={"timezone": "America/Los_Angeles"},
        tenant_timezone="America/Los_Angeles",
        now_utc=now,
    )
    nxt_local = nxt.astimezone(PT)
    assert nxt_local.date() == date(2026, 5, 2)
    assert nxt_local.hour == 8 and nxt_local.minute == 0


# Test 13: next_allowed_window from 03:00 -> 8am same day
def test_next_allowed_window_at_3am_returns_8am_same_day():
    now = _utc_for_pt(2026, 5, 1, 3, 0)
    nxt = next_allowed_window(
        patient_contact_info={"timezone": "America/Los_Angeles"},
        tenant_timezone="America/Los_Angeles",
        now_utc=now,
    )
    nxt_local = nxt.astimezone(PT)
    assert nxt_local.date() == date(2026, 5, 1)
    assert nxt_local.hour == 8 and nxt_local.minute == 0


# Test 14: DST spring-forward — next 8am is correct via zoneinfo arithmetic
def test_dst_spring_forward_next_window_correct():
    """2026-03-08 02:00 PT → 03:00 PDT spring-forward.

    At 07:30 PDT on this day, next 8am must be 30 minutes away (PDT).
    """
    # 07:30 PDT on 2026-03-08 = UTC-7 → 14:30 UTC
    now_utc = datetime(2026, 3, 8, 14, 30, tzinfo=timezone.utc)
    nxt = next_allowed_window(
        patient_contact_info={"timezone": "America/Los_Angeles"},
        tenant_timezone="America/Los_Angeles",
        now_utc=now_utc,
    )
    nxt_local = nxt.astimezone(PT)
    assert nxt_local.date() == date(2026, 3, 8)
    assert nxt_local.hour == 8 and nxt_local.minute == 0


def test_dst_fall_back_does_not_double_count():
    """2026-11-01 02:00 PDT → 01:00 PST fall-back.

    Verify is_in_quiet_hours behaves at the ambiguous hour (1:30am PT can occur twice).
    Both instances must resolve to "in quiet hours".
    """
    # 1:30am-PDT = 08:30 UTC; 1:30am-PST = 09:30 UTC. Both should be quiet.
    pdt_instant = datetime(2026, 11, 1, 8, 30, tzinfo=timezone.utc)
    pst_instant = datetime(2026, 11, 1, 9, 30, tzinfo=timezone.utc)
    for now in (pdt_instant, pst_instant):
        assert is_in_quiet_hours(
            patient_contact_info={"timezone": "America/Los_Angeles"},
            tenant_timezone="America/Los_Angeles",
            now_utc=now,
        )


# Test 15: Default to clinic timezone when patient has no override
def test_falls_back_to_clinic_timezone():
    now = _utc_for_pt(2026, 5, 1, 22, 0)  # 10pm PT
    assert is_in_quiet_hours(
        patient_contact_info={},  # no patient timezone
        tenant_timezone="America/Los_Angeles",
        now_utc=now,
    )


def test_next_allowed_returns_now_when_already_in_window():
    """If we call next_allowed_window during business hours, it returns now (no defer)."""
    now = _utc_for_pt(2026, 5, 1, 14, 0)  # 2pm PT
    nxt = next_allowed_window(
        patient_contact_info={"timezone": "America/Los_Angeles"},
        tenant_timezone="America/Los_Angeles",
        now_utc=now,
    )
    assert nxt == now
