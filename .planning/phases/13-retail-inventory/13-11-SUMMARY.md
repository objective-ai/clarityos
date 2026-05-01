---
phase: 13-retail-inventory
plan: 11
subsystem: ui
tags: [zustand, react, drawer, optical-orders, apiFetch]

requires:
  - phase: 13-02
    provides: Optical order backend endpoints (list/get/create/place/cancel/dispense)
  - phase: 13-03
    provides: OpticalOrder TS types (OrderStatus, OpticalOrderLineItem, OpticalOrderPlaceResponse)
  - phase: 13-06
    provides: BFF proxy routes for /api/optical-orders/*
provides:
  - opticalOrderStore (Zustand) — list + currentOrder + 7 actions
  - OrderDetailDrawer — 480px slide drawer mirroring AppointmentDetailDrawer
affects: [13-12, 13-13]

tech-stack:
  added: []
  patterns:
    - "Drawer pattern: 480px slide, ESC + backdrop close, hydration-safe early return-null"
    - "Zustand mutator pattern: replace existing list row by id + sync currentOrder when matching"
    - "apiFetch opt-in: top-level camelize-safe payloads only; opt out (raw fetch) for nested JSONB"

key-files:
  created:
    - store/opticalOrderStore.ts
    - components/orders/OrderDetailDrawer.tsx
  modified: []

key-decisions:
  - "Cancel CTA gated client-side via session role (owner/admin) AND non-terminal status — backend remains the authoritative gate."
  - "Used apiFetch (camelize/snakify) — OpticalOrder has no nested JSONB to protect, unlike inventoryStore which uses raw fetch for Product.attributes."
  - "Drawer is dumb — caller hydrates currentOrder via store.loadOrder(id) and passes the resolved order as a prop. Drawer never fetches itself."

patterns-established:
  - "OrderDetailDrawer mirrors AppointmentDetailDrawer (Phase 10.2 donor) — same panel className, ESC handler, hydration-safe early-return."
  - "Mutators (place/cancel/dispense) update the matching list row in place AND sync currentOrder when its id matches — no full refetch."

requirements-completed: [INV-15]

duration: 18min
completed: 2026-05-01
---

# Plan 13-11 Summary

**opticalOrderStore (Zustand, apiFetch + warnings) + OrderDetailDrawer (480px right-slide, mirrors AppointmentDetailDrawer) — unblocks 13-12 (patient orders tab) and 13-13 (optical-queue card)**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- `useOpticalOrderStore` exposes `orders`, `currentOrder`, `loading`, `error` plus 7 actions (`loadOrders`, `loadOrder`, `clearCurrentOrder`, `createOrder`, `placeOrder`, `cancelOrder`, `dispenseOrder`).
- `placeOrder` returns the full `OpticalOrderPlaceResponse` so callers can surface zero/low-stock warnings.
- `OrderDetailDrawer` ships line items, status timeline (created / placed / dispensed / cancelled), totalPrice, and a role + status-gated Cancel CTA that calls `store.cancelOrder` and auto-closes on success.
- Hydration-safe (Phase 10.2-07 fix: `if (!open && !order) return null`); ESC + backdrop close; `role="dialog"` + `aria-modal`.

## Task Commits

1. **Task 1: opticalOrderStore** — `80cccc0` (feat)
2. **Task 2: OrderDetailDrawer** — `71178a5` (feat)

**Plan metadata:** `be9b662` (docs: plan)

## Files Created

- `store/opticalOrderStore.ts` — Zustand store wrapping the optical-order BFF endpoints; uses `apiFetch` (camelize-safe — no JSONB nested keys to protect).
- `components/orders/OrderDetailDrawer.tsx` — 480px right-slide drawer; line items, timeline, gated Cancel CTA.

## Decisions Made

- **apiFetch over raw fetch:** OpticalOrder has no nested JSONB attribute keys, so transparent camelize/snakify is safe and avoids hand-mapping each field. Contrast with `inventoryStore` (Phase 13-09), which opts out for `Product.attributes`.
- **Cancel CTA gating:** Client-side gate uses session `role` (case-insensitive match against `owner`/`admin`) AND non-terminal status (`draft` / `placed`). Backend remains the source of truth — the client gate is UX, not security.
- **Drawer stays dumb:** It receives the resolved `OpticalOrder` as a prop. Hydration is the caller's responsibility (`store.loadOrder(id)` then pass `currentOrder`). Keeps the drawer re-mount-safe and easy to test.
- **Native `confirm()` for cancel:** v1 uses browser-native `confirm()`. Future polish can swap in shadcn `AlertDialog` when consistency across other destructive actions matters more.

## Deviations from Plan

None — plan executed verbatim. The action templates in PLAN.md were dropped in with only minor whitespace/formatting nits to match local prettier.

## Issues Encountered

None.

## Next Phase Readiness

- **13-12 (patient orders tab):** can call `loadOrders({ patientId })` and render `<OrderDetailDrawer />` directly.
- **13-13 (optical queue):** can call `loadOrders({ encounterId })`, `createOrder`, `placeOrder`, and reuse the drawer for detail.

---
*Phase: 13-retail-inventory*
*Plan: 11*
*Completed: 2026-05-01*
