---
phase: 15
slug: point-of-sale
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-27
updated: 2026-05-27
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (backend) / vitest (frontend) / playwright (E2E) |
| **Config file** | `backend/pytest.ini`, `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run <file>` / `cd backend && pytest tests/test_pos.py` |
| **Full suite command** | `npm run test && cd backend && pytest` |
| **Estimated runtime** | ~45 seconds (unit) / ~3 minutes (full + E2E) |

---

## Sampling Rate

- **After every task commit:** Run quick targeted test for touched module
- **After every plan wave:** Run full unit suite (`npm run test && pytest`)
- **Before `/gsd:verify-work`:** Full suite + key E2E specs must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Pre-populated by Plan 15-00 Task 3 (Wave 0) — one row per anticipated task across plans 15-00..15-11. Plan 15-11 updates the `File Exists` and `Status` columns during verification but does NOT backfill rows. Per checker iter 1 WARNING #4.*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-00-01 | 00 | 1 | POS-08 | smoke | `python -c "import stripe, cryptography, reportlab"` | ✅ | ✅ passing |
| 15-00-02 | 00 | 1 | POS-12, POS-16 | unit | `pytest backend/tests/test_pos_*.py` | ✅ | ✅ passing |
| 15-00-03 | 00 | 1 | POS-16 | manual | `grep -cE "^\\| 15-" .planning/phases/15-point-of-sale/15-VALIDATION.md` | ✅ | ✅ passing |
| 15-00-04 | 00 | 1 | POS-03, POS-08 | manual | `test -f .planning/phases/15-point-of-sale/15-BAA-CHECKPOINT.md` | ❌ W0 | ⬜ pending |
| 15-01-01 | 01 | 2 | POS-12 | unit | `pytest backend/tests/test_pos_models.py backend/tests/test_pos_enums.py backend/tests/test_permissions_pos.py` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 3 | POS-07 | unit | `pytest backend/tests/test_stripe_processor.py backend/tests/test_processor_protocol.py` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 3 | POS-08 | unit | `pytest backend/tests/test_payments_crypto.py` | ❌ W0 | ⬜ pending |
| 15-03-01 | 03 | 3 | POS-01, POS-13, POS-14 | unit | `pytest backend/tests/test_sale_cart_load.py backend/tests/test_payment_cash.py backend/tests/test_sale_tax.py backend/tests/test_split_tender.py` | ❌ W0 | ⬜ pending |
| 15-03-02 | 03 | 3 | POS-16 | contract | `pytest backend/tests/test_sales_contract.py && npx vitest run types/sales.contract.test.ts` | ❌ W0 | ⬜ pending |
| 15-04-01 | 04 | 4 | POS-01, POS-06 | route | `pytest backend/tests/test_sale_cart_load.py backend/tests/test_split_tender.py` | ❌ W0 | ⬜ pending |
| 15-04-02 | 04 | 4 | POS-02, POS-11, POS-15 | route | `pytest backend/tests/test_payment_cash.py backend/tests/test_payment_writeoff.py backend/tests/test_sale_discount.py` | ❌ W0 | ⬜ pending |
| 15-05-01 | 05 | 5 | POS-05, POS-09 | unit | `pytest backend/tests/test_refund_restock.py backend/tests/test_refund_optical_cascade.py` | ❌ W0 | ⬜ pending |
| 15-05-02 | 05 | 5 | POS-05 | route | `pytest backend/tests/test_refund_restock.py` | ❌ W0 | ⬜ pending |
| 15-06-01 | 06 | 5 | POS-03 | unit | `pytest backend/tests/test_receipt_pdf.py` | ❌ W0 | ⬜ pending |
| 15-06-02 | 06 | 5 | POS-03 | unit | `pytest backend/tests/test_receipt_email.py` | ❌ W0 | ⬜ pending |
| 15-07-01 | 07 | 5 | POS-04, POS-10 | unit | `pytest backend/tests/test_daily_close.py` | ❌ W0 | ⬜ pending |
| 15-07-02 | 07 | 5 | POS-04 | unit | `pytest backend/tests/test_daily_close_export.py` | ❌ W0 | ⬜ pending |
| 15-08-01 | 08 | 6 | POS-02, POS-08 | route | `pytest backend/tests/test_webhooks_stripe.py backend/tests/test_admin_payment_config.py` | ❌ W0 | ⬜ pending |
| 15-08-02 | 08 | 6 | POS-01..POS-11 | smoke | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 15-09-01 | 09 | 7 | POS-01, POS-02 | unit | `npx vitest run components/pos/StripePaymentForm.test.tsx lib/pos/printReceipt.test.ts` | ❌ W0 | ⬜ pending |
| 15-09-02 | 09 | 7 | POS-01, POS-02 | smoke | `npx tsc --noEmit && npx next build --no-lint 2>&1 \| grep -c "POS"` | ❌ W0 | ⬜ pending |
| 15-10-01 | 10 | 8 | POS-04, POS-05, POS-10 | unit | `npx vitest run components/pos/` | ❌ W0 | ⬜ pending |
| 15-10-02 | 10 | 8 | POS-01..POS-15 | smoke | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 15-11-01 | 11 | 9 | POS-01..POS-10 | e2e | `npx playwright test tests/e2e/pos-checkout.spec.ts tests/e2e/pos-refund.spec.ts tests/e2e/pos-daily-close.spec.ts` | ❌ W0 | ⬜ pending |
| 15-11-02 | 11 | 9 | POS-03, POS-08 | manual | `test -f .planning/phases/15-point-of-sale/15-HUMAN-VERIFY-SIGNOFF.md` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `backend/tests/test_pos_models.py` — POS sale/line/payment model tests
- [ ] `backend/tests/test_pos_routes.py` — checkout endpoint contract tests
- [ ] `backend/tests/conftest.py` — POS fixtures (cart factory, payment factory)
- [ ] `tests/lib/pos.test.ts` — frontend POS logic unit tests
- [ ] `tests/e2e/pos-checkout.spec.ts` — end-to-end checkout flow

*Wave 0 plan should install/scaffold any missing test files before feature work begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stripe card payment success | Payment flow | Live Stripe test mode integration | Use Stripe test card 4242 4242 4242 4242 in dev, observe webhook ledger entry |
| PDF receipt rendering visual | Receipt | Visual layout check | Open generated PDF, verify totals, line items, tax math, clinic header |
| Print receipt via browser dialog | Receipt | OS-level print dialog | Click "Print", confirm browser print preview shows formatted receipt |
| Daily close report sign-off UX | Daily close | Cashier workflow check | Run close at EOD, verify variance display + lock behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
