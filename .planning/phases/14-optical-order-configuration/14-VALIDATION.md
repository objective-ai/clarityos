---
phase: 14
slug: optical-order-configuration
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-14
updated: 2026-05-26
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Filled from 14-RESEARCH.md §Validation Architecture; planner updates the Per-Task Verification Map after PLAN.md files are authored.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.x (backend) + vitest 4.x (frontend unit) + Playwright (E2E) |
| **Config file** | `backend/pytest.ini`, `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `cd backend && pytest -x -q tests/test_optical_*.py tests/test_lens_catalog.py tests/test_job_ticket_pdf.py` (backend) / `npx vitest run tests/contract/ store/__tests__/opticalOrderConfigStore.test.ts` (frontend) |
| **Full suite command** | `cd backend && pytest -q` + `npx vitest run` + `bash scripts/dev.sh pre-test && npx playwright test tests/e2e/optical-order-configuration.spec.ts` |
| **Estimated runtime** | ~45 seconds backend, ~20 seconds vitest, ~90 seconds E2E |

---

## Sampling Rate

- **After every task commit:** Run quick command for the affected layer (backend OR frontend).
- **After every plan wave:** Run full backend pytest + vitest (skip E2E until final wave).
- **Before `/gsd:verify-work`:** Full suite (backend + vitest + Playwright E2E) must be green.
- **Max feedback latency:** 60 seconds (quick), 4 minutes (full).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-00-01 | 00 | 1 | OPT14-01..18 (test scaffolding) | unit | `cd backend && pytest tests/test_optical_*.py tests/test_lens_catalog.py tests/test_job_ticket_pdf.py -v` | ❌ W0 (creates) | ✅ |
| 14-00-02 | 00 | 1 | OPT14-01..18 (FE scaffolding) | unit | `npx vitest run tests/contract/ store/__tests__/opticalOrderConfigStore.test.ts` | ❌ W0 (creates) | ✅ |
| 14-00-03 | 00 | 1 | OPT14-01..18 (REQUIREMENTS.md rows) | docs | `grep -c "^- \[ \] \*\*OPT14-" .planning/REQUIREMENTS.md` returns 18 | ❌ W0 | ✅ |
| 14-01-01 | 01 | 2 | OPT14-08 | integration | `alembic upgrade head --sql` (offline DDL verified; live round-trip confirmed) | ❌ W2 (creates) | ✅ |
| 14-01-02 | 01 | 2 | OPT14-08, OPT14-10 | unit | Python ORM import smoke + configure_mappers (no AmbiguousForeignKeysError) | ✅ W2 | ✅ |
| 14-01-03 | 01 | 2 | OPT14-09 | unit | Python assert on PERMISSION_MATRIX[GENERATE_JOB_TICKET]/[MANAGE_LENS_CATALOG] | ✅ W2 | ✅ |
| 14-02-01 | 02 | 3 | OPT14-17 (schemas) | unit | Schema import + by_alias smoke (LensType/Material/Coating Response) | ❌ W3 (creates) | ✅ |
| 14-02-02 | 02 | 3 | OPT14-03, OPT14-09, OPT14-10 | integration | `python -c "from backend.main import app; ..."` 15 lens-catalog routes registered | ❌ W3 (creates) | ✅ |
| 14-02-03 | 02 | 3 | OPT14-17 | unit | `cd backend && pytest tests/test_lens_catalog.py -v` (5 skipped via fixture chain) | ✅ W3 | ✅ |
| 14-03-01 | 03 | 3 | OPT14-17 | unit | `cd backend && pytest tests/test_optical_order_contract.py -v` (2 Phase 14 PASS) | ✅ W3 | ✅ |
| 14-03-02 | 03 | 3 | OPT14-01, OPT14-04, OPT14-05, OPT14-10 | integration | `python -c "from backend.main import app; ..."` PATCH /api/optical-orders/{id}/ registered | ✅ W3 | ✅ |
| 14-03-03 | 03 | 3 | OPT14-01, OPT14-04, OPT14-05 | unit | `cd backend && pytest tests/test_optical_order_configuration.py -v` (6 skipped via fixture chain) | ✅ W3 | ✅ |
| 14-04-01 | 04 | 3 | OPT14-07 | unit | `cd backend && pytest tests/test_optical_suggestions.py -v` (6 PASSED, 0.04s) | ❌ W3 (creates) | ✅ |
| 14-04-02 | 04 | 3 | OPT14-07 | integration | `python -c "from backend.main import app; ..."` 3 suggestion routes registered | ✅ W3 | ✅ |
| 14-04-03 | 04 | 3 | OPT14-07 | unit | (covered by 14-04-01) | ✅ W3 | ✅ |
| 14-05-01 | 05 | 3 | OPT14-06 | unit | `cd backend && pytest tests/test_job_ticket_pdf.py -v` (2 PASSED + 1 integration skipped) | ❌ W3 (creates) | ✅ |
| 14-05-02 | 05 | 3 | OPT14-06, OPT14-09, OPT14-10 | integration | `python -c "from backend.main import app; ..."` POST /job-ticket/ registered | ✅ W3 | ✅ |
| 14-05-03 | 05 | 3 | OPT14-06, OPT14-10 | integration | (covered by 14-05-01 audit assertion — skipped until db_session fixture lands) | ✅ W3 | ✅ |
| 14-06-01 | 06 | 3 | OPT14-14 | unit | Schema import: `OpticalQueueItem.model_fields['draft_order_count']` | ✅ W3 | ✅ |
| 14-06-02 | 06 | 3 | OPT14-11 | seed | `SELECT COUNT(*) FROM lens_types/materials/coatings` = 4/6/7 (verified live) | ✅ W3 | ✅ |
| 14-06-03 | 06 | 3 | OPT14-14 | structural | `test -f .planning/todos/done/2026-05-08-optical-queue-draft-order-indicator.md` | ✅ W3 | ✅ |
| 14-07-01 | 07 | 4 | OPT14-16 | unit | `npx tsc --noEmit` clean; `find app/api/optical-orders -name route.ts` (5 files) | ❌ W4 (creates) | ✅ |
| 14-07-02 | 07 | 4 | OPT14-16 | unit | `npx tsc --noEmit` clean; `find app/api/lens-catalog -name route.ts` (6 files) | ❌ W4 (creates) | ✅ |
| 14-08-01 | 08 | 5 | OPT14-17 | unit | `npx tsc --noEmit` clean (types/opticalOrder.ts + types/lensCatalog.ts) | ✅ W5 | ✅ |
| 14-08-02 | 08 | 5 | OPT14-12 | unit | `npx vitest run store/__tests__/opticalOrderConfigStore.test.ts` (3 PASSED) | ✅ W5 | ✅ |
| 14-08-03 | 08 | 5 | OPT14-12 | unit | (covered by 14-08-02 — same file) | ✅ W5 | ✅ |
| 14-09-01 | 09 | 6 | OPT14-01, OPT14-02, OPT14-12 | unit | `npx tsc --noEmit` clean (configurator route + RxSideBySidePanel + ConfiguratorFooter) | ❌ W6 (creates) | ✅ |
| 14-09-02 | 09 | 6 | OPT14-03, OPT14-04, OPT14-05, OPT14-07 | unit | `npx tsc --noEmit` clean (5 child components) | ❌ W6 (creates) | ✅ |
| 14-09-03 | 09 | 6 | OPT14-17 | unit | `npx vitest run tests/contract/optical-order-configurator.test.ts` (7 PASSED) | ✅ W6 | ✅ |
| 14-09-04 | 09 | 6 | OPT14-02, OPT14-06, OPT14-07 (manual) | manual | Deferred to 14-11-04 (full Phase 14 close-out) | n/a | ⬜ |
| 14-10-01 | 10 | 7 | OPT14-13, OPT14-14 | unit | `npx tsc --noEmit` clean (OpticalQueueCard) | ✅ W7 | ✅ |
| 14-10-02 | 10 | 7 | OPT14-13 | unit | `npx tsc --noEmit` clean (CreateWalkInOrderModal) | ✅ W7 | ✅ |
| 14-10-03 | 10 | 7 | OPT14-13 | unit | `npx tsc --noEmit` clean (OrdersTab) | ✅ W7 | ✅ |
| 14-10-04 | 10 | 7 | OPT14-15 | unit | `npx tsc --noEmit` clean (OrderDetailDrawer) | ✅ W7 | ✅ |
| 14-10-05 | 10 | 7 | OPT14-14 | structural | (Plan 14-06 already archived this todo) | ✅ W3 | ✅ |
| 14-11-01 | 11 | 8 | OPT14-18 fixture | seed | `python backend/seed_db.py` — fixture seeded on Thornton's encounter | ✅ W8 | ✅ |
| 14-11-02 | 11 | 8 | OPT14-01..07, OPT14-13..15, OPT14-18 | e2e | `bash scripts/dev.sh pre-test && npx playwright test tests/e2e/optical-order-configuration.spec.ts` (6 tests listed) | ✅ W8 | ⬜ (requires running servers) |
| 14-11-03 | 11 | 8 | All | docs | This document. nyquist_compliant + wave_0_complete flipped | ✅ W8 | ✅ |
| 14-11-04 | 11 | 8 | OPT14-02, OPT14-06, OPT14-07 (manual) | manual | Human checkpoint — PDF visual + Rx perceptual + chip ghosting verification | n/a | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/tests/test_optical_order_configuration.py` — configurator PATCH + place-validation skip-stubs (Plan 14-00)
- [x] `backend/tests/test_optical_suggestions.py` — AI Scribe extractor skip-stubs (Plan 14-00; real tests in 14-04)
- [x] `backend/tests/test_lens_catalog.py` — lens-catalog CRUD skip-stubs (Plan 14-00; real bodies in 14-02)
- [x] `backend/tests/test_job_ticket_pdf.py` — PDF generation skip-stubs (Plan 14-00; real bodies in 14-05)
- [x] `backend/tests/test_optical_order_contract.py` — extended with Phase 14 contract assertions (Plan 14-00; real assertions in 14-03)
- [x] `tests/contract/lens-catalog.test.ts` — vitest literal-keys assertion skip-stubs (Plan 14-00)
- [x] `tests/contract/optical-order-configurator.test.ts` — OpticalOrderResponse Phase 14 keys (Plan 14-00; real assertions in 14-09)
- [x] `tests/contract/order-detail-drawer.test.ts` — drawer prop-shape skip-stubs (Plan 14-00)
- [x] `tests/e2e/optical-order-configuration.spec.ts` — 6 Playwright scenarios (Plan 14-00 stubs; real spec in 14-11)
- [x] `store/__tests__/opticalOrderConfigStore.test.ts` — store fake-timer test (Plan 14-00 stubs; real assertions in 14-08)
- [x] `backend/tests/conftest.py` — Phase 14 fixture skip-stubs (lens_type_progressive, lens_material_polycarbonate, lens_coating_ar, optical_order_in_draft) (Plan 14-00)

