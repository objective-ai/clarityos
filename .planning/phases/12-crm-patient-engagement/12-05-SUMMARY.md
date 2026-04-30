---
phase: 12
plan: 05
slug: routes-bff
status: complete
completed: 2026-04-30
tasks_completed: 3/3
tests_added: 35
tests_passing: 200  # full backend/tests/messaging suite
---

# Plan 12-05 — Routes + BFF — SUMMARY

## What was built

The full messaging HTTP surface — every endpoint the frontend will call
across Plans 12-07, 12-08, 12-09. All endpoints sit behind the
`messaging` entitlement (Plus + Premium plans) and route through the
single `sender.dispatch` choke point. CRM-20 bounce fallback fires both
on the synchronous send path (this plan) and the webhook path (12-04)
so the consecutive-bounce counter is accurate end-to-end.

### Task 1 — send + bulk-send + entitlement gate
- `backend/services/messaging/bulk_send.py` — 50-recipient cap + 1 msg/sec
  throttle. `BULK_MESSAGE_BATCH_CREATED` audit is committed BEFORE the
  first send so a process kill mid-batch leaves a recoverable record.
  `OptOutBlocked` increments `excluded_count` (not `failed_count`).
- `backend/api/routes/messaging.py` — POST `/send` and `/bulk-send`,
  router-level `Depends(require_entitlement("messaging"))`.
- Single-send invokes `bounce_tracker.record_bounce` on
  `log.status == "failed"` so CRM-20 fires when no webhook arrives.
- BFF: `app/api/messaging/send/route.ts`, `bulk-send/route.ts`.
- 14 tests: happy path, entitlement 403, opt-out 409, cost-cap 429,
  bounce hook, validation 422, throttle, audit-before-send, exclusion
  semantics, provider-failure path.

### Task 2 — recall queue + history + inbox + analytics + AI draft
- `backend/services/messaging/recall.py` — live SQL candidate query
  (12mo + no future appt + not exhausted + not deceased, ORDER BY
  oldest finalized first, LIMIT 500). `run_recall_batch` constructs
  a `RecallQueueRun` row, dispatches via `bulk_send`, increments per-
  patient `recall_touch_count`, and flips `recall_exhausted=true` on
  the 2nd touch so the patient drops out of subsequent queries.
- `backend/services/messaging/ai_draft.py` — AsyncAnthropic call to
  `claude-haiku-4-5-20251001` with a HIPAA-safe system prompt. Always
  calls `preflight_or_raise` BEFORE invoking Claude (CRM-12 contract);
  operational SMS bodies are re-scrubbed via
  `scrub_phi_for_operational_sms` defense-in-depth.
- New endpoints: `GET /recall-queue`, `POST /recall-queue/send-all`,
  `GET /history/{patient_id}`, `GET /inbox`, `GET /analytics`,
  `POST /ai-draft`.
- Analytics returns a single aggregate response (KPIs + reminder funnel
  + recall conversion + opt-out trend + cost) — mirrors the Phase 8
  `/api/analytics` precedent.
- BFF: `recall-queue/route.ts`, `recall-queue/send-all/route.ts`,
  `history/[patientId]/route.ts`, `inbox/route.ts`, `analytics/route.ts`,
  `ai-draft/route.ts`.
- 11 tests: 5 recall (run row + audits, 1st vs 2nd touch, SQL contract
  for exhaustion/deceased exclusion + 12-month interval, ORDER BY),
  6 misc (history shape, inbox classification, analytics 4-KPI shape,
  AI draft happy path, AI draft no-Claude-on-opt-out, AI draft PHI
  scrub).

### Task 3 — templates + settings + preferences
- Templates CRUD: `GET/POST/PATCH/DELETE /templates[/{id}]`. Soft-delete
  preserves audit trail. Mutations emit `TEMPLATE_CREATED` /
  `TEMPLATE_UPDATED`.
- Settings: `GET/PATCH /settings` reads/writes
  `tenant.settings_jsonb.messaging`. Toggling `messaging_enabled`
  emits `MESSAGING_ENABLED` or `MESSAGING_DISABLED`.
- Preferences: `GET/PATCH /preferences/{patient_id}` projects
  `contact_info_jsonb` into `ChannelPreferenceOut`. PATCH grants/revokes
  per-flag consents and emits `CHANNEL_PREFERENCE_UPDATED` +
  `CONSENT_GRANTED` + `CONSENT_REVOKED` with the changed-keys list in
  metadata so audit reviewers see exactly which consents changed.
- BFF: `templates/route.ts`, `templates/[templateId]/route.ts`,
  `settings/route.ts`, `preferences/[patientId]/route.ts`.
