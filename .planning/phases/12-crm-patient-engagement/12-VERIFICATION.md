---
phase: 12
status: pending-checkpoint
verified_at: ""
verified_by: ""
hipaa_critical: true
---

# Phase 12 — CRM & Patient Engagement Verification

This document is the phase-gate evidence. Every requirement (CRM-01 through CRM-20)
MUST have a tick before phase completion is declared. Manual checkpoints (M1–M9)
exist because Phase 12 sends real messages to real patients on real provider
networks — automated tests alone cannot catch a misconfigured Twilio dashboard or
an unsigned BAA.

## Per-Requirement Evidence

Twenty rows below cover the full CRM-01 through CRM-20 requirement IDs.

| Req | Plan | Evidence | Status |
|-----|------|----------|--------|
| CRM-01 | 12-06 | `pytest backend/tests/messaging/test_reminder_cadence.py` (≥9 tests) + manual: 1 reminder fires at scheduled time in staging | ⬜ |
| CRM-02 | 12-05 + 12-08 | `pytest backend/tests/messaging/test_routes_send.py` + `npx playwright test patient-messages-tab.spec.ts` | ⬜ |
| CRM-03 | 12-05 + 12-09 | `pytest backend/tests/messaging/test_routes_recall.py` + `npx playwright test recall-queue.spec.ts` | ⬜ |
| CRM-04 | 12-03 + 12-04 | `pytest backend/tests/messaging/test_opt_out_guard.py` + canonical contract `backend/tests/messaging/test_twilio_webhook.py::test_inbound_stop_records_optout` | ⬜ |
| CRM-05 | 12-04 + 12-08 | `pytest backend/tests/messaging/test_resend_webhook.py` + `npx playwright test patient-messages-tab.spec.ts` | ⬜ |
| CRM-06 | 12-01 + 12-05 | `pytest backend/tests/messaging/test_routes_misc.py::test_preferences_patch_*` covers all 4 consent flags + audit emit | ⬜ |
| CRM-07 | 12-04 | `pytest backend/tests/messaging/test_twilio_webhook.py` + `test_resend_webhook.py` signature tests (CONTRACT) | ⬜ |
| CRM-08 | 12-03 | `pytest backend/tests/messaging/test_quiet_hours.py` (≥8 tests including DST) | ⬜ |
| CRM-09 | 12-03 + 12-09 | `pytest backend/tests/messaging/test_cost_cap.py` (≥7 tests) + manual visual on settings page | ⬜ |
| CRM-10 | 12-05 | `pytest backend/tests/messaging/test_routes_bulk.py` — 50 cap + 1msg/sec throttle + batch_id audit | ⬜ |
| CRM-11 | 12-06 | `pytest backend/tests/messaging/test_classifier.py` (≥6 tests, fast webhook response) | ⬜ |
| CRM-12 | 12-05 | `pytest backend/tests/messaging/test_routes_misc.py::test_ai_draft_*` preflight (CONTRACT) | ⬜ |
| CRM-13 | 12-10 | `npx playwright test messaging-wizard.spec.ts` — 7 steps + activate flip | ⬜ |
| CRM-14 | 12-02 + 12-10 | `pytest backend/tests/messaging/test_twilio_client.py::test_provision_local_number*` + manual: real number provisioned in staging | ⬜ |
| CRM-15 | 12-05 + 12-09 | `pytest backend/tests/messaging/test_routes_misc.py::test_analytics_*` + `npx playwright test messaging-analytics.spec.ts` | ⬜ |
| CRM-16 | 12-10 | manual: download compliance report PDF for sample month, verify rendering | ⬜ |
| CRM-17 | 12-01 | `grep -c "MESSAGING" lib/entitlements.ts` AND `backend/core/entitlements.py` (both ≥ 3) | ⬜ |
| CRM-18 | 12-03 | `pytest backend/tests/messaging/test_recipient_resolver.py` — minor → guardian routing (≥7 tests) | ⬜ |
| CRM-19 | 12-03 + 12-06 | `pytest backend/tests/messaging/test_recipient_resolver.py` household + `test_reminder_cadence.py` bundle test | ⬜ |
| CRM-20 | 12-05 | `pytest backend/tests/messaging/test_routes_send.py::test_*bounce_fallback*` (3 fails → channel flip) | ⬜ |

