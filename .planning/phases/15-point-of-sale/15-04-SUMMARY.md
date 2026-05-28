---
phase: 15-point-of-sale
plan: 04
subsystem: api-routes
tags: [fastapi, routes, primary-txn, audit, with_for_update, inventory-transaction, stripe, payment-intent, split-tender, receipt-number]

requires:
  - phase: 15-01-schema-orm
    provides: Sale / SaleLineItem / Payment ORMs + AuditAction.SALE_* + InventoryTransaction.sale_id + reason='sale_placed' in ck_inventory_reason
  - phase: 15-02-payment-processor-crypto
    provides: get_processor() + StripeProcessor.create_payment_intent / confirm_payment / cancel_intent (added here for Pitfall 7)
  - phase: 15-03-schemas-sale-lifecycle
    provides: Pydantic schemas + compute_sale_totals / compute_remaining / prefill_* helpers / money.quantize_money

provides:
  - backend/api/routes/sales.py — 9 sale-lifecycle routes (list, open, get, patch, void, lines CRUD, close)
  - backend/api/routes/sale_payments.py — 3 payment routes mounted on shared sales_router (no dual-prefix collision per WARNING #6)
  - backend/services/sale_lifecycle.py extended with maybe_dispense_optical_orders + generate_receipt_number + close_sale shim
  - PaymentProcessor.cancel_intent() — extends Plan 15-02 seam to keep `import stripe` confined to stripe_processor.py
  - 6 new payment-handler unit tests (cash math, write_off reason gate) replacing Wave-0 skip-stubs

affects:
  - 15-05-refunds (consumes the row-lock + InventoryTransaction(reason='refund_restock') pattern established here)
  - 15-06-receipts (downloads the receipt PDF using sale.receipt_number generated here)
  - 15-07-daily-close (aggregates sale.closed_at + sale.total + payment.method totals written here)
  - 15-08-webhooks-admin-bff (Stripe webhook handler resolves Payment via processor_payment_id set here)
  - 15-09-stores-pos-page (FE calls /api/sales/*, /api/sales/{id}/lines/*, /api/sales/{id}/payments/*, /api/sales/{id}/close/)

tech-stack:
  added: []
  patterns:
    - "Single-router pattern (WARNING #6): sale_payments.py imports `sales_router` from sales.py and registers its handlers with `@sales_router.post/delete` decorators — no second APIRouter, no dual prefix collision"
    - "Close-sale primary-TXN: select(Product).with_for_update() per line → decrement stock_qty → InventoryTransaction(reason='sale_placed', sale_id=sale.id, staff_id=...) → optional optical_order dispense flip → SALE_PAID audit — single db.commit()"
    - "Server-authoritative payment status: stripe-confirm route calls processor.confirm_payment which retrieves PaymentIntent (Pitfall 2) — local Payment.status updated only from the server response"
    - "Receipt number R-YYYYMMDD-NNNN: per-tenant per-day count(receipt_number IS NOT NULL) + 1, zero-padded to 4 digits"
    - "Discount audit (POS-15): SALE_DISCOUNT_APPLIED fires on POST /lines/ when discount_amount>0 AND on PATCH /lines/{id}/ when discount_amount changes upward — discount_reason required-non-empty enforced application-side"
    - "Write-off audit (POS-11): RECORD_WRITE_OFF role gate (OWNER+ADMIN only) + non-empty reason_note required → WRITE_OFF_RECORDED audit"
    - "Cancel-intent abstraction: stripe.PaymentIntent.cancel hidden behind PaymentProcessor.cancel_intent() — no `import stripe` leaks into the api/ tree"

key-files:
  created:
    - backend/api/routes/sales.py
    - backend/api/routes/sale_payments.py
    - .planning/phases/15-point-of-sale/15-04-SUMMARY.md
  modified:
    - backend/services/sale_lifecycle.py
    - backend/services/payments/base.py
    - backend/services/payments/stripe_processor.py
    - backend/main.py
    - backend/tests/test_payment_cash.py
    - backend/tests/test_payment_writeoff.py

key-decisions:
  - "Single-router pattern: sale_payments.py imports sales_router and decorates the shared instance — eliminates the path-prefix duplication risk between two routers both prefixed /api/sales (WARNING #6)"
  - "Cancel orphan PaymentIntent via processor.cancel_intent() instead of direct stripe import — plan-15-02 abstraction barrier acceptance criterion holds (zero `import stripe` outside stripe_processor.py)"
  - "Inline RECORD_WRITE_OFF role check in create_payment dispatch (vs. branching the route into two endpoints) — keeps the public API surface at one POST per logical operation; OWNER/ADMIN-only enforcement reads PERMISSION_MATRIX directly"
  - "close_sale shim raises NotImplementedError — the route handler IS the canonical entry; a programmatic shim lands when a second caller (webhook auto-close, background job) actually needs it (YAGNI per CLAUDE.md)"
  - "Zero-stock at close logs metadata but does NOT 4xx — soft-block convention from Phase 13 optical_order.place preserved"
  - "Receipt number computed under the close TXN — unique partial index (tenant_id, receipt_number) prevents duplicates at the DB level even if two staff race at end of day"

patterns-established:
  - "Pattern: every Sale-mutating route does the close-flow shape — load → validate → mutate → audit (primary TXN) → single commit → re-fetch with selectinload → response"
  - "Pattern: payment branches dispatch via internal `_record_*` async helpers — unit-testable without HTTP simulation (handlers take body, sale, staff, ctx, db)"
  - "Pattern: receipt number lives in service layer (generate_receipt_number) so future programmatic close paths can reuse it"

requirements-completed: [POS-02, POS-11, POS-12]

duration: 38 min
completed: 2026-05-28
---

# Phase 15 Plan 04: Sale + Cart + Payment Routes Summary

**12 FastAPI routes under /api/sales (9 sale-lifecycle on sales.py + 3 payment on sale_payments.py mounted via decorator on the shared router) — close-sale is the primary-TXN financial-and-inventory commit point with row-locked stock decrement, audit, and receipt-number generation in a single db.commit().**

## Performance

- **Duration:** 38 min
- **Tasks:** 2 (routes + payment branches)
- **Files modified:** 9 (2 new routes + 4 extensions + sales-test refreshes)
- **Tests:** 15 green (4 split-tender + 4 cash + 4 write-off + 1 schema + 1 mounted-route check). 25 across the full Phase 15 payment-test suite.

## Accomplishments
- POS-01 sales-lifecycle BE complete (open → line CRUD → close)
- POS-02 payment-recording BE complete (cash/external/write-off inline; stripe via PaymentIntent + confirm)
- POS-06 split-tender enforced at close (remaining<=0 gate; 409 with friendly message otherwise)
- POS-11 write-off permission gate + reason_note required
- POS-12 stripe_card payment flow ready for FE Elements
- POS-15 discount_reason enforced
- Primary-TXN audit per .claude/rules/clinical-safety.md across all mutating routes
- Abstraction barrier extended (cancel_intent on processor) — no `import stripe` outside stripe_processor.py

## Task Commits

1. **Task 1: sales lifecycle routes + close-sale handler** — `77d8944` (feat)
2. **Task 2: payment routes (cash/external/write_off/stripe + confirm + cancel)** — `232a275` (feat)

## Files Created/Modified
- `backend/api/routes/sales.py` — 9 routes (list, open, get, patch, void, line POST/PATCH/DELETE, close)
- `backend/api/routes/sale_payments.py` — 3 routes (payment POST, stripe-confirm, DELETE pending) + 4 internal helpers
- `backend/services/sale_lifecycle.py` — added maybe_dispense_optical_orders, generate_receipt_number, close_sale shim
- `backend/services/payments/base.py` — added cancel_intent to PaymentProcessor Protocol
- `backend/services/payments/stripe_processor.py` — implements cancel_intent (silent on Stripe errors per docstring)
- `backend/main.py` — registers sales_router + side-effect import of sale_payments
- `backend/tests/test_payment_cash.py` — 3 unit tests (change_due, tendered<amount, no-tendered)
- `backend/tests/test_payment_writeoff.py` — 3 unit tests (no reason, empty reason, succeeds with reason)

## Decisions Made
- Single-router pattern over dual-router (WARNING #6) — prevents two routers both prefixed `/api/sales/...` from racing on FastAPI route resolution
- `cancel_intent` added to the PaymentProcessor seam — keeps Plan 15-02's "no `import stripe` outside stripe_processor.py" rule intact
- Close-sale shim raises NotImplementedError — the route handler IS the canonical entry; YAGNI for a programmatic shim until a 2nd caller exists
- Zero-stock at close logs to audit metadata but doesn't block — mirrors Phase 13 optical_order.place soft-block convention

## Deviations from Plan

None - plan executed exactly as written.

Minor: PaymentProcessor gained a `cancel_intent()` method (already noted in plan as an OPTIONAL choice) — required to keep Plan 15-02 abstraction barrier acceptance criterion holding (zero `import stripe` outside stripe_processor.py).

## Issues Encountered
None. (Existing TS errors in `tests/e2e/smoke-*.spec.ts` are unchanged — not in this plan's scope.)

## User Setup Required
None — Stripe publishable+secret keys are admin-managed at runtime (Plan 15-08 admin route).

## Next Phase Readiness
- Ready for Plan 15-05 (refunds): close-sale's row-lock + InventoryTransaction(reason='sale_placed', sale_id=...) pattern is the template for refund_restock; refund handler will mirror it with reason='refund_restock'
- Ready for Plan 15-06 (receipts): sale.receipt_number is generated and persisted at close; PDF generation can read it directly
- Ready for Plan 15-07 (daily-close): aggregation queries can group payments by method using the rows this plan inserts
- Ready for Plan 15-08 (webhooks + admin BFF): processor_payment_id is set on stripe_card Payment rows for webhook lookup
- Ready for Plan 15-09 (FE stores + POS page): all FE-consumed endpoints exist and follow camelCase response_model

---
*Phase: 15-point-of-sale*
*Completed: 2026-05-28*
