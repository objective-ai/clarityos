# Phase 12: CRM & Patient Engagement — Research

**Researched:** 2026-04-29
**Domain:** Multi-channel patient communications (SMS via Twilio + Email via Resend), background scheduling, webhook-driven status reconciliation, HIPAA/TCPA compliance, AI-assisted drafting/classification
**Confidence:** HIGH on stack/patterns, MEDIUM on Resend BAA path (must be confirmed via Resend sales before plan-locks), MEDIUM on quiet-hours timezone strategy

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Provider Stack**
- **SMS:** Twilio (BAA-signed, webhook delivery status, Advanced Opt-Out enabled)
- **Email:** Resend (React Email templates, BAA path, Next.js-friendly)
- **Account model:** Hybrid — ClarityOS-managed for pilot. BYO clinic credentials deferred.
- **Test mode:** Allowlist by phone/email in dev/staging — non-allowlisted recipients are logged-only. Allowlist in env config.
- **Cost guardrails:** Daily per-clinic spend cap (default $25/day). 80% threshold logs warning + emails OWNER; 100% hard-stops with admin override. Tracked in `clinic_settings.daily_sms_cap_cents`.
- **Retry policy:** Exponential backoff, max 3 retries (30s → 2m → 10m). After exhaustion, mark `status=failed` and surface in admin error log.
- **Webhooks:** Signed webhooks at `/api/webhooks/twilio` and `/api/webhooks/resend`. Verify provider signature, update `message_log` row by `provider_message_id`.
- **Scheduler:** Background worker (cron every 5–15 min) scans `appointments` for `reminder_due_at <= now AND not yet sent`. No external job queue. Use existing FastAPI scheduling pattern.

**Reminder Cadence & Content**
- 3-touch cadence: 7 days, 72 hours, 24 hours pre-appointment.
- Predefined token set only. No free-form template authoring v1.
- PHI-minimum: clinic name, patient first name, date+time, "eye exam" generic label, links. Email may add provider name. Never includes diagnosis, Rx, condition codes, or specific reason-for-visit. Clinic CANNOT override.
- Confirm-by-reply ("Reply YES to confirm, NO to reschedule") + reschedule signed-token link. `appointments.patient_confirmed_at`.
- Quiet hours: 9pm–8am patient-local time, scheduler-enforced.
- Languages: English + Spanish (`preferred_language`).

**Recall**
- Candidate rule: last finalized encounter > 12 months AND no future appointment.
- Approval model: staff-approved queue. No auto sends in v1.
- Cadence: 2 touches max (month 12 + month 14). After exhaustion, `recall_exhausted=true` until next finalized encounter resets.
- Auto-exclusions: deceased/inactive, marketing opt-out, missing valid phone+email, future appointment exists.

**Opt-out / Consent / Inbound**
- STOP handling: Twilio Advanced Opt-Out (carrier-level) + DB sync.
- Per-channel × per-purpose flags: `consent_sms_marketing`, `consent_sms_operational`, `consent_email_marketing`, `consent_email_operational`. First STOP opts out marketing; second STOP opts out operational too.
- Consent capture: intake form + booking confirmation. Explicit timestamps for TCPA audit trail.
- Inbound replies (non-STOP): global Messages inbox + per-patient threaded view. Send-and-log (not real-time chat).

