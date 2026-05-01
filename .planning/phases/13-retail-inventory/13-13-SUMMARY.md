---
phase: 13-retail-inventory
plan: 13
subsystem: ui
tags: [optical-queue, optical-order, retail-pos, entitlement, role-gate, modal, react]

requires:
  - phase: 13-12
    provides: CreateWalkInOrderModal with optional encounterId prop
  - phase: 13-07
    provides: optical-queue rollup status (read-side over OpticalOrder)
  - phase: 6
    provides: OpticalQueueCard surface + opticalStore.fetchQueue
provides:
  - Encounter-linked Create Order CTA on optical-queue cards
  - Stable test hook (data-testid="optical-queue-card") for 13-14 spec
  - Queue refresh on modal close so 13-07 rollup picks up new order
affects: [13-14, retail-inventory-e2e]

tech-stack:
  added: []
  patterns:
    - "Reuse existing modal across surfaces (encounterId prop discriminator)"
    - "Defense-in-depth gating: entitlement (RETAIL_POS) AND role allowlist on FE; backend permission system enforces 403 fallback"

key-files:
  created: []
  modified:
    - components/optical/OpticalQueueCard.tsx

key-decisions:
  - "Used canonical session/entitlement imports from components/Sidebar.tsx:14-16 (useEntitlements from @/hooks/useEntitlements, useCurrentUser from @/store/sessionStore) — no new hook files"
  - "Queue refresh fires on modal CLOSE (not on success) — covers create + cancel paths with one hook; slight over-fetch on cancel acceptable per plan §pitfalls"
  - "Role allowlist [owner, admin, technician, receptionist] mirrors CONTEXT §F (CREATE_OPTICAL_ORDER excludes doctor)"
  - "data-testid added to outer Card element — Card from shadcn/ui forwards arbitrary HTML attrs"

patterns-established:
  - "OpticalQueueCard: encounter-linked surface for retail actions (mirrors patient Orders tab walk-in surface from 13-12)"

requirements-completed:
  - INV-02

duration: ~6min
completed: 2026-05-01
---

# Phase 13-13: OpticalQueueCard Create Order CTA Summary

**Encounter-linked "Create Order" button on each optical-queue card — opens CreateWalkInOrderModal pre-filled with encounterId+patientId, refreshes queue on close so 13-07 rollup status updates.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-05-01T23:39Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Wired encounter-linked entry surface for optical orders (CONTEXT §D second entry surface — first was 13-12 walk-in)
- Reused 13-12 `CreateWalkInOrderModal` with `encounterId` prop — zero new modal components
- Defense-in-depth gating: `Entitlement.RETAIL_POS` AND role allowlist `[owner, admin, technician, receptionist]`
- Stable `data-testid="optical-queue-card"` hook landed on outer Card for 13-14 E2E spec
- Queue refresh hook (`fetchQueue()`) fires on modal close → 13-07 rollup recomputes status

## Task Commits

1. **Task 1: Create Order CTA + modal reuse on OpticalQueueCard** — pending commit (this turn)

## Files Created/Modified

- `components/optical/OpticalQueueCard.tsx` — added imports (useState, modal, entitlement/session hooks), gating (canCreateOrder), modal state, `+ Create Order` button in actions block, `<CreateWalkInOrderModal>` at component end, `data-testid="optical-queue-card"` on Card root.

## Decisions Made

- **Imports from canonical donor:** `useEntitlements` from `@/hooks/useEntitlements`, `useCurrentUser` from `@/store/sessionStore`, `Entitlement` from `@/lib/entitlements` — exactly mirroring `components/Sidebar.tsx:14-16`. No invented paths.
- **Store loader:** Used existing `fetchQueue` from `useOpticalStore` (verified by grep — plan referenced "loadQueue" speculatively).
- **Refresh-on-close:** Single `fetchQueue()` call from `onClose` handler — slight over-fetch when user cancels, but covers the create-and-close path without an extra `onCreated` wire-up.

## Deviations from Plan

None — plan executed as written. Plan correctly noted that the store loader's exact name needed verification; confirmed `fetchQueue` (not `loadQueue`) and used it.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- 13-14 (Playwright E2E specs) can now resolve `[data-testid='optical-queue-card']` and click `+ Create Order`.
- All Phase 13 implementation complete except 13-14 E2E.

---
*Phase: 13-retail-inventory*
*Completed: 2026-05-01*
