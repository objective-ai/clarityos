---
phase: 15-point-of-sale
plan: 00
type: execute
wave: 1
depends_on: []
files_modified:
  - requirements.txt
  - package.json
  - .env.example
  - backend/tests/conftest.py
  - backend/tests/test_pos_models.py
  - backend/tests/test_sale_cart_load.py
  - backend/tests/test_payment_cash.py
  - backend/tests/test_stripe_processor.py
  - backend/tests/test_webhooks_stripe.py
  - backend/tests/test_receipt_pdf.py
  - backend/tests/test_receipt_email.py
  - backend/tests/test_daily_close.py
  - backend/tests/test_daily_close_export.py
  - backend/tests/test_refund_restock.py
  - backend/tests/test_refund_optical_cascade.py
  - backend/tests/test_split_tender.py
  - backend/tests/test_processor_protocol.py
  - backend/tests/test_payments_crypto.py
  - backend/tests/test_admin_payment_config.py
  - backend/tests/test_permissions_pos.py
  - backend/tests/test_payment_writeoff.py
  - backend/tests/test_pos_enums.py
  - backend/tests/test_sale_tax.py
  - backend/tests/test_sale_discount.py
  - backend/tests/test_sales_contract.py
  - components/pos/StripePaymentForm.test.tsx
  - lib/pos/printReceipt.test.ts
  - types/sales.contract.test.ts
  - tests/e2e/pos-checkout.spec.ts
  - tests/e2e/pos-refund.spec.ts
  - tests/e2e/pos-daily-close.spec.ts
  - .planning/REQUIREMENTS.md
autonomous: false
requirements: [POS-01, POS-02, POS-03, POS-04, POS-05, POS-06, POS-07, POS-08, POS-09, POS-10, POS-11, POS-12, POS-13, POS-14, POS-15, POS-16]

must_haves:
  truths:
    - "Stripe SDK + cryptography pinned and importable in backend"
    - "Stripe React + stripe-js installed and importable in frontend"
    - "PAYMENTS_FERNET_KEY documented in .env.example"
    - "All 25+ Wave-0 test files exist with skip-stubs and reference the right pytest markers"
    - "POS-01..POS-16 appended to REQUIREMENTS.md with Phase 15 mapping"
    - "Resend BAA decision honored — Postmark used, not Resend, in receipt_email test"
  artifacts:
    - path: "requirements.txt"
      provides: "Pinned stripe + cryptography + reportlab"
      contains: "stripe>="
    - path: "package.json"
      provides: "@stripe/stripe-js and @stripe/react-stripe-js deps"
      contains: "@stripe/react-stripe-js"
    - path: "backend/tests/conftest.py"
      provides: "sale_factory, payment_factory, refund_factory, fake StripeProcessor"
      contains: "sale_factory"
    - path: ".planning/REQUIREMENTS.md"
      provides: "POS-01..POS-16 requirement rows + traceability table entries"
      contains: "POS-01"
  key_links:
    - from: ".env.example"
      to: "backend/services/payments/crypto.py (later plan)"
      via: "PAYMENTS_FERNET_KEY env var"
      pattern: "PAYMENTS_FERNET_KEY"
    - from: "backend/tests/conftest.py"
      to: "all backend/tests/test_pos_*.py"
      via: "shared fixtures (sale_factory, fake_stripe_processor)"
      pattern: "sale_factory"
---

<objective>
Wave-0 foundation for Phase 15: install Stripe + cryptography deps, pin reportlab (existing gap), create Wave-0 test scaffold (25 skip-stubbed test files), extend conftest with POS factories + fake StripeProcessor, document PAYMENTS_FERNET_KEY env var, and append POS-01..POS-16 to REQUIREMENTS.md with traceability rows.

Purpose: ensure feature plans have a real automated <verify> target on day one (not "MISSING") and that requirement IDs trace cleanly from REQUIREMENTS.md → plans → tests. Per `feedback_skip_stubs_anti_pattern.md`, every skip-stub must have a real assertion body that activates once dependencies land — no "tests waiting for fixtures" anti-pattern.

