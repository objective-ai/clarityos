---
phase: 13-retail-inventory
plan: 04
subsystem: api
tags: [fastapi, sqlalchemy, asyncpg, inventory, audit, rbac, entitlements, primary-txn]

# Dependency graph
requires:
  - phase: 13-01
    provides: Product + InventoryTransaction ORM + AuditAction.PRODUCT_*/STOCK_* values
  - phase: 13-02
    provides: ClinicalAction.VIEW_INVENTORY/MANAGE_INVENTORY + Entitlement.RETAIL_POS
  - phase: 13-03
    provides: ProductCreate/Update/Response + ReceiveStockRequest + AdjustStockRequest schemas
provides:
  - 7 FastAPI route handlers (5 CRUD + receive + adjust) at /api/inventory/products
  - Atomic primary-TXN pattern for stock mutations (Product.stock_qty + InventoryTransaction + log_action in one db.commit())
  - Auto-SKU generation with active-set collision suffix (FR-{BRAND}-{MODEL}-{COLOR}-{EYE} / CL-{BRAND}-{MODEL}-{POWER})
  - JSONB ->> filter pattern for gender (frames) and modality (contacts)
affects: [13-05, 13-06, 13-08, 13-09, 13-10, 13-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Router-level entitlement gate via APIRouter(dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))])"
    - "Atomic primary-TXN stock mutation: Product update + InventoryTransaction insert + log_action all before single db.commit()"
    - "SKU collision suffix loop scoped to active rows (preserves historical SKUs on inactive products)"
    - "JSONB attribute filter via SQLAlchemy ->> operator (Product.attributes[\"gender\"].astext == ...)"

key-files:
  created:
    - backend/api/routes/inventory.py
  modified:
    - backend/main.py

key-decisions:
  - "Used backend.core.security (TenantContext, resolve_staff) to match donor file payer.py — plan reference to backend.core.tenant_context corrected (module does not exist in this repo)"
  - "Imported Entitlement enum and passed Entitlement.RETAIL_POS (typed) instead of bare string — matches require_entitlement() signature accepting str via StrEnum"
  - "Receive blocks inactive products (409); adjust permits them so admins can correct counts on a deactivated SKU"
  - "Adjust rejects qty_delta=0 with 400 (no-op disallowed) — explicit per plan behavior Test 5"
  - "Audit changes={} only when diff is non-empty on PATCH — None passed to log_action for trivial PATCH (no field changed)"

patterns-established:
  - "Phase 13 stock-mutation primary-TXN pattern: Product.stock_qty mutation + db.add(InventoryTransaction(...)) + await db.flush() + await log_action(...) + await db.commit() — Plans 13-05 must mirror for OpticalOrder place/cancel"
  - "Soft-delete idempotency: if !is_active return early on DELETE — no audit row, no commit (avoids audit log noise on repeated deactivation)"
  - "Re-fetch via select(Product).where(Product.id == p.id) after db.commit() — never db.refresh (MissingGreenlet under asyncpg)"

requirements-completed: [INV-01, INV-08, INV-18]

# Metrics
duration: 8min
completed: 2026-05-01
---

# Phase 13 Plan 04: Retail Inventory Routes Summary

**FastAPI inventory router with Product CRUD + atomic stock receive/adjust — Product.stock_qty mutation, InventoryTransaction insert, and clinical-audit log_action all committed in a single primary transaction.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-01T19:30:00Z
- **Completed:** 2026-05-01T19:38:13Z
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 1

## Accomplishments

- 7 route handlers landed at `/api/inventory/products` (GET list, POST create, GET detail, PATCH update, DELETE soft-delete, POST receive, POST adjust)
- Router-level entitlement gate (`Entitlement.RETAIL_POS`) blocks all routes for plans without the add-on
- Reads gated on `VIEW_INVENTORY` (D, T, R, A, O); writes on `MANAGE_INVENTORY` (A, O only)
- Atomicity contract met: receive/adjust each commit `Product.stock_qty` mutation + `InventoryTransaction` row + `AuditAction.STOCK_*` audit row in **one** `db.commit()` — clinical-safety.md compliant
- Auto-SKU generation (FR-/CL- prefix) with active-set collision-resolution suffix (`-2`, `-3`, ...)
- List filters: product_type, search (brand/model ILIKE), stock_status (in_stock/low/out/all), active_only, gender (JSONB ->>), modality (JSONB ->>)
- All audit emissions: `PRODUCT_CREATE`, `PRODUCT_UPDATE` (with field-level diff), `PRODUCT_DEACTIVATE`, `STOCK_RECEIVE` (with stock_qty delta), `STOCK_ADJUST` (with stock_qty delta)

## Task Commits

1. **Task 1: Inventory CRUD routes — list/create/get/patch/delete** — `0af44ea` (feat)
2. **Task 2: Stock-mutation routes (receive + adjust) + router registration** — `6bb9f34` (feat)

_Note: TDD tasks ran without RED-first commits because Wave 0 stub bodies are `pytest.skip` until phase verification (per plan: "Implementing the test bodies is OUT OF SCOPE for this task — the stubs remain pytest.skip until phase verification"). The Wave 0 stubs (`test_product_create_writes_audit_row`, `test_receive_stock_writes_audit`) collected cleanly after each task as the smoke gate._

## Files Created/Modified

