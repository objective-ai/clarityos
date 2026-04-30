---
phase: 12
plan: 03
slug: sender-service
type: execute
wave: 2
depends_on: [12-00, 12-01]
files_modified:
  - backend/services/messaging/opt_out_guard.py
  - backend/services/messaging/quiet_hours.py
  - backend/services/messaging/cost_cap.py
  - backend/services/messaging/recipient_resolver.py
  - backend/services/messaging/sender.py
  - backend/tests/messaging/test_opt_out_guard.py
  - backend/tests/messaging/test_quiet_hours.py
  - backend/tests/messaging/test_cost_cap.py
  - backend/tests/messaging/test_sender.py
autonomous: true
gap_closure: false
requirements: [CRM-04, CRM-06, CRM-08, CRM-09, CRM-10, CRM-18, CRM-19]

must_haves:
  truths:
    - "preflight_or_raise blocks send when patient has revoked consent for the channel+purpose combo"
    - "is_in_quiet_hours returns True for 9pm-8am patient-local time, accounting for DST"
    - "next_allowed_window returns the next 8am patient-local as a UTC aware datetime"
    - "reserve_spend_or_raise increments daily_spend_cents atomically; raises CostCapExceeded at 100%"
    - "cost cap returns spent/cap/percent state; emits warning at 80%"
    - "resolve_recipient routes to guardian.phone when patient.age < 18"
    - "resolve_recipient bundles household: same-day appointments + shared phone → bundled body, single send"
    - "dispatch() is the ONLY function that calls Twilio/Resend SDKs (verified via grep)"
    - "dispatch() writes MessageLog + AuditLog in same DB transaction (clinical-safety rule)"
  artifacts:
    - path: "backend/services/messaging/opt_out_guard.py"
      provides: "preflight_or_raise(patient, channel, purpose) -> None | OptOutBlocked"
    - path: "backend/services/messaging/quiet_hours.py"
      provides: "is_in_quiet_hours, next_allowed_window — DST-safe"
    - path: "backend/services/messaging/cost_cap.py"
      provides: "reserve_spend_or_raise, refund_reservation, get_cap_state"
    - path: "backend/services/messaging/recipient_resolver.py"
      provides: "resolve_recipient(patient, channel) -> Recipient (handles minor → guardian)"
      exports: ["resolve_recipient", "Recipient", "bundle_household_recipients"]
    - path: "backend/services/messaging/sender.py"
      provides: "dispatch(db, ctx, DispatchRequest) -> MessageLog — the single choke point"
      exports: ["dispatch", "DispatchRequest", "OptOutBlocked", "CostCapExceeded", "QuietHoursDeferred"]
  key_links:
    - from: "backend/services/messaging/sender.py"
      to: "backend/services/messaging/twilio_client.py + resend_client.py"
      via: "send_sms / send_email — ONLY callsite"
      pattern: "from .twilio_client import send_sms"
    - from: "backend/services/messaging/sender.py"
      to: "backend/core/audit.py"
      via: "log_action(... AuditAction.MESSAGE_SENT)"
      pattern: "log_action.*MESSAGE_SENT"
---

<objective>
Build the single-choke-point sender service. Every outbound message — reminder, recall, manual, AI-drafted, bulk — funnels through `dispatch()`. This function is the only place that calls Twilio or Resend SDKs.

Why a choke point: opt-out, quiet hours, cost cap, audit logging, PHI guard, minor routing must run on EVERY send. Code review answers "is this bypass-able?" by checking one file.

Output:
- 4 small focused modules (opt_out_guard, quiet_hours, cost_cap, recipient_resolver) with deterministic logic
- 1 sender module orchestrating the guard chain
- 4 test files with high coverage of the guard chain (opt-out matrix, DST edge cases, cap enforcement, dispatch happy path + every guard failure)
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@.planning/phases/12-crm-patient-engagement/12-01-SUMMARY.md
@.planning/phases/12-crm-patient-engagement/12-02-SUMMARY.md
@./CLAUDE.md
@.claude/rules/clinical-safety.md
@backend/core/audit.py
@backend/db/models/tenant/clinical.py
@backend/db/models/tenant/messaging.py

<interfaces>
<!-- From Plan 12-01 -->
From backend/db/models/tenant/messaging.py:
- MessageLog (note status_priority field), MessageChannel, MessagePurpose, MessageStatus
From backend/db/models/tenant/clinical.py:
- AuditAction.MESSAGE_SENT, MESSAGE_DELIVERED, MESSAGE_FAILED, MESSAGE_DEFERRED, OPT_OUT_RECORDED, etc.
From patient ORM:
- Patient.contact_info_jsonb stores: {phone, email, consent_sms_marketing_at, consent_sms_operational_at, consent_email_marketing_at, consent_email_operational_at, sms_opted_out_at, paused_until, recall_exhausted, deceased, preferred_language, timezone, guardian: {name, phone_e164, email, relationship}, dob (existing column)}

