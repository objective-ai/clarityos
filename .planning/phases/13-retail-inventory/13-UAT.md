---
status: testing
phase: 13-retail-inventory
source: 13-00 through 13-14 SUMMARY.md (gap closure: 13-15-SUMMARY.md)
started: 2026-05-01T00:00:00Z
updated: 2026-05-07T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 12
name: Optical Queue Card — Create Order CTA + Rollup Status
expected: |
  Optical page: queue cards show patients awaiting optical pickup. Each
  card has a "Create Order" CTA when retail_pos is enabled. Cards show a
  rollup status: "draft" if any draft order exists; "in_progress" if any
  placed order; "ready" if dispensed. Cancelled orders neither promote
  nor suppress the rollup.
awaiting: user verification

## Tests

### 1. Cold Start Smoke Test
expected: /inventory page accessible after cold start with retail_pos entitlement.
result: pass
note: |
  Resolved by plan 13-15 (gap closure). Verified end-to-end during 13-15:
  Sidebar Inventory link visible (no lock), /inventory renders 10 frames,
  GET /api/inventory/products/ returns 200, JWT app_metadata.entitlements
  contains retail_pos. See .planning/phases/13-retail-inventory/13-15-SUMMARY.md.

### 2. Inventory Page — Sidebar Nav + Frames/Contacts Tabs
expected: |
  Sidebar shows Inventory link. Page loads with Frames | Contacts tabs.
  Frames tab renders ~10 seeded frames with SKU, brand/model, stock, price,
  active badge, and Edit/Receive/Adjust actions per row.
result: pass

### 3. Inventory Filters — Search + Stock Status
expected: |
  Search box filters rows live by brand/model/SKU. Stock-status dropdown
  filters by "Low" / "In stock" / "Out of stock". Type "Ray-Ban" → only
  Ray-Ban rows. Pick "Low" → only rows where stock <= reorder_threshold.
  Clearing filters restores full list.
result: pass

### 4. Create New Frame Product
expected: |
  Click "Add Product" (or equivalent CTA). Form opens with brand, model,
  SKU, retail price, stock, attributes (eye_size, bridge, temple, color).
  Submit a frame "Test Brand / Model X / TST-001 / $200 / stock 5". Row
  appears in the Frames table. Reload page — row persists.
result: pass

### 5. Edit Existing Product
expected: |
  Click "Edit" on a Ray-Ban row. Form pre-fills with current values. Change
  retail price (e.g., $195 → $199.99). Submit. Row updates immediately
  with the new price. Reload — change persists.
result: pass

### 6. Receive Stock
expected: |
  Click "Receive" on a Ray-Ban row. Modal asks for qty + optional PO
  reference / note. Enter +5. Submit. Stock count on the row increases by
  5 immediately. An InventoryTransaction with reason="receive_stock" is
  written (visible in the row's history view if exposed; otherwise just
  confirm via stock delta).
result: pass

### 7. Adjust Stock — Negative Delta with Note
expected: |
  Click "Adjust" on a row. Modal asks for delta (+/-) + required note.
  Enter -2 and "broken display unit". Submit. Stock decreases by 2.
  Adjusting by 0 should be rejected (400). Adjustment to a soft-deleted
  product should still work (count corrections allowed on inactive).
result: pass

### 8. Patient Orders Tab + Walk-In Order Creation
expected: |
  Open any patient detail page. Tabs include "Orders" alongside Demographics
  / Insurance / Encounters. Click Orders. See an empty state with a
  "Create Order" CTA (walk-in flow — no encounter required). Click create,
  add a frame line item + a contact-lens line item, set retail prices,
  save as DRAFT. Order appears in the patient's order list with status=draft.
result: issue
reported: |
  Initial: "in order tab got this error: Failed to load orders: [object Object]"
   — transient, not reproducible after migration 0018 + FastAPI restart.
   Underlying apiFetch bug: 422 detail array stringifies to "[object Object]" instead of joining msg fields.
  Retry: "the product listing has a weird layout. not user friendly" — Walk-In modal product list shows brand·model
  centered, SKU and price/stock not visible, dots leading the labels suggest SKU/price columns rendering off-screen
  or hidden. Items appear at varying horizontal offsets (some far left, some centered).
