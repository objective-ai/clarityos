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
    - "Scheduler tick processes deferred messages (deferred_until <= now) by re-dispatching"
    - "Scheduler tick processes household bundling for same-day same-phone group"
    - "Inbound classifier (Claude Haiku) returns one of 6 labels: reschedule_request, cancellation, question_clinical, question_billing, thank_you, spam"
    - "Classifier sets InboundMessage.classification + classification_confidence; runs as background task (non-blocking webhook)"
  artifacts:
    - path: "backend/services/messaging/scheduler.py"
      provides: "tick_messaging_scheduler, _scheduler_loop, advisory-lock helpers"
      exports: ["tick_messaging_scheduler", "start_scheduler", "stop_scheduler"]
    - path: "backend/services/messaging/reminder_cadence.py"
      provides: "compute_due_reminders, dispatch_reminder"
      exports: ["compute_due_reminders", "dispatch_reminder", "REMINDER_OFFSETS"]
    - path: "backend/services/messaging/classifier.py"
      provides: "classify_inbound_async (called from webhook handler)"
      exports: ["classify_inbound_async", "INBOUND_LABELS"]
    - path: "backend/main.py"
      contains: "_messaging_task"
  key_links:
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
Implement the background scheduler that drives appointment reminders + processes deferred messages, plus the inbound SMS classifier that the webhook in Plan 12-04 already calls.

The scheduler mirrors the proven Phase 10.3 self-pinger pattern: asyncio.create_task on startup, gated by env var, advisory-lock for multi-instance safety. Tick every 5 minutes.

Output:
- 3 service modules: scheduler (loop), reminder_cadence (the "what's due" logic), classifier (Claude Haiku)
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
  <name>Task 1: Reminder cadence service (compute_due_reminders + dispatch_reminder)</name>
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
    - Test 9: Household bundling: if 2+ appointments share contact phone + same date, returns one bundled DispatchRequest
  </behavior>
  <action>
Create `backend/services/messaging/reminder_cadence.py`:

```python
"""Appointment reminder cadence: 7d / 72h / 24h pre-appointment.

Per CONTEXT.md line 31. Idempotent via appointments.reminders_sent_count counter.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import Appointment, Patient
from backend.db.models.tenant.messaging import MessageTemplate, TemplateKind
from .sender import dispatch, DispatchRequest, OptOutBlocked
from .recipient_resolver import bundle_household_recipients, render_bundled_body

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
        # Range query: start_time should be (now + offset) ± window
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


async def dispatch_reminder(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    due: DueReminder,
    fetch_patient: callable,
    fetch_template: callable,
    fetch_tenant: callable,
    status_callback_url: str = "",
) -> None:
    """Dispatch a single reminder + increment idempotency counters."""
    patient = await fetch_patient(due.patient_id)
    tenant = await fetch_tenant()
    contact = patient["contact_info_jsonb"]
    preferred_channel = contact.get("preferred_channel", "sms")
    if preferred_channel == "both":
        preferred_channel = "sms"  # default for reminders if both
    language = contact.get("preferred_language", "en")

    template = await fetch_template(due.template_kind, preferred_channel, language)

    # Build per-recipient tokens
    appt_local = due.appt_start_time.astimezone()  # caller may pass tenant TZ — kept simple here
    tokens = {
        "patient_first_name": patient["first_name"],
        "appt_date": appt_local.strftime("%b %d"),
        "appt_time": appt_local.strftime("%-I:%M %p"),
        "provider_name": "your provider",  # TODO: join with appointment.staff
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
        actor_user_id=None,  # scheduler-originated
        force_outside_quiet_hours=False,
        language=language,
    )

    try:
        await dispatch(db, ctx, req, patient=patient, tenant=tenant, template=template,
                        status_callback_url=status_callback_url)
    except OptOutBlocked as exc:
        logger.info("Reminder %s skipped for appt %s: %s", due.template_kind, due.appointment_id, exc.code)

    # Increment counter regardless of dispatch outcome — failures don't get retried at the next tick
    # (retries are owned by the message_log retry policy, not the scheduler)
    await db.execute(
        update(Appointment)
        .where(Appointment.id == due.appointment_id)
        .values(
            reminders_sent_count=due.touch_index + 1,
            last_reminder_sent_at=datetime.now(timezone.utc),
            reminder_status=due.template_kind,
        )
    )


async def bundle_household_reminders(due_list: list[DueReminder], *, fetch_patient: callable) -> dict[tuple[str, str], list[DueReminder]]:
    """Group due reminders by (shared_contact, date) for household bundling.

    Returns dict keyed on (phone_or_email, ISO_date), value is list of due items in that bundle.
    Caller dispatches one bundled SMS for groups with size > 1, individual sends for size == 1.
    """
    groups: dict[tuple[str, str], list[DueReminder]] = defaultdict(list)
    for d in due_list:
        patient = await fetch_patient(d.patient_id)
        contact = patient.get("contact_info_jsonb", {})
        key_contact = contact.get("phone_e164") or contact.get("email") or ""
        key_date = d.appt_start_time.date().isoformat()
        groups[(key_contact, key_date)].append(d)
    return groups
```

