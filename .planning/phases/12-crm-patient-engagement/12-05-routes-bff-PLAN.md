---
phase: 12
plan: 05
slug: routes-bff
type: execute
wave: 3
depends_on: [12-02, 12-03]
files_modified:
  - backend/api/routes/messaging.py
  - backend/services/messaging/recall.py
  - backend/services/messaging/bulk_send.py
  - backend/main.py
  - app/api/messaging/send/route.ts
  - app/api/messaging/bulk-send/route.ts
  - app/api/messaging/templates/route.ts
  - app/api/messaging/history/[patientId]/route.ts
  - app/api/messaging/recall-queue/route.ts
  - app/api/messaging/recall-queue/send-all/route.ts
  - app/api/messaging/inbox/route.ts
  - app/api/messaging/analytics/route.ts
  - app/api/messaging/settings/route.ts
  - app/api/messaging/preferences/[patientId]/route.ts
  - app/api/messaging/ai-draft/route.ts
  - backend/tests/messaging/test_routes_send.py
  - backend/tests/messaging/test_routes_bulk.py
  - backend/tests/messaging/test_routes_recall.py
  - backend/tests/messaging/test_routes_misc.py
autonomous: true
gap_closure: false
requirements: [CRM-02, CRM-03, CRM-05, CRM-06, CRM-09, CRM-10, CRM-12, CRM-15, CRM-17, CRM-19, CRM-20]

must_haves:
  truths:
    - "POST /api/messaging/send dispatches a single message via sender.dispatch and returns the MessageLog"
    - "POST /api/messaging/bulk-send enforces max 50 recipients server-side; throttles to 1 msg/sec; emits single batch_id audit"
    - "GET /api/messaging/recall-queue returns candidates from the live SQL query (last finalized > 12mo, no future appt, not exhausted/deceased)"
    - "POST /api/messaging/recall-queue/send-all creates a RecallQueueRun, dispatches all selected candidates with batch_id, returns aggregate result"
    - "GET /api/messaging/history/[patientId] returns chronological MessageLog list with status icons + provider info"
    - "GET /api/messaging/inbox returns unread+recent InboundMessages with patient + classification join"
    - "GET /api/messaging/analytics returns reminder funnel + recall conversion + opt-out trend + cost — ALL in single response (Phase 8 precedent)"
    - "POST /api/messaging/ai-draft returns a HIPAA-safe draft body using the existing Claude infrastructure, respecting opt-out preflight"
    - "PATCH /api/messaging/preferences/[patientId] updates consent flags + paused_until; emits CHANNEL_PREFERENCE_UPDATED audit"
    - "All routes guarded by require_messaging_entitlement (CRM-17)"
    - "All BFF proxies use lib/bff.ts proxyToFastAPI"
    - "Bounce fallback logic: 3 consecutive failures on preferred channel → flips channel preference (CRM-20 implemented in service helper, called from /send route on dispatch failure)"
  artifacts:
    - path: "backend/api/routes/messaging.py"
      provides: "All FastAPI messaging endpoints"
      exports: ["router"]
    - path: "backend/services/messaging/recall.py"
      provides: "candidate_query + run_recall_batch (atomic batch dispatch)"
    - path: "backend/services/messaging/bulk_send.py"
      provides: "bulk_send (max 50 + 1 msg/sec throttle + audit batch)"
    - path: "app/api/messaging/send/route.ts"
      provides: "BFF proxy to POST /api/messaging/send"
  key_links:
    - from: "backend/api/routes/messaging.py"
      to: "backend/services/messaging/sender.py"
      via: "dispatch() — single choke point"
      pattern: "from .*sender import dispatch"
    - from: "backend/api/routes/messaging.py"
      to: "backend/services/messaging/recall.py"
      via: "candidate_query + run_recall_batch"
      pattern: "from .*recall import"
    - from: "app/api/messaging/*/route.ts"
      to: "lib/bff.ts"
      via: "proxyToFastAPI()"
      pattern: "proxyToFastAPI"
---

<objective>
Land all messaging API endpoints (FastAPI + matching BFF proxies) so the frontend can: send single + bulk messages, query recall candidates, run a recall batch, view per-patient history, view inbox, fetch analytics, edit settings, edit per-patient channel preferences, and request an AI draft.

This is a large plan (3 tasks, ~10-13 endpoints + BFF mirrors). Splitting further would scatter related routes across plans and break the FastAPI-route ↔ BFF-route pairing rule.

Output:
- 1 backend route file with all messaging endpoints + entitlement gate
- 2 service modules (recall.py for candidate query + batch run; bulk_send.py for safeguarded bulk)
- 10 BFF proxy routes
- 4 test files covering send/bulk/recall/misc routes
- Bounce-fallback hook on dispatch failure (CRM-20)
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@.planning/phases/12-crm-patient-engagement/12-VALIDATION.md
@.planning/phases/12-crm-patient-engagement/12-03-SUMMARY.md
@./CLAUDE.md
@.claude/rules/bff-api.md
@backend/core/security.py
@backend/api/routes/system_status.py
@app/api/system/health/route.ts
@lib/bff.ts

<interfaces>
<!-- From Plan 12-03 -->
From backend/services/messaging/sender.py:
- async def dispatch(db, ctx, req: DispatchRequest, *, patient, tenant, template, status_callback_url) -> MessageLog
- DispatchRequest dataclass with all fields
- exceptions: OptOutBlocked, CostCapExceeded, QuietHoursDeferred (caught internally)

<!-- From Plan 12-01 -->
From backend/db/models/tenant/messaging.py:
- MessageLog, MessageTemplate, RecallQueueRun, InboundMessage
- MessageStatus, MessageChannel, MessagePurpose, TemplateKind enums

From backend/schemas/messaging.py:
- MessageLogOut, MessageTemplateOut, BulkSendRequest, RecallCandidateOut,
  ChannelPreferenceOut, ChannelPreferenceUpdate, MessagingSettingsOut, etc.

<!-- From existing project -->
From backend/core/security.py:
- TenantContext, get_tenant_context (auth dependency)
- require_role, require_entitlement (or pattern thereof)

