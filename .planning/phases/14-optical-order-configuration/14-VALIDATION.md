---
phase: 14
slug: optical-order-configuration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Filled from 14-RESEARCH.md §Validation Architecture; planner updates the Per-Task Verification Map after PLAN.md files are authored.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (backend) + vitest 1.x (frontend unit) + Playwright (E2E) |
| **Config file** | `backend/pytest.ini`, `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `cd backend && pytest -x -q tests/test_optical_order*.py tests/test_lens_catalog*.py` (backend) / `npx vitest run tests/contract/optical-order*.test.ts` (frontend) |
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

> Planner fills this after authoring 14-XX-PLAN.md files. Each plan task contributes one row.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | OPT14-08..12 (schema) | unit | `cd backend && pytest -q tests/test_optical_models.py` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | OPT14-13 (lens catalog) | unit + contract | `cd backend && pytest -q tests/test_lens_catalog_routes.py tests/test_lens_catalog_contract.py` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 2 | OPT14-14..16 (configurator routes) | integration | `cd backend && pytest -q tests/test_optical_order_configure.py` | ❌ W0 | ⬜ pending |
| 14-04-01 | 04 | 2 | OPT14-17 (AI suggestions extractor) | unit | `cd backend && pytest -q tests/test_optical_ai_extractor.py` | ❌ W0 | ⬜ pending |
| 14-05-01 | 05 | 2 | OPT14-18 (job ticket PDF) | unit | `cd backend && pytest -q tests/test_job_ticket_pdf.py` | ❌ W0 | ⬜ pending |
| 14-06-01 | 06 | 3 | OPT14-08..18 (configurator UI) | unit | `npx vitest run tests/contract/optical-order-configurator.test.ts` | ❌ W0 | ⬜ pending |
| 14-07-01 | 07 | 3 | OPT14-19 (OrderDetailDrawer + queue pill) | unit | `npx vitest run tests/contract/order-detail-drawer.test.ts` | ❌ W0 | ⬜ pending |
| 14-08-01 | 08 | 4 | OPT14-01..07 (E2E full flow) | e2e | `npx playwright test tests/e2e/optical-order-configuration.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner: regenerate this table to match the actual plan/task IDs you create. The 8-row sketch above is illustrative of the wave layout suggested by 14-RESEARCH.md (~10-12 plans).*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_optical_models.py` — schema-shape unit tests for new columns + JSONB defaults
- [ ] `backend/tests/test_lens_catalog_routes.py` — CRUD + permission tests for new lens-catalog endpoints
- [ ] `backend/tests/test_lens_catalog_contract.py` — Pydantic `by_alias` snapshot tests (LensType/Material/Coating)
- [ ] `backend/tests/test_optical_order_configure.py` — configurator PATCH + place-validation tests
- [ ] `backend/tests/test_optical_ai_extractor.py` — deterministic keyword-scan tests with seeded AI summary fixtures
- [ ] `backend/tests/test_job_ticket_pdf.py` — PDF generation tests (byte non-empty, contains expected blocks, content-type)
- [ ] `tests/contract/optical-order-configurator.test.ts` — TS literal-keys assertion matching `OpticalOrderResponse` snapshot
- [ ] `tests/contract/order-detail-drawer.test.ts` — drawer prop-shape and routing test
- [ ] `tests/e2e/optical-order-configuration.spec.ts` — full E2E flow: queue → configure → place → generate ticket → verify history
- [ ] `backend/tests/conftest.py` — extend with `lens_type_fixture`, `lens_material_fixture`, `lens_coating_fixture` if absent

*Backend conftest fixtures `db_session` and `tenant_context` already exist (Phase 13-00); reuse.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Job Ticket PDF visual fidelity | OPT14-06 / OPT14-18 | PDF rendering aesthetics — automated test only verifies byte presence and field substrings; visual layout requires human eye | 1. Configure + place test order. 2. Click "Generate Job Ticket". 3. Open PDF in viewer. 4. Verify (a) header has clinic name/NPI, (b) Rx columns aligned, (c) measurements grid legible, (d) page does NOT overflow to page 2 for standard cases. |
| Side-by-side Rx perceptual clarity | OPT14-02 | Subjective readability for patient-explanation scenario | 1. Open configurator with seeded patient who has both habitual + final refractions. 2. Visually confirm columns align row-by-row. 3. Confirm delta-flag row highlights any >±0.50D divergence. |
| AI suggestion ghosting visibility | OPT14-07 / OPT14-17 | UX-perception check that ghosted placeholder is distinguishable from filled values but clearly accept-able | 1. Open configurator for encounter with saved structured AI JSON. 2. Verify ✨ chip appears next to lens-type field. 3. Click ✨ → field fills + chip dismisses. 4. Open second affected field, click × dismiss → chip vanishes, no field fill. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (planner populates Per-Task Verification Map)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (8 files above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for quick / 240s for full
- [ ] `nyquist_compliant: true` set in frontmatter (after planner completes Per-Task Verification Map)

**Approval:** pending