**Manual Messaging UX**
- 4 entry points: patient header, schedule kebab, inbox reply, schedule bulk-select.
- Composer: channel selector + template dropdown + tokens + editable body.
- Preview: tokens replaced + opt-out warning (block) + SMS char/segment count.
- PHI: email full freedom; SMS scans for risky keywords and shows soft warn (doesn't block).

**Message History**
- Per-patient Messages tab + global inbox.
- States: Queued → Sent → Delivered → Read (email opens) / Failed.
- Failed: inline reason + manual Resend.
- Retention: 2 years primary DB, archive after; never auto-delete (HIPAA 6yr min).

**Channel Preference**
- Captured: intake, patient detail (staff-edit), booking confirmation self-service signed link.
- New patient defaults: SMS+email opted-in for **operational only**. Marketing/recall stays opt-in.
- Bounce fallback: 3 fails → flip to alternate channel + "needs update" badge.
- Pause-until-date toggle.
- Minors (<18) → Guardian (name+phone+email+relationship). Switch on 18th birthday.
- Household bundling on shared contact.
- Emergency contact never auto-messaged.

**AI**
- Inbound classifier: Claude tags inbound SMS with one of [reschedule_request, cancellation, question_clinical, question_billing, thank_you, spam].
- Draft assist: "Draft with AI" composer button. Reuses `backend/services/ai_scribe.py` + Haiku.

**Compliance & Audit**
- Every message, opt-in/out, consent change, channel preference edit, template edit logged with actor + timestamp + reason in `messaging_audit_log` (or reuse generic AuditLog — see Open Questions).
- Monthly OWNER PDF export "Communications Compliance Report".

**Onboarding**
- Settings → Messaging onboarding wizard (7 steps, ends with test-message + "I received them" → flips `clinic_messaging_enabled=true`).
- Dedicated local Twilio number per clinic (auto-provisioned, ClarityOS pays for pilot).
- Industry-pack template seeding (optometry/ophthalmology/general).

**Reporting**
- `/messaging/analytics` page + 1–2 dashboard hero cards.
- Metrics: reminder funnel, recall conversion, opt-out trend, cost & volume.
- 7d/30d/90d/YTD/custom range. CSV per chart + monthly PDF.

### Claude's Discretion

- Wizard step UI, inbox layout, recall queue density (use glassmorphism + Card)
- Schema details: column types, indexes, FK constraints (subject to clinical-safety review)
- Worker implementation choice (FastAPI cron mechanism vs APScheduler vs alternative) — see § Architecture / Scheduler for recommendation
- Webhook endpoint structure & signature verification implementation
- Error message copy and toast styling
- `useChannelPreference()` hook extraction (evaluate after writing)
- Twilio + Resend SDK exact pinning
- Internal naming for tables/columns/enums (subject to project conventions)

### Deferred Ideas (OUT OF SCOPE)

- Smart send-time learning per patient (data-poor at pilot)
- AI auto-reply for FAQ inbound (legal review needed)
- ML no-show prediction
- Two-way real-time chat / typing indicators / push
- Patient self-service portal with login (signed token URLs only in v1)
- Voice-call fallback (Twilio TTS)
- BYO clinic Twilio/Resend credentials
- Per-staff messaging activity dashboard
- Configurable per-clinic quiet hours
- Per-patient configurable recall window
- Full WYSIWYG template editor with custom token authoring
- Bulk marketing campaigns / segments
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md lists Phase 12 as deferred under "Out of Scope" with no REQ-IDs assigned (see line 162: "SMS/email appointment reminders … requires vendor decision"). The vendor decision is now made (Twilio + Resend, locked above), so the planner MUST mint new requirement IDs during planning.

**Suggested new IDs (planner to confirm and add to REQUIREMENTS.md):**

| Suggested ID | Description | Source | Research Support |
|----|-------------|--------|-----------------|
| CRM-01 | Operational appointment reminders sent automatically at 7d, 72h, 24h pre-appointment via patient's preferred channel(s) | ROADMAP success #1 + CONTEXT cadence | § Scheduler, § Reminder Cadence |
| CRM-02 | Staff can manually send a message from patient detail header, schedule kebab, inbox reply, or bulk-select on schedule | ROADMAP success #2 + CONTEXT entry-points | § Composer, § Bulk Send Safeguards |
| CRM-03 | Recall reminders triggered for patients whose last finalized encounter > 12 months ago and no future appointment, surfaced in staff-approved queue | ROADMAP success #3 + CONTEXT recall rules | § Recall Candidate Query |
| CRM-04 | Patients can opt out of SMS via STOP keyword (Twilio Advanced Opt-Out + DB sync); opt-out respected on every send via preflight check | ROADMAP success #4 + CONTEXT opt-out scope | § Opt-out Enforcement |
| CRM-05 | Per-patient message history viewable on patient detail Messages tab with states (queued/sent/delivered/read/failed) | ROADMAP success #5 + CONTEXT history surface | § Message Log Schema, § Webhook Reconciliation |
| CRM-06 | Per-channel × per-purpose consent flags (4 flags) captured at intake/booking with explicit timestamps for TCPA audit trail | CONTEXT consent capture | § TCPA Compliance |
| CRM-07 | Twilio + Resend webhooks verify provider signatures and update message status idempotently by `provider_message_id` | CONTEXT webhooks | § Webhook Security |
| CRM-08 | Quiet hours 9pm–8am patient-local enforced by scheduler; messages deferred to next allowed window | CONTEXT quiet hours | § Quiet Hours & Timezone |
| CRM-09 | Daily per-clinic spend cap with 80% warn + 100% hard-stop with admin override | CONTEXT cost guardrails | § Cost Cap Enforcement |
| CRM-10 | Bulk-send safeguards: max 50 recipients, throttle 1msg/sec, mandatory preview-confirm, single batch_id audit | CONTEXT specifics | § Bulk Send |
| CRM-11 | Inbound non-STOP SMS classified by Claude into 6 categories; reschedule/cancellation tagged float to top of inbox | CONTEXT AI classifier | § AI Classifier Pipeline |
| CRM-12 | "Draft with AI" composer button: staff intent → HIPAA-safe message respecting opt-out + minor routing | CONTEXT AI draft | § AI Draft Assist |
| CRM-13 | Onboarding wizard with test-send + "I received them" gate before `clinic_messaging_enabled=true` | CONTEXT activation | § Onboarding Wizard |
| CRM-14 | Per-clinic dedicated local Twilio number auto-provisioned during wizard step 3 | CONTEXT number provisioning | § Number Provisioning |
| CRM-15 | `/messaging/analytics` page (reminder funnel, recall conversion, opt-out trend, cost+volume) + dashboard hero cards | CONTEXT reporting | § Analytics |
| CRM-16 | Monthly "Communications Compliance Report" PDF export, OWNER-gated | CONTEXT compliance export | § Audit & Compliance Export |
| CRM-17 | `messaging` entitlement key added to `lib/entitlements.ts` and `app/core/entitlements.py`; included in Plus + Premium plans | § Entitlements gap | § Entitlements |
| CRM-18 | Minors (<18) route to Guardian (name+phone+email+relationship); 18th-birthday "switch to patient" prompt | CONTEXT minors | § Guardian Routing |
| CRM-19 | Household bundling: shared contact + same-day appointments → single bundled SMS | CONTEXT bundling | § Household Bundling |
| CRM-20 | Bounce fallback: 3 fails on preferred channel → auto-flip to alternate + "needs update" badge | CONTEXT bounce fallback | § Bounce Fallback |

**Planner action:** Mint these as canonical CRM-01..CRM-20 in REQUIREMENTS.md before authoring plans.
</phase_requirements>

## Summary

This is a greenfield, full-stack phase (DB migrations + 6–8 FastAPI routes + matching BFF proxies + scheduler + 3 new pages + patient/schedule/settings UI extensions + 2 webhook endpoints + 2 SaaS integrations + audit infra + AI features). The good news: **every architectural primitive needed already exists in the codebase** — async asyncio background loop pattern (Phase 10.3 self-pinger in `backend/main.py:182-211`), generic `AuditLog` table with action enum that can be extended, AI Scribe Anthropic client, BFF `proxyToFastAPI` with bearer-token forwarding, public-route allowlist in `lib/supabase/middleware.ts`, JSONB on `Tenant.settings_jsonb` and `Patient.contact_info_jsonb`, and tenant-level `Tenant.timezone` column.

**Primary recommendation:** Use **`asyncio.create_task` + `@app.on_event("startup")` background loop** (mirroring the existing 10.3 self-pinger), running a single 5-minute tick that processes a fan-out worklist. Avoid APScheduler (multi-process gunicorn duplication risk) and avoid Vercel Cron (would require a public unauthenticated FastAPI endpoint or BFF round-trip with serverless cold start). For Twilio webhooks, use `twilio.request_validator.RequestValidator` against raw form data; for Resend, use `svix-id`/`svix-timestamp`/`svix-signature` HMAC via the Resend SDK or raw Svix Python lib. Reuse the existing generic `AuditLog` (extend `AuditAction` enum) rather than creating a parallel `messaging_audit_log` — the schema already supports the use case via `resource_type='message'` and `metadata_` JSONB.

**Confidence breakdown:**
- HIGH: scheduler pattern, signature verification, SDK choices, schema design, test infrastructure
- MEDIUM: Resend BAA availability (must confirm in writing before pilot — page does not advertise it; competitor Paubox/MailHippo do)
- MEDIUM: AI classifier sync vs async (recommend async — see § AI Classifier)

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `twilio` (Python) | 9.10.5 (2026-04-14) | SMS send + webhook validation + opt-out + number provisioning | Official SDK, only well-supported BAA-eligible programmable SMS provider in US healthcare |
| `resend` (Python) | 2.29.0 | Transactional email send + idempotency-key + webhook helpers | Official SDK from Resend, async via httpx, Next.js-friendly stack alignment |
| `@react-email/render` | latest 4.x | Server-side render React Email JSX → HTML string | Standard pairing with Resend; renders in Next.js BFF (NOT Python) — see § Email Template Architecture |
| `@react-email/components` | latest 0.6.x | Pre-built email primitives (Button, Container, Text) | Industry standard |
| `svix` (Python) | 1.x | Resend webhook signature verification (Svix HMAC) | Resend uses Svix infra; official path per Resend docs |
| `pytz` / stdlib `zoneinfo` | stdlib (Py 3.11+) | Patient-local timezone arithmetic for quiet hours | Already in project; no new dep |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `phonenumbers` (Python) | 8.13+ | E.164 normalization, area-code extraction for Twilio number provisioning | Validate phones at intake; pick area code for clinic Twilio number |
| `httpx` | already installed (≥0.27) | Async HTTP for Twilio number search API | Reuse — no new dep |
| `tenacity` | candidate ≥9 | Retry-with-backoff decorators for Twilio/Resend send calls | Decision: hand-roll (3 retries is small, see § Don't Hand-Roll caveat) OR add tenacity. **Recommendation: hand-roll** — 3 fixed delays don't justify a dep. |
| `reportlab` | already in project for Phase 9 | Compliance Report PDF | Reuse |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Twilio | Telnyx, Sinch, Plivo | Twilio has the deepest BAA coverage and Advanced Opt-Out; user locked Twilio in CONTEXT |
| Resend | Postmark, SendGrid, Mailgun, AWS SES | Postmark has most mature healthcare track record but lacks React Email native integration; user locked Resend |
| asyncio loop | APScheduler, Celery, Redis Queue, Vercel Cron | See § Scheduler decision matrix below |
| Reuse `AuditLog` | New `messaging_audit_log` table | Reuse is project-idiomatic — see § Audit Logging |

**Installation:**
```bash
# Python (backend/requirements.txt)
twilio>=9.10.5,<10
resend>=2.29.0,<3
svix>=1.40.0,<2
phonenumbers>=8.13.50

# Node (package.json)
npm install @react-email/components @react-email/render
```

**Version verification:** `pip index versions twilio` and `pip index versions resend` and `npm view @react-email/render version` should be run during Wave 0 of execution to lock exact pins.

## Architecture Patterns

### Recommended Project Structure
```
backend/
├── api/routes/
│   ├── messaging.py              # /api/messaging/* (templates, send, history, recall queue, analytics)
│   └── webhooks.py               # /api/webhooks/twilio, /api/webhooks/resend (CSRF-exempt, signature-verified)
├── services/
│   ├── messaging/
│   │   ├── __init__.py
│   │   ├── sender.py             # Channel-agnostic preflight + dispatch (THE choke point)
│   │   ├── twilio_client.py      # Twilio SDK wrapper + signature validator
│   │   ├── resend_client.py      # Resend SDK wrapper + Svix verifier
│   │   ├── templates.py          # Token render + PHI guard (block Rx/dx in operational SMS)
│   │   ├── quiet_hours.py        # patient-local TZ + window check
│   │   ├── opt_out_guard.py      # The guard. Cannot be bypassed.
│   │   ├── cost_cap.py           # Daily spend tracking + 80%/100% gate
│   │   ├── recall.py             # Candidate query + queue management
│   │   ├── classifier.py         # Inbound SMS Claude classifier
│   │   └── scheduler.py          # The 5-minute tick worker
│   └── ai_scribe.py              # EXISTING — reuse Anthropic client
├── db/models/tenant/
│   └── messaging.py              # MessageLog, MessageTemplate, RecallQueueRun, InboundMessage
├── schemas/
│   └── messaging.py              # Pydantic models (snake_case, exposed via apiFetch camelize)
└── alembic/versions/
    └── 0016_crm_messaging.py     # All schema changes in one migration

app/
├── (tenant)/[tenant]/
│   ├── messaging/
│   │   ├── inbox/page.tsx        # Global inbound inbox
│   │   ├── recall-queue/page.tsx # Staff-approved recall queue
│   │   └── analytics/page.tsx    # Recharts inline (mirror Phase 8)
│   ├── settings/messaging/
│   │   ├── page.tsx              # Templates editor + cost cap + quiet-hours overrides
│   │   └── onboarding/page.tsx   # 7-step wizard
│   └── patients/[id]/
│       └── (extend) MessagesTab.tsx
└── api/
    ├── messaging/                # BFF proxies for messaging.py routes
    │   ├── send/route.ts
    │   ├── templates/route.ts
    │   ├── history/[patientId]/route.ts
    │   ├── recall-queue/route.ts
    │   ├── analytics/route.ts
    │   └── inbox/route.ts
    └── webhooks/
        ├── twilio/route.ts       # Public — see § Webhook Routing
        └── resend/route.ts       # Public — see § Webhook Routing

components/messaging/
├── MessageComposer.tsx
├── ChannelPreferenceChip.tsx
├── MessageStatusIcon.tsx
├── InboxItem.tsx
├── RecallQueueRow.tsx
└── OptOutWarning.tsx

store/
├── messagingStore.ts             # Composer draft, inbox unread count
└── recallQueueStore.ts

types/
└── messaging.ts                  # Shared TS types (camelize-friendly)
```

### Pattern 1: Single-Choke-Point Sender Service

**What:** Every outbound message — reminder, recall, manual, AI-drafted, bulk — funnels through one function: `messaging.sender.dispatch()`. This function is the ONLY place that calls Twilio/Resend SDKs.

**Why:** Opt-out enforcement, quiet hours, cost cap, audit logging, PHI guard, and minor-routing must each happen on EVERY send. A single choke point makes "is it possible to bypass?" answerable by code review (one file).

**When to use:** Always — even tests should call `dispatch()` (with mocked SDK) to exercise the guard chain.

**Example:**
```python
# backend/services/messaging/sender.py
# Source: project pattern (single choke point) — adapted from clinical-safety rule
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.security import TenantContext
from backend.db.models.tenant.messaging import MessageLog
from backend.db.models.tenant.clinical import AuditAction
from backend.core.audit import log_action
from .opt_out_guard import preflight_or_raise
from .quiet_hours import is_in_quiet_hours, next_allowed_window
from .cost_cap import reserve_spend_or_raise, refund_reservation
from .templates import render_template, scrub_phi_for_operational_sms
from .twilio_client import send_sms
from .resend_client import send_email

@dataclass
class DispatchRequest:
    tenant_id: UUID
    patient_id: UUID
    channel: Literal["sms", "email"]
    purpose: Literal["operational", "marketing"]   # marketing == recall
    template_id: UUID | None
    body_override: str | None
    tokens: dict
    batch_id: UUID | None = None       # set for bulk sends + recall runs
    actor_user_id: UUID | None = None  # null for scheduler-originated sends
    force_outside_quiet_hours: bool = False  # manual override only
    reminder_idx: int | None = None    # 0/1/2 for 7d/72h/24h reminders

async def dispatch(db: AsyncSession, ctx: TenantContext, req: DispatchRequest) -> MessageLog:
    # 1. Resolve patient + recipient (with minor-routing → guardian)
    patient, recipient = await _resolve_recipient(db, req)

    # 2. Preflight: opt-out + paused + valid contact
    preflight_or_raise(patient, req.channel, req.purpose)

    # 3. Quiet hours (scheduler-originated only — manual sends pass force=true with audit)
    if not req.force_outside_quiet_hours and is_in_quiet_hours(patient, db):
        return await _defer_to_window(db, ctx, req, next_allowed_window(patient))

    # 4. Render + PHI guard
    rendered = render_template(req.template_id, req.body_override, req.tokens, patient.preferred_language)
    if req.channel == "sms" and req.purpose == "operational":
        scrub_phi_for_operational_sms(rendered)  # raises if Rx/dx terms slip in

    # 5. Cost cap reservation (atomic)
    reservation = await reserve_spend_or_raise(db, ctx.tenant_id, req.channel, rendered)

    # 6. Insert MessageLog (status=queued) IN PRIMARY TXN — clinical-safety rule
    log = MessageLog(tenant_id=ctx.tenant_id, ..., status="queued")
    db.add(log)
    await db.flush()
    await log_action(db, ctx, AuditAction.MESSAGE_SENT,
                     resource_type="message", resource_id=log.id,
                     patient_id=patient.id, metadata={"batch_id": str(req.batch_id) if req.batch_id else None,
                                                       "channel": req.channel,
                                                       "purpose": req.purpose,
                                                       "reservation_id": str(reservation.id)})
    # Note: no commit yet — caller commits after dispatch returns

    # 7. Dispatch (out-of-txn but within request — failure marks log.status=failed)
    try:
        if req.channel == "sms":
            provider_id = await send_sms(rendered.body, recipient.phone_e164, status_callback_url=...)
        else:
            provider_id = await send_email(rendered.subject, rendered.html, recipient.email)
        log.provider_message_id = provider_id
        log.status = "sent"
        log.sent_at = datetime.now(timezone.utc)
    except ProviderError as exc:
        log.status = "failed"
        log.failure_reason = str(exc)
        await refund_reservation(db, reservation)

    return log
```

### Pattern 2: Async In-Process Scheduler (mirrors 10.3 self-pinger)

**What:** A single asyncio task started in `@app.on_event("startup")` that ticks every 5 minutes, processes due reminders + recall touches, and recomputes the recall queue once per day at 6am clinic-local.

**When to use:** v1 pilot only. **Do NOT use** when scaling to multiple FastAPI instances (will cause duplicate sends — every instance will tick).

**Mitigation for v1:** Pilot is single-instance Render dyno. Add an advisory-lock (`pg_try_advisory_lock(hash('messaging-scheduler'))`) so even if a second instance accidentally launches, only one ticks. Scaling to multiple instances later → migrate to a dedicated worker process.

**Example:**
```python
# backend/main.py — extend existing pattern
# Source: Phase 10.3 self-pinger pattern (backend/main.py:170-210)
from backend.services.messaging.scheduler import tick_messaging_scheduler

_messaging_task: asyncio.Task | None = None
_MESSAGING_TICK_SECONDS = 300  # 5 minutes — matches CONTEXT cron range 5–15min

async def _messaging_loop() -> None:
    while True:
        try:
            async with AsyncSessionLocal() as db:
                # Advisory lock — no-op if another instance is already ticking
                got_lock = (await db.execute(select(func.pg_try_advisory_lock(0xC12C12C12C12C12)))).scalar()
                if got_lock:
                    try:
                        await tick_messaging_scheduler(db)
                    finally:
                        await db.execute(select(func.pg_advisory_unlock(0xC12C12C12C12C12)))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("messaging scheduler tick failed: %s", exc)
        await asyncio.sleep(_MESSAGING_TICK_SECONDS)

@app.on_event("startup")
async def _start_messaging_scheduler() -> None:
    global _messaging_task
    if os.getenv("MESSAGING_SCHEDULER_ENABLED", "true").lower() != "true":
        return
    _messaging_task = asyncio.create_task(_messaging_loop())
```

### Pattern 3: Webhook Endpoint (CSRF-exempt + Idempotent + Signature-Verified)

**What:** Public Next.js BFF route that verifies provider signature, then forwards verified payload to FastAPI. FastAPI route accepts internal-only auth (a HMAC of `provider+timestamp` with a shared secret) so even if BFF is bypassed, FastAPI rejects spoofed callbacks.

**When to use:** All `/api/webhooks/*` routes.

**Why both signature checks:** BFF can fail open if signature lib has a bug; FastAPI's internal HMAC is defense-in-depth. Pattern matches Phase 10.3 PHI scrubber's belt-and-suspenders philosophy.

**Pitfall:** Resend uses Svix headers (`svix-id`/`svix-timestamp`/`svix-signature`). Twilio uses `X-Twilio-Signature` over `application/x-www-form-urlencoded` body. **You cannot parse JSON before validating Twilio** — must keep raw form parsing.

**Critical for Next.js:** Add `/api/webhooks/` to `isPublicRoute` allowlist in `lib/supabase/middleware.ts:60-72`. Currently NOT in the list — this is a required edit.

**Example (Twilio webhook BFF):**
```typescript
// app/api/webhooks/twilio/route.ts
// Source: project BFF pattern + Twilio docs
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Forward raw body + signature header to FastAPI — let Python verify (single source of truth)
  const FASTAPI_URL = process.env.FASTAPI_URL!;
  const internal = process.env.WEBHOOK_INTERNAL_SECRET!;
  const sig = request.headers.get("X-Twilio-Signature") ?? "";
  const body = await request.text();

  const res = await fetch(`${FASTAPI_URL}/api/webhooks/twilio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": sig,
      "X-Webhook-Internal": internal,                        // shared secret
      "X-Forwarded-Host": request.nextUrl.host,              // signature is over original URL
    },
    body,
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "text/plain" },
  });
}
```

```python
# backend/api/routes/webhooks.py
# Source: twilio.com/blog/build-secure-twilio-webhook-python-fastapi
from fastapi import APIRouter, Request, HTTPException
from twilio.request_validator import RequestValidator
from svix.webhooks import Webhook as SvixWebhook
from backend.core.config import settings