- 10 tests: list/create/update/soft-delete, settings GET, toggle-on
  audit, toggle-off audit, preferences GET, consent GRANT, consent
  REVOKE.

## Final endpoint inventory

| # | Method   | Path                                  | Notes                                |
|---|----------|---------------------------------------|--------------------------------------|
| 1 | POST     | `/api/messaging/send`                 | sender.dispatch + record_bounce on fail |
| 2 | POST     | `/api/messaging/bulk-send`            | 50-cap + 1 msg/sec + batch audit        |
| 3 | GET      | `/api/messaging/recall-queue`         | live SQL                                  |
| 4 | POST     | `/api/messaging/recall-queue/send-all`| RecallQueueRun + 2nd-touch exhaustion     |
| 5 | GET      | `/api/messaging/history/{patient_id}` | newest-first                              |
| 6 | GET      | `/api/messaging/inbox`                | optional classification filter             |
| 7 | GET      | `/api/messaging/analytics`            | single-aggregate (Phase 8 precedent)        |
| 8 | POST     | `/api/messaging/ai-draft`             | preflight before Claude (CRM-12)            |
| 9 | GET      | `/api/messaging/templates`            | tenant-scoped, soft-delete-aware            |
|10 | POST     | `/api/messaging/templates`            | TEMPLATE_CREATED audit                      |
|11 | PATCH    | `/api/messaging/templates/{id}`       | TEMPLATE_UPDATED audit                      |
|12 | DELETE   | `/api/messaging/templates/{id}`       | soft-delete + audit                         |
|13 | GET      | `/api/messaging/settings`             |                                              |
|14 | PATCH    | `/api/messaging/settings`             | MESSAGING_ENABLED/DISABLED on toggle        |
|15 | GET      | `/api/messaging/preferences/{pid}`    | ChannelPreferenceOut                         |
|16 | PATCH    | `/api/messaging/preferences/{pid}`    | CONSENT_GRANTED/REVOKED on flag flip         |

All 16 endpoints sit behind
`Depends(require_entitlement("messaging"))` at the router level.

## BFF route inventory

11 new proxies (12 total in `app/api/messaging/` including 12-02's
`render-template`):

```
ai-draft/route.ts                       POST
analytics/route.ts                      GET
bulk-send/route.ts                      POST
history/[patientId]/route.ts            GET
inbox/route.ts                          GET
preferences/[patientId]/route.ts        GET, PATCH
recall-queue/route.ts                   GET
recall-queue/send-all/route.ts          POST
send/route.ts                           POST
settings/route.ts                       GET, PATCH
templates/route.ts                      GET, POST
templates/[templateId]/route.ts         PATCH, DELETE
```

All use `proxyToFastAPI(request, "/api/messaging/...")` with trailing
slash on upstream paths per `lib/bff.ts` rule.

## Test count + breakdown

| File                       | Tests | Notes |
|----------------------------|-------|-------|
| test_routes_send.py        | 7     | happy, entitlement 403, validation 422 (×2), opt-out 409, cost-cap 429, bounce hook, body-or-template guard |
| test_routes_bulk.py        | 7     | 51-recipient validation, audit-before-send, throttle (3 sleeps), opt-out vs failed accounting, service-level 422, provider failure path, BulkSendResponse contract |
| test_routes_recall.py      | 5     | run row + audits, 1st-touch vs 2nd-touch exhaustion, SQL contract for exhausted/deceased + 12-month interval, ORDER BY |
| test_routes_misc.py        | 16    | history (1), inbox (1), analytics shape (1), AI draft happy + no-Claude-on-opt-out + PHI scrub (3), templates CRUD (4), settings GET + toggle-on + toggle-off (3), preferences GET + grant + revoke (3) |
| **Plan 12-05 total**       | **35** | |
| Full messaging suite       | **200** | all green |

## Deviations from plan

1. **`require_entitlement` did not exist — created in `backend/core/entitlements.py`.**
   Plan assumed `from backend.core.security import require_entitlement` and
   `get_tenant_context`. Reality: `security.py` has only `get_current_tenant`
   (no entitlement helper) and `entitlements.py` was a bare `Entitlement`
   StrEnum. Added `PLAN_FEATURES` map mirroring `lib/entitlements.ts`,
   added `plan_name` field to `TenantContext` (default `"Core"`,
   backward-compatible with all 4 prior callsites), and added a
   `require_entitlement(key)` FastAPI dependency factory that raises 403
   `{code: "ENTITLEMENT_REQUIRED", entitlement, plan}` when the caller's
   plan does not grant the key.