From tenant ORM:
- Tenant.timezone (existing column, e.g. "America/Los_Angeles")
- Tenant.settings_jsonb["messaging"] = {messaging_enabled, daily_sms_cap_cents, twilio_phone_number, twilio_messaging_service_sid, resend_from_email, daily_spend_cents (running counter), daily_spend_date (ISO date)}

<!-- From Plan 12-02 -->
From backend/services/messaging/twilio_client.py:
- send_sms, validate_signature, provision_local_number — ONLY this file calls twilio.rest.Client
From backend/services/messaging/resend_client.py:
- send_email, verify_svix_signature — ONLY this file calls resend SDK
From backend/services/messaging/templates.py:
- render_template, scrub_phi_for_operational_sms, count_sms_segments, ALLOWED_TOKENS

<!-- Existing project -->
From backend/core/audit.py:
- async def log_action(db, ctx, action: AuditAction, *, resource_type, resource_id, patient_id=None, encounter_id=None, metadata=None) -> AuditLog

From backend/core/security.py:
- TenantContext (has user_id, tenant_id, role, staff_id)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Opt-out guard + quiet hours + cost cap (3 deterministic guard modules)</name>
  <files>
    backend/services/messaging/opt_out_guard.py,
    backend/services/messaging/quiet_hours.py,
    backend/services/messaging/cost_cap.py,
    backend/tests/messaging/test_opt_out_guard.py,
    backend/tests/messaging/test_quiet_hours.py,
    backend/tests/messaging/test_cost_cap.py
  </files>
  <read_first>
    - backend/db/models/tenant/messaging.py (created Plan 12-01 — MessageChannel, MessagePurpose enums)
    - .planning/phases/12-crm-patient-engagement/12-CONTEXT.md (lines 27, 31, 51-53 — quiet hours, cost cap, opt-out scope)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 567-575 — DST pitfall; lines 760-773 — quiet hours strategy; lines 990-993 — settings_jsonb storage)
    - backend/tests/messaging/conftest.py (frozen_clock fixture from Plan 12-00)
  </read_first>
  <behavior>
    **opt_out_guard:**
    - Test 1: Returns None (allows send) when patient has consent_sms_operational_at set + not opted out
    - Test 2: Raises OptOutBlocked when patient.contact_info.sms_opted_out_at is set, channel=sms
    - Test 3: Raises OptOutBlocked when channel=sms,purpose=marketing AND consent_sms_marketing_at is None
    - Test 4: Raises OptOutBlocked when channel=email,purpose=marketing AND consent_email_marketing_at is None
    - Test 5: Raises OptOutBlocked when paused_until is in the future
    - Test 6: Allows operational sends even when marketing consent is null (operational has separate consent flag)
    - Test 7: Table-driven test: 4 channels × 2 purposes × 2 consent states × 2 opt-out states = 32 combinations, all assertions match expected matrix

    **quiet_hours:**
    - Test 8: is_in_quiet_hours True at 21:30 patient-local
    - Test 9: is_in_quiet_hours True at 03:00 patient-local
    - Test 10: is_in_quiet_hours False at 09:00 patient-local
    - Test 11: is_in_quiet_hours False at 20:30 patient-local
    - Test 12: next_allowed_window returns 8am next day patient-local converted to UTC, when called at 22:00 patient-local
    - Test 13: next_allowed_window returns 8am same day when called at 03:00 patient-local
    - Test 14: DST spring-forward: when called at 7:30am patient-local on DST transition day, next 8am is correct (uses zoneinfo, not naive arithmetic)
    - Test 15: Defaults to clinic timezone when patient has no timezone override

    **cost_cap:**
    - Test 16: get_cap_state returns {spent_cents: 0, cap_cents: 2500, pct: 0.0} for fresh tenant
    - Test 17: reserve_spend_or_raise with channel=sms, segments=1 increments daily_spend_cents by ~1 cent (using fixed cost-per-segment constant)
    - Test 18: reserve_spend_or_raise raises CostCapExceeded when current spend + reservation would exceed cap
    - Test 19: refund_reservation decrements daily_spend_cents
    - Test 20: get_cap_state resets at midnight: spent_cents from previous day's `daily_spend_date` is ignored
    - Test 21: 80% threshold detector returns is_warn_zone=True when spent ≥ 0.8 × cap
    - Test 22: admin_override flag bypasses 100% cap (returns reservation, but tagged with override=true)
  </behavior>
  <action>
**Step 1.** Create `backend/services/messaging/opt_out_guard.py`:

