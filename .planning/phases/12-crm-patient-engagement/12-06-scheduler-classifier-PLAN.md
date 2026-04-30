---
phase: 12
plan: 06
slug: scheduler-classifier
type: execute
wave: 4
depends_on: [12-04, 12-05]
files_modified:
  - backend/services/messaging/scheduler.py
  - backend/services/messaging/classifier.py
  - backend/services/messaging/reminder_cadence.py
  - backend/main.py
  - backend/tests/messaging/test_reminder_cadence.py
  - backend/tests/messaging/test_scheduler.py
  - backend/tests/messaging/test_classifier.py
autonomous: true
gap_closure: false
requirements: [CRM-01, CRM-08, CRM-11, CRM-19]

must_haves:
  truths:
    - "Reminder cadence module schedules 7d/72h/24h reminders for upcoming appointments"
    - "Cadence skips reminder if patient has confirmed (patient_confirmed_at set)"
    - "Cadence skips reminder if appointment is cancelled or no_show"
    - "Cadence is idempotent — re-running tick does not duplicate sends (uses appointments.reminders_sent_count + last_reminder_sent_at gates)"
    - "Scheduler asyncio loop is gated by MESSAGING_SCHEDULER_ENABLED env (Pitfall 7)"
    - "Scheduler uses pg_advisory_lock to prevent multi-instance duplicate sends (RESEARCH § Pattern 2)"
    - "Scheduler tick CALLS bundle_household_reminders before dispatching — multi-member household groups produce ONE bundled SMS to the household primary contact, singletons dispatch as before (CRM-19 reminder-side bundling fires in production, not just unit tests)"
    - "Scheduler tick CANCELS deferred messages whose deferred_until <= now (v1 limitation: deferred manual sends are NOT re-dispatched; user must re-send the next morning). Scope note in Plan + SUMMARY documents this."
    - "Inbound classifier (Claude Haiku) returns one of 6 labels: reschedule_request, cancellation, question_clinical, question_billing, thank_you, spam"
    - "Classifier sets InboundMessage.classification + classification_confidence; runs as background task (non-blocking webhook)"
  artifacts:
    - path: "backend/services/messaging/scheduler.py"
      provides: "tick_messaging_scheduler, _scheduler_loop, advisory-lock helpers, _process_tenant calls bundle_household_reminders"
      exports: ["tick_messaging_scheduler", "start_scheduler", "stop_scheduler"]
    - path: "backend/services/messaging/reminder_cadence.py"
      provides: "compute_due_reminders, dispatch_reminder, bundle_household_reminders, render_bundled_body, dispatch_bundled_reminder"
      exports: ["compute_due_reminders", "dispatch_reminder", "bundle_household_reminders", "render_bundled_body", "dispatch_bundled_reminder", "REMINDER_OFFSETS"]
    - path: "backend/services/messaging/classifier.py"
      provides: "classify_inbound_async (called from webhook handler)"
      exports: ["classify_inbound_async", "INBOUND_LABELS"]
    - path: "backend/main.py"
      contains: "_messaging_task"
  key_links:
    - from: "backend/services/messaging/scheduler.py"
      to: "backend/services/messaging/reminder_cadence.py"
      via: "bundle_household_reminders(due, fetch_patient=...) — called BEFORE the dispatch loop"
      pattern: "bundle_household_reminders\\("
    - from: "backend/services/messaging/scheduler.py"
      to: "backend/services/messaging/sender.py"
      via: "dispatch() — only callsite for actual sends"
      pattern: "from .sender import dispatch"
    - from: "backend/main.py"
      to: "backend/services/messaging/scheduler.py"
      via: "@app.on_event('startup') registers asyncio.create_task(_scheduler_loop())"
      pattern: "_scheduler_loop"
---

<objective>
Implement the background scheduler that drives appointment reminders + the inbound SMS classifier that the webhook in Plan 12-04 already calls.

The scheduler mirrors the proven Phase 10.3 self-pinger pattern: asyncio.create_task on startup, gated by env var, advisory-lock for multi-instance safety. Tick every 5 minutes.

**v1 scope decision (deferred-message handling):** Manual sends that hit quiet hours are persisted with `status='deferred'` and `deferred_until=<next 8am clinic-local>`. At v1 the scheduler CANCELS these rows when their deferred_until passes — it does NOT re-dispatch. The clinic user re-composes the message the following morning if still relevant. This avoids reconstructing the original guard chain (PHI scan, opt-out re-check, cost cap re-check, AI-draft state) from a stored row, which is risky for clinical data correctness. Documented in CONTEXT.md scope.

Output:
- 3 service modules: scheduler (loop), reminder_cadence (the "what's due" logic + household bundling), classifier (Claude Haiku)
- main.py startup hook registration
- 3 test files using freezegun for deterministic time travel
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@.planning/phases/12-crm-patient-engagement/12-04-SUMMARY.md
@.planning/phases/12-crm-patient-engagement/12-05-SUMMARY.md
@./CLAUDE.md
@.claude/rules/clinical-safety.md
@backend/main.py
@backend/services/ai_scribe.py

<interfaces>
<!-- From Plan 12-03 -->
From backend/services/messaging/sender.py:
- dispatch(db, ctx, req: DispatchRequest, *, patient, tenant, template, status_callback_url) -> MessageLog
- DispatchRequest