router = APIRouter()

@router.post("/api/webhooks/twilio")
async def twilio_webhook(request: Request):
    if request.headers.get("X-Webhook-Internal") != settings.WEBHOOK_INTERNAL_SECRET:
        raise HTTPException(403, "Internal seal failed")
    form = dict(await request.form())
    # Reconstruct original URL — must match what Twilio signed
    forwarded_host = request.headers.get("X-Forwarded-Host", request.url.hostname)
    url = f"https://{forwarded_host}/api/webhooks/twilio"
    validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)
    if not validator.validate(url, form, request.headers.get("X-Twilio-Signature", "")):
        raise HTTPException(403, "Invalid Twilio signature")
    await _process_twilio_callback(form)  # idempotent on MessageSid
    return {"ok": True}

@router.post("/api/webhooks/resend")
async def resend_webhook(request: Request):
    if request.headers.get("X-Webhook-Internal") != settings.WEBHOOK_INTERNAL_SECRET:
        raise HTTPException(403, "Internal seal failed")
    raw = await request.body()
    headers = {k: v for k, v in request.headers.items()
               if k.lower() in ("svix-id", "svix-timestamp", "svix-signature")}
    try:
        payload = SvixWebhook(settings.RESEND_WEBHOOK_SECRET).verify(raw, headers)
    except Exception:
        raise HTTPException(403, "Invalid Resend signature")
    await _process_resend_callback(payload)
    return {"ok": True}