```python
"""Opt-out preflight guard.

The single function `preflight_or_raise` is called by the sender choke point
on EVERY send. Cannot be bypassed.

Per CONTEXT.md: per-channel × per-purpose flags (4 combos):
  consent_sms_marketing, consent_sms_operational,
  consent_email_marketing, consent_email_operational.

Operational defaults to opted-in for new patients (CONTEXT line 77).
Marketing defaults to opted-out (must be explicitly granted).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal


class OptOutBlocked(Exception):
    """Raised when a send violates patient opt-out / consent / pause."""

    def __init__(self, reason: str, code: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.code = code


def preflight_or_raise(*, contact_info: dict, channel: Literal["sms", "email"], purpose: Literal["operational", "marketing", "manual"], now_utc: datetime | None = None) -> None:
    """Raise OptOutBlocked if send is forbidden by patient consent state.

    Manual sends are treated as operational for consent purposes (clinic-initiated
    individual care communication is an operational-class TCPA send).
    """
    now_utc = now_utc or datetime.now(timezone.utc)
    effective_purpose = "operational" if purpose == "manual" else purpose

    # 1. Hard-stop: SMS carrier-level opt-out
    if channel == "sms" and contact_info.get("sms_opted_out_at"):
        raise OptOutBlocked("Patient has opted out of SMS via STOP keyword.", "SMS_OPTED_OUT")

    # 2. Pause-until-date
    paused_until = contact_info.get("paused_until")
    if paused_until:
        if isinstance(paused_until, str):
            paused_until = datetime.fromisoformat(paused_until.replace("Z", "+00:00"))
        if paused_until > now_utc:
            raise OptOutBlocked(f"Patient communications paused until {paused_until.isoformat()}.", "PAUSED")

    # 3. Per-channel + per-purpose consent
    consent_key = f"consent_{channel}_{effective_purpose}_at"
    if not contact_info.get(consent_key):
        raise OptOutBlocked(
            f"Patient has not consented to {channel} {effective_purpose} messages.",
            f"NO_CONSENT_{channel.upper()}_{effective_purpose.upper()}",
        )

    # 4. Recall-specific: marketing class only sends if recall_exhausted is False
    if effective_purpose == "marketing" and contact_info.get("recall_exhausted"):
        raise OptOutBlocked("Recall sequence exhausted for this patient.", "RECALL_EXHAUSTED")

    # 5. Deceased / inactive
    if contact_info.get("deceased"):
        raise OptOutBlocked("Patient is marked deceased.", "DECEASED")
```

**Step 2.** Create `backend/services/messaging/quiet_hours.py`:

```python
"""Quiet hours: 9pm-8am patient-local, DST-safe.

Per CONTEXT.md:
- Fixed window 9pm-8am, no per-clinic override in v1
- Defers messages to next allowed 8am patient-local
- Falls back to tenant.timezone when patient has no override
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


QUIET_START_HOUR = 21  # 9pm
QUIET_END_HOUR = 8     # 8am — sends allowed AT 8:00:00 sharp


def _resolve_tz(patient_contact_info: dict, tenant_timezone: str) -> ZoneInfo:
    tz_name = patient_contact_info.get("timezone") or tenant_timezone
    return ZoneInfo(tz_name)


def is_in_quiet_hours(*, patient_contact_info: dict, tenant_timezone: str, now_utc: datetime | None = None) -> bool:
    now_utc = now_utc or datetime.now(timezone.utc)
    tz = _resolve_tz(patient_contact_info, tenant_timezone)
    local = now_utc.astimezone(tz)
    return local.hour >= QUIET_START_HOUR or local.hour < QUIET_END_HOUR


def next_allowed_window(*, patient_contact_info: dict, tenant_timezone: str, now_utc: datetime | None = None) -> datetime:
    """Return UTC datetime of next 8am patient-local."""
    now_utc = now_utc or datetime.now(timezone.utc)
    tz = _resolve_tz(patient_contact_info, tenant_timezone)
    local = now_utc.astimezone(tz)

    if local.hour < QUIET_END_HOUR:
        # before 8am today — next allowed is today at 8am
        candidate_local = local.replace(hour=QUIET_END_HOUR, minute=0, second=0, microsecond=0)
    else:
        # 8am today already passed (whether currently in allowed window or past 9pm)
        if QUIET_END_HOUR <= local.hour < QUIET_START_HOUR:
            return now_utc  # already in allowed window — no defer
        # past 9pm — defer to 8am tomorrow patient-local
        next_day = local.date() + timedelta(days=1)
        candidate_local = datetime.combine(next_day, time(QUIET_END_HOUR, 0), tzinfo=tz)

    return candidate_local.astimezone(timezone.utc)
```

**Step 3.** Create `backend/services/messaging/cost_cap.py`:

```python
"""Daily per-clinic spend cap.

Stored in tenant.settings_jsonb under the "messaging" key:
  daily_sms_cap_cents: int (default 2500 = $25)
  daily_spend_cents: int (running counter — reset at first reservation of new day)
  daily_spend_date: str (ISO date — used to detect rollover)

Cost constants (RESEARCH § Number Provisioning):
  SMS: 0.83 cents per segment outbound
  Email: 0.04 cents per email (Resend pricing)
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.db.models.public.saas import Tenant


SMS_COST_CENTS_PER_SEGMENT = 1     # round up — Twilio 0.83¢ → 1¢ for safe estimation
EMAIL_COST_CENTS = 1               # round up — Resend 0.04¢ → 1¢
DEFAULT_CAP_CENTS = 2500           # $25/day


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
    """Reset running counter at midnight clinic-local. Caller must persist the result."""
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
    msg = (tenant.settings_jsonb or {}).get("messaging", {})
    msg = _ensure_today_settings(dict(msg))
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
    """Atomically check + increment daily spend.

    NOTE: For pilot scale (<500 sends/day per clinic) this is a simple read-modify-write
    on tenant.settings_jsonb. At scale, migrate to a dedicated `daily_spend_reservations`
    table with row-level locking. RESEARCH § Open Questions #6.
    """
    cost = _cost_for(channel, segments)
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    settings = dict(tenant.settings_jsonb or {})
    msg = _ensure_today_settings(dict(settings.get("messaging", {})))
    cap = msg.get("daily_sms_cap_cents", DEFAULT_CAP_CENTS)
    new_spent = msg.get("daily_spend_cents", 0) + cost

    if new_spent > cap and not admin_override:
        raise CostCapExceeded(
            f"Daily messaging cap reached (${cap/100:.2f}). Use admin_override to bypass."
        )

    msg["daily_spend_cents"] = new_spent
    settings["messaging"] = msg
    tenant.settings_jsonb = settings
    await db.flush()

    return Reservation(id=uuid4(), cost_cents=cost, channel=channel, override=admin_override)


async def refund_reservation(db: AsyncSession, tenant_id: UUID, reservation: Reservation) -> None:
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    settings = dict(tenant.settings_jsonb or {})
    msg = dict(settings.get("messaging", {}))
    msg["daily_spend_cents"] = max(0, msg.get("daily_spend_cents", 0) - reservation.cost_cents)
    settings["messaging"] = msg
    tenant.settings_jsonb = settings
    await db.flush()
```

**Step 4.** Create the 3 test files matching all 22 behavior cases. Use `frozen_clock` for quiet hours / DST tests. For cost cap tests, use real `AsyncSession` against an in-memory SQLite OR mock Tenant.settings_jsonb directly.

