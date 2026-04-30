---
phase: 12
plan: 02
slug: provider-clients
status: complete
completed: 2026-04-30
tasks_completed: 3/3
tests_added: 64
tests_passing: 64
---

# Plan 12-02 — Provider Clients (Twilio + Postmark + Templates) — SUMMARY

## What was built

Pure SDK-adapter layer. No business decisions live here — every preflight
check (opt-out, quiet hours, cost cap, audit) is reserved for the
choke-point sender service in Plan 12-03.

### Task 1 — Twilio adapter
- `backend/services/messaging/twilio_client.py`
  - `send_sms(body, to, status_callback_url, messaging_service_sid)`
  - `validate_signature(url, form, signature, auth_token=None)`
  - `provision_local_number(area_code, friendly_name, messaging_service_sid)`
  - Lazy singleton (`_get_client`) — no eager credential load at import.
  - Async-safe via `asyncio.to_thread` (Twilio SDK is sync-only).
- `backend/core/config.py` — added 11 messaging env vars (Twilio + Postmark
  + webhook + scheduler toggle + EMAIL_PROVIDER selector).
- `backend/tests/messaging/test_twilio_client.py` — 12 tests (4 over plan).

### Task 2 — Email adapter (Postmark)
- `backend/services/messaging/email_client.py`
  - `send_email(subject, html, to, idempotency_key, from_, reply_to, tag)`
  - `verify_postmark_basic_auth(authorization_header)` — constant-time
    via `secrets.compare_digest`.
- File renamed from the plan's `resend_client.py` per BAA decision (Postmark,
  not Resend — see `.planning/compliance/RESEND-BAA-CHECKPOINT.md`).
- Webhook auth = HTTP Basic Auth (Postmark), not Svix HMAC (Resend) and not
  HMAC-SHA1 (the plan's stale Path-B assumption).
- `backend/tests/messaging/test_email_client.py` — 14 tests (7 over plan).

### Task 3 — Templates + PHI + React Email
- `backend/services/messaging/templates.py`
  - `render_template(body, tokens, required)` — closed-allowlist substitution.
  - `scrub_phi_for_operational_sms(body)` — diagnosis/Rx denylists + ICD-10,
    Rx-value, acuity, add-power regexes.
  - `count_sms_segments(body)` — GSM-7 (160/153) vs UCS-2 (70/67).
  - `ALLOWED_TOKENS` — 7 standard tokens.
- `backend/tests/messaging/test_templates.py` — 38 tests:
  - 24 parametrized over PHI corpus (every entry blocked).
  - 7 render/token edge cases.
  - 7 segment-counter cases (incl. emoji → UCS-2, accented → GSM-7).
- `components/messaging/emails/ReminderEmail.tsx` — appointment reminder,
  EN + ES, brand-accent CTA (#2DD4BF) + reschedule link.
- `components/messaging/emails/RecallEmail.tsx` — annual recall, EN + ES.
- `components/messaging/emails/ManualEmail.tsx` — generic clinic message
  (subject + body + clinic footer).
- `app/api/messaging/render-template/route.tsx` — BFF render endpoint behind
  `WEBHOOK_INTERNAL_SECRET`; `runtime = "nodejs"` (React Email requires it).

## Deviations from plan

| Area | Plan said | We did | Why |
|---|---|---|---|
| Email file name | `resend_client.py` | `email_client.py` | Postmark, not Resend (BAA). User chose this rename over keeping the misleading filename. |
| Email provider | Resend (Path A) or HMAC-SHA1 (Path B) | Postmark + HTTP Basic Auth | BAA checkpoint correction recorded 2026-04-29. |
| Webhook auth | HMAC-SHA1 (plan's Path B) | HTTP Basic Auth | Plan was wrong about Postmark — the checkpoint corrected it. |
| Route extension | `route.ts` | `route.tsx` | JSX in handler requires .tsx. |
| pytest-asyncio | (not mentioned) | Added to requirements.txt | Wave 0 missed it — `@pytest.mark.asyncio` requires the plugin. |
| pytest.ini | (not mentioned) | Created at repo root | Centralizes asyncio_mode + pythonpath for the new test layout. |
| conftest fixtures | env-only patching | Patches both env and the live `settings` object | Settings is a frozen instance loaded at import; env-only monkeypatch was a no-op. |

## Final exports

`backend/services/messaging/twilio_client.py`:
- `send_sms`, `validate_signature`, `provision_local_number`
- `TwilioConfigError`, `NoNumberAvailable`

`backend/services/messaging/email_client.py`:
- `send_email`, `verify_postmark_basic_auth`
- `EmailConfigError`, `EmailWebhookAuthError`

`backend/services/messaging/templates.py`:
- `render_template`, `scrub_phi_for_operational_sms`, `count_sms_segments`
- `ALLOWED_TOKENS`
- `TemplateRenderError`, `PHIInTemplate`

## Test totals

| File | Tests | Status |
|---|---|---|
| test_twilio_client.py | 12 | ✓ |
| test_email_client.py | 14 | ✓ |
| test_templates.py | 38 (24 PHI corpus + 14) | ✓ |
| **Total** | **64** | ✓ |

`python -m pytest backend/tests/messaging/ -q` → `64 passed in 1.88s`.
`npx tsc --noEmit` clean for all 12-02 files (pre-existing e2e errors unrelated).

## Downstream-import note

Plans 12-03/04/05 reference `resend_client` in their plan files. They will
need to import from `email_client` instead. The class names
(`EmailConfigError`) align with the plan's contract; only the module path
changed.