```

### Pattern 4: Recall Candidate Query (live, indexed)

**What:** A live SQL query computed on-demand when staff opens recall queue — no materialized view, no scheduled refresh. Acceptable because (a) per-clinic patient counts at pilot are <2k, (b) query is read-only, (c) staff opens queue at most a few times per day.

**When to upgrade:** When a clinic crosses ~10k active patients OR query exceeds 500ms p95.

**Example:**
```sql
-- backend/services/messaging/recall.py — embedded query
-- Source: project pattern (Phase 8 analytics inline SQL)
WITH last_finalized AS (
  SELECT patient_id, MAX(finalized_at) AS last_finalized_at
  FROM encounters
  WHERE tenant_id = :tenant_id
    AND finalized_at IS NOT NULL
    AND deleted_at IS NULL
  GROUP BY patient_id
), future_appts AS (
  SELECT DISTINCT patient_id
  FROM appointments
  WHERE tenant_id = :tenant_id
    AND start_time > now()
    AND status NOT IN ('cancelled', 'no_show')
)
SELECT p.id, p.first_name, p.last_name,
       lf.last_finalized_at,
       (p.contact_info_jsonb ->> 'phone') AS phone,
       (p.contact_info_jsonb ->> 'email') AS email,
       (p.contact_info_jsonb -> 'consent' ->> 'sms_marketing_at') AS sms_marketing_consent_at,
       (p.contact_info_jsonb -> 'consent' ->> 'email_marketing_at') AS email_marketing_consent_at,
       (p.contact_info_jsonb ->> 'recall_exhausted')::bool AS recall_exhausted
FROM patients p
JOIN last_finalized lf USING (patient_id)
LEFT JOIN future_appts fa ON fa.patient_id = p.id
WHERE p.tenant_id = :tenant_id
  AND p.deleted_at IS NULL
  AND lf.last_finalized_at < (now() - INTERVAL '12 months')
  AND fa.patient_id IS NULL
  AND COALESCE((p.contact_info_jsonb ->> 'recall_exhausted')::bool, FALSE) = FALSE
  AND COALESCE((p.contact_info_jsonb ->> 'deceased')::bool, FALSE) = FALSE
  AND ((p.contact_info_jsonb ->> 'phone') IS NOT NULL
       OR (p.contact_info_jsonb ->> 'email') IS NOT NULL)
ORDER BY lf.last_finalized_at ASC;
```

**Required indexes (in 0016 migration):**
```sql
CREATE INDEX ix_encounters_tenant_finalized_patient
  ON encounters (tenant_id, finalized_at DESC, patient_id) WHERE finalized_at IS NOT NULL;
CREATE INDEX ix_appointments_tenant_future
  ON appointments (tenant_id, patient_id, start_time)
  WHERE start_time > now() AND status NOT IN ('cancelled', 'no_show');
-- Note: partial-index `now()` constants get evaluated at index-create time.
-- Better: omit the WHERE on start_time and let the planner filter.
```

### Anti-Patterns to Avoid

- **Hardcoding Twilio credentials in code or env-loaded singletons at import time** — credentials must be lazy-loaded (else tests can't mock and prod boot fails when env unset).
- **Calling Twilio/Resend SDK from inside a request handler without queueing** — for bulk sends, this blocks the request and triggers Twilio rate limits. Use a per-batch async task with `asyncio.Semaphore(1)` for 1msg/sec throttle.
- **Auto-replying to inbound SMS** (deferred). Even confirmation responses ("YES received — appointment confirmed") should be reviewed before v2.
- **Storing raw patient phone numbers in audit log details** — clinical-safety rule says never log PHI. Audit logs reference `patient_id` only; let the report join.
- **Putting MessageLog.status updates from webhooks in a `try/except` that swallows** — duplicate Twilio callbacks ARE expected and must be idempotent (UPSERT on `provider_message_id`).
- **Computing quiet hours from server-local time** — must convert to patient-local. See § Quiet Hours.
- **Mixing operational and marketing in the same template** — TCPA "dual-purpose" rule classifies the entire send as marketing, requiring written consent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMS opt-out keyword detection (STOP, UNSUBSCRIBE, END, QUIT, STOPALL, REVOKE, OPTOUT, CANCEL — multi-language) | Custom regex on inbound body | **Twilio Advanced Opt-Out** at Messaging Service level | Carrier-level enforcement is legally required; Twilio handles localization (Spanish keywords too) |
| Webhook signature verification (HMAC-SHA1 over URL + form params for Twilio; HMAC-SHA256 with timestamp tolerance for Svix) | Hand-rolled HMAC | `twilio.request_validator.RequestValidator`; `svix.webhooks.Webhook` | Edge cases (URL canonicalization, form param order, timing-attack-safe compare) are easy to get subtly wrong |
| Phone number validation + E.164 normalization + area-code extraction | Regex + manual country handling | `phonenumbers` (Google libphonenumber port) | Country detection is hard; pilot is US-only but Spanish-speaking patients may have MX numbers |
| Email HTML rendering with safe escaping + plain-text fallback + dark-mode CSS | Hand-built string templates | **React Email** + `@react-email/render` | Email client CSS is a maze; React Email components are tested across Outlook, Gmail, Apple Mail |
| Twilio number search by area code + provisioning + Messaging Service attachment | Direct REST calls | `twilio.rest.Client().available_phone_numbers + .messaging.v1.services` | SDK handles retries, error parsing, response paging |
| SMS character/segment counting (GSM-7 vs UCS-2 detection, concatenated-message segment math) | Naive `len(text)/160` | Twilio's segment counter (server-side per-send) OR a JS lib like `sms-counter-npm` | Emoji + accented chars trigger UCS-2 → 70 char segments, easy to mis-estimate cost |
| Idempotency key generation for Resend retries | Custom UUID | Pass `idempotency_key=str(message_log.id)` to Resend SDK | Resend SDK natively supports it (v2.29+) |

**Key insight:** Messaging is a domain where "almost right" looks correct in tests but causes carrier blocks, TCPA fines, or PHI leaks in production. Trust the SDKs.

## Common Pitfalls

### Pitfall 1: Twilio Signature Validation Fails Behind a Proxy

**What goes wrong:** Validator fails for valid Twilio requests when behind Vercel/Render reverse proxy.

**Why it happens:** Twilio signs the URL it called (`https://api.example.com/api/webhooks/twilio`). When the request hits FastAPI, `request.url` may show `http://internal:8000/api/webhooks/twilio`. The signature won't match because URL ≠ what was signed.

**How to avoid:** Forward `X-Forwarded-Host` and `X-Forwarded-Proto` from BFF, reconstruct the public URL in Python, validate against that. Pattern shown in § Pattern 3.

**Warning signs:** Signature validation fails 100% in staging but works locally with ngrok.

### Pitfall 2: Quiet Hours + Daylight Saving Time

