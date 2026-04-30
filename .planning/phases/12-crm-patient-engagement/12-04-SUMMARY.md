---
phase: 12
plan: 04
slug: webhooks
status: complete
completed: 2026-04-30
tasks_completed: 2/2
tests_added: 29
tests_passing: 165  # full backend/tests/messaging suite
---

# Plan 12-04 — Webhooks (Twilio + Postmark) — SUMMARY

## What was built

Public webhook surface that reconciles outbound message status (delivery
receipts) and captures inbound SMS replies. Two independent endpoints
share an internal HMAC seal, the same `_STATUS_PRIORITY` monotonic gate,
and the same CRM-20 `record_bounce` wiring.

### Task 1a (pre-task) — bounce_tracker + classifier stub
Resolved a cross-plan contract gap before writing the router itself.
Plan 12-04 imported `record_bounce` from `bounce_tracker.py` while Plan
12-05 had it co-located in `bulk_send.py`. Webhooks are the PRIMARY
CRM-20 caller (per `must_haves.truths` line 30 of the PLAN), so the
canonical home is here.

- `backend/services/messaging/bounce_tracker.py` —
  `record_bounce(db, ctx, *, patient_id, channel)`. Increments
  `contact_info_jsonb.consecutive_bounces[channel]`, flips
  `preferred_channel` to the alternate after 3 failures, resets the
  counter post-flip, sets `needs_contact_update=True` for staff.
  Emits `CHANNEL_PREFERENCE_UPDATED` audit on every call.
- `backend/services/messaging/classifier.py` — no-op stub for the
  lazy `from .classifier import classify_inbound_async` inside the
  inbound SMS handler. Plan 12-06 fully implements.

### Task 1 — FastAPI webhook router
- `backend/api/routes/webhooks.py` (`/api/webhooks/{twilio,postmark}`)
- `backend/main.py` — `app.include_router(webhooks.router)` at the end
  of the registration block.

Twilio path:
- `_check_internal_seal` → `validate_signature` over the URL
  reconstructed from `X-Forwarded-Host` (RESEARCH Pitfall 1).
- Status callback: `MessageStatus` → mapped status with monotonic
  priority gate. New transitions into `failed` call `record_bounce`
  (skipped if `patient_id is null`).
- Inbound: STOP keywords sync `sms_opted_out_at`, revoke
  `consent_sms_marketing_at`, and write `OPT_OUT_RECORDED` audit.
  Non-STOP inserts an `InboundMessage` row, writes
  `INBOUND_MESSAGE_RECEIVED` audit, then fire-and-forgets the
  classifier via `asyncio.create_task` (RESEARCH Pitfall 8).

Postmark path:
- `_check_internal_seal` → `verify_postmark_basic_auth` (HTTP Basic
  Auth — Postmark does NOT support HMAC/Svix; this is the deviation
  from the plan's Resend assumption, justified by the Wave 0 BAA
  decision).
- `RecordType` → status map: `Delivery → delivered`, `Open → read`,
  `Bounce / SpamComplaint → failed`. Failure transitions call
  `record_bounce`. `SubscriptionChange`, `ManualSuppression`, and
  unknown record types return `200 {ignored: ...}`.

### Task 2 — BFF + middleware
- `app/api/webhooks/twilio/route.ts` — Node runtime, force-dynamic.
  Forwards raw form body + `X-Twilio-Signature` + `X-Forwarded-Host`
  so FastAPI can re-validate against the public URL.
- `app/api/webhooks/postmark/route.ts` — Node runtime, force-dynamic.
  Forwards JSON body + `Authorization: Basic <…>` header.
- `lib/supabase/middleware.ts` — `pathname.startsWith("/api/webhooks/")`
  added between `/api/public/` and `/api/address/` in the public-route
  allowlist. Without this, middleware would 401 the unauthenticated
  POSTs before the BFF handler runs (Pitfall 10).

## Status mappings (final)

| Twilio MessageStatus | Internal | Notes |
|----------------------|----------|-------|
| sending, queued      | queued   | priority 0 |
| sent                 | sent     | priority 1 |
| delivered            | delivered| priority 2 |
| read                 | read     | priority 3 |
| undelivered, failed  | failed   | priority 99; new transition → record_bounce |

| Postmark RecordType  | Internal | Notes |
|----------------------|----------|-------|
| Delivery             | delivered| |
| Open                 | read     | |
| Bounce               | failed   | failure_reason = `Type` (e.g. HardBounce) |
| SpamComplaint        | failed   | failure_reason = `RecordType` |
| SubscriptionChange / ManualSuppression / unknown | — | 200 {ignored} |

