---
phase: 13-retail-inventory
plan: 12
subsystem: ui
tags: [react, zustand, optical-orders, walk-in, entitlements, patient-detail]

requires:
  - phase: 13-09
    provides: useInventoryStore.loadProducts (product picker source)
  - phase: 13-11
    provides: opticalOrderStore (loadOrders, currentOrder, createOrder, placeOrder), OrderDetailDrawer
  - phase: 13-03
    provides: OpticalOrderCreatePayload + OpticalOrderLineItemCreatePayload types
provides:
  - OrdersTab — patient detail Orders tab (chronological list + drawer + walk-in CTA)
  - CreateWalkInOrderModal — product-picker modal posting createOrder with encounterId=null
  - Patient detail page registers Orders tab gated on Entitlement.RETAIL_POS
affects: [13-13]

tech-stack:
  added: []
  patterns:
    - "Patient-detail tab pattern: dynamic-imported tab body + entitlement-filtered tabs array via useMemo"
    - "Modal pattern: shadcn Dialog + raw glass-input fields (no @/components/ui/input — doesn't exist)"
    - "Defense-in-depth gating: tab filter AND render-branch entitlement guard"

key-files:
  created:
    - components/orders/OrdersTab.tsx
    - components/orders/CreateWalkInOrderModal.tsx
    - tests/unit/OrdersTab.test.tsx
  modified:
    - app/(tenant)/[tenant]/patients/[patientId]/page.tsx

key-decisions:
  - "Tab visibility derived from `useMemo(BASE_TABS + maybe orders, [has])` so tab list updates if entitlements ever flip live."
  - "Defense-in-depth on the render branch: `activeTab === 'orders' && has(Entitlement.RETAIL_POS)` — even if filter forgets to drop 'orders', body is gated."
  - "Modal stays open after place if warnings returned — yellow notice shown so user sees stock notice before navigating away."
  - "userRole pulled from useCurrentUser() (sessionStore) — same source as Sidebar/HealthDot. AppSession nests role inside user."

patterns-established:
  - "Walk-in vs encounter-linked orders share one modal: encounterId prop is optional, defaults to null."
  - "Sorting newest-first done client-side (`[...orders].sort(createdAt DESC)`) — store doesn't guarantee ordering."

requirements-completed: [INV-05]

duration: 22min
completed: 2026-05-01
---

# Plan 13-12 Summary

**Patient detail Orders tab: chronological optical-order history opening OrderDetailDrawer (13-11) + walk-in order creation modal — gated on Entitlement.RETAIL_POS.**

## Performance

- **Duration:** ~22 min
- **Tasks:** 2
- **Files created:** 3 (component, modal, test)
- **Files modified:** 1 (patient detail page)

## Accomplishments

- `OrdersTab` loads `loadOrders({ patientId })` on mount, renders newest-first with status badge + line-item count + total. Empty state shows a "Create the first order" CTA. Row click hydrates `currentOrder` and slides in `OrderDetailDrawer`. New Walk-In Order CTA opens the modal.
- `CreateWalkInOrderModal` lazily loads inventory (`loadProducts({ activeOnly: true })`) on open, supports add/update/remove line items, optional auto-place checkbox, surfaces backend warnings inline. Reusable for the encounter-linked entry point in 13-13 via the optional `encounterId` prop.
- Patient detail page now exposes "Orders" tab — dynamic import + memoized tabs filter + render-branch defense-in-depth.
- 4 RTL unit tests cover: load on mount, empty state, sort + render shape, row click → loadOrder.

## Task Commits

1. **Task 1: OrdersTab + tests** — `07a94ce`
2. **Task 2: CreateWalkInOrderModal + page registration** — `7f37a3a`

## Files Created

- `components/orders/OrdersTab.tsx` — patient-detail Orders tab body.
- `components/orders/CreateWalkInOrderModal.tsx` — product-picker modal; walk-in (encounterId=null) and encounter-linked both supported.
- `tests/unit/OrdersTab.test.tsx` — 4 tests around load/empty/render/click.

## Files Modified

- `app/(tenant)/[tenant]/patients/[patientId]/page.tsx` — dynamic-import OrdersTab, extend TabKey with `orders`, useMemo-derived tabs filtered by `Entitlement.RETAIL_POS`, render branch gated again, `userRole` plumbed from `useCurrentUser()`.

## Decisions Made

- **Tabs as memo, not module-scope const:** Was tempted to keep the literal `TABS` and just wrap in a function call, but `useMemo([has])` is the cleanest way to keep tab visibility live-reactive to entitlement changes (and it tracks the existing `useEntitlements()` hook already in the page).
- **No `@/components/ui/input`:** This component doesn't exist in the project (verified `ls components/ui/`). Followed `ProductFormModal.tsx` donor pattern with raw `<input className="glass-input" />` instead.
- **`userRole` source:** `useCurrentUser()?.role` from `sessionStore` — matches what `Sidebar.tsx` and `admin/page.tsx` already use. `AppSession.user.role` is the canonical role field.
- **Newest-first sort client-side:** Store doesn't guarantee ordering. Cheap `[...orders].sort()` keeps OrdersTab self-sufficient and matches the donor (MessagesTab also sorts client-side).

## Deviations from Plan

- Plan `<action>` block referenced `Input` from `@/components/ui/input` and `useMemo`-around-existing-`TABS`. Both adjusted: raw glass-input matches the actual UI primitives, and the tabs memo pulls from a renamed `BASE_TABS` const for clarity. No behavioral deviation — same defense-in-depth, same tab list.

## Issues Encountered

None — `npx tsc --noEmit` clean for all touched files (pre-existing E2E test errors are unrelated). All 4 unit tests pass.

## Next Phase Readiness

- **13-13 (encounter-linked entry point):** Reuses `CreateWalkInOrderModal` directly with `encounterId` pre-filled. The modal's title flips to "New optical order" automatically when `encounterId` is provided.

---
*Phase: 13-retail-inventory*
*Plan: 12*
*Completed: 2026-05-01*
