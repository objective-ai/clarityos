---
phase: 15-point-of-sale
plan: 10
type: execute
wave: 8
depends_on: [15-09]
files_modified:
  - components/pos/RefundDialog.tsx
  - components/patient/PatientPaymentsTab.tsx
  - components/pos/PosPaymentsCard.tsx
  - app/(tenant)/[tenant]/pos/close-of-day/page.tsx
  - components/pos/DailyCloseTotalsCard.tsx
  - components/pos/CashReconciliationCard.tsx
  - components/Sidebar.tsx
  - components/billing/SuperbillRowActions.tsx
  - components/optical/OrderDetailDrawer.tsx
  - components/schedule/AppointmentDetailDrawer.tsx
  - app/(tenant)/[tenant]/patients/[patientId]/page.tsx
  - app/(tenant)/[tenant]/admin/page.tsx
autonomous: true
requirements: [POS-01, POS-04, POS-05, POS-08, POS-10, POS-11]

must_haves:
  truths:
    - "Patient detail page gets a new 'Payments' tab with past sales list + 'New sale' button (gated on RETAIL_POS)"
    - "Superbill row in /billing gets a 'Take payment' button that links to /pos?patient={id}&prefill=superbill:{id}"
    - "OrderDetailDrawer footer gets 'Take payment' button when order.status='placed' that links to /pos?patient={id}&prefill=optical_order:{id}"
    - "Schedule AppointmentDetailDrawer gets 'Take payment' button when appointment.status='completed' AND encounter has Superbill"
    - "Sidebar gets 'Point of Sale' link gated on RETAIL_POS"
    - "/pos/close-of-day page: date picker (defaults today), 4 sections (summary/by_method/by_category/cash recon) + optional Stripe payout + PDF/CSV export buttons; OWNER+ADMIN only"
    - "Admin page gets 'POS Payments' card (OWNER-only) with publishable/secret/webhook key fields; never displays decrypted secret to FE"
    - "RefundDialog 480px right-slide drawer with item picker + reason textarea + Issue refund CTA (destructive color); only OWNER+ADMIN see refund actions"
  artifacts:
    - path: "components/pos/RefundDialog.tsx"
      provides: "480px drawer, item picker, reason, confirm"
      contains: "Issue refund"
    - path: "app/(tenant)/[tenant]/pos/close-of-day/page.tsx"
      provides: "OWNER+ADMIN daily-close page"
      contains: "Close of day"
    - path: "components/patient/PatientPaymentsTab.tsx"
      provides: "Past sales list + New sale CTA"
      contains: "New sale"
    - path: "components/pos/PosPaymentsCard.tsx"
      provides: "Admin Stripe key form with key-format validation"
      contains: "pk_test\\|pk_live"
  key_links:
    - from: "Superbill row → /pos"
      to: "POST /api/sales/ with prefill=[{kind:superbill, source_id}]"
      via: "router.push(`/pos?patient=${id}&prefill=superbill:${superbillId}`)"
      pattern: "prefill=superbill"
    - from: "OrderDetailDrawer Take payment"
      to: "/pos?prefill=optical_order:{orderId}"
      via: "router.push"
      pattern: "prefill=optical_order"
    - from: "Daily-close Save and close day"
      to: "POST /api/pos/daily-close/"
      via: "counted_cash + variance"
      pattern: "daily-close"
---

<objective>
Wire all the entry points into the POS surface and ship the supporting features (refund dialog, daily-close page, admin payments card, patient Payments tab). This is the integration plan that makes Phase 15 visible to the user.

Output: All entry points present and click-throughs work; Stripe key save form validates + saves; daily-close page renders.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-point-of-sale/15-UI-SPEC.md
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@components/patient/PatientBillingTab.tsx
@components/optical/OrderDetailDrawer.tsx
@components/schedule/AppointmentDetailDrawer.tsx
@components/Sidebar.tsx
@app/(tenant)/[tenant]/admin/page.tsx
@app/(tenant)/[tenant]/patients/[patientId]/page.tsx
@lib/entitlements.ts
@store/posCartStore.ts
@store/refundDraftStore.ts

<interfaces>
<!-- Entitlement check (from Phase 13/14) -->
```typescript
import { useEntitlements, Entitlement } from '@/lib/entitlements';
const ent = useEntitlements();
if (!ent.has(Entitlement.RETAIL_POS)) return null;
```

<!-- Role check from session -->
```typescript
import { useSession } from '@/lib/session';
const role = useSession().user.role; // 'owner' | 'admin' | 'doctor' | 'technician' | 'receptionist'
const isOwnerOrAdmin = ['owner', 'admin'].includes(role);
```