*Backend conftest fixtures `db_session` and `tenant_context` remain Phase 13-00 Wave-0 skip-stubs — a future infrastructure plan should land real async-session + TenantContext factories to unlock ~25 dormant tests across Phases 13 + 14.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Job Ticket PDF visual fidelity | OPT14-06 / OPT14-18 | PDF rendering aesthetics — automated test only verifies byte presence and field substrings; visual layout requires human eye | 1. Configure + place test order. 2. Click "Generate Job Ticket". 3. Open PDF in viewer. 4. Verify (a) header has clinic name/NPI, (b) Rx columns aligned, (c) measurements grid legible, (d) page does NOT overflow to page 2 for standard cases. |
| Side-by-side Rx perceptual clarity | OPT14-02 | Subjective readability for patient-explanation scenario | 1. Open configurator with seeded patient who has both habitual + final refractions. 2. Visually confirm columns align row-by-row. 3. Confirm delta-flag row highlights any >±0.50D divergence. |
| AI suggestion ghosting visibility | OPT14-07 / OPT14-17 | UX-perception check that ghosted placeholder is distinguishable from filled values but clearly accept-able | 1. Open configurator for encounter with saved structured AI JSON. 2. Verify ✨ chip appears next to lens-type field. 3. Click ✨ → field fills + chip dismisses. 4. Open second affected field, click × dismiss → chip vanishes, no field fill. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Per-Task Verification Map populated)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (manual-only marked explicitly)
- [x] Wave 0 covers all MISSING references (Plan 14-00 created 11 test files)
- [x] No watch-mode flags
- [x] Feedback latency < 60s for quick / 240s for full
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved by planner — 2026-05-26
