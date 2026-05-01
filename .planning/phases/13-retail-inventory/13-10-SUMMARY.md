---
plan: 13-10
phase: 13-retail-inventory
status: complete
date: 2026-05-01
requirements: [INV-01, INV-08]
---

# 13-10 — ProductFormModal + ReceiveStockModal + AdjustStockModal + page wire-in

## What landed

| File | Type | Purpose |
|---|---|---|
| `components/inventory/ProductFormModal.tsx` | new | Dual-mode (create/edit) modal with type-aware attribute fields |
| `components/inventory/ReceiveStockModal.tsx` | new | Receive-stock modal: qty + optional PO ref + optional note |
| `components/inventory/AdjustStockModal.tsx` | new | Manual adjust modal: signed delta + required note (audit) |
| `app/(tenant)/[tenant]/inventory/page.tsx` | modified | Imports + renders the 3 modals based on `modal.kind` |

## Commits

- `b7a09cc` feat(13-10): ProductFormModal — create/edit with type-aware attribute fields
- `ad0ff1b` feat(13-10): ReceiveStockModal + AdjustStockModal + inventory page wire-in

## Acceptance — verified

- ✓ `components/inventory/ProductFormModal.tsx` exists, exports `ProductFormModal`, accepts `open`/`onClose`/`product?`/`productType?`/`onSaved?`
- ✓ Component uses `useInventoryStore` for both `createProduct` and `updateProduct`
- ✓ `buildAttributes()` emits snake_case JSONB keys: `eye_size`, `bridge_size`, `temple_size`, `base_curve`, `box_size` (grep confirms `eye_size` and `base_curve` literal occurrences ≥2 each)
- ✓ Type-conditional rendering: frame block (eye/bridge/temple/gender/material) vs contact_lens block (modality/base_curve/diameter/power/box_size)
- ✓ Validation: brand+model+retailPrice required; eye_size required for frames; base_curve+diameter+power required for contacts; non-zero integer for AdjustStock; note required for AdjustStock
- ✓ `components/inventory/ReceiveStockModal.tsx` exists, calls `useInventoryStore((s) => s.receiveStock)`, validates `qtyReceived > 0`
- ✓ `components/inventory/AdjustStockModal.tsx` exists, calls `useInventoryStore((s) => s.adjustStock)`, validates `qtyDelta !== 0` and non-empty `note`
- ✓ `inventory/page.tsx` imports all 3 modals and renders them based on `modal.kind`
- ✓ Page contains all three render gates: `modal.kind === "create" || modal.kind === "edit"`, `modal.kind === "receive"`, `modal.kind === "adjust"`
- ✓ `npx tsc --noEmit` adds no new errors in modified files (pre-existing E2E spec errors unrelated)

## Deviations

1. **No `@/components/ui/input` primitive** — same situation as 13-09: shadcn `Input` is not installed in this project (only `accordion`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `save-status-dot`, `skeleton`, `stat-card`). Plan body imports `Input` but the 13-09 SUMMARY explicitly notes this fallback. Replaced every `<Input ... />` with `<input className="glass-input" ... />` to mirror 13-09 page styling. Visual parity preserved via the existing `glass-input` Tailwind class.

2. **Strict `Number.isInteger` check** added in both stock modals — plan said "positive integer" / "non-zero integer" but the snippet only checked `qty <= 0` / `delta === 0`. Added `!Number.isInteger(...)` guard so `1.5` or `2.7` are rejected client-side; backend Pydantic int field would reject anyway, but the inline error is friendlier.

3. **`onSaved` callback omitted from page wire-in** — plan included `onSaved={() => { /* store handles list refresh */ }}` as an empty-handler comment. Dropped the prop entirely (it's `?` optional). The store already mutates `products` in place inside `createProduct`/`updateProduct`/`receiveStock`/`adjustStock`, so no manual list refresh is needed.

4. **Removed the `data-testid="modal-state-marker"` placeholder div** — 13-09 added this as a Playwright hook for the e2e spec. With real modal renders mounted, the marker is redundant — the actual `<DialogContent>` (visible via `[role="dialog"]`) is what tests should select. The Playwright spec from 13-14 already targets the modal title + form fields directly.

## Pitfalls dodged

- **JSONB camelization** — `buildAttributes()` returns snake_case keys (`eye_size`, `base_curve`, `box_size`). The store already uses raw `fetch + getAuthHeaders()` (no `apiFetch` camelize layer), so the snake_case keys travel intact to Pydantic. Verified by reading 13-09 store + 13-09 SUMMARY.
- **SKU rename hazard** — Edit mode disables the SKU input. The DB has a partial unique index on `(tenant_id, sku) WHERE is_active=TRUE`; renaming SKU mid-life would break `inventory_transactions.optical_order_id` linkage indirectly and violates the "SKU is identity" invariant.
- **Decimal precision drift** — `retailPrice` and `costPrice` sent as strings (Pydantic `Decimal` accepts both, but strings sidestep float-binary drift on amounts like `199.99`).
- **ProductFormModal staying mounted across create+edit** — keeping it always-rendered with `open={kind==='create' || kind==='edit'}` lets the internal `useEffect([open, product])` reset/repopulate logic fire correctly on every open. Mounting it conditionally would mean the effect runs once on first render with stale closures.

## What this enables

- Phase 13's admin CRUD surface (INV-01) is now complete: list (13-09) + create/edit/receive/adjust (13-10).
- INV-08 stock-mutation flows ship with audit-quality data: ReceiveStock writes `InventoryTransaction(reason='receive', po_reference)`; AdjustStock writes `InventoryTransaction(reason='manual_adjust', note)` — both inside the primary DB transaction (per `clinical-safety.md`, no fire-and-forget).
- 13-11 (POS Sale flow) can now rely on a populated, mutable product catalog when wiring the cart.

## Manual smoke (deferred to 13-14 E2E spec)

End-to-end happy path is asserted by `tests/e2e/retail-inventory.spec.ts` (Playwright). The spec already references the modals by title text — verifying that the admin can:

1. Click "+ New Product" → ProductFormModal opens in create mode with productType locked to current tab
2. Submit a frame with eye_size → row appears in the table
3. Click "Receive" on that row → ReceiveStockModal opens; submit qty=10 → stockQty updates in place
4. Click "Adjust" → AdjustStockModal opens; submit -3 + note "shrinkage" → stockQty drops by 3