Output: a green skip-state test suite (`pytest backend/tests/test_pos_*.py` and `npx vitest run` both exit 0 with skip messages), pinned deps in requirements.txt and package.json, env-var documented in .env.example, REQUIREMENTS.md updated.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@.planning/phases/15-point-of-sale/15-RESEARCH.md
@.planning/phases/15-point-of-sale/15-VALIDATION.md
@backend/tests/conftest.py
@requirements.txt
@package.json
@.env.example

<interfaces>
<!-- Stripe SDK contract (server-side) -->
```python
# stripe-python 15.2.0
stripe.PaymentIntent.create(api_key=str, amount=int, currency=str, automatic_payment_methods=dict, metadata=dict, idempotency_key=str) -> PaymentIntent
stripe.PaymentIntent.retrieve(intent_id, api_key=str) -> PaymentIntent
stripe.Refund.create(payment_intent=str, amount=int, api_key=str) -> Refund
stripe.Webhook.construct_event(payload: bytes, sig_header: str, secret: str) -> Event
```

<!-- Stripe React contract (client-side) -->
```typescript
// @stripe/react-stripe-js 6.4.0 + @stripe/stripe-js 9.7.0
loadStripe(publishableKey: string): Promise<Stripe | null>
<Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
<PaymentElement />
useStripe(): Stripe
useElements(): StripeElements
stripe.confirmPayment({ elements, redirect: 'if_required' }): Promise<{ paymentIntent?, error? }>
```

<!-- Fernet contract -->
```python
from cryptography.fernet import Fernet, MultiFernet, InvalidToken
Fernet.generate_key() -> bytes
Fernet(key).encrypt(plaintext: bytes) -> bytes  # ciphertext starts with b"gAAAA"
Fernet(key).decrypt(ciphertext: bytes) -> bytes
```

