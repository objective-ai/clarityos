---
phase: 12
slug: crm-patient-engagement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `.planning/phases/12-crm-patient-engagement/12-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (backend)** | pytest 7.x + pytest-asyncio + freezegun |
| **Framework (frontend unit)** | vitest 1.x |
| **Framework (E2E)** | @playwright/test |
| **Config file** | `backend/pytest.ini`, `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command (backend)** | `pytest backend/tests/messaging -x -q` |
| **Quick run command (frontend)** | `npx vitest run lib/messaging` |
| **Full suite command** | `bash scripts/dev.sh pre-test && pytest backend/tests/messaging && npx vitest run && npx playwright test --grep @messaging` |
| **Estimated runtime** | ~90s (backend unit) · ~30s (frontend unit) · ~3min (E2E messaging spec) |

Wave 0 fixtures required (planner MUST create before any messaging code):
- `backend/tests/messaging/conftest.py` — `mock_twilio_client`, `mock_resend_client`, `frozen_clock`, `signed_twilio_webhook_factory`, `signed_resend_webhook_factory`
- `tests/e2e/fixtures/messaging.ts` — `seedClinicWithMessaging`, `seedPatientWithConsent`, `seedAppointment`

---

## Sampling Rate

- **After every task commit:** Run quick command for the file's domain (`pytest backend/tests/messaging/test_<feature>.py -x` OR `npx vitest run <file>`)
- **After every plan wave:** Run full domain suite (`pytest backend/tests/messaging` AND `npx vitest run lib/messaging`)
- **Before `/gsd:verify-work`:** Full suite must be green; manual checkpoints (BAA, live Twilio, PHI scrubber QA) all signed off
- **Max feedback latency:** 90 seconds for backend unit; 30s for frontend unit

---

## Per-Task Verification Map

> Concrete task IDs are filled in by the planner; this table seeds the requirement → test-type mapping. The planner MUST add a row for every `<task>` in PLAN files and ensure no 3 consecutive tasks skip automated verification.

| Requirement | Behavior | Test Type | Automated Command | Wave 0 Dep |
|-------------|----------|-----------|-------------------|------------|
| CRM-01 | Twilio webhook signature verification rejects invalid X-Twilio-Signature | contract (backend) | `pytest backend/tests/messaging/test_twilio_webhook.py::test_invalid_signature_rejected` | ❌ W0 (signed_twilio_webhook_factory) |
| CRM-02 | Resend Svix signature verification rejects invalid signature | contract (backend) | `pytest backend/tests/messaging/test_resend_webhook.py::test_invalid_signature_rejected` | ❌ W0 (signed_resend_webhook_factory) |
| CRM-03 | Opt-out preflight blocks send when patient has revoked consent for channel+purpose | contract (backend) | `pytest backend/tests/messaging/test_sender.py::test_optout_preflight` | ❌ W0 (mock_twilio_client) |
| CRM-04 | PHI scrub: operational SMS template rejects diagnosis/Rx/ICD tokens at render time | contract (backend) | `pytest backend/tests/messaging/test_phi_scrub.py` | ✅ existing |
| CRM-05 | Reminder cadence schedules 7d / 72h / 24h before appointment | unit (backend) | `pytest backend/tests/messaging/test_reminder_cadence.py` | ❌ W0 (freezegun) |
| CRM-06 | Recall candidate query returns patients with last finalized encounter > 12 months AND no future appointment | unit (backend) | `pytest backend/tests/messaging/test_recall_candidates.py` | ✅ existing |
| CRM-07 | Quiet hours (9pm-8am patient-local) defers messages to next allowed window | unit (backend) | `pytest backend/tests/messaging/test_quiet_hours.py` | ❌ W0 (freezegun) |
| CRM-08 | Bulk send max 50 recipients enforced at API layer | unit (backend) | `pytest backend/tests/messaging/test_bulk_send.py::test_max_50_enforced` | ✅ existing |
| CRM-09 | Bulk send throttles to 1msg/sec (asyncio.sleep) | unit (backend) | `pytest backend/tests/messaging/test_bulk_send.py::test_throttle_1msg_per_sec` | ❌ W0 (freezegun) |
| CRM-10 | Daily cost cap blocks send at 100% with admin override flag | unit (backend) | `pytest backend/tests/messaging/test_cost_cap.py` | ✅ existing |
| CRM-11 | STOP keyword sets `consent_sms_marketing_at=null` and emits audit log | integration (backend) | `pytest backend/tests/messaging/test_optout_inbound.py` | ❌ W0 (mock_twilio_client) |
| CRM-12 | Channel preference bounce flips to alternate channel after 3 hard failures | integration (backend) | `pytest backend/tests/messaging/test_bounce_fallback.py` | ❌ W0 (mock_twilio_client) |
| CRM-13 | Minor (age<18) routes message to guardian.phone with audit annotation | integration (backend) | `pytest backend/tests/messaging/test_minor_routing.py` | ✅ existing |
| CRM-14 | Inbound classifier tags reschedule_request / cancellation / question_clinical / etc. | unit (backend) | `pytest backend/tests/messaging/test_inbound_classifier.py` (mocked Anthropic) | ❌ W0 (anthropic mock) |
| CRM-15 | AI message draft assist returns HIPAA-safe text respecting opt-out + minors | integration (backend) | `pytest backend/tests/messaging/test_ai_draft.py` | ❌ W0 (anthropic mock) |
| CRM-16 | Onboarding wizard last step (test message) flips `clinic_messaging_enabled=true` only after OWNER confirms receipt | E2E (Playwright) | `npx playwright test tests/e2e/messaging-wizard.spec.ts` | ❌ W0 (seedClinicWithMessaging) |
| CRM-17 | Manual composer preview shows token-replaced body, opt-out warning, segment count | unit (frontend) + E2E | `npx vitest run lib/messaging/composer-preview.test.ts` | ✅ existing |
| CRM-18 | Recall queue page lists 12mo-stale patients, allows edit/remove, Send All triggers batch | E2E (Playwright) | `npx playwright test tests/e2e/recall-queue.spec.ts` | ❌ W0 (seedPatientWithConsent) |
| CRM-19 | Per-patient Messages tab shows chronological reminder→delivered→confirmed→kept timeline | E2E (Playwright) | `npx playwright test tests/e2e/patient-messages-tab.spec.ts` | ❌ W0 (seedAppointment) |
| CRM-20 | Messaging analytics page shows reminder funnel + recall conversion + opt-out trend + cost using Recharts inline pattern | E2E (Playwright) + visual | `npx playwright test tests/e2e/messaging-analytics.spec.ts` | ❌ W0 (seedAppointment) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — populated during execute-phase*