From backend/services/ai_scribe.py:
- _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
- pattern for streaming Claude calls (we'll do non-streaming for ai-draft)

From lib/bff.ts:
- proxyToFastAPI(request, upstreamPath) — handles auth + retry + camelizeKeys
- IMPORTANT: upstream URLs need trailing slash

Recall query (RESEARCH lines 484-518):
- live SQL with CTEs against encounters + appointments + patients
- required indexes (Plan 12-01 added them in migration 0016)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Single send + bulk send routes + bulk_send service + bounce fallback hook</name>
  <files>
    backend/services/messaging/bulk_send.py,
    backend/api/routes/messaging.py,
    backend/main.py,
    app/api/messaging/send/route.ts,
    app/api/messaging/bulk-send/route.ts,
    backend/tests/messaging/test_routes_send.py,
    backend/tests/messaging/test_routes_bulk.py
  </files>
  <read_first>
    - backend/services/messaging/sender.py (Plan 12-03 — dispatch + DispatchRequest)
    - backend/schemas/messaging.py (Plan 12-01 — BulkSendRequest with 50 cap)
    - backend/api/routes/system_status.py (existing route + entitlement-gate pattern)
    - lib/bff.ts (proxyToFastAPI signature)
    - app/api/system/health/route.ts (BFF route shape — minimal proxy)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 779-803 — bulk_send Pattern; Pitfall 5 — rate limit)
  </read_first>
  <behavior>
    - Test 1: POST /api/messaging/send returns 200 + MessageLog when patient has consent + body provided
    - Test 2: Returns 403 when caller lacks "messaging" entitlement
    - Test 3: Returns 422 when patient_id missing
    - Test 4: Returns 422 when body is empty
    - Test 5: Returns 409 with code="OPT_OUT_BLOCKED" when sender raises OptOutBlocked
    - Test 6: Returns 429 with code="COST_CAP_EXCEEDED" when sender raises CostCapExceeded
    - Test 7: On dispatch failure (provider rejected), increments patient.contact_info_jsonb.consecutive_bounces; at 3 → flips preferred_channel
    - Test 8: POST /api/messaging/bulk-send rejects 51 recipients with 422
    - Test 9: bulk-send creates BULK_MESSAGE_BATCH_CREATED audit with same batch_id for all sub-sends
    - Test 10: bulk_send service throttles 1 msg/sec via asyncio.Semaphore + asyncio.sleep (verified via frozen clock)
  </behavior>
  <action>
**Step 1.** Create `backend/services/messaging/bulk_send.py`:

```python
"""Bulk send service — 50-recipient cap + 1 msg/sec throttle + single batch audit.

Per CONTEXT bulk-send safeguards + RESEARCH lines 779-803.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction
from .sender import dispatch, DispatchRequest, OptOutBlocked, CostCapExceeded

logger = logging.getLogger(__name__)

BULK_SEND_LIMIT = 50
THROTTLE_SECONDS = 1.0


@dataclass
class BulkRecipient:
    patient_id: UUID
    tokens: dict[str, str]


@dataclass
class BulkResult:
    batch_id: UUID
    sent_count: int
    failed_count: int
    excluded_count: int
    errors: list[dict]  # [{patient_id, code, message}]


async def bulk_send(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    recipients: list[BulkRecipient],
    template_id: UUID,
    channel: Literal["sms", "email"],
    purpose: Literal["operational", "marketing", "manual"] = "manual",
    force_outside_quiet_hours: bool = False,
    fetch_patient: callable,  # async (patient_id) -> dict
    fetch_template: callable,  # async (template_id) -> dict
    fetch_tenant: callable,    # async () -> dict
    status_callback_url: str = "",
) -> BulkResult:
    if len(recipients) > BULK_SEND_LIMIT:
        raise HTTPException(422, f"Bulk send limit is {BULK_SEND_LIMIT} recipients (got {len(recipients)})")

    batch_id = uuid4()
    template = await fetch_template(template_id)
    tenant = await fetch_tenant()

    # Audit batch creation BEFORE any sends — single source of truth
    await log_action(
        db, ctx, AuditAction.BULK_MESSAGE_BATCH_CREATED,
        resource_type="message_batch", resource_id=batch_id,
        metadata={"recipient_count": len(recipients), "template_id": str(template_id),
                  "channel": channel, "purpose": purpose},
    )
    await db.commit()  # Lock the audit before any send

    sent = 0
    failed = 0
    excluded = 0
    errors: list[dict] = []
    sem = asyncio.Semaphore(1)  # 1 msg/sec serial

    async def _send_one(r: BulkRecipient) -> None:
        nonlocal sent, failed, excluded
        async with sem:
            try:
                patient = await fetch_patient(r.patient_id)
                req = DispatchRequest(
                    tenant_id=ctx.tenant_id, patient_id=r.patient_id,
                    channel=channel, purpose=purpose,
                    template_id=template_id, template_kind=template["kind"],
                    tokens=r.tokens, batch_id=batch_id,
                    actor_user_id=ctx.user_id,
                    force_outside_quiet_hours=force_outside_quiet_hours,
                    language=patient.get("contact_info_jsonb", {}).get("preferred_language", "en"),
                )
                log = await dispatch(db, ctx, req, patient=patient, tenant=tenant, template=template,
                                      status_callback_url=status_callback_url)
                if log.status == "failed":
                    failed += 1
                    errors.append({"patient_id": str(r.patient_id), "code": "PROVIDER_FAILED",
                                   "message": log.failure_reason or "unknown"})
                else:
                    sent += 1
            except OptOutBlocked as exc:
                excluded += 1
                errors.append({"patient_id": str(r.patient_id), "code": exc.code, "message": str(exc)})
            except CostCapExceeded as exc:
                failed += 1
                errors.append({"patient_id": str(r.patient_id), "code": "COST_CAP", "message": str(exc)})
                # No point continuing — but caller decides
            except Exception as exc:
                logger.exception("bulk_send recipient %s failed", r.patient_id)
                failed += 1
                errors.append({"patient_id": str(r.patient_id), "code": "UNHANDLED", "message": str(exc)})
            finally:
                await asyncio.sleep(THROTTLE_SECONDS)
        await db.commit()

    for r in recipients:
        await _send_one(r)

    return BulkResult(batch_id=batch_id, sent_count=sent, failed_count=failed,
                      excluded_count=excluded, errors=errors)


async def record_bounce(db: AsyncSession, ctx: TenantContext, *, patient_id: UUID, channel: str) -> None:
    """Increment patient consecutive_bounces[channel]; flip preferred_channel after 3 (CRM-20)."""
    from backend.db.models.tenant.clinical import Patient
    from sqlalchemy import select
    patient = (await db.execute(select(Patient).where(Patient.id == patient_id))).scalar_one()
    contact = dict(patient.contact_info_jsonb or {})
    bounces = contact.get("consecutive_bounces", {})
    bounces[channel] = bounces.get(channel, 0) + 1
    if bounces[channel] >= 3:
        # Flip channel preference to alternate + flag for staff
        alt = "email" if channel == "sms" else "sms"
        contact["preferred_channel"] = alt
        contact["needs_contact_update"] = True
        bounces[channel] = 0  # reset counter post-flip
    contact["consecutive_bounces"] = bounces
    patient.contact_info_jsonb = contact
    await log_action(db, ctx, AuditAction.CHANNEL_PREFERENCE_UPDATED,
                     resource_type="patient", resource_id=patient.id, patient_id=patient.id,
                     metadata={"trigger": "bounce_fallback", "channel": channel,
                               "consecutive_bounces": bounces[channel]})
```

**Step 2.** Create `backend/api/routes/messaging.py` with the send + bulk endpoints (other endpoints land in Tasks 2-3, but the file shell + router goes here):

