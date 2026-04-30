---
phase: 12
plan: 00
slug: wave0-foundation
status: complete
date: 2026-04-29
email_provider: postmark
---

# Plan 12-00 Summary — Wave 0 Foundation

## What landed

### Task 1 — Dependencies (done)
**Backend** (added to `requirements.txt` at project root — see Deviation 1):
- `twilio>=9.10.5,<10` — installed `9.10.5`
- `postmarker>=1.0` — installed `1.0` *(swapped in for `resend` + `svix` after BAA decision)*
- `phonenumbers>=8.13.50` — installed `9.0.29`
- `freezegun>=1.5.0` — installed `1.5.5`

All 4 backend deps verified importable (`python -c "import twilio, postmarker, phonenumbers, freezegun"` exits 0).

**Frontend** (added to `package.json` dependencies):
- `@react-email/components: ^1.0.12` — installed `1.0.12`
- `@react-email/render: ^2.0.8` — installed `2.0.8`

Both verified importable (`node -e "require('@react-email/render'); require('@react-email/components')"` exits 0).

### Task 2 — Test scaffold (done)
Created the following files:
- `backend/tests/messaging/__init__.py` (empty)
- `backend/tests/messaging/conftest.py` — 7 fixtures: `disable_messaging_scheduler` (autouse), `frozen_clock`, `mock_twilio_client`, `mock_postmark_client`, `mock_anthropic_classifier`, `signed_twilio_webhook_factory`, `postmark_webhook_request_factory`
- `backend/tests/messaging/factories.py` — `make_message_log_kwargs()` stub (filled out by Plan 12-01)
- `backend/tests/messaging/fixtures/__init__.py` (empty)
- `backend/tests/messaging/fixtures/twilio_signatures.py` — 4 captured payloads (status callback, inbound SMS, STOP keyword, tampered)
- `backend/tests/messaging/fixtures/postmark_events.py` — 5 Postmark events (Delivery, Open, Click, Bounce, SpamComplaint)
- `backend/tests/messaging/fixtures/phi_scrub_corpus.py` — 24 corpus entries (12 diagnoses + 5 ICD-10 + 7 Rx)
- `tests/e2e/fixtures/messaging.ts` — 4 typed Playwright seed helpers (stubs that throw, signatures locked)

**Verification:**
- `python -m pytest backend/tests/messaging --collect-only -q` → exits 0 (no tests yet, conftest importable)
- conftest manually imported via importlib → all 7 fixtures defined
- `TEST_CORPUS` length = 24 (>= 24 required)
- All grep acceptance checks pass (after rename: `mock_postmark_client` instead of `mock_resend_client`, `postmark_webhook_request_factory` instead of `signed_resend_webhook_factory`)
- `npx tsc --noEmit` clean for `tests/e2e/fixtures/messaging.ts` (14 pre-existing errors elsewhere are NOT introduced by this plan)

### Task 3 — BAA Checkpoint (RESOLVED)
- `.planning/compliance/RESEND-BAA-CHECKPOINT.md` updated: `status: postmark-fallback`, `provider: postmark`.
- Decision made without contacting Resend: owner did not want to add another vendor account, existing SendGrid is on Free/Essentials tier (no BAA), SendGrid Pro ($89.95+/mo) exceeded budget. Postmark Starter ($15/mo) wins on cost + published BAA path + faster turnaround.
- Owner action items captured in checkpoint file (sign up, submit BAA request, configure webhook auth, set env vars).
- Plans 12-02 and 12-04 now unblocked (will use `postmarker` SDK + HTTP Basic Auth webhook verification).

## Plan deviations from PLAN.md

**1. Python `requirements.txt` location**
- Plan said: `backend/requirements.txt`
- Reality: `requirements.txt` lives at project root (confirmed by `Dockerfile` line 6 and `nixpacks.toml` line 5)
- Action: appended pins to root `requirements.txt`. No `backend/requirements.txt` was created.

**2. React Email version pins**
- Plan said: `@react-email/components@^0.6.0` and `@react-email/render@^4.0.0`
- Reality: those versions don't exist on npm. Latest stable releases are `1.0.12` and `2.0.8` respectively.
- Action: pinned to `^1.0.12` and `^2.0.8`. Plan 12-07 should validate the React Email API surface.

**3. Email provider swap (Resend → Postmark)**
- Plan default was Resend. After tier/cost analysis with the owner, swapped to Postmark before any Resend account was created.
- Net effect: removed `resend>=2.29.0,<3` and `svix>=1.40.0,<2` from `requirements.txt`; added `postmarker>=1.0`.
- Conftest fixtures renamed: `mock_resend_client` → `mock_postmark_client`, `signed_resend_webhook_factory` → `postmark_webhook_request_factory`.
- Fixture file renamed: `svix_signatures.py` → `postmark_events.py` (also: 5 events vs 4 — added SpamComplaint because Postmark surfaces it as a separate event with permanent suppression semantics).

**4. ⚠️ Webhook auth scheme correction (affects Plan 12-04)**
- Plan said: "Postmark webhook signature uses raw HMAC-SHA1".
- Reality: Postmark does NOT use HMAC. Webhooks authenticate via HTTP Basic Auth (username/password set in Postmark dashboard) plus optional IP allowlist.
- Action: conftest factory now builds an `Authorization: Basic <token>` header. Plan 12-04 must implement `verify_postmark_basic_auth(request)` using constant-time string compare against `POSTMARK_WEBHOOK_USER` / `POSTMARK_WEBHOOK_PASSWORD` env vars.
- This is documented in `.planning/compliance/RESEND-BAA-CHECKPOINT.md` and should be reflected when Plan 12-04 is replanned.

**5. `npm install` reported 18 vulnerabilities (4 moderate, 14 high)**
- Transitive deps from React Email tree. Punted to Plan 12-07.

**6. Pre-existing `tsc --noEmit` errors in unrelated test files**
- 14 pre-existing TS errors in `tests/e2e/smoke-{analytics,encounter,intake,pages,patients,schedule-v2}.spec.ts`.
- None introduced by this plan. Out of scope for Wave 0.

## Outstanding

- **Owner action (non-blocking for code, blocking for production sends):**
  - [ ] Sign up Postmark Starter
  - [ ] Submit BAA request via Postmark Compliance
  - [ ] Configure DNS (SPF/DKIM/DMARC/Return-Path)
  - [ ] Set 5 env vars: `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_ADDRESS`, `POSTMARK_WEBHOOK_USER`, `POSTMARK_WEBHOOK_PASSWORD`, `POSTMARK_MESSAGE_STREAM`
  - [ ] Update `RESEND-BAA-CHECKPOINT.md` `status: signed` once BAA PDF is in hand

- **Planner action:** When replanning Plan 12-02 and Plan 12-04, swap Resend/Svix references for Postmark/Basic Auth. Plan 12-04 webhook auth section needs full rewrite (HMAC → Basic Auth).

- **Wave 1 (Plan 12-01 schema/ORM):** unblocked. Can start immediately.