severity: minor

### 9. Place Order — Atomic Stock Decrement
expected: |
  From a draft order with frame qty=2, click "Place Order". Status flips to
  "placed" (with placed_at timestamp). The frame product's stock_qty
  decreases by exactly 2 (atomically — refresh the inventory page to verify).
  An InventoryTransaction with reason="order_placed" is written linking
  order_id + product_id + delta=-2.
result: pass
note: |
  Verified server-side via direct DB query after a "Create & Place" walk-in order:
  - Aviator stock 6 → 5 (decremented by qty=1)
  - public.optical_orders row created with status='placed'
  - public.inventory_transactions row written: delta=-1, reason='order_placed'
  Surfaced UX gap during testing: OrderDetailDrawer has no Place CTA for draft
  orders (only the create-modal "Place immediately" checkbox can place). Logged
  in Gaps as drawer_missing_place_cta.

### 10. Zero-Stock Soft-Block Warning
expected: |
  Take a product to stock=0 via Adjust. Create a draft order with that
  product. Click Place Order. Returns HTTP 200 with a warnings array
  containing {code: "zero_stock"}. Stock goes negative. Order still places.
  This mirrors the Phase 10.2 overbooking pattern — soft-block, not hard
  reject.
result: pass
note: |
  Verified end-to-end: Lindberg stock=0, "Create & Place" walk-in order
  → 200 with warnings[{code: "zero_stock"}]. Stock went to -1. Order
  status="placed". Surfaced UX gap during testing: warning was set on a
  modal that onCreated immediately closed, so user saw no alert. Fixed
  by routing warnings through onCreated → OrdersTab → OrderDetailDrawer
  banner ("Order placed with warning" with bullet list). Queue card flow
  uses alert() since no drawer at that entry point. See commit (next).

### 11. Cancel Placed Order — Atomic Restock
expected: |
  From a placed order (frame qty=2, stock decremented by 2), click "Cancel
  Order". Status flips to "cancelled" with cancelled_at + reason. Frame
  stock increases by 2 (restock). An InventoryTransaction with
  reason="order_cancelled" is written. Cancelling a draft order writes NO
  inventory transaction (nothing was decremented to begin with).
result: pass
note: |
  Surfaced critical race condition during testing: rapid double-click
  on Cancel restocked twice (stock went up by 2 instead of 1 because both
  requests observed status='placed' and both ran the restock loop). Fixed
  in commit 79ef4e2 with two-layer defense:
    1. Backend: with_for_update() row-lock on OpticalOrder SELECT in
       place_order, cancel_order, dispense_order — second concurrent
       request waits, re-reads final status, and 409s.
    2. Frontend: Cancel button disabled during in-flight (label flips
       to "Cancelling..."); handleCancel guards on cancelling flag.
  Drawer also stays open after cancel so user sees status flip to
  "Cancelled" + new Cancelled timestamp in Timeline + Cancel CTA hidden
  (commit 721048e).

### 12. Optical Queue Card — Create Order CTA + Rollup Status
expected: |
  Optical page: queue cards show patients awaiting optical pickup. Each
  card has a "Create Order" CTA when retail_pos is enabled. Cards show a
  rollup status: "draft" if any draft order exists; "in_progress" if any
  placed order; "ready" if dispensed. Cancelled orders neither promote
  nor suppress the rollup.
result: [pending]

### 13. Soft-Delete (Deactivate) Product
expected: |
  Edit a product, toggle Active off, save. Row hides from the active list
  (or shows with greyed/inactive badge depending on filter). Stock_qty
  preserved. SKU is still queryable but new orders cannot select it.
  Toggling Active back on restores it. Partial unique index allows
  deactivated SKUs to coexist with a new active product on the same SKU.