**What goes wrong:** Reminder sent at 8:01am on the day of a DST transition arrives at 7:01am patient-local.

**Why it happens:** Naive `datetime + timedelta(hours=8)` doesn't account for the DST jump.

**How to avoid:** Use `zoneinfo.ZoneInfo(patient_tz)` and operate in localized datetimes. Compute "next 8am patient-local" by constructing a localized aware datetime, never by adding hours to UTC.

**Pilot mitigation:** US-only pilot — `Tenant.timezone` already exists and defaults `America/Los_Angeles`. Default patient timezone to clinic timezone unless `patient.contact_info_jsonb.timezone` is explicitly set. **No new column needed in v1.**

### Pitfall 3: Duplicate Webhook Deliveries

**What goes wrong:** A Twilio status callback arrives twice (or out of order: `delivered` before `sent`). Naive `UPDATE ... SET status='delivered'` would overwrite a later `failed`.

**How to avoid:**
1. Always UPSERT keyed on `provider_message_id`.
2. Status transitions are monotonic — store a `status_priority` (queued=0, sent=1, delivered=2, read=3, failed=99). Only update if incoming priority ≥ current.
3. Use webhook event timestamp (`MessageStatus` callback ts or Svix event ts) — ignore older events.

**Warning signs:** Audit log shows status going backwards (delivered → sent).

### Pitfall 4: PHI Leakage in SMS Reminders

**What goes wrong:** A clinic edits a template body to add "your glaucoma follow-up tomorrow" — diagnosis appears in operational SMS.

**Why it happens:** Templates are clinic-editable per CONTEXT, but PHI rules forbid diagnosis in operational SMS.

**How to avoid:** Server-side `scrub_phi_for_operational_sms()` function (see § Pattern 1) runs against rendered body BEFORE dispatch. Has a deny-list of clinical keywords (Rx terms, common dx like "glaucoma", "diabetic", "macular", ICD-10 patterns `\b[A-TV-Z]\d{2}(\.\d+)?\b`). On hit: raise `PHIInTemplate` exception, block send, surface in clinic settings as "this template would be blocked: edit to remove [terms]".

**Defense in depth:** Same scrub runs in template editor preview (client-side warn) AND server-side at send (hard block).

### Pitfall 5: Bulk Send Doesn't Respect Rate Limits

**What goes wrong:** "Send to 47 patients" fires 47 concurrent Twilio API calls, hits per-second rate limit, half fail.

**How to avoid:** `asyncio.Semaphore(1)` + `await asyncio.sleep(1)` between sends in the bulk handler. Also: each batch gets a `batch_id` (UUID) audit-logged once, and each per-recipient send is logged as a child with `metadata.batch_id`.

### Pitfall 6: Resend BAA — Get It in Writing Before Going Live

**What goes wrong:** Pilot launches; clinic sends an email containing patient first name + appointment time. Resend has no BAA. HIPAA breach.

**Why it happens:** Resend's public docs do not advertise a BAA path (verified: search results return zero hits for "Resend BAA"). The CONTEXT decision says "BAA path" but the path isn't documented.

**How to avoid:** **BLOCKER for plan-locks.** Researcher's recommendation: planner should add a Wave 0 task: "Confirm Resend BAA in writing (signed) — escalate to Resend sales — fall back to Postmark or AWS SES if not available within 7 days." If BAA not obtained before pilot launch: do **not** send the patient first name in email content; restrict v1 email to clinic-name + generic appointment-time only (still operationally useful, no individually-identifiable PHI). Track this as `decision-pending` in PROJECT.md.

### Pitfall 7: Async Loop Lifecycle in Tests

**What goes wrong:** Pytest fixtures import `backend.main`, the `@app.on_event("startup")` registers the messaging task in a test event loop, and the loop never gets cancelled — test suite hangs.

**How to avoid:** Gate startup with env var: `if os.getenv("MESSAGING_SCHEDULER_ENABLED", "true") != "true": return` (mirrors 10.3 self-pinger). Tests set `MESSAGING_SCHEDULER_ENABLED=false`. Pattern is already established.

### Pitfall 8: AI Classifier Blocking the Webhook Response

**What goes wrong:** Inbound SMS webhook → call Claude classifier (3-5s) → return 200 to Twilio. Twilio retries the webhook because of slow response.

**How to avoid:** Always return 200 to Twilio FAST (<2s). Persist the inbound message synchronously, then enqueue classification as a background task. Pattern: `asyncio.create_task(_classify_and_update(message_id))` after committing the inbound row. If task fails, leave `classification=null` — UI shows "uncategorized" and a manual classify button.

### Pitfall 9: `apiFetch` camelizeKeys Eating Snake-Case JSONB Keys

**What goes wrong:** Server returns `template_tokens: {"patient_first_name": "Jane"}`. `apiFetch` recursively camelizes → `templateTokens: {patientFirstName: "Jane"}`. Token rendering breaks because it expects `patient_first_name`.

**Why it happens:** Project memory `feedback_camelizekeys_nested.md` documents this exact gotcha.

**How to avoid:** For any JSONB column whose keys are user-defined (template tokens, audit metadata): snakify on load, preserve draft on save. Don't camelize-recurse into user-content.

### Pitfall 10: Webhook Endpoint Not in Middleware Allowlist

