---
phase: 13-retail-inventory
plan: 01
subsystem: database
tags: [alembic, sqlalchemy, postgres, jsonb, partial-unique-index, orm, audit-action]

# Dependency graph
requires:
  - phase: 13-retail-inventory
    provides: "Wave 0 stub tests in backend/tests/test_optical_*.py + test_inventory_*.py (importorskip on backend.db.models.tenant.clinical)"
provides:
  - "Migration 0017_retail_inventory.py — products, optical_orders, optical_order_line_items, inventory_transactions"
  - "Partial unique index uq_products_active_sku ON (tenant_id, sku) WHERE is_active=true"
  - "Product / OpticalOrder / OpticalOrderLineItem / InventoryTransaction ORM classes"
  - "9 new AuditAction enum values (PRODUCT_*, STOCK_*, OPTICAL_ORDER_*)"
  - "ProductType / OrderStatus / InventoryReason Python enums"
  - "Encounter.optical_orders back-relationship for INV-16 rollup"
affects: [13-02-permissions-entitlements, 13-03-pydantic-schemas, 13-04-be-inventory-routes, 13-05-be-optical-order-routes, 13-07-encounter-rollup, 13-08-seed]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSONB server_default via sa.text() to avoid SQLAlchemy double-quoting"
    - "Partial unique index on (tenant_id, sku) WHERE is_active=true (mirrors PatientInsurance from Phase 10.1)"
    - "VARCHAR + CHECK constraints for enum-like columns (per backend-python.md)"
    - "Enum extension via Python class only — audit_log.action is VARCHAR(50), no ALTER TYPE needed"
    - "Append-only InventoryTransaction with signed delta (negative=decrement, positive=increment)"

key-files:
  created:
    - backend/alembic/versions/0017_retail_inventory.py
  modified:
    - backend/db/models/tenant/clinical.py

key-decisions:
  - "JSONB server_default uses sa.text(\"'{}'::jsonb\") instead of bare string — bare string gets double-quoted by asyncpg driver into ''{}''::jsonb (invalid JSON)"
  - "Used Encounter.optical_orders back-relationship (no explicit lazy=) to mirror addenda peer; OpticalOrder.line_items uses lazy='selectin' to support INV-16 rollup queries"
  - "OpticalOrder.created_by relationship added with explicit foreign_keys=[created_by_id] to avoid ambiguity (Staff has multiple FKs from Encounter)"
  - "ProductType/OrderStatus/InventoryReason as plain (str, enum.Enum) — matches existing AuditAction style; not used as SQLAlchemy column types (CHECK constraints enforce values)"

patterns-established:
  - "Partial unique index pattern for soft-delete uniqueness — applied here to (tenant_id, sku); preserves historical SKUs for cancelled orders"
  - "Enum-extension migrations are Python-only when target column is VARCHAR — saves ALTER TYPE round-trips and matches established Phase 9/12 pattern"

requirements-completed: [INV-06, INV-07, INV-09, INV-18]

# Metrics
duration: ~25min
completed: 2026-05-01
---

# Phase 13 Plan 01: Retail Inventory ORM Foundation Summary

**4 retail-inventory tables (products, optical_orders, line_items, inventory_transactions) with partial-unique-SKU index and ORM classes — unblocks all Wave 1+ tasks.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-01T19:24:13Z (orchestrator dispatch)
- **Completed:** 2026-05-01T19:31:23Z
- **Tasks:** 2
- **Files modified:** 1 created + 1 modified

## Accomplishments

- Migration 0017_retail_inventory.py creates 4 tables with full FK + index + CHECK constraint coverage
- Partial unique index `uq_products_active_sku` on `(tenant_id, sku) WHERE is_active=true` validated end-to-end (active+inactive duplicate allowed; second active duplicate rejected)
- 4 new ORM classes (Product / OpticalOrder / OpticalOrderLineItem / InventoryTransaction) with full back-relationships and primary-TXN-friendly defaults
- 9 new AuditAction enum values + 3 Python enums (ProductType / OrderStatus / InventoryReason)
- Encounter.optical_orders back-relationship wired for INV-16 optical-queue rollup
- Wave 0 stubs (test_optical_order_lifecycle.py, test_inventory_atomicity.py, +4 more) now collect cleanly — 22 stubs ready for Wave 1+ to fill
- Migration round-trip verified: upgrade -> downgrade -> upgrade exits 0 each time
- Mappers configure cleanly (after pre-existing IntakeToken cross-module import)

## Task Commits

Each task was committed atomically:

1. **Task 1: Alembic migration 0017_retail_inventory.py** - `17420cf` (feat)
2. **Task 2: ORM models + AuditAction extension + Encounter back-rel** - `a8c6445` (feat)

**Plan metadata commit:** _pending — applied at end of this step_

## Files Created/Modified

- `backend/alembic/versions/0017_retail_inventory.py` (NEW, 246 lines) — DDL for 4 retail-inventory tables, partial unique index, all FKs and CHECK constraints
- `backend/db/models/tenant/clinical.py` (MODIFIED, +296 lines) — 9 new AuditAction values, 3 new Python enums, 4 new ORM classes, 1 new back-rel on Encounter

## Decisions Made