```python
"""Phase 12 messaging routes.

All endpoints require the "messaging" entitlement. Webhooks are NOT here —
see backend/api/routes/webhooks.py (Plan 12-04).
"""
from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.security import TenantContext, get_tenant_context, require_entitlement
from backend.schemas.messaging import (
    MessageLogOut, BulkSendRequest, BulkSendResponse,
)
from backend.services.messaging.sender import dispatch, DispatchRequest, OptOutBlocked, CostCapExceeded
from backend.services.messaging.bulk_send import bulk_send as service_bulk_send, BulkRecipient, record_bounce

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/messaging", tags=["messaging"],
                    dependencies=[Depends(require_entitlement("messaging"))])


@router.post("/send", response_model=MessageLogOut)
async def send_message(
    payload: dict,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageLogOut:
    # Build DispatchRequest from payload
    try:
        req = DispatchRequest(
            tenant_id=ctx.tenant_id,
            patient_id=UUID(payload["patient_id"]),
            channel=payload["channel"],
            purpose=payload.get("purpose", "manual"),
            body_override=payload.get("body"),
            subject=payload.get("subject"),
            template_id=UUID(payload["template_id"]) if payload.get("template_id") else None,
            tokens=payload.get("tokens", {}),
            appointment_id=UUID(payload["appointment_id"]) if payload.get("appointment_id") else None,
            actor_user_id=ctx.user_id,
            force_outside_quiet_hours=payload.get("force_outside_quiet_hours", False),
            language=payload.get("language", "en"),
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(422, f"Invalid request: {exc}")

    patient, tenant, template = await _fetch_send_context(db, ctx, req)
    try:
        log = await dispatch(db, ctx, req, patient=patient, tenant=tenant, template=template,
                              status_callback_url=_callback_url(req.channel))
        if log.status == "failed":
            await record_bounce(db, ctx, patient_id=req.patient_id, channel=req.channel)
        await db.commit()
        return MessageLogOut.model_validate(log)
    except OptOutBlocked as exc:
        raise HTTPException(409, detail={"code": exc.code, "message": str(exc)})
    except CostCapExceeded as exc:
        raise HTTPException(429, detail={"code": "COST_CAP_EXCEEDED", "message": str(exc)})


@router.post("/bulk-send", response_model=BulkSendResponse)
async def bulk_send_route(
    payload: BulkSendRequest,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BulkSendResponse:
    recipients = [BulkRecipient(patient_id=r.patient_id, tokens=r.tokens) for r in payload.recipients]
    result = await service_bulk_send(
        db, ctx,
        recipients=recipients,
        template_id=payload.template_id,
        channel=payload.channel,
        purpose="manual",
        force_outside_quiet_hours=payload.force_outside_quiet_hours,
        fetch_patient=lambda pid: _fetch_patient(db, ctx, pid),
        fetch_template=lambda tid: _fetch_template(db, ctx, tid),
        fetch_tenant=lambda: _fetch_tenant(db, ctx),
        status_callback_url=_callback_url(payload.channel),
    )
    return BulkSendResponse(
        batch_id=result.batch_id, sent_count=result.sent_count,
        failed_count=result.failed_count, excluded_count=result.excluded_count, errors=result.errors,
    )


# Helper fetchers — Tasks 2-3 will add more
async def _fetch_send_context(db, ctx, req):
    patient = await _fetch_patient(db, ctx, req.patient_id)
    tenant = await _fetch_tenant(db, ctx)
    template = None
    if req.template_id:
        template = await _fetch_template(db, ctx, req.template_id)
    return patient, tenant, template


async def _fetch_patient(db, ctx, patient_id):
    from sqlalchemy import select
    from backend.db.models.tenant.clinical import Patient
    p = (await db.execute(select(Patient).where(
        Patient.id == patient_id, Patient.tenant_id == ctx.tenant_id
    ))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Patient not found")
    contact = p.contact_info_jsonb or {}
    return {
        "id": p.id, "first_name": p.first_name, "last_name": p.last_name,
        "dob": p.dob.isoformat() if p.dob else None,
        "phone_e164": contact.get("phone_e164") or contact.get("phone"),
        "email": contact.get("email"),
        "guardian": contact.get("guardian"),
        "contact_info_jsonb": contact,
    }


async def _fetch_template(db, ctx, template_id):
    from sqlalchemy import select
    from backend.db.models.tenant.messaging import MessageTemplate
    t = (await db.execute(select(MessageTemplate).where(
        MessageTemplate.id == template_id, MessageTemplate.tenant_id == ctx.tenant_id
    ))).scalar_one()
    return {"id": t.id, "kind": t.kind, "channel": t.channel, "language": t.language,
            "body": t.body, "subject": t.subject}


async def _fetch_tenant(db, ctx):
    from sqlalchemy import select
    from backend.db.models.public.saas import Tenant
    t = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one()
    ms = (t.settings_jsonb or {}).get("messaging", {})
    return {
        "id": t.id, "timezone": t.timezone, "name": t.name,
        "twilio_messaging_service_sid": ms.get("twilio_messaging_service_sid"),
        "twilio_phone_number": ms.get("twilio_phone_number"),
        "resend_from_email": ms.get("resend_from_email"),
    }


def _callback_url(channel: str) -> str:
    from backend.core.config import settings
    base = settings.PUBLIC_BASE_URL or "https://app.clarityos.app"
    if channel == "sms":
        return f"{base}/api/webhooks/twilio"
    return f"{base}/api/webhooks/resend"
```

**Step 3.** Edit `backend/main.py` — add `app.include_router(messaging.router)` after the webhooks router.

**Step 4.** Create BFF proxies at `app/api/messaging/send/route.ts` and `app/api/messaging/bulk-send/route.ts` using `proxyToFastAPI`:

```typescript
// app/api/messaging/send/route.ts
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return proxyToFastAPI(request, "/api/messaging/send/");
}
```

(Bulk-send mirrors this pattern, just with different upstream path.)

