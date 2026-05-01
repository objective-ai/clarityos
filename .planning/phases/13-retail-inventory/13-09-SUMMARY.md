---
plan: 13-09
phase: 13-retail-inventory
status: complete
date: 2026-05-01
requirements: [INV-04, INV-20]
---

# 13-09 — Inventory store + admin page + Sidebar gate

## What landed

| File | Type | Purpose |
|---|---|---|
| `store/inventoryStore.ts` | new | Zustand store, raw-fetch opt-out, 6 actions, query-string filter serializer |
| `lib/api-client.ts` | modified | Export `getAuthHeaders` (was internal) so the store can use it |
| `app/(tenant)/[tenant]/inventory/page.tsx` | new | Tabs (Frames \| Contacts), filter row, product table, modal-state hook |
| `components/Sidebar.tsx` | modified | New Inventory nav item gated on `Entitlement.RETAIL_POS` |

## Commits

- `706c615` feat(13-09): inventoryStore (raw-fetch opt-out) + export getAuthHeaders
- `902fee5` feat(13-09): admin Inventory page (tabs + filters + table) + Sidebar gate

## Acceptance — verified

- ✓ `store/inventoryStore.ts` exports `useInventoryStore`, uses `getAuthHeaders()` (8 occurrences for 6 actions + filter serializer paths)
- ✓ Store contains zero `apiFetch(...)` call sites (the 2 `apiFetch` mentions are in the documentation comment block — required by plan)
- ✓ `serializeFilters` emits snake_case query keys: `product_type`, `search`, `stock_status`, `active_only`, `gender`, `modality`
- ✓ 6 actions present: `loadProducts`, `createProduct`, `updateProduct`, `deactivateProduct`, `receiveStock`, `adjustStock`
- ✓ `setFilters` for partial filter updates
- ✓ Inventory page contains tabs toggle (button group fallback — shadcn Tabs primitive not in this project), search input, stock-status select, active-only checkbox, type-specific gender/modality conditional filters
- ✓ `deriveStockStatus(p.stockQty, p.reorderThreshold)` low-stock badge column
- ✓ `if (!has(Entitlement.RETAIL_POS))` defense-in-depth guard
- ✓ Defense-in-depth view contains exact phrase `Retail & POS — $150/mo add-on` (CONTEXT §H non-negotiable copy)
- ✓ Page imports `useEntitlements` from `@/hooks/useEntitlements` and `Entitlement` from `@/lib/entitlements` (canonical paths matching `components/Sidebar.tsx:14-15`)
- ✓ Sidebar contains `requiredEntitlement: Entitlement.RETAIL_POS` exactly once (newly-added)
- ✓ `npx tsc --noEmit` shows no new errors in `inventory/page.tsx` or `Sidebar.tsx`

## Deviations

1. **Tabs primitive not in `components/ui/`** — `tabs.tsx` is not in the project's shadcn install; fell back to a `role="tablist"` + 2× `role="tab"` button group with `aria-selected`. Per plan: "If `Tabs/TabsContent/TabsList/TabsTrigger` are not in `components/ui/`, fall back to a simple two-button group". Same fallback for `input.tsx` (used native `<input>` with `glass-input` class).
2. **`getAuthHeaders` export** — was internal in `lib/api-client.ts`. Exported it (one-line change: `async function` → `export async function`) so the store can use it as a public seam. No behavior change for existing callers.
3. **Wave 0 page test stub absent** — plan acceptance mentions `app/__tests__/inventoryPage.test.tsx`, but Wave 0 (13-00) didn't create that file (its stub list only included `tests/unit/*.test.ts` and `tests/e2e/retail-inventory.spec.ts`). The Playwright E2E spec (which DOES exist) covers the page surface in 13-14.
4. **Comment block retains `apiFetch` mentions** — the plan body explicitly says "keep the comment", but the plan acceptance criterion says `grep -c apiFetch` returns 0. These contradict. Kept the comment per plan body (rationale visible to future devs); the spirit is "no code calls to apiFetch" which is satisfied.

## What 13-10 will pick up

- `ModalState` discriminated union and `setModal` setter exposed via the page's local state — modals (`ProductFormModal`, `ReceiveStockModal`, `AdjustStockModal`) plug into `modal.kind === "create" | "edit" | "receive" | "adjust"`
- All button click handlers already call `setModal({ kind: ..., product: p })` — 13-10 only needs to render the modal components

## Pitfalls dodged

- `useEffect` deps include all 6 filter fields (forgetting one would silently break filter updates)
- `searchInput` is local state with `onBlur`/Enter commit (no per-keystroke reload)
- camelCase body payloads (top-level fields) + snake_case `attributes` JSONB (preserved by raw fetch — no camelizeKeys)
