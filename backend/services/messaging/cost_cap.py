"""Daily per-clinic spend cap.

Stored in tenant.settings_jsonb under the "messaging" key:
  daily_sms_cap_cents: int (default 2500 = $25)
  daily_spend_cents:   int (running counter — reset at first reservation of new day)
  daily_spend_date:    str (ISO date — used to detect rollover)

Cost constants (RESEARCH § Number Provisioning):
  SMS:   ~0.83 cents per outbound segment → rounded up to 1 cent for safe estimation
  Email: ~0.04 cents per email (Postmark)  → rounded up to 1 cent

NOTE: For pilot scale (<500 sends/day per clinic) this is a simple read-modify-write
on tenant.settings_jsonb. At scale, migrate to a dedicated `daily_spend_reservations`
table with row-level locking. RESEARCH § Open Questions #6.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.db.models.public.saas import Tenant


SMS_COST_CENTS_PER_SEGMENT = 1   # round up — Twilio 0.83¢ → 1¢
EMAIL_COST_CENTS = 1             # round up — Postmark 0.04¢ → 1¢
DEFAULT_CAP_CENTS = 2500         # $25/day


@dataclass
class CostCapState:
    spent_cents: int
    cap_cents: int
    pct: float
    is_warn_zone: bool      # >= 80%
    is_hard_stop: bool      # >= 100% AND no admin override


@dataclass
class Reservation:
    id: UUID
    cost_cents: int
    channel: str
    override: bool


class CostCapExceeded(Exception):
    pass


def _today_iso() -> str:
    return date.today().isoformat()


def _ensure_today_settings(messaging_settings: dict) -> dict:
    """Reset the running counter at midnight clinic-local. Caller persists the result."""
    today = _today_iso()
    if messaging_settings.get("daily_spend_date") != today:
        messaging_settings["daily_spend_date"] = today
        messaging_settings["daily_spend_cents"] = 0
    return messaging_settings


def _cost_for(channel: Literal["sms", "email"], segments: int) -> int:
    if channel == "sms":
        return SMS_COST_CENTS_PER_SEGMENT * max(1, segments)
    return EMAIL_COST_CENTS


async def get_cap_state(db: AsyncSession, tenant_id: UUID) -> CostCapState:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    msg = dict((tenant.settings_jsonb or {}).get("messaging", {}))
    msg = _ensure_today_settings(msg)
    cap = msg.get("daily_sms_cap_cents", DEFAULT_CAP_CENTS)
    spent = msg.get("daily_spend_cents", 0)
    pct = spent / cap if cap > 0 else 0.0
    return CostCapState(
        spent_cents=spent,
        cap_cents=cap,
        pct=pct,
        is_warn_zone=pct >= 0.8,
        is_hard_stop=pct >= 1.0,
    )


async def reserve_spend_or_raise(
    db: AsyncSession,
    tenant_id: UUID,
    channel: Literal["sms", "email"],
    segments: int,
    *,
    admin_override: bool = False,
) -> Reservation:
    """Atomically check + increment daily spend. Returns a Reservation token."""
    cost = _cost_for(channel, segments)
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    settings = dict(tenant.settings_jsonb or {})
    msg = _ensure_today_settings(dict(settings.get("messaging", {})))
    cap = msg.get("daily_sms_cap_cents", DEFAULT_CAP_CENTS)
    new_spent = msg.get("daily_spend_cents", 0) + cost

    if new_spent > cap and not admin_override:
        raise CostCapExceeded(
            f"Daily messaging cap reached (${cap / 100:.2f}). Use admin_override to bypass."
        )

    msg["daily_spend_cents"] = new_spent
    settings["messaging"] = msg
    tenant.settings_jsonb = settings
    flag_modified(tenant, "settings_jsonb")
    await db.flush()

    return Reservation(id=uuid4(), cost_cents=cost, channel=channel, override=admin_override)


async def refund_reservation(
    db: AsyncSession, tenant_id: UUID, reservation: Reservation
) -> None:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    settings = dict(tenant.settings_jsonb or {})
    msg = dict(settings.get("messaging", {}))
    msg["daily_spend_cents"] = max(0, msg.get("daily_spend_cents", 0) - reservation.cost_cents)
    settings["messaging"] = msg
    tenant.settings_jsonb = settings
    flag_modified(tenant, "settings_jsonb")
    await db.flush()
