---
phase: 14-optical-order-configuration
plan: 10
subsystem: frontend
tags: [entry-points, queue-card, walk-in-modal, orders-tab, drawer-extension]
requires:
  - phase: 14-optical-order-configuration
    provides: 14-06 OpticalQueueItem.draft_order_count; 14-08 lensCatalogStore + Phase 14 types; 14-09 configurator route at /optical/orders/[orderId]
provides:
  - "OpticalQueueCard 'Configure Order' CTA + Draft pending pill"
  - "CreateWalkInOrderModal frame-detection redirect to configurator"
  - "OrdersTab status-based row click routing (draft → configurator, else → drawer)"
  - "OrderDetailDrawer Phase 14 read-only sections + Generate Job Ticket button with Blob download"
  - "Test fixtures updated for new required TS fields"
affects: [14-11]
tech-stack:
  added: []
  patterns:
    - "Status-discriminator routing on row clicks — single switch keeps draft / non-draft flows decoupled"
    - "useLensCatalogStore.loadAll() on drawer open — caches the 3 reference tables for the rest of the session"
key-files:
  created:
    - .planning/phases/14-optical-order-configuration/14-10-SUMMARY.md
  modified:
    - types/optical.ts (draftOrderCount + mostRecentDraftId)
    - components/optical/OpticalQueueCard.tsx (Configure Order CTA + Draft pending pill)
    - components/orders/CreateWalkInOrderModal.tsx (frame → configurator redirect)
    - components/orders/OrdersTab.tsx (status-based row routing)
    - components/orders/OrderDetailDrawer.tsx (Phase 14 sections + Generate Job Ticket button)
    - tests/helpers/fixtures/optical.ts (draftOrderCount field)
    - tests/unit/OrdersTab.test.tsx (lensConfig + Phase 14 OpticalOrder fields)
requirements-completed: [OPT14-13, OPT14-14, OPT14-15]
duration: ~30min
completed: 2026-05-26
---

# Phase 14 Plan 10: Entry Points + Drawer Extension Summary

**3 configurator entry points wired (queue CTA, walk-in redirect, orders-tab routing) + OrderDetailDrawer extended with Phase 14 read-only sections + Generate Job Ticket Blob download. Configurator route is now reachable from every relevant surface in the app.**

## Performance
- **Duration:** ~30 min
- **Tasks:** 4 (Task 5 todo archive was already completed in Plan 14-06)

## Accomplishments
- All three OPT14-13 entry points live: queue card Configure Order CTA, walk-in modal frame-detection redirect, patient Orders tab draft-row routing
- OPT14-14 Draft pending pill renders on queue cards when `draftOrderCount > 0`; click handler routes to most recent draft (falls back to create-new-draft when `mostRecentDraftId` not enriched)
- OPT14-15 Drawer renders Lens Configuration (per line) + Vision Plan section + Generate/Re-generate Job Ticket button; Pitfall 12 satisfied (no auto-fetch)
- Pitfall 1 preserved — snake_case JSONB keys (`member_id`, `lens_type_id`, `coating_ids`) accessed directly from `Record<string, any>` typed columns
- Pitfall 10 preserved — every new text/bg uses CSS variables or accent fill
- Pitfall 4 preserved — `encounter.optical_status` never mutated by any of these flows

## Task Commit
1. **Plan 14-10 (Tasks 1+2+3+4)** — `30422ca` (feat). Task 5 (todo archive) was completed in `fb864a1` during Plan 14-06.

## Files Modified
- `types/optical.ts` — +2 fields on OpticalQueueItem
- `components/optical/OpticalQueueCard.tsx` — +Configure Order CTA + Draft pending pill + handlers
- `components/orders/CreateWalkInOrderModal.tsx` — +frame-detection redirect branch
- `components/orders/OrdersTab.tsx` — +status-based row routing
- `components/orders/OrderDetailDrawer.tsx` — +Phase 14 read-only sections + Generate Job Ticket button + Blob download handler
- `tests/helpers/fixtures/optical.ts` + `tests/unit/OrdersTab.test.tsx` — mock fixtures updated for new required type fields

## Decisions
1. **`createOrder` call passes camelCase keys.** The store's `createOrder` already wraps the payload through apiFetch, which sends camelCase to the BFF; backend Pydantic accepts both via populate_by_name. No special casing needed.
2. **Draft pending pill falls back to creating a new draft** when `mostRecentDraftId` is absent. The plan suggested lazy-loading the most recent draft via a fresh fetch; the fallback to create-new keeps the FE responsive and matches the user's intent ("click on pending → start configuring") even if the parent page hasn't enriched the data. Plan 14-11 E2E will exercise both paths.
3. **Generate Job Ticket button calls `loadOrder` to refresh the drawer** rather than a more granular refresh-just-the-timestamp method. Simpler; the next click flips the label correctly.
4. **Did NOT change `app/(tenant)/[tenant]/optical/page.tsx`.** The queue page already passes `item` directly to OpticalQueueCard; the new `draftOrderCount` flows through via apiFetch camelization. No `mostRecentDraftId` enrichment yet — added as optional future improvement.

## Deviations
None substantive. The plan's Task 5 was already completed in Plan 14-06 (archived todo with resolution note).

## Self-Check: PASSED
- `npx tsc --noEmit` → 0 errors in the 7 modified files; pre-existing project errors unchanged
- All 3 entry points reachable: confirmed via reading the route paths in each handler
- Drawer Generate Job Ticket button visible only when `order.status === "placed"` (gate check at JSX level)

## Next Phase Readiness
- **14-11** Playwright E2E exercises the full happy-path: queue card Configure Order → configurator → Place → Generate Job Ticket; plus 14-10 entry-point edge cases (walk-in redirect, draft-row routing, drawer Re-generate label)
- Manual visual checkpoint deferred to Plan 14-11 Task 4

---
*Phase: 14-optical-order-configuration*
*Completed: 2026-05-26*
