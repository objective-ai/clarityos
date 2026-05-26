---
phase: 14-optical-order-configuration
plan: 00
subsystem: testing
tags: [pytest, vitest, playwright, test-foundation, fixtures, wave-0, skip-stubs]

# Dependency graph
requires:
  - phase: 14-optical-order-configuration
    provides: 14-CONTEXT.md + 14-VALIDATION.md (Per-Task Verification Map) + 14-RESEARCH.md (Wave 0 Gaps §)
  - phase: 13-retail-inventory
    provides: backend/tests/conftest.py + skip-stub idiom (Phase 13-00 SUMMARY)
provides:
  - "5 backend pytest stub files in backend/tests/ (configurator, suggestions, lens-catalog, job-ticket PDF, contract extensions)"
  - "backend/tests/conftest.py extended with 4 new fixtures (lens_type_progressive, lens_material_polycarbonate, lens_coating_ar, optical_order_in_draft)"
  - "4 frontend vitest stub files in tests/contract/ + store/__tests__/"
  - "1 Playwright spec stub (tests/e2e/optical-order-configuration.spec.ts) with 6 scenarios"
  - "vitest.config.ts include extended with store/**/*.test.ts so store unit tests are discoverable"
  - ".planning/REQUIREMENTS.md extended with 18 OPT14 requirement rows + 18 Traceability rows + updated Coverage block"
