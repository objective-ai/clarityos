---
phase: 15-point-of-sale
plan: 00
subsystem: testing
tags: [stripe, cryptography, reportlab, fernet, pytest, vitest, playwright, pos]

requires:
  - phase: 14-optical-order-configuration
    provides: OpticalOrder lifecycle + line-item snapshot shape consumed by Sale cart prefill
  - phase: 13-retail-inventory
    provides: Product + InventoryTransaction tables used by refund restock
provides:
  - Pinned Stripe + cryptography + reportlab Python deps (importable)
  - @stripe/stripe-js + @stripe/react-stripe-js npm deps (importable)
  - PAYMENTS_FERNET_KEY + STRIPE_API_VERSION documented in .env.example (blank by default)
  - 21 backend pytest skip-stub files for Wave-0 verification targets
  - 3 frontend vitest skeletons (StripePaymentForm, printReceipt, sales.contract)
  - 3 Playwright e2e skeletons (pos-checkout, pos-refund, pos-daily-close)
  - sale_factory / payment_factory / refund_factory / fake_stripe_processor fixtures in conftest
  - POS-01..POS-16 appended to .planning/REQUIREMENTS.md with traceability rows
  - 25-row per-task verification map in 15-VALIDATION.md (nyquist_compliant: true)
  - 15-BAA-CHECKPOINT.md recording deferral to first production tenant onboarding
affects: [15-01-schema-orm, 15-02-payment-processor-crypto, 15-03-schemas-sale-lifecycle, 15-11-e2e-verification]

tech-stack:
  added: ["stripe>=15.2,<16", "cryptography>=46.0,<48.0 (explicit pin)", "reportlab>=4.4,<5.0", "@stripe/stripe-js ^9.7.0", "@stripe/react-stripe-js ^6.4.0"]
  patterns:
    - "Skip-stub tests use `try/except (ImportError, Exception)` to skip on Settings() ValidationError as well as ImportError — broad except is correct here because tests must skip cleanly in Wave 0 where pydantic-settings env vars are absent"
    - "Test files live at the production file path (components/pos/, lib/pos/, types/, tests/e2e/) — vitest.config.ts extended with components/**/*.test.tsx + types/**/*.test.ts include patterns"
    - "fake_stripe_processor fixture is a Protocol-shaped dataclass-returning fake — drop-in replacement that doesn't import the real `stripe` module"

key-files:
  created:
    - backend/tests/test_pos_models.py
    - backend/tests/test_sale_cart_load.py
    - backend/tests/test_payment_cash.py
    - backend/tests/test_stripe_processor.py
    - backend/tests/test_webhooks_stripe.py
    - backend/tests/test_receipt_pdf.py
    - backend/tests/test_receipt_email.py
    - backend/tests/test_daily_close.py
    - backend/tests/test_daily_close_export.py
    - backend/tests/test_refund_restock.py
    - backend/tests/test_refund_optical_cascade.py
    - backend/tests/test_split_tender.py
    - backend/tests/test_processor_protocol.py
    - backend/tests/test_payments_crypto.py
    - backend/tests/test_admin_payment_config.py
    - backend/tests/test_permissions_pos.py
    - backend/tests/test_payment_writeoff.py
    - backend/tests/test_pos_enums.py
    - backend/tests/test_sale_tax.py
    - backend/tests/test_sale_discount.py
    - backend/tests/test_sales_contract.py
    - components/pos/StripePaymentForm.test.tsx
    - lib/pos/printReceipt.test.ts
    - types/sales.contract.test.ts
    - tests/e2e/pos-checkout.spec.ts
    - tests/e2e/pos-refund.spec.ts
    - tests/e2e/pos-daily-close.spec.ts
    - .planning/phases/15-point-of-sale/15-BAA-CHECKPOINT.md
  modified:
    - requirements.txt
    - package.json
    - package-lock.json
    - .env.example
    - backend/tests/conftest.py
    - vitest.config.ts
    - .planning/REQUIREMENTS.md
    - .planning/phases/15-point-of-sale/15-VALIDATION.md

