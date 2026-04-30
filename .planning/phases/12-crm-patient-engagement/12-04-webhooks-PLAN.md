---
phase: 12
plan: 04
slug: webhooks
type: execute
wave: 3
depends_on: [12-02, 12-03]
files_modified:
  - backend/api/routes/webhooks.py
  - backend/main.py
  - app/api/webhooks/twilio/route.ts
  - app/api/webhooks/resend/route.ts
  - lib/supabase/middleware.ts
  - backend/tests/messaging/test_twilio_webhook.py
  - backend/tests/messaging/test_resend_webhook.py
autonomous: true
gap_closure: false
requirements: [CRM-04, CRM-05, CRM-07, CRM-11, CRM-20]

must_haves:
  truths:
    - "Twilio status callback updates MessageLog.status idempotently keyed on provider_message_id"
    - "Twilio webhook rejects requests with invalid X-Twilio-Signature → HTTP 403"
    - "Resend webhook verifies Svix signature; HTTP 403 on invalid"
    - "Webhook is idempotent: same event delivered twice does not double-update; lower-priority status does not overwrite higher (delivered → sent must be ignored)"
    - "Inbound SMS (non-STOP) is persisted as InboundMessage; classification kicked off via asyncio.create_task (does NOT block webhook response)"
    - "Inbound STOP keyword updates patient.contact_info.sms_opted_out_at via Twilio Advanced Opt-Out — but webhook ALSO syncs DB as belt-and-suspenders"
    - "/api/webhooks/* paths added to public route allowlist in lib/supabase/middleware.ts"
    - "Webhook endpoints respond <2s even when Claude classifier is slow (Pitfall 8)"
    - "Webhook-driven failure events (Twilio undelivered/failed, Resend bounced/complained) call record_bounce so the bounce-fallback counter increments on the PRIMARY production path (CRM-20)"
  artifacts:
    - path: "backend/api/routes/webhooks.py"
      provides: "POST /api/webhooks/twilio + /api/webhooks/resend handlers"
      exports: ["router"]
    - path: "app/api/webhooks/twilio/route.ts"
      provides: "BFF passthrough that forwards raw body + signature header"
    - path: "app/api/webhooks/resend/route.ts"
      provides: "BFF passthrough that forwards raw body + Svix headers"
    - path: "lib/supabase/middleware.ts"
      contains: "/api/webhooks/"
  key_links:
    - from: "backend/api/routes/webhooks.py"
      to: "backend/services/messaging/twilio_client.py"
      via: "validate_signature(url, form, signature)"
      pattern: "validate_signature"
    - from: "backend/api/routes/webhooks.py"
      to: "backend/db/models/tenant/messaging.py"
      via: "UPSERT MessageLog by provider_message_id"
      pattern: "provider_message_id"
    - from: "backend/api/routes/webhooks.py"
      to: "backend/services/messaging/bounce_tracker.py"
      via: "record_bounce(db, system_ctx, patient_id, channel) on every webhook-driven failure"
      pattern: "record_bounce"
    - from: "backend/main.py"
      to: "backend/api/routes/webhooks.py"
      via: "app.include_router(webhooks.router)"
      pattern: "include_router\\(webhooks"
---

<objective>
Implement webhook endpoints that reconcile message status (Twilio + Resend) and capture inbound SMS replies. Both endpoints are public (no JWT) but signature-verified — adding belt-and-suspenders defense via internal HMAC seal between BFF and FastAPI.

Why this is its own plan: webhooks have unique constraints (idempotency, monotonic status, signature verification, public-route allowlist edit, fast response time). Mixing with the routes plan would conflate auth models.

Output:
- 2 FastAPI webhook handlers + signature validation
- 2 Next.js BFF passthroughs forwarding raw body + headers
- middleware.ts allowlist edit (REQUIRED — RESEARCH.md Pitfall 10)
- main.py router registration
- Comprehensive unit + integration tests covering signature, idempotency, status priority, fast response
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@.planning/phases/12-crm-patient-engagement/12-02-SUMMARY.md
@.planning/phases/12-crm-patient-engagement/12-03-SUMMARY.md
@./CLAUDE.md
@.claude/rules/bff-api.md
@.claude/rules/clinical-safety.md
@backend/main.py
@backend/api/routes/system_status.py
@lib/supabase/middleware.ts

