---
phase: 15-point-of-sale
plan: 09
type: execute
wave: 7
depends_on: [15-08]
files_modified:
  - store/posCartStore.ts
  - store/refundDraftStore.ts
  - lib/pos/printReceipt.ts
  - lib/pos/api.ts
  - app/(tenant)/[tenant]/pos/page.tsx
  - components/pos/CartLineList.tsx
  - components/pos/PaymentPanel.tsx
  - components/pos/CashPaymentForm.tsx
  - components/pos/StripePaymentForm.tsx
  - components/pos/ExternalCardPaymentForm.tsx
  - components/pos/WriteOffPaymentForm.tsx
  - components/pos/DiscountPopover.tsx
  - components/pos/ReceiptDeliveryPrompt.tsx
  - components/pos/PrefillSearchModal.tsx
autonomous: true
requirements: [POS-01, POS-02, POS-03, POS-06, POS-11, POS-13, POS-15]

must_haves:
  truths:
    - "store/posCartStore.ts manages cart draft + payment list + remaining; uses devtools + selectors; 1.5s debounce save + flush on blur"
    - "lib/pos/printReceipt.ts opens hidden iframe with PDF Blob and calls iframe.contentWindow.print() (Phase 6 pattern)"
    - "components/pos/StripePaymentForm.tsx wraps <Elements stripe={loadStripe(publishableKey)} options={{ clientSecret }}><PaymentElement /></Elements> with redirect: 'if_required' (Pitfall 9)"
    - "components/pos/CashPaymentForm.tsx uses <input type='text' inputMode='decimal' /> for tendered (Pitfall 12); validates tendered>=amount client-side"
    - "components/pos/WriteOffPaymentForm.tsx requires non-empty reason_note (POS-11)"
    - "components/pos/DiscountPopover.tsx requires non-empty discount_reason (POS-15)"
    - "app/(tenant)/[tenant]/pos/page.tsx layout: cart 60% / payment panel 40% on lg+ per UI-SPEC"
    - "Money inputs NEVER type='number' for currency — always type='text' + inputMode='decimal'"
    - "All money values render via .font-mono-data class"
    - "No hardcoded text-white/* / bg-white/* / text-black/* — use CSS-variable tokens per UI-SPEC feedback rule"
  artifacts:
    - path: "store/posCartStore.ts"
      provides: "Zustand store: cart, addLine, updateLine, removeLine, addPayment, refresh, close, computed remaining"
      contains: "create(devtools"
    - path: "lib/pos/printReceipt.ts"
      provides: "printReceipt(saleId) — hidden-iframe blob print"
      contains: "iframe.contentWindow.print"
    - path: "components/pos/StripePaymentForm.tsx"
      provides: "Elements + PaymentElement + 'if_required' confirmation"
      contains: "redirect: 'if_required'"
    - path: "app/(tenant)/[tenant]/pos/page.tsx"
      provides: "Full-page checkout layout — cart left, payment panel right"
      contains: "Point of Sale"
  key_links:
    - from: "StripePaymentForm onSuccess"
      to: "POST /api/sales/{id}/payments/stripe-confirm/"
      via: "after stripe.confirmPayment resolves, BFF call writes Payment from PaymentIntent"
      pattern: "stripe-confirm"
    - from: "Close sale CTA"
      to: "POST /api/sales/{id}/close/"
      via: "disabled until remaining<=0"
      pattern: "remaining"
    - from: "Receipt prompt Print"
      to: "lib/pos/printReceipt"
      via: "hidden iframe pattern"
      pattern: "printReceipt"
---

<objective>
Frontend POS surface: Zustand store, lib helpers, Stripe Elements wrapper, payment forms (cash/card/external/write_off), cart + payment panel, full-page /pos page, receipt delivery prompt.

Output: `npx vitest run components/pos lib/pos types/sales.contract.test.ts && npx tsc --noEmit` clean.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-point-of-sale/15-UI-SPEC.md
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@.planning/phases/15-point-of-sale/15-RESEARCH.md
@types/sales.ts
@store/inventoryStore.ts
@store/opticalOrderConfigStore.ts
@app/(tenant)/[tenant]/inventory/page.tsx
@app/globals.css