---

## Wave 0 Requirements

Wave 0 must land **before any messaging implementation tasks** to keep sampling latency low and tests deterministic.

- [ ] `backend/tests/messaging/__init__.py`
- [ ] `backend/tests/messaging/conftest.py` — fixtures: `mock_twilio_client`, `mock_resend_client`, `frozen_clock` (freezegun), `signed_twilio_webhook_factory`, `signed_resend_webhook_factory`, `mock_anthropic_classifier`
- [ ] `tests/e2e/fixtures/messaging.ts` — helpers: `seedClinicWithMessaging`, `seedPatientWithConsent`, `seedAppointment`, `seedFinalizedEncounter`
- [ ] **Wave 0 BAA confirmation** — Resend BAA confirmed in writing OR fallback to Postmark (single-file change in `resend_client.py`). Manual checkpoint, no test.
- [ ] **Wave 0 backend deps** — `pip install twilio>=9.10.5 resend>=2.29.0 svix freezegun pytest-asyncio` (already in `pyproject.toml` likely; planner verifies)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Resend BAA confirmation | (Wave 0 blocker) | Compliance attestation, not a code path | OWNER (duytran@yahoo.com) requests BAA from Resend support; saves PDF to `.planning/compliance/resend-baa-2026.pdf`. If denied, planner fallbacks to Postmark before any production send. |
| Live Twilio round-trip | CRM-16 | Requires real phone + provisioned number; cost-bearing | During wizard step 7, OWNER receives test SMS + email on personal phone, taps confirm. |
| PHI scrubber visual QA | CRM-04 | Subjective "would a reviewer flag this?" | Compose 5 borderline messages (Rx mention, ICD code, condition name) — confirm SMS shows soft warning, email allows send, audit log records. |
| Quiet-hours real-clock test | CRM-07 | Wall-clock dependency for end-to-end confidence | Schedule a reminder for 9:30pm clinic-local, observe scheduler defers to 8am next-day, screenshot audit log. |
| Bulk send throttle on real Twilio | CRM-09 | Rate-limit behavior under real provider | Send a 50-recipient batch in staging, verify Twilio dashboard shows ~1 send/sec across the minute. |
| Onboarding wizard end-to-end | CRM-16 | UX & state-persistence across pages | OWNER walks all 7 steps in staging, refreshes between each, confirms progress restored. Plays back happy path + abandon-and-resume. |
| Compliance PDF visual review | (CRM-20 sibling) | Layout-driven artifact for compliance binder | Generate Communications Compliance Report PDF for sample month; verify volume, opt-outs, audit summary all render correctly. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify command OR a Wave 0 dependency listed above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (check during plan-checker)
- [ ] Wave 0 covers all MISSING references (fixtures, mocks, BAA confirmation)
- [ ] No watch-mode flags in commands (must be one-shot)
- [ ] Feedback latency < 90s for backend unit, < 30s for frontend unit
- [ ] `nyquist_compliant: true` set in frontmatter when planner finalizes

**Approval:** pending