<!-- From Plan 12-04 -->
From backend/api/routes/webhooks.py:
- _handle_inbound_sms calls `from backend.services.messaging.classifier import classify_inbound_async; asyncio.create_task(classify_inbound_async(inbound.id, body))`
  → classifier MUST exist with this exact signature

<!-- From Plan 12-01 -->
From backend/db/models/tenant/messaging.py:
- MessageLog (status field — scheduler queries WHERE status='deferred' AND deferred_until <= now)
- InboundMessage (classification field — classifier writes here)
From appointments table (Plan 12-01 added columns):
- patient_confirmed_at, reminder_status, last_reminder_sent_at, reminders_sent_count

<!-- From Phase 10.3 precedent -->
From backend/main.py (lines ~170-211 — self-pinger pattern):
```python
_self_pinger_task: asyncio.Task | None = None
@app.on_event("startup")
async def _start_self_pinger() -> None:
    global _self_pinger_task
    if os.getenv("SENTRY_ENVIRONMENT", "").lower() != "production":
        return
    _self_pinger_task = asyncio.create_task(_self_pinger_loop())

@app.on_event("shutdown")
async def _stop_self_pinger() -> None:
    if _self_pinger_task: _self_pinger_task.cancel()
```

<!-- From Anthropic SDK -->
From backend/services/ai_scribe.py:
- import anthropic; client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
- response = await client.messages.create(model="claude-haiku-4-5-20251015", max_tokens=20, system=..., messages=[...])
- response.content[0].text