key-decisions:
  - "Defer BAA HIPAA checkpoint to first production-tenant onboarding — pilot is testmode-only dev tenant"
  - "Use `try/except Exception` (not just ImportError) in skip-stubs that transitively touch pydantic Settings — Wave-0 test env lacks SUPABASE_JWT_SECRET/SECRET_KEY so Settings() raises ValidationError on import"
  - "Extend vitest.config.ts include to components/**/*.test.tsx + types/**/*.test.ts so test files can live next to production code at the paths the plan dictates (not in a tests/ subtree)"

patterns-established:
  - "Wave-0 skip-stub: `try { lazy import } except Exception { module-level skip }` is the canonical pattern when the import chain may pull in pydantic-settings; ImportError alone is insufficient"
  - "fake_stripe_processor fixture returns dataclass instances mirroring the eventual PaymentProcessor Protocol contract — tests use it as a drop-in without importing the real Stripe SDK"

requirements-completed: []

duration: 35m
completed: 2026-05-27
---

# Phase 15 Plan 00: Wave-0 Foundation Summary

**Phase 15 Wave-0 scaffold lands cleanly: Stripe + cryptography + reportlab pinned, @stripe/stripe-js + react-stripe-js installed, 25 skip-stub test files green, PAYMENTS_FERNET_KEY + STRIPE_API_VERSION documented, POS-01..POS-16 traced in REQUIREMENTS.md, and 15-VALIDATION.md per-task map filled out across all 25 anticipated tasks in plans 15-00..15-11.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 4 (3 auto, 1 human-action checkpoint)
- **Files modified:** 36 (29 created, 7 modified)
- **Commits:** 4 atomic + this metadata commit

## Accomplishments

- All Stripe + cryptography + reportlab deps importable in both runtimes (`stripe.VERSION == '15.2.0'`, `cryptography 46.0.5`, `reportlab 4.4.10`, `@stripe/react-stripe-js` resolves)
- `pytest backend/tests/test_pos_*.py` exits 0 with 21 clean skip-stubs (no errors, no failures); `npx vitest run components/pos/ lib/pos/ types/` exits 0 with 3 skip-stubs
- `.planning/REQUIREMENTS.md` now contains 16 POS-XX requirements + traceability rows; coverage 141 → 157, pending 74 → 90
- `15-VALIDATION.md` per-task map has 25 rows (one per anticipated task in plans 15-00..15-11), zero `(TBD)` placeholders, `nyquist_compliant: true`
- BAA HIPAA checkpoint **deferred** to first production-tenant onboarding (pilot is testmode-only); deferral recorded at `15-BAA-CHECKPOINT.md` with explicit re-open trigger conditions

## Task Commits

1. **Task 1: Pin deps + env vars** — `c4241a2` (chore)
2. **Task 2: conftest fixtures + 25 test scaffolds + REQUIREMENTS POS-01..16** — `b5cb413` (test)
3. **Task 3: Pre-populate 15-VALIDATION.md per-task table** — `8c55fb6` (docs)
4. **Task 4: BAA HIPAA checkpoint — deferred decision** — `48048a6` (docs)

## Decisions Made

- **BAA checkpoint deferred** rather than approved — pilot launch milestone uses testmode-only dev tenant; production tenants must re-open this checkpoint before configuring live `sk_live_*` keys (see `15-BAA-CHECKPOINT.md` for the re-open trigger conditions)
- **Broad `except Exception` in skip-stubs** (not just `except ImportError`) — Wave-0 test env lacks `SUPABASE_JWT_SECRET` + `SECRET_KEY`, so importing any module that transitively touches `backend.core.config.Settings()` raises `pydantic_core.ValidationError`, not `ImportError`. Catching only `ImportError` would have failed the test instead of skipping cleanly.
- **Test files at production paths** (`components/pos/`, `lib/pos/`, `types/`, `tests/e2e/`) instead of a single `tests/` subtree — required extending `vitest.config.ts` include patterns with `components/**/*.test.tsx` and `types/**/*.test.ts` (plus `exclude: tests/e2e/**` to keep Playwright specs out of vitest).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stripe 15.x removed `stripe.__version__` attribute**
- **Found during:** Task 1 verify command
- **Issue:** Plan's automated verify ran `import stripe; print(stripe.__version__)` and `assert stripe.__version__.startswith('15.')`. Stripe-python 15.x exposes `stripe.VERSION` not `stripe.__version__`.
- **Fix:** Switched verify to `stripe.VERSION` — version IS `15.2.0` (semantic check still satisfied); no code change to plan deliverables.
- **Verification:** `python -c "import stripe; print(stripe.VERSION)"` → `15.2.0`.

