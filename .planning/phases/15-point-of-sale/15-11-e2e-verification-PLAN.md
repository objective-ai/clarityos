---
phase: 15-point-of-sale
plan: 11
type: execute
wave: 9
depends_on: [15-10]
files_modified:
  - tests/e2e/pos-checkout.spec.ts
  - tests/e2e/pos-refund.spec.ts
  - tests/e2e/pos-daily-close.spec.ts
  - backend/seed_db.py
  - .planning/phases/15-point-of-sale/15-VALIDATION.md
autonomous: false
requirements: [POS-01, POS-02, POS-03, POS-04, POS-05, POS-06, POS-10, POS-11]

must_haves:
  truths:
    - "tests/e2e/pos-checkout.spec.ts covers: open sale prefilled from superbill → add ad-hoc product → cash payment full → close → receipt prompt prints PDF"
    - "tests/e2e/pos-checkout.spec.ts also covers: split tender (50% cash + 50% external_card) → close gates remaining=0"
    - "tests/e2e/pos-checkout.spec.ts also covers: Stripe path mocked at network layer (route.fulfill PaymentIntent.create + retrieve) → PaymentElement renders → confirm flow writes Payment"
    - "tests/e2e/pos-refund.spec.ts covers: item-level refund of optical_order line → restock visible in Inventory → OpticalOrder.status='cancelled' when all lines refunded"
    - "tests/e2e/pos-daily-close.spec.ts covers: OWNER navigates /pos/close-of-day → totals render → enter counted_cash with variance → Save and close day → CSV export downloads"
    - "backend/seed_db.py extends with _seed_pos_fixtures(): one paid Sale + one refunded Sale for dev demo data; idempotent guard"
    - "VALIDATION.md per-task table populated with one row per task across plans 15-00..15-10; nyquist_compliant: true set in frontmatter"
  artifacts:
    - path: "tests/e2e/pos-checkout.spec.ts"
      provides: "Checkout flow E2E"
      contains: "POS-01\\|POS-02\\|POS-06"
    - path: "tests/e2e/pos-refund.spec.ts"
      provides: "Refund flow E2E"
      contains: "POS-05"
    - path: "tests/e2e/pos-daily-close.spec.ts"
      provides: "Daily close E2E"
      contains: "POS-04"
    - path: ".planning/phases/15-point-of-sale/15-VALIDATION.md"
      provides: "Per-task validation table populated"
      contains: "nyquist_compliant: true"
  key_links:
    - from: "Playwright tests"
      to: "FastAPI + Next.js servers"
      via: "bash scripts/dev.sh pre-test gate"
      pattern: "pre-test"
    - from: "VALIDATION.md"
      to: "every plan task"
      via: "one row per task with automated verify command"
      pattern: "15-NN-NN"
---

<objective>
Activate Wave-0 Playwright skeletons with real assertions; extend seed data with POS fixtures; finalize VALIDATION.md per-task table; HIPAA-critical human checkpoint before phase closure.

Output: `npx playwright test tests/e2e/pos-*.spec.ts` GREEN (auth tests use storageState per project convention); seed re-run produces idempotent POS rows; VALIDATION.md flips nyquist_compliant: true.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-point-of-sale/15-VALIDATION.md
@.planning/phases/15-point-of-sale/15-UI-SPEC.md
@playwright.config.ts
@tests/e2e/fixtures.ts
@tests/e2e/optical-orders.spec.ts
@tests/e2e/billing.spec.ts
@backend/seed_db.py

<interfaces>
<!-- Project Playwright fixtures (see CLAUDE.md testing rules) -->
```typescript
// tests/e2e/fixtures.ts — provides { test, expect } + consoleErrors + apiCalls
import { test, expect } from './fixtures';
// auth: storageState in playwright.config.ts auth-flows project — no manual login
```

<!-- Stripe mock via Playwright route -->
```typescript
await page.route('**/v1/payment_intents', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ id: 'pi_test_x', client_secret: 'pi_test_x_secret_y', status: 'requires_payment_method' }),
}));
```

