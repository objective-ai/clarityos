---
phase: 09-claims-basics
plan: "04"
subsystem: ui
tags: [zustand, bff, payers, fee-schedule, admin-panel, glassmorphism, insurance]

# Dependency graph
requires:
  - phase: 09-01
    provides: InsurancePayer and FeeScheduleItem types in types/billing.ts
  - phase: 09-02
    provides: FastAPI payer and fee catalog endpoints at /api/payers/ and /api/fee-catalog/
provides:
  - Zustand payerStore with loadPayers, createPayer, updatePayer, loadPayerFeeSchedule, updatePayerFeeSchedule, loadFeeCatalog, updateFeeCatalog
  - BFF proxy routes for all payer and fee catalog operations (4 route files)
  - Admin panel Payers tab with glass-card table, Create modal, per-payer fee schedule editor, and base fee catalog editor
affects:
  - 09-05 (patient insurance tab needs payers list from usePayerStore)
  - 09-06 (CMS-1500 generation uses billed_payer_id from payers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Zustand store with devtools wrapping all async fetch operations (loading/error state)
    - BFF proxy routes using proxyToFastAPI with trailing slashes on upstream paths
    - Inline React components in admin/page.tsx (PayersSection, PayerFeeScheduleView, CreatePayerModal)
    - Role-gating via session.user.role check on SECTIONS.filter

key-files:
  created:
    - store/payerStore.ts
    - app/api/payers/route.ts
    - app/api/payers/[payerId]/route.ts
    - app/api/payers/[payerId]/fee-schedule/route.ts
    - app/api/fee-catalog/route.ts
    - tests/unit/store/payerStore.test.ts
  modified:
    - app/(tenant)/[tenant]/admin/page.tsx

key-decisions:
  - "CreatePayerModal onSave prop typed as Promise<InsurancePayer | void> to accommodate Zustand store returning InsurancePayer from createPayer"
  - "Payers tab role-gated via session.user.role (not session.role) — AppSession.role is on user sub-object"
  - "PayerFeeScheduleView is a separate inline component triggered by row click, not a Dialog — keeps fee table full-width"
  - "Base Fee Catalog section is collapsible (toggle on CardHeader click) to reduce visual noise when not in use"

patterns-established:
  - "Payer tab visibility: SECTIONS.filter((s) => s.key !== 'payers' || isAdminOrOwner) — same pattern for any role-gated tab"
  - "Fee schedule editing: local state Record<cpt_code, string> with explicit Save button — no auto-save"

requirements-completed:
  - INS-03

# Metrics
duration: 6min
completed: 2026-03-14
---

# Phase 09 Plan 04: Payers Admin Tab Summary

**Zustand payerStore + 4 BFF proxy routes + Admin Payers tab with glass-card CRUD table, Create modal, and nested per-payer fee schedule editor**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-14T17:01:01Z
- **Completed:** 2026-03-14T17:07:19Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created `payerStore.ts` with full Zustand devtools store: 7 async actions covering all payer and fee catalog CRUD operations, loading/error state management
- Created 4 BFF proxy route files covering GET/POST payers, GET/PATCH/DELETE single payer, GET/PUT payer fee schedule, GET/PUT base fee catalog
- Added Payers tab to admin panel: glass-card table with payer name, payer_id, phone, active status badge (teal=active, gray=inactive), and per-row Edit Fees button
- Added CreatePayerModal (Dialog with name/payer_id/phone/address fields, teal submit button)
- Added PayerFeeScheduleView: nested view with back button, CPT code/description/override fee columns, editable inputs, and Save Changes button
- Added collapsible Base Fee Catalog section with editable fee inputs and Save button
- Role-gated Payers tab via `session.user.role` check — visible to admin/owner only
- 17 unit tests covering all store actions with fetch mocking

## Task Commits

1. **Task 1: payerStore + BFF routes** - `7663015` (feat)
2. **Task 2: Payers tab in admin/page.tsx** - `eac9631` (feat)

## Files Created/Modified
- `store/payerStore.ts` - Zustand store with 7 async actions for payer/fee-catalog CRUD
- `app/api/payers/route.ts` - BFF GET/POST for payer list
- `app/api/payers/[payerId]/route.ts` - BFF GET/PATCH/DELETE for single payer
- `app/api/payers/[payerId]/fee-schedule/route.ts` - BFF GET/PUT for payer fee schedule
- `app/api/fee-catalog/route.ts` - BFF GET/PUT for base fee catalog
- `tests/unit/store/payerStore.test.ts` - 17 unit tests (replaced stub)
- `app/(tenant)/[tenant]/admin/page.tsx` - Added Payers tab with full CRUD UI

## Decisions Made
- `CreatePayerModal` `onSave` prop typed as `Promise<InsurancePayer | void>` — Zustand `createPayer` returns `InsurancePayer`, not `void`; using union avoids TS error without changing store
- `PayerFeeScheduleView` as nested view component (not a Dialog) — fee tables need full width for usable number inputs
- Role check uses `session.user.role` — `AppSession` nests role inside `user` sub-object (`AppSession.user.role: StaffRole`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type mismatch on CreatePayerModal onSave prop**
- **Found during:** Task 2 (Payers tab in admin/page.tsx)
- **Issue:** `onSave` prop typed as `Promise<void>` but `createPayer` returns `Promise<InsurancePayer>` — TS error TS2322
- **Fix:** Changed prop type to `Promise<InsurancePayer | void>` to accommodate store return type
- **Files modified:** app/(tenant)/[tenant]/admin/page.tsx
- **Verification:** `npx tsc --noEmit` passes with 0 errors
- **Committed in:** eac9631 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed session.role access path**
- **Found during:** Task 2 (Payers tab in admin/page.tsx)
- **Issue:** Used `session.role` but AppSession type has no direct `.role` — role is at `session.user.role`
- **Fix:** Changed `session?.role` to `session?.user.role` in isAdminOrOwner check
- **Files modified:** app/(tenant)/[tenant]/admin/page.tsx
- **Verification:** `npx tsc --noEmit` passes with 0 errors
- **Committed in:** eac9631 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 type/access bugs)
**Impact on plan:** Both auto-fixes required for TypeScript correctness. No scope creep.

## Issues Encountered
- payerStore.ts already existed from a prior partial attempt and matched the plan exactly — no rewrite needed. Tests were written against it and all passed.

## Next Phase Readiness
- `usePayerStore` ready for 09-05 (patient insurance tab) — `loadPayers()` provides the payers list for insurance coverage dropdowns
- Admin can now configure payers and fee schedules before the billing flow (09-06) generates CMS-1500 claims
- No blockers

---
*Phase: 09-claims-basics*
*Completed: 2026-03-14*