**2. [Rule 2 - Missing Critical] vitest include did not match `components/**/*.test.tsx` or `types/**/*.test.ts`**
- **Found during:** Task 2 vitest run
- **Issue:** Plan calls for `components/pos/StripePaymentForm.test.tsx` and `types/sales.contract.test.ts`, but `vitest.config.ts` only included `tests/**`, `lib/**`, `store/**`. The other two files were silently dropped — vitest reported 1 file (printReceipt) instead of 3.
- **Fix:** Extended `vitest.config.ts` include patterns; added `exclude: tests/e2e/**` so Playwright specs don't get picked up by vitest. Both new test files now run (skip) cleanly.
- **Verification:** `npx vitest run components/pos/StripePaymentForm.test.tsx lib/pos/printReceipt.test.ts types/sales.contract.test.ts` → 3 files, 9 tests todo, all skipped.

**3. [Rule 1 - Bug] `except ImportError` insufficient for tests transitively importing `backend.core.config.Settings`**
- **Found during:** Task 2 pytest run on `test_webhooks_stripe.py` and `test_permissions_pos.py`
- **Issue:** Phase 12 `backend/api/routes/webhooks.py` already exists and is importable, but its import chain instantiates `Settings()` at module load, which raises `pydantic.ValidationError` (missing `SUPABASE_JWT_SECRET`, `SECRET_KEY`) in the bare pytest env. `except ImportError` did not catch this → test ERRORED instead of skipping.
- **Fix:** Switched both files to `except Exception` and moved the import inside the test body (so pytest sees a skip, not a collection error). Pattern documented in summary frontmatter `patterns-established`.
- **Verification:** `pytest backend/tests/test_pos_*.py backend/tests/test_*pos*.py backend/tests/test_*sale*.py backend/tests/test_*refund*.py backend/tests/test_*receipt*.py backend/tests/test_*daily*.py backend/tests/test_*split*.py backend/tests/test_*processor*.py backend/tests/test_*payments_crypto*.py backend/tests/test_*admin_payment*.py backend/tests/test_*webhooks_stripe*.py backend/tests/test_*payment_writeoff*.py` → 21 skipped, 0 failed, 0 errors.

---

**Total deviations:** 3 auto-fixed (2 Rule-1 Bug, 1 Rule-2 Missing Critical)
**Impact on plan:** All three fixes are scaffold-only — no plan scope creep. The vitest include fix benefits every subsequent test file added to `components/` and `types/` (not just POS), so future plans don't hit the same silent-drop issue.

## Issues Encountered

None. All deviations were auto-handled per Rule 1/2 above.

## User Setup Required

None for Wave 0 — `PAYMENTS_FERNET_KEY` stays blank in `.env.example` until Plan 15-02 ships `backend/services/payments/crypto.py`, at which point the team will generate the master key once per environment.

## Next Phase Readiness

Wave-0 scaffold complete. Plan 15-01 can now:
- Land Alembic migration 0020 (8 new tables + 4 Tenant columns) — Wave-0 `test_pos_models.py` + `test_pos_enums.py` + `test_permissions_pos.py` will flip from skip to passing as the ORM symbols land
- Extend `clinical.py` with Sale/SaleLineItem/Payment/Refund/RefundLineItem/RefundPayment/DailyCloseRun/StripeWebhookEvent ORM
- Add 13 AuditAction + 6 ClinicalAction values + PERMISSION_MATRIX rows

Wave-0 test scaffolds activate as plans land — no rewrite needed.

BAA checkpoint deferred — must be re-opened before first production tenant. Pilot launch is testmode-only.

---
*Phase: 15-point-of-sale*
*Plan: 00 Wave-0 Foundation*
*Completed: 2026-05-27*
