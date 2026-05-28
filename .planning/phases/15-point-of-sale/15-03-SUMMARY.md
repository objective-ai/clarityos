---
phase: 15-point-of-sale
plan: 03
subsystem: service-layer
tags: [pydantic, typescript, decimal, money, banker-rounding, camel-case, contract-test, sale-lifecycle, copay, prefill]

requires:
  - phase: 15-01-schema-orm
    provides: Sale / SaleLineItem / Payment / Refund / DailyCloseRun ORM + 4 PaymentMethod/PaymentStatus enums + Tenant.sales_tax_rate column
  - phase: 13-retail-inventory
    provides: OpticalOrderLineItem.id stable identity used by SaleLineItem.optical_order_line_item_id FK (populated here by prefill_from_optical_order)

provides:
  - backend.services.money — quantize_money (ROUND_HALF_EVEN), to_stripe_cents, from_stripe_cents
  - backend.services.sale_lifecycle — compute_sale_totals (round-of-sum tax), compute_remaining, prefill_from_superbill, prefill_from_optical_order, load_cart_from_sources
  - backend.schemas.sales — 23 Pydantic classes covering Sale / Payment / Refund / DailyClose / admin PaymentConfig request+response
  - types/sales.ts — TS interfaces mirroring Pydantic by_alias output (Decimal as string)
  - test_sale_tax (4) + test_split_tender (4) + test_sale_cart_load (2) + test_sales_contract (6) + sales.contract.test.ts vitest (5) — 21 tests green

affects:
  - 15-04-sale-cart-payment-routes (composes prefill_* + compute_* into transactional route handlers)
  - 15-05-refunds (uses SaleLineItem.optical_order_line_item_id FK populated here to walk back to Product for restock)
  - 15-07-daily-close (consumes DailyCloseSummary + DailyCloseTotalsBucket schemas + money helpers for variance calc)
  - 15-08-webhooks-admin-bff (consumes PaymentConfigUpdate/Response schemas)
  - 15-09-stores-pos-page (FE consumes types/sales.ts interfaces; cart store uses Decimal-as-string convention)

tech-stack:
  added: []
  patterns:
    - "Round-of-sum tax: taxable_subtotal × tax_rate THEN quantize (Pitfall 4) — never sum-of-rounds"
    - "compute_remaining counts payments with status in {succeeded, partial_refund} — partially-refunded payments still applied their full principal"
    - "prefill_from_optical_order populates optical_order_line_item_id FK on every SaleLineItem so refund restock walks the FK (no fragile line_total/qty matching — WARNING #3 fix)"
    - "Decimal serializes as STRING in TS interfaces — convention from Phase 13 §13-03 preserved; FE never touches floats"
    - "23-class Pydantic module uses single CamelCaseModel base for uniform by_alias=True default serialization"
    - "Vitest expectTypeOf<keyof T>().toEqualTypeOf<...>() pins literal key sets — TS compile fails if backend Pydantic adds/removes a field (POS-16 contract guard, per feedback_contract_tests.md)"
    - "Pydantic contract tests assert set(model_dump(by_alias=True).keys()) == EXPECTED_*_KEYS — backend half of the contract pair"

key-files:
  created:
    - backend/services/money.py
    - backend/services/sale_lifecycle.py
    - backend/schemas/sales.py
    - types/sales.ts
    - .planning/phases/15-point-of-sale/15-03-SUMMARY.md
  modified:
    - backend/tests/test_sale_tax.py
    - backend/tests/test_split_tender.py
    - backend/tests/test_sale_cart_load.py
    - backend/tests/test_sales_contract.py
    - types/sales.contract.test.ts
    - backend/db/models/tenant/__init__.py  # [Rule 3 - Blocking] register intake module

key-decisions:
  - "CamelCaseModel imported from backend.schemas.common (plan referenced backend.schemas._base; common is the real path — Pydantic config + alias_generator already there with by_alias=True default model_dump)"
  - "load_cart_from_sources convenience wrapper added on top of the two prefill_* helpers so Plan 15-04 route can pass a single dict of source lists; saves one round-trip per source category"
  - "compute_remaining_balance alias retained for the Wave-0 stub-named symbol — no breaking import path; future code uses compute_remaining"
  - "Pre-existing TS errors in tests/e2e/smoke-*.spec.ts are out of scope (14 errors, 0 in sales files); not blocking — tsc acceptance criterion practically satisfied for new code"

patterns-established:
  - "Pattern: every Pydantic response model on sales endpoints inherits CamelCaseModel — single decision point for snake↔camel conversion"
  - "Pattern: every Decimal field in TS interfaces is `string` (not number) — prevents floating-point drift in cart totals"
  - "Pattern: contract test pair (Python set-of-keys + TS literal expectTypeOf) — schema drift fails CI on either side"

requirements-completed: [POS-01, POS-06, POS-13, POS-14, POS-15, POS-16]

duration: 28 min
completed: 2026-05-28
---

# Phase 15 Plan 03: Service Layer + Schemas + TS Contract Summary

**Pure-Python sale-lifecycle helpers (Decimal money, copay derivation, OpticalOrder snapshot) + 23-class Pydantic schemas + matching TS interfaces — every wire-format key is now pinned by a contract test pair before routes (Plan 15-04) consume them.**