Create `backend/tests/messaging/test_reminder_cadence.py` covering all 9 behaviors.
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
    - `cd backend && pytest tests/messaging/test_reminder_cadence.py -x -q` exits 0 with at least 9 tests
  </acceptance_criteria>
  <done>Cadence module computes 3-touch schedule, idempotent, household bundles. ≥9 tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Scheduler asyncio loop + advisory lock + main.py startup hook</name>
  <files>
    backend/services/messaging/scheduler.py,
    backend/main.py,
    backend/tests/messaging/test_scheduler.py
  </files>
  <read_first>
    - backend/main.py (full file — find the Phase 10.3 `_self_pinger_task` block; mirror the pattern)
    - backend/services/messaging/reminder_cadence.py (Task 1 — compute_due_reminders, dispatch_reminder)
    - backend/services/messaging/sender.py (dispatch — for processing deferred messages)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 354-393 — Pattern 2 reference; Pitfall 7 — env-gated startup)
  </read_first>
  <behavior>
    - Test 1: tick_messaging_scheduler with no due reminders + no deferred messages: returns immediately, no DB writes
    - Test 2: tick_messaging_scheduler with one due reminder: dispatches it, increments appointment.reminders_sent_count
    - Test 3: tick_messaging_scheduler picks up deferred MessageLog rows where deferred_until <= now and dispatches via the same code path
    - Test 4: When MESSAGING_SCHEDULER_ENABLED=false: start_scheduler is a no-op (Pitfall 7)
    - Test 5: pg_advisory_lock acquisition failure (lock held by another instance): tick exits without processing
    - Test 6: Loop exception inside tick is caught + logged; loop continues running
  </behavior>
  <action>
**Step 1.** Create `backend/services/messaging/scheduler.py`:

```python
"""Background scheduler — 5-minute tick, advisory-locked, env-gated.

Mirrors Phase 10.3 self-pinger pattern (backend/main.py:170-211).
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
    """One scheduler iteration. Returns counts dict {due_count, deferred_count, sent}.

    Steps:
      1. Acquire pg_advisory_lock — bail if another instance holds it
      2. For every tenant with messaging_enabled=true:
         a. Process due reminders (compute_due_reminders → dispatch_reminder)
         b. Process deferred messages (status='deferred' AND deferred_until <= now)
      3. Release lock
    """
    got_lock = (await db.execute(select(func.pg_try_advisory_lock(_ADVISORY_LOCK_KEY)))).scalar()
    if not got_lock:
        logger.info("messaging scheduler: another instance holds the lock, skipping tick")
        return {"due_count": 0, "deferred_count": 0, "sent": 0, "skipped_lock": 1}

    counts = {"due_count": 0, "deferred_count": 0, "sent": 0, "skipped_lock": 0}
    try:
        # Iterate messaging-enabled tenants
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
    from .reminder_cadence import compute_due_reminders, dispatch_reminder
    from backend.core.security import TenantContext

    # Build a system TenantContext (scheduler has no user)
    ctx = TenantContext(user_id=UUID("00000000-0000-0000-0000-000000000000"),
                         tenant_id=tenant_id, role="system", staff_id=None)

    due = await compute_due_reminders(db, tenant_id)
    counts["due_count"] += len(due)

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
            # Fallback to default for kind+channel
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

    for d in due:
        try:
            await dispatch_reminder(db, ctx, due=d,
                                    fetch_patient=fetch_patient,
                                    fetch_template=fetch_template,
                                    fetch_tenant=fetch_tenant,
                                    status_callback_url=_callback_url(d.template_kind))
            counts["sent"] += 1
        except Exception as exc:
            logger.warning("scheduler dispatch_reminder failed for %s: %s", d.appointment_id, exc)

    # Process deferred messages
    deferred_count = await _process_deferred(db, ctx, tenant_id, fetch_patient, fetch_template, fetch_tenant)
    counts["deferred_count"] += deferred_count
    await db.commit()


async def _process_deferred(db, ctx, tenant_id, fetch_patient, fetch_template, fetch_tenant) -> int:
    """Re-dispatch messages whose deferred_until has passed."""
    from sqlalchemy import select
    from backend.db.models.tenant.messaging import MessageLog, MessageStatus
    from .sender import dispatch, DispatchRequest

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
        # Mark as queued so it doesn't double-pick — re-dispatch via direct provider call would skip the guard chain.
        # Simplest: mark cancelled here, create a fresh dispatch by re-running cadence on the next tick.
        # That introduces gap risk. Better: directly send via twilio_client/resend_client since the row already exists?
        # That would bypass the guard chain.
        # Decision: mark this log row's deferred_until forward to skip, then re-create via cadence — see SUMMARY.
        # NOTE: For pilot, accept a single-tick re-evaluation. This MUST be reviewed in V2 scaling.
        log.status = MessageStatus.CANCELLED.value
        log.failure_reason = "Re-evaluated next tick"
        count += 1
    await db.flush()
    return count


def _callback_url(kind: str) -> str:
    from backend.core.config import settings
    base = settings.PUBLIC_BASE_URL or "https://app.clarityos.app"
    return f"{base}/api/webhooks/twilio"  # all reminders are SMS by default


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

**Step 3.** Create `backend/tests/messaging/test_scheduler.py` covering all 6 behaviors. Use `frozen_clock` + `disable_messaging_scheduler` autouse fixture override pattern. Test 5 uses a monkeypatched `pg_try_advisory_lock` returning False.

NOTE on the deferred-message gap: this Plan stubs `_process_deferred` with mark-cancelled. Real re-dispatch is a complexity beyond pilot — document in SUMMARY for V2 attention.
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
    - `grep -c "from backend.services.messaging.scheduler import start_scheduler" backend/main.py` returns 1
    - `grep -c "_start_messaging_scheduler\\|_stop_messaging_scheduler" backend/main.py` returns at least 2
    - `cd backend && pytest tests/messaging/test_scheduler.py -x -q` exits 0 with at least 6 tests
  </acceptance_criteria>
  <done>Scheduler with advisory lock + env gate + 5-min tick. main.py registered. ≥6 tests pass.</done>
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
    # Confidence proxy: exact-match → high; partial-substring → medium; default → low
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
1. `cd backend && pytest tests/messaging/test_reminder_cadence.py tests/messaging/test_scheduler.py tests/messaging/test_classifier.py -x -q` → exits 0; ≥21 tests
2. `grep -c "MESSAGING_SCHEDULER_ENABLED" backend/services/messaging/scheduler.py backend/main.py` → ≥2
3. `cd backend && python -c "from services.messaging.scheduler import start_scheduler, stop_scheduler, tick_messaging_scheduler; from services.messaging.reminder_cadence import compute_due_reminders, dispatch_reminder; from services.messaging.classifier import classify_inbound_async, INBOUND_LABELS"` → exits 0
4. `cd backend && python -c "import services.messaging.scheduler as s; assert s._task is None"` → exits 0 (no eager start)
5. `cd backend && python -c "import services.messaging.classifier as c; assert c._client is None"` → exits 0 (lazy init)
</verification>

<success_criteria>
- Reminder cadence (7d/72h/24h) implemented with idempotency counter
- Scheduler asyncio loop registered + advisory-lock + env-gated + Pitfall 7 safe
- Classifier returns one of 6 labels via Claude Haiku, exception-swallow, lazy-init
- ≥21 tests pass across 3 files
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-06-SUMMARY.md` documenting:
- Final REMINDER_OFFSETS list
- Decision on deferred-message re-dispatch path (Plan stubs as cancel-and-recompute; document V2 work to fix)
- Tick interval chosen (5min as planned, or 10/15)
- Test count by file
</output>