## Manual Checkpoints (HIPAA-critical)

| # | Behavior | Evidence | Status |
|---|----------|----------|--------|
| M1 | Resend / Postmark BAA confirmed in writing | `.planning/compliance/RESEND-BAA-CHECKPOINT.md` `status: signed` (or fallback executed) | ⬜ |
| M2 | Live Twilio test SMS round-trip | OWNER receives SMS during wizard step 7 in staging, taps "I Received Them" | ⬜ |
| M3 | PHI scrubber visual QA | Compose 5 borderline templates with diagnosis terms — confirm warn UI + 422 PHIInTemplate on send | ⬜ |
| M4 | Quiet hours real-clock test | Schedule reminder for 9:30pm clinic-local, observe `MESSAGE_DEFERRED` audit + dispatch at next 8am | ⬜ |
| M5 | Bulk send throttle on real Twilio | 5-recipient batch in staging — Twilio dashboard shows ~1/sec | ⬜ |
| M6 | Compliance PDF visual review | OWNER downloads sample month report, verifies volume + opt-out + consent tables | ⬜ |
| M7 | Twilio Messaging Service status callback wired | OWNER confirms callback URL = `https://app.clarityos.app/api/webhooks/twilio` and inbound URL same | ⬜ |
| M8 | Postmark / Resend webhook configured | OWNER confirms webhook URL points to `/api/webhooks/postmark` (or `/api/webhooks/resend`) with sent + delivered + opened + bounced events | ⬜ |
| M9 | Twilio BAA signed | OWNER confirms Twilio HIPAA / BAA active in Twilio Console | ⬜ |

## Test Suite Totals

| File | Test Count | Status |
|------|-----------|--------|
| backend/tests/messaging/test_twilio_client.py | ≥ 8 | ⬜ |
| backend/tests/messaging/test_resend_client.py | ≥ 7 | ⬜ |
| backend/tests/messaging/test_templates.py | ≥ 30 (incl 24+ PHI parametrize) | ⬜ |
| backend/tests/messaging/test_opt_out_guard.py | ≥ 7 (+ 32 matrix) | ⬜ |
| backend/tests/messaging/test_quiet_hours.py | ≥ 8 | ⬜ |
| backend/tests/messaging/test_cost_cap.py | ≥ 7 | ⬜ |
| backend/tests/messaging/test_recipient_resolver.py | ≥ 7 | ⬜ |
| backend/tests/messaging/test_sender.py | ≥ 11 (incl choke-point invariant) | ⬜ |
| backend/tests/messaging/test_twilio_webhook.py | ≥ 10 | ⬜ |
| backend/tests/messaging/test_resend_webhook.py | ≥ 5 | ⬜ |
| backend/tests/messaging/test_routes_send.py | ≥ 7 | ⬜ |
| backend/tests/messaging/test_routes_bulk.py | ≥ 3 | ⬜ |
| backend/tests/messaging/test_routes_recall.py | ≥ 5 | ⬜ |
| backend/tests/messaging/test_routes_misc.py | ≥ 15 | ⬜ |
| backend/tests/messaging/test_reminder_cadence.py | ≥ 9 | ⬜ |
| backend/tests/messaging/test_scheduler.py | ≥ 6 | ⬜ |
| backend/tests/messaging/test_classifier.py | ≥ 6 | ⬜ |
| lib/messaging/sms-segments.test.ts | ≥ 6 | ⬜ |
| lib/messaging/phi-scan.test.ts | ≥ 5 | ⬜ |
| lib/messaging/composer-preview.test.ts | ≥ 4 | ⬜ |
| tests/e2e/messaging-*.spec.ts | 4 specs | ⬜ |

## Phase Gate

This phase is COMPLETE when:

- [ ] All 20 CRM requirements ticked above
- [ ] All 9 manual checkpoints (M1–M9) ticked
- [ ] Every test file at its expected count
- [ ] `cd backend && pytest tests/messaging -x -q` → exits 0
- [ ] `npx vitest run lib/messaging` → exits 0
- [ ] `bash scripts/dev.sh pre-test && npx playwright test --grep @messaging` → exits 0
- [ ] `npx tsc --noEmit` → exits 0
- [ ] STATE.md updated to mark Phase 12 complete