**Step 5.** Create `backend/tests/messaging/test_routes_send.py` and `test_routes_bulk.py` covering the 10 behavior cases. Use FastAPI TestClient pattern with override_dependency for `get_tenant_context` and `get_db`.
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_routes_send.py tests/messaging/test_routes_bulk.py -x -q && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "router = APIRouter" backend/api/routes/messaging.py` returns 1
    - `grep -c "require_entitlement(\"messaging\")" backend/api/routes/messaging.py` returns at least 1
    - `grep -c "async def send_message\\|async def bulk_send_route" backend/api/routes/messaging.py` returns at least 2
    - `grep -c "BULK_SEND_LIMIT = 50" backend/services/messaging/bulk_send.py` returns 1
    - `grep -c "asyncio.Semaphore(1)" backend/services/messaging/bulk_send.py` returns at least 1
    - `grep -c "asyncio.sleep(THROTTLE_SECONDS)" backend/services/messaging/bulk_send.py` returns at least 1
    - `grep -c "async def record_bounce" backend/services/messaging/bulk_send.py` returns 1
    - `grep -c "include_router(messaging" backend/main.py` returns 1
    - `grep -c "proxyToFastAPI" app/api/messaging/send/route.ts` returns 1
    - `grep -c "proxyToFastAPI" app/api/messaging/bulk-send/route.ts` returns 1
    - `cd backend && pytest tests/messaging/test_routes_send.py -x -q` exits 0 ≥7 tests
    - `cd backend && pytest tests/messaging/test_routes_bulk.py -x -q` exits 0 ≥3 tests
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>send + bulk-send routes operational; bulk_send service enforces 50-cap + 1 msg/sec; bounce-fallback hook flips preferred channel after 3 fails. ≥10 tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Recall queue + history + inbox + analytics + AI draft routes + recall service</name>
  <files>
    backend/services/messaging/recall.py,
    backend/services/messaging/ai_draft.py,
    backend/api/routes/messaging.py,
    app/api/messaging/recall-queue/route.ts,
    app/api/messaging/recall-queue/send-all/route.ts,
    app/api/messaging/history/[patientId]/route.ts,
    app/api/messaging/inbox/route.ts,
    app/api/messaging/analytics/route.ts,
    app/api/messaging/ai-draft/route.ts,
    backend/tests/messaging/test_routes_recall.py,
    backend/tests/messaging/test_routes_misc.py
  </files>
  <read_first>
    - backend/api/routes/messaging.py (Task 1 — extend, do not rewrite)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 484-518 — recall SQL; lines 723-744 — AI classifier pattern; lines 115-130 — analytics metrics)
    - app/(tenant)/[tenant]/analytics/page.tsx (Phase 8 single-aggregate-endpoint precedent — `/api/analytics`)
    - backend/services/ai_scribe.py (full file — Anthropic AsyncAnthropic pattern + max_tokens guard)
    - .planning/phases/12-crm-patient-engagement/12-VALIDATION.md (CRM-12 contract test — AI draft respects opt-out)
  </read_first>
  <behavior>
    - Test 1: GET /api/messaging/recall-queue returns candidates list filtered by 12mo + no-future-appt
    - Test 2: Recall query excludes patients with recall_exhausted=true
    - Test 3: Recall query excludes deceased patients
    - Test 4: POST /api/messaging/recall-queue/send-all dispatches all selected candidates with shared batch_id, increments RecallQueueRun.sent_count
    - Test 5: send-all marks recall_exhausted=true on candidates after 2nd touch (m12 → m14 → exhausted)
    - Test 6: GET /api/messaging/history/{patient_id} returns chronological list with status icons
    - Test 7: GET /api/messaging/inbox returns InboundMessages with classification field included
    - Test 8: GET /api/messaging/analytics returns 4 charts + 4 KPIs in one response (mirroring Phase 8)
    - Test 9: POST /api/messaging/ai-draft returns body string when intent provided + patient consents
    - Test 10: ai-draft preflights opt-out — raises 409 if patient cannot receive selected channel/purpose (CRM-12 contract test)
  </behavior>
  <action>
**Step 1.** Create `backend/services/messaging/recall.py`:

```python
"""Recall queue: live candidate query + batch run.

Per CONTEXT.md: 12mo-since-last-finalized + no-future-appt + not-exhausted-or-deceased.
Cadence: 2 touches max (m12 + m14), then recall_exhausted=true.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction
from backend.db.models.tenant.messaging import RecallQueueRun

logger = logging.getLogger(__name__)


async def candidate_query(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    """Return recall candidates per CONTEXT rules. RESEARCH lines 484-518."""
    sql = text("""
        WITH last_finalized AS (
          SELECT patient_id, MAX(finalized_at) AS last_finalized_at
          FROM encounters
          WHERE tenant_id = :tenant_id AND finalized_at IS NOT NULL AND deleted_at IS NULL
          GROUP BY patient_id
        ), future_appts AS (
          SELECT DISTINCT patient_id FROM appointments
          WHERE tenant_id = :tenant_id AND start_time > now()
                AND status NOT IN ('cancelled', 'no_show')
        )
        SELECT p.id, p.first_name, p.last_name,
               lf.last_finalized_at,
               (p.contact_info_jsonb ->> 'phone_e164') AS phone_e164,
               (p.contact_info_jsonb ->> 'email') AS email,
               (p.contact_info_jsonb ->> 'consent_sms_marketing_at') AS sms_marketing_consent_at,
               (p.contact_info_jsonb ->> 'consent_email_marketing_at') AS email_marketing_consent_at,
               COALESCE((p.contact_info_jsonb ->> 'recall_exhausted')::bool, FALSE) AS recall_exhausted,
               COALESCE((p.contact_info_jsonb ->> 'recall_touch_count')::int, 0) AS recall_touch_count
        FROM patients p
        JOIN last_finalized lf ON lf.patient_id = p.id
        LEFT JOIN future_appts fa ON fa.patient_id = p.id
        WHERE p.tenant_id = :tenant_id
          AND p.deleted_at IS NULL
          AND lf.last_finalized_at < (now() - INTERVAL '12 months')
          AND fa.patient_id IS NULL
          AND COALESCE((p.contact_info_jsonb ->> 'recall_exhausted')::bool, FALSE) = FALSE
          AND COALESCE((p.contact_info_jsonb ->> 'deceased')::bool, FALSE) = FALSE
          AND ((p.contact_info_jsonb ->> 'phone_e164') IS NOT NULL
               OR (p.contact_info_jsonb ->> 'email') IS NOT NULL)
        ORDER BY lf.last_finalized_at ASC
        LIMIT 500
    """)
    rows = (await db.execute(sql, {"tenant_id": str(tenant_id)})).mappings().all()
    return [dict(r) for r in rows]


async def run_recall_batch(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    candidate_patient_ids: list[UUID],
    template_id: UUID,
    channel: Literal["sms", "email"],
) -> RecallQueueRun:
    """Execute a recall batch: dispatch each candidate, update RecallQueueRun aggregates,
    mark exhausted after 2nd touch."""
    from .bulk_send import bulk_send as svc_bulk_send, BulkRecipient
    from sqlalchemy import select
    from backend.db.models.tenant.clinical import Patient

    run = RecallQueueRun(tenant_id=ctx.tenant_id, started_by_user_id=ctx.user_id,
                         candidate_count=len(candidate_patient_ids))
    db.add(run)
    await db.flush()
    await log_action(db, ctx, AuditAction.RECALL_QUEUE_RUN_STARTED,
                     resource_type="recall_queue_run", resource_id=run.id,
                     metadata={"candidate_count": len(candidate_patient_ids)})

    # Build BulkRecipients with per-patient tokens
    recipients: list[BulkRecipient] = []
    for pid in candidate_patient_ids:
        p = (await db.execute(select(Patient).where(Patient.id == pid))).scalar_one()
        recipients.append(BulkRecipient(patient_id=pid, tokens={
            "patient_first_name": p.first_name,
            "clinic_name": "Your Eye Clinic",  # filled at template render — Plan 12-09 will pass real value
            "confirm_link": "",  # Plan 12-09 supplies actual booking link
        }))

    from .bulk_send import bulk_send as svc_bulk_send
    # Re-use the bulk_send service, classified as marketing/recall purpose
    # (Note: importing fetchers from routes.messaging would create cycle — caller must pass them.)
    # For this service-internal path, define minimal fetchers inline:
    async def _fetch_patient(pid):
        p = (await db.execute(select(Patient).where(Patient.id == pid))).scalar_one()
        contact = p.contact_info_jsonb or {}
        return {"id": p.id, "first_name": p.first_name, "last_name": p.last_name,
                "dob": p.dob.isoformat() if p.dob else None,
                "phone_e164": contact.get("phone_e164"), "email": contact.get("email"),
                "guardian": contact.get("guardian"), "contact_info_jsonb": contact}
    async def _fetch_template(tid):
        from backend.db.models.tenant.messaging import MessageTemplate
        t = (await db.execute(select(MessageTemplate).where(MessageTemplate.id == tid))).scalar_one()
        return {"id": t.id, "kind": t.kind, "channel": t.channel, "language": t.language,
                "body": t.body, "subject": t.subject}
    async def _fetch_tenant():
        from backend.db.models.public.saas import Tenant
        t = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one()
        ms = (t.settings_jsonb or {}).get("messaging", {})
        return {"id": t.id, "timezone": t.timezone, "name": t.name,
                "twilio_messaging_service_sid": ms.get("twilio_messaging_service_sid"),
                "twilio_phone_number": ms.get("twilio_phone_number")}

    bulk_result = await svc_bulk_send(
        db, ctx, recipients=recipients, template_id=template_id,
        channel=channel, purpose="marketing", force_outside_quiet_hours=False,
        fetch_patient=_fetch_patient, fetch_template=_fetch_template, fetch_tenant=_fetch_tenant,
    )

    # Update aggregates + mark exhausted on 2nd touch
    run.sent_count = bulk_result.sent_count
    run.failed_count = bulk_result.failed_count
    run.excluded_count = bulk_result.excluded_count
    run.completed_at = datetime.now(timezone.utc)
    run.metadata_ = {"batch_id": str(bulk_result.batch_id), "errors": bulk_result.errors[:20]}

    for pid in candidate_patient_ids:
        p = (await db.execute(select(Patient).where(Patient.id == pid))).scalar_one()
        contact = dict(p.contact_info_jsonb or {})
        touch_count = contact.get("recall_touch_count", 0) + 1
        contact["recall_touch_count"] = touch_count
        contact["last_recall_sent_at"] = datetime.now(timezone.utc).isoformat()
        if touch_count >= 2:
            contact["recall_exhausted"] = True
        p.contact_info_jsonb = contact

    await log_action(db, ctx, AuditAction.RECALL_QUEUE_RUN_COMPLETED,
                     resource_type="recall_queue_run", resource_id=run.id,
                     metadata={"sent": run.sent_count, "failed": run.failed_count,
                               "excluded": run.excluded_count})
    await db.flush()
    return run
```

**Step 2.** Create `backend/services/messaging/ai_draft.py`:

```python
"""AI message draft assist — staff types intent, Claude drafts a HIPAA-safe message.