<!-- Drawer pattern (Phase 13) — 480px right-slide with ESC + backdrop close + hydration safety -->
```tsx
// components/optical/OrderDetailDrawer.tsx — clone shape
if (!open && !data) return null;     // hydration safety
return (
  <Dialog open={open} onOpenChange={onOpenChange}>...</Dialog>
);
```

<!-- Sidebar nav-item utility -->
```tsx
// components/Sidebar.tsx
<NavItem href={`/${tenantSlug}/pos`} icon={<CreditCardIcon />}>Point of Sale</NavItem>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: RefundDialog drawer + PatientPaymentsTab + 4 entry-point CTAs (Superbill row / OrderDetailDrawer / AppointmentDetailDrawer / Sidebar nav)</name>
  <files>components/pos/RefundDialog.tsx, components/patient/PatientPaymentsTab.tsx, components/Sidebar.tsx, components/billing/SuperbillRowActions.tsx, components/optical/OrderDetailDrawer.tsx, components/schedule/AppointmentDetailDrawer.tsx, app/(tenant)/[tenant]/patients/[patientId]/page.tsx</files>
  <read_first>
    - .planning/phases/15-point-of-sale/15-UI-SPEC.md §Refund dialog + §Patient Payments tab
    - components/optical/OrderDetailDrawer.tsx (FULL — clone 480px drawer pattern; will be modified to add Take payment button)
    - components/schedule/AppointmentDetailDrawer.tsx (FULL — will be modified)
    - components/patient/PatientBillingTab.tsx (full — clone tab pattern; PatientPaymentsTab sits beside it)
    - components/Sidebar.tsx (find existing nav structure)
    - app/(tenant)/[tenant]/patients/[patientId]/page.tsx (find tab registry — add 'Payments' tab)
    - lib/entitlements.ts (Entitlement.RETAIL_POS export)
  </read_first>
  <action>
    Seven concrete edits.

    **A. `components/pos/RefundDialog.tsx`** — 480px right-slide drawer cloning OrderDetailDrawer:
    - Props: `{ saleId, open, onOpenChange, onIssued? }`.
    - Loads sale via posApi.getSale(saleId) on open.
    - Item picker: for each sale line, a row with checkbox + qty stepper (defaults to full remaining qty after prior refunds).
    - Live refund total in `.text-display` color `--state-critical`.
    - `<textarea>` reason input, required min 3 chars.
    - Payment-refund spec: auto-allocate (default: refund total spread proportionally across original payments; advanced UI deferred).
    - Confirm button "Issue refund — $X.XX" (destructive); disabled until at least one item selected AND reason length >= 3.
    - On confirm: POST `/api/refunds/?sale_id={saleId}` with payload; on 201 success → close drawer + open ReceiptDeliveryPrompt with refund_id for refund receipt print/email.
    - Gate: only renders Issue Refund button when `session.user.role in {'owner', 'admin'}` (per POS-11).

    **B. `components/patient/PatientPaymentsTab.tsx`:**
    - Reads `?patient={patientId}` from page context.
    - Fetches `/api/sales/?patient_id={patientId}` (uses apiFetch).
    - Renders list: receipt # / date / total / status badge / total refunded.
    - "New sale" primary button → `router.push(`/${tenantSlug}/pos?patient=${patientId}`)`.
    - Each sale row click opens a detail drawer (reuse RefundDialog OR a new SaleDetailDrawer — for Phase 15, a thin sale-detail drawer in the same file is fine).
    - Empty state per UI-SPEC §Empty states.
    - Wraps in `<RequireEntitlement entitlement={Entitlement.RETAIL_POS}>` HOC OR returns null+message when no entitlement.

    **C. `components/Sidebar.tsx`** — add nav item:
    ```tsx
    {hasRetailPos && (
      <NavItem href={`/${tenantSlug}/pos`} icon={<CreditCardIcon className="h-5 w-5" />}>
        Point of Sale
      </NavItem>
    )}
    ```
    Place between existing Inventory link (Phase 13) and other admin links — match existing ordering convention.

    **D. `components/billing/SuperbillRowActions.tsx`** — add "Take payment" CTA next to the existing PDF/edit actions. Visible when superbill.status in {'ready_to_bill', 'submitted'}, gated on RETAIL_POS, role in {'owner','admin','technician','receptionist'}. Click → `router.push(`/${tenantSlug}/pos?patient=${patientId}&prefill=superbill:${superbillId}`)`.

    **E. `components/optical/OrderDetailDrawer.tsx`** — extend footer with "Take payment" button when `order.status === 'placed'`, gated as above. Click → `router.push(`/${tenantSlug}/pos?patient=${order.patientId}&prefill=optical_order:${order.id}`)`.

    **F. `components/schedule/AppointmentDetailDrawer.tsx`** — extend with "Take payment" button when `appointment.status === 'completed' AND appointment.encounter?.superbillId`. Click → `router.push(`/${tenantSlug}/pos?patient=${appointment.patientId}&prefill=superbill:${appointment.encounter.superbillId}`)`.

    **G. `app/(tenant)/[tenant]/patients/[patientId]/page.tsx`** — register 'Payments' tab in the tab registry, gated on `useEntitlements().has(Entitlement.RETAIL_POS)`. Place between Billing and Insurance per UI-SPEC convention (or wherever makes natural sense; document in the SUMMARY).
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "Take payment" components/billing/SuperbillRowActions.tsx components/optical/OrderDetailDrawer.tsx components/schedule/AppointmentDetailDrawer.tsx | head -5 && grep -c "Point of Sale" components/Sidebar.tsx && grep -c "PatientPaymentsTab\|Payments" app/\(tenant\)/\[tenant\]/patients/\[patientId\]/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` exits 0
    - `grep -c "Take payment" components/billing/SuperbillRowActions.tsx` returns >= 1
    - `grep -c "Take payment" components/optical/OrderDetailDrawer.tsx` returns >= 1
    - `grep -c "Take payment" components/schedule/AppointmentDetailDrawer.tsx` returns >= 1
    - `grep -c "Point of Sale\|/pos" components/Sidebar.tsx` returns >= 1
    - `grep -c "RETAIL_POS" components/Sidebar.tsx` returns >= 1 (entitlement gate present)
    - `grep -c "RETAIL_POS\|retail_pos" components/billing/SuperbillRowActions.tsx components/patient/PatientPaymentsTab.tsx | wc -l` returns >= 2
    - `grep -c "prefill=superbill" components/billing/SuperbillRowActions.tsx components/schedule/AppointmentDetailDrawer.tsx | wc -l` returns >= 2
    - `grep -c "prefill=optical_order" components/optical/OrderDetailDrawer.tsx` returns >= 1
    - `grep -c "Issue refund\|issueRefund" components/pos/RefundDialog.tsx` returns >= 1
    - `grep -c "Issue refund — " components/pos/RefundDialog.tsx` returns >= 1 (inline amount per UI-SPEC §Destructive confirmations)
    - `grep -c "components/patient/PatientPaymentsTab\|PatientPaymentsTab" app/\(tenant\)/\[tenant\]/patients/\[patientId\]/page.tsx` returns >= 1
    - `grep -rEn "text-white/[0-9]|bg-white/[0-9]" components/pos/RefundDialog.tsx components/patient/PatientPaymentsTab.tsx | wc -l` returns 0
  </acceptance_criteria>
  <done>Entry points wired; refund drawer ships; sidebar nav present; Payments tab registered.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Daily-close page + cards + Admin PosPaymentsCard with Stripe key save form</name>
  <files>app/(tenant)/[tenant]/pos/close-of-day/page.tsx, components/pos/DailyCloseTotalsCard.tsx, components/pos/CashReconciliationCard.tsx, components/pos/PosPaymentsCard.tsx, app/(tenant)/[tenant]/admin/page.tsx</files>
  <read_first>
    - .planning/phases/15-point-of-sale/15-UI-SPEC.md §Daily-close page layout + §Admin > POS Payments card
    - app/(tenant)/[tenant]/admin/page.tsx (find tab/section structure to inject PosPaymentsCard)
    - app/(tenant)/[tenant]/inventory/page.tsx (Phase 13 — clone full-page layout shape)
    - components/admin/* (find pattern for OWNER-only settings cards)
    - lib/pos/api.ts (Plan 15-09 — daily-close fetchers)
  </read_first>
  <action>
    Five concrete files.

    **A. `app/(tenant)/[tenant]/pos/close-of-day/page.tsx`:**
    - `'use client'`. Role guard: `role in ['owner', 'admin']` else redirect or 403 message.
    - Date picker, defaults to today.
    - On mount + date change: GET `/api/pos/daily-close/?date={iso}`.
    - Renders 4 sections per UI-SPEC: summary KPIs / by-method table / by-category table / CashReconciliationCard.
    - Footer: Export PDF + Export CSV buttons → window.open `/api/pos/daily-close/{runId}/export/?format=pdf|csv` (only enabled after Save and close day OR for historical closed dates).
    - For historical closed dates (response.is_closed=true): show counted_cash + variance as read-only.

    **B. `components/pos/DailyCloseTotalsCard.tsx`** — reusable card: props `{ title, rows: [{key, count, total}] }`. Renders glass-card with overline title + table.

    **C. `components/pos/CashReconciliationCard.tsx`:**
    - Props: `{ expectedCash, isClosed, initialCountedCash?, initialVariance?, onSave }`.
    - "Expected cash" read-only mono value.
    - "Counted cash" input — `<input type="text" inputMode="decimal" />` (Pitfall 12).
    - "Variance" computed live: `counted - expected`. Color: `--state-normal` when 0 or >0; `--state-critical` when <0.
    - "Save and close day" primary CTA — disabled when isClosed OR counted_cash empty.
    - Optional notes textarea.

    **D. `components/pos/PosPaymentsCard.tsx`** (Admin > Settings):
    - OWNER-only — hidden for ADMIN/lower (use role guard).
    - Three `.glass-input` fields: Publishable key, Secret key, Webhook signing secret.
    - When existing key set: field shows placeholder `pk_test_…(last4)` for publishable; `sk_***encrypted***` for secret/webhook (NEVER decrypt to FE per UI-SPEC Admin section).
    - Save button triggers destructive-confirmation dialog ("Replace Stripe configuration?") per UI-SPEC.
    - Client-side validation: regex `^pk_(test|live)_[A-Za-z0-9]+$` / `^sk_(test|live)_[A-Za-z0-9]+$` / `^whsec_[A-Za-z0-9]+$` BEFORE PUT.
    - PUT `/api/admin/payment-config/`; on 400 show inline error per UI-SPEC §Error states "That doesn't look like a Stripe key…".
    - Also surfaces a "Sales tax rate" display (read-only for Phase 15 — editable in a follow-up if needed; UI-SPEC says "configurable in Admin > Settings > POS" but for Phase 15 ship as read-only number + tooltip).

    **E. `app/(tenant)/[tenant]/admin/page.tsx`** — inject `<PosPaymentsCard />` in the existing OWNER-only section. Use the project's existing card grid layout. Section heading: "Payments".
  </action>
  <verify>
    <automated>npx tsc --noEmit && ls -la app/\(tenant\)/\[tenant\]/pos/close-of-day/page.tsx components/pos/DailyCloseTotalsCard.tsx components/pos/CashReconciliationCard.tsx components/pos/PosPaymentsCard.tsx && grep -c "PosPaymentsCard" app/\(tenant\)/\[tenant\]/admin/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` exits 0
    - All 4 new POS UI files exist; admin/page.tsx modified
    - `grep -c "Close of day\|close-of-day" app/\(tenant\)/\[tenant\]/pos/close-of-day/page.tsx` returns >= 1
    - `grep -c "owner.*admin\|admin.*owner\|role" app/\(tenant\)/\[tenant\]/pos/close-of-day/page.tsx` returns >= 1 (role guard)
    - `grep -c "inputMode=\"decimal\"" components/pos/CashReconciliationCard.tsx` returns >= 1 (Pitfall 12)
    - `grep -c "type=\"number\"" components/pos/CashReconciliationCard.tsx` returns 0
    - `grep -c "pk_test\|pk_live\|sk_test\|sk_live\|whsec_" components/pos/PosPaymentsCard.tsx` returns >= 3 (all three regex validations present)
    - `grep -c "Replace Stripe configuration\|destructive\|Replace configuration" components/pos/PosPaymentsCard.tsx` returns >= 1 (destructive-confirmation per UI-SPEC)
    - `grep -c "decrypted\|decrypt" components/pos/PosPaymentsCard.tsx` returns 0 — never decrypts to FE
    - `grep -c "PosPaymentsCard" app/\(tenant\)/\[tenant\]/admin/page.tsx` returns >= 1
    - `grep -c "Export PDF\|Export CSV" app/\(tenant\)/\[tenant\]/pos/close-of-day/page.tsx` returns >= 2
    - `grep -c "Save and close day" components/pos/CashReconciliationCard.tsx` returns >= 1 (exact UI-SPEC copy)
  </acceptance_criteria>
  <done>Daily-close page renders; PosPaymentsCard wired into admin; key-format validation present; never decrypts secrets to FE.</done>
</task>

</tasks>

<verification>
- All entry-point CTAs present
- Daily-close page renders + cash reconciliation works
- Admin page hosts PosPaymentsCard (OWNER-only)
- RefundDialog ships as 480px drawer
- tsc clean
</verification>

<success_criteria>
Phase 15 surface fully visible: entry points wired, daily-close + admin pages live, refund flow accessible.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-10-SUMMARY.md`
</output>
