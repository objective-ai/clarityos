---
phase: 13
slug: retail-inventory
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (BE)** | pytest 7.x + pytest-asyncio + httpx AsyncClient |
| **Framework (FE unit)** | vitest 1.x + @testing-library/react |
| **Framework (E2E)** | @playwright/test (storageState auth) |
| **Config file (BE)** | `backend/pytest.ini` + `backend/conftest.py` |
| **Config file (FE)** | `vitest.config.ts` + `tests/e2e/playwright.config.ts` |
| **Quick run command (BE)** | `cd backend && pytest tests/test_inventory.py tests/test_optical_orders.py -x` |
| **Quick run command (FE)** | `npx vitest run lib/__tests__/inventory.test.ts lib/__tests__/opticalOrders.test.ts` |
| **Full suite (BE)** | `cd backend && pytest -x` |
| **Full suite (FE)** | `npm run test && bash scripts/dev.sh pre-test && npx playwright test inventory.spec.ts optical-orders.spec.ts` |
| **Estimated runtime** | BE quick ~12s, FE quick ~6s, E2E ~45s, full ~3 min |

---

## Sampling Rate

- **After every task commit:** Run plan-scoped quick command (BE pytest target file or FE vitest target file)
- **After every plan wave:** Run full BE pytest suite + FE unit suite
- **Before `/gsd:verify-work`:** Full suite green (BE + FE unit + Playwright `inventory.spec.ts` + `optical-orders.spec.ts`)
- **Max feedback latency:** 15 seconds for quick; 3 minutes for full

---

## Per-Task Verification Map

> Final task IDs assigned by gsd-planner. The map below is the requirement-to-test seed; planner extends with `{plan}-{task}` IDs.

| Plan (anticipated) | Wave | Requirement | Test Type | Automated Command | File Status |
|---|---|---|---|---|---|
| 00-test-foundation | 0 | INV-VALID | infrastructure | `cd backend && pytest tests/test_inventory.py --collect-only` | ❌ W0 — create stubs |
| 01-product-model | 1 | INV-06 (Product schema) | unit/orm | `cd backend && pytest tests/test_inventory.py::test_product_create_with_attrs -x` | ❌ W0 |
| 01-product-model | 1 | INV-07 (partial unique SKU index) | migration/integration | `cd backend && pytest tests/test_inventory.py::test_sku_unique_only_when_active -x` | ❌ W0 |
| 02-inventory-routes | 1 | INV-01 (admin CRUD) | api integration | `cd backend && pytest tests/test_inventory_routes.py::test_product_crud -x` | ❌ W0 |
| 02-inventory-routes | 1 | INV-08 (restock writes audit) | api integration | `cd backend && pytest tests/test_inventory_routes.py::test_receive_stock_writes_audit -x` | ❌ W0 |
| 03-optical-order-model | 1 | INV-09 (OpticalOrder + LineItem schema) | unit/orm | `cd backend && pytest tests/test_optical_orders.py::test_order_create_draft -x` | ❌ W0 |
| 04-order-routes | 2 | INV-02 (create order from Rx) | api integration | `cd backend && pytest tests/test_optical_order_routes.py::test_create_order_with_rx -x` | ❌ W0 |
| 04-order-routes | 2 | INV-03 (place decrements stock — atomicity) | transaction | `cd backend && pytest tests/test_optical_order_routes.py::test_place_decrements_stock_atomically -x` | ❌ W0 — **CRITICAL** |
| 04-order-routes | 2 | INV-10 (cancel restocks) | transaction | `cd backend && pytest tests/test_optical_order_routes.py::test_cancel_restocks_atomically -x` | ❌ W0 — **CRITICAL** |
| 04-order-routes | 2 | INV-11 (concurrent place — FOR UPDATE) | transaction | `cd backend && pytest tests/test_optical_order_routes.py::test_concurrent_place_no_oversell -x` | ❌ W0 |
| 04-order-routes | 2 | INV-12 (zero-stock soft-block warning) | api integration | `cd backend && pytest tests/test_optical_order_routes.py::test_zero_stock_returns_warning -x` | ❌ W0 |
| 05-bff-routes | 2 | INV-13 (BFF proxy contract) | contract | `cd backend && pytest tests/test_inventory_contracts.py -x` + `npx vitest run lib/__tests__/inventoryContract.test.ts` | ❌ W0 |
| 06-entitlement-gate | 2 | INV-14 (retail_pos entitlement) | unit BE+FE | `cd backend && pytest tests/test_entitlements.py::test_retail_pos -x` + `npx vitest run lib/__tests__/entitlements.test.ts -t retail_pos` | ❌ W0 |
| 07-inventory-page | 3 | INV-04 (per-type tabs + filters) | component + E2E | `npx vitest run app/__tests__/inventoryPage.test.tsx` + `npx playwright test inventory.spec.ts -g "filter"` | ❌ W0 |
| 08-patient-orders-tab | 3 | INV-05 (patient order history) | E2E | `npx playwright test inventory.spec.ts -g "order history"` | ❌ W0 |
| 09-order-drawer | 3 | INV-15 (order detail drawer) | component | `npx vitest run components/__tests__/OrderDetailDrawer.test.tsx` | ❌ W0 |
| 10-optical-queue-wire | 3 | INV-16 (encounter rollup) | unit + E2E | `cd backend && pytest tests/test_optical.py::test_encounter_optical_status_rollup -x` + Playwright | ❌ W0 |
| 11-seed-data | 1 | INV-17 (10 frames + 5 contacts) | smoke | `cd backend && python -m pytest tests/test_seed.py::test_inventory_seed -x` | ❌ W0 |
| 12-e2e-spec | 4 | INV-01..05 (5 ROADMAP criteria E2E) | E2E | `bash scripts/dev.sh pre-test && npx playwright test inventory.spec.ts` | ❌ W0 |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · W0 = created in Wave 0*