- **JSONB default via sa.text():** Bare string `"'{}'::jsonb"` was being double-quoted by SQLAlchemy's asyncpg driver, producing `'''{}''::jsonb'` (invalid JSON syntax). Switched to `sa.text("'{}'::jsonb")` so the literal SQL is passed through unchanged. Matches the asyncpg driver's stricter quoting semantics; future JSONB defaults in this codebase should follow this pattern.
- **Encounter back-rel without lazy=:** Mirrored the existing `addenda` peer relationship style. Wave 2 plans (13-05, 13-07) can opt into selectinload at query-site as needed.
- **OpticalOrder.created_by foreign_keys=[created_by_id]:** Disambiguates which FK to use when SQLAlchemy assembles the relationship — Staff has multiple incoming FKs (e.g., from Encounter.signed_by_id) so explicit specification avoids the ambiguous-FK error.
- **InventoryTransaction.delta as signed Integer:** Single column captures both decrements (-2 for order_placed) and increments (+5 for receive_stock); reason discriminates intent. Simpler than two columns and matches the append-only audit pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSONB server_default rejected by asyncpg driver**
- **Found during:** Task 1 (alembic upgrade head)
- **Issue:** First `alembic upgrade` failed with `invalid input syntax for type json — Token "'" is invalid` on the `attributes` column. Plan body specified `server_default="'{}'::jsonb"` (bare string) verbatim. Under the asyncpg driver, SQLAlchemy renders this as the literal SQL `DEFAULT '''{}''::jsonb'` — three single quotes, breaking the JSON literal.
- **Fix:** Switched to `server_default=sa.text("'{}'::jsonb")` so the value is treated as raw SQL and not quote-escaped.
- **Files modified:** `backend/alembic/versions/0017_retail_inventory.py` (1-line change in the products.attributes column)
- **Verification:** `alembic upgrade head` exits 0; `alembic downgrade -1` exits 0; re-apply exits 0; partial unique index manual semantics test (active+inactive same-SKU pair allowed; second active rejected) passes.
- **Committed in:** `17420cf` (folded into Task 1 commit, which is the same migration file)

**Note:** Prior migrations (e.g. 0003_billing.py) use the bare-string form successfully but with `nullable=True` JSONB defaults that are never exercised by alembic's first INSERT. The pattern only breaks when SQLAlchemy generates `DEFAULT 'X'::jsonb` syntax with embedded quotes. The `sa.text()` form is safer regardless of nullability and should be preferred going forward.

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Single one-line change to the migration; no scope creep. Captured as a pattern-establishment note for future JSONB defaults.

## Issues Encountered

- `from sqlalchemy.orm import configure_mappers` fails when only `clinical.py` is imported (pre-existing — `Appointment.intake_token` references `IntakeToken` which lives in `backend/db/models/tenant/intake.py`). Resolved by importing both modules; not introduced by this plan.

## User Setup Required

None — no external service configuration required. The migration applied to the dev/staging Supabase instance during execution.

## Next Phase Readiness

**Wave 1 (parallel-ready):**
- 13-02 (permissions + entitlements) — independent of ORM
- 13-03 (Pydantic schemas) — can now reference Product/OpticalOrder ORM types
- 13-08 (seed data) — can now insert Product rows via factory

**Wave 2 (after Wave 1):**
- 13-04 (BE inventory CRUD routes) — has Product ORM + 5 PRODUCT_* / STOCK_* AuditAction values
- 13-05 (BE optical-order routes) — has OpticalOrder + LineItem + InventoryTransaction + 4 OPTICAL_ORDER_* AuditAction values; SoftDeleteMixin + selectin line_items support `with_for_update()` atomicity per INV-11
- 13-07 (encounter rollup) — has Encounter.optical_orders back-rel for the computed-status query

**Acceptance criteria status (per plan):**
- [x] 4 ORM classes added with native_enum=False (VARCHAR + CHECK constraint pattern)
- [x] Migration 0017 created and round-trips cleanly
- [x] 9 new AuditAction enum values added (verified: 58 total values, all 9 new + all old keepers present)
- [x] Encounter.optical_orders back-relationship wired
- [x] Wave 0 stubs (test_optical_order_lifecycle.py et al) now collect cleanly — `importorskip("backend.db.models.tenant.clinical")` resolves; 22 stubs ready
- [x] Partial unique index semantics validated end-to-end (active+inactive same-SKU allowed; 2 active same-SKU rejected with `uq_products_active_sku`)

**Blockers:** None.

---
*Phase: 13-retail-inventory*
*Plan: 01*
*Completed: 2026-05-01*

## Self-Check: PASSED

- File `backend/alembic/versions/0017_retail_inventory.py` — FOUND
- File `backend/db/models/tenant/clinical.py` — FOUND (modified)
- File `.planning/phases/13-retail-inventory/13-01-SUMMARY.md` — FOUND
- Commit `17420cf` (Task 1: migration) — FOUND in git log
- Commit `a8c6445` (Task 2: ORM + audit) — FOUND in git log
- Alembic state: `0017_retail_inventory (head)` — verified
- 4 tables present in DB: products, optical_orders, optical_order_line_items, inventory_transactions — verified
- Partial unique index `uq_products_active_sku` — verified semantics (active+inactive same-SKU allowed; 2nd active rejected)
- All 22 Wave 0 stubs collect cleanly (importorskip resolves) — verified