## Performance

- **Duration:** 28 min
- **Tasks:** 2 (Task 1 TDD, Task 2 by_alias contract)
- **Files modified:** 11
- **Tests:** 21 green (4 tax + 4 split-tender + 2 cart-load + 6 Python contract + 5 vitest)

## Accomplishments
- ROUND_HALF_EVEN banker's rounding through every money calculation
- Tax computed as round-of-sum (taxable_base × rate → quantize) — NOT sum-of-rounds (Pitfall 4)
- Superbill prefill derives copay from PatientInsurance.copay_amount when billed; self-pay fallback to total_fee
- OpticalOrder prefill creates one SaleLineItem per OpticalOrderLineItem with the FK populated for precise refund restock targeting
- Split-tender close gate via compute_remaining counts succeeded + partial_refund statuses
- 23 Pydantic schemas + matching TS interfaces, both pinned by contract tests (POS-16)
- Wave-0 skip-stubs replaced with real assertion bodies (per feedback_skip_stubs_anti_pattern)

## Task Commits

1. **Task 1: money + sale_lifecycle helpers (TDD)** — `0412f3b` (feat)
2. **Task 2: Pydantic schemas + TS types + contract test** — `df85f11` (feat)

## Files Created/Modified
- `backend/services/money.py` — quantize_money / to_stripe_cents / from_stripe_cents
- `backend/services/sale_lifecycle.py` — compute_sale_totals / compute_remaining / prefill_from_superbill / prefill_from_optical_order / load_cart_from_sources
- `backend/schemas/sales.py` — 23 Pydantic models (Sale/Payment/Refund/DailyClose/Admin)
- `types/sales.ts` — TS mirror with Decimal-as-string + camelCase keys
- `backend/tests/test_sale_tax.py` — 4 tax computation tests
- `backend/tests/test_split_tender.py` — 4 remaining-balance tests
- `backend/tests/test_sale_cart_load.py` — 2 prefill_from_superbill tests
- `backend/tests/test_sales_contract.py` — 6 by_alias key-set assertions
- `types/sales.contract.test.ts` — 5 expectTypeOf<keyof> literal-key pins
- `backend/db/models/tenant/__init__.py` — `from . import intake` ([Rule 3 - Blocking] fix below)

## Decisions Made
- CamelCaseModel imported from `backend.schemas.common` (plan referenced `_base` which doesn't exist) — single source of truth for camelize, already configured with `by_alias=True` default
- Kept `compute_remaining_balance` alias for Wave-0 stub compatibility; new code uses `compute_remaining`
- Decimal-as-string TS convention preserved from Phase 13 — non-negotiable for floating-point safety

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Register intake module in tenant package __init__**
- **Found during:** Task 1 (test_sale_cart_load.py mapper init)
- **Issue:** Instantiating SaleLineItem(...) triggered SQLAlchemy `configure_mappers()` which fails because `Appointment.intake_token` references `"IntakeToken"` by name but `backend/db/models/tenant/__init__.py` only imported messaging, never intake — so `IntakeToken` was never registered in the mapper registry
- **Fix:** Added `from . import intake  # noqa: F401` to `backend/db/models/tenant/__init__.py` (mirrors the existing pattern that imports messaging)
- **Files modified:** backend/db/models/tenant/__init__.py
- **Verification:** All 10 Task-1 tests green; existing test_pos_models passes; no other tests broken
- **Committed in:** `0412f3b` (Task 1 commit)

**2. [Rule 1 - Bug] CamelCaseModel import path corrected**
- **Found during:** Task 2 (Pydantic schemas)
- **Issue:** Plan referenced `from backend.schemas._base import CamelCaseModel` but `_base.py` doesn't exist
- **Fix:** Used real path `from backend.schemas.common import CamelCaseModel` (already-configured Pydantic base used by Phase 13/14)
- **Files modified:** backend/schemas/sales.py
- **Verification:** All 6 contract tests green; 5 vitest tests green
- **Committed in:** `df85f11` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 - Blocking, 1 Rule 1 - Bug)
**Impact on plan:** Both fixes essential and scoped to actual issues — no architectural change. Mapper-init fix benefits every test in the suite that touches tenant ORM.

## Issues Encountered
- Pre-existing TS errors in `tests/e2e/smoke-*.spec.ts` (14 total, 0 in sales files) prevent `npx tsc --noEmit` from exiting 0 — these are unrelated to Phase 15 and shouldn't block this plan. New code (`types/sales.ts`, `types/sales.contract.test.ts`) compiles clean.

## User Setup Required
None.

## Next Phase Readiness
- Ready for Plan 15-04 (sale-cart-payment-routes): every helper this plan exposes is the unit-of-composition for the route layer (open / patch / close / pay / void); schemas can plug straight into FastAPI `response_model=SaleResponse`
- Ready for Plan 15-09 (FE stores + POS page): types/sales.ts provides the FE contract surface; Decimal-as-string convention enforced by the vitest contract guard
- Ready for Plan 15-07 (daily-close): DailyCloseSummary + DailyCloseTotalsBucket schemas already defined; the money helpers ensure variance calculation uses banker's rounding throughout

---
*Phase: 15-point-of-sale*
*Completed: 2026-05-28*
