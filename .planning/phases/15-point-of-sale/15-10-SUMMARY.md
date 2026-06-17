---
phase: 15-point-of-sale
plan: 10
subsystem: pos-frontend
tags: [pos, refunds, daily-close, stripe, entitlements, entry-points]

requires:
  - phase: 15-09
    provides: posCartStore, refundDraftStore, lib/pos/api, /pos page, POS components
  - phase: 15-08
    provides: BFF routes (sales list, refunds, daily-close, payment-config, export)
  - phase: 13-retail-inventory
    provides: RETAIL_POS entitlement, glass-card / drawer patterns
provides:
  - components/pos/RefundDialog.tsx (480px refund drawer bound to refundDraftStore)
  - components/patient/PatientPaymentsTab.tsx (patient sales history + New sale)
  - components/billing/SuperbillRowActions.tsx (Take payment CTA on /billing rows)
  - components/pos/DailyCloseTotalsCard.tsx + CashReconciliationCard.tsx
  - components/pos/PosPaymentsCard.tsx (Admin OWNER-only Stripe key form)
  - app/(tenant)/[tenant]/pos/close-of-day/page.tsx (daily-close page)
  - Sidebar "Point of Sale" nav, patient "Payments" tab, Order/Appointment Take-payment CTAs
  - lib/pos/api: getDailyClose + saveDailyClose
affects: [15-11]

tech-stack:
  added: []
  patterns:
    - Take-payment CTAs emit ?prefill=superbill:{id} / ?prefill=optical_order:{id}; /pos page parses repeatable prefill params into SalePrefillItem[]
    - RefundDialog auto-allocates the refund total proportionally across succeeded payments (advanced split UI deferred)
    - Admin Stripe form never receives secret values back — masked placeholders + destructive replace confirm

key-files:
  created:
    - components/pos/RefundDialog.tsx
    - components/patient/PatientPaymentsTab.tsx
    - components/billing/SuperbillRowActions.tsx
    - components/pos/DailyCloseTotalsCard.tsx
    - components/pos/CashReconciliationCard.tsx
    - components/pos/PosPaymentsCard.tsx
    - app/(tenant)/[tenant]/pos/close-of-day/page.tsx
  modified:
    - components/Sidebar.tsx
    - components/orders/OrderDetailDrawer.tsx
    - components/schedule/AppointmentDetailDrawer.tsx
    - app/(tenant)/[tenant]/patients/[patientId]/page.tsx
    - app/(tenant)/[tenant]/billing/page.tsx
    - app/(tenant)/[tenant]/pos/page.tsx
    - lib/pos/api.ts

key-decisions:
  - "Take-payment links route through ?prefill=superbill:{id} / optical_order:{id}; the /pos page was extended to parse these so click-throughs prefill the cart end-to-end (the existing page only read legacy ?superbill / ?optical)"
  - "AppointmentDetailDrawer resolves the encounter's superbill on click (GET /api/encounters/{id}/superbill) since the Appointment object carries no superbill id; falls back to opening POS for the patient if none exists"
  - "RefundDialog auto-allocates the refund proportionally across succeeded payments via setPaymentAmount before submit (zustand set is synchronous, so submit().get() reads the updated split)"
  - "Patient 'Payments' tab placed directly after 'Billing'; both gated on RETAIL_POS"
  - "PosPaymentsCard is OWNER-only (admin sees no Payments section); never receives secret key values from the BFF — masked placeholders only"

patterns-established:
  - "Pattern: entry-point CTAs gated on has(RETAIL_POS) + requireRole(...) and the relevant resource status before rendering"

requirements-completed: [POS-01, POS-04, POS-05, POS-08, POS-10, POS-11]

duration: ~70min
completed: 2026-06-17
---

# Phase 15 Plan 10: Refund Dialog, Daily-Close & POS Entry Points Summary

**Wired the entire Phase 15 POS surface into the app — refund drawer, daily-close page, admin Stripe key card, patient Payments tab, and four "Take payment" / nav entry points — so the checkout flow built in 15-09 is now reachable from real workflows.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 2 (committed atomically)
- **Files created:** 7 · **Files modified:** 7