result: [pending]

### 14. Entitlement Gate — Defense-in-Depth Message
expected: |
  Strip retail_pos from the live session via DevTools (window.__SESSION_STORE__
  → setSession with entitlements minus retail_pos), or test via a different
  tenant without the add-on. Sidebar Inventory link should hide / show
  locked. Direct nav to /sunview/inventory should show the upgrade gate
  ("Retail & POS — $150/mo add-on") not the table. Direct API call to
  /api/inventory/products/ should return 403 with detail.code =
  "ENTITLEMENT_REQUIRED" and detail.entitlement = "retail_pos".
result: [pending]

## Summary

total: 14
passed: 10
issues: 1
pending: 3
skipped: 0
issues_minor: 2

## Gaps

- truth: "Patient Orders tab loads the patient's optical orders (or empty state) without error"
  status: failed
  reason: |
    Initial: "Failed to load orders: [object Object]" — transient at the time of testing,
    not reproducible after migration 0018 applied + FastAPI restart. apiFetch's HttpError
    message construction stringifies FastAPI 422 detail arrays as "[object Object]" instead
    of joining the {msg} fields, so any 422 surface in the future will look like this too.
    Retry surfaced UX layout issue (see below).
  severity: minor
  test: 8
  root_cause: |
    Two adjacent gaps surfaced under one test:
    1. apiFetch HttpError stringification (lib/api-client.ts:121) — when FastAPI returns
       422 with detail: [{type, loc, msg, input}], the FE renders "[object Object]" because
       Array.toString() joins object stringifications, not the .msg fields.
    2. CreateWalkInOrderModal product list layout — buttons render leading dot ("· Brand Model")
       suggesting SKU prefix is hidden / column widths broken, AND items appear at varying
       horizontal offsets. The two-generic structure (SKU+brand+model) and (price+stock) is
       likely being centered or breaking flex justify-between under the modal's narrow width.
  artifacts:
    - path: lib/api-client.ts
      issue: "apiFetch:121 — when errBody.detail is an array, message becomes the array; HttpError stringifies as '[object Object]'"
    - path: components/orders/CreateWalkInOrderModal.tsx
      issue: "Product list buttons hardcode text-white/50 and text-white/70 — invisible in light mode (white text on white modal bg). User screenshot showed text only when highlighted/selected."
    - path: components/orders/OrdersTab.tsx
      issue: "After modal close → onCreated → loadOrder(created.id), if loadOrder fails for any reason (race / stale token), the resulting error is shown as 'Failed to load orders: [object Object]' due to apiFetch bug above. So one bug masks another."
  missing:
    - "lib/api-client.ts apiFetch should detect array detail and join detail.map(d => d.msg) before throwing HttpError — restores readable validation errors"
    - "CreateWalkInOrderModal product list rows: replace text-white/50, text-white/70 with theme variables (text-[var(--text-muted)], text-[var(--text-secondary)]) so light/dark mode both render correctly"
    - "Audit other Phase 13 modals/drawers for hardcoded text-white classes that won't respect theme"
  debug_session: ""

- truth: "OrderDetailDrawer offers a Place CTA when status=draft so users can review-then-place"
  status: failed
  reason: "Drawer for a draft order shows only Cancel order — no Place button. The only place path today is the modal's 'Place immediately' checkbox during creation; users who saved as draft cannot promote to placed without re-opening a creation flow."
  severity: minor
  test: 9
  root_cause: "components/orders/OrderDetailDrawer.tsx renders only the Cancel CTA gate (lines 177-193). A 'Place order' branch for status=draft was never wired."
  artifacts:
    - path: components/orders/OrderDetailDrawer.tsx
      issue: "No Place CTA when order.status=='draft'; canPlaced gate not implemented"
  missing:
    - "Add Place CTA in OrderDetailDrawer when status=='draft' and user has CREATE_OPTICAL_ORDER permission. Calls store.placeOrder(orderId)."
  debug_session: ""