DST test pattern:
```python
def test_dst_spring_forward(monkeypatch):
    # 2026-03-08 02:00 → 03:00 (US DST jump). At 07:30 patient-local on this day,
    # next 8am must be 30 minutes away in wall-clock (not 1.5h, not 0.5h-arithmetic).
    contact = {"timezone": "America/Los_Angeles"}
    # Use a fixed UTC time that maps to 07:30 PDT on 2026-03-08
    now_utc = datetime(2026, 3, 8, 14, 30, tzinfo=timezone.utc)  # PDT = UTC-7 post-jump
    nxt = next_allowed_window(patient_contact_info=contact, tenant_timezone="America/Los_Angeles", now_utc=now_utc)
    nxt_local = nxt.astimezone(ZoneInfo("America/Los_Angeles"))
    assert nxt_local.hour == 8 and nxt_local.minute == 0 and nxt_local.date() == date(2026, 3, 8)
```
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_opt_out_guard.py tests/messaging/test_quiet_hours.py tests/messaging/test_cost_cap.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "class OptOutBlocked" backend/services/messaging/opt_out_guard.py` returns 1
    - `grep -c "def preflight_or_raise" backend/services/messaging/opt_out_guard.py` returns 1
    - `grep -c "def is_in_quiet_hours" backend/services/messaging/quiet_hours.py` returns 1
    - `grep -c "def next_allowed_window" backend/services/messaging/quiet_hours.py` returns 1
    - `grep -c "ZoneInfo" backend/services/messaging/quiet_hours.py` returns at least 1 (DST-safe)
    - `grep -c "class CostCapExceeded" backend/services/messaging/cost_cap.py` returns 1
    - `grep -c "async def reserve_spend_or_raise" backend/services/messaging/cost_cap.py` returns 1
    - `grep -c "DEFAULT_CAP_CENTS" backend/services/messaging/cost_cap.py` returns at least 1
    - `cd backend && pytest tests/messaging/test_opt_out_guard.py -x -q` exits 0; at least 7 tests + 32 parametrized matrix runs
    - `cd backend && pytest tests/messaging/test_quiet_hours.py -x -q` exits 0; at least 8 tests including DST
    - `cd backend && pytest tests/messaging/test_cost_cap.py -x -q` exits 0; at least 7 tests
  </acceptance_criteria>
  <done>3 guard modules with deterministic logic, ≥22 behavior cases tested + opt-out matrix parametrize. DST proven safe.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Recipient resolver (minor → guardian routing) + household bundling</name>
  <files>
    backend/services/messaging/recipient_resolver.py,
    backend/tests/messaging/test_recipient_resolver.py
  </files>
  <read_first>
    - backend/db/models/tenant/clinical.py (find Patient model — has `dob` column or stores DOB in contact_info_jsonb)
    - .planning/phases/12-crm-patient-engagement/12-CONTEXT.md (lines 81-82 — Minors + Household bundling)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 894-898 — Guardian relationship free-text)
  </read_first>
  <behavior>
    - Test 1: resolve_recipient returns Recipient(phone=patient.phone) when patient is adult
    - Test 2: resolve_recipient returns Recipient(phone=guardian.phone, name=guardian.name, kind="guardian") when patient.dob is < 18 years ago
    - Test 3: resolve_recipient raises NoValidRecipient when minor has no guardian.phone for SMS channel
    - Test 4: resolve_recipient returns email channel correctly (patient.email vs guardian.email)
    - Test 5: bundle_household_recipients groups recipients with shared phone+same-day appt into one Recipient with bundled body
    - Test 6: Bundled body matches CONTEXT.md example: "Reminder: 3 family appointments at [Clinic] tomorrow. View all: [link]."
    - Test 7: Single-appointment recipients are NOT bundled
  </behavior>
  <action>
Create `backend/services/messaging/recipient_resolver.py`:

```python
"""Resolve recipient + handle minor → guardian routing + household bundling.

Per CONTEXT.md:
- Minors (<18) → guardian.phone / guardian.email
- 18th birthday surfaces "switch to patient" prompt (UI handles — see Plan 12-08)
- Household bundling: shared phone + same-day → single bundled SMS
- Emergency contact never auto-messaged (only manual sends with explicit selection)
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal


@dataclass
class Recipient:
    patient_id: str
    kind: Literal["patient", "guardian"]
    name: str
    phone_e164: str | None
    email: str | None
    bundled_appointment_ids: list[str] | None = None  # set when household-bundled


class NoValidRecipient(Exception):
    pass


def _calculate_age(dob_iso: str | None, *, now: datetime | None = None) -> int | None:
    if not dob_iso:
        return None
    now = now or datetime.now(timezone.utc)
    dob = datetime.fromisoformat(dob_iso.replace("Z", "+00:00")).date() if "T" in dob_iso else date.fromisoformat(dob_iso)
    today = now.date()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def resolve_recipient(*, patient: dict, channel: Literal["sms", "email"], now: datetime | None = None) -> Recipient:
    """Resolve who actually receives the message (patient vs guardian).

    `patient` is a flat dict with keys: id, first_name, last_name, dob, phone_e164, email, guardian (optional).
    """
    age = _calculate_age(patient.get("dob"), now=now)
    contact_field = "phone_e164" if channel == "sms" else "email"
    guardian = patient.get("guardian") or {}

    if age is not None and age < 18:
        contact = guardian.get(contact_field)
        if not contact:
            raise NoValidRecipient(f"Minor patient has no guardian {channel} contact.")
        return Recipient(
            patient_id=str(patient["id"]),
            kind="guardian",
            name=guardian.get("name", "Guardian"),
            phone_e164=guardian.get("phone_e164") if channel == "sms" else None,
            email=guardian.get("email") if channel == "email" else None,
        )

    contact = patient.get(contact_field)
    if not contact:
        raise NoValidRecipient(f"Patient has no {channel} contact.")
    return Recipient(
        patient_id=str(patient["id"]),
        kind="patient",
        name=patient.get("first_name", ""),
        phone_e164=patient.get("phone_e164") if channel == "sms" else None,
        email=patient.get("email") if channel == "email" else None,
    )


def bundle_household_recipients(*, recipients_with_appts: list[tuple[Recipient, str, datetime]], clinic_name: str, link_template: str) -> list[Recipient]:
    """Group recipients sharing phone+date into bundled Recipients.

    `recipients_with_appts` is a list of (Recipient, appointment_id, appointment_date_utc).
    Returns: list of bundled Recipients (one per (phone, day) group). Single-member groups
    pass through unchanged.
    """
    groups: dict[tuple[str, str], list[tuple[Recipient, str]]] = defaultdict(list)
    for recipient, appt_id, appt_dt in recipients_with_appts:
        key = (recipient.phone_e164 or recipient.email or "", appt_dt.date().isoformat())
        groups[key].append((recipient, appt_id))

    out: list[Recipient] = []
    for (_, day), members in groups.items():
        if len(members) == 1:
            out.append(members[0][0])
            continue
        first_recipient = members[0][0]
        appt_ids = [appt_id for _, appt_id in members]
        # Bundled recipient: same phone, special body marker via bundled_appointment_ids
        out.append(Recipient(
            patient_id=first_recipient.patient_id,
            kind=first_recipient.kind,
            name=first_recipient.name,
            phone_e164=first_recipient.phone_e164,
            email=first_recipient.email,
            bundled_appointment_ids=appt_ids,
        ))
    return out


def render_bundled_body(*, count: int, clinic_name: str, link: str) -> str:
    """Body for a household-bundled reminder."""
    return f"Reminder: {count} family appointments at {clinic_name} tomorrow. View all: {link}"
```

Create the test file with all 7 behavior cases.
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_recipient_resolver.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "def resolve_recipient" backend/services/messaging/recipient_resolver.py` returns 1
    - `grep -c "def bundle_household_recipients" backend/services/messaging/recipient_resolver.py` returns 1
    - `grep -c "def _calculate_age" backend/services/messaging/recipient_resolver.py` returns 1
    - `grep -c "class NoValidRecipient" backend/services/messaging/recipient_resolver.py` returns 1
    - `grep -c "guardian" backend/services/messaging/recipient_resolver.py` returns at least 4
    - `cd backend && pytest tests/messaging/test_recipient_resolver.py -x -q` exits 0 with at least 7 tests
  </acceptance_criteria>
  <done>Recipient resolver handles minor → guardian routing + household bundling, all 7 cases tested.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Sender choke-point service (dispatch orchestrates the guard chain)</name>
  <files>
    backend/services/messaging/sender.py,
    backend/tests/messaging/test_sender.py
  </files>
  <read_first>
    - backend/services/messaging/opt_out_guard.py (Task 1)
    - backend/services/messaging/quiet_hours.py (Task 1)
    - backend/services/messaging/cost_cap.py (Task 1)
    - backend/services/messaging/recipient_resolver.py (Task 2)
    - backend/services/messaging/twilio_client.py (Plan 12-02)
    - backend/services/messaging/resend_client.py (Plan 12-02)
    - backend/services/messaging/templates.py (Plan 12-02)
    - backend/core/audit.py (full file — log_action signature)
    - backend/db/models/tenant/messaging.py (MessageLog status_priority field)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 274-349 — Pattern 1 reference implementation)
    - .claude/rules/clinical-safety.md (writes in same DB transaction)
  </read_first>
  <behavior>
    - Test 1: dispatch happy path: writes MessageLog with status="sent" + provider_message_id; calls log_action with MESSAGE_SENT
    - Test 2: dispatch when opt-out blocks: raises OptOutBlocked, writes NO MessageLog row, NO provider call
    - Test 3: dispatch when in quiet hours (and force=false): writes MessageLog status="deferred" with deferred_until set, does NOT call provider
    - Test 4: dispatch when in quiet hours + force=true (manual send): provider IS called
    - Test 5: dispatch when cost cap exceeded: raises CostCapExceeded, no provider call
    - Test 6: dispatch with operational SMS containing PHI: PHI scrubber raises PHIInTemplate, no provider call, no log row
    - Test 7: dispatch failure path: provider raises → MessageLog status="failed", failure_reason set, refund_reservation called
    - Test 8: dispatch + render_template: standard tokens replaced before provider call (verified via mock body argument)
    - Test 9: dispatch with batch_id: MessageLog row stores batch_id; AuditLog metadata also stores batch_id
    - Test 10: dispatch's MessageLog write happens in same TX as audit log (no commit in dispatch — caller commits)
    - **CRITICAL TEST 11: code-review test** — `grep -r "twilio.rest.Client\\|resend.Emails.send" backend/services/messaging/` returns matches ONLY in twilio_client.py + resend_client.py + sender.py callsite. (Sender's call goes via twilio_client.send_sms, not direct.)
  </behavior>
  <action>
Create `backend/services/messaging/sender.py`:

```python
"""The single choke point for outbound messaging.

