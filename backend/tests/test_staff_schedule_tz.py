"""
test_staff_schedule_tz.py — Unit tests for _clinic_date_from_utc timezone date derivation.

All calls use ZoneInfo objects (not bare strings), matching the function's type signature.
Run from project root:
  cd backend && PYTHONPATH=c:/Users/duytr/Projects/clarityos pytest tests/test_staff_schedule_tz.py -v
"""
from datetime import datetime, timezone, date
from zoneinfo import ZoneInfo

from api.routes.staff_schedule import _clinic_date_from_utc


def test_clinic_date_utc_midnight_is_same_day():
    dt = datetime(2026, 4, 21, 0, 0, tzinfo=timezone.utc)
    assert _clinic_date_from_utc(dt, ZoneInfo("UTC")) == date(2026, 4, 21)


def test_clinic_date_la_evening_same_as_utc_next_day():
    # 2026-04-21 02:30 UTC = 2026-04-20 19:30 America/Los_Angeles (PDT, UTC-7)
    dt = datetime(2026, 4, 21, 2, 30, tzinfo=timezone.utc)
    assert _clinic_date_from_utc(dt, ZoneInfo("America/Los_Angeles")) == date(2026, 4, 20)


def test_clinic_date_auckland_morning_ahead_of_utc():
    # 2026-04-20 22:00 UTC = 2026-04-21 10:00 Pacific/Auckland (NZST, UTC+12)
    dt = datetime(2026, 4, 20, 22, 0, tzinfo=timezone.utc)
    assert _clinic_date_from_utc(dt, ZoneInfo("Pacific/Auckland")) == date(2026, 4, 21)


def test_clinic_date_naive_datetime_treated_as_utc():
    # Naive datetime — helper fills UTC tzinfo (per implementation: dt.replace(tzinfo=dt_timezone.utc))
    dt = datetime(2026, 4, 21, 15, 0)  # naive
    assert _clinic_date_from_utc(dt, ZoneInfo("UTC")) == date(2026, 4, 21)


def test_clinic_date_la_noon_utc_is_la_morning():
    # 2026-04-21 12:00 UTC = 2026-04-21 05:00 America/Los_Angeles (same calendar day)
    dt = datetime(2026, 4, 21, 12, 0, tzinfo=timezone.utc)
    assert _clinic_date_from_utc(dt, ZoneInfo("America/Los_Angeles")) == date(2026, 4, 21)