affects: [14-01, 14-02, 14-03, 14-04, 14-05, 14-08, 14-09, 14-10, 14-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level skip-stub idiom inherited from Phase 13-00: try/except → pytest.skip(allow_module_level=True). Catches ImportError + pydantic Settings ValidationError + any other init failure."
    - "Pytest fixture skip-stubs for Phase 14 ORM models (lens_type_progressive etc.) — Plan 14-01 overwrites with real factories."
    - "vitest store/**/*.test.ts include pattern — first store unit-test file in this codebase."

key-files:
  created:
    - backend/tests/test_optical_order_configuration.py
    - backend/tests/test_optical_suggestions.py
    - backend/tests/test_lens_catalog.py
    - backend/tests/test_job_ticket_pdf.py
    - tests/contract/lens-catalog.test.ts
    - tests/contract/optical-order-configurator.test.ts
    - tests/contract/order-detail-drawer.test.ts
    - tests/e2e/optical-order-configuration.spec.ts
    - store/__tests__/opticalOrderConfigStore.test.ts
    - .planning/phases/14-optical-order-configuration/14-00-SUMMARY.md
  modified:
    - backend/tests/conftest.py
    - backend/tests/test_optical_order_contract.py
    - vitest.config.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Added store/**/*.test.ts to vitest.config.ts include pattern. Plan 14-08 lands the first store unit test in this codebase (opticalOrderConfigStore.test.ts); without the pattern, vitest reports 'No test files found' and the plan's verify command silently no-ops."
  - "Reused the Phase 13-00 try/except → pytest.skip(allow_module_level=True) idiom for all 4 new backend test files. Plan 14-01..14-05 modules don't exist yet so pytest.importorskip would not work — the broad except catches both ImportError (module not yet created) and Settings ValidationError (env vars not set)."
  - "Wrote skip-stub fixtures (lens_type_progressive etc.) directly into conftest.py alongside the existing Phase 13 fixtures rather than a sibling conftest_phase14.py. Keeps fixture discovery centralized and matches Phase 13-00 precedent."

patterns-established:
  - "Phase-named skip-stub: each pytest.skip() reason names the implementing plan (e.g., 'Phase 14-03 — implement after configurator PATCH endpoint') so grep finds the exact wave that will replace each stub."
  - "Module-level guard at the top of every new pytest file references the plan that lands the import target. When that plan runs, the import succeeds and skip-stubs in the body start to execute (and continue to skip until their per-test message is removed)."

requirements-completed: []  # OPT14-01..OPT14-18 are tracked but pending; Plan 14-00 only scaffolds the test files and requirement rows — no requirement is implemented here.

# Metrics
duration: ~25min
completed: 2026-05-26
---

# Phase 14 Plan 00: Optical Order Configuration Test Foundation Summary

**5 backend pytest stubs + 4 frontend test stubs + 4 new conftest fixtures + 18 OPT14 requirement rows. Every Plan 14-01..14-11 verify block now resolves to a real file on disk.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-26T12:15Z
- **Completed:** 2026-05-26T12:40Z
- **Tasks:** 3
- **Files created:** 10
- **Files modified:** 4

## Accomplishments
- Every Phase 14 downstream plan has a runnable pytest/vitest/Playwright target — no `<verify>` block will hit "file not found"
- All 5 backend test files skip cleanly (module-level guard fires on missing Phase 14 imports) — 0 ERRORs at collection
- All 4 frontend vitest stubs + 1 Playwright spec compile under tsc and report 15 skipped / 0 failures
- REQUIREMENTS.md grew from 123 → 141 total requirements; the 18 OPT14 rows are linked into Traceability and Coverage updated
- Zero implementation code touched (clinical.py, routes, schemas, components, stores untouched)

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend pytest skip-stubs + conftest fixtures** — `963afc6` (test)
2. **Task 2: Frontend vitest + Playwright skip-stubs** — `1b1f13e` (test)
3. **Task 3: Append OPT14-01..OPT14-18 to REQUIREMENTS.md** — `160a12f` (docs)

**Plan metadata:** _committed alongside this SUMMARY_

## Files Created
- `backend/tests/test_optical_order_configuration.py` — 6 skip-stub functions covering OPT14-01/04/05 + Pitfall 7/11
- `backend/tests/test_optical_suggestions.py` — 6 skip-stub functions covering OPT14-07 + Pitfall 3
- `backend/tests/test_lens_catalog.py` — 5 skip-stub functions covering OPT14-03/08
- `backend/tests/test_job_ticket_pdf.py` — 3 skip-stub functions covering OPT14-06/10
- `tests/contract/lens-catalog.test.ts` — 3 it.skip blocks for LensType/Material/Coating contracts
- `tests/contract/optical-order-configurator.test.ts` — 6 it.skip blocks for OPT14-17 OpticalOrderResponse keys
- `tests/contract/order-detail-drawer.test.ts` — 3 it.skip blocks for routing logic + permission gate
- `tests/e2e/optical-order-configuration.spec.ts` — 6 test.skip Playwright scenarios for OPT14-18 master flow
- `store/__tests__/opticalOrderConfigStore.test.ts` — 3 it.skip blocks for OPT14-12 debounce + flush-on-blur

## Files Modified
- `backend/tests/conftest.py` — appended 4 Phase 14 fixtures as skip-stubs
- `backend/tests/test_optical_order_contract.py` — appended 2 Phase 14 contract tests (OPT14-17 OpticalOrderResponse + LineItemResponse)
- `vitest.config.ts` — added `store/**/*.test.ts` to include pattern
- `.planning/REQUIREMENTS.md` — Phase 14 section + 18 OPT14 bullets + 18 Traceability rows + Coverage block update

## Decisions Made

1. **Updated `vitest.config.ts` include to cover `store/**/*.test.ts`.** Phase 14-08 lands the first unit test under `store/__tests__/`. Without the pattern, vitest reports "No test files found, exiting with code 1" even when given the file path directly. Adding the pattern is in scope per the plan's verify command (`npx vitest run … store/__tests__/opticalOrderConfigStore.test.ts`) — without it Task 2's verify silently no-ops.
2. **Reused Phase 13-00's defensive try/except guard** instead of `pytest.importorskip`. Every Phase 14 backend module the new tests target (`lens_catalog`, `optical_suggestions`, `job_ticket_pdf`) does not yet exist; `importorskip` would raise `ImportError` correctly here, but the broader try/except also handles the Settings ValidationError pattern Phase 13-00 hit when `backend.core.config` is imported transitively without env vars set.
3. **Dropped the unused `page` param from one Playwright stub** (`autosave triggers PATCH after 1.5s + on blur`) to satisfy `npx tsc --noEmit` TS6133. Other smoke-spec TS6133 warnings exist project-wide but are pre-existing and out of scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added `store/**/*.test.ts` to `vitest.config.ts` include pattern**
- **Found during:** Task 2 verification
- **Issue:** `npx vitest run store/__tests__/opticalOrderConfigStore.test.ts` failed with `No test files found, exiting with code 1`. The existing include pattern (`tests/**/*.test.ts`, `tests/**/*.test.tsx`, `lib/**/*.test.ts`) didn't match `store/__tests__/`.
- **Fix:** Added `store/**/*.test.ts` as a fourth entry in `vitest.config.ts` `test.include`.
- **Files modified:** `vitest.config.ts`
- **Verification:** Re-running the verify command lists all 4 frontend test files (`Test Files 4 skipped (4) | Tests 15 skipped (15)`).
- **Committed in:** `1b1f13e` (Task 2 commit)

**2. [Rule 2 — Missing Critical] Removed unused Playwright fixture param**
- **Found during:** `npx tsc --noEmit` post-Task 2
- **Issue:** TS6133 on `tests/e2e/optical-order-configuration.spec.ts:15:70` — `'page' is declared but its value is never read`. The autosave test only needed `apiCalls`.
- **Fix:** Dropped `page` from the destructure on that one test, leaving `({ apiCalls }) => ...`.
- **Files modified:** `tests/e2e/optical-order-configuration.spec.ts`
- **Verification:** `npx tsc --noEmit` reports zero errors in any Phase 14 file (the pre-existing TS6133 warnings in `smoke-*.spec.ts` are not Phase 14 introductions).
- **Committed in:** `1b1f13e` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes were necessary to satisfy the plan's own verify commands. No scope creep — no production code touched.

## Issues Encountered
- None beyond the deviations above.

## User Setup Required
None — no external service configuration required.

## Self-Check: PASSED

- Files: all 10 created files exist on disk; all 4 modified files have Phase 14 additions
- Commits: `963afc6`, `1b1f13e`, `160a12f` all exist in `git log`
- Verify commands:
  - `cd backend && pytest tests/test_optical_order_configuration.py tests/test_optical_suggestions.py tests/test_lens_catalog.py tests/test_job_ticket_pdf.py tests/test_optical_order_contract.py -v` → 8 skipped (4 module-level + 4 body-level), 0 ERRORS
  - `npx vitest run tests/contract/ store/__tests__/opticalOrderConfigStore.test.ts` → 4 files, 15 tests, all skipped, 0 failures
  - `npx playwright test tests/e2e/optical-order-configuration.spec.ts --list` → 6 tests listed
  - `npx tsc --noEmit` → no new errors in Phase 14 files
  - `grep -c "^- \[ \] \*\*OPT14-" .planning/REQUIREMENTS.md` → 18
  - `grep -cE "\| OPT14-..? \| Phase 14 \| Pending \|" .planning/REQUIREMENTS.md` → 18

## Next Phase Readiness
- **14-01** (ORM + Alembic migration 0019 + permissions/audit enum extensions) can now run with the conftest fixtures resolving cleanly: it will define `LensType`/`LensMaterial`/`LensCoating` ORM, replace the 4 conftest skip-stubs with real factories, and add the 6 OpticalOrder/LineItem columns. Once landed, `test_optical_order_response_contract_phase14_keys` and `test_optical_order_line_item_contract_lens_config` will start executing.
- **14-02** (lens catalog routes) targets `test_create_lens_type`, `test_create_lens_material`, `test_create_lens_coating`, `test_partial_unique_index_allows_inactive_duplicate`, `test_soft_delete_keeps_history`. Module-level guard fires until `backend.api.routes.lens_catalog` exists.
- **14-03** (configurator PATCH + extended place) targets `test_draft_creation_prefills_rx`, `test_patch_vision_plan_persists`, `test_patch_rejected_when_status_not_draft`, `test_place_validates_seg_height_for_progressive`, `test_place_validates_vertex_for_requires_vertex_lens`, `test_place_validation_runs_before_row_lock`.
- **14-04** (AI suggestion extractor) targets all 6 functions in `test_optical_suggestions.py`. The deterministic keyword scanner is a pure function — no DB session needed.
- **14-05** (job ticket PDF) targets all 3 functions in `test_job_ticket_pdf.py`.
- **14-08** (FE stores) targets all 3 functions in `store/__tests__/opticalOrderConfigStore.test.ts`.
- **14-11** (Playwright E2E phase closer) replaces all 6 `test.skip` blocks in `tests/e2e/optical-order-configuration.spec.ts` with real `loginOrRestore()` + queue-card navigation flows.

---
*Phase: 14-optical-order-configuration*
*Completed: 2026-05-26*