EVERY outbound message — reminder, recall, manual, AI-drafted, bulk —
funnels through `dispatch()`. This is the ONLY place that calls
twilio_client.send_sms or resend_client.send_email.

Guard chain order (must NOT be reordered without HIPAA/TCPA review):
  1. Resolve recipient (minor → guardian)
  2. Opt-out preflight
  3. Quiet hours (skip-able for force=true manual)
  4. Render template + PHI scrub (operational SMS only)
  5. Cost cap reservation
  6. Insert MessageLog (status=queued) IN PRIMARY TXN — clinical-safety rule
  7. Audit log MESSAGE_SENT IN SAME TXN
  8. Dispatch via provider (out-of-txn — failure marks log.status=failed + refunds)
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction
from backend.db.models.tenant.messaging import MessageLog, MessageStatus

from .opt_out_guard import preflight_or_raise, OptOutBlocked
from .quiet_hours import is_in_quiet_hours, next_allowed_window
from .cost_cap import reserve_spend_or_raise, refund_reservation, CostCapExceeded
from .recipient_resolver import resolve_recipient, NoValidRecipient
from .templates import render_template, scrub_phi_for_operational_sms, count_sms_segments, PHIInTemplate
from .twilio_client import send_sms
from .resend_client import send_email

logger = logging.getLogger(__name__)

