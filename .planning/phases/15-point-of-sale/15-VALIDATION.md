---
phase: 15
slug: point-of-sale
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-27
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
| 15-01-01 | 01 | 1 | (TBD — populate from Plan 15-00 Task 3) | unit | `cd backend && pytest tests/test_pos_models.py` | ❌ W0 | ⬜ pending |

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
