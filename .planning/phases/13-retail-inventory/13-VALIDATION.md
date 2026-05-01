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

<!-- m7 reconciliation 2026-05-01: filenames updated to match 13-00 actual files. nyquist_compliant remains false until execution. -->

> Final task IDs assigned by gsd-planner. The map below is the requirement-to-test seed; planner extends with `{plan}-{task}` IDs.

| Plan | Wave | Requirement | Test Type | Automated Command | File Status |
|---|---|---|---|---|---|
| 13-00 | 0 | INV-13 (test foundation) | infrastructure | `cd backend && pytest tests/test_inventory_atomicity.py tests/test_optical_order_lifecycle.py tests/test_optical_queue_rollup.py tests/test_inventory_permissions.py tests/test_optical_order_contract.py tests/test_seed_inventory.py --collect-only` | ✅ W0 stubs |
| 13-01 | 1 | INV-06 (Product schema) | unit/orm | `cd backend && pytest tests/test_inventory_atomicity.py::test_product_create_with_attrs -x` | ⬜ stub created |
| 13-01 | 1 | INV-07 (partial unique SKU index) | migration/integration | `cd backend && pytest tests/test_inventory_atomicity.py::test_sku_unique_only_when_active -x` | ⬜ stub created |
| 13-01 | 1 | INV-09 (OpticalOrder + LineItem schema) | unit/orm | `cd backend && pytest tests/test_optical_order_lifecycle.py::test_order_create_draft -x` | ⬜ stub created |
| 13-02 | 1 | INV-19 (permission matrix) | unit | `cd backend && pytest tests/test_inventory_permissions.py::test_view_inventory_in_matrix_for_all_roles tests/test_inventory_permissions.py::test_manage_inventory_owner_admin_only tests/test_inventory_permissions.py::test_cancel_optical_order_owner_admin_only -x` | ⬜ stub created |
| 13-02 | 1 | INV-14 (retail_pos entitlement) | unit BE+FE | `cd backend && pytest tests/test_inventory_permissions.py::test_retail_pos_entitlement_key -x` + `npx vitest run tests/unit/inventoryStore.test.ts -t retail_pos` | ⬜ stub created |
| 13-03 | 1 | INV-13 (Pydantic by_alias contract) | contract | `cd backend && pytest tests/test_optical_order_contract.py::test_product_response_camel_keys tests/test_optical_order_contract.py::test_optical_order_response_camel_keys -x` | ⬜ stub created |
| 13-04 | 2 | INV-01 (admin CRUD) | api integration | `cd backend && pytest tests/test_inventory_permissions.py::test_product_create_writes_audit_row -x` | ⬜ stub created |
| 13-04 | 2 | INV-08 (restock writes audit) | api integration | `cd backend && pytest tests/test_inventory_permissions.py::test_receive_stock_writes_audit -x` | ⬜ stub created |
| 13-05 | 2 | INV-02 (create order with optional encounter) | api integration | `cd backend && pytest tests/test_optical_order_lifecycle.py::test_walkin_no_encounter -x` | ⬜ stub created |
| 13-05 | 2 | INV-03 (place decrements stock — atomicity) | transaction | `cd backend && pytest tests/test_inventory_atomicity.py::test_place_decrements_stock_atomically -x` | ⬜ stub created — **CRITICAL** |
| 13-05 | 2 | INV-10 (cancel restocks) | transaction | `cd backend && pytest tests/test_inventory_atomicity.py::test_cancel_restocks_stock_atomically -x` | ⬜ stub created — **CRITICAL** |
| 13-05 | 2 | INV-11 (concurrent place — FOR UPDATE) | transaction | `cd backend && pytest tests/test_inventory_atomicity.py::test_concurrent_place_no_negative_stock tests/test_inventory_atomicity.py::test_concurrent_place_no_oversell -x` | ⬜ stub created |
| 13-05 | 2 | INV-12 (zero-stock soft-block warning) | api integration | `cd backend && pytest tests/test_inventory_atomicity.py::test_zero_stock_returns_warning -x` | ⬜ stub created |
| 13-05 | 2 | INV-09 (status lifecycle) | unit/orm | `cd backend && pytest tests/test_optical_order_lifecycle.py::test_status_lifecycle_draft_placed_dispensed -x` | ⬜ stub created |
| 13-07 | 3 | INV-16 (encounter rollup) | unit + E2E | `cd backend && pytest tests/test_optical_queue_rollup.py::test_encounter_optical_status_rollup tests/test_optical_queue_rollup.py::test_rollup_falls_back_when_only_cancelled_orders -x` | ⬜ stub created |
| 13-08 | 1 | INV-17 (10 frames + 5 contacts seed) | smoke | `cd backend && pytest tests/test_seed_inventory.py::test_inventory_seed -x` | ⬜ stub created |
| 13-09 | 3 | INV-04 (per-type tabs + filters) + INV-13 round-trip | component + contract | `npx vitest run tests/unit/inventoryStore.test.ts tests/unit/productAttributesRoundTrip.test.ts` | ⬜ stub created |
| 13-12 | 3 | INV-05 (patient order history) | E2E | `npx playwright test tests/e2e/retail-inventory.spec.ts -g "patient Orders tab"` | ⬜ stub created |
| 13-14 | 4 | INV-01..05 + INV-12 + INV-14 (5 ROADMAP criteria + soft-block + entitlement gate) | E2E | `bash scripts/dev.sh pre-test && npx playwright test tests/e2e/retail-inventory.spec.ts` | ⬜ stub created |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · W0 = created in Wave 0*

---

## Wave 0 Requirements

Wave 0 plan (`00-test-foundation` or equivalent) MUST create:

<!-- m7 reconciliation 2026-05-01: file list aligned with 13-00 PLAN. -->

**Backend pytest files (created by 13-00):**
- [x] `backend/tests/test_inventory_atomicity.py` — Product ORM, partial-unique-SKU, place/cancel atomicity, concurrent place, zero-stock soft-block stubs
- [x] `backend/tests/test_optical_order_lifecycle.py` — OpticalOrder draft/walkin/status-lifecycle stubs
- [x] `backend/tests/test_optical_queue_rollup.py` — encounter rollup stubs (INV-16)
- [x] `backend/tests/test_inventory_permissions.py` — permission matrix + retail_pos + audit-row stubs (INV-08, INV-14, INV-18, INV-19)
- [x] `backend/tests/test_optical_order_contract.py` — Pydantic `by_alias=True` snake↔camel snapshot (INV-13)
- [x] `backend/tests/test_seed_inventory.py` — INV-17 stub
- [x] `backend/tests/conftest.py` — extended with `product_factory`, `optical_order_factory`, `inventory_transaction_factory` fixtures

**Frontend vitest files (created by 13-00):**
- [x] `tests/unit/productAttributesRoundTrip.test.ts` — JSONB snake_case round-trip stub (INV-06, INV-13, Pitfall 1)
- [x] `tests/unit/inventoryStore.test.ts` — store happy-path stubs

**Playwright E2E files (created by 13-00):**
- [x] `tests/e2e/retail-inventory.spec.ts` — 6-scenario stub (5 ROADMAP criteria + zero-stock soft-block + entitlement-hidden state)

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