## Accomplishments

### Task 1 — Refund drawer + entry points (`82cf3cc`)
- `RefundDialog`: 480px right-slide drawer cloning the OrderDetailDrawer shell; item picker with qty steppers, already-refunded lines disabled, live refund total in `--state-critical`, reason textarea (min 3 chars), `Issue refund — $X.XX` destructive CTA gated to OWNER/ADMIN. Auto-allocates the refund across succeeded payments and offers a refund-receipt print on success.
- `PatientPaymentsTab`: past-sales table (receipt #, date, status chip, refunded, total) + `New sale` CTA → `/pos?patient={id}`; rows open the RefundDialog. RETAIL_POS gated.
- Four entry points: Sidebar `Point of Sale` nav, Superbill row `Take payment` (`SuperbillRowActions`), OrderDetailDrawer `Take payment` (placed orders), AppointmentDetailDrawer `Take payment` (completed visits → resolves encounter superbill).
- Patient detail page: `Payments` tab registered after Billing.
- `/pos` page: now parses `?prefill=superbill:{id}` / `optical_order:{id}` so the CTAs prefill the cart.

### Task 2 — Daily-close + admin payments (`6039e81`)
- `/pos/close-of-day`: OWNER+ADMIN page with date picker, summary KPIs, by-method/by-category tables, cash reconciliation, PDF/CSV export; historical closed dates render read-only.
- `DailyCloseTotalsCard` (reusable) + `CashReconciliationCard` (expected/counted `inputMode="decimal"`/live variance + `Save and close day`).
- `PosPaymentsCard`: OWNER-only Stripe key form with `pk_/sk_/whsec_` format validation, destructive `Replace Stripe configuration?` confirm, masked placeholders (never receives secret values from the BFF). Wired into Admin as a new OWNER-only `Payments` section.
- `lib/pos/api`: `getDailyClose` + `saveDailyClose`.

## Deviations from Plan

**[Rule 3 - Blocking] `/pos` page did not parse the `prefill=` query param** — Found during Task 1. The Take-payment CTAs are specified (key_links) to route via `?prefill=superbill:{id}` / `?prefill=optical_order:{id}`, but the existing `/pos` page only read legacy `?superbill` / `?optical` params, so click-throughs would have opened an empty cart. Added a `searchParams.getAll("prefill")` parse loop that maps `kind:id` → `SalePrefillItem[]`. Files: `app/(tenant)/[tenant]/pos/page.tsx`. Verified the entry-point links now resolve to prefilled sales.

**[Rule 3 - Blocking] AppointmentDetailDrawer has no superbill id** — The `Appointment` type carries only `encounterId`, not a superbill id, but the plan/key_link require `prefill=superbill:{id}`. The Take-payment handler now fetches `GET /api/encounters/{encounterId}/superbill` on click to resolve the id, falling back to opening POS for the patient if no superbill exists. Files: `components/schedule/AppointmentDetailDrawer.tsx`.

**Total deviations:** 2 auto-fixed (both Rule 3 - Blocking, required to make the entry points functional). **Impact:** none beyond the planned files; both keep the click-throughs working end-to-end.

## Issues Encountered

- **`npx tsc --noEmit` is non-zero at baseline** due to pre-existing errors in `tests/e2e/*.spec.ts` (unused vars, possibly-null) — none in any Plan 15-10 file. Confirmed zero type errors across all created/modified app code. The E2E spec errors predate this plan and are unrelated; flagging for a future test-hygiene pass.
- Lint surfaces pre-existing "CSS inline styles" warnings in the drawer/admin/pos files; the POS surface established inline CSS-variable styles in 15-09, so new code follows the same convention.

## Next Phase Readiness

- Plan 15-11 (E2E verification) can now drive the full funnel: Sidebar → `/pos`, Superbill/Order/Appointment `Take payment` → prefilled cart → close → receipt, refund via `RefundDialog`, and `/pos/close-of-day` reconciliation + export.

---
*Phase: 15-point-of-sale, Plan 10*
*Completed: 2026-06-17*
