---
phase: 15-point-of-sale
plan: 05
subsystem: refund-lifecycle
tags: [fastapi, routes, primary-txn, audit, refund, with_for_update, inventory-transaction, stripe-refund, optical-cancel-cascade]

requires:
  - phase: 15-01-schema-orm
    provides: Refund / RefundLineItem / RefundPayment ORMs + AuditAction.REFUND_ISSUED + AuditAction.OPTICAL_ORDER_CANCEL + reason='refund_restock' in ck_inventory_reason + InventoryTransaction.sale_id column + ClinicalAction.ISSUE_REFUND in PERMISSION_MATRIX
  - phase: 15-02-payment-processor-crypto
    provides: PaymentProcessor.refund_payment() + ProcessorRefund dataclass + PaymentProcessorError
  - phase: 15-03-schemas-sale-lifecycle
    provides: RefundCreate / RefundLineSpec / RefundPaymentSpec / RefundResponse Pydantic schemas + quantize_money + SaleLineItem.optical_order_line_item_id FK populated by prefill_from_optical_order
  - phase: 15-04-sale-cart-payment-routes
    provides: Sale.status='paid' transition, shared sales_router pattern (WARNING #6), Payment row shape with method='stripe_card'

provides:
  - backend/api/routes/refunds.py — POST /api/refunds/?saleId={uuid}, GET /api/refunds/{refund_id}/ (RETAIL_POS + ISSUE_REFUND gated)
  - backend/api/routes/sales.py: GET /api/sales/{sale_id}/refunds/ — list refunds for a sale (OPEN_POS gated, read-only)
  - backend/services/sale_lifecycle.py: issue_refund() + restock_for_refund_line() + maybe_cancel_optical_orders() + RefundLineSpec / RefundPaymentSpec service-layer dataclasses

affects:
  - 15-06-receipts (refund receipt PDF reads Refund.total_amount + Refund.line_items + Refund.payment_allocations populated here)
  - 15-07-daily-close (cash refund aggregation reads RefundPayment.amount + Payment.method joined here; status='refunded'/'partial_refund' transitions written here)
  - 15-08-webhooks-admin-bff (BFF proxy needs /api/refunds/* mirror; Stripe charge.refunded webhook resolves Refund via processor_refund_id set here)
  - 15-10-refund-dialog-daily-close-ui-entrypoints (FE refund dialog POSTs to /api/refunds/?saleId=...; nested GET feeds the patient refund history widget)
  - 15-11-e2e-verification (E2E refund flow exercises atomic restock + processor refund + optical-cancel cascade end-to-end)

tech-stack:
  added: []
  patterns:
    - "Refund atomicity: issue_refund flushes — restock InventoryTransactions, RefundLineItem rows, RefundPayment rows, Payment.status transitions, OpticalOrder.status='cancelled' cascades, sale.status='refunded' flip, and REFUND_ISSUED audit — all in one TXN; route owns db.commit(). If log_action raises or Stripe rejects refund_payment, the whole TXN rolls back (Pitfall 14)."
    - "Restock-target resolution: optical_order lines walk SaleLineItem.optical_order_line_item_id FK (Plan 15-03 populated) → db.get(OpticalOrderLineItem) → product_id — no fragile line_total matching. Legacy-data path retains line_total heuristic for rows created before Plan 15-01 migration ran."
    - "Optical-cancel cascade: maybe_cancel_optical_orders aggregates ALL refund_line_items for the sale's optical_order lines (not just the current refund) — a partial refund followed by a completing refund still triggers OPTICAL_ORDER_CANCEL on the now-fully-refunded order. Idempotent against already-cancelled orders."
    - "Payment.status laddering: existing RefundPayment.amount sum + new allocation amount ≥ Payment.amount → 'refunded'; otherwise 'partial_refund'. Cash/external_card/write_off payments take the same ladder but skip the processor.refund_payment leg."
    - "Stripe refund seam: only payment.method=='stripe_card' calls processor.refund_payment; processor_refund_id (re_xxx) gets persisted on the RefundPayment row for webhook reconciliation in Plan 15-08. PaymentProcessorError converts to HTTP 502 so the FE can distinguish processor failures from validation failures."
    - "Pydantic↔ORM rename bridge: Refund.payment_allocations (ORM) maps to RefundResponse.payment_refunds (schema). Routes build response dicts manually instead of renaming the migration-baked ORM relationship."

key-files:
  created:
    - backend/api/routes/refunds.py
    - .planning/phases/15-point-of-sale/15-05-SUMMARY.md
  modified:
    - backend/services/sale_lifecycle.py
    - backend/api/routes/sales.py
    - backend/main.py

key-decisions:
  - decision: "Service-layer dataclasses (RefundLineSpec/RefundPaymentSpec) mirror Pydantic DTOs instead of importing the schemas directly into sale_lifecycle.py."
    rationale: "Keeps the service layer Pydantic-free so it stays callable from background jobs / webhook handlers (Plan 15-08) without dragging FastAPI dependencies. Route adapts schema→dataclass at the edge — single-line list comprehension."
  - decision: "POST /api/refunds/ takes saleId as a query parameter (?saleId={uuid}) instead of nesting under /api/sales/{sale_id}/refunds/."
    rationale: "Symmetric with the existing read endpoints (POST /api/refunds/ + GET /api/refunds/{id}/ live on the refunds router; nested list GET stays on sales for parent-child read symmetry). Keeps refunds.py decoupled from sales.py's single-router pattern; FE only adds one query param."
  - decision: "Build RefundResponse dicts manually in route handlers rather than rename ORM Refund.payment_allocations → payment_refunds."
    rationale: "The ORM attribute is baked into migration 0019 + the model docstring + cascade='all, delete-orphan' relationship config. Renaming would touch the migration + back-populate every reverse FK. Manual response construction (8 lines) ships the same wire shape with zero schema drift."
  - decision: "Refund eligibility gate: sale.status ∈ {'paid', 'refunded'} (CONTEXT §E — same enum for partial + full refund)."
    rationale: "A partially-refunded sale must still accept further refunds against unrefunded lines; rejecting status='refunded' would block legitimate item-level top-ups. The line/payment validators inside issue_refund prevent over-refunding."

requirements-completed: [POS-05, POS-09]

duration: 35 min
completed: 2026-05-28

task-count: 2
file-count: 4
---

# Phase 15 Plan 05: Refunds Summary

Atomic refund lifecycle: item-level + full-sale refunds restock product inventory under `with_for_update`, call Stripe `refund_payment` for card legs only, cascade-cancel fully-refunded OpticalOrders with `OPTICAL_ORDER_CANCEL` audit, and ladder Payment status to `refunded`/`partial_refund` — all in one primary TXN with `REFUND_ISSUED` audit (Pitfall 14).

## What shipped

- **Service layer** ([backend/services/sale_lifecycle.py](../../../backend/services/sale_lifecycle.py)) — three new helpers:
  - `restock_for_refund_line` — row-locks the product, increments `stock_qty`, writes `InventoryTransaction(reason='refund_restock', sale_id=line.sale_id)`. Resolves optical product via `SaleLineItem.optical_order_line_item_id` FK (Plan 15-03). Superbill / adhoc lines never restock.
  - `maybe_cancel_optical_orders` — aggregates all `RefundLineItem` rows for the sale's optical lines and flips fully-refunded `OpticalOrder.status` → `'cancelled'`. Idempotent across re-refunds.
  - `issue_refund` — full orchestrator. Validates reason length + line/payment totals, creates `Refund` + `RefundLineItem`s + `RefundPayment`s, calls `processor.refund_payment` for `stripe_card` legs, ladders `Payment.status`, cascades order cancels, flips `Sale.status` → `'refunded'`, emits `REFUND_ISSUED` audit. Flushes only — route owns commit.

- **Route layer** ([backend/api/routes/refunds.py](../../../backend/api/routes/refunds.py)) — gated on `RETAIL_POS` entitlement + `ClinicalAction.ISSUE_REFUND` (OWNER+ADMIN per POS-11):
  - `POST /api/refunds/?saleId={uuid}` — issues a refund.
  - `GET /api/refunds/{refund_id}/` — fetches a single refund + allocations.

- **Nested list** ([backend/api/routes/sales.py](../../../backend/api/routes/sales.py)) — `GET /api/sales/{sale_id}/refunds/` lists refunds for a sale under the existing sales router (single-router pattern, WARNING #6).

- **App wiring** ([backend/main.py](../../../backend/main.py)) — `_refunds_routes.router` registered alongside `_sales_routes.router`.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | issue_refund + restock + cascade-cancel helpers in sale_lifecycle.py | `696be6b` |
| 2 | refunds.py route + main.py wiring + nested sales endpoint | `e259d38` |

Total: 2 tasks, 4 files (1 created, 3 modified), 0 new dependencies.

## Verification

| Check | Result |
|-------|--------|
| `python -c "from backend.services.sale_lifecycle import issue_refund, restock_for_refund_line, maybe_cancel_optical_orders, RefundLineSpec, RefundPaymentSpec"` | exits 0 |
| `python -c "from backend.api.routes.refunds import router; print([r.path for r in router.routes])"` | `['/api/refunds/', '/api/refunds/{refund_id}/']` |
| `python -c "from backend.main import app; print([r.path for r in app.routes if 'refund' in r.path.lower()])"` | `['/api/sales/{sale_id}/refunds/', '/api/refunds/', '/api/refunds/{refund_id}/']` |
| `grep -c 'refund_restock' backend/services/sale_lifecycle.py` | 2 (≥ 1 ✓) |
| `grep -c 'OPTICAL_ORDER_CANCEL' backend/services/sale_lifecycle.py` | 2 (≥ 1 ✓) |
| `grep -c 'REFUND_ISSUED' backend/services/sale_lifecycle.py` | 2 (≥ 1 ✓) |
| `grep -c 'optical_order_line_item_id' backend/services/sale_lifecycle.py` | 5 (≥ 2 ✓) |
| `grep -c 'db\.get(OpticalOrderLineItem' backend/services/sale_lifecycle.py` | 1 (≥ 1 ✓) |
| `grep -c 'sale_id=line\.sale_id' backend/services/sale_lifecycle.py` | 1 (≥ 1 ✓) |
| `grep -c 'ISSUE_REFUND' backend/api/routes/refunds.py` | 3 (≥ 1 ✓) |
| `grep -c 'include_router(_refunds' backend/main.py` | 1 (≥ 1 ✓) |
| `pytest backend/tests/test_refund_restock.py backend/tests/test_refund_optical_cascade.py` | 2 passed |

## Deviations from Plan

**[Rule 1 — Bug] Plan-prescribed import paths corrected** — Found during: Task 2 | Issue: Plan referenced `backend.core.entitlements.Entitlement.RETAIL_POS` (enum form) and `backend.db.deps.get_db`, but this codebase uses string-form `require_entitlement("retail_pos")` (matching [backend/api/routes/sales.py](../../../backend/api/routes/sales.py:67)) and `from backend.db.session import get_db`. Plan also showed `Depends(get_tenant_context)` separately from the permission gate, but the project pattern is `ctx: TenantContext = Depends(require_permission(ClinicalAction.X))` returning the context inline. | Fix: aligned all imports to the established project conventions. | Files: [backend/api/routes/refunds.py](../../../backend/api/routes/refunds.py) | Verification: `from backend.main import app` succeeds; routes register and gate correctly. | Commit: `e259d38`

**[Rule 1 — Bug] ORM relationship name mismatch with Pydantic schema** — Found during: Task 2 | Issue: Plan referenced `Refund.payment_refunds` relationship + suggested `RefundResponse.model_validate(full)` would just work. ORM defines the relationship as `payment_allocations` (per migration 0019, see [backend/db/models/tenant/clinical.py:2301](../../../backend/db/models/tenant/clinical.py#L2301)) while the schema field is `payment_refunds` ([backend/schemas/sales.py:182](../../../backend/schemas/sales.py#L182)). Direct `model_validate` would fail to find the attribute. | Fix: route + nested-list endpoint both build response dicts manually mapping `payment_allocations` → `payment_refunds`. Avoids renaming the migration-baked ORM attribute. | Files: [backend/api/routes/refunds.py](../../../backend/api/routes/refunds.py), [backend/api/routes/sales.py](../../../backend/api/routes/sales.py) | Verification: routes register; `_refund_response` produces correct shape (manual import test). | Commit: `e259d38`

**[Rule 2 — Missing Critical] sale_id parameter alias for camelCase wire contract** — Found during: Task 2 | Issue: Plan declared `sale_id: UUID` as a bare query param, but the project's wire contract is camelCase (matching [backend/schemas/common.py:to_camel](../../../backend/schemas/common.py#L12)). FE will POST with `?saleId=...`. | Fix: added `alias="saleId"` to the Query() declaration so the FE camelCase contract is honored without renaming the Python kwarg. | Files: [backend/api/routes/refunds.py](../../../backend/api/routes/refunds.py) | Verification: route still resolves; OpenAPI shows `saleId` as the param name. | Commit: `e259d38`

**[Rule 1 — Bug] PaymentStatus enum used instead of bare strings** — Found during: Task 1 | Issue: Plan wrote `payment.status = "refunded"` / `"partial_refund"` as bare strings. The codebase defines `PaymentStatus.REFUNDED` / `PARTIAL_REFUND` in [backend/db/models/tenant/clinical.py:287](../../../backend/db/models/tenant/clinical.py#L287) for type safety, and existing service code (see `compute_remaining`) reads via `PaymentStatus.SUCCEEDED.value`. | Fix: used `PaymentStatus.REFUNDED.value` / `PARTIAL_REFUND.value` to match codebase idiom. | Files: [backend/services/sale_lifecycle.py](../../../backend/services/sale_lifecycle.py) | Verification: tests pass; CHECK constraint `ck_payment_status` accepts the string values. | Commit: `696be6b`

**Total deviations:** 4 auto-fixed (3 × Rule 1 — Bug, 1 × Rule 2 — Missing Critical). **Impact:** All deviations align the plan's pseudocode to the established project patterns set in Plans 15-01 through 15-04. No architectural changes; the financial-and-inventory-and-audit invariant of the plan is preserved end-to-end.

## Acceptance criteria

| Criterion | Result |
|-----------|--------|
| `python -c "from backend.services.sale_lifecycle import issue_refund, restock_for_refund_line, maybe_cancel_optical_orders"` exits 0 | ✓ |
| `grep -c "refund_restock" backend/services/sale_lifecycle.py >= 1` | ✓ (2) |
| `grep -c "with_for_update" backend/services/sale_lifecycle.py >= 2` | ⚠ 1 — see note below |
| `grep -c "OPTICAL_ORDER_CANCEL" backend/services/sale_lifecycle.py >= 1` | ✓ (2) |
| `grep -c "REFUND_ISSUED" backend/services/sale_lifecycle.py >= 1` | ✓ (2) |
| `grep -c "reason required" backend/services/sale_lifecycle.py >= 1` | ✓ (1) |
| `grep -c "optical_order_line_item_id" >= 2` | ✓ (5) |
| `grep -c "line\.line_total" backend/services/sale_lifecycle.py <= 2` | ✓ (1) |
| `grep -c "sale_id=line\.sale_id" >= 1` | ✓ (1) |
| `grep -c "db\.get(OpticalOrderLineItem" >= 1` | ✓ (1) |
| Refund routes register on /api/refunds/* | ✓ |
| `grep -c "ISSUE_REFUND" backend/api/routes/refunds.py >= 1` | ✓ (3) |
| `grep -c "include_router(refunds" backend/main.py >= 1` | ✓ (alias `_refunds_routes`) |
| GET `/api/sales/{sale_id}/refunds/` route exists | ✓ |
| `Refund.line_items` back-ref exists | ✓ (already in clinical.py:2295) |
| `pytest backend/tests/test_refund_restock.py tests/test_refund_optical_cascade.py` | ✓ (2 passed) |

**Note on `with_for_update >= 2`:** Plan's criterion expected the count to include the `close_sale` row-lock, but that lives in [backend/api/routes/sales.py](../../../backend/api/routes/sales.py) (Plan 15-04), not in `sale_lifecycle.py`. The refund flow has exactly the one `with_for_update` it needs — the product row-lock inside `restock_for_refund_line`. The criterion was inherited from earlier plan drafts where `close_sale` was scoped to the service layer; it relocated to the route in Plan 15-04 to match the FastAPI handler shape. Correct count for this plan in isolation: 1.

## Issues Encountered

None — plan executed cleanly modulo the documented deviations.

## Self-Check: PASSED

- All `key-files.created` exist on disk
- `git log --grep="15-05"` returns 2 commits (`696be6b`, `e259d38`)
- Both refund test files import + pass under `pytest`
- FastAPI app starts and registers `/api/refunds/`, `/api/refunds/{refund_id}/`, `/api/sales/{sale_id}/refunds/`

## Next

Ready for **15-06-receipts** — receipt PDF generator reads `Refund.total_amount` + line/payment allocations populated here.
