---
phase: "09-claims-basics"
plan: "06"
subsystem: billing
tags: [payer-selection, superbill, insurance, fee-source, billingStore]
dependency_graph:
  requires: [09-01, 09-02, 09-04, 09-05]
  provides: [payer-selection-modal, fee-source-indicators, change-payer-ui]
  affects: [billing, encounter-finalize]
tech_stack:
  added: []
  patterns: [zustand-top-level-state, shadcn-dialog, glass-card-selection]
key_files:
  created:
    - components/billing/PayerSelectionModal.tsx
  modified:
    - store/billingStore.ts
    - components/billing/SuperbillEditor.tsx
    - components/encounter/FinalizeModal.tsx
    - app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx
    - tests/unit/store/billingStore.test.ts
decisions:
  - "changeBilledPayer uses _superbillId naming (not used in implementation — PATCH targets encounterId); superbillId kept in interface for callers"
  - "PayerSelectionModal reads open/encounterId directly from billingStore (no props) so all call sites just need patientId"
  - "SuperbillEditor renders PayerSelectionModal in all branches (loading, null, main) for correct portal placement"
  - "openedPayerRef replaces createdRef to prevent double-opening payer selection modal"
metrics:
  duration: "~4min"
  completed_date: "2026-03-14"
  tasks_completed: 2
  files_changed: 6
requirements_satisfied: [INS-05]
---

# Phase 09 Plan 06: Payer Selection Flow Summary

Payer selection modal intercepts superbill creation with insurance plan picker; fee_source visual indicators on line items; change-payer dropdown on existing superbill; patientId prop threaded from encounter page through FinalizeModal to SuperbillEditor.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend billingStore with payer selection state + actions | e3537ae | store/billingStore.ts, billingStore.test.ts |
| 2 | PayerSelectionModal + SuperbillEditor extension + FinalizeModal threading | 9405b60 | PayerSelectionModal.tsx, SuperbillEditor.tsx, FinalizeModal.tsx, page.tsx |

## What Was Built

### billingStore extensions (Task 1 — TDD)

New top-level state (not per-encounter):
- `payerSelectionOpen: boolean` — controls modal visibility
- `pendingEncounterId: string | null` — encounter awaiting payer selection

New actions:
- `openPayerSelection(encounterId)` — called instead of `createSuperbill` when no superbill exists
- `closePayerSelection()` — resets modal state
- `createSuperbillWithPayer(encounterId, payerId, isSelfPay)` — POSTs to `/api/encounters/${encounterId}/superbill` with `{ billed_payer_id, is_self_pay }`, sets superbill + lineItems, calls closePayerSelection
- `changeBilledPayer(_superbillId, encounterId, newPayerId, isSelfPay)` — PATCHes superbill, refreshes line items from response

### PayerSelectionModal (Task 2)

- Reads `payerSelectionOpen` and `pendingEncounterId` from billingStore (no open/onClose props)
- Fetches `/api/patients/${patientId}/insurance` on modal open
- Renders each PatientInsurance as: `"Primary Medical: Aetna"` pattern (priority + plan_type + payer.name)
- Self-Pay option always at bottom
- Selected option highlighted with teal border (`border: "2px solid var(--accent)"`)
- Confirm button calls `createSuperbillWithPayer`; Cancel calls `closePayerSelection`

### SuperbillEditor extensions (Task 2)

1. `patientId` added as required prop
2. `<PayerSelectionModal patientId={patientId} />` rendered in all branches (loading, null, main JSX) for correct portal placement
3. Auto-create path: `createSuperbill()` replaced with `openPayerSelection(encounterId)` via `openedPayerRef`
4. Fee source indicators:
   - `feeSource === "base_rate" && !isFeeOverridden` → `text-yellow-400` + asterisk suffix + tooltip "Using base catalog rate — edit to lock"
   - `feeSource === "manual" || isFeeOverridden` → `text-purple-400` + Lock icon (size 12) prefix + tooltip "Manually set — won't change on payer switch"
   - `feeSource === "payer_rate"` → `text-[var(--text-primary)]`, no indicator
5. Change Payer dropdown above line items: fetches patient insurance on superbill load, calls `changeBilledPayer` on change

### FinalizeModal + encounter page (Task 2)

- `patientId: string` added to `FinalizeModalProps`
- `SuperbillEditor` call site updated: `<SuperbillEditor encounterId={encounterId} patientId={patientId} />`
- Encounter page passes `patientId={patientId ?? ""}` to `<FinalizeModal>`

## Verification

- `npx tsc --noEmit`: 0 errors
- `npx vitest run tests/unit/store/`: 67/67 passing (5 test files)
- billingStore has `payerSelectionOpen` and `createSuperbillWithPayer` in interface
- PayerSelectionModal renders payer options from patient insurance API
- SuperbillEditor props interface includes `patientId: string`
- SuperbillEditor has conditional `text-yellow-400` / `text-purple-400` based on `feeSource`
- SuperbillEditor renders `<PayerSelectionModal patientId={patientId}>` in main JSX (grep confirms)
- SuperbillEditor calls `openPayerSelection` (not `createSuperbill`) on no-superbill path
- FinalizeModal passes `patientId={patientId}` to SuperbillEditor
- Encounter page passes `patientId={patientId ?? ""}` to FinalizeModal

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist

- `components/billing/PayerSelectionModal.tsx` — FOUND
- `store/billingStore.ts` — FOUND (modified)
- `components/billing/SuperbillEditor.tsx` — FOUND (modified)
- `components/encounter/FinalizeModal.tsx` — FOUND (modified)

### Commits exist

- `e3537ae` — FOUND (feat(09-06): extend billingStore)
- `9405b60` — FOUND (feat(09-06): payer selection modal + SuperbillEditor)

## Self-Check: PASSED