<interfaces>
<!-- From Plan 12-02 -->
From backend/services/messaging/twilio_client.py:
- validate_signature(url, form, signature, auth_token=None) -> bool

From backend/services/messaging/resend_client.py:
- verify_svix_signature(raw_body, headers) -> dict (raises SvixVerificationError)

<!-- From Plan 12-01 -->
From backend/db/models/tenant/messaging.py:
- MessageLog (with status, status_priority, provider_message_id), InboundMessage
- MessageStatus enum: queued | sent | delivered | read | failed | deferred | cancelled
- Status priority constants (in sender.py): queued=0 sent=1 delivered=2 read=3 failed=99

<!-- From Plan 12-03 -->
From backend/services/messaging/sender.py:
- _STATUS_PRIORITY constant — share via export OR re-define here

<!-- From Plan 12-05 (CRM-20 bounce fallback canonical implementation) -->
From backend/services/messaging/bounce_tracker.py:
- record_bounce(db, ctx, *, patient_id: UUID, channel: str) -> None
  Increments contact_info_jsonb.{channel}_bounce_count. After 3 bounces in 30 days,
  flips contact_info_jsonb.preferred_channel to the alternate channel and emits
  AuditAction.CHANNEL_PREFERENCE_AUTO_FLIPPED.

<!-- Existing pattern -->
From backend/main.py (Phase 10.3 self-pinger init):
- app.include_router(...) registration site
- @app.on_event("startup") pattern

From lib/supabase/middleware.ts:
- isPublicRoute() function — pathname-based public allowlist (~lines 60-72)
- existing entries: /login, /signup, /api/public/, /api/address/