**What goes wrong:** First Twilio status callback hits `/api/webhooks/twilio`, Next.js middleware redirects to `/login` (because the route isn't in `isPublicRoute`), Twilio sees a 302, marks webhook failed.

**How to avoid:** Add `pathname.startsWith("/api/webhooks/")` to `lib/supabase/middleware.ts:60-72` allowlist. **This is a required edit.**

## Code Examples

### Sending an SMS via Twilio Python SDK

```python
# backend/services/messaging/twilio_client.py
# Source: https://www.twilio.com/docs/sms/quickstart/python (pinned 9.10.5)
from twilio.rest import Client
from backend.core.config import settings

_client: Client | None = None

def _get_client() -> Client:
    global _client
    if _client is None:
        _client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _client

async def send_sms(body: str, to: str, *, status_callback_url: str, messaging_service_sid: str) -> str:
    """Send via Messaging Service (enables Advanced Opt-Out + per-clinic number selection).

    Returns: provider_message_id (Twilio MessageSid).
    Raises: TwilioRestException on validation/rate-limit/blocked numbers.
    """
    msg = await asyncio.to_thread(
        _get_client().messages.create,
        body=body,
        to=to,
        messaging_service_sid=messaging_service_sid,
        status_callback=status_callback_url,
    )
    return msg.sid
```

### Sending an Email via Resend Python SDK

```python
# backend/services/messaging/resend_client.py
# Source: https://resend.com/docs/send-with-python (pinned 2.29.0)
import resend
from backend.core.config import settings

resend.api_key = settings.RESEND_API_KEY

async def send_email(*, subject: str, html: str, to: str, from_: str,
                     idempotency_key: str, reply_to: str | None = None) -> str:
    params: resend.Emails.SendParams = {
        "from": from_,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        params["reply_to"] = reply_to
    options = {"idempotency_key": idempotency_key}
    email = await asyncio.to_thread(resend.Emails.send, params, options)
    return email["id"]
```

### Rendering a React Email Template Server-Side (in Next.js BFF)

```typescript
// app/api/messaging/render-template/route.ts
// Source: https://react.email/docs/integrations/resend
import { render } from "@react-email/render";
import { ReminderEmail } from "@/components/messaging/emails/ReminderEmail";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(req: Request) {
  // Auth check via proxyToFastAPI's pre-flight
  // Body: { template_id, tokens, language }
  const { template_id, tokens, language } = await req.json();
  // Choose component by template_id + language
  const Component = pickEmailComponent(template_id, language);
  const html = render(Component(tokens), { pretty: false });
  return Response.json({ html });
}
```

**Architecture decision:** Render React Email in **Next.js BFF**, send the rendered HTML to FastAPI as a string. FastAPI passes the HTML to Resend. This avoids running Node.js in the Python backend and aligns with React Email's first-class integration.

**Trade-off:** A round-trip BFF→FastAPI→Resend, but the BFF is already in the stack and rendering happens once per send (not at every request). Acceptable.

### Inbound Classifier (Async, Non-Blocking)

```python
# backend/services/messaging/classifier.py
# Source: backend/services/ai_scribe.py pattern (Anthropic Haiku reuse)
import anthropic
from backend.core.config import settings

_anthropic = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

CLASSIFY_SYSTEM = """You classify a single inbound SMS from a patient to an eye clinic.
Output exactly one label from this set, no other text:
reschedule_request | cancellation | question_clinical | question_billing | thank_you | spam"""

async def classify(body: str) -> str:
    msg = await _anthropic.messages.create(
        model="claude-haiku-4-5-20251015",  # match ai_scribe.py model family
        max_tokens=20,
        system=CLASSIFY_SYSTEM,
        messages=[{"role": "user", "content": body}],
    )
    label = msg.content[0].text.strip().lower()
    return label if label in {"reschedule_request","cancellation","question_clinical","question_billing","thank_you","spam"} else "spam"
```

## Scheduler Decision Matrix

| Option | Complexity | Reliability | Multi-instance Safe | Project Fit | Verdict |
|--------|------------|-------------|---------------------|-------------|---------|
| **`asyncio.create_task` + `@app.on_event("startup")`** | Lowest | High (tested in 10.3) | No (mitigate w/ pg_advisory_lock) | Excellent — established pattern | **RECOMMEND for v1 pilot** |
| APScheduler `AsyncIOScheduler` | Low | Medium (loses jobs on restart unless persisted) | No (gunicorn workers each schedule) | Adds a dep | Not recommended |
| APScheduler `BackgroundScheduler` w/ SQLAlchemyJobStore | Medium | High | Yes (persisted store) | New dep + state-on-disk | Overkill for fixed cron |
| Vercel Cron pinging FastAPI | Medium | Medium (cold start latency) | Yes (Vercel coordinates) | FastAPI not on Vercel — needs public auth-bearer endpoint | Not aligned with Render-hosted backend |
| External scheduler (Render/Railway cron) | Low | High | Yes | New infra surface area | Solid for v2; overkill for pilot |
| Celery + Redis | High | Highest | Yes | Two new deps + Redis infra | Defer to V2 scaling |

**Decision:** asyncio loop + advisory lock. Time-to-implement: ~1 day. Mirror Phase 10.3-04.

## Quiet Hours & Timezone Strategy

**Recommendation:** Default to clinic timezone (`Tenant.timezone`, already exists, defaults `America/Los_Angeles`). Allow per-patient override in `Patient.contact_info_jsonb.timezone` (string, IANA name). At send time:

```python
def is_in_quiet_hours(patient: Patient, tenant: Tenant, now_utc: datetime) -> bool:
    tz_name = patient.contact_info_jsonb.get("timezone") or tenant.timezone
    local = now_utc.astimezone(zoneinfo.ZoneInfo(tz_name))
    return local.hour >= 21 or local.hour < 8
```

**Decisions for planner:**
- v1: do NOT add `patients.timezone` column. Use JSONB key. Avoids migration churn.
- Pilot is solo OD in single timezone — patient TZ override is a no-op for v1 in practice.
- Quiet hours fixed 9pm–8am (per CONTEXT). No per-clinic override v1 (deferred).

## Bulk Send Safeguards

**Implementation pattern:**
```python
# Per CONTEXT: max 50, 1 msg/sec, batch_id audit
async def bulk_send(db, ctx, recipients: list[BulkRecipient], template_id: UUID, tokens_per_recipient: dict[UUID, dict]) -> UUID:
    if len(recipients) > 50:
        raise HTTPException(400, "Bulk send limit is 50 recipients")
    batch_id = uuid4()
    await log_action(db, ctx, AuditAction.BULK_MESSAGE_BATCH_CREATED,
                     resource_type="message_batch", resource_id=batch_id,
                     metadata={"recipient_count": len(recipients), "template_id": str(template_id)})
    await db.commit()  # Lock the batch creation before any send

    sem = asyncio.Semaphore(1)
    async def send_one(r: BulkRecipient):
        async with sem:
            try:
                await dispatch(db, ctx, DispatchRequest(..., batch_id=batch_id, tokens=tokens_per_recipient[r.patient_id]))
            finally:
                await asyncio.sleep(1)  # 1 msg/sec floor

    # Fire & wait — caller's request stays open. Pilot scale (≤50) is fine.
    await asyncio.gather(*[send_one(r) for r in recipients], return_exceptions=True)
    return batch_id
```

**Why fire & wait (not background task):** Pilot bulk = 50 × 1s = 50s wall-clock. UX shows progress bar. After v1, move to background task with SSE progress channel.

## Audit Logging

**Recommendation:** Reuse existing `AuditLog` table. Extend `AuditAction` enum (requires Alembic migration via `ALTER TYPE audit_action_enum ADD VALUE`):
- `MESSAGE_SENT`, `MESSAGE_DELIVERED`, `MESSAGE_FAILED`, `MESSAGE_READ`
- `OPT_OUT_RECORDED`, `OPT_IN_RECORDED`
- `CONSENT_GRANTED`, `CONSENT_REVOKED`
- `CHANNEL_PREFERENCE_UPDATED`
- `TEMPLATE_CREATED`, `TEMPLATE_UPDATED`
- `BULK_MESSAGE_BATCH_CREATED`
- `RECALL_QUEUE_RUN_STARTED`, `RECALL_QUEUE_RUN_COMPLETED`
- `MESSAGING_ENABLED`, `MESSAGING_DISABLED`

**Why reuse, not create `messaging_audit_log`:** Existing `AuditLog` schema (`tenant_id`, `user_id`, `staff_id`, `action`, `resource_type`, `resource_id`, `encounter_id`, `patient_id`, `detail`, `changes`, `metadata_`, `created_at`) covers every messaging audit need. The Phase 9 billing audit pattern reused it; the Phase 10.3 system events reused it. Creating a parallel table would fragment compliance queries.

**Per CONTEXT clinical-safety rule:** All `log_action()` calls happen IN the same DB transaction as the message-state mutation. Already enforced by `core/audit.py`'s session-bound write.

## Entitlements Gap

`messaging` is NOT in `lib/entitlements.ts` (verified — see file contents above; only 11 keys, no messaging). **Required edit:** add `MESSAGING: "messaging"` to `Entitlement` const, add `Entitlement.MESSAGING` to `Plus` and `Premium` plans in `PLAN_FEATURES`, add an `ENTITLEMENT_META.messaging` entry. Mirror in Python `app/core/entitlements.py`.

**Gating:** `useEntitlements().has(Entitlement.MESSAGING)` on every messaging UI surface. Backend route guards via `require_entitlement("messaging")`.

## Multi-Tenancy Note

CLAUDE.md says "schema-per-tenant" but reality is `tenant_id` column scoping in `public` schema (verified — `clinic_sunview` schema is unused per project rules). **All new messaging tables** (`message_log`, `message_template`, `recall_queue_run`, `inbound_message`) follow the existing `TenantBase` pattern — tenant-scoped via `tenant_id` column with `ix_*_tenant_id` index. Not actual schema-per-tenant.

## Number Provisioning

```python
# backend/services/messaging/twilio_client.py (cont.)
async def provision_local_number(area_code: str, friendly_name: str, messaging_service_sid: str) -> dict:
    client = _get_client()
    available = await asyncio.to_thread(
        client.available_phone_numbers("US").local.list,
        area_code=area_code,
        sms_enabled=True,
        limit=1,
    )
    if not available:
        # Fall back to nearby area codes — out of scope for v1, just raise
        raise NoNumberAvailable(area_code)
    purchased = await asyncio.to_thread(
        client.incoming_phone_numbers.create,
        phone_number=available[0].phone_number,
        friendly_name=friendly_name,
        sms_application_sid=None,  # Use Messaging Service for routing
    )
    # Attach to clinic's Messaging Service
    await asyncio.to_thread(
        client.messaging.v1.services(messaging_service_sid).phone_numbers.create,
        phone_number_sid=purchased.sid,
    )
    return {"phone_number": purchased.phone_number, "sid": purchased.sid}
```

**Cost:** ~$1.15/mo per local number + $0.0083/SMS outbound. ClarityOS-paid for pilot per CONTEXT.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Twilio Account-level "Auto-Out" with hand-rolled STOP detection | **Messaging Service Advanced Opt-Out** | ~2020 | Carrier-required. STOP/HELP keywords centrally managed. |
| Hand-rolled HMAC verification on Twilio webhooks | `twilio.request_validator.RequestValidator` | Always available; reinforced 2024 docs | Reduces signature bugs to ~zero |
| HTML email by string concatenation | **React Email components** | 2023 (Resend) | Email-client compatibility tested out-of-box |
| HIPAA email via SMTP+S/MIME or HushMail | Modern providers (Resend pending BAA, Postmark with BAA) | 2022+ | Easier integration; BAA still gating |
| Celery + Redis for any async work | `asyncio.create_task` for in-process tasks | 2020+ (FastAPI mainstream) | Lower infra cost for low-throughput pilots |
| FCC pre-2025: organization-managed opt-out lists only | **April 2025 FCC update**: patients can revoke via any reasonable method, must process within 10 business days | 2025-04 | Inbound STOP/UNSUBSCRIBE/etc. via SMS + manual support tickets all count — must wire all into a single revocation API |

**Deprecated/outdated:**
- `twilio.twiml.MessagingResponse` for inbound webhooks (still works but Messaging Service auto-routing replaces TwiML responses for opt-out)
- Manual SMTP for HIPAA email — Postmark/Resend are now the standard

## Open Questions

1. **Resend BAA availability**
   - What we know: User locked Resend in CONTEXT. Resend public docs do not advertise BAA path.
   - What's unclear: Is BAA obtainable via Enterprise/sales contact?
   - Recommendation: Wave 0 task — get written BAA confirmation before any production send. Fallback path: Postmark (mature healthcare track record) — single-file change in `resend_client.py`.

2. **Patient timezone storage**
   - What we know: Tenant has timezone, Patient.contact_info_jsonb is flexible.
   - What's unclear: Will pilot ever need patient TZ override?
   - Recommendation: Use JSONB key. No new column. Solo-OD pilot is single TZ.

3. **Inbound message threading**
   - What we know: CONTEXT says "send-and-log, not real-time chat".
   - What's unclear: Should inbound messages link to a `message_thread_id` (parent message that triggered the reply) or stay flat?
   - Recommendation: Flat for v1. Twilio doesn't reliably correlate replies to specific outbound messages anyway. Group by patient + 24h window in UI.

4. **Email image hosting / unsubscribe link**
   - What we know: CONTEXT mentions reschedule/confirm signed-token URLs.
   - What's unclear: Where do email images (clinic logo) live? (Supabase Storage candidate.)
   - Recommendation: Inline SVG for v1 logo to avoid hosting concerns. Defer image upload to Phase 14.

5. **Guardian relationship ENUM vs free text**
   - Recommendation: free text. Mom/Dad/Guardian variations don't merit an enum migration.

6. **Cost-cap denomination unit**
   - CONTEXT: `daily_sms_cap_cents`. Email is cheaper than SMS.
   - Recommendation: track unified `messaging_spend_cents` daily total — Twilio + Resend → single cap. Implementation: pre-send reservation table `daily_spend_reservations`.

7. **Should `Patient` get a real `timezone` column eventually?** Likely yes for V3 — but JSONB now keeps migration costless.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.x (Python) + vitest 4.x (TS unit) + Playwright 1.58 (E2E) |
| Config file | `backend/pytest.ini` (verify in Wave 0); `vitest.config.*`; `playwright.config.ts` |
| Quick run command | `npx vitest run lib/messaging/` (TS), `cd backend && pytest tests/test_messaging_*.py -x` (Python) |
| Full suite command | `npm test && cd backend && pytest && bash scripts/dev.sh pre-test && npx playwright test --grep @messaging` |
| Phase gate | Full suite green before `/gsd:verify-work` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRM-01 | Reminders dispatched at 7d/72h/24h | unit | `pytest backend/tests/test_messaging_scheduler.py::test_reminder_cadence_3touch -x` | Wave 0 |
| CRM-01 | Reminder skips if patient confirmed | unit | `pytest backend/tests/test_messaging_scheduler.py::test_skip_if_confirmed -x` | Wave 0 |
| CRM-02 | Composer sends from patient header | E2E | `npx playwright test tests/e2e/messaging-composer.spec.ts -g "patient header send"` | Wave 0 |
| CRM-02 | Bulk send respects 50 cap | unit | `pytest backend/tests/test_messaging_bulk.py::test_50_recipient_cap -x` | Wave 0 |
| CRM-02 | Bulk send 1msg/sec throttle | unit | `pytest backend/tests/test_messaging_bulk.py::test_throttle -x` | Wave 0 |
| CRM-03 | Recall query returns >12mo patients only | integration | `pytest backend/tests/test_messaging_recall.py::test_candidate_query -x` | Wave 0 |
| CRM-03 | Recall excludes future-appt patients | integration | `pytest backend/tests/test_messaging_recall.py::test_excludes_future_appt -x` | Wave 0 |
| CRM-04 | STOP keyword updates `consent_sms_marketing` flag | integration | `pytest backend/tests/test_webhook_twilio.py::test_stop_marks_optout -x` | Wave 0 |
| CRM-04 | Opt-out preflight blocks send | unit | `pytest backend/tests/test_messaging_optout.py::test_blocks_send -x` (CONTRACT TEST — high-risk) | Wave 0 |
| CRM-04 | Second STOP escalates to operational opt-out | integration | `pytest backend/tests/test_webhook_twilio.py::test_double_stop -x` | Wave 0 |
| CRM-05 | Status webhook updates message_log | integration | `pytest backend/tests/test_webhook_twilio.py::test_status_callback -x` | Wave 0 |
| CRM-05 | Patient detail Messages tab renders history | E2E | `npx playwright test tests/e2e/patient-messages-tab.spec.ts` | Wave 0 |
| CRM-06 | Consent flags persist with timestamps | unit | `pytest backend/tests/test_consent.py::test_consent_capture -x` | Wave 0 |
| CRM-07 | Twilio signature verification rejects bad sig | unit | `pytest backend/tests/test_webhook_twilio.py::test_invalid_signature_403 -x` (CONTRACT TEST) | Wave 0 |
| CRM-07 | Resend Svix signature rejects bad sig | unit | `pytest backend/tests/test_webhook_resend.py::test_invalid_svix_403 -x` (CONTRACT TEST) | Wave 0 |
| CRM-07 | Webhook idempotent on duplicate `provider_message_id` | integration | `pytest backend/tests/test_webhook_twilio.py::test_idempotent_status_upsert -x` | Wave 0 |
| CRM-08 | Send deferred to next 8am if in 9pm-8am window | unit | `pytest backend/tests/test_messaging_quiet_hours.py::test_defer_to_window -x` | Wave 0 |
| CRM-08 | DST-aware quiet hours | unit | `pytest backend/tests/test_messaging_quiet_hours.py::test_dst_transition -x` | Wave 0 |
| CRM-09 | 80% threshold logs warning + emails owner | integration | `pytest backend/tests/test_cost_cap.py::test_80pct_warn -x` | Wave 0 |
| CRM-09 | 100% hard-stops without admin override | integration | `pytest backend/tests/test_cost_cap.py::test_100pct_hardstop -x` | Wave 0 |
| CRM-10 | Bulk send creates one batch_id audit | integration | `pytest backend/tests/test_messaging_bulk.py::test_audit_batch_id -x` | Wave 0 |
| CRM-11 | Inbound classifier returns one of 6 labels | unit (mocked Anthropic) | `pytest backend/tests/test_classifier.py::test_classification_labels -x` | Wave 0 |
| CRM-11 | Webhook returns 200 fast (<2s) even when Claude slow | unit (mocked) | `pytest backend/tests/test_webhook_twilio.py::test_inbound_fast_response -x` | Wave 0 |
| CRM-12 | AI draft respects opt-out preflight | unit | `pytest backend/tests/test_ai_draft.py::test_respects_optout -x` (CONTRACT TEST) | Wave 0 |
| CRM-13 | Onboarding wizard test-send + ack flips flag | E2E | `npx playwright test tests/e2e/messaging-onboarding.spec.ts` | Wave 0 |
| CRM-14 | Number provisioning attaches to Messaging Service | unit (mocked Twilio) | `pytest backend/tests/test_provisioning.py::test_local_number_buy -x` | Wave 0 |
| CRM-15 | Analytics page loads + filters | E2E | `npx playwright test tests/e2e/messaging-analytics.spec.ts` | Wave 0 |
| CRM-15 | Reminder funnel SQL returns expected stages | integration | `pytest backend/tests/test_analytics_messaging.py::test_funnel -x` | Wave 0 |
| CRM-16 | Compliance Report PDF generation | integration | `pytest backend/tests/test_compliance_export.py::test_pdf_generation -x` | Wave 0 |
| CRM-17 | `messaging` entitlement gates routes | unit | `pytest backend/tests/test_entitlements.py::test_messaging_gate -x` + `vitest run lib/entitlements.test.ts` | Wave 0 |
| CRM-18 | Minor (<18) routes to guardian | unit | `pytest backend/tests/test_messaging_minor.py::test_guardian_routing -x` | Wave 0 |
| CRM-18 | 18th birthday surfaces switch prompt | E2E | `npx playwright test tests/e2e/patient-18th-birthday.spec.ts` | Wave 0 |
| CRM-19 | Household bundling: same-day + shared phone → one SMS | integration | `pytest backend/tests/test_messaging_household.py::test_bundle_same_day -x` | Wave 0 |
| CRM-20 | 3 bounces flips preferred channel | integration | `pytest backend/tests/test_bounce_fallback.py::test_3_fail_flip -x` | Wave 0 |
| **Manual** | Live-Twilio test message round-trip | manual | Playwright cannot test against live Twilio without sandbox account; OWNER runs onboarding wizard step 6 in pilot env | n/a |
| **Manual** | Resend BAA confirmed in writing | manual | Wave 0 BLOCKER — see Pitfall 6 | n/a |
| **Manual** | PHI scrubber applied to template editor (live) | manual | Visual QA — type "glaucoma" into template, see warning | n/a |

### High-Risk Contract Tests (mandatory)

These four MUST be contract-tested against fixture payloads, not just mocked unit tests:

1. **Twilio webhook signature verification** — fixture: real Twilio signature captured from test webhook, plus deliberately-corrupted version. Asserts both pass and reject.
2. **Resend Svix signature verification** — same pattern with svix headers fixture.
3. **Opt-out preflight enforcement** — table-driven test: every channel × every purpose × every consent-flag combo. Single test that proves the choke-point can't be bypassed.
4. **PHI scrub in operational SMS templates** — table-driven: every banned token (glaucoma, diabetic, ICD-10 patterns, common Rx names) must trigger a block.

### Sampling Rate
- **Per task commit:** `npx vitest run lib/messaging/` (5-10s) + `pytest backend/tests/test_messaging_*.py -x` (~30s)
- **Per wave merge:** Full unit + integration (`pytest backend/tests/`) + targeted E2E (`@messaging` tag)
- **Phase gate:** Full suite green INCLUDING manual checkpoints (Resend BAA + live Twilio test + PHI scrubber visual QA)

### Wave 0 Gaps

- [ ] `backend/tests/conftest.py` — verify exists; if not, create with `db` fixture (the codebase has `backend/tests/test_self_pinger.py` so pytest infra exists — but `conftest.py` may be ad-hoc)
- [ ] `backend/tests/fixtures/twilio_signatures.py` — real signature fixtures (capture during dev integration)
- [ ] `backend/tests/fixtures/svix_signatures.py` — Resend Svix fixtures
- [ ] `backend/tests/fixtures/phi_scrub_corpus.py` — banned-term corpus
- [ ] `backend/tests/test_messaging_*.py` — all 30+ tests above
- [ ] `tests/e2e/messaging-*.spec.ts` — 4-5 E2E specs under existing playwright config
- [ ] Mock factories: `backend/tests/factories/messaging.py` — make MessageLog, MessageTemplate fixtures
- [ ] `MockTwilioClient` and `MockResendClient` — bind via dependency override
- [ ] Fake clock fixture — needed for quiet-hours and DST tests (use `freezegun` or hand-rolled `monkeypatch.setattr(datetime, ...)`)
- [ ] **Wave 0 BLOCKER**: `freezegun` dep — add to requirements.txt if not present (`pip index versions freezegun` → 1.5.x)

## Conflicts with CONTEXT and Items Needing User Confirmation

1. **Resend BAA path** — CONTEXT asserts Resend has a BAA path; public docs do not advertise it. **Action:** Wave 0 verifies in writing; fallback Postmark.
2. **AI Scribe streaming vs synchronous classifier** — CONTEXT implies reusing `ai_scribe.py`. The existing service streams via SSE (designed for transcript→SOAP). The classifier is a single-call non-streaming use. **Resolution:** Reuse the Anthropic client (`anthropic.AsyncAnthropic`) initialized in `ai_scribe.py`, but write a separate `classifier.py` calling `messages.create()` (non-streaming). No conflict — just don't confuse "reuse AI Scribe pipeline" with "reuse SSE generator."
3. **`clinic_settings` table referenced in CONTEXT** — **does not exist.** Tenant settings live in `Tenant.settings_jsonb` and `Tenant.timezone` direct column. **Resolution:** Store messaging config (`daily_sms_cap_cents`, `messaging_enabled`, `quiet_hours_start/end_local`, etc.) in `Tenant.settings_jsonb` under a `messaging` key. Avoid creating a parallel table.
4. **`messaging_audit_log` table** — recommend reusing existing `AuditLog` (see § Audit Logging). Planner should confirm with user before authoring schema migration.
5. **`patients.timezone` column** — CONTEXT lists "patient timezone" implicitly. Recommend JSONB key on `contact_info_jsonb.timezone`. Planner should confirm.
6. **Bulk send blocking the request** — pilot is fine with 50 × 1s = 50s wall-clock. Future scaling will need background processing + SSE progress.

## Sources

### Primary (HIGH confidence)
- [Twilio Build a Secure Webhook with Python and FastAPI](https://www.twilio.com/en-us/blog/build-secure-twilio-webhook-python-fastapi) — RequestValidator pattern, FastAPI specifics
- [Twilio Webhooks Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security) — X-Twilio-Signature canonicalization
- [Twilio Advanced Opt-Out Tutorial](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out) — STOP/START/HELP, multi-language keywords
- [Twilio HIPAA / BAA](https://www.twilio.com/en-us/hipaa) — eligible products list (Programmable SMS is eligible; Compliance Toolkit is NOT)
- [Twilio Python SDK on PyPI](https://pypi.org/project/twilio/) — version 9.10.5 verified 2026-04-14
- [Twilio Python GitHub Releases](https://github.com/twilio/twilio-python/releases) — changelog
- [Resend Verify Webhooks](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests) — Svix headers + verify methods
- [Resend Send With Python](https://resend.com/docs/send-with-python) — SDK quickstart
- [Resend Python SDK on PyPI](https://pypi.org/project/resend/) — 2.29.0
- [React Email](https://react.email/) — components + render
- [Twilio Send Appointment Reminders Python/Django](https://www.twilio.com/docs/messaging/tutorials/appointment-reminders/python-django) — domain pattern
- Project file: `backend/main.py:170-211` — established self-pinger pattern (Phase 10.3-04)
- Project file: `backend/services/ai_scribe.py` — Anthropic client reuse target
- Project file: `backend/core/audit.py` — `log_action()` choke point
- Project file: `lib/supabase/middleware.ts:60-72` — public route allowlist (must be edited)
- Project file: `lib/entitlements.ts:25-79` — entitlement registration site
- Project file: `backend/db/models/tenant/clinical.py:933-991` — generic AuditLog model
- Project file: `backend/db/models/public/saas.py:71-93` — Tenant model with timezone

### Secondary (MEDIUM confidence)
- [TCPA Healthcare Exemption Rules — Tratta](https://www.tratta.io/blog/tcpa-healthcare-exemption-rules) — operational vs marketing distinction
- [TCPA 2026 Compliance — Fransis](https://www.fransis.ai/blog/tcpa-compliance-for-text-messaging-what-nonprofits-and-healthcare-organizations-must-know-in-2026) — April 2025 FCC revocation rules
- [TCPA and Healthcare — Manatt](https://www.manatt.com/insights/newsletters/health-highlights/the-tcpa-and-healthcare-consent-exemptions-and-ri) — exemption nuance for dual-purpose calls
- [APScheduler vs asyncio for FastAPI — Better Stack](https://betterstack.com/community/guides/scaling-python/apscheduler-scheduled-tasks/) — multi-instance gotcha
- [FastAPI Background Tasks tutorial](https://fastapi.tiangolo.com/tutorial/background-tasks/) — for sub-request task semantics
- [Vercel Cron Job authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — bearer-token pattern (alternative scheduler)
- [Securing Vercel Cron in Next.js 14](https://codingcat.dev/post/how-to-secure-vercel-cron-job-routes-in-next-js-14-app-router) — CRON_SECRET pattern

### Tertiary (LOW confidence — flagged)
- Resend BAA availability: **NOT FOUND** in public docs as of 2026-04-29 search. **Action: confirm in writing with Resend before pilot launch.** Fallback: Postmark (advertises BAA).
- React Email server-side render performance at scale — no benchmarks for 1000s of templates; pilot scale (<500/day) is fine.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified versions, official SDKs, project-aligned
- Architecture: HIGH — mirrors existing 10.3 self-pinger pattern; choke-point sender is industry standard
- Pitfalls: HIGH — based on official docs + project memory notes (camelize, fire-and-forget, dev.sh pre-test)
- Webhook security: HIGH — verified against Twilio and Resend official docs
- BAA path: MEDIUM (Twilio: HIGH; Resend: LOW pending confirmation)
- Quiet-hours timezone: HIGH for pilot (single-TZ); MEDIUM for general v1 spec
- Test infrastructure: HIGH — pytest already present (`backend/tests/test_self_pinger.py`), Playwright established

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days — stable domain). Re-verify Twilio/Resend SDK versions and Resend BAA at start of execution if more than 30 days elapse.
