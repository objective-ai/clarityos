---
phase: 13-retail-inventory
plan: 00
subsystem: testing
tags: [pytest, vitest, playwright, test-foundation, fixtures, wave-0]

# Dependency graph
requires:
  - phase: 13-retail-inventory
    provides: 13-CONTEXT.md (Phase 13 boundaries) + 13-VALIDATION.md (per-task verify map) + 13-RESEARCH.md (atomicity + Pitfall 1 JSONB casing)
provides:
  - "Six pytest stub files in backend/tests/ covering INV-03/06/07/09/10/11/12/13/14/16/17/18/19"
  - "backend/tests/conftest.py with product_factory, optical_order_factory, inventory_transaction_factory + db_session/tenant_context skip-stubs"
  - "Two vitest stub files (productAttributesRoundTrip + inventoryStore) for INV-06/13/14"
  - "One Playwright spec (retail-inventory.spec.ts) with 6 scenarios for INV-01/02/03/04/05/10/12/14/15"
  - "Concrete <automated> command target for every Wave 1+ task in 13-VALIDATION.md"
affects: [13-01, 13-02, 13-03, 13-04, 13-05, 13-06, 13-07, 13-08, 13-09, 13-10, 13-12, 13-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 skip-stub: pytest.skip / expect.fail / test.skip with explicit Wave-N implementation message"
    - "Module-level defensive guard: try/except → pytest.skip(allow_module_level=True) for backend modules whose import fails when env vars are absent"
    - "db_session / tenant_context fixtures defined as pytest.skip stubs in conftest so Wave-1 tests skip cleanly until real fixtures land"

key-files:
  created:
    - backend/tests/test_inventory_atomicity.py
    - backend/tests/test_optical_order_lifecycle.py
    - backend/tests/test_optical_queue_rollup.py
    - backend/tests/test_inventory_permissions.py
    - backend/tests/test_optical_order_contract.py
    - backend/tests/test_seed_inventory.py
    - backend/tests/conftest.py
    - tests/unit/productAttributesRoundTrip.test.ts
    - tests/unit/inventoryStore.test.ts
    - tests/e2e/retail-inventory.spec.ts
  modified: []

key-decisions:
  - "Replaced pytest.importorskip with try/except → pytest.skip(allow_module_level=True) for permissions + optical-routes modules. importorskip only catches ImportError, but those modules instantiate Settings() at import which raises pydantic.ValidationError without env vars. The defensive guard keeps collection green in both states (env-set and env-absent)."
  - "Added db_session and tenant_context as Wave-0 skip-stub fixtures in conftest.py. Without them every test that depends on them ERRORs during fixture resolution before pytest.skip in the body can run. Wave 1 will replace them with real async-session + TenantContext implementations."
  - "Added a fourth `retail_pos entitlement gate` it() block in inventoryStore.test.ts so 13-VALIDATION.md row 13-02 (`-t retail_pos`) has a real test name to filter against; the plan's <action> only listed three blocks but the VALIDATION map needs a fourth."

patterns-established:
  - "Skip-stub-with-message: every Wave-0 stub names the implementing wave + plan in its skip reason (e.g., 'Wave 2 (13-06) — implement after place handler exists'). This makes the implementing plan trivially discoverable via grep."
  - "Lazy ORM import in factory fixtures: factories `from backend.db.models.tenant.clinical import Product` inside the inner _make() body so collection never fails before Wave 1 lands the model."

requirements-completed: [INV-13]

# Metrics
duration: 5min
completed: 2026-05-01
---

# Phase 13 Plan 00: Retail Inventory Test Foundation Summary

**Six pytest stubs + three FE test stubs + extended conftest with three factory fixtures, all wired to Wave 1+ implementation hooks via skip-with-message pattern.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-01T19:25:09Z
- **Completed:** 2026-05-01T19:30:00Z
- **Tasks:** 2
- **Files created:** 10
- **Files modified:** 0

## Accomplishments
- Every Wave 1+ task in `13-VALIDATION.md` now resolves to a concrete failing test on disk
- `pytest --collect-only` exits 0 across all six new BE files (14 tests collected; 2 module-level skips for files behind defensive import guards)
- `vitest run` collects + parses both new FE files (6 tests, all `expect.fail` per plan)
- `playwright --list` enumerates all 6 e2e scenarios
- `conftest.py` exposes `product_factory`, `optical_order_factory`, `inventory_transaction_factory` plus Wave-0 skip-stubs for `db_session` and `tenant_context`
- Zero production code touched (clinical.py, routes, schemas, components untouched)

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend pytest stubs + conftest fixtures** — `5c3b25b` (test)
2. **Task 2: Frontend vitest stub + Playwright E2E spec stub** — `6f3df51` (test)

**Plan metadata:** _added in final commit after this SUMMARY_

## Files Created
- `backend/tests/test_inventory_atomicity.py` — INV-03/06/07/10/11/12 atomicity stubs (8 tests)
- `backend/tests/test_optical_order_lifecycle.py` — INV-09/10 lifecycle stubs (3 tests)
- `backend/tests/test_optical_queue_rollup.py` — INV-16 rollup stubs (2 tests, module-level skip guard)
- `backend/tests/test_inventory_permissions.py` — INV-08/14/18/19 stubs (6 tests, module-level skip guard)
- `backend/tests/test_optical_order_contract.py` — INV-13 by_alias contract stubs + EXPECTED_*_RESPONSE_KEYS sets (2 tests)
- `backend/tests/test_seed_inventory.py` — INV-17 seed stub (1 test)
- `backend/tests/conftest.py` — three async factory fixtures + db_session/tenant_context skip-stubs
- `tests/unit/productAttributesRoundTrip.test.ts` — INV-06 / INV-13 JSONB round-trip stub (2 it blocks)
- `tests/unit/inventoryStore.test.ts` — store happy-path + retail_pos gate stubs (4 it blocks)
- `tests/e2e/retail-inventory.spec.ts` — 6 e2e scenarios covering INV-01/02/03/04/05/10/12/14/15

## Decisions Made

1. **Defensive import guards instead of `pytest.importorskip`.** Two of the three target modules (`backend.core.permissions`, `backend.api.routes.optical`) chain-import `backend.core.config` which instantiates `Settings()` at import time. Without env vars present this raises `pydantic.ValidationError`, which `pytest.importorskip` does not catch (it only catches `ImportError`). Switched to a `try: __import__(…) except Exception → pytest.skip(allow_module_level=True)` pattern so collection stays green regardless of env state.
2. **`db_session` and `tenant_context` defined as Wave-0 skip stubs in conftest.** Without these fixtures defined, every test that requests them ERRORs during fixture resolution before `pytest.skip("Wave N — …")` in the test body can execute. Wave 1 (the first plan that needs a real DB session) will replace these stubs with the real async-session + TenantContext implementations; at that point, every Phase 13 test currently calling `pytest.skip` in its body will start to *attempt* the real assertion (and continue to skip with a per-test message until its implementing wave lands).
3. **Added a fourth `inventoryStore.test.ts` it block (`retail_pos entitlement gate`).** The plan's `<action>` listed three blocks, but `13-VALIDATION.md` row 13-02 references `npx vitest run … -t retail_pos`. Without a test whose name contains `retail_pos`, that filter would match nothing. The fourth `it("retail_pos entitlement gate hides createProduct calls when add-on absent")` block satisfies the VALIDATION command without exceeding scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Switched from `pytest.importorskip` to defensive try/except guard for two modules**
- **Found during:** Task 1 verification
- **Issue:** `pytest.importorskip("backend.core.permissions", reason=…)` raised `pydantic_core._pydantic_core.ValidationError: 6 validation errors for Settings` instead of skipping, because `Settings()` is instantiated at module import time and the test environment has no `.env`. Same problem with `backend.api.routes.optical`. Result: two collection ERRORs.
- **Fix:** Replaced both `pytest.importorskip(...)` calls with `try: __import__(...) except Exception as exc: pytest.skip(f"…({type(exc).__name__})", allow_module_level=True)`. This handles ImportError (Wave 1 ORM not yet added) AND ValidationError (env vars not set) AND any other future init failure.
- **Files modified:** `backend/tests/test_optical_queue_rollup.py`, `backend/tests/test_inventory_permissions.py`
- **Verification:** `pytest --collect-only -q` exits 0, 14 tests collected.
- **Committed in:** `5c3b25b` (Task 1 commit, before commit was finalized)

**2. [Rule 3 — Blocking] Added `db_session` and `tenant_context` as Wave-0 skip-stub fixtures**
- **Found during:** Task 1 verification (after fixing #1)
- **Issue:** Running tests (not just collecting) produced 12 ERRORs (`fixture 'db_session' not found`) on every test using the fixture, because `pytest.skip(...)` in the test body never runs if pytest can't resolve the fixture.
- **Fix:** Added two fixtures in `backend/tests/conftest.py` whose body is exactly `pytest.skip("Wave 0 stub — db_session fixture lands in Wave 1 …")`. This converts the 12 ERRORs into 12 SKIPs. Wave 1 (the first plan that actually needs a DB session) will overwrite these with real implementations.
- **Files modified:** `backend/tests/conftest.py`
- **Verification:** `pytest tests/test_inventory_atomicity.py tests/test_optical_order_lifecycle.py tests/test_optical_queue_rollup.py tests/test_inventory_permissions.py tests/test_optical_order_contract.py tests/test_seed_inventory.py` → `16 skipped in 0.84s` (zero errors).
- **Committed in:** `5c3b25b` (Task 1 commit, before commit was finalized)

**3. [Rule 2 — Missing Critical] Added 4th `it()` block in inventoryStore.test.ts to satisfy 13-VALIDATION.md filter**
- **Found during:** Task 2 plan-vs-VALIDATION cross-check
- **Issue:** Plan `<action>` listed 3 it() blocks, but 13-VALIDATION.md row 13-02 specifies `npx vitest run tests/unit/inventoryStore.test.ts -t retail_pos`. Without an it-block name containing `retail_pos`, the `-t` filter would resolve to zero tests and the verify command would silently no-op.
- **Fix:** Added a 4th `it("retail_pos entitlement gate hides createProduct calls when add-on absent")` block (also `expect.fail`).
- **Files modified:** `tests/unit/inventoryStore.test.ts`
- **Verification:** `npx vitest run tests/unit/inventoryStore.test.ts -t retail_pos --reporter=default` matches and runs the new block.
- **Committed in:** `6f3df51` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical)
**Impact on plan:** All three auto-fixes were necessary for the plan's own success criteria (`pytest --collect-only` exit 0; tests skip cleanly; VALIDATION map filter resolves to a real test). No scope creep — no production code touched.

## Issues Encountered
- None beyond the deviations above.

## User Setup Required
None — no external service configuration required.

## Self-Check: PASSED

- Files: all 10 created files exist on disk
- Commits: `5c3b25b` and `6f3df51` exist in `git log`
- Verify commands:
  - `cd backend && pytest tests/test_inventory_atomicity.py … --collect-only -q` → exit 0, 14 tests collected
  - `cd backend && pytest tests/test_inventory_atomicity.py …` → 16 skipped, 0 errors
  - `npx vitest run tests/unit/productAttributesRoundTrip.test.ts tests/unit/inventoryStore.test.ts` → 6 fail (expect.fail), 2 files collected
  - `npx playwright test tests/e2e/retail-inventory.spec.ts --list` → 6 tests listed

## Next Phase Readiness
- **13-01** (Product/OpticalOrder/InventoryTransaction ORM + migration) can now run and target the precise stub function names: `test_product_create_with_attrs`, `test_sku_partial_unique`, `test_sku_unique_only_when_active`, `test_order_create_draft`, `test_walkin_no_encounter`. After 13-01 lands the ORM, replace those `pytest.skip` lines with real assertions; the factories in conftest will resolve their lazy imports and start creating rows.
- **13-02** (permissions + entitlement) targets `test_view_inventory_in_matrix_for_all_roles`, `test_manage_inventory_owner_admin_only`, `test_cancel_optical_order_owner_admin_only`, `test_retail_pos_entitlement_key`. The module-level skip guard auto-resolves once `backend.core.permissions` imports cleanly with the new ClinicalAction values.
- **13-03** (Pydantic schemas) targets `test_product_response_camel_keys`, `test_optical_order_response_camel_keys` against the `EXPECTED_*_RESPONSE_KEYS` sets defined here.
- **Wave 1 must also land real `db_session` and `tenant_context` fixtures** in `backend/tests/conftest.py` (replacing the Wave-0 skip stubs) so atomicity + lifecycle + audit tests can execute against a real session.

---
*Phase: 13-retail-inventory*
*Completed: 2026-05-01*