From backend/api/routes/system_status.py (BFF + FastAPI route pairing pattern)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: FastAPI webhook handlers with signature verification + idempotent status update + inbound capture + record_bounce on webhook-driven failures</name>
  <files>
    backend/api/routes/webhooks.py,
    backend/main.py,
    backend/tests/messaging/test_twilio_webhook.py,
    backend/tests/messaging/test_resend_webhook.py
  </files>
  <read_first>
    - backend/services/messaging/twilio_client.py (Plan 12-02 — validate_signature)
    - backend/services/messaging/resend_client.py (Plan 12-02 — verify_svix_signature)
    - backend/services/messaging/bounce_tracker.py (Plan 12-05 — record_bounce signature; SOURCE OF TRUTH for CRM-20)
    - backend/db/models/tenant/messaging.py (Plan 12-01 — MessageLog + InboundMessage)
    - backend/db/models/tenant/clinical.py (AuditAction enum — INBOUND_MESSAGE_RECEIVED, OPT_OUT_RECORDED, MESSAGE_DELIVERED, MESSAGE_FAILED)
    - backend/main.py (full file — find include_router section)
    - backend/api/routes/system_status.py (existing route file pattern reference)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 396-473 — Pattern 3 webhook endpoint code; Pitfalls 1, 3, 8, 10)
    - backend/tests/messaging/conftest.py (signed_twilio_webhook_factory, signed_resend_webhook_factory)
  </read_first>
  <behavior>
    **Twilio webhook:**
    - Test 1: POST without X-Webhook-Internal header → 403
    - Test 2: POST with valid X-Webhook-Internal but invalid X-Twilio-Signature → 403
    - Test 3: POST with valid signature + status=delivered for known MessageSid → updates MessageLog.status to "delivered", sets delivered_at
    - Test 4: Idempotent: posting the same delivered event twice does NOT change MessageLog beyond first update (status_priority gate)
    - Test 5: Out-of-order: posting status=delivered THEN status=sent — final state remains "delivered" (priority gate prevents regression)
    - Test 6: failed > delivered priority: posting status=failed AFTER delivered → status flips to "failed" (priority 99 > 2)
    - Test 7: Inbound SMS non-STOP → InboundMessage row created with body + from_e164; classification field is NULL (background task spawned)
    - Test 8: Inbound STOP keyword → patient.contact_info.sms_opted_out_at set; AuditAction.OPT_OUT_RECORDED logged. Test name MUST be `test_inbound_stop_records_optout` (canonical CRM-04 contract test).
    - Test 9: Webhook returns 200 within 2 seconds even when classifier mock sleeps 10s (asyncio.create_task pattern)
    - Test 10: Unknown MessageSid in status callback → returns 200 (don't break callback flow), logs warning
    - Test 11: **CRM-20 webhook bounce path** — webhook posting status=failed for a known MessageSid calls `record_bounce(db, system_ctx, patient_id=log.patient_id, channel="sms")`. Verified by monkeypatching `record_bounce` and asserting it was awaited exactly once with the correct kwargs.
    - Test 12: **CRM-20 channel auto-flip via webhooks** — three webhook-driven SMS failure events for the same patient (who has both phone + email + email consent) cause `patient.contact_info_jsonb.preferred_channel` to flip from "sms" to "email" (assertion against the real `record_bounce` impl, not a stub).

    **Resend webhook:**
    - Test 13: POST without Svix headers → 403
    - Test 14: POST with valid signature + email.delivered event → MessageLog.status updates to "delivered"
    - Test 15: email.opened → MessageLog.status updates to "read", read_at set
    - Test 16: email.bounced → MessageLog.status to "failed", failure_reason captured from event, AND `record_bounce(db, system_ctx, patient_id=log.patient_id, channel="email")` is awaited (CRM-20).
    - Test 17: email.complained → MessageLog.status to "failed" AND `record_bounce(... channel="email")` is awaited (CRM-20).
    - Test 18: Idempotent on duplicate event (same email_id + same event type) — record_bounce called at most once for that pair (idempotency gate).
  </behavior>
  <action>
**Step 1.** Create `backend/api/routes/webhooks.py`:

```python
"""Public webhook endpoints for Twilio + Resend status callbacks and inbound SMS.

CSRF-exempt + signature-verified. Defense-in-depth via X-Webhook-Internal HMAC seal.
RESEARCH § Pattern 3 + Pitfalls 1, 3, 8, 10.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status as http_status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import settings
from backend.core.database import get_db
from backend.core.audit import log_action_minimal  # write-once with action+resource — see core/audit.py
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction
from backend.db.models.tenant.messaging import (
    MessageLog, InboundMessage, MessageStatus,
)
from backend.db.models.tenant.clinical import Patient
from backend.services.messaging.bounce_tracker import record_bounce  # CRM-20 — webhook is the PRIMARY bounce signal
from backend.services.messaging.twilio_client import validate_signature, TwilioConfigError
from backend.services.messaging.resend_client import verify_svix_signature, SvixVerificationError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


_STATUS_PRIORITY = {"queued": 0, "sent": 1, "delivered": 2, "read": 3, "failed": 99}

# STOP keywords per Twilio Advanced Opt-Out documentation
_STOP_KEYWORDS = {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT",
                  "REVOKE", "OPTOUT", "OPT-OUT", "STOP ALL"}


def _system_ctx(tenant_id: UUID) -> TenantContext:
    """System TenantContext for webhook-originated DB writes (no user session)."""
    return TenantContext(
        user_id=UUID("00000000-0000-0000-0000-000000000000"),
        tenant_id=tenant_id, role="system", staff_id=None,
    )


def _check_internal_seal(request: Request) -> None:
    if not settings.WEBHOOK_INTERNAL_SECRET:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Internal seal not configured")
    if request.headers.get("X-Webhook-Internal") != settings.WEBHOOK_INTERNAL_SECRET:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Internal seal failed")


def _reconstruct_url(request: Request, path: str) -> str:
    """Twilio signs the public URL, so reconstruct from X-Forwarded-Host (RESEARCH Pitfall 1)."""
    forwarded_host = request.headers.get("X-Forwarded-Host", request.url.hostname)
    proto = request.headers.get("X-Forwarded-Proto", "https")
    return f"{proto}://{forwarded_host}{path}"


@router.post("/twilio", status_code=http_status.HTTP_200_OK)
async def twilio_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _check_internal_seal(request)

    # Twilio signs over application/x-www-form-urlencoded body
    form = dict(await request.form())
    twilio_signature = request.headers.get("X-Twilio-Signature", "")
    url = _reconstruct_url(request, "/api/webhooks/twilio")
    try:
        if not validate_signature(url=url, form=form, signature=twilio_signature):
            raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Invalid Twilio signature")
    except TwilioConfigError as exc:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, str(exc))

    message_sid = form.get("MessageSid")
    if not message_sid:
        # Some Twilio events (e.g. delivery receipts for unknown messages) lack SID — return 200
        return {"ok": True, "ignored": "no_message_sid"}

    # Branch: inbound message vs outbound status callback
    if "Body" in form and form.get("Body"):
        await _handle_inbound_sms(db, form)
        return {"ok": True, "kind": "inbound"}

    if "MessageStatus" in form:
        await _handle_status_callback(db, form)
        return {"ok": True, "kind": "status"}

    return {"ok": True, "ignored": "no_handler"}


async def _handle_status_callback(db: AsyncSession, form: dict[str, str]) -> None:
    sid = form["MessageSid"]
    status_str = form["MessageStatus"].lower()
    # Twilio statuses: queued, sending, sent, delivered, undelivered, failed, read
    mapped = {"sending": "queued", "queued": "queued", "sent": "sent",
              "delivered": "delivered", "read": "read",
              "undelivered": "failed", "failed": "failed"}.get(status_str)
    if not mapped:
        logger.info("Twilio status %s ignored for sid=%s", status_str, sid)
        return

    incoming_priority = _STATUS_PRIORITY.get(mapped, 0)
    log = (await db.execute(
        select(MessageLog).where(MessageLog.provider_message_id == sid)
    )).scalar_one_or_none()
    if not log:
        logger.warning("Twilio status callback for unknown sid=%s", sid)
        return

    # Idempotency + monotonic status (RESEARCH Pitfall 3)
    if incoming_priority < log.status_priority:
        logger.info("Ignoring lower-priority %s for sid=%s (current=%s)", mapped, sid, log.status)
        return

    # Detect a NEW transition into the "failed" terminal state — this is the trigger for record_bounce.
    # If the row was already failed (priority 99) we already recorded; the priority gate above will
    # have skipped duplicates because incoming==current. If priority gate accepted us at "failed",
    # this is a fresh failure to record.
    is_new_failure = mapped == "failed" and log.status != "failed"

    log.status = mapped
    log.status_priority = incoming_priority
    if mapped == "sent":
        log.sent_at = log.sent_at or datetime.now(timezone.utc)
    elif mapped == "delivered":
        log.delivered_at = datetime.now(timezone.utc)
    elif mapped == "failed":
        log.failed_at = datetime.now(timezone.utc)
        log.failure_reason = form.get("ErrorMessage") or form.get("ErrorCode")

    audit_action = (
        AuditAction.MESSAGE_DELIVERED if mapped == "delivered"
        else AuditAction.MESSAGE_FAILED if mapped == "failed"
        else None
    )
    if audit_action:
        await log_action_minimal(
            db, tenant_id=log.tenant_id,
            action=audit_action, resource_type="message", resource_id=log.id,
            patient_id=log.patient_id,
            metadata={"provider_message_id": sid, "channel": "sms"},
        )
    await db.flush()

    # CRM-20 — webhook is the PRIMARY bounce signal. Call record_bounce after persisting status.
    if is_new_failure and log.patient_id is not None:
        try:
            await record_bounce(db, _system_ctx(log.tenant_id),
                                 patient_id=log.patient_id, channel=log.channel)
        except Exception as exc:  # never let bounce-tracker failures break the webhook ack
            logger.warning("record_bounce failed for sid=%s: %s", sid, exc)


async def _handle_inbound_sms(db: AsyncSession, form: dict[str, str]) -> None:
    body = form.get("Body", "").strip()
    from_e164 = form.get("From", "")
    sid = form["MessageSid"]
    to_e164 = form.get("To", "")  # the clinic's twilio number — used to find tenant_id

    # Resolve tenant_id from clinic phone number (lookup tenant.settings_jsonb.messaging.twilio_phone_number)
    tenant_id = await _tenant_from_phone(db, to_e164)
    if not tenant_id:
        logger.warning("Inbound SMS to unknown number %s — sid=%s", to_e164, sid)
        return

    patient = await _patient_from_phone(db, tenant_id, from_e164)

    # STOP keyword handling (belt-and-suspenders DB sync — Twilio Advanced Opt-Out is the legal layer)
    is_stop = body.upper() in _STOP_KEYWORDS
    if is_stop and patient is not None:
        contact = dict(patient.contact_info_jsonb or {})
        contact["sms_opted_out_at"] = datetime.now(timezone.utc).isoformat()
        # First STOP also revokes marketing consent
        contact["consent_sms_marketing_at"] = None
        # Second STOP within 24h also revokes operational
        prev_stop = contact.get("_last_stop_received_at")
        if prev_stop:
            prev_dt = datetime.fromisoformat(prev_stop.replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - prev_dt).total_seconds() < 86400:
                contact["consent_sms_operational_at"] = None
        contact["_last_stop_received_at"] = datetime.now(timezone.utc).isoformat()
        patient.contact_info_jsonb = contact
        await log_action_minimal(
            db, tenant_id=tenant_id,
            action=AuditAction.OPT_OUT_RECORDED, resource_type="patient", resource_id=patient.id,
            patient_id=patient.id,
            metadata={"channel": "sms", "trigger": "stop_keyword"},
        )

    inbound = InboundMessage(
        tenant_id=tenant_id,
        patient_id=patient.id if patient else None,
        from_e164=from_e164,
        body=body,
        provider_message_id=sid,
        is_read=False,
    )
    db.add(inbound)
    await db.flush()

    if not is_stop:
        await log_action_minimal(
            db, tenant_id=tenant_id,
            action=AuditAction.INBOUND_MESSAGE_RECEIVED, resource_type="inbound_message",
            resource_id=inbound.id, patient_id=patient.id if patient else None,
            metadata={"from_e164": from_e164},
        )
        # Fire-and-forget classifier — non-blocking (RESEARCH Pitfall 8)
        # Plan 12-06 implements classify_inbound_async — we just spawn here.
        from backend.services.messaging.classifier import classify_inbound_async
        asyncio.create_task(classify_inbound_async(inbound.id, body))


@router.post("/resend", status_code=http_status.HTTP_200_OK)
async def resend_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _check_internal_seal(request)

    raw = await request.body()
    svix_headers = {
        k.lower(): v for k, v in request.headers.items()
        if k.lower() in ("svix-id", "svix-timestamp", "svix-signature")
    }
    try:
        payload = verify_svix_signature(raw_body=raw, headers=svix_headers)
    except SvixVerificationError:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Invalid Resend signature")

    event_type = payload.get("type", "")
    data = payload.get("data", {})
    email_id = data.get("email_id")
    if not email_id:
        return {"ok": True, "ignored": "no_email_id"}

    log = (await db.execute(
        select(MessageLog).where(MessageLog.provider_message_id == email_id)
    )).scalar_one_or_none()
    if not log:
        logger.warning("Resend webhook for unknown email_id=%s", email_id)
        return {"ok": True, "ignored": "unknown_email_id"}

    mapped = {
        "email.sent": "sent",
        "email.delivered": "delivered",
        "email.opened": "read",
        "email.bounced": "failed",
        "email.complained": "failed",
        "email.delivery_delayed": None,  # ignore
    }.get(event_type)
    if not mapped:
        return {"ok": True, "ignored": event_type}

    incoming = _STATUS_PRIORITY[mapped]
    if incoming < log.status_priority:
        return {"ok": True, "ignored": "stale"}

    is_new_failure = mapped == "failed" and log.status != "failed"

    log.status = mapped
    log.status_priority = incoming
    now = datetime.now(timezone.utc)
    if mapped == "sent": log.sent_at = log.sent_at or now
    elif mapped == "delivered": log.delivered_at = now
    elif mapped == "read": log.read_at = now
    elif mapped == "failed":
        log.failed_at = now
        log.failure_reason = data.get("bounce_type") or event_type

    audit_action = {"delivered": AuditAction.MESSAGE_DELIVERED,
                    "read": AuditAction.MESSAGE_READ,
                    "failed": AuditAction.MESSAGE_FAILED}.get(mapped)
    if audit_action:
        await log_action_minimal(
            db, tenant_id=log.tenant_id, action=audit_action,
            resource_type="message", resource_id=log.id, patient_id=log.patient_id,
            metadata={"channel": "email", "event_type": event_type},
        )
    await db.flush()

    # CRM-20 — webhook is the PRIMARY bounce signal for email too.
    if is_new_failure and log.patient_id is not None:
        try:
            await record_bounce(db, _system_ctx(log.tenant_id),
                                 patient_id=log.patient_id, channel=log.channel)
        except Exception as exc:
            logger.warning("record_bounce failed for email_id=%s: %s", email_id, exc)

    return {"ok": True}


async def _tenant_from_phone(db: AsyncSession, phone_e164: str) -> UUID | None:
    """Look up tenant by their assigned Twilio number stored in settings_jsonb.messaging.twilio_phone_number."""
    from backend.db.models.public.saas import Tenant
    rows = (await db.execute(select(Tenant))).scalars().all()
    for t in rows:
        ms = (t.settings_jsonb or {}).get("messaging", {})
        if ms.get("twilio_phone_number") == phone_e164:
            return t.id
    return None


async def _patient_from_phone(db: AsyncSession, tenant_id: UUID, phone_e164: str) -> Patient | None:
    """Match patient by contact_info_jsonb.phone_e164 — Postgres JSONB ->>operator."""
    rows = (await db.execute(
        select(Patient).where(
            Patient.tenant_id == tenant_id,
            Patient.contact_info_jsonb["phone_e164"].astext == phone_e164,
        )
    )).scalars().all()
    return rows[0] if rows else None
```

NOTE 1: If `log_action_minimal` doesn't exist in `backend/core/audit.py`, add it as a thin variant of `log_action` that accepts `tenant_id` directly (no TenantContext) — required because webhooks are public + lack a session.

NOTE 2: `record_bounce` MUST already exist in `backend/services/messaging/bounce_tracker.py` from Plan 12-05 with the documented signature `(db, ctx, *, patient_id, channel) -> None`. If Plan 12-05 deviated, fix the call sites here to match — but the contract is that bounce_tracker is the canonical CRM-20 implementation and webhooks are its primary caller.

**Step 2.** Edit `backend/main.py`:

After existing route registrations (find the `app.include_router(...)` block), add:
```python
from backend.api.routes import webhooks  # noqa
app.include_router(webhooks.router)
```

**Step 3.** Create `backend/tests/messaging/test_twilio_webhook.py` and `test_resend_webhook.py` covering all 18 behavior cases above.

The CRM-04 canonical contract test name is fixed:
```python
async def test_inbound_stop_records_optout(...):
    """Canonical CRM-04 contract test (referenced from 12-VERIFICATION.md)."""
```

The CRM-20 webhook bounce tests use a real DB + real `record_bounce` (NOT a mock) so they prove end-to-end that 3 webhook-driven failures flip preferred_channel:
```python
async def test_three_webhook_failures_flip_preferred_channel(db, signed_twilio_webhook_factory, ...):
    # Seed patient with phone + email + email consent + preferred_channel="sms"
    # Seed 3 SMS MessageLogs for that patient
    # POST 3 status=failed callbacks via the real handler
    # Assert patient.contact_info_jsonb["preferred_channel"] == "email" after the third
```

For Test 9 (fast response), spawn a real classifier mock that sleeps:
```python
async def slow_classifier(inbound_id, body):
    await asyncio.sleep(10)

@pytest.mark.asyncio
async def test_inbound_returns_within_2s(monkeypatch, signed_twilio_webhook_factory, fake_db):
    monkeypatch.setattr("backend.services.messaging.classifier.classify_inbound_async", slow_classifier)
    payload = signed_twilio_webhook_factory(params={
        "MessageSid": "SM_inbound_1", "From": "+15555550100", "To": "+14155551234", "Body": "Yes that works",
    })
    start = time.monotonic()
    response = await twilio_webhook_test_helper(payload, fake_db)
    elapsed = time.monotonic() - start
    assert response.status_code == 200
    assert elapsed < 2.0  # spawned task did NOT block
```
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_twilio_webhook.py tests/messaging/test_resend_webhook.py -x -q</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "router = APIRouter" backend/api/routes/webhooks.py` returns 1
    - `grep -c "validate_signature" backend/api/routes/webhooks.py` returns at least 1
    - `grep -c "verify_svix_signature" backend/api/routes/webhooks.py` returns at least 1
    - `grep -c "_STATUS_PRIORITY" backend/api/routes/webhooks.py` returns at least 1 (idempotency gate)
    - `grep -c "_STOP_KEYWORDS" backend/api/routes/webhooks.py` returns at least 1
    - `grep -c "asyncio.create_task" backend/api/routes/webhooks.py` returns at least 1 (Pitfall 8 — non-blocking classifier)
    - `grep -c "OPT_OUT_RECORDED" backend/api/routes/webhooks.py` returns at least 1
    - `grep -c "from backend.services.messaging.bounce_tracker import record_bounce" backend/api/routes/webhooks.py` returns 1 (CRM-20 import)
    - `grep -c "record_bounce" backend/api/routes/webhooks.py` returns at least 2 (one Twilio failure path, one Resend failure path) — **CRM-20 BLOCKER FIX**
    - `grep -c "from typing import Annotated" backend/api/routes/webhooks.py` returns 1 (FastAPI DI pattern)
    - `grep -c "Depends(get_db)" backend/api/routes/webhooks.py` returns at least 2 (one per webhook handler) — **BLOCKER FIX: invalid `next(get_db())` replaced**
    - `grep -c "next(get_db())" backend/api/routes/webhooks.py` returns 0 (the broken pattern is fully removed)
    - `grep -c "include_router(webhooks" backend/main.py` returns 1
    - `cd backend && pytest tests/messaging/test_twilio_webhook.py -x -q` exits 0 with at least 12 tests
    - `cd backend && pytest tests/messaging/test_resend_webhook.py -x -q` exits 0 with at least 6 tests
    - `grep -c "_handle_status_callback\|_handle_inbound_sms" backend/api/routes/webhooks.py` returns at least 2
    - `grep -c "def test_inbound_stop_records_optout" backend/tests/messaging/test_twilio_webhook.py` returns 1 (canonical CRM-04 contract test name)
    - `grep -c "test_three_webhook_failures_flip_preferred_channel\|test_webhook_failure_calls_record_bounce\|test_resend_bounce_calls_record_bounce" backend/tests/messaging/test_twilio_webhook.py backend/tests/messaging/test_resend_webhook.py` returns at least 2 (CRM-20 webhook coverage)
  </acceptance_criteria>
  <done>Both webhook handlers signature-verified, idempotent, monotonic, non-blocking on classification. record_bounce is invoked on every webhook-driven failure (CRM-20 PRIMARY path). FastAPI DI uses `Annotated[..., Depends(get_db)]`. ≥18 tests pass.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: BFF passthrough routes + middleware allowlist edit</name>
  <files>
    app/api/webhooks/twilio/route.ts,
    app/api/webhooks/resend/route.ts,
    lib/supabase/middleware.ts
  </files>
  <read_first>
    - lib/supabase/middleware.ts (full file — find isPublicRoute function or pathname allowlist; recent edit was Phase 9.1 adding /api/public/ and /api/address/)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 405-435 — BFF passthrough code; Pitfall 10 — middleware allowlist requirement)
    - lib/bff.ts (proxyToFastAPI helper — note: webhooks do NOT use it; they need raw body forwarding)
  </read_first>
  <action>
**Step 1.** Edit `lib/supabase/middleware.ts`. Find the public route allowlist (search for "/api/public/" — the Phase 9.1 entry). Add:
```ts
  pathname.startsWith("/api/webhooks/") ||
```
to the boolean OR chain (between or near the existing `/api/public/` and `/api/address/` entries).

**Step 2.** Create `app/api/webhooks/twilio/route.ts`:

```typescript
/**
 * Twilio webhook BFF passthrough.
 *
 * Twilio signs over the public URL + form body. We forward the raw body and
 * X-Twilio-Signature unchanged. FastAPI re-validates using X-Forwarded-Host
 * to reconstruct the URL Twilio originally signed (RESEARCH Pitfall 1).
 *
 * Adds X-Webhook-Internal HMAC seal so a bypass of Vercel cannot directly
 * invoke FastAPI's webhook routes.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";          // raw body needed
export const dynamic = "force-dynamic";   // no caching

export async function POST(request: NextRequest) {
  const FASTAPI_URL = process.env.FASTAPI_URL;
  const internal = process.env.WEBHOOK_INTERNAL_SECRET;
  if (!FASTAPI_URL || !internal) {
    return new NextResponse("server misconfigured", { status: 500 });
  }
  const sig = request.headers.get("X-Twilio-Signature") ?? "";
  const body = await request.text();

  const upstream = await fetch(`${FASTAPI_URL}/api/webhooks/twilio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": sig,
      "X-Webhook-Internal": internal,
      "X-Forwarded-Host": request.nextUrl.host,
      "X-Forwarded-Proto": request.nextUrl.protocol.replace(":", ""),
    },
    body,
  });

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}
```

**Step 3.** Create `app/api/webhooks/resend/route.ts`:

```typescript
/**
 * Resend webhook BFF passthrough — Svix signature flow.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const FASTAPI_URL = process.env.FASTAPI_URL;
  const internal = process.env.WEBHOOK_INTERNAL_SECRET;
  if (!FASTAPI_URL || !internal) {
    return new NextResponse("server misconfigured", { status: 500 });
  }
  const body = await request.text();

  const upstream = await fetch(`${FASTAPI_URL}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Internal": internal,
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    },
    body,
  });

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}
```
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "/api/webhooks/" lib/supabase/middleware.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "/api/webhooks/" lib/supabase/middleware.ts` returns at least 1
    - `grep -c "X-Twilio-Signature" app/api/webhooks/twilio/route.ts` returns at least 2
    - `grep -c "X-Webhook-Internal" app/api/webhooks/twilio/route.ts` returns at least 1
    - `grep -c "X-Forwarded-Host" app/api/webhooks/twilio/route.ts` returns at least 1 (Pitfall 1)
    - `grep -c "runtime = \"nodejs\"" app/api/webhooks/twilio/route.ts` returns 1
    - `grep -c "svix-signature" app/api/webhooks/resend/route.ts` returns at least 1
    - `grep -c "force-dynamic" app/api/webhooks/twilio/route.ts` returns 1
    - `grep -c "force-dynamic" app/api/webhooks/resend/route.ts` returns 1
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Both BFF passthroughs forward raw body + auth headers correctly. middleware.ts allowlist updated. Both routes use Node runtime + force-dynamic.</done>
</task>

</tasks>

<verification>
1. `cd backend && pytest tests/messaging/test_twilio_webhook.py tests/messaging/test_resend_webhook.py -x -q` → exits 0; ≥18 tests
2. `npx tsc --noEmit` → exits 0
3. `grep -c "/api/webhooks/" lib/supabase/middleware.ts` → ≥1
4. `grep -c "include_router(webhooks" backend/main.py` → 1
5. `grep -c "record_bounce" backend/api/routes/webhooks.py` → ≥2 (CRM-20 webhook path)
6. `grep -c "Depends(get_db)" backend/api/routes/webhooks.py` → ≥2 (FastAPI DI)
7. Manual smoke test plan (deferred to Plan 12-10 verification): hit `https://staging-host/api/webhooks/twilio` with curl + bogus signature → expect 403; with the test-signed payload from `signed_twilio_webhook_factory` → expect 200
</verification>

<success_criteria>
- Both webhook endpoints reject unauthenticated requests via internal seal + signature check
- Idempotent + monotonic status updates verified by ≥18 tests
- Inbound STOP triggers DB sync of opt-out flags + canonical CRM-04 contract test (test_inbound_stop_records_optout)
- Inbound non-STOP captured in InboundMessage; classifier runs as background task
- middleware.ts allows /api/webhooks/* through public routes
- Both BFF passthroughs forward raw body unchanged
- record_bounce is invoked on every webhook-driven failure (CRM-20 PRIMARY production path) — counter increments end-to-end via webhook
- FastAPI DI uses correct `Annotated[..., Depends(get_db)]` pattern (not invalid `next(get_db())`)
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-04-SUMMARY.md` documenting:
- Final list of Twilio status mappings (sending → queued, etc.) and Resend event mappings
- Whether `log_action_minimal` was added to backend/core/audit.py or if `log_action` was extended
- Confirmation that record_bounce wiring matches Plan 12-05's bounce_tracker contract (channel kwarg name, system ctx shape)
- Manual staging test outcome (if pre-Plan-12-10 smoke happened)
</output>
</output>