Reuses the Anthropic client pattern from backend/services/ai_scribe.py.
Always preflights opt-out before invoking Claude (RESEARCH CRM-12 contract test).
"""
from __future__ import annotations

import anthropic
from backend.core.config import settings
from .opt_out_guard import preflight_or_raise
from .templates import scrub_phi_for_operational_sms

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


DRAFT_SYSTEM = """You draft a single message to an eye clinic patient.
Constraints (NEVER violate):
- Include patient first name only (no last name, no DOB, no medical record number)
- For SMS: never mention diagnoses, prescription values, or specific reasons-for-visit
- For email: medical specifics OK as long as caller marked them appropriate
- Keep under 160 characters for SMS; under 200 words for email
- Use a warm but professional tone
- End with the clinic name as signature
- Include a confirm or reschedule link if appropriate (placeholder: {{confirm_link}})

Output the message body only. No explanation."""


async def draft_message(*, intent: str, channel: str, purpose: str, patient_first_name: str,
                       patient_contact_info: dict, clinic_name: str) -> str:
    """Generate a HIPAA-safe message body. Raises OptOutBlocked if patient cannot receive."""
    preflight_or_raise(contact_info=patient_contact_info, channel=channel, purpose=purpose)

    user_msg = (
        f"Patient first name: {patient_first_name}\n"
        f"Clinic: {clinic_name}\n"
        f"Channel: {channel.upper()}\n"
        f"Purpose: {purpose}\n"
        f"Staff intent: {intent}\n\n"
        f"Draft the message now."
    )
    client = _get_client()
    response = await client.messages.create(
        model="claude-haiku-4-5-20251015",
        max_tokens=300,
        system=DRAFT_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    body = response.content[0].text.strip()

    # Defense-in-depth: scrub operational SMS even if Claude slipped
    if channel == "sms" and purpose == "operational":
        scrub_phi_for_operational_sms(body)  # raises if it contained PHI

    return body
```

**Step 3.** Extend `backend/api/routes/messaging.py` — APPEND endpoints (do not delete Task 1's content):

```python
@router.get("/recall-queue")
async def get_recall_queue(
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from backend.services.messaging.recall import candidate_query
    candidates = await candidate_query(db, ctx.tenant_id)
    return {"candidates": candidates}


@router.post("/recall-queue/send-all")
async def send_recall_batch(
    payload: dict,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from backend.services.messaging.recall import run_recall_batch
    candidate_ids = [UUID(x) for x in payload["candidate_patient_ids"]]
    template_id = UUID(payload["template_id"])
    channel = payload.get("channel", "sms")
    run = await run_recall_batch(db, ctx, candidate_patient_ids=candidate_ids,
                                  template_id=template_id, channel=channel)
    await db.commit()
    return {"run_id": str(run.id), "sent": run.sent_count, "failed": run.failed_count,
            "excluded": run.excluded_count}


@router.get("/history/{patient_id}", response_model=list[MessageLogOut])
async def history(
    patient_id: UUID,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, le=200),
):
    from sqlalchemy import select, desc
    from backend.db.models.tenant.messaging import MessageLog
    rows = (await db.execute(
        select(MessageLog)
        .where(MessageLog.tenant_id == ctx.tenant_id, MessageLog.patient_id == patient_id,
               MessageLog.deleted_at.is_(None))
        .order_by(desc(MessageLog.created_at))
        .limit(limit)
    )).scalars().all()
    return [MessageLogOut.model_validate(r) for r in rows]


@router.get("/inbox")
async def inbox(
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    filter_classification: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
):
    from sqlalchemy import select, desc
    from backend.db.models.tenant.messaging import InboundMessage
    q = (
        select(InboundMessage)
        .where(InboundMessage.tenant_id == ctx.tenant_id, InboundMessage.deleted_at.is_(None))
        .order_by(desc(InboundMessage.received_at))
        .limit(limit)
    )
    if filter_classification:
        q = q.where(InboundMessage.classification == filter_classification)
    rows = (await db.execute(q)).scalars().all()
    return [{"id": str(r.id), "patient_id": str(r.patient_id) if r.patient_id else None,
             "from_e164": r.from_e164, "body": r.body, "classification": r.classification,
             "is_read": r.is_read, "received_at": r.received_at.isoformat()} for r in rows]


@router.get("/analytics")
async def analytics(
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    range_days: int = Query(default=30, ge=1, le=365),
):
    """Return reminder funnel + recall conversion + opt-out trend + cost in a single response.
    Mirrors Phase 8 /api/analytics aggregate pattern."""
    from sqlalchemy import text
    # Each query is small + read-only; use raw SQL for clarity
    funnel = (await db.execute(text("""
        SELECT status, COUNT(*) AS count FROM message_log
        WHERE tenant_id = :t AND created_at > now() - (:days || ' days')::interval
              AND purpose = 'operational' AND deleted_at IS NULL
        GROUP BY status
    """), {"t": str(ctx.tenant_id), "days": range_days})).mappings().all()

    optout_trend = (await db.execute(text("""
        SELECT date_trunc('week', created_at) AS week, COUNT(*) AS count
        FROM audit_log WHERE tenant_id = :t AND action = 'opt_out_recorded'
              AND created_at > now() - (:days || ' days')::interval
        GROUP BY 1 ORDER BY 1
    """), {"t": str(ctx.tenant_id), "days": range_days})).mappings().all()

    cost_volume = (await db.execute(text("""
        SELECT date_trunc('day', created_at) AS day, channel,
               COUNT(*) AS count, COALESCE(SUM(provider_cost_cents), 0) AS cost_cents
        FROM message_log WHERE tenant_id = :t AND created_at > now() - (:days || ' days')::interval
              AND status IN ('sent', 'delivered', 'read') AND deleted_at IS NULL
        GROUP BY 1, 2 ORDER BY 1, 2
    """), {"t": str(ctx.tenant_id), "days": range_days})).mappings().all()

    recall_conversion = (await db.execute(text("""
        SELECT
          (SELECT COUNT(*) FROM message_log WHERE tenant_id = :t
                 AND template_kind LIKE 'recall_%' AND status IN ('sent', 'delivered')
                 AND created_at > now() - (:days || ' days')::interval) AS sent,
          (SELECT COUNT(DISTINCT a.patient_id) FROM appointments a
                 JOIN message_log m ON m.patient_id = a.patient_id AND m.template_kind LIKE 'recall_%'
                 WHERE a.tenant_id = :t AND a.start_time > m.sent_at
                       AND a.start_time < m.sent_at + INTERVAL '90 days'
                       AND m.created_at > now() - (:days || ' days')::interval) AS booked
    """), {"t": str(ctx.tenant_id), "days": range_days})).mappings().one()

    # KPIs
    sent_total = sum(r["count"] for r in funnel if r["status"] in ("sent", "delivered", "read"))
    failed_total = sum(r["count"] for r in funnel if r["status"] == "failed")
    optouts_total = sum(r["count"] for r in optout_trend)
    cost_total_cents = sum(r["cost_cents"] for r in cost_volume)

    return {
        "kpis": {
            "sent_total": sent_total,
            "failed_total": failed_total,
            "optouts_total": optouts_total,
            "cost_total_cents": cost_total_cents,
        },
        "reminder_funnel": list(funnel),
        "recall_conversion": dict(recall_conversion),
        "optout_trend": [dict(r) for r in optout_trend],
        "cost_volume": [dict(r) for r in cost_volume],
    }


@router.post("/ai-draft")
async def ai_draft_route(
    payload: dict,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from backend.services.messaging.ai_draft import draft_message
    patient = await _fetch_patient(db, ctx, UUID(payload["patient_id"]))
    tenant = await _fetch_tenant(db, ctx)
    try:
        body = await draft_message(
            intent=payload["intent"], channel=payload["channel"],
            purpose=payload.get("purpose", "manual"),
            patient_first_name=patient["first_name"],
            patient_contact_info=patient["contact_info_jsonb"],
            clinic_name=tenant["name"],
        )
    except OptOutBlocked as exc:
        raise HTTPException(409, detail={"code": exc.code, "message": str(exc)})
    return {"body": body}
```

**Step 4.** Create the matching BFF proxies (5 routes — recall-queue GET + POST send-all + history + inbox + analytics + ai-draft). Each is a simple `proxyToFastAPI` shell. Pattern:
```typescript
// app/api/messaging/history/[patientId]/route.ts
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { patientId: string } }) {
  return proxyToFastAPI(request, `/api/messaging/history/${params.patientId}/`);
}
```

**Step 5.** Create `test_routes_recall.py` and `test_routes_misc.py` covering the 10 behavior cases (5 each). Use TestClient with mocked Anthropic for ai-draft tests.
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_routes_recall.py tests/messaging/test_routes_misc.py -x -q && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "async def candidate_query" backend/services/messaging/recall.py` returns 1
    - `grep -c "async def run_recall_batch" backend/services/messaging/recall.py` returns 1
    - `grep -c "recall_exhausted" backend/services/messaging/recall.py` returns at least 2
    - `grep -c "recall_touch_count" backend/services/messaging/recall.py` returns at least 1
    - `grep -c "INTERVAL '12 months'" backend/services/messaging/recall.py` returns 1
    - `grep -c "async def draft_message" backend/services/messaging/ai_draft.py` returns 1
    - `grep -c "preflight_or_raise" backend/services/messaging/ai_draft.py` returns at least 1
    - `grep -c "scrub_phi_for_operational_sms" backend/services/messaging/ai_draft.py` returns at least 1
    - `grep -c "@router.get(\"/recall-queue\"\\|@router.post(\"/recall-queue/send-all\"\\|@router.get(\"/history/{patient_id}\"\\|@router.get(\"/inbox\"\\|@router.get(\"/analytics\"\\|@router.post(\"/ai-draft\"" backend/api/routes/messaging.py` returns at least 6
    - `ls app/api/messaging/recall-queue/route.ts app/api/messaging/recall-queue/send-all/route.ts app/api/messaging/history/\[patientId\]/route.ts app/api/messaging/inbox/route.ts app/api/messaging/analytics/route.ts app/api/messaging/ai-draft/route.ts | wc -l` returns 6
    - `cd backend && pytest tests/messaging/test_routes_recall.py -x -q` exits 0 ≥5 tests
    - `cd backend && pytest tests/messaging/test_routes_misc.py -x -q` exits 0 ≥5 tests
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>5 new endpoints + 6 BFF proxies + 2 service modules. ≥10 tests covering recall + AI draft + analytics aggregate.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Templates + settings + per-patient channel preferences routes + BFF proxies</name>
  <files>
    backend/api/routes/messaging.py,
    app/api/messaging/templates/route.ts,
    app/api/messaging/settings/route.ts,
    app/api/messaging/preferences/[patientId]/route.ts,
    backend/tests/messaging/test_routes_misc.py
  </files>
  <read_first>
    - backend/api/routes/messaging.py (Tasks 1+2 — extend)
    - backend/schemas/messaging.py (MessageTemplateOut, MessageTemplateCreate, ChannelPreferenceOut, MessagingSettingsOut)
    - .planning/phases/12-crm-patient-engagement/12-CONTEXT.md (lines 75-83 — channel preference rules; lines 95-99 — audit logging)
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (lines 168-175 — settings page tabs + preferences card)
  </read_first>
  <behavior>
    - Test 1: GET /api/messaging/templates returns all templates for tenant grouped by kind
    - Test 2: POST /api/messaging/templates creates a new template + emits TEMPLATE_CREATED audit
    - Test 3: PATCH /api/messaging/templates/{id} updates body + emits TEMPLATE_UPDATED audit
    - Test 4: DELETE /api/messaging/templates/{id} soft-deletes + emits audit
    - Test 5: GET /api/messaging/settings returns messaging settings from tenant.settings_jsonb.messaging
    - Test 6: PATCH /api/messaging/settings updates daily_sms_cap_cents + emits MESSAGING_ENABLED audit when toggled on
    - Test 7: GET /api/messaging/preferences/{patient_id} returns ChannelPreference + ConsentFlags
    - Test 8: PATCH /api/messaging/preferences/{patient_id} updates consent flags + emits CHANNEL_PREFERENCE_UPDATED + (CONSENT_GRANTED OR CONSENT_REVOKED) per change
    - Test 9: PATCH preferences sets paused_until → blocks subsequent dispatches (re-uses existing opt_out_guard test infrastructure)
    - Test 10: PATCH preferences guardian fields validates required keys when patient is minor
  </behavior>
  <action>
**Step 1.** Append to `backend/api/routes/messaging.py`:

```python
@router.get("/templates", response_model=list[MessageTemplateOut])
async def list_templates(
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from sqlalchemy import select
    from backend.db.models.tenant.messaging import MessageTemplate
    rows = (await db.execute(
        select(MessageTemplate)
        .where(MessageTemplate.tenant_id == ctx.tenant_id, MessageTemplate.deleted_at.is_(None))
        .order_by(MessageTemplate.kind, MessageTemplate.language)
    )).scalars().all()
    return [MessageTemplateOut.model_validate(r) for r in rows]


@router.post("/templates", response_model=MessageTemplateOut, status_code=201)
async def create_template(
    payload: MessageTemplateCreate,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from backend.db.models.tenant.messaging import MessageTemplate
    template = MessageTemplate(
        tenant_id=ctx.tenant_id, kind=payload.kind, channel=payload.channel,
        language=payload.language, subject=payload.subject, body=payload.body,
        is_default=False,
    )
    db.add(template)
    await db.flush()
    await log_action(db, ctx, AuditAction.TEMPLATE_CREATED,
                     resource_type="message_template", resource_id=template.id,
                     metadata={"kind": payload.kind, "channel": payload.channel, "language": payload.language})
    await db.commit()
    return MessageTemplateOut.model_validate(template)


@router.patch("/templates/{template_id}", response_model=MessageTemplateOut)
async def update_template(
    template_id: UUID, payload: MessageTemplateUpdate,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from sqlalchemy import select
    from backend.db.models.tenant.messaging import MessageTemplate
    template = (await db.execute(select(MessageTemplate).where(
        MessageTemplate.id == template_id, MessageTemplate.tenant_id == ctx.tenant_id
    ))).scalar_one()
    changes = {}
    if payload.body is not None: changes["body"] = (template.body, payload.body); template.body = payload.body
    if payload.subject is not None: template.subject = payload.subject
    await db.flush()
    await log_action(db, ctx, AuditAction.TEMPLATE_UPDATED,
                     resource_type="message_template", resource_id=template.id,
                     metadata={"changes_keys": list(changes.keys())})
    await db.commit()
    return MessageTemplateOut.model_validate(template)


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from sqlalchemy import select
    from backend.db.models.tenant.messaging import MessageTemplate
    template = (await db.execute(select(MessageTemplate).where(
        MessageTemplate.id == template_id, MessageTemplate.tenant_id == ctx.tenant_id
    ))).scalar_one()
    from datetime import datetime, timezone
    template.deleted_at = datetime.now(timezone.utc)
    await log_action(db, ctx, AuditAction.TEMPLATE_UPDATED,
                     resource_type="message_template", resource_id=template.id,
                     metadata={"action": "soft_delete"})
    await db.commit()


@router.get("/settings", response_model=MessagingSettingsOut)
async def get_settings(
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    tenant = await _fetch_tenant(db, ctx)
    return MessagingSettingsOut(
        messaging_enabled=tenant.get("messaging_enabled", False),
        daily_sms_cap_cents=tenant.get("daily_sms_cap_cents", 2500),
        twilio_phone_number=tenant.get("twilio_phone_number"),
        twilio_messaging_service_sid=tenant.get("twilio_messaging_service_sid"),
        resend_from_email=tenant.get("resend_from_email"),
    )


@router.patch("/settings", response_model=MessagingSettingsOut)
async def update_settings(
    payload: MessagingSettingsUpdate,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from sqlalchemy import select
    from backend.db.models.public.saas import Tenant
    tenant = (await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))).scalar_one()
    settings = dict(tenant.settings_jsonb or {})
    msg = dict(settings.get("messaging", {}))
    was_enabled = msg.get("messaging_enabled", False)
    if payload.messaging_enabled is not None: msg["messaging_enabled"] = payload.messaging_enabled
    if payload.daily_sms_cap_cents is not None: msg["daily_sms_cap_cents"] = payload.daily_sms_cap_cents
    if payload.resend_from_email is not None: msg["resend_from_email"] = payload.resend_from_email
    settings["messaging"] = msg
    tenant.settings_jsonb = settings
    if msg.get("messaging_enabled") and not was_enabled:
        await log_action(db, ctx, AuditAction.MESSAGING_ENABLED,
                         resource_type="tenant", resource_id=ctx.tenant_id, metadata={})
    elif not msg.get("messaging_enabled") and was_enabled:
        await log_action(db, ctx, AuditAction.MESSAGING_DISABLED,
                         resource_type="tenant", resource_id=ctx.tenant_id, metadata={})
    await db.commit()
    return MessagingSettingsOut(messaging_enabled=msg.get("messaging_enabled", False),
                                 daily_sms_cap_cents=msg.get("daily_sms_cap_cents", 2500),
                                 twilio_phone_number=msg.get("twilio_phone_number"),
                                 twilio_messaging_service_sid=msg.get("twilio_messaging_service_sid"),
                                 resend_from_email=msg.get("resend_from_email"))


@router.get("/preferences/{patient_id}", response_model=ChannelPreferenceOut)
async def get_preferences(
    patient_id: UUID,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    patient = await _fetch_patient(db, ctx, patient_id)
    contact = patient["contact_info_jsonb"]
    return ChannelPreferenceOut(
        patient_id=patient_id,
        preferred_channel=contact.get("preferred_channel", "both"),
        preferred_language=contact.get("preferred_language", "en"),
        consents={
            "sms_marketing": bool(contact.get("consent_sms_marketing_at")),
            "sms_operational": bool(contact.get("consent_sms_operational_at")),
            "email_marketing": bool(contact.get("consent_email_marketing_at")),
            "email_operational": bool(contact.get("consent_email_operational_at")),
            "sms_marketing_at": contact.get("consent_sms_marketing_at"),
            "sms_operational_at": contact.get("consent_sms_operational_at"),
            "email_marketing_at": contact.get("consent_email_marketing_at"),
            "email_operational_at": contact.get("consent_email_operational_at"),
            "sms_opted_out_at": contact.get("sms_opted_out_at"),
            "paused_until": contact.get("paused_until"),
        },
        guardian_routing=bool(contact.get("guardian")),
        guardian_name=(contact.get("guardian") or {}).get("name"),
        guardian_phone_e164=(contact.get("guardian") or {}).get("phone_e164"),
        guardian_email=(contact.get("guardian") or {}).get("email"),
        guardian_relationship=(contact.get("guardian") or {}).get("relationship"),
        recall_exhausted=bool(contact.get("recall_exhausted", False)),
    )


@router.patch("/preferences/{patient_id}", response_model=ChannelPreferenceOut)
async def update_preferences(
    patient_id: UUID, payload: ChannelPreferenceUpdate,
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from sqlalchemy import select
    from datetime import datetime, timezone
    from backend.db.models.tenant.clinical import Patient
    patient = (await db.execute(select(Patient).where(
        Patient.id == patient_id, Patient.tenant_id == ctx.tenant_id
    ))).scalar_one()
    contact = dict(patient.contact_info_jsonb or {})
    now_iso = datetime.now(timezone.utc).isoformat()
    granted = []
    revoked = []
    for key in ("sms_marketing", "sms_operational", "email_marketing", "email_operational"):
        wanted = getattr(payload.consents, key, None) if payload.consents else None
        if wanted is None: continue
        consent_key = f"consent_{key}_at"
        prev = bool(contact.get(consent_key))
        if wanted and not prev:
            contact[consent_key] = now_iso
            granted.append(key)
        elif not wanted and prev:
            contact[consent_key] = None
            revoked.append(key)
    if payload.preferred_channel: contact["preferred_channel"] = payload.preferred_channel
    if payload.preferred_language: contact["preferred_language"] = payload.preferred_language
    if payload.paused_until is not None: contact["paused_until"] = payload.paused_until
    if payload.guardian:
        # validate minor age — caller may want to add to a Guardian (no age check here, just persist)
        contact["guardian"] = payload.guardian.model_dump()
    patient.contact_info_jsonb = contact
    await log_action(db, ctx, AuditAction.CHANNEL_PREFERENCE_UPDATED,
                     resource_type="patient", resource_id=patient.id, patient_id=patient.id,
                     metadata={"granted": granted, "revoked": revoked})
    if granted:
        await log_action(db, ctx, AuditAction.CONSENT_GRANTED,
                         resource_type="patient", resource_id=patient.id, patient_id=patient.id,
                         metadata={"consents": granted})
    if revoked:
        await log_action(db, ctx, AuditAction.CONSENT_REVOKED,
                         resource_type="patient", resource_id=patient.id, patient_id=patient.id,
                         metadata={"consents": revoked})
    await db.commit()
    return await get_preferences(patient_id, ctx, db)
```

**Step 2.** Create BFF proxies for `/templates`, `/settings`, `/preferences/[patientId]` — same pattern as Task 2.

**Step 3.** Append to `backend/tests/messaging/test_routes_misc.py` 10 new test cases covering templates + settings + preferences endpoints.
  </action>
  <verify>
    <automated>cd backend && pytest tests/messaging/test_routes_misc.py -x -q && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@router.get(\"/templates\"\\|@router.post(\"/templates\"\\|@router.patch(\"/templates\\|@router.delete(\"/templates" backend/api/routes/messaging.py` returns at least 4
    - `grep -c "@router.get(\"/settings\"\\|@router.patch(\"/settings\"" backend/api/routes/messaging.py` returns at least 2
    - `grep -c "@router.get(\"/preferences\\|@router.patch(\"/preferences" backend/api/routes/messaging.py` returns at least 2
    - `grep -c "TEMPLATE_CREATED\\|TEMPLATE_UPDATED\\|MESSAGING_ENABLED\\|MESSAGING_DISABLED\\|CHANNEL_PREFERENCE_UPDATED\\|CONSENT_GRANTED\\|CONSENT_REVOKED" backend/api/routes/messaging.py` returns at least 6
    - `ls app/api/messaging/templates/route.ts app/api/messaging/settings/route.ts app/api/messaging/preferences/\[patientId\]/route.ts | wc -l` returns 3
    - `cd backend && pytest tests/messaging/test_routes_misc.py -x -q` exits 0 with at least 15 tests total
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Templates CRUD + settings GET/PATCH + preferences GET/PATCH all wired. Audit emissions cover all required AuditAction values. ≥10 new tests pass.</done>
</task>

</tasks>

<verification>
1. `cd backend && pytest tests/messaging/test_routes_send.py tests/messaging/test_routes_bulk.py tests/messaging/test_routes_recall.py tests/messaging/test_routes_misc.py -x -q` → exits 0; ≥30 tests
2. Endpoint count check — `grep -c "@router\\." backend/api/routes/messaging.py` → ≥13 routes
3. BFF count check — `find app/api/messaging -name "route.ts" | wc -l` → ≥10
4. `npx tsc --noEmit` → exits 0
</verification>

<success_criteria>
- 13+ messaging endpoints in backend/api/routes/messaging.py with entitlement gate
- 10 BFF proxies created
- bulk_send service enforces 50-cap + 1 msg/sec
- Recall query + batch run with auto-exhaustion at 2 touches
- AI draft preflights opt-out (CRM-12 contract test)
- Analytics single-aggregate response shape (Phase 8 precedent)
- Bounce-fallback hook flips channel on 3 fails (CRM-20)
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-05-SUMMARY.md` documenting:
- Final endpoint inventory (path + method + entitlement-gate status)
- BFF route inventory
- Total test count by file
- Any deviations from the analytics aggregate shape (e.g. did Recharts inline pattern need adjustments)
</output>