<!-- Phase 13 seed pattern from backend/seed_db.py -->
```python
def _seed_retail_inventory(session):
    # idempotent: SELECT first; insert if missing
    # guard on (tenant_id, sku, is_active=true)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Activate 3 Playwright specs with real assertions; extend seed_db.py with _seed_pos_fixtures(); finalize VALIDATION.md</name>
  <files>tests/e2e/pos-checkout.spec.ts, tests/e2e/pos-refund.spec.ts, tests/e2e/pos-daily-close.spec.ts, backend/seed_db.py, .planning/phases/15-point-of-sale/15-VALIDATION.md</files>
  <read_first>
    - tests/e2e/optical-orders.spec.ts (Phase 13 — clone E2E shape, role switching, fixtures usage)
    - tests/e2e/billing.spec.ts (clone Superbill assertion patterns)
    - tests/e2e/fixtures.ts (full file — fixture API)
    - playwright.config.ts (auth-flows project for @auth tests; default project uses storageState)
    - backend/seed_db.py (full _seed_retail_inventory function — clone idempotency pattern for POS fixtures)
    - .planning/phases/15-point-of-sale/15-VALIDATION.md (current state — per-task table is empty; fill in)
  </read_first>
  <action>
    Five concrete edits.

    **A. `tests/e2e/pos-checkout.spec.ts`** (replace `test.skip` with active tests):

    ```typescript
    import { test, expect } from './fixtures';

    test.describe('POS Checkout (POS-01, POS-02, POS-06)', () => {
      test('POS-01: open sale prefilled from superbill, add ad-hoc line, cash payment, close, print receipt', async ({ page }) => {
        // Navigate to seeded paid Sale's source: open POS for a known superbill
        await page.goto('/duytran-clinic/pos?patient=PATIENT_SEED&prefill=superbill:SUPERBILL_SEED');
        // Cart shows superbill copay line
        await expect(page.getByText(/Encounter copay/)).toBeVisible();
        // Add ad-hoc line
        await page.getByRole('button', { name: /add line/i }).click();
        await page.getByLabel(/description/i).fill('Spare cleaning kit');
        await page.getByLabel(/unit price/i).fill('15.00');
        await page.getByRole('button', { name: /save line/i }).click();
        // Select cash payment
        await page.getByRole('button', { name: /^cash$/i }).click();
        // Tendered exceeds amount → change_due
        await page.getByLabel(/tendered/i).fill('50.00');
        await page.getByRole('button', { name: /record cash payment/i }).click();
        // Close sale
        await page.getByRole('button', { name: /close sale/i }).click();
        // Receipt prompt appears
        await expect(page.getByText(/sale closed/i)).toBeVisible();
        // Verify receipt PDF download accessible via direct fetch (assert response 200)
        const receiptUrl = page.url().replace(/\/pos.*$/, '/pos');  // navigate stays on /pos
        const response = await page.request.get('/api/sales/CURRENT_SALE_ID/receipt/');
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('application/pdf');
      });

      test('POS-06: split tender — 50% cash + 50% external card', async ({ page }) => {
        await page.goto('/duytran-clinic/pos');
        // ... add lines via cart ...
        // Pay 50% cash
        await page.getByRole('button', { name: /^cash$/i }).click();
        await page.getByLabel(/amount/i).fill('50.00');
        await page.getByLabel(/tendered/i).fill('50.00');
        await page.getByRole('button', { name: /record cash payment/i }).click();
        // Remaining shows $50
        await expect(page.getByText(/amount remaining.*\$50\.00/i)).toBeVisible();
        // Close button disabled
        await expect(page.getByRole('button', { name: /close sale/i })).toBeDisabled();
        // Pay rest with external card
        await page.getByRole('button', { name: /external card/i }).click();
        await page.getByLabel(/amount/i).fill('50.00');
        await page.getByLabel(/last4/i).fill('4242');
        await page.getByRole('button', { name: /record card payment/i }).click();
        // Close enabled
        await expect(page.getByRole('button', { name: /close sale/i })).toBeEnabled();
      });

      test('POS-02: Stripe Elements path with mocked PaymentIntent', async ({ page }) => {
        // Mock Stripe API responses at network layer
        await page.route('**/api/sales/*/payments/**', async (route) => {
          if (route.request().method() === 'POST' && !route.request().url().includes('stripe-confirm')) {
            // Init: returns clientSecret
            await route.fulfill({ status: 201, contentType: 'application/json',
              body: JSON.stringify({ paymentId: 'pmt_mock_1', clientSecret: 'pi_mock_secret_x',
                                     publishableKey: 'pk_test_fake', intentId: 'pi_mock' }) });
          } else {
            await route.continue();
          }
        });
        await page.route('https://js.stripe.com/**', (route) => route.fulfill({ status: 200, body: '' }));
        // ... open sale, add line, click Card pill, expect PaymentElement testid mounted ...
        // Note: cannot actually confirm in test mode without real Stripe; assert Elements wrapper appears.
      });
    });
    ```

    Use Playwright's `page.request` API to seed the sale via direct BFF POST before each test rather than relying on seed-only IDs — more robust. If the seed approach is preferred, document the assumption in the spec docstring.

    **B. `tests/e2e/pos-refund.spec.ts`** (POS-05):
    - Test: navigate to `/patients/{id}` → Payments tab → click on a paid Sale → Refund items → select first line full qty → enter reason "Customer returned" → confirm → expect refund total in `.text-display` and refund row added.
    - Verify cancelled OpticalOrder.status check via GET `/api/optical-orders/{id}/`.

    **C. `tests/e2e/pos-daily-close.spec.ts`** (POS-04, POS-10):
    - Tagged `@auth` or run via owner-storage-state.
    - Navigate `/pos/close-of-day`. Date defaults today.
    - Assert 4 sections render.
    - Enter counted_cash, observe variance display.
    - Click "Save and close day" → expect 200 response.
    - Click "Export CSV" → assert download header `text/csv` via `page.request.get('/api/pos/daily-close/{id}/export/?format=csv')`.

    **D. Extend `backend/seed_db.py`** with `_seed_pos_fixtures(session)`:
    - Idempotent guard: skip if any Sale exists for the seed tenant.
    - Create one paid Sale (1 superbill copay line + 1 product line) with cash Payment + stripe_card Payment.
    - Create one Refund on a separate Sale with restock written.
    - Wire into `seed_tenant_schema()` orchestrator AFTER `_seed_retail_inventory()` and `_seed_lens_reference()`.

    **E. Finalize `.planning/phases/15-point-of-sale/15-VALIDATION.md`:**
    - Replace placeholder per-task row with one row per task across plans 15-00 through 15-10.
    - For each task, list: Task ID (e.g., `15-04-01`), Plan, Wave, Requirement, Test Type, Automated Command, File Exists (`✅` after this plan), Status (`⬜ pending` until run).
    - Set `status: ready` and `nyquist_compliant: true` and `wave_0_complete: true` in frontmatter.
    - Document the 4 Manual-Only Verifications table (already present, keep).
    - Set "Validation Sign-Off" checkboxes — leave checker to sign off, but mark the technical checklist complete.
  </action>
  <verify>
    <automated>bash scripts/dev.sh check-api && npx playwright test tests/e2e/pos-checkout.spec.ts tests/e2e/pos-refund.spec.ts tests/e2e/pos-daily-close.spec.ts --reporter=line && cd backend && python -c "from backend.seed_db import _seed_pos_fixtures; print('ok')" && grep -c "nyquist_compliant: true" .planning/phases/15-point-of-sale/15-VALIDATION.md</automated>
  </verify>
  <acceptance_criteria>
    - All 3 Playwright specs exist with no `test.skip` markers (`describe.skip` or `test.skip` would block real coverage)
    - `grep -c "test.skip\|test\\.describe\\.skip" tests/e2e/pos-checkout.spec.ts tests/e2e/pos-refund.spec.ts tests/e2e/pos-daily-close.spec.ts` returns 0
    - `grep -c "POS-01\|POS-02\|POS-06" tests/e2e/pos-checkout.spec.ts` returns >= 3
    - `grep -c "POS-05" tests/e2e/pos-refund.spec.ts` returns >= 1
    - `grep -c "POS-04\|POS-10" tests/e2e/pos-daily-close.spec.ts` returns >= 2
    - `grep -c "_seed_pos_fixtures" backend/seed_db.py` returns >= 2 (def + call)
    - `python -c "from backend.seed_db import _seed_pos_fixtures; print('ok')"` exits 0
    - `grep -c "nyquist_compliant: true" .planning/phases/15-point-of-sale/15-VALIDATION.md` returns 1
    - `grep -c "wave_0_complete: true" .planning/phases/15-point-of-sale/15-VALIDATION.md` returns 1
    - VALIDATION.md per-task table has >= 20 task rows (one per task across plans 15-00..15-10)
    - Playwright run: at least one assertion per spec passes (full green not required if Stripe live-confirm is mocked and limits coverage; mock-based assertions must pass)
  </acceptance_criteria>
  <done>E2E specs active; seed data idempotent; VALIDATION.md complete.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: HIPAA-critical phase closure checkpoint — live Stripe test-mode E2E + Fernet round-trip canary + Postmark receipt email + entitlement matrix verification</name>
  <action>This task is a human-verification checkpoint — no automated action. Execute the steps in <how-to-verify> manually, document outcomes in the referenced VERIFICATION/CHECKPOINT file, and use the resume-signal to continue.</action>
  <what-built>
    Phase 15 ships:
    - Per-tenant Stripe credentials (encrypted at rest)
    - Stripe webhook handler (signature-verified + idempotent + monotonic)
    - Receipt + refund-receipt PDFs (rendered server-side, never leaving the FastAPI container)
    - Postmark-delivered receipt emails with patient-name PHI + PDF attachments
    - Daily-close cash reconciliation with audit
    - Refund flow with restock + processor refund

    All HIPAA-sensitive surfaces have audit rows; PHI scrubber (Phase 10.3) is the safety net for Stripe payload logging.
  </what-built>
  <how-to-verify>
    1. **Live Stripe test-mode end-to-end** — configure a real Stripe testmode account, save keys in Admin > POS Payments, open a sale, complete checkout with test card `4242 4242 4242 4242`, verify Payment row written via `/api/sales/{id}/` showing status=succeeded + last4=4242 + processor_payment_id+processor_charge_id. Verify webhook fires (use Stripe CLI `stripe listen --forward-to localhost:3000/api/webhooks/stripe`). Assert StripeWebhookEvent row created.

    2. **Fernet round-trip canary at startup** — manually verify that on FastAPI startup with an existing tenant having `stripe_secret_key_encrypted`, `decrypt_secret(tenant.stripe_secret_key_encrypted)` succeeds (no `InvalidToken`). Document the procedure: "Add a startup-time check that decrypts a canary value via PAYMENTS_FERNET_KEY; fail loud if it errors" — this is a follow-up enhancement, not in scope for Phase 15, but document the risk per RESEARCH Pitfall 5.

    3. **Postmark receipt email** — trigger POST `/api/sales/{id}/receipt/email/` with `{to: "owner+test@yourdomain.com"}`. Verify email arrives in inbox with PDF attachment. Verify the Postmark dashboard shows the send. Audit RECEIPT_EMAILED row present.

    4. **Entitlement matrix** — log in as user with NO `retail_pos` entitlement. Verify: (a) `/pos` returns 403 or redirects, (b) Sidebar nav hides "Point of Sale", (c) "Take payment" CTAs hidden on Superbill row + OrderDetailDrawer + AppointmentDetailDrawer, (d) `/api/sales/` GET returns 403 from backend. Switch to a user with `retail_pos`. Verify everything appears.

    5. **Role matrix** — TECHNICIAN/RECEPTIONIST: can open sale + record cash/external_card but cannot write_off (button hidden, route 403). OWNER/ADMIN: all visible. Verify by switching roles via dev switcher.

    6. **PHI scrubber sanity** — generate one Stripe webhook + one receipt-email audit row. Inspect the audit log; confirm no patient names, addresses, DOBs are stored in the metadata field (only Stripe IDs + receipt numbers + recipient email).

    7. **Daily-close round-trip** — run /pos/close-of-day for today after seed data + the live test sale; counted_cash = expected_cash → variance = $0.00; Save and close day; refresh page → shows is_closed=true + read-only counted_cash + run_at + run_by. Try POST again same date → expect 409.

    8. **Refund cascade** — refund 100% of an OpticalOrder; verify OpticalOrder.status flips to 'cancelled' via `/api/optical-orders/{id}/`. Verify Product.stock_qty incremented + InventoryTransaction(reason='refund_restock') row.

    Document each verification result in `.planning/phases/15-point-of-sale/15-VERIFICATION.md` (create if absent). Owner signs off in writing in that file.
  </how-to-verify>
  <resume-signal>
    Type `approved` once all 8 verifications pass and 15-VERIFICATION.md is signed by OWNER.
    Type `defer` only if no production tenant exists yet AND the dev tenant has been verified end-to-end (Stripe testmode + Postmark dev sandbox).
    Type `issues` followed by a numbered list if any verification fails — that triggers `/gsd:plan-phase 15-point-of-sale --gaps` to schedule gap closure.
  </resume-signal>
</task>

</tasks>

<verification>
- 3 Playwright specs active + at least skeleton assertions
- Seed data idempotent
- VALIDATION.md nyquist_compliant: true
- HIPAA checkpoint signed before phase closure
</verification>

<success_criteria>
Phase 15 ships ROADMAP success criteria 1-5; all 16 POS-* requirements traceable; HIPAA + Stripe + Postmark verifications signed off.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-11-SUMMARY.md` AND `.planning/phases/15-point-of-sale/15-VERIFICATION.md`.
</output>