INBOUND_LABELS (RESEARCH lines 731-744):
- "reschedule_request" | "cancellation" | "question_clinical" | "question_billing" | "thank_you" | "spam"
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Reminder cadence service (compute_due_reminders + dispatch_reminder + bundle_household_reminders + dispatch_bundled_reminder)</name>
  <files>
    backend/services/messaging/reminder_cadence.py,
    backend/tests/messaging/test_reminder_cadence.py
  </files>
  <read_first>
    - backend/db/models/tenant/clinical.py (Appointment model — start_time, status, patient_id)
    - .planning/phases/12-crm-patient-engagement/12-CONTEXT.md (line 31 — 3-touch cadence at 7d, 72h, 24h)
    - backend/services/messaging/sender.py (DispatchRequest signature)
    - backend/tests/messaging/conftest.py (frozen_clock fixture)
  </read_first>
  <behavior>
    - Test 1: compute_due_reminders identifies 7d-out appointments (now < start_time - 7d < now + 5min ahead window)
    - Test 2: Identifies 72h-out appointments
    - Test 3: Identifies 24h-out appointments
    - Test 4: Skips appointments where patient_confirmed_at is set
    - Test 5: Skips cancelled and no_show appointments
    - Test 6: Skips appointment if reminders_sent_count for that touch already incremented (idempotent)
    - Test 7: dispatch_reminder builds DispatchRequest with correct template_kind (reminder_7d / reminder_72h / reminder_24h) + tokens (patient_first_name, appt_date, appt_time, etc.)
    - Test 8: Increments appointments.reminders_sent_count + sets last_reminder_sent_at after dispatch
    - Test 9: bundle_household_reminders: 2 due reminders sharing phone+date are grouped under one key
    - Test 10: render_bundled_body produces a single SMS body that names both patients ("Reminder for Jane and Bob: appointments on Tue Jun 4")
    - Test 11: dispatch_bundled_reminder dispatches ONE message via dispatch() to the household primary contact (first appointment's patient) and increments reminders_sent_count for ALL appointments in the bundle
  </behavior>
  <action>
Create `backend/services/messaging/reminder_cadence.py`:

```python
"""Appointment reminder cadence: 7d / 72h / 24h pre-appointment.

Per CONTEXT.md line 31. Idempotent via appointments.reminders_sent_count counter.
CRM-19 household bundling: dispatch_bundled_reminder sends ONE SMS for multi-member groups.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Literal
from uuid import UUID

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import Appointment, Patient
from backend.db.models.tenant.messaging import MessageTemplate, TemplateKind
from .sender import dispatch, DispatchRequest, OptOutBlocked

logger = logging.getLogger(__name__)

# (touch_index, hours_before, template_kind)
REMINDER_OFFSETS: list[tuple[int, int, str]] = [
    (0, 7 * 24, TemplateKind.REMINDER_7D.value),
    (1, 72,     TemplateKind.REMINDER_72H.value),
    (2, 24,     TemplateKind.REMINDER_24H.value),
]

# How wide a window the scheduler considers "due now" — must be ≥ tick interval (5min).
_DUE_WINDOW_MINUTES = 7  # 5min tick + 2min slack


@dataclass
class DueReminder:
    appointment_id: UUID
    patient_id: UUID
    touch_index: int
    template_kind: str
    appt_start_time: datetime


async def compute_due_reminders(db: AsyncSession, tenant_id: UUID, *, now: datetime | None = None) -> list[DueReminder]:
    """Return reminders that should fire in this tick window.

    A reminder is due when:
      now <= start_time - offset < now + DUE_WINDOW
      AND patient_confirmed_at is NULL
      AND status NOT IN ('cancelled', 'no_show')
      AND reminders_sent_count < touch_index + 1
    """
    now = now or datetime.now(timezone.utc)
    out: list[DueReminder] = []
    window_end = now + timedelta(minutes=_DUE_WINDOW_MINUTES)

    for touch_idx, hours_before, kind in REMINDER_OFFSETS:
        start_lower = now + timedelta(hours=hours_before)
        start_upper = window_end + timedelta(hours=hours_before)

        rows = (await db.execute(
            select(Appointment).where(
                Appointment.tenant_id == tenant_id,
                Appointment.deleted_at.is_(None),
                Appointment.patient_confirmed_at.is_(None),
                ~Appointment.status.in_(("cancelled", "no_show")),
                Appointment.start_time >= start_lower,
                Appointment.start_time < start_upper,
                Appointment.reminders_sent_count <= touch_idx,
            )
        )).scalars().all()

        for appt in rows:
            out.append(DueReminder(
                appointment_id=appt.id,
                patient_id=appt.patient_id,
                touch_index=touch_idx,
                template_kind=kind,
                appt_start_time=appt.start_time,
            ))
    return out


async def bundle_household_reminders(
    due_list: list[DueReminder],
    *,
    fetch_patient: Callable[[UUID], Awaitable[dict]],
) -> dict[tuple[str, str, int, str], list[DueReminder]]:
    """Group due reminders by (shared_contact, ISO_date, touch_index, template_kind).

    Returns dict keyed on (phone_or_email, ISO_date, touch_index, template_kind).
    Caller dispatches one bundled message via dispatch_bundled_reminder for groups
    with size > 1, individual sends for size == 1.

    NOTE: keying includes touch_index + template_kind so a 7d touch and a 24h touch
    on the same household same-date are NOT bundled together.
    """
    groups: dict[tuple[str, str, int, str], list[DueReminder]] = defaultdict(list)
    for d in due_list:
        patient = await fetch_patient(d.patient_id)
        contact = patient.get("contact_info_jsonb", {}) or {}
        key_contact = contact.get("phone_e164") or contact.get("email") or ""
        if not key_contact:
            # Patients with no contact get their own singleton group keyed by patient_id
            key_contact = f"missing:{d.patient_id}"
        key_date = d.appt_start_time.date().isoformat()
        groups[(key_contact, key_date, d.touch_index, d.template_kind)].append(d)
    return groups


def render_bundled_body(
    bundle: list[DueReminder],
    *,
    patient_first_names: list[str],
    clinic_name: str,
) -> str:
    """Render ONE SMS body covering multiple household members.

    Pattern: "Reminder for {Names} from {clinic_name}: appointments on {date}.
    Reply YES to confirm or visit our portal to reschedule."
    """
    if len(patient_first_names) == 1:
        names = patient_first_names[0]
    elif len(patient_first_names) == 2:
        names = f"{patient_first_names[0]} and {patient_first_names[1]}"
    else:
        names = ", ".join(patient_first_names[:-1]) + f", and {patient_first_names[-1]}"
    appt_date = bundle[0].appt_start_time.strftime("%a %b %d")
    return (
        f"Reminder for {names} from {clinic_name}: appointments on {appt_date}. "
        f"Reply YES to confirm or visit our portal to reschedule."
    )


async def dispatch_bundled_reminder(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    bundle: list[DueReminder],
    fetch_patient: Callable[[UUID], Awaitable[dict]],
    fetch_template: Callable[[str, str, str], Awaitable[dict]],
    fetch_tenant: Callable[[], Awaitable[dict]],
    status_callback_url: str = "",
) -> None:
    """Dispatch ONE SMS to the household primary contact and update ALL bundled appointments."""
    assert len(bundle) >= 1
    primary_due = bundle[0]
    primary_patient = await fetch_patient(primary_due.patient_id)
    tenant = await fetch_tenant()

    # Collect first names IN STABLE ORDER (sorted by appointment_id) so output is deterministic
    first_names: list[str] = []
    for d in sorted(bundle, key=lambda x: str(x.appointment_id)):
        p = await fetch_patient(d.patient_id) if d.patient_id != primary_due.patient_id else primary_patient
        first_names.append(p.get("first_name", "") or "")

    body = render_bundled_body(bundle, patient_first_names=first_names, clinic_name=tenant["name"])

    contact = primary_patient["contact_info_jsonb"] or {}
    preferred_channel = contact.get("preferred_channel", "sms")
    if preferred_channel not in ("sms", "email"):
        preferred_channel = "sms"
    language = contact.get("preferred_language", "en")
    template = await fetch_template(primary_due.template_kind, preferred_channel, language)

    req = DispatchRequest(
        tenant_id=ctx.tenant_id,
        patient_id=primary_due.patient_id,           # billing/audit ownership = primary contact
        channel=preferred_channel,
        purpose="operational",
        template_id=template["id"],
        template_kind=primary_due.template_kind,
        body_override=body,                          # bundled body bypasses single-patient template render
        tokens={},                                   # render already happened
        appointment_id=primary_due.appointment_id,
        actor_user_id=None,
        force_outside_quiet_hours=False,
        language=language,
        bundled_appointment_ids=[d.appointment_id for d in bundle],  # audited in dispatch()
    )

    try:
        await dispatch(db, ctx, req, patient=primary_patient, tenant=tenant, template=template,
                        status_callback_url=status_callback_url)
    except OptOutBlocked as exc:
        logger.info("Bundled reminder %s skipped: %s", primary_due.template_kind, exc.code)

    # Increment reminders_sent_count for ALL appointments in the bundle (idempotency)
    for d in bundle:
        await db.execute(
            update(Appointment)
            .where(Appointment.id == d.appointment_id)
            .values(
                reminders_sent_count=d.touch_index + 1,
                last_reminder_sent_at=datetime.now(timezone.utc),
                reminder_status=d.template_kind,
            )
        )


async def dispatch_reminder(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    due: DueReminder,
    fetch_patient: Callable[[UUID], Awaitable[dict]],
    fetch_template: Callable[[str, str, str], Awaitable[dict]],
    fetch_tenant: Callable[[], Awaitable[dict]],
    status_callback_url: str = "",
) -> None:
    """Dispatch a single (singleton) reminder + increment idempotency counters."""
    patient = await fetch_patient(due.patient_id)
    tenant = await fetch_tenant()
    contact = patient["contact_info_jsonb"]
    preferred_channel = contact.get("preferred_channel", "sms")
    if preferred_channel == "both":
        preferred_channel = "sms"  # default for reminders if both
    language = contact.get("preferred_language", "en")

    template = await fetch_template(due.template_kind, preferred_channel, language)

    appt_local = due.appt_start_time.astimezone()
    tokens = {
        "patient_first_name": patient["first_name"],
        "appt_date": appt_local.strftime("%b %d"),
        "appt_time": appt_local.strftime("%-I:%M %p"),
        "provider_name": "your provider",
        "clinic_name": tenant["name"],
        "confirm_link": f"https://app.clarityos.app/confirm/{due.appointment_id}",
        "reschedule_link": f"https://app.clarityos.app/reschedule/{due.appointment_id}",
    }

    req = DispatchRequest(
        tenant_id=ctx.tenant_id,
        patient_id=due.patient_id,
        channel=preferred_channel,
        purpose="operational",
        template_id=template["id"],
        template_kind=due.template_kind,
        tokens=tokens,
        appointment_id=due.appointment_id,
        actor_user_id=None,
        force_outside_quiet_hours=False,
        language=language,
    )

    try:
        await dispatch(db, ctx, req, patient=patient, tenant=tenant, template=template,
                        status_callback_url=status_callback_url)
    except OptOutBlocked as exc:
        logger.info("Reminder %s skipped for appt %s: %s", due.template_kind, due.appointment_id, exc.code)

    await db.execute(
        update(Appointment)
        .where(Appointment.id == due.appointment_id)
        .values(
            reminders_sent_count=due.touch_index + 1,
            last_reminder_sent_at=datetime.now(timezone.utc),
            reminder_status=due.template_kind,
        )
    )
```

NOTE: `DispatchRequest` may need a `bundled_appointment_ids: list[UUID] | None = None` field added in Plan 12-03's sender.py. If it doesn't exist, add it as part of this task and ensure `dispatch()` audits the list (so the audit trail records the household scope).

Create `backend/tests/messaging/test_reminder_cadence.py` covering all 11 behaviors.
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_reminder_cadence.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "REMINDER_OFFSETS" backend/services/messaging/reminder_cadence.py` returns at least 1
    - `grep -c "(0, 7 \\* 24" backend/services/messaging/reminder_cadence.py` returns at least 1 (7d offset)
    - `grep -c "(1, 72" backend/services/messaging/reminder_cadence.py` returns at least 1 (72h)
    - `grep -c "(2, 24" backend/services/messaging/reminder_cadence.py` returns at least 1 (24h)
    - `grep -c "patient_confirmed_at.is_(None)" backend/services/messaging/reminder_cadence.py` returns at least 1
    - `grep -c "reminders_sent_count" backend/services/messaging/reminder_cadence.py` returns at least 2
    - `grep -c "async def compute_due_reminders" backend/services/messaging/reminder_cadence.py` returns 1
    - `grep -c "async def dispatch_reminder" backend/services/messaging/reminder_cadence.py` returns 1
    - `grep -c "async def bundle_household_reminders" backend/services/messaging/reminder_cadence.py` returns 1
    - `grep -c "def render_bundled_body" backend/services/messaging/reminder_cadence.py` returns 1
    - `grep -c "async def dispatch_bundled_reminder" backend/services/messaging/reminder_cadence.py` returns 1
    - `cd backend && pytest tests/messaging/test_reminder_cadence.py -x -q` exits 0 with at least 11 tests
  </acceptance_criteria>
  <done>Cadence module computes 3-touch schedule, idempotent, household bundle group + render + dispatch helpers all exported. ≥11 tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Scheduler asyncio loop + advisory lock + main.py startup hook + WIRED household bundling + deferred message cancellation</name>
  <files>
    backend/services/messaging/scheduler.py,
    backend/main.py,
    backend/tests/messaging/test_scheduler.py
  </files>
  <read_first>
    - backend/main.py (full file — find the Phase 10.3 `_self_pinger_task` block; mirror the pattern)
    - backend/services/messaging/reminder_cadence.py (Task 1 — compute_due_reminders, dispatch_reminder, bundle_household_reminders, render_bundled_body, dispatch_bundled_reminder)
    - backend/services/messaging/sender.py (dispatch — for processing deferred messages)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 354-393 — Pattern 2 reference; Pitfall 7 — env-gated startup)
  </read_first>
  <behavior>
    - Test 1: tick_messaging_scheduler with no due reminders + no deferred messages: returns immediately, no DB writes
    - Test 2: tick_messaging_scheduler with one due reminder for a singleton household: dispatches via dispatch_reminder (singleton path), increments appointment.reminders_sent_count
    - Test 3: **CRM-19 household bundling fires in production** — two due reminders for two patients sharing the same `phone_e164` + same date + same touch_index produce ONE call to dispatch() (via dispatch_bundled_reminder), NOT two. Verified by counting `dispatch.call_count == 1` and asserting both appointments' `reminders_sent_count` were incremented.
    - Test 4: tick_messaging_scheduler picks up deferred MessageLog rows where deferred_until <= now and CANCELS them (status='cancelled', failure_reason set) — v1 limitation, no re-dispatch.
    - Test 5: When MESSAGING_SCHEDULER_ENABLED=false: start_scheduler is a no-op (Pitfall 7)
    - Test 6: pg_advisory_lock acquisition failure (lock held by another instance): tick exits without processing
    - Test 7: Loop exception inside tick is caught + logged; loop continues running
  </behavior>
  <action>
**Step 1.** Create `backend/services/messaging/scheduler.py`:

```python
"""Background scheduler — 5-minute tick, advisory-locked, env-gated.

Mirrors Phase 10.3 self-pinger pattern (backend/main.py:170-211).

CRM-19: _process_tenant calls bundle_household_reminders BEFORE the dispatch loop.
  Multi-member groups → one dispatch_bundled_reminder call (one SMS per household).
  Singleton groups → dispatch_reminder as before.

v1 limitation: Deferred manual messages are CANCELLED when their deferred_until passes.
  No re-dispatch — see Plan 12-06 objective for rationale.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Unique advisory-lock key for messaging scheduler (RESEARCH § Pattern 2)
_ADVISORY_LOCK_KEY = 0x0C12C12C12C12C12  # arbitrary 64-bit int unique to this app
_TICK_SECONDS = 300  # 5 minutes — matches CONTEXT cron range 5-15min

_task: asyncio.Task | None = None


async def tick_messaging_scheduler(db: AsyncSession) -> dict[str, int]:
    """One scheduler iteration. Returns counts dict."""
    got_lock = (await db.execute(select(func.pg_try_advisory_lock(_ADVISORY_LOCK_KEY)))).scalar()
    if not got_lock:
        logger.info("messaging scheduler: another instance holds the lock, skipping tick")
        return {"due_count": 0, "bundled_groups": 0, "deferred_cancelled": 0, "sent": 0, "skipped_lock": 1}

    counts = {"due_count": 0, "bundled_groups": 0, "deferred_cancelled": 0, "sent": 0, "skipped_lock": 0}
    try:
        from backend.db.models.public.saas import Tenant
        tenants = (await db.execute(select(Tenant))).scalars().all()
        for tenant in tenants:
            ms = (tenant.settings_jsonb or {}).get("messaging", {})
            if not ms.get("messaging_enabled"):
                continue

            await _process_tenant(db, tenant.id, counts)

    finally:
        await db.execute(select(func.pg_advisory_unlock(_ADVISORY_LOCK_KEY)))
    return counts


async def _process_tenant(db: AsyncSession, tenant_id: UUID, counts: dict) -> None:
    """Process one tenant's due reminders + cancel-expired deferred messages.

    Order:
      1. Compute due reminders.
      2. Bundle by household (CRM-19) — call bundle_household_reminders BEFORE the dispatch loop.
      3. For each group:
           - size > 1 → dispatch_bundled_reminder (ONE SMS to household primary)
           - size == 1 → dispatch_reminder (singleton)
      4. Cancel-expired deferred messages (v1 — no re-dispatch).
    """
    from .reminder_cadence import (
        compute_due_reminders, dispatch_reminder,
        bundle_household_reminders, dispatch_bundled_reminder,
    )
    from backend.core.security import TenantContext

    ctx = TenantContext(user_id=UUID("00000000-0000-0000-0000-000000000000"),
                         tenant_id=tenant_id, role="system", staff_id=None)

    due = await compute_due_reminders(db, tenant_id)
    counts["due_count"] += len(due)
    if not due:
        deferred_count = await _process_deferred(db, ctx, tenant_id)
        counts["deferred_cancelled"] += deferred_count
        await db.commit()
        return

    # Closures for fetchers (mirror Plan 12-05 helpers)
    async def fetch_patient(pid):
        from sqlalchemy import select as sel
        from backend.db.models.tenant.clinical import Patient
        p = (await db.execute(sel(Patient).where(Patient.id == pid))).scalar_one()
        contact = p.contact_info_jsonb or {}
        return {"id": p.id, "first_name": p.first_name, "last_name": p.last_name,
                "dob": p.dob.isoformat() if p.dob else None,
                "phone_e164": contact.get("phone_e164"), "email": contact.get("email"),
                "guardian": contact.get("guardian"), "contact_info_jsonb": contact}
    async def fetch_template(kind, channel, language):
        from sqlalchemy import select as sel, and_
        from backend.db.models.tenant.messaging import MessageTemplate
        t = (await db.execute(sel(MessageTemplate).where(
            and_(MessageTemplate.tenant_id == tenant_id, MessageTemplate.kind == kind,
                 MessageTemplate.channel == channel, MessageTemplate.language == language,
                 MessageTemplate.deleted_at.is_(None)),
        ).limit(1))).scalar_one_or_none()
        if not t:
            t = (await db.execute(sel(MessageTemplate).where(
                and_(MessageTemplate.tenant_id == tenant_id, MessageTemplate.kind == kind,
                     MessageTemplate.channel == channel, MessageTemplate.is_default == True,
                     MessageTemplate.deleted_at.is_(None)),
            ).limit(1))).scalar_one_or_none()
        if not t:
            raise ValueError(f"No template found for kind={kind} channel={channel}")
        return {"id": t.id, "kind": t.kind, "channel": t.channel, "language": t.language,
                "body": t.body, "subject": t.subject}
    async def fetch_tenant():
        from sqlalchemy import select as sel
        from backend.db.models.public.saas import Tenant
        t = (await db.execute(sel(Tenant).where(Tenant.id == tenant_id))).scalar_one()
        ms = (t.settings_jsonb or {}).get("messaging", {})
        return {"id": t.id, "timezone": t.timezone, "name": t.name,
                "twilio_messaging_service_sid": ms.get("twilio_messaging_service_sid"),
                "twilio_phone_number": ms.get("twilio_phone_number"),
                "resend_from_email": ms.get("resend_from_email")}

    # === CRM-19 wiring: bundle BEFORE dispatching ===
    bundled_groups = await bundle_household_reminders(due, fetch_patient=fetch_patient)
    counts["bundled_groups"] += len(bundled_groups)

    callback_url = _callback_url("sms")

    for key, group in bundled_groups.items():
        try:
            if len(group) > 1:
                # Multi-member household → ONE bundled SMS to primary contact
                await dispatch_bundled_reminder(
                    db, ctx, bundle=group,
                    fetch_patient=fetch_patient,
                    fetch_template=fetch_template,
                    fetch_tenant=fetch_tenant,
                    status_callback_url=callback_url,
                )
                counts["sent"] += 1
            else:
                # Singleton — dispatch as a normal per-patient reminder
                await dispatch_reminder(
                    db, ctx, due=group[0],
                    fetch_patient=fetch_patient,
                    fetch_template=fetch_template,
                    fetch_tenant=fetch_tenant,
                    status_callback_url=callback_url,
                )
                counts["sent"] += 1
        except Exception as exc:
            logger.warning("scheduler dispatch failed for group %s: %s", key, exc)

    # Cancel deferred messages whose window has passed (v1 limitation — no re-dispatch)
    deferred_count = await _process_deferred(db, ctx, tenant_id)
    counts["deferred_cancelled"] += deferred_count
    await db.commit()


async def _process_deferred(db, ctx, tenant_id) -> int:
    """v1: CANCEL deferred messages whose deferred_until has passed.

    Rationale (see Plan 12-06 objective):
      Reconstructing the original guard chain (PHI scan, opt-out re-check, cost cap,
      AI-draft state) from a stored row is risky for clinical data correctness. The
      clinic user re-composes the message the next morning if it's still relevant.

    A future v2 may re-dispatch with `force_outside_quiet_hours=True` from a stored
    payload, but it requires durable payload storage + re-validation against current
    consent state.
    """
    from sqlalchemy import select
    from backend.db.models.tenant.messaging import MessageLog, MessageStatus

    rows = (await db.execute(
        select(MessageLog).where(
            MessageLog.tenant_id == tenant_id,
            MessageLog.status == MessageStatus.DEFERRED.value,
            MessageLog.deferred_until <= datetime.now(timezone.utc),
            MessageLog.deleted_at.is_(None),
        ).limit(50)
    )).scalars().all()

    count = 0
    for log in rows:
        log.status = MessageStatus.CANCELLED.value
        log.failure_reason = "Deferred window expired (v1: not re-dispatched). User must re-send."
        count += 1
    await db.flush()
    return count


def _callback_url(kind: str) -> str:
    from backend.core.config import settings
    base = settings.PUBLIC_BASE_URL or "https://app.clarityos.app"
    return f"{base}/api/webhooks/twilio"


async def _scheduler_loop() -> None:
    from backend.core.database import AsyncSessionLocal
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await tick_messaging_scheduler(db)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("messaging scheduler tick failed: %s", exc)
        await asyncio.sleep(_TICK_SECONDS)


def start_scheduler() -> asyncio.Task | None:
    """Called from main.py @startup. No-op when MESSAGING_SCHEDULER_ENABLED != 'true'."""
    global _task
    if os.getenv("MESSAGING_SCHEDULER_ENABLED", "true").lower() != "true":
        logger.info("messaging scheduler disabled by env")
        return None
    _task = asyncio.create_task(_scheduler_loop())
    return _task


def stop_scheduler() -> None:
    if _task and not _task.done():
        _task.cancel()
```

**Step 2.** Edit `backend/main.py`. After the existing `_self_pinger_task` startup block (or alongside), add:

```python
from backend.services.messaging.scheduler import start_scheduler, stop_scheduler

@app.on_event("startup")
async def _start_messaging_scheduler() -> None:
    start_scheduler()

@app.on_event("shutdown")
async def _stop_messaging_scheduler() -> None:
    stop_scheduler()
```

**Step 3.** Create `backend/tests/messaging/test_scheduler.py` covering all 7 behaviors. Use `frozen_clock` + `disable_messaging_scheduler` autouse fixture override pattern. Test 6 uses a monkeypatched `pg_try_advisory_lock` returning False.

Critical Test 3 outline (CRM-19 wiring):
```python
@pytest.mark.asyncio
async def test_household_bundling_dispatches_one_sms(monkeypatch, db, freeze_time):
    """CRM-19: 2 reminders for same household at same time → 1 dispatch() call."""
    # Seed 2 patients with the same phone_e164 + 2 appointments same date same time
    # Both fall in the 24h reminder window
    dispatch_mock = AsyncMock()
    monkeypatch.setattr("backend.services.messaging.reminder_cadence.dispatch", dispatch_mock)
    counts = await tick_messaging_scheduler(db)
    assert dispatch_mock.call_count == 1            # ← ONE bundled send, not two
    assert counts["bundled_groups"] == 1
    # Both appointments' reminders_sent_count incremented
    appt1 = (await db.execute(select(Appointment).where(...))).scalar_one()
    appt2 = (await db.execute(select(Appointment).where(...))).scalar_one()
    assert appt1.reminders_sent_count == 1
    assert appt2.reminders_sent_count == 1
```
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_scheduler.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "_ADVISORY_LOCK_KEY" backend/services/messaging/scheduler.py` returns at least 2
    - `grep -c "pg_try_advisory_lock\\|pg_advisory_unlock" backend/services/messaging/scheduler.py` returns at least 2
    - `grep -c "MESSAGING_SCHEDULER_ENABLED" backend/services/messaging/scheduler.py` returns at least 1
    - `grep -c "async def tick_messaging_scheduler" backend/services/messaging/scheduler.py` returns 1
    - `grep -c "async def _scheduler_loop" backend/services/messaging/scheduler.py` returns 1
    - `grep -c "asyncio.create_task" backend/services/messaging/scheduler.py` returns at least 1
    - `grep -E "bundle_household_reminders\\(" backend/services/messaging/scheduler.py | wc -l` returns at least 1 — **CRM-19 BLOCKER FIX: bundling actually wired into _process_tenant**
    - `grep -c "dispatch_bundled_reminder" backend/services/messaging/scheduler.py` returns at least 1
    - `grep -c "from backend.services.messaging.scheduler import start_scheduler" backend/main.py` returns 1
    - `grep -c "_start_messaging_scheduler\\|_stop_messaging_scheduler" backend/main.py` returns at least 2
    - `grep -c "test_household_bundling_dispatches_one_sms\\|test_household_bundling_one_dispatch" backend/tests/messaging/test_scheduler.py` returns at least 1 (CRM-19 production wiring test)
    - `cd backend && pytest tests/messaging/test_scheduler.py -x -q` exits 0 with at least 7 tests
  </acceptance_criteria>
  <done>Scheduler with advisory lock + env gate + 5-min tick + WIRED CRM-19 household bundling (one SMS per household, not per patient) + v1 deferred-message cancellation. main.py registered. ≥7 tests pass including CRM-19 wiring test.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Inbound SMS classifier (Claude Haiku)</name>
  <files>
    backend/services/messaging/classifier.py,
    backend/tests/messaging/test_classifier.py
  </files>
  <read_first>
    - backend/services/ai_scribe.py (Anthropic AsyncAnthropic client init pattern)
    - backend/api/routes/webhooks.py (Plan 12-04 — exact callsite that imports `classify_inbound_async`)
    - backend/db/models/tenant/messaging.py (InboundMessage model — classification + classification_confidence fields)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 723-744 — classifier code reference)
    - backend/tests/messaging/conftest.py (mock_anthropic_classifier fixture)
  </read_first>
  <behavior>
    - Test 1: classify_inbound_async with body "I need to reschedule" returns "reschedule_request"
    - Test 2: classify_inbound_async with body "Thanks!" returns "thank_you"
    - Test 3: classify_inbound_async writes classification + confidence to InboundMessage row
    - Test 4: classify_inbound_async with unrecognized response from Claude defaults to "spam"
    - Test 5: classify_inbound_async swallows exceptions (does NOT raise to caller — webhook flow)
    - Test 6: Anthropic client is lazy-initialized (no eager API key access at import)
  </behavior>
  <action>
Create `backend/services/messaging/classifier.py`:

```python
"""Inbound SMS classifier using Claude Haiku.

Called from backend/api/routes/webhooks.py via asyncio.create_task — must NOT block
the webhook response (RESEARCH Pitfall 8). Failures are swallowed: leave classification=null.
"""
from __future__ import annotations

import logging
from uuid import UUID

import anthropic
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.core.database import AsyncSessionLocal
from backend.db.models.tenant.messaging import InboundMessage

logger = logging.getLogger(__name__)

INBOUND_LABELS: tuple[str, ...] = (
    "reschedule_request", "cancellation",
    "question_clinical", "question_billing",
    "thank_you", "spam",
)

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY required")
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


_SYSTEM = """You classify a single inbound SMS from a patient to an eye clinic.
Output exactly ONE label from this set, with no other text:
reschedule_request | cancellation | question_clinical | question_billing | thank_you | spam"""


async def classify_inbound_async(inbound_id: UUID, body: str) -> None:
    """Classify and update InboundMessage. Failures are swallowed (logged at WARN)."""
    try:
        label, confidence = await _classify(body)
    except Exception as exc:
        logger.warning("classify_inbound_async failed for %s: %s", inbound_id, exc)
        return

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(InboundMessage)
                .where(InboundMessage.id == inbound_id)
                .values(classification=label, classification_confidence=confidence)
            )
            await db.commit()
    except Exception as exc:
        logger.warning("classify_inbound_async DB write failed for %s: %s", inbound_id, exc)


async def _classify(body: str) -> tuple[str, str]:
    """Call Claude Haiku, return (label, confidence)."""
    client = _get_client()
    response = await client.messages.create(
        model="claude-haiku-4-5-20251015",
        max_tokens=20,
        system=_SYSTEM,
        messages=[{"role": "user", "content": body}],
    )
    raw = response.content[0].text.strip().lower()
    label = raw if raw in INBOUND_LABELS else "spam"
    if raw in INBOUND_LABELS:
        confidence = "high"
    elif any(lbl in raw for lbl in INBOUND_LABELS):
        confidence = "medium"
    else:
        confidence = "low"
    return label, confidence


def _reset_for_tests() -> None:
    global _client
    _client = None
```

Create `backend/tests/messaging/test_classifier.py` with all 6 behaviors. Use `mock_anthropic_classifier` fixture pattern; for the swallow-exception test, monkeypatch `_get_client` to raise.
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_classifier.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "INBOUND_LABELS" backend/services/messaging/classifier.py` returns at least 2
    - `grep -c "async def classify_inbound_async" backend/services/messaging/classifier.py` returns 1
    - `grep -c "claude-haiku-4-5-20251015" backend/services/messaging/classifier.py` returns 1
    - `grep -c "_client: anthropic.AsyncAnthropic | None = None" backend/services/messaging/classifier.py` returns at least 1 (lazy)
    - `cd backend && pytest tests/messaging/test_classifier.py -x -q` exits 0 with at least 6 tests
    - The classifier test that triggers an exception inside _classify must verify the function returns None (does not raise)
  </acceptance_criteria>
  <done>Classifier returns one of 6 labels + confidence, lazy-init, exception-safe. ≥6 tests pass.</done>
</task>

</tasks>

<verification>
1. `cd backend && pytest tests/messaging/test_reminder_cadence.py tests/messaging/test_scheduler.py tests/messaging/test_classifier.py -x -q` → exits 0; ≥24 tests
2. `grep -c "MESSAGING_SCHEDULER_ENABLED" backend/services/messaging/scheduler.py backend/main.py` → ≥2
3. `grep -E "bundle_household_reminders\\(" backend/services/messaging/scheduler.py` → ≥1 line (CRM-19 wired in production code path, not just defined in cadence module)
4. `cd backend && python -c "from services.messaging.scheduler import start_scheduler, stop_scheduler, tick_messaging_scheduler; from services.messaging.reminder_cadence import compute_due_reminders, dispatch_reminder, bundle_household_reminders, dispatch_bundled_reminder, render_bundled_body; from services.messaging.classifier import classify_inbound_async, INBOUND_LABELS"` → exits 0
5. `cd backend && python -c "import services.messaging.scheduler as s; assert s._task is None"` → exits 0 (no eager start)
6. `cd backend && python -c "import services.messaging.classifier as c; assert c._client is None"` → exits 0 (lazy init)
</verification>

<success_criteria>
- Reminder cadence (7d/72h/24h) implemented with idempotency counter
- bundle_household_reminders + dispatch_bundled_reminder defined in cadence module AND called from scheduler._process_tenant — CRM-19 fires in production
- Scheduler asyncio loop registered + advisory-lock + env-gated + Pitfall 7 safe
- Deferred-message handling matches the truth claim: scheduler CANCELS expired deferred manuals (v1 limitation, no re-dispatch). No internal contradiction.
- Classifier returns one of 6 labels via Claude Haiku, exception-swallow, lazy-init
- ≥24 tests pass across 3 files (was 21 before adding bundle render + bundle dispatch + scheduler bundling production wiring tests)
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-06-SUMMARY.md` documenting:
- Final REMINDER_OFFSETS list
- Confirmation that scheduler._process_tenant calls bundle_household_reminders BEFORE the dispatch loop and produces ONE SMS per multi-member household group (CRM-19 production wiring)
- v1 deferred-message handling: CANCEL on expiry; document that V2 work would need durable payload storage + re-validation
- Whether DispatchRequest needed `bundled_appointment_ids` field (Plan 12-03 sender extension)
- Tick interval chosen (5min as planned, or 10/15)
- Test count by file
</output>
</output>