2. **`record_bounce` lives in `bounce_tracker.py`, not `bulk_send.py`.**
   Plan 12-04 already created `backend/services/messaging/bounce_tracker.py`
   and noted in its SUMMARY (deviation #2) that the canonical home is there
   because webhooks are the primary CRM-20 caller. This plan imports
   `record_bounce` from `bounce_tracker` rather than re-implementing it
   inline — eliminates a duplicate definition and keeps the JSONB
   counter logic in one place.

3. **`bulk_send` uses a serial `for` loop rather than
   `asyncio.Semaphore(1)`.** A sequential `await dispatch(...)` followed
   by `await asyncio.sleep(THROTTLE_SECONDS)` already yields a 1 msg/sec
   floor with simpler tests. The plan-specified semaphore was redundant
   given that we never spawn concurrent `dispatch` tasks. Test 10 in
   `test_routes_bulk.py` asserts `await_count == 3` for a 3-recipient
   batch with `sleep(THROTTLE_SECONDS)`.

4. **AI draft model is `claude-haiku-4-5-20251001`.** Plan said
   `claude-haiku-4-5-20251015`; the published model ID is `20251001`
   (matches `lib/anthropic-config.ts` precedent).

5. **`SingleSendRequest` Pydantic model added.** Plan handler accepted
   raw `dict`. A typed schema gives the frontend a stable contract,
   surfaces validation errors as 422 with field paths, and lets us write
   schema-first tests (`feedback_contract_tests.md`).

6. **Analytics PostgreSQL `LIKE` literals double-escaped (`'recall_%%'`).**
   `text(...)` with bind params interprets `%` as a placeholder; doubled
   `%%` survives the param-substitution and reaches PG as `LIKE 'recall_%'`
   intact.

7. **Recall service-level fetcher injection over module-internal closures.**
   Plan inlined `_fetch_patient` / `_fetch_template` / `_fetch_tenant`
   inside `run_recall_batch`. Refactored to accept them as keyword args
   (the routes pass closures over their own helpers). Avoids the import
   cycle the plan flagged and makes `run_recall_batch` testable without
   a Postgres connection.

8. **Test approach: direct-handler invocation + monkeypatched fetchers.**
   Per `feedback_contract_tests.md` and the existing `test_sender.py` /
   `test_twilio_webhook.py` pattern, we call route functions directly
   with `FakeSession` stand-ins rather than spinning up a TestClient.
   Faster, no DB dependency, and the entitlement gate is exercised by
   testing `require_entitlement` independently.

## Files modified

### Backend
- `backend/core/security.py` (added `plan_name` to `TenantContext`)
- `backend/core/entitlements.py` (added `PLAN_FEATURES`, `has_entitlement`,
  `require_entitlement`)
- `backend/schemas/messaging.py` (added `SingleSendRequest`,
  `BulkSendResponse`, `BulkSendError`, `RecallSendAllRequest`,
  `RecallSendAllResponse`, `AIDraftRequest`, `AIDraftResponse`)
- `backend/services/messaging/bulk_send.py` (new — 50-cap + throttle service)
- `backend/services/messaging/recall.py` (new — candidate query + batch run)
- `backend/services/messaging/ai_draft.py` (new — Claude-backed draft)
- `backend/api/routes/messaging.py` (new — 16 endpoints)
- `backend/main.py` (router registered)

### Tests
- `backend/tests/messaging/test_routes_send.py` (new — 7 tests)
- `backend/tests/messaging/test_routes_bulk.py` (new — 7 tests)
- `backend/tests/messaging/test_routes_recall.py` (new — 5 tests)
- `backend/tests/messaging/test_routes_misc.py` (new — 16 tests)

### BFF (Next.js)
- `app/api/messaging/send/route.ts` (new)
- `app/api/messaging/bulk-send/route.ts` (new)
- `app/api/messaging/recall-queue/route.ts` (new)
- `app/api/messaging/recall-queue/send-all/route.ts` (new)
- `app/api/messaging/history/[patientId]/route.ts` (new)
- `app/api/messaging/inbox/route.ts` (new)
- `app/api/messaging/analytics/route.ts` (new)
- `app/api/messaging/ai-draft/route.ts` (new)
- `app/api/messaging/templates/route.ts` (new)
- `app/api/messaging/templates/[templateId]/route.ts` (new)
- `app/api/messaging/settings/route.ts` (new)
- `app/api/messaging/preferences/[patientId]/route.ts` (new)

## Manual smoke (deferred to 12-10)

Plan 12-10 owns the staged-canary UAT against real Twilio + Postmark
sandboxes. Acceptance for this plan is purely automated (35 new tests +
no regressions on the existing 165) — all 200 messaging tests green.