- `backend/api/routes/inventory.py` (created) — 7 route handlers + `_product_response`, `_generate_sku`, `_resolve_sku_collision` helpers
- `backend/main.py` (modified) — Added `inventory` to route-imports tuple, registered `inventory.router` at `/api/inventory/products` with `tags=["Inventory"]` (after `optical` block)

## Decisions Made

- **Module-path correction (Rule 3):** Plan referenced `backend.core.tenant_context` for `TenantContext`/`resolve_staff` imports, but those symbols live in `backend.core.security` (verified by grep against repo + donor file `payer.py` line 18). Used the canonical path. No new module created.
- **Typed entitlement key:** Imported `Entitlement` enum and passed `Entitlement.RETAIL_POS` to `require_entitlement(...)` instead of the literal `"retail_pos"` string. `Entitlement` is a `StrEnum` so the dependency factory handles either, but the typed form prevents typo regressions and matches how `Entitlement.MESSAGING` is used in Phase 12 messaging routes.
- **Diff-only audit changes:** PATCH passes `changes=changes if changes else None` to `log_action` — avoids logging an empty `{}` diff on no-op PATCH calls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected module path for TenantContext / resolve_staff**
- **Found during:** Task 1 (CRUD route imports)
- **Issue:** Plan `<read_first>` and `<action>` reference `backend.core.tenant_context` for `TenantContext` and `resolve_staff` symbols. That module does not exist in this repo — both symbols are defined in `backend/core/security.py` (line 44 and line 127), as confirmed by donor file `backend/api/routes/payer.py:18` and `backend/core/permissions.py:17`.
- **Fix:** Used `from backend.core.security import TenantContext, resolve_staff` matching the established repo convention.
- **Files modified:** `backend/api/routes/inventory.py`
- **Verification:** Import smoke test exits 0; router instantiates without errors.
- **Committed in:** `0af44ea` (Task 1 commit)

**2. [Rule 1 - Bug] Imported Entitlement enum for typed entitlement key**
- **Found during:** Task 1 (router declaration)
- **Issue:** Plan literal example `Depends(require_entitlement("retail_pos"))` works but loses type safety — a typo (`"retial_pos"`) would be a silent 403-trap at runtime instead of an import-time NameError.
- **Fix:** Imported `Entitlement` enum and passed `Entitlement.RETAIL_POS` (StrEnum coerces to `"retail_pos"` for the existing `has_entitlement(plan_name, key)` lookup).
- **Files modified:** `backend/api/routes/inventory.py`
- **Verification:** Router imports cleanly; behavior identical to literal-string form.
- **Committed in:** `0af44ea` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking module-path correction, 1 type-safety improvement)
**Impact on plan:** Both deviations strictly preserve plan semantics. No scope creep, no behavior drift. The module-path fix is mandatory; the typed-entitlement change is a defensive hardening matching existing project conventions.

## Issues Encountered

None — all verification commands exited 0 on first run after each task. Wave 0 test stubs continued to collect cleanly (30 Phase 13 tests, all skipped or pending, no import errors).

## Selectinload Coverage Audit (m6 acceptance criterion)

Per the m6 acceptance criterion: "every re-fetch `select(...)` after `db.flush()` wraps every relationship traversed by the corresponding response model in `.options(selectinload(...))`."

`ProductResponse` field-by-field audit:
- `id`, `tenant_id`, `product_type`, `brand`, `model`, `sku`, `upc`, `attributes`, `retail_price`, `cost_price`, `stock_qty`, `reorder_threshold`, `is_active`, `created_at`, `updated_at` — all scalar columns on `Product`. **Zero relationships traversed.**
- `Product.transactions` (back-ref to InventoryTransaction) is **not** in `ProductResponse` and is therefore not loaded.

**Result:** No `selectinload(...)` chains needed for any `select(Product).where(Product.id == ...)` re-fetch in this router. The pattern remains documented for future plans (13-05 OpticalOrder will need `selectinload(OpticalOrder.line_items)` since `OpticalOrderResponse` exposes `line_items`).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Inventory primitive ready for **13-05** (Optical Order routes will follow the same atomic primary-TXN pattern: stock decrement on `placed`, restock on `cancel`, both with `InventoryTransaction` rows in the same `db.commit()`)
- Ready for **13-06** (BFF proxy routes — upstream URLs need trailing slashes; all 4 upstream paths confirmed via verification command)
- Ready for **13-08** (seed file can call create endpoint directly or insert ORM rows; either path consistent with the audit-emission contract)
- Ready for **13-09/13-10** (admin Inventory page — store can call all 7 routes; permission gating already enforced)

**Blockers:** None.

## Self-Check: PASSED

Verified:
- `backend/api/routes/inventory.py` exists (FOUND)
- `backend/main.py` modified with inventory router registration (FOUND — `app.include_router(inventory.router, prefix="/api/inventory/products", tags=["Inventory"])`)
- Commit `0af44ea` (Task 1) — FOUND
- Commit `6bb9f34` (Task 2) — FOUND
- Routes at `/api/inventory/products/*` registered in app — VERIFIED via main.py import smoke test (4 unique paths)
- 7 method handlers on router (5 CRUD + 2 stock-mutation) — VERIFIED
- Test stub `test_receive_stock_writes_audit` collects cleanly — VERIFIED

---
*Phase: 13-retail-inventory*
*Completed: 2026-05-01*