<!-- Existing project test patterns (from Phase 13/14 Wave 0) -->
```python
# backend/tests/conftest.py pattern from Phase 13:
# Try import; on Settings() ValidationError, pytest.skip(allow_module_level=True)
# db_session, tenant_context are pre-seeded skip-stubs from Phase 13 Wave 0
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Pin Stripe + cryptography + reportlab in requirements.txt; install @stripe/stripe-js + @stripe/react-stripe-js in package.json; add PAYMENTS_FERNET_KEY + STRIPE_API_VERSION to .env.example</name>
  <files>requirements.txt, package.json, .env.example</files>
  <read_first>
    - requirements.txt (current state — confirm cryptography is transitive via python-jose, NOT explicit)
    - package.json (current state — confirm Stripe libs absent)
    - .env.example (current state — see how previous phases formatted env-var blocks; mirror exactly)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Standard Stack + §Wave 0 Gaps
  </read_first>
  <action>
    Three concrete edits:

    1. `requirements.txt` — APPEND three pinned lines (use the EXACT specifiers below; do not deduplicate cryptography even if pulled transitively — we want an explicit pin):
       ```
       stripe>=15.2,<16
       cryptography>=46.0,<48.0
       reportlab>=4.4,<5.0
       ```
       Place them after the existing `python-jose[cryptography]>=3.3` line. Group under a `# Phase 15 — Point of Sale` comment heading.

    2. `package.json` — add to `dependencies` (NOT devDependencies):
       ```
       "@stripe/stripe-js": "^9.7.0",
       "@stripe/react-stripe-js": "^6.4.0",
       ```
       Then run `npm install` to update `package-lock.json`. Do NOT use `--save-exact`.

    3. `.env.example` — APPEND a `# Phase 15 — Point of Sale` block with:
       ```
       # Master key for tenant Stripe secret encryption (Fernet AES-128-CBC + HMAC-SHA256).
       # Generate once per environment: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
       # ROTATION: never rotate without MultiFernet([new, old]) transition window — see Phase 15 RESEARCH Pitfall 5.
       PAYMENTS_FERNET_KEY=
       # Stripe API version pin (match dashboard webhook + SDK).
       STRIPE_API_VERSION=2026-03-25.dahlia
       ```
       Do NOT put a real Fernet key in .env.example — the value stays blank, only the comment block ships.

    Do NOT install the actual env-var into local `.env` here (the executor cannot generate a real Fernet key safely without ceremony; that is Plan 15-02 work where crypto.py lives).
  </action>
  <verify>
    <automated>cd backend && python -c "import stripe, cryptography, reportlab; print(stripe.__version__, cryptography.__version__, reportlab.Version)" && npx --no-install tsc --noEmit && grep -q "PAYMENTS_FERNET_KEY" .env.example && grep -q "@stripe/react-stripe-js" package.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "^stripe>=15.2,<16$" requirements.txt` returns `1` exactly
    - `grep -c "^cryptography>=46.0,<48.0$" requirements.txt` returns `1` exactly
    - `grep -c "^reportlab>=4.4,<5.0$" requirements.txt` returns `1` exactly
    - `python -c "import stripe; assert stripe.__version__.startswith('15.')"` exits 0
    - `python -c "from cryptography.fernet import Fernet, MultiFernet, InvalidToken; print('ok')"` prints `ok`
    - `node -e "require('@stripe/react-stripe-js'); require('@stripe/stripe-js'); console.log('ok')"` prints `ok`
    - `grep -c "PAYMENTS_FERNET_KEY" .env.example` returns `1` exactly
    - `grep -c "STRIPE_API_VERSION=2026-03-25.dahlia" .env.example` returns `1` exactly
    - `.env.example` PAYMENTS_FERNET_KEY value is BLANK (line ends `PAYMENTS_FERNET_KEY=` with nothing after `=`)
    - `package.json` dependencies contains both `@stripe/stripe-js` and `@stripe/react-stripe-js`
  </acceptance_criteria>
  <done>All deps importable; .env.example documents PAYMENTS_FERNET_KEY without leaking a real key.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Extend backend/tests/conftest.py with sale_factory + payment_factory + refund_factory fixtures + fake_stripe_processor stub; create 21 backend pytest test files with skip-stubs + real assertion bodies; create 3 vitest/Playwright skeletons; append POS-01..POS-16 to REQUIREMENTS.md</name>
  <files>backend/tests/conftest.py, backend/tests/test_pos_models.py, backend/tests/test_sale_cart_load.py, backend/tests/test_payment_cash.py, backend/tests/test_stripe_processor.py, backend/tests/test_webhooks_stripe.py, backend/tests/test_receipt_pdf.py, backend/tests/test_receipt_email.py, backend/tests/test_daily_close.py, backend/tests/test_daily_close_export.py, backend/tests/test_refund_restock.py, backend/tests/test_refund_optical_cascade.py, backend/tests/test_split_tender.py, backend/tests/test_processor_protocol.py, backend/tests/test_payments_crypto.py, backend/tests/test_admin_payment_config.py, backend/tests/test_permissions_pos.py, backend/tests/test_payment_writeoff.py, backend/tests/test_pos_enums.py, backend/tests/test_sale_tax.py, backend/tests/test_sale_discount.py, backend/tests/test_sales_contract.py, components/pos/StripePaymentForm.test.tsx, lib/pos/printReceipt.test.ts, types/sales.contract.test.ts, tests/e2e/pos-checkout.spec.ts, tests/e2e/pos-refund.spec.ts, tests/e2e/pos-daily-close.spec.ts, .planning/REQUIREMENTS.md</files>
  <read_first>
    - backend/tests/conftest.py (read full file — extend, do NOT replace; keep Phase 13 db_session + tenant_context skip-stubs intact)
    - backend/tests/test_optical_order_atomicity.py OR backend/tests/test_inventory_atomicity.py (Phase 13 reference — see how skip-stubs that activate later were written; replicate exact pattern)
    - .planning/phases/15-point-of-sale/15-VALIDATION.md (mapping table — every row becomes a test function)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Wave 0 Gaps (full list)
    - .planning/REQUIREMENTS.md (current state — extend §Retail Inventory section; add new §Point of Sale section; extend Traceability table)
    - .claude/skills patterns: feedback_skip_stubs_anti_pattern.md → tests with real assertion bodies that skip via fixture chain are an anti-pattern; use `try/except → pytest.skip(allow_module_level=True)` ONLY for module-import-time errors (Settings validation)
  </read_first>
  <action>
    Three concrete groups of edits:

    **A. Extend `backend/tests/conftest.py`** (do not rewrite; APPEND fixtures after existing Phase 13 fixtures):

    ```python
    # --- Phase 15 POS fixtures ---
    from decimal import Decimal
    from uuid import uuid4, UUID
    from datetime import datetime, timezone, date
    from dataclasses import dataclass

    @pytest.fixture
    def sale_factory(db_session, tenant_context):
        """Build a Sale ORM instance — does NOT commit. Caller may .add() + .flush()."""
        async def _make(**overrides):
            # Lazy import so module loads even before Plan 15-01 lands the ORM
            try:
                from backend.db.models.tenant.clinical import Sale
            except ImportError:
                pytest.skip("Sale model not yet implemented (Plan 15-01)")
            defaults = dict(
                id=uuid4(),
                tenant_id=tenant_context.tenant_id,
                patient_id=overrides.get("patient_id", uuid4()),
                status="open",
                subtotal=Decimal("0.00"),
                tax=Decimal("0.00"),
                discount_total=Decimal("0.00"),
                total=Decimal("0.00"),
                created_by_id=None,
                opened_at=datetime.now(timezone.utc),
            )
            defaults.update(overrides)
            return Sale(**defaults)
        return _make

    @pytest.fixture
    def payment_factory(tenant_context):
        async def _make(sale_id: UUID, **overrides):
            try:
                from backend.db.models.tenant.clinical import Payment
            except ImportError:
                pytest.skip("Payment model not yet implemented (Plan 15-01)")
            defaults = dict(
                id=uuid4(),
                tenant_id=tenant_context.tenant_id,
                sale_id=sale_id,
                method="cash",
                amount=Decimal("0.00"),
                status="succeeded",
                created_at=datetime.now(timezone.utc),
            )
            defaults.update(overrides)
            return Payment(**defaults)
        return _make

    @pytest.fixture
    def refund_factory(tenant_context):
        async def _make(sale_id: UUID, **overrides):
            try:
                from backend.db.models.tenant.clinical import Refund
            except ImportError:
                pytest.skip("Refund model not yet implemented (Plan 15-01)")
            defaults = dict(
                id=uuid4(),
                tenant_id=tenant_context.tenant_id,
                sale_id=sale_id,
                total_amount=Decimal("0.00"),
                reason="test refund reason",
                refunded_by_id=None,
                created_at=datetime.now(timezone.utc),
            )
            defaults.update(overrides)
            return Refund(**defaults)
        return _make

    @dataclass(frozen=True)
    class _FakeIntent:
        intent_id: str = "pi_fake_123"
        client_secret: str = "pi_fake_123_secret_xyz"
        amount: Decimal = Decimal("100.00")
        currency: str = "usd"

    @dataclass(frozen=True)
    class _FakePayment:
        intent_id: str = "pi_fake_123"
        charge_id: str = "ch_fake_456"
        last4: str = "4242"
        brand: str = "visa"
        status: str = "succeeded"
        failure_reason: str | None = None

    @dataclass(frozen=True)
    class _FakeRefund:
        refund_id: str = "re_fake_789"
        amount: Decimal = Decimal("10.00")
        status: str = "succeeded"

    @pytest.fixture
    def fake_stripe_processor():
        """Drop-in replacement satisfying the PaymentProcessor Protocol shape (Plan 15-02)."""
        class _FakeProcessor:
            async def create_payment_intent(self, tenant, amount, currency, metadata):
                return _FakeIntent(amount=amount, currency=currency)
            async def confirm_payment(self, tenant, payment_intent_id):
                return _FakePayment(intent_id=payment_intent_id)
            async def refund_payment(self, tenant, payment, amount):
                return _FakeRefund(amount=amount)
            def verify_webhook_signature(self, tenant, body, signature):
                try:
                    from backend.services.payments.base import WebhookEvent
                except ImportError:
                    pytest.skip("PaymentProcessor base not yet implemented (Plan 15-02)")
                return WebhookEvent(
                    event_id="evt_fake_001",
                    event_type="payment_intent.succeeded",
                    payment_intent_id="pi_fake_123",
                    charge_id="ch_fake_456",
                    raw_payload={},
                )
        return _FakeProcessor()
    ```

    **B. Create 21 backend test files + 3 frontend files + 3 Playwright skeletons.**

    Each backend test file MUST follow this exact pattern (module-import skip on ValidationError; real assertion bodies inside tests; per-test skip ONLY when a downstream symbol doesn't import yet):

    ```python
    # backend/tests/test_pos_models.py
    """POS-12 — ORM models for Sale/SaleLineItem/Payment/Refund/RefundLineItem/RefundPayment + DailyCloseRun + StripeWebhookEvent."""
    import pytest
    from decimal import Decimal

    try:
        from backend.db.models.tenant.clinical import Sale, SaleLineItem, Payment, Refund, RefundLineItem, RefundPayment, DailyCloseRun, StripeWebhookEvent
    except ImportError:
        pytest.skip("POS ORM models not yet implemented (Plan 15-01)", allow_module_level=True)

    def test_sale_status_enum_values():
        from backend.db.models.tenant.clinical import SaleStatus
        assert {"open", "paid", "refunded", "voided"} == {s.value for s in SaleStatus}

    def test_payment_method_enum_values():
        from backend.db.models.tenant.clinical import PaymentMethod
        assert {"cash", "stripe_card", "external_card", "write_off"} == {s.value for s in PaymentMethod}

    def test_sale_line_item_source_type_enum():
        from backend.db.models.tenant.clinical import SaleLineItemSourceType
        assert {"superbill", "optical_order", "product", "adhoc"} == {s.value for s in SaleLineItemSourceType}
    ```

    Each test file's POS-### requirement mapping (one-liner docstring at top):
    | File | Req IDs | One-line purpose |
    | test_pos_models.py | POS-12 | Sale/Payment/Refund ORM enum + table sanity |
    | test_sale_cart_load.py | POS-01, POS-14 | Cart prefill Superbill/OpticalOrder; copay derivation |
    | test_payment_cash.py | POS-02 | Cash branch: tendered + change_due math |
    | test_stripe_processor.py | POS-02, POS-07 | StripeProcessor.create_payment_intent + confirm + refund (mocked stripe module) |
    | test_webhooks_stripe.py | POS-02 | Signature verify + idempotent event.id |
    | test_receipt_pdf.py | POS-03 | PDF bytes non-empty, starts with `%PDF-` |
    | test_receipt_email.py | POS-03 | Postmark client called with PDF attachment |
    | test_daily_close.py | POS-04, POS-10 | Aggregation by method/category + cash reconciliation |
    | test_daily_close_export.py | POS-04 | PDF + CSV smoke |
    | test_refund_restock.py | POS-05, POS-09 | restock + InventoryTransaction in same commit; superbill no-restock |
    | test_refund_optical_cascade.py | POS-05 | All-lines-refunded → OpticalOrder.status=cancelled |
    | test_split_tender.py | POS-06 | Multiple Payments per Sale, remaining=0 gate |
    | test_processor_protocol.py | POS-07 | StripeProcessor satisfies PaymentProcessor Protocol |
    | test_payments_crypto.py | POS-08 | Fernet encrypt/decrypt round-trip + MultiFernet rotation |
    | test_admin_payment_config.py | POS-08 | PUT /admin/payment-config/ encrypts before persistence (ciphertext starts `gAAAA`) |
    | test_permissions_pos.py | POS-11 | RECORD_WRITE_OFF/ISSUE_REFUND role matrix |
    | test_payment_writeoff.py | POS-11 | reason_note required, mandatory non-empty |
    | test_pos_enums.py | POS-12 | 13 AuditAction + 6 ClinicalAction present |
    | test_sale_tax.py | POS-13 | Tax only on taxable lines; banker's rounding |
    | test_sale_discount.py | POS-15 | Discount with reason persists; SALE_DISCOUNT_APPLIED audit |
    | test_sales_contract.py | POS-16 | model_dump(by_alias=True) snapshot |

    For each file: real assertion body that exercises the eventual symbol. If a symbol does not yet exist, module-level skip is acceptable (pattern shown above). Per-test skip is OK ONLY if the symbol type is `Tenant.stripe_secret_key_encrypted` (column added in Plan 15-01) and we want test_pos_enums to still run.

    Frontend skeletons:
    - `components/pos/StripePaymentForm.test.tsx` — `import { describe, it, expect } from 'vitest'; describe.skip('StripePaymentForm', () => { it.todo('renders PaymentElement with clientSecret'); });` — use `describe.skip` not `describe` so vitest passes; convert to active in Plan 15-09.
    - `lib/pos/printReceipt.test.ts` — same `describe.skip` pattern, asserts iframe blob URL flow.
    - `types/sales.contract.test.ts` — `describe.skip` literal-keys mirror skeleton.

    Playwright skeletons in `tests/e2e/pos-checkout.spec.ts`, `pos-refund.spec.ts`, `pos-daily-close.spec.ts`:
    ```typescript
    import { test, expect } from './fixtures';
    test.skip('POS-01: cart from superbill + optical order + ad-hoc', async ({ page }) => {
      // Activates in Plan 15-12
    });
    ```

    **C. Append to `.planning/REQUIREMENTS.md`:**

    1. Add new `### Point of Sale (Phase 15)` section AFTER `### Optical Order Configuration (Phase 14)`:
       ```markdown
       ### Point of Sale (Phase 15)

       - [ ] **POS-01**: Front desk can open a checkout adding clinical charges (Superbill copay) and retail/optical items (ad-hoc Product or placed OpticalOrder) on a dedicated /pos full-page checkout (ROADMAP success criterion #1)
       - [ ] **POS-02**: Payment supported via cash (tendered + change_due) and card via Stripe Elements (PaymentElement + automatic_payment_methods PaymentIntent + server-confirm on retrieve, never client-reported status) (ROADMAP success criterion #2)
       - [ ] **POS-03**: PDF receipt delivered by email (Postmark + React Email + PDF attachment) or browser print (hidden iframe + window.print) — server-side reportlab letter-size template cloned from job_ticket_pdf.py (ROADMAP success criterion #3)
       - [ ] **POS-04**: Daily close report with totals by payment method (cash/stripe_card/external_card/write_off/refund_returned) and category (clinical/retail/optical) — exportable to PDF (reportlab landscape) and CSV (ROADMAP success criterion #4)
       - [ ] **POS-05**: Refunds supported in patient payment history — item-level OR full-sale, with restock for product/optical lines via InventoryTransaction(reason='refund_restock'), OWNER+ADMIN gated, mandatory reason (ROADMAP success criterion #5)
       - [ ] **POS-06**: Split tender supported — multiple Payment rows per Sale; remaining=Sale.total-sum(succeeded payments); close gate enforces remaining<=0
       - [ ] **POS-07**: PaymentProcessor abstract interface in backend/services/payments/base.py with 4 async methods (create_payment_intent, confirm_payment, refund_payment, verify_webhook_signature); StripeProcessor is the only shipped adapter for Phase 15
       - [ ] **POS-08**: Per-tenant Stripe credentials stored Fernet-encrypted at rest (`stripe_secret_key_encrypted`, `stripe_webhook_secret_encrypted`); master key in PAYMENTS_FERNET_KEY env var; ciphertext prefix `gAAAA` asserted in encrypt-on-write tests
       - [ ] **POS-09**: Item-level refunds with restock for product/optical_order lines (InventoryTransaction reason='refund_restock' in primary TXN); superbill lines NEVER restock (clinical service)
       - [ ] **POS-10**: Daily close cash reconciliation persisted on DailyCloseRun(close_date, expected_cash, counted_cash, variance, notes?, run_by_id, run_at); same date can only be closed once (subsequent reads are read-only)
       - [ ] **POS-11**: Write-off (`method='write_off'`) gated to OWNER+ADMIN via RECORD_WRITE_OFF permission with mandatory `reason_note` text
       - [ ] **POS-12**: Enum extensions — 13 new AuditAction VARCHAR values (SALE_CREATE, SALE_OPENED, SALE_PAID, SALE_VOIDED, PAYMENT_RECORDED, PAYMENT_FAILED, WRITE_OFF_RECORDED, REFUND_ISSUED, RECEIPT_EMAILED, RECEIPT_PRINTED, DAILY_CLOSE_RUN, SALE_DISCOUNT_APPLIED, STRIPE_KEYS_UPDATED, STRIPE_WEBHOOK_RECEIVED) and 6 new ClinicalAction values (OPEN_POS, RECORD_PAYMENT, RECORD_WRITE_OFF, ISSUE_REFUND, RUN_DAILY_CLOSE, MANAGE_PAYMENT_CONFIG)
       - [ ] **POS-13**: Single per-tenant `Tenant.sales_tax_rate Numeric(5,4) default 0.0725`; per-line `taxable` boolean override; superbill source_type forced non-taxable; tax = sum(line_total WHERE taxable=true) × rate quantize(0.01, ROUND_HALF_EVEN)
       - [ ] **POS-14**: Superbill copay derivation — when `Superbill.billed_payer_id IS NOT NULL` AND matching active `PatientInsurance` exists, use `PatientInsurance.copay_amount`; else (self-pay) use `Superbill.total_fee`
       - [ ] **POS-15**: Per-line discount ($/% toggle) with mandatory `discount_reason String(200)` text; audit `SALE_DISCOUNT_APPLIED` with metadata `{line_id, type, amount, reason}`
       - [ ] **POS-16**: Pydantic `by_alias=True` contract test for SaleResponse, SaleLineItemResponse, PaymentResponse, RefundResponse, DailyCloseResponse (backend snapshot) mirrored by vitest literal-keys assertion (`feedback_contract_tests.md`)
       ```

    2. Extend the Traceability table at the bottom with 16 rows:
       ```
       | POS-01 | Phase 15 | Pending |
       | POS-02 | Phase 15 | Pending |
       ... (through POS-16)
       ```

    3. Update Coverage block at bottom:
       - Total requirements: 157 (was 141; +16)
       - Pending: 90 (was 74; +16)
  </action>
  <verify>
    <automated>cd backend && pytest tests/test_pos_models.py tests/test_sale_cart_load.py tests/test_payment_cash.py tests/test_stripe_processor.py tests/test_webhooks_stripe.py tests/test_receipt_pdf.py tests/test_receipt_email.py tests/test_daily_close.py tests/test_daily_close_export.py tests/test_refund_restock.py tests/test_refund_optical_cascade.py tests/test_split_tender.py tests/test_processor_protocol.py tests/test_payments_crypto.py tests/test_admin_payment_config.py tests/test_permissions_pos.py tests/test_payment_writeoff.py tests/test_pos_enums.py tests/test_sale_tax.py tests/test_sale_discount.py tests/test_sales_contract.py -v && npx vitest run components/pos/StripePaymentForm.test.tsx lib/pos/printReceipt.test.ts types/sales.contract.test.ts && grep -c "POS-0" .planning/REQUIREMENTS.md</automated>
  </verify>
  <acceptance_criteria>
    - `pytest backend/tests/test_pos_models.py ... -v` exits 0 (all skipped is acceptable; failures are not)
    - All 21 backend test files exist at the listed paths
    - All 3 frontend test files exist with `describe.skip` blocks
    - All 3 Playwright spec files exist with `test.skip` blocks
    - `grep -c "sale_factory" backend/tests/conftest.py` returns >= 1
    - `grep -c "fake_stripe_processor" backend/tests/conftest.py` returns >= 1
    - `grep -c "payment_factory" backend/tests/conftest.py` returns >= 1
    - `grep -c "refund_factory" backend/tests/conftest.py` returns >= 1
    - `grep -E "^\- \[ \] \*\*POS-(01|02|03|04|05|06|07|08|09|10|11|12|13|14|15|16)\*\*" .planning/REQUIREMENTS.md | wc -l` returns 16
    - Traceability table contains all 16 POS-XX rows mapped to Phase 15
    - Coverage block updated: "Total requirements: 157" present
    - NO test file uses bare `pytest.skip()` inside a test body that has no real assertion — all skips are at module-import level OR there is a real assertion that runs when symbol exists
  </acceptance_criteria>
  <done>Skip-state Wave-0 scaffold green; REQUIREMENTS.md has POS-01..POS-16 + traceability rows; later plans can flip skip → real with a single import.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: BAA HIPAA checkpoint — confirm Postmark BAA + Stripe BAA before any production-tenant Stripe keys land</name>
  <action>This task is a human-verification checkpoint — no automated action. Execute the steps in <how-to-verify> manually, document outcomes in the referenced VERIFICATION/CHECKPOINT file, and use the resume-signal to continue.</action>
  <what-built>Phase 15 ships per-tenant Stripe payment processing and Postmark-delivered receipt emails containing patient name + sale items (PHI). Stripe BAA + Postmark BAA both required before any production tenant configures Stripe keys.</what-built>
  <how-to-verify>
    1. Confirm Postmark Business Associate Agreement is signed and on file for ClarityOS (Phase 12 already executed this for messaging — verify still active; one BAA covers all transactional email).
    2. Confirm Stripe Services Agreement is acceptable for healthcare merchants — Stripe does NOT offer a HIPAA BAA but the cardholder data path (PaymentElement iframe → Stripe servers) keeps Stripe outside the PHI scope; the merchant (clinic) handles PHI in their own ledger. Document this scoping decision in `.planning/phases/15-point-of-sale/15-CONTEXT.md` as an addendum.
    3. Confirm that `STRIPE_KEYS_UPDATED` audit row + `STRIPE_WEBHOOK_RECEIVED` audit row will NOT contain card numbers / full names — only Stripe IDs (pi_xxx, evt_xxx). This is enforced by the Phase 10.3 PHI scrubber on the audit metadata field; verify Phase 10.3 scrubber deny-list covers fields where Stripe payloads might land.
    4. Document acceptance + reviewer in `.planning/phases/15-point-of-sale/15-BAA-CHECKPOINT.md` (analogous to `.planning/phases/12-crm-patient-engagement/12-RESEND-BAA-CHECKPOINT.md`).
  </how-to-verify>
  <resume-signal>Type `approved` once 15-BAA-CHECKPOINT.md exists and is committed. Type `defer` only if no production tenant is being onboarded this milestone (testmode dev tenant only).</resume-signal>
</task>

</tasks>

<verification>
- `cd backend && pytest tests/test_pos_*.py -v` exits 0 (skip-state is green)
- `npx vitest run` exits 0 (skips OK)
- `python -c "import stripe, cryptography, reportlab"` succeeds
- `node -e "require('@stripe/react-stripe-js')"` succeeds
- `.planning/REQUIREMENTS.md` contains 16 POS-* requirement rows + 16 traceability rows
- `.env.example` documents PAYMENTS_FERNET_KEY without leaking a real key
- 15-BAA-CHECKPOINT.md exists (or explicit defer decision recorded)
</verification>

<success_criteria>
Phase 15 Wave 0 is ready when:
- All Stripe/cryptography deps install cleanly in both runtimes
- All 25+ test files exist and exit 0 in skip-state
- REQUIREMENTS.md POS-01..POS-16 with traceability mapping
- BAA scoping recorded for HIPAA-critical phase closure
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-00-SUMMARY.md`
</output>