---

## Wave 0 Requirements

Wave 0 plan (`00-test-foundation` or equivalent) MUST create:

**Backend pytest files:**
- [ ] `backend/tests/test_inventory.py` — Product ORM stubs, partial-unique-SKU index test, JSONB attribute roundtrip
- [ ] `backend/tests/test_inventory_routes.py` — list/create/patch/delete/receive/adjust route stubs (httpx AsyncClient)
- [ ] `backend/tests/test_optical_orders.py` — OpticalOrder + LineItem ORM stubs
- [ ] `backend/tests/test_optical_order_routes.py` — place/cancel/dispense atomicity stubs (place + cancel happen in **single TXN**, concurrent-place uses `with_for_update()`)
- [ ] `backend/tests/test_inventory_contracts.py` — Pydantic `by_alias=True` snake↔camel snapshot
- [ ] `backend/tests/test_entitlements.py::test_retail_pos` — entitlement key wired
- [ ] `backend/tests/test_seed.py::test_inventory_seed` — 10 frames + 5 contacts present
- [ ] `backend/conftest.py` — extend with `product_factory`, `optical_order_factory`, `inventory_transaction_factory` fixtures

**Frontend vitest files:**
- [ ] `lib/__tests__/inventoryContract.test.ts` — FE/BE contract test consuming OpenAPI snapshot
- [ ] `lib/__tests__/entitlements.test.ts` — extend with `retail_pos` case
- [ ] `app/__tests__/inventoryPage.test.tsx` — page renders tabs/filters
- [ ] `components/__tests__/OrderDetailDrawer.test.tsx` — drawer renders, ESC closes, cancel CTA gated

**Playwright E2E files:**
- [ ] `tests/e2e/inventory.spec.ts` — 5 ROADMAP criteria + zero-stock soft-block + entitlement-hidden state + low-stock badge
- [ ] `tests/e2e/optical-orders.spec.ts` — create-from-Rx via optical queue + walk-in flow + cancel restock

**No new framework installs.** pytest, pytest-asyncio, httpx, vitest, @testing-library/react, @playwright/test all in `requirements.txt` / `package.json`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar Inventory link visually present and entitlement-gated | INV-14 | Visual rendering + role-switch UX feel | DevMode → `switchDevRole(session, 'owner')` with `retail_pos` entitlement → confirm Inventory link visible. Switch to scenario without `retail_pos` → confirm hidden. Confirm upsell modal copy matches "Retail & POS — $150/mo add-on". |
| Order detail drawer animation feels right | INV-15 | Subjective animation pacing | Open drawer from patient Orders tab → confirm 480px slide-in matches `AppointmentDetailDrawer` cadence; ESC + backdrop close work. |
| Low-stock badge color/typography | INV-04 | Visual signal | Set product `stock_qty <= reorder_threshold` → confirm warning badge contrast and copy. |
| Toast on zero-stock soft-block | INV-12 | UX text + dismissal | Place order with zero-stock product → confirm toast copy + order still creates. |

---

## Validation Sign-Off

- [ ] All Wave 1+ tasks have `<automated>` verify command or Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all `❌ W0` references in the verification map
- [ ] No `--watch` mode flags in any verify command
- [ ] Feedback latency < 15s for quick, < 3 min for full
- [ ] Contract test (`test_inventory_contracts.py` + `inventoryContract.test.ts`) verifies Pydantic `by_alias` snake↔camel for Product.attributes JSONB (per `feedback_camelizekeys_nested.md`)
- [ ] Atomicity tests (place_decrements + cancel_restocks + concurrent_place) explicitly assert `db.commit()` rollback on simulated failure
- [ ] `nyquist_compliant: true` set in frontmatter once all boxes ticked

**Approval:** pending
