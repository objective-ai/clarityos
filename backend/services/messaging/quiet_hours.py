"""Quiet hours: 9pm-8am patient-local, DST-safe.

Per CONTEXT.md:
- Fixed window 9pm-8am, no per-clinic override in v1
- Defers messages to next allowed 8am patient-local
- Falls back to tenant.timezone when patient has no override

DST safety: relies on `zoneinfo.ZoneInfo` for arithmetic — never naive
hour subtraction. Spring-forward / fall-back transitions resolve correctly
because the comparison is done after astimezone() on the appropriate tz.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


QUIET_START_HOUR = 21  # 9pm
QUIET_END_HOUR = 8     # 8am — sends allowed AT 8:00:00 sharp


def _resolve_tz(patient_contact_info: dict, tenant_timezone: str) -> ZoneInfo:
    tz_name = patient_contact_info.get("timezone") or tenant_timezone
    return ZoneInfo(tz_name)


def is_in_quiet_hours(
    *,
    patient_contact_info: dict,
    tenant_timezone: str,
    now_utc: datetime | None = None,
) -> bool:
    now_utc = now_utc or datetime.now(timezone.utc)
    tz = _resolve_tz(patient_contact_info, tenant_timezone)
    local = now_utc.astimezone(tz)
    return local.hour >= QUIET_START_HOUR or local.hour < QUIET_END_HOUR


def next_allowed_window(
    *,
    patient_contact_info: dict,
    tenant_timezone: str,
    now_utc: datetime | None = None,
) -> datetime:
    """Return UTC datetime of next 8am patient-local.

    If the current moment is already inside the allowed window (8am <= local < 9pm),
    returns `now_utc` unchanged — caller should not defer.
    """
    now_utc = now_utc or datetime.now(timezone.utc)
    tz = _resolve_tz(patient_contact_info, tenant_timezone)
    local = now_utc.astimezone(tz)

    if QUIET_END_HOUR <= local.hour < QUIET_START_HOUR:
        return now_utc

    if local.hour < QUIET_END_HOUR:
        candidate_local = local.replace(
            hour=QUIET_END_HOUR, minute=0, second=0, microsecond=0
        )
    else:
        next_day = local.date() + timedelta(days=1)
        candidate_local = datetime.combine(
            next_day, time(QUIET_END_HOUR, 0), tzinfo=tz
        )

    return candidate_local.astimezone(timezone.utc)
