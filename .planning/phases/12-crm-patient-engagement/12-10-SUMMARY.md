---
phase: 12
plan: 10
slug: onboarding-compliance-e2e
status: tasks-1-3-complete-checkpoint-pending
completed_at: 2026-04-30
---

# Plan 12-10 — Summary

## What shipped

**Task 1 — Onboarding Wizard + endpoints + template seeds**

- 7 wizard step components: `Step1Acknowledge`, `Step2ClinicInfo`, `Step3NumberProvision`, `Step4ReminderPreset`, `Step5RecallPreset`, `Step6TemplateSeed`, `Step7TestSend` (all under `components/messaging/wizard/`)
- Wizard orchestrator `app/(tenant)/[tenant]/settings/messaging/onboarding/page.tsx` with localStorage persistence + ARIA progressbar
- 4 FastAPI onboarding endpoints in `backend/api/routes/messaging.py` (OWNER-only): `/onboarding/provision-number`, `/onboarding/seed-templates`, `/onboarding/test-send`, `/onboarding/activate`
- 4 BFF passthrough routes under `app/api/messaging/onboarding/`
- `backend/services/messaging/seeds.py` with `seed_default_templates()` — idempotent, optometry SMS EN/ES + email EN packs
- `lib/api/messaging.ts` extended with `provisionNumber`, `seedTemplates`, `onboardingTestSend`, `activateMessaging`

Key design choices:
- `test-send` calls `twilio_client.send_sms` and `email_client.send_email` directly — bypasses the patient-bound `dispatch` path (no fake patient row needed). Logs a single `MESSAGE_SENT` audit with `trigger: onboarding_test_send`.
- `activate` flips `tenant.settings_jsonb.messaging.messaging_enabled = true` and emits `MESSAGING_ENABLED` audit.
- Wizard step 6 currently ships optometry copy for all practice types until ophthalmology / general packs ship.

**Task 2 — Compliance Report PDF + 4 Playwright @messaging specs + fixtures**

- `backend/services/messaging/compliance_report.py` — `generate_compliance_report_pdf()` using **reportlab** (Phase 9 dep, mirrors `backend/api/routes/billing.py`)
- `GET /api/messaging/compliance-report` (OWNER-only) returns binary PDF
- `app/api/messaging/compliance-report/route.ts` — streaming BFF passthrough (proxyToFastAPI buffers JSON, so this hand-rolls the upstream call)
- `tests/e2e/fixtures/messaging.ts` — real impl replacing the Plan 12-00 stubs. Drives BFF routes (no DB-direct), uses storageState-authenticated test tenant `sunview`.
- 4 `@messaging` Playwright specs:
  - `messaging-wizard.spec.ts` (CRM-13) — 7-step happy path, **skips when TWILIO/POSTMARK creds absent**
  - `recall-queue.spec.ts` (CRM-03 + CRM-18) — page header + Send All control
  - `patient-messages-tab.spec.ts` (CRM-05) — empty state + composer open
  - `messaging-analytics.spec.ts` (CRM-15) — KPIs + at least one chart title

**Task 3 — Phase 12 VERIFICATION.md**

- 20 CRM rows (CRM-01 through CRM-20), each linked to a concrete pytest / vitest / Playwright file
- 9 HIPAA-critical manual checkpoints (M1–M9): BAA, live Twilio round-trip, PHI scrubber, quiet hours, throttle, compliance PDF, dashboard config (Twilio + Postmark webhooks), Twilio BAA
- Test-suite count table covering 17 backend pytest files + 3 vitest files + 4 Playwright specs
- Phase Gate enumerating the 8 commands that must pass before phase 12 closes

## Library choices

- **reportlab** — PDF generation (already a Phase 9 dep)
- **Twilio Python SDK** — wrapped in `twilio_client.py` (Plan 12-02)
- **postmarker** — Postmark client for email (per BAA decision, not Resend)

## E2E spec count

- 4 spec files containing 5 `@messaging`-tagged test blocks (wizard has 1 deeper test).

## Manual checkpoint outcomes — Task 4 (HIPAA)

**Pending — requires OWNER sign-off.** All 9 manual rows in 12-VERIFICATION.md remain `⬜`. See "Resume signal" below.

## Files modified

```
app/(tenant)/[tenant]/settings/messaging/onboarding/page.tsx          (new)
app/api/messaging/onboarding/provision-number/route.ts                (new)
app/api/messaging/onboarding/seed-templates/route.ts                  (new)
app/api/messaging/onboarding/test-send/route.ts                       (new)
app/api/messaging/onboarding/activate/route.ts                        (new)
app/api/messaging/compliance-report/route.ts                          (new)
backend/services/messaging/seeds.py                                   (new)
backend/services/messaging/compliance_report.py                       (new)
backend/api/routes/messaging.py                                       (extended)
components/messaging/wizard/{types,Step1..Step7}.tsx                  (new — 8 files)
lib/api/messaging.ts                                                  (extended)
tests/e2e/fixtures/messaging.ts                                       (rewritten — stubs → real)
tests/e2e/messaging-wizard.spec.ts                                    (new)
tests/e2e/recall-queue.spec.ts                                        (new)
tests/e2e/patient-messages-tab.spec.ts                                (new)
tests/e2e/messaging-analytics.spec.ts                                 (new)
.planning/phases/12-crm-patient-engagement/12-VERIFICATION.md         (new)
```

## Resume signal — what's left before Phase 12 can close

Task 4 of this plan is a HIPAA-critical human checkpoint that **only the OWNER can perform** in staging:

1. Set `MESSAGING_TEST_ALLOWLIST` env, walk the wizard at `/{tenant}/settings/messaging/onboarding` in staging on a real Twilio number.
2. Confirm OWNER's phone receives the test SMS and inbox receives the test email; click "I Received Them"; confirm `messaging_enabled = true`.
3. Run M3 (PHI scrubber visual QA), M4 (quiet hours real-clock), M5 (5-recipient bulk on real Twilio), M6 (Compliance PDF download).
4. Confirm M7 (Twilio Messaging Service status callback URL), M8 (Postmark/Resend webhook URL + events), M9 (Twilio BAA active in console).
5. Tick all 9 `M*` rows in `12-VERIFICATION.md`. Tick the 20 CRM rows after running each command in the Phase Gate.
6. Update `STATE.md` with `Phase 12 complete`.

If any M-row fails, file a gap closure plan via `/gsd:plan-phase 12 --gaps` referencing the failure in 12-VERIFICATION.md.
