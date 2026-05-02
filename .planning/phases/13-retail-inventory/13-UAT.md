---
status: testing
phase: 13-retail-inventory
source: 13-00 through 13-14 SUMMARY.md (gap closure: 13-15-SUMMARY.md)
started: 2026-05-01T00:00:00Z
updated: 2026-05-02T08:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 7
name: Adjust Stock — Negative Delta with Note
expected: |
  Click "Adjust" on a row. Modal asks for delta (+/-) + required note.
  Enter -2 and "broken display unit". Submit. Stock decreases by 2.
  Adjusting by 0 should be rejected (400). Adjustment to a soft-deleted
  product should still work (count corrections allowed on inactive).
awaiting: user response

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
result: [pending]

### 8. Patient Orders Tab + Walk-In Order Creation
expected: |
  Open any patient detail page. Tabs include "Orders" alongside Demographics
  / Insurance / Encounters. Click Orders. See an empty state with a
  "Create Order" CTA (walk-in flow — no encounter required). Click create,
  add a frame line item + a contact-lens line item, set retail prices,
  save as DRAFT. Order appears in the patient's order list with status=draft.
result: [pending]

### 9. Place Order — Atomic Stock Decrement
expected: |
  From a draft order with frame qty=2, click "Place Order". Status flips to
  "placed" (with placed_at timestamp). The frame product's stock_qty
  decreases by exactly 2 (atomically — refresh the inventory page to verify).
  An InventoryTransaction with reason="order_placed" is written linking
  order_id + product_id + delta=-2.
result: [pending]

### 10. Zero-Stock Soft-Block Warning
expected: |
  Take a product to stock=0 via Adjust. Create a draft order with that
  product. Click Place Order. Returns HTTP 200 with a warnings array
  containing {code: "zero_stock"}. Stock goes negative. Order still places.
  This mirrors the Phase 10.2 overbooking pattern — soft-block, not hard
  reject.
result: [pending]

### 11. Cancel Placed Order — Atomic Restock
expected: |
  From a placed order (frame qty=2, stock decremented by 2), click "Cancel
  Order". Status flips to "cancelled" with cancelled_at + reason. Frame
  stock increases by 2 (restock). An InventoryTransaction with
  reason="order_cancelled" is written. Cancelling a draft order writes NO
  inventory transaction (nothing was decremented to begin with).
result: [pending]

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
passed: 6
issues: 0
pending: 8
skipped: 0

## Gaps

[none — single root-cause blocker resolved by plan 13-15]