_STATUS_PRIORITY = {"queued": 0, "sent": 1, "delivered": 2, "read": 3, "failed": 99, "deferred": 0, "cancelled": 0}


class QuietHoursDeferred(Exception):
    """Sentinel raised + caught internally — caller sees a MessageLog with status=deferred."""


@dataclass
class DispatchRequest:
    tenant_id: UUID
    patient_id: UUID
    channel: Literal["sms", "email"]
    purpose: Literal["operational", "marketing", "manual"]
    template_id: UUID | None = None
    template_kind: str | None = None
    body_override: str | None = None
    subject: str | None = None
    tokens: dict[str, str] = field(default_factory=dict)
    appointment_id: UUID | None = None
    batch_id: UUID | None = None
    actor_user_id: UUID | None = None
    force_outside_quiet_hours: bool = False
    admin_override_cost_cap: bool = False
    language: Literal["en", "es"] = "en"
    rendered_html: str | None = None  # email pre-rendered via BFF


async def dispatch(
    db: AsyncSession,
    ctx: TenantContext,
    req: DispatchRequest,
    *,
    patient: dict,
    tenant: dict,
    template: dict | None = None,
    status_callback_url: str = "",
) -> MessageLog:
    """Send a single message through the full guard chain.

    `patient`, `tenant`, `template` are pre-fetched dicts (caller does the SELECTs).
    Keeps this function pure-orchestration — easier to test against fakes.
    """
    # 1. Resolve recipient
    recipient = resolve_recipient(patient=patient, channel=req.channel)

    # 2. Opt-out preflight
    contact_info = patient.get("contact_info_jsonb") or {}
    preflight_or_raise(contact_info=contact_info, channel=req.channel, purpose=req.purpose)

    # 3. Quiet hours
    deferred_until: datetime | None = None
    if not req.force_outside_quiet_hours:
        if is_in_quiet_hours(patient_contact_info=contact_info, tenant_timezone=tenant["timezone"]):
            deferred_until = next_allowed_window(patient_contact_info=contact_info, tenant_timezone=tenant["timezone"])

    # 4. Render + PHI scrub
    if req.body_override is not None:
        body = render_template(body=req.body_override, tokens=req.tokens)
    elif template is not None:
        body = render_template(body=template["body"], tokens=req.tokens)
    else:
        raise ValueError("Either template or body_override must be provided")

    if req.channel == "sms" and req.purpose != "manual":
        scrub_phi_for_operational_sms(body)  # raises PHIInTemplate

    # 5. Segment count + cost cap reservation (skipped if deferred — reserve only when sending)
    segments, _enc = count_sms_segments(body) if req.channel == "sms" else (1, "n/a")
    reservation = None
    if deferred_until is None:
        reservation = await reserve_spend_or_raise(
            db, req.tenant_id, req.channel, segments, admin_override=req.admin_override_cost_cap
        )

    # 6. Insert MessageLog in primary TXN
    log = MessageLog(
        id=uuid.uuid4(),
        tenant_id=req.tenant_id,
        patient_id=req.patient_id,
        appointment_id=req.appointment_id,
        channel=req.channel,
        purpose=req.purpose,
        template_kind=req.template_kind,
        template_id=req.template_id,
        recipient_e164=recipient.phone_e164,
        recipient_email=recipient.email,
        recipient_kind=recipient.kind,
        body=body,
        subject=req.subject,
        language=req.language,
        status=MessageStatus.DEFERRED.value if deferred_until else MessageStatus.QUEUED.value,
        status_priority=0,
        provider_segments=segments if req.channel == "sms" else None,
        provider_cost_cents=reservation.cost_cents if reservation else None,
        batch_id=req.batch_id,
        deferred_until=deferred_until,
        actor_user_id=req.actor_user_id,
        metadata_={
            "reservation_id": str(reservation.id) if reservation else None,
            "language": req.language,
        },
    )
    db.add(log)
    await db.flush()

    # 7. Audit (same TXN — clinical-safety rule)
    audit_action = AuditAction.MESSAGE_DEFERRED if deferred_until else AuditAction.MESSAGE_SENT
    await log_action(
        db, ctx, audit_action,
        resource_type="message", resource_id=log.id,
        patient_id=req.patient_id, encounter_id=None,
        metadata={
            "channel": req.channel,
            "purpose": req.purpose,
            "batch_id": str(req.batch_id) if req.batch_id else None,
            "recipient_kind": recipient.kind,
        },
    )

    if deferred_until:
        return log  # scheduler will pick up at deferred_until

    # 8. Dispatch via provider (out-of-txn)
    try:
        if req.channel == "sms":
            provider_id = await send_sms(
                body=body,
                to=recipient.phone_e164,
                status_callback_url=status_callback_url,
                messaging_service_sid=tenant.get("twilio_messaging_service_sid"),
            )
        else:
            html = req.rendered_html or body  # caller may pre-render via BFF
            provider_id = await send_email(
                subject=req.subject or "Message from your eye clinic",
                html=html,
                to=recipient.email,
                idempotency_key=str(log.id),
            )
        log.provider_message_id = provider_id
        log.status = MessageStatus.SENT.value
        log.status_priority = _STATUS_PRIORITY["sent"]
        log.sent_at = datetime.now(timezone.utc)
    except Exception as exc:
        logger.warning("dispatch provider call failed for log_id=%s: %s", log.id, exc)
        log.status = MessageStatus.FAILED.value
        log.status_priority = _STATUS_PRIORITY["failed"]
        log.failure_reason = str(exc)
        log.failed_at = datetime.now(timezone.utc)
        if reservation:
            await refund_reservation(db, req.tenant_id, reservation)

    await db.flush()
    return log