<interfaces>
<!-- types/sales.ts (Plan 15-03) -->
```typescript
import { Sale, Payment, PaymentMethod, PaymentCreatePayload, StripeIntentResponse,
         SaleCreatePayload, RefundCreatePayload, ... } from '@/types/sales';
```

<!-- Zustand store pattern (Phase 13/14) -->
```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
export const useSomethingStore = create<State>()(devtools((set, get) => ({...})));
```

<!-- Stripe Elements (Plan 15-00 deps) -->
```typescript
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
```

<!-- Phase 6 Rx PDF print pattern (already in codebase) -->
```typescript
// Look for window.print() or iframe pattern in components/optical/PrintRxView.tsx (or equivalent)
```

<!-- Glass design tokens -->
.glass-card, .glass-input, .text-display, .text-heading, .font-mono-data, .data-value,
var(--accent), var(--text-primary), var(--text-secondary), var(--text-muted),
var(--bg-glass), var(--glass-border), var(--state-critical), var(--state-normal),
var(--state-warning)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: store/posCartStore.ts + store/refundDraftStore.ts + lib/pos/api.ts (typed fetchers) + lib/pos/printReceipt.ts (hidden-iframe pattern); replace Wave-0 vitest skip-stubs</name>
  <files>store/posCartStore.ts, store/refundDraftStore.ts, lib/pos/api.ts, lib/pos/printReceipt.ts, lib/pos/printReceipt.test.ts</files>
  <read_first>
    - store/inventoryStore.ts + store/opticalOrderConfigStore.ts (clone devtools + selectors + 1.5s debounce + flush-on-blur)
    - lib/api.ts or lib/apiFetch.ts (existing camelize wrapper; understand when to opt out)
    - types/sales.ts (Plan 15-03)
    - lib/pos/printReceipt.test.ts (Wave-0 stub assertions)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pattern 9 (Receipt Print Hidden Iframe)
  </read_first>
  <action>
    Five files.

    **A. `store/posCartStore.ts`:**

    ```typescript
    'use client';
    import { create } from 'zustand';
    import { devtools } from 'zustand/middleware';
    import type {
      Sale, SaleLineItem, Payment, SaleCreatePayload, PaymentCreatePayload,
      SalePrefillItem, StripeIntentResponse,
    } from '@/types/sales';
    import { posApi } from '@/lib/pos/api';

    interface PosCartState {
      sale: Sale | null;
      loading: boolean;
      error: string | null;
      open: (payload: SaleCreatePayload) => Promise<Sale>;
      load: (saleId: string) => Promise<Sale>;
      addLine: (line: { description: string; qty: number; unitPrice: string; taxable?: boolean; sourceType?: 'product' | 'adhoc'; sourceId?: string | null; discountAmount?: string; discountReason?: string | null }) => Promise<void>;
      updateLine: (lineId: string, patch: Partial<SaleLineItem>) => Promise<void>;
      removeLine: (lineId: string) => Promise<void>;
      addCashPayment: (amount: string, tendered: string) => Promise<void>;
      addExternalCardPayment: (amount: string, last4: string, authCode?: string) => Promise<void>;
      addWriteOff: (amount: string, reasonNote: string) => Promise<void>;
      initiateStripePayment: (amount: string) => Promise<StripeIntentResponse>;
      confirmStripePayment: (paymentIntentId: string) => Promise<void>;
      cancelStripePayment: (paymentId: string) => Promise<void>;
      close: () => Promise<Sale>;
      void: () => Promise<void>;
      reset: () => void;
    }

    export const usePosCartStore = create<PosCartState>()(devtools((set, get) => ({
      sale: null,
      loading: false,
      error: null,

      open: async (payload) => {
        set({ loading: true, error: null });
        try {
          const sale = await posApi.openSale(payload);
          set({ sale, loading: false });
          return sale;
        } catch (e: any) {
          set({ error: e.message ?? 'Failed to open sale', loading: false });
          throw e;
        }
      },

      load: async (saleId) => {
        set({ loading: true });
        const sale = await posApi.getSale(saleId);
        set({ sale, loading: false });
        return sale;
      },

      addLine: async (line) => {
        const sale = get().sale;
        if (!sale) throw new Error('No active sale');
        const updated = await posApi.addLine(sale.id, {
          sourceType: line.sourceType ?? 'adhoc',
          sourceId: line.sourceId ?? null,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount ?? '0',
          discountReason: line.discountReason ?? null,
          taxable: line.taxable ?? true,
        });
        set({ sale: updated });
      },

      updateLine: async (lineId, patch) => {
        const sale = get().sale;
        if (!sale) throw new Error('No active sale');
        const updated = await posApi.updateLine(sale.id, lineId, patch);
        set({ sale: updated });
      },

      removeLine: async (lineId) => {
        const sale = get().sale;
        if (!sale) throw new Error('No active sale');
        const updated = await posApi.removeLine(sale.id, lineId);
        set({ sale: updated });
      },

      addCashPayment: async (amount, tendered) => {
        const sale = get().sale!;
        const updated = await posApi.recordPayment(sale.id, {
          method: 'cash', amount, tendered,
          changeDue: String(Number(tendered) - Number(amount)),
        });
        // Refetch full sale to pull in payment list:
        const refreshed = await posApi.getSale(sale.id);
        set({ sale: refreshed });
      },

      addExternalCardPayment: async (amount, last4, authCode) => {
        const sale = get().sale!;
        await posApi.recordPayment(sale.id, { method: 'external_card', amount, last4, authCode });
        const refreshed = await posApi.getSale(sale.id);
        set({ sale: refreshed });
      },

      addWriteOff: async (amount, reasonNote) => {
        if (!reasonNote || reasonNote.trim().length < 3) {
          throw new Error('A reason is required for write-offs');
        }
        const sale = get().sale!;
        await posApi.recordPayment(sale.id, { method: 'write_off', amount, reasonNote });
        const refreshed = await posApi.getSale(sale.id);
        set({ sale: refreshed });
      },

      initiateStripePayment: async (amount) => {
        const sale = get().sale!;
        return posApi.recordPayment(sale.id, { method: 'stripe_card', amount }) as Promise<StripeIntentResponse>;
      },

      confirmStripePayment: async (paymentIntentId) => {
        const sale = get().sale!;
        await posApi.confirmStripePayment(sale.id, paymentIntentId);
        const refreshed = await posApi.getSale(sale.id);
        set({ sale: refreshed });
      },

      cancelStripePayment: async (paymentId) => {
        const sale = get().sale!;
        await posApi.cancelPendingPayment(sale.id, paymentId);
        const refreshed = await posApi.getSale(sale.id);
        set({ sale: refreshed });
      },

      close: async () => {
        const sale = get().sale!;
        const closed = await posApi.closeSale(sale.id);
        set({ sale: closed });
        return closed;
      },

      void: async () => {
        const sale = get().sale!;
        await posApi.voidSale(sale.id);
        set({ sale: null });
      },

      reset: () => set({ sale: null, error: null }),
    }), { name: 'posCart' }));
    ```

    **B. `lib/pos/api.ts`:** typed thin wrapper over apiFetch — exports `posApi` object with the methods used above. Each method calls the right BFF route from Plan 15-08. PDF endpoints return Blob; JSON endpoints camelize via apiFetch. Keep Stripe-confirm endpoint distinct from initial payment record.

    **C. `lib/pos/printReceipt.ts`** (clone RESEARCH Pattern 9):

    ```typescript
    /** POS-03 — print receipt via hidden iframe.
     *
     * Returns a promise that resolves after the print dialog opens. Iframe + Object URL
     * are revoked 60s later (generous to allow Save-to-PDF flows).
     */
    export async function printReceipt(saleId: string): Promise<void> {
      const res = await fetch(`/api/sales/${saleId}/receipt/`);
      if (!res.ok) {
        throw new Error(`Receipt fetch failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '-9999px';
      iframe.style.bottom = '-9999px';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);
      await new Promise<void>((resolve) => {
        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve();
        };
      });
      setTimeout(() => {
        URL.revokeObjectURL(url);
        iframe.remove();
      }, 60_000);
    }

    export async function printRefundReceipt(refundId: string): Promise<void> {
      const res = await fetch(`/api/refunds/${refundId}/receipt/`);
      if (!res.ok) {
        throw new Error(`Refund receipt fetch failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '-9999px';
      iframe.src = url;
      document.body.appendChild(iframe);
      await new Promise<void>((resolve) => {
        iframe.onload = () => { iframe.contentWindow?.print(); resolve(); };
      });
      setTimeout(() => { URL.revokeObjectURL(url); iframe.remove(); }, 60_000);
    }
    ```

    **D. `store/refundDraftStore.ts`** — minimal: selected line ids/qty/amount + reason + payment-refund spec. Standard Zustand store mirroring posCartStore shape but for the refund-creation draft.

    **E. Replace `lib/pos/printReceipt.test.ts`** (replace describe.skip with active assertions using jsdom):

    ```typescript
    import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

    describe('printReceipt', () => {
      let createObjectURL: any;
      beforeEach(() => {
        createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
        // @ts-ignore
        global.URL.createObjectURL = createObjectURL;
        global.URL.revokeObjectURL = vi.fn();
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(new Blob(['%PDF-fake'], { type: 'application/pdf' })),
        }) as any;
      });
      afterEach(() => { vi.restoreAllMocks(); });

      it('creates Object URL from fetched Blob and mounts hidden iframe', async () => {
        const { printReceipt } = await import('./printReceipt');
        const printSpy = vi.fn();
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
          configurable: true,
          get() { return { focus: vi.fn(), print: printSpy }; },
        });
        // Trigger onload synchronously inside Promise.resolve
        const original = document.createElement.bind(document);
        const created: HTMLIFrameElement[] = [];
        document.createElement = ((tag: string) => {
          const el = original(tag);
          if (tag === 'iframe') {
            queueMicrotask(() => (el as HTMLIFrameElement).onload?.(new Event('load')));
            created.push(el as HTMLIFrameElement);
          }
          return el;
        }) as any;
        await printReceipt('sale-1');
        expect(createObjectURL).toHaveBeenCalled();
        expect(printSpy).toHaveBeenCalled();
        expect(created.length).toBeGreaterThan(0);
      });
    });
    ```
  </action>
  <verify>
    <automated>npx vitest run lib/pos/printReceipt.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run lib/pos/printReceipt.test.ts` exits 0 with 1+ passing test
    - `npx tsc --noEmit` exits 0
    - `grep -c "create(devtools" store/posCartStore.ts` returns >= 1
    - `grep -c "iframe.contentWindow.print" lib/pos/printReceipt.ts` returns >= 1
    - `grep -c "revokeObjectURL" lib/pos/printReceipt.ts` returns >= 2 (sale + refund)
    - `grep -c "stripe-confirm\|stripe_confirm" lib/pos/api.ts` returns >= 1
    - `grep -c "/api/sales\|/api/refunds\|/api/pos" lib/pos/api.ts` returns >= 4
  </acceptance_criteria>
  <done>Store + API client + print helper shipped; vitest green; tsc clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: 8 React components (CartLineList, PaymentPanel, CashPaymentForm, StripePaymentForm, ExternalCardPaymentForm, WriteOffPaymentForm, DiscountPopover, ReceiptDeliveryPrompt, PrefillSearchModal) + app/(tenant)/[tenant]/pos/page.tsx; replace StripePaymentForm vitest stub</name>
  <files>app/(tenant)/[tenant]/pos/page.tsx, components/pos/CartLineList.tsx, components/pos/PaymentPanel.tsx, components/pos/CashPaymentForm.tsx, components/pos/StripePaymentForm.tsx, components/pos/ExternalCardPaymentForm.tsx, components/pos/WriteOffPaymentForm.tsx, components/pos/DiscountPopover.tsx, components/pos/ReceiptDeliveryPrompt.tsx, components/pos/PrefillSearchModal.tsx, components/pos/StripePaymentForm.test.tsx</files>
  <read_first>
    - .planning/phases/15-point-of-sale/15-UI-SPEC.md (FULL FILE — every component/copy/state spec)
    - app/(tenant)/[tenant]/inventory/page.tsx (Phase 13 layout pattern — clone tab + filter rows)
    - components/optical/OrderDetailDrawer.tsx (Phase 13 — drawer/modal patterns)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pattern 6 (Stripe Elements code — clone redirect: 'if_required')
    - app/globals.css (glass-card, glass-input, .text-display, .font-mono-data utilities — confirm class names)
  </read_first>
  <action>
    Build each component per UI-SPEC. Key requirements (acceptance_criteria below enforces):

    **`StripePaymentForm.tsx`** — wraps `<Elements>` + `<PaymentElement>`; calls `stripe.confirmPayment({ elements, redirect: 'if_required' })`. On success, calls `usePosCartStore().confirmStripePayment(paymentIntent.id)`. On `error`, shows toast and keeps form mounted for retry. On `requires_action`, Stripe auto-redirects; on return, BFF retrieve re-confirms.

    **`CashPaymentForm.tsx`** — two `<input type="text" inputMode="decimal" />` inputs (amount + tendered); computes change_due live; validates `tendered >= amount`; submit calls `addCashPayment(amount, tendered)`.

    **`ExternalCardPaymentForm.tsx`** — three inputs (amount, last4 4-digit, optional authCode). Submit calls `addExternalCardPayment`.

    **`WriteOffPaymentForm.tsx`** — visible only when `useEntitlements().has(...)` includes role OWNER or ADMIN. Form with amount + textarea reason_note (rows=3, min length 3). Submit calls `addWriteOff`.

    **`DiscountPopover.tsx`** — Radix Popover with $/% toggle + amount + reason textarea (min 3 chars). Submit calls `useUpdateLine(lineId, {discountAmount, discountReason})`.

    **`CartLineList.tsx`** — table per UI-SPEC: description / qty stepper / unit price (mono) / discount (popover trigger) / line_total (mono). Each row has "Remove" hover action. Empty state per UI-SPEC §Empty states.

    **`PaymentPanel.tsx`** — payment method pills (Cash/Card/External card/Write-off) gated by entitlement+role; below, the selected form component. Totals stack at top (Subtotal/Discount/Tax/Total via `.text-display` accent). "Amount remaining" label. "Close sale" button disabled until `remaining <= 0`.

    **`ReceiptDeliveryPrompt.tsx`** — modal that appears post-close. Three CTAs: Print receipt / Email receipt / Print and email. Email path opens inline email-override input prefilled with patient.email.

    **`PrefillSearchModal.tsx`** — patient search + Superbill picker + OpticalOrder picker, all gated on patient context.

    **`app/(tenant)/[tenant]/pos/page.tsx`** — `'use client'` (Stripe Elements requires client component). 60/40 cart-vs-payment layout on lg+ per UI-SPEC. Reads `?patient` + `?prefill` query params and calls `usePosCartStore().open(...)` on mount when present. Sidebar nav entry registered separately (see acceptance — emit a comment marker so Plan 15-10 wires sidebar).

    **Replace `components/pos/StripePaymentForm.test.tsx`** (replace describe.skip):

    ```tsx
    import { describe, it, expect, vi } from 'vitest';
    import { render, screen } from '@testing-library/react';

    vi.mock('@stripe/stripe-js', () => ({
      loadStripe: vi.fn(() => Promise.resolve({ confirmPayment: vi.fn() })),
    }));

    vi.mock('@stripe/react-stripe-js', () => ({
      Elements: ({ children }: any) => <div data-testid="elements-wrapper">{children}</div>,
      PaymentElement: () => <div data-testid="payment-element" />,
      useStripe: () => ({ confirmPayment: vi.fn() }),
      useElements: () => ({}),
    }));

    describe('StripePaymentForm', () => {
      it('renders Elements wrapper + PaymentElement once clientSecret is set', async () => {
        const { StripePaymentForm } = await import('./StripePaymentForm');
        render(<StripePaymentForm saleId="s1" amount="100.00" publishableKey="pk_test_x" clientSecret="pi_x_secret" onSuccess={() => {}} />);
        expect(await screen.findByTestId('elements-wrapper')).toBeInTheDocument();
        expect(await screen.findByTestId('payment-element')).toBeInTheDocument();
      });
    });
    ```
  </action>
  <verify>
    <automated>npx vitest run components/pos/StripePaymentForm.test.tsx && npx tsc --noEmit && ls -la app/\(tenant\)/\[tenant\]/pos/page.tsx components/pos/CartLineList.tsx components/pos/PaymentPanel.tsx components/pos/CashPaymentForm.tsx components/pos/StripePaymentForm.tsx components/pos/ExternalCardPaymentForm.tsx components/pos/WriteOffPaymentForm.tsx components/pos/DiscountPopover.tsx components/pos/ReceiptDeliveryPrompt.tsx components/pos/PrefillSearchModal.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` exits 0
    - `npx vitest run components/pos/StripePaymentForm.test.tsx` passes 1+ test
    - All 10 component files exist
    - `grep -c "redirect: 'if_required'" components/pos/StripePaymentForm.tsx` returns >= 1 (Pitfall 9)
    - `grep -c "PaymentElement" components/pos/StripePaymentForm.tsx` returns >= 1 (modern element, NOT CardElement)
    - `grep -c "CardElement" components/pos/StripePaymentForm.tsx` returns 0 (deprecated)
    - `grep -c "type=\"text\".*inputMode=\"decimal\"\|inputMode=\"decimal\".*type=\"text\"" components/pos/CashPaymentForm.tsx` returns >= 2 (Pitfall 12 — amount + tendered)
    - `grep -c "type=\"number\"" components/pos/CashPaymentForm.tsx components/pos/ExternalCardPaymentForm.tsx components/pos/WriteOffPaymentForm.tsx` returns 0 — never number for currency
    - `grep -c "reason_note\|reasonNote" components/pos/WriteOffPaymentForm.tsx` returns >= 1
    - `grep -c "discountReason\|discount_reason" components/pos/DiscountPopover.tsx` returns >= 1
    - `grep -rEn "text-white/[0-9]|bg-white/[0-9]|text-black/[0-9]" components/pos/ | wc -l` returns 0 — no hardcoded colors per UI-SPEC feedback rule
    - `grep -c "Take payment\|Point of Sale" app/\(tenant\)/\[tenant\]/pos/page.tsx` returns >= 1
    - `grep -c "'use client'" app/\(tenant\)/\[tenant\]/pos/page.tsx components/pos/StripePaymentForm.tsx` returns >= 2 (both client components)
    - `grep -c "Close sale\|closeSale" app/\(tenant\)/\[tenant\]/pos/page.tsx components/pos/PaymentPanel.tsx | head -5` shows at least one match
  </acceptance_criteria>
  <done>POS full-page checkout + 8 components ship; type-checks; Stripe Elements via modern PaymentElement; no hardcoded colors.</done>
</task>

</tasks>

<verification>
- /pos page renders with cart + payment panel
- Stripe Elements integration uses redirect: 'if_required'
- Cash/external/write-off forms validate per business rules
- Discount + write-off require non-empty reason
- Print iframe pattern works under jsdom
</verification>

<success_criteria>
ROADMAP #1 + #2 FE deliverables shipped: checkout UI + cash/card/external/write-off payments + receipt print.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-09-SUMMARY.md`
</output>