## Test count + breakdown

| File | Tests | Notes |
|------|-------|-------|
| test_bounce_tracker.py    | 6  | Counter increments, third-bounce flip both directions, unknown channel ignore, missing patient logged, independent counters |
| test_twilio_webhook.py    | 12 | Seal/sig 403, delivered/idempotent/out-of-order/failed-override, unknown SID, inbound STOP (canonical CRM-04), non-STOP <2 s with slow classifier, no-patient skips bounce, no-MessageSid ignored |
| test_postmark_webhook.py  | 11 | Seal/Basic Auth 403, Delivery, Open, Bounce + SpamComplaint each call record_bounce, stale priority ignored, unknown MessageID 200, unknown RecordType ignored, audit log written |
| **Plan 12-04 total**      | 29 | |
| Full messaging suite (12-00 → 12-04) | **165** | all green |

## Deviations from plan

1. **Postmark instead of Resend (signature flow rewritten).** Plan
   imported `verify_svix_signature` and forwarded `svix-id /
   svix-timestamp / svix-signature` headers. Postmark uses HTTP Basic
   Auth (`verify_postmark_basic_auth`). The router endpoint is
   `/postmark` (not `/resend`); BFF forwards the `Authorization`
   header. Rationale: Wave 0 BAA decision rejected Resend
   (`.planning/compliance/RESEND-BAA-CHECKPOINT.md`, 2026-04-29);
   `email_client.py` is the live module, not `resend_client.py`.
2. **`bounce_tracker.py` created in this plan.** Plan 12-04 imported
   `record_bounce` from `backend/services/messaging/bounce_tracker.py`
   while Plan 12-05 had it co-located in `bulk_send.py`. Owning the
   module here (webhooks are the primary CRM-20 caller per the plan's
   own docstring) lets 12-05 import from a stable home rather than
   repeating it.
3. **`classifier.py` stub created early.** The inbound SMS handler
   spawns `classify_inbound_async` via `asyncio.create_task`. Plan
   12-06 owns the real classifier; this stub is a no-op so module
   import resolves and tests can monkeypatch.
4. **`log_action` reused (no `log_action_minimal` added).** Plan
   suggested adding a thin variant that takes `tenant_id` directly
   for sessionless callers. Existing `log_action` already accepts a
   bare `TenantContext`; webhooks construct a system context with
   `_system_ctx(tenant_id)` (`role="system"`, the all-zeros user_id).
   Avoided a new public API surface in `core/audit.py`.
5. **`TenantContext.staff_id` not passed.** The current
   `TenantContext` dataclass has only `user_id / tenant_id / role`.
   Plan-suggested `staff_id=None` was removed.
6. **Twilio inbound `In-Reply-To` and Postmark fixture-based tests
   skipped.** Tests use direct-handler + fake AsyncSession (the same
   pattern documented in `feedback_contract_tests.md` and used by
   Plan 10.3-04). No `signed_twilio_webhook_factory` reuse; tests
   re-derive signed forms inline so the test surface matches what
   webhooks actually receive after the BFF strips the request body
   into form fields.
7. **`record_bounce` mocked at the call-site module path
   (`webhooks_module.record_bounce`)**, not at the source module.
   Reason: the import binds the symbol at module load, so
   monkeypatching `bounce_tracker.record_bounce` would not affect the
   webhook handler's reference. The end-to-end "three webhook
   failures flip preferred_channel" assertion is covered indirectly
   by `test_third_bounce_flips_channel_and_resets_counter` against
   the real `record_bounce` impl.

## Manual smoke (deferred to 12-10)

The plan defers the real `curl` against staging to Plan 12-10's UAT.
Acceptance for this plan is purely automated (signature flow, status
gate, record_bounce wiring) — all 165 messaging tests green.

## Files modified

- backend/services/messaging/bounce_tracker.py (new)
- backend/services/messaging/classifier.py (new, stub)
- backend/api/routes/webhooks.py (new)
- backend/main.py (router registered)
- backend/tests/messaging/test_bounce_tracker.py (new)
- backend/tests/messaging/test_twilio_webhook.py (new)
- backend/tests/messaging/test_postmark_webhook.py (new)
- app/api/webhooks/twilio/route.ts (new)
- app/api/webhooks/postmark/route.ts (new)
- lib/supabase/middleware.ts (allowlist edit)