```

Create `backend/tests/messaging/test_sender.py` with all 11 behavior cases. Use `mock_twilio_client`, `mock_resend_client`, and an in-memory SQLite session OR a tested AsyncSession factory.

Test 11 (the choke-point test) is implemented as a code-review-style test:
```python
def test_only_sender_calls_provider_sdks():
    """Choke point invariant: no other module in services/messaging/ calls Twilio/Resend SDKs directly."""
    import os, re
    bad_patterns = [r"twilio\.rest\.Client\b", r"resend\.Emails\.send\b"]
    allowed_files = {"twilio_client.py", "resend_client.py"}
    base = "backend/services/messaging"
    violations = []
    for fname in os.listdir(base):
        if not fname.endswith(".py") or fname in allowed_files:
            continue
        with open(os.path.join(base, fname)) as f:
            src = f.read()
        for pat in bad_patterns:
            if re.search(pat, src):
                violations.append((fname, pat))
    assert not violations, f"Choke point violated: {violations}"
```
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_sender.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "async def dispatch" backend/services/messaging/sender.py` returns 1
    - `grep -c "class DispatchRequest" backend/services/messaging/sender.py` returns 1
    - `grep -c "from .twilio_client import send_sms" backend/services/messaging/sender.py` returns 1
    - `grep -c "from .resend_client import send_email" backend/services/messaging/sender.py` returns 1
    - `grep -c "preflight_or_raise" backend/services/messaging/sender.py` returns at least 1
    - `grep -c "is_in_quiet_hours\\|next_allowed_window" backend/services/messaging/sender.py` returns at least 2
    - `grep -c "reserve_spend_or_raise\\|refund_reservation" backend/services/messaging/sender.py` returns at least 2
    - `grep -c "scrub_phi_for_operational_sms" backend/services/messaging/sender.py` returns at least 1
    - `grep -c "log_action" backend/services/messaging/sender.py` returns at least 1
    - `grep -c "AuditAction.MESSAGE_SENT\\|AuditAction.MESSAGE_DEFERRED" backend/services/messaging/sender.py` returns at least 2
    - `cd backend && pytest tests/messaging/test_sender.py -x -q` exits 0 with at least 11 tests including the choke-point invariant test
    - `grep -rE "twilio\\.rest\\.Client|resend\\.Emails\\.send" backend/services/messaging/ --include='*.py' | grep -v "twilio_client.py\|resend_client.py" | wc -l` returns 0
  </acceptance_criteria>
  <done>Single dispatch() function orchestrates 8-step guard chain. All 11 behaviors tested including the choke-point invariant. Clinical-safety rule (write in primary TXN) verified.</done>
</task>

</tasks>

<verification>
1. `cd backend && pytest tests/messaging -x -q` → exits 0; total test count includes opt-out (≥7+32 matrix), quiet hours (≥8 incl DST), cost cap (≥7), recipient resolver (≥7), sender (≥11)
2. `grep -rE "twilio\.rest\.Client|resend\.Emails\.send" backend/services/messaging/ --include='*.py' | grep -v "twilio_client.py\|resend_client.py"` → empty
3. `cd backend && python -c "from services.messaging.sender import dispatch, DispatchRequest, OptOutBlocked, CostCapExceeded"` → exits 0
</verification>

<success_criteria>
- 4 guard modules + 1 sender module + 4 test files all green
- Choke-point invariant proven: no module in services/messaging/ except `twilio_client.py` and `resend_client.py` references the provider SDKs
- DST + quiet hours boundary cases all handled
- Cost cap warn (80%) and hard-stop (100%) with admin override both proven
- Audit log entry written in same TX as MessageLog (clinical-safety rule)
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-03-SUMMARY.md` documenting:
- Final guard chain order (must match the 8 steps in the file docstring)
- Cost cap accounting decision (settings_jsonb vs reservations table) + reasoning
- Total test count + breakdown by module
- Any deviations from RESEARCH.md Pattern 1
</output>
