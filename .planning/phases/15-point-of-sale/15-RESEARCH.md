# Phase 15: Point of Sale — Research

**Researched:** 2026-05-27
**Domain:** Stripe-integrated retail/clinical POS, payment-processor abstraction, decimal money ledger, reportlab receipts, daily-close cash reconciliation
**Confidence:** HIGH

## Summary

Phase 15 builds the financial-ledger plane on top of the clinical/operational planes that Phases 1–14 already shipped. The work is mostly composition over existing patterns: clone the Phase 12 webhook handler for Stripe (signature verification + idempotency + monotonic status), clone Phase 14's `job_ticket_pdf.py` for receipts, clone Phase 13's `optical_order.py` row-locked stock-decrement for the `open → paid` transition. The genuinely new domain knowledge is: (1) Stripe PaymentIntent + Elements flow with per-tenant credentials, (2) per-tenant Fernet-encrypted secret storage, (3) Decimal arithmetic discipline for money, (4) daily-close cash reconciliation as a first-class persisted entity.

The biggest planner-facing concern is **scope size**: this phase will land 4 new tables + 2 join tables, ~14 BFF+FastAPI route pairs, 6+ new permissions, 13+ new audit actions, Stripe SDK integration (BE + FE), per-tenant credential management, two new reportlab PDFs (receipt + daily-close), a React Email template, a webhook handler, and a full-page checkout UI. Plan for **10–14 plans** (similar to Phase 12 at 11 plans, Phase 13 at 15 plans, Phase 14 at 12 plans).

**Primary recommendation:** Build the `PaymentProcessor` abstract seam day-one (it costs almost nothing) but ship Stripe-only. Use `stripe-python` 15.x with `automatic_payment_methods` PaymentIntents + Stripe Elements (`PaymentElement`, not legacy `CardElement`). Store per-tenant secret keys with `cryptography.Fernet` keyed by an env-derived master secret. Use `Decimal` everywhere with `ROUND_HALF_EVEN` quantize-at-boundaries. Receipts use the Phase 14 reportlab letter-size template; daily-close uses Phase 12's landscape pattern. Wire Stripe webhooks at `/api/webhooks/stripe/` cloning Twilio/Postmark structure exactly (X-Webhook-Internal HMAC seal + raw body + monotonic status). For email delivery, **use Postmark — not Resend** (Phase 12 BAA decision documented in `RESEND-BAA-CHECKPOINT.md`).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. Sale composition & schema**
- 4 new tables: `Sale`, `SaleLineItem`, `Payment`, `Refund` + 2 join tables `RefundLineItem`, `RefundPayment`. Separate from Superbill/OpticalOrder (those stay clinical/operational; Sale is the financial ledger).
- `Sale`: tenant_id, patient_id, status ENUM `[open, paid, refunded, voided]`, subtotal/tax/discount_total/total Numeric(10,2), created_by_id, opened_at, closed_at?, receipt_url?, notes?.
- `SaleLineItem`: sale_id, source_type ENUM `[superbill, optical_order, product, adhoc]`, source_id UUID? (null for adhoc), description String(500), qty Integer, unit_price/discount_amount/line_total Numeric(10,2), discount_reason String(200)?, taxable Boolean.
- `Payment`: sale_id, method ENUM `[cash, stripe_card, external_card, write_off]`, amount Numeric(10,2), tendered/change_due Numeric(10,2)? (cash only), processor_payment_id/processor_charge_id String?, last4 String(4)?, auth_code String(20)?, status ENUM `[pending, succeeded, failed, refunded, partial_refund]`, reason_note String(500)? (mandatory for write_off), created_by_id, created_at.
- `Refund` + `RefundLineItem` + `RefundPayment` per CONTEXT §A.
- **Cart-load semantics:** Superbill → copay derived from `PatientInsurance.copay_amount` for billed payer, else `Superbill.total_fee` (taxable=false). OpticalOrder → one SaleLineItem per OpticalOrderLineItem snapshot (taxable=true). Ad-hoc product/free-text → taxable=true by default.
- **Sale lifecycle:** `open → paid` (full payment), `open → voided` (staff cancel pre-payment), `* → refunded` (any refund). Stock decrement happens on `open → paid` in primary TXN. OpticalOrder.status flips `placed → dispensed` on Sale.paid per cart toggle.

**B. Entry points & checkout UI**
- Dedicated `/pos` full-page checkout (NOT drawer; cart left 60%, payment panel right 40%).
- CTAs: Patient detail Payments tab, Superbill row in /billing, OrderDetailDrawer (Phase 13), `/pos` walk-in entry, Schedule detail drawer (Phase 10.2).
- All CTAs gated on `Entitlement.RETAIL_POS`. Sidebar gets "Point of Sale" link gated on same entitlement.

**C. Payment methods & processor abstraction**
- `PaymentProcessor` abstract interface in `backend/services/payments/base.py` with `create_payment_intent`, `confirm_payment`, `refund_payment`, `verify_webhook_signature`.
- Shipped: `stripe_processor.py` using `stripe-python` + Stripe Elements (in-page card form, server-side PaymentIntent confirmation).
- Per-tenant credentials on Tenant: `stripe_publishable_key` (plain), `stripe_secret_key_encrypted`, `stripe_webhook_secret_encrypted` (Fernet at rest).
- Funds direction: clinic's own Stripe account (NOT Stripe Connect; ClarityOS holds no funds, takes no cut).
- Cash: tendered + change_due both stored, `tendered >= amount` validated.
- External card terminal (manual entry): staff enters amount + last4 + optional auth code, ledger-only.
- Write-off / on-account: OWNER+ADMIN only, mandatory reason_note, `method='write_off'`. New audit `WRITE_OFF_RECORDED`.
- Split tender: Sale.total = sum(Payments where status='succeeded' or 'partial_refund'). UI shows "Amount remaining" until zero. Validates ≤ Sale.total before close.
- Stripe webhooks at `/api/webhooks/stripe/` with signature verification (clone Phase 12 Twilio/Postmark pattern). Middleware allowlist already covers `/api/webhooks/*`.
- Out: check payment, tips.

**D. Tax & pricing**
- `Tenant.sales_tax_rate Numeric(5,4) default 0.0725` (CA 7.25%). Single per-tenant rate. Configurable in Admin > Settings > POS.
- Taxable rule: superbill → false; optical_order/product/adhoc → true. Per-line override allowed.
- Tax = sum(line_total WHERE taxable=true) × rate, server-side at Sale close.
- Copay: `PatientInsurance.copay_amount` if `Superbill.billed_payer_id` set, else `Superbill.total_fee`.
- Discounts: per-line, $/% toggle, **mandatory discount_reason text**. Audited `SALE_DISCOUNT_APPLIED`.
- Decimal arithmetic, banker's rounding to 2dp.

**E. Refunds**
- Granularity: item-level OR full-sale. OWNER+ADMIN only. New `ClinicalAction.ISSUE_REFUND`.
- No time window. `Refund.reason String(500) NOT NULL`.
- Card refunds via `PaymentProcessor.refund_payment` (Stripe Refund object for stripe_card). External_card refunds are ledger-only.
- Restock: OpticalOrder lines + ad-hoc product lines write `InventoryTransaction(reason='refund_restock', delta=+qty)` in primary TXN. Superbill lines: no restock. If all OpticalOrder lines refunded → `OpticalOrder.status='cancelled'`.
- Sale.status moves to `refunded` (partial or full — same enum value).

**F. Receipts**
- reportlab PDF cloned from `job_ticket_pdf.py` shape. Letter-size, clean professional layout.
- PDF contents: clinic header, patient block, sale # + date, line table, totals, payment breakdown, refund summary if applicable, footer.
- Delivery: Print (Blob + hidden iframe + `iframe.contentWindow.print()`), Email (POST `/api/sales/{id}/receipt/email/` → React Email template via Postmark with PDF attachment), Both.
- Refund receipts: separate `/api/refunds/{id}/receipt/` endpoint, "REFUND" header, negative amounts.

**G. Daily close**
- `/pos/close-of-day` page, OWNER+ADMIN.
- Sections: Sales summary, By payment method, By category, Cash reconciliation (expected/counted/variance), Stripe payout estimate (optional).
- Export: PDF (reportlab landscape, clone `compliance_report.py`) + CSV.
- Persistence: `DailyCloseRun(tenant_id, close_date, expected_cash, counted_cash, variance, notes?, run_by_id, run_at)`.
- Manual trigger only (no cron in Phase 15). Audit `DAILY_CLOSE_RUN`.

**H. Entitlement**
- `retail_pos` (existing add-on from Phase 13). No new entitlement key.

**I. Permissions** (6 new ClinicalAction values)
- `OPEN_POS` {O,A,T,R}, `RECORD_PAYMENT` {O,A,T,R}, `RECORD_WRITE_OFF` {O,A}, `ISSUE_REFUND` {O,A}, `RUN_DAILY_CLOSE` {O,A}, `MANAGE_PAYMENT_CONFIG` {O}.

**J. Audit** (13+ new AuditAction values)
- `SALE_CREATE`, `SALE_OPENED`, `SALE_PAID`, `SALE_VOIDED`, `PAYMENT_RECORDED`, `PAYMENT_FAILED`, `WRITE_OFF_RECORDED`, `REFUND_ISSUED`, `RECEIPT_EMAILED`, `RECEIPT_PRINTED`, `DAILY_CLOSE_RUN`, `SALE_DISCOUNT_APPLIED`, `STRIPE_KEYS_UPDATED`, `STRIPE_WEBHOOK_RECEIVED`.

**K. Routes** — ~14 BFF+FastAPI route pairs per CONTEXT.md §K.

**L. Requirements** — Planner adds POS-01..POS-N during /gsd:plan-phase.

### Claude's Discretion
- Exact reportlab receipt + daily-close PDF visual design.
- React Email template visual design.
- `/pos` page layout details (tabs vs radio for payment methods, drag handles, etc.).
- Stripe Elements styling to match glassmorphism.
- `SaleLineItem.parent_line_id` self-FK vs flat with shared `source_id` for OpticalOrder line grouping.
- `Sale.receipt_url` Supabase Storage cache vs always-regenerate.
- Exact discount UI (slider, $/% toggle, popover).
- Receipt # format.
- Stripe fee estimation precision in daily-close.
- Error states for failed Stripe confirmation.

### Deferred Ideas (OUT OF SCOPE)
- Stripe Terminal hardware (physical reader / WisePOS).
- Additional payment processors (Square, Authorize.net, Helcim) — V3/on-demand.
- Check payment method.
- Tips on payments.
- Gift cards / store credit / loyalty / on-account credit balances.
- Pre-payment deposits / layaway / payment plans / financing.
- Insurance receipt reconciliation (ERA/EOB) — V3-01.
- TaxJar / zip-based tax.
- FSA/HSA-specific receipt format.
- Vision-plan-specific pricing.
- Auto end-of-day cron.
- Refund time-window enforcement beyond role check.
- More nuanced void semantics (sale with payments → refund only, never void).
- Stripe Connect / platform-managed payouts.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID (anticipated) | Description | Research Support |
|------------------|-------------|------------------|
| POS-01 | Front desk can open a checkout adding clinical charges and retail/optical items (ROADMAP #1) | §Architecture > Sale model + Cart-load pattern |
| POS-02 | Payment via cash or card (Stripe Elements) (ROADMAP #2) | §Standard Stack > stripe-python + @stripe/react-stripe-js + PaymentIntent flow |
| POS-03 | PDF receipt by email or print (ROADMAP #3) | §Patterns > Receipt PDF via reportlab clone of job_ticket_pdf.py; Blob iframe print; Postmark React Email |
| POS-04 | Daily close report with totals by payment method and category (ROADMAP #4) | §Patterns > Daily close clone of compliance_report.py (landscape) |
| POS-05 | Refunds supported in patient payment history (ROADMAP #5) | §Architecture > Refund + RefundLineItem + RefundPayment with restock |
| POS-06 | Split tender supported (multiple Payments per Sale until remaining=0) | §Architecture > Payment-status priority + close gate |
| POS-07 | PaymentProcessor abstraction (Stripe-only ship) | §Architecture > PaymentProcessor base interface |
| POS-08 | Per-tenant Stripe credentials stored Fernet-encrypted | §Standard Stack > cryptography.Fernet; §Patterns > per-tenant secret rotation |
| POS-09 | Item-level refunds with restock for product/optical lines (not superbill) | §Patterns > Refund TXN clone of optical-order cancel; InventoryTransaction reason='refund_restock' |
| POS-10 | Daily close cash reconciliation persisted on DailyCloseRun | §Architecture > DailyCloseRun table; §Pitfalls > variance not silently truncated |
| POS-11 | Write-off gated to OWNER+ADMIN with mandatory reason_note | §Permissions > RECORD_WRITE_OFF matrix |
| POS-12 | 13+ AuditAction + 6 ClinicalAction enum extensions | §Patterns > clinical.py + permissions.py extension points |
| POS-13 | Single per-tenant sales-tax rate; per-line taxable override; service lines non-taxable | §Architecture > Tax pricing rule |
| POS-14 | Copay derivation from PatientInsurance.copay_amount when billed_payer_id set, else Superbill.total_fee | §Code Examples > Cart-load Superbill prefill |
| POS-15 | Discount per-line with mandatory discount_reason text; audit SALE_DISCOUNT_APPLIED | §Patterns > Discount with reason note |
| POS-16 | Contract test per new FE/BE endpoint pair (feedback_contract_tests.md) | §Patterns > Pydantic by_alias snapshot + vitest literal-keys mirror |

(Planner finalizes POS-01..POS-N during `/gsd:plan-phase`.)
</phase_requirements>

---

## Standard Stack

### Core (HIGH confidence — versions verified via PyPI + npm 2026-05-27)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` (Python) | **15.2.0** | Server-side PaymentIntent + Refund + Webhook signature verify | Official Stripe Python SDK; aligned with 2026-03-25 API pin |
| `@stripe/stripe-js` | **9.7.0** | Browser Stripe.js loader (loadStripe) | Official client loader; required by `@stripe/react-stripe-js` |
| `@stripe/react-stripe-js` | **6.4.0** | React PaymentElement + Elements provider | Official React bindings; correct for Next.js 14 App Router with `'use client'` |
| `cryptography` | **46.0.5** (installed) → pin `>=46.0,<48.0` | Fernet symmetric encryption for per-tenant secret keys | Already installed transitively via `python-jose[cryptography]`; PyCA-maintained, AES-128-CBC + HMAC-SHA256 |
| `reportlab` | **4.4.10** (installed) → pin `>=4.4,<5.0` | Receipt PDF + daily-close PDF | Already used by Phase 9/12/14; not pinned in `requirements.txt` — **GAP** |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@react-email/components` | 1.0.12 (installed) | React Email template for receipt email body | Already in project for Phase 12 messaging templates |
| `@react-email/render` | 2.0.8 (installed) | Server-side HTML render of React Email templates | Pair with `@react-email/components` |
| `postmarker` | >=1.0 (installed) | Send transactional email with PDF attachment | Phase 12 BAA decision — **use Postmark, NOT Resend** despite CONTEXT.md wording |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `cryptography.Fernet` | AWS Secrets Manager / Vault | External service adds infra dep + cost; Fernet is fine for per-tenant config when master key lives in env (current `SECRET_KEY` pattern) |
| Stripe Elements (`PaymentElement`) | `CardElement` (legacy) | `PaymentElement` is current standard; supports cards + wallets (Apple/Google Pay) automatically; no FE rework when enabling extra methods in Stripe Dashboard |
| Stripe Checkout (hosted) | (current: in-page Elements) | Hosted Checkout simpler but redirects user away from `/pos` — bad UX for clinical checkout; in-page Elements per CONTEXT decision |
| Stripe Connect (platform) | (current: clinic-owned account) | Connect adds platform-account complexity + revenue-share logic; out of scope per CONTEXT §C |

### Installation

```bash
# Backend — add to requirements.txt
echo "stripe>=15.2,<16" >> requirements.txt
echo "cryptography>=46.0,<48.0" >> requirements.txt
echo "reportlab>=4.4,<5.0" >> requirements.txt  # CURRENTLY UNPINNED — fix this

# Frontend
npm install @stripe/stripe-js@^9.7.0 @stripe/react-stripe-js@^6.4.0
```

**Version verification (2026-05-27):**
- `pip index versions stripe` → latest 15.2.0 ✅
- `pip index versions reportlab` → latest 4.5.1; installed 4.4.10 ✅
- `pip index versions cryptography` → latest 48.0.0; installed 46.0.5 ✅
- `npm view @stripe/react-stripe-js version` → 6.4.0 ✅
- `npm view @stripe/stripe-js version` → 9.7.0 ✅

---

## Architecture Patterns

### Recommended Project Structure

```
backend/
├── api/routes/
│   ├── sales.py                    # ~6 routes: list, create, get, patch, void, close
│   ├── sale_payments.py            # ~3 routes: record, stripe-confirm, cancel-pending
│   ├── refunds.py                  # ~2 routes: create, get-receipt-pdf
│   ├── pos_daily_close.py          # ~3 routes: GET totals, POST record close, GET export pdf|csv
│   ├── admin_payment_config.py     # ~2 routes: GET, PUT (OWNER-only)
│   └── webhooks_stripe.py          # OR extend webhooks.py with stripe_webhook handler
├── services/
│   ├── payments/
│   │   ├── base.py                 # PaymentProcessor ABC + dataclasses
│   │   ├── stripe_processor.py     # Stripe adapter implementation
│   │   └── crypto.py               # Fernet encrypt/decrypt helpers
│   ├── receipts/
│   │   ├── receipt_pdf.py          # Letter-size reportlab (clone job_ticket_pdf.py)
│   │   ├── refund_receipt_pdf.py   # Letter-size reportlab with REFUND header
│   │   ├── daily_close_pdf.py      # Landscape reportlab (clone compliance_report.py)
│   │   └── daily_close_csv.py      # Stream csv.writer to BytesIO
│   └── sale_lifecycle.py           # close_sale(), record_payment(), issue_refund() — primary-TXN service layer
├── schemas/sales.py                # Pydantic SaleResponse, SaleLineItemResponse, PaymentResponse, RefundResponse
└── db/models/tenant/clinical.py    # +6 ORM classes (Sale, SaleLineItem, Payment, Refund, RefundLineItem, RefundPayment)

app/api/
├── sales/                          # Mirror BE routes via proxyToFastAPI
│   ├── route.ts
│   └── [id]/
│       ├── route.ts
│       ├── lines/route.ts
│       ├── payments/route.ts
│       ├── payments/stripe-confirm/route.ts
│       ├── close/route.ts
│       ├── receipt/route.ts        # RAW fetch (Blob) — NOT proxyToFastAPI
│       └── receipt/email/route.ts
├── refunds/...
├── pos/daily-close/...
├── admin/payment-config/...        # OWNER-gated
└── webhooks/stripe/route.ts        # Raw fetch + X-Webhook-Internal HMAC seal

app/(tenant)/[tenant]/
├── pos/
│   ├── page.tsx                    # /pos full-page checkout
│   └── close-of-day/page.tsx       # OWNER+ADMIN
└── admin/                          # +PosPaymentsCard component (OWNER-only)

components/pos/
├── CartLineList.tsx
├── PrefillSearchModal.tsx          # Patient search + superbill/order picker
├── PaymentPanel.tsx
├── CashPaymentForm.tsx
├── StripePaymentForm.tsx           # Wraps <Elements> + <PaymentElement>
├── ExternalCardPaymentForm.tsx
├── WriteOffPaymentForm.tsx         # OWNER+ADMIN visibility
├── DiscountPopover.tsx
├── RefundDialog.tsx
└── ReceiptDeliveryPrompt.tsx       # "Print, Email, or Both" post-close

store/
├── posCartStore.ts                 # Zustand devtools+selectors, 1.5s debounce save+flush on blur
└── refundDraftStore.ts
```

### Pattern 1: Per-Tenant Stripe Credential Storage (Fernet)

**What:** Store `stripe_secret_key_encrypted` and `stripe_webhook_secret_encrypted` as TEXT columns on `Tenant`. Encrypt at write via Fernet with master key from `settings.PAYMENTS_FERNET_KEY` env var. Decrypt on every API call (cheap; <1ms). Never log decrypted values. `stripe_publishable_key` stays plaintext (it's safe to expose to FE).

**When to use:** Any per-tenant secret that the backend must decrypt to use (Stripe secret, webhook secret, future Square/Helcim credentials).

**Example:**
```python
# backend/services/payments/crypto.py
from cryptography.fernet import Fernet, InvalidToken
from backend.core.config import settings

def _fernet() -> Fernet:
    key = settings.PAYMENTS_FERNET_KEY
    if not key:
        raise RuntimeError("PAYMENTS_FERNET_KEY must be set")
    return Fernet(key.encode() if isinstance(key, str) else key)

def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()

def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        raise RuntimeError("Tenant payment secret unreadable — re-enter in Admin > POS Payments") from e

# Generate master key once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Store in env var PAYMENTS_FERNET_KEY. Rotation = MultiFernet([new, old]) for transition window.
```

### Pattern 2: PaymentProcessor Abstract Interface

**What:** Define `PaymentProcessor` as a `Protocol` (or ABC) with 4 async methods. Stripe adapter implements; future Square/Authorize.net adapters drop into the same shape without route changes.

**When to use:** ALL payment-related calls in `sale_payments.py` route module + `sale_lifecycle.py` service layer go through this interface — never `import stripe` directly outside `stripe_processor.py`.

**Example:**
```python
# backend/services/payments/base.py
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol
from uuid import UUID

@dataclass(frozen=True)
class ProcessorIntent:
    intent_id: str            # e.g., "pi_xxx" for Stripe
    client_secret: str        # passed to FE for PaymentElement confirmation
    amount: Decimal
    currency: str             # "usd"

@dataclass(frozen=True)
class ProcessorPayment:
    intent_id: str
    charge_id: str | None
    last4: str | None
    brand: str | None
    status: str               # "succeeded" | "failed" | "requires_action" | "processing"
    failure_reason: str | None

@dataclass(frozen=True)
class ProcessorRefund:
    refund_id: str
    amount: Decimal
    status: str               # "succeeded" | "pending" | "failed"

@dataclass(frozen=True)
class WebhookEvent:
    event_id: str             # Stripe event.id — use for idempotency
    event_type: str           # e.g., "payment_intent.succeeded"
    payment_intent_id: str | None
    charge_id: str | None
    raw_payload: dict

class PaymentProcessor(Protocol):
    async def create_payment_intent(
        self, tenant_id: UUID, amount: Decimal, currency: str, metadata: dict
    ) -> ProcessorIntent: ...
    async def confirm_payment(
        self, tenant_id: UUID, payment_intent_id: str
    ) -> ProcessorPayment: ...
    async def refund_payment(
        self, tenant_id: UUID, payment: "Payment", amount: Decimal
    ) -> ProcessorRefund: ...
    def verify_webhook_signature(
        self, tenant_id: UUID, body: bytes, signature: str
    ) -> WebhookEvent: ...

def get_processor(processor_name: str = "stripe") -> PaymentProcessor:
    if processor_name == "stripe":
        from backend.services.payments.stripe_processor import StripeProcessor
        return StripeProcessor()
    raise ValueError(f"Unknown processor: {processor_name}")
```

### Pattern 3: Stripe Webhook Handler (Clone Phase 12 webhooks.py)

**What:** Add a `/api/webhooks/stripe` POST handler that mirrors Twilio/Postmark exactly: (1) X-Webhook-Internal HMAC seal check, (2) raw body (do NOT parse JSON before signature verify), (3) `stripe.Webhook.construct_event(payload, sig_header, webhook_secret)` for signature, (4) idempotency lookup on `event.id` to short-circuit duplicate deliveries, (5) monotonic status updates on Payment, (6) audit `STRIPE_WEBHOOK_RECEIVED`, (7) return 200 within <2s.

**Critical:** Phase 12's BFF route forwards the raw body (`request.text()` → upstream body without JSON.parse). MUST do the same for Stripe.

**Example:**
```python
# backend/api/routes/webhooks.py (extend, don't duplicate file)
import stripe
from backend.services.payments.crypto import decrypt_secret

@router.post("/stripe", status_code=200)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    _check_internal_seal(request)  # reuse from Phase 12
    sig = request.headers.get("Stripe-Signature", "")
    body = await request.body()    # raw bytes — required for signature verify

    # Tenant resolution: Stripe events carry tenant_id in metadata (set in create_payment_intent)
    # Parse minimal JSON to read metadata.tenant_id, THEN re-verify signature using that tenant's secret
    try:
        preview = stripe.Event.construct_from(json.loads(body), key=None)  # unverified parse for tenant lookup
        tenant_id = UUID(preview.data.object.metadata.get("tenant_id"))
    except Exception:
        raise HTTPException(400, "Invalid event payload")

    tenant = await db.get(Tenant, tenant_id)
    if not tenant or not tenant.stripe_webhook_secret_encrypted:
        raise HTTPException(400, "Tenant not configured for Stripe")
    webhook_secret = decrypt_secret(tenant.stripe_webhook_secret_encrypted)

    try:
        event = stripe.Webhook.construct_event(body, sig, webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(403, "Invalid Stripe signature")

    # Idempotency: skip if event.id already processed
    existing = await db.execute(
        select(StripeWebhookEvent).where(StripeWebhookEvent.event_id == event.id)
    )
    if existing.scalar_one_or_none():
        return {"ok": True, "ignored": "duplicate"}
    db.add(StripeWebhookEvent(event_id=event.id, tenant_id=tenant_id, event_type=event.type))

    # Monotonic status update (mirror Phase 12 _STATUS_PRIORITY)
    if event.type == "payment_intent.succeeded":
        pi = event.data.object
        payment = await _payment_by_intent_id(db, pi.id)
        if payment and _STATUS_PRIORITY["succeeded"] >= _STATUS_PRIORITY.get(payment.status, 0):
            payment.status = "succeeded"
            payment.processor_charge_id = pi.latest_charge
            # ...
    elif event.type == "payment_intent.payment_failed":
        # similar guard
        ...

    await log_action(db, _system_ctx(tenant_id), AuditAction.STRIPE_WEBHOOK_RECEIVED, ...)
    await db.commit()
    return {"ok": True}

_STATUS_PRIORITY = {"pending": 0, "succeeded": 2, "failed": 99, "refunded": 3, "partial_refund": 1}
```

### Pattern 4: Sale Lifecycle in Primary TXN (Clone Phase 13 optical_order.place)

**What:** When `Sale.open → paid`: row-lock involved Products with `with_for_update()`, decrement stock, write `InventoryTransaction(reason='sale_placed')` per ad-hoc product line + optical-order line, flip Sale.status to `paid`, optionally flip OpticalOrder.status to `dispensed`, audit `SALE_PAID` — all in single `db.commit()`.

**Critical:** Stock decrement happens at `open → paid`, NOT at line-add time. This means line edits to an open cart don't touch stock; closing the sale is the financial-and-inventory commit point.

**Example:** Clone `backend/api/routes/optical_order.py:570-769` directly. The pattern (row-lock → decrement → InventoryTransaction → audit → commit) is already canonical in the codebase.

### Pattern 5: Decimal Money Arithmetic

**What:** Use `Decimal` for ALL money values from ORM to wire. Quantize to `Decimal("0.01")` with `ROUND_HALF_EVEN` (banker's rounding) at boundaries (line totals, tax, sale total). Pydantic serializes Decimal to **string** in JSON; TS interfaces type these as `string` (per Phase 13 §13-03 convention).

**Example:**
```python
from decimal import Decimal, ROUND_HALF_EVEN

CENTS = Decimal("0.01")

def quantize_money(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_EVEN)

def compute_sale_totals(lines: list[SaleLineItem], tax_rate: Decimal) -> dict[str, Decimal]:
    subtotal = quantize_money(sum((li.line_total for li in lines), Decimal("0.00")))
    discount_total = quantize_money(sum((li.discount_amount for li in lines), Decimal("0.00")))
    taxable_base = quantize_money(sum(
        (li.line_total for li in lines if li.taxable), Decimal("0.00")
    ))
    tax = quantize_money(taxable_base * tax_rate)
    total = quantize_money(subtotal + tax)
    return {"subtotal": subtotal, "discount_total": discount_total, "tax": tax, "total": total}

# Stripe expects integer cents — convert at the boundary
def to_stripe_cents(amount: Decimal) -> int:
    return int(quantize_money(amount) * 100)
```

TS-side:
```typescript
// types/sales.ts
export interface Sale {
  id: string;
  subtotal: string;       // "129.99" — NOT number
  tax: string;
  discountTotal: string;
  total: string;
  // ...
}
// In components, use Number(sale.total) only at display time; never arithmetic on the JS number.
```

### Pattern 6: Stripe Elements in Next.js 14 App Router

**What:** Wrap the card form in `<Elements stripe={loadStripe(publishableKey)} options={{ clientSecret }}>`. Use `<PaymentElement />` (not legacy `<CardElement />`). Client component (`'use client'`). Call `stripe.confirmPayment({ elements, redirect: 'if_required' })` — `if_required` is the recommended modern pattern that avoids redirect for cards (most common case).

**Example:**
```tsx
'use client';
import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

export function StripePaymentForm({ saleId, publishableKey, amount, onSuccess }: Props) {
  const [clientSecret, setClientSecret] = useState<string>();
  const stripePromise = loadStripe(publishableKey);

  useEffect(() => {
    // Server creates the PaymentIntent — never on the client
    fetch(`/api/sales/${saleId}/payments/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'stripe_card', amount }),
    }).then(r => r.json()).then(d => setClientSecret(d.clientSecret));
  }, [saleId, amount]);

  if (!clientSecret) return <Skeleton />;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: glassAppearance }}>
      <InnerForm saleId={saleId} onSuccess={onSuccess} />
    </Elements>
  );
}

function InnerForm({ saleId, onSuccess }: { saleId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { paymentIntent, error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',          // critical: avoids redirect for cards
    });
    if (error) { /* show error, stay on /pos */ return; }
    // BFF call so backend writes Payment row from PaymentIntent (don't trust client)
    await fetch(`/api/sales/${saleId}/payments/stripe-confirm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId: paymentIntent!.id }),
    });
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button disabled={submitting}>Pay</button>
    </form>
  );
}
```

### Pattern 7: Receipt PDF via reportlab (Clone job_ticket_pdf.py)

**What:** Replicate the section structure of `backend/services/job_ticket_pdf.py` — letter-size, Helvetica-Bold headers + Courier data values, `_section_style()` boxes. Sections for receipt: clinic header (from `Tenant.settings_jsonb`), patient block, sale # + date, line-item table, totals (subtotal/discount/tax/total), payment breakdown (method + amount + last4 for cards + tendered/change for cash), optional refund summary, footer (cashier + receipt #).

**For refund receipts:** Same template, "REFUND" prefix in title, negative amounts shown as `-$X.XX`, original-sale reference line.

### Pattern 8: Daily-Close PDF (Clone compliance_report.py landscape)

**What:** Clone the SQL-aggregation pattern in `backend/services/messaging/compliance_report.py`. Pull aggregates with SQLAlchemy `select(...).group_by(...)` (no raw `text()` needed for the simpler POS queries). Build 5-section landscape layout. Same `reportlab.platypus.Table`/`TableStyle` patterns.

### Pattern 9: Receipt Print via Hidden Iframe

**What:** Phase 6 Rx PDF pattern. FE fetches Blob, creates Object URL, mounts hidden `<iframe>`, calls `iframe.contentWindow.print()`. Cleanup Object URL after print dialog closes.

**Example:**
```typescript
async function printReceipt(saleId: string) {
  const res = await fetch(`/api/sales/${saleId}/receipt/`, {
    headers: await getAuthHeaders(),
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 60_000); // generous cleanup window
  };
}
```

### Pattern 10: BFF Pattern Selection per Endpoint Type

| Endpoint Kind | BFF Implementation | Reason |
|---------------|-------------------|--------|
| JSON CRUD (`/sales/`, `/refunds/`, `/payments/`) | `proxyToFastAPI()` | Auto-camelize, JSON pass-through |
| PDF Blob (`/sales/{id}/receipt/`, `/refunds/{id}/receipt/`, `/pos/daily-close/{id}/export?format=pdf`) | Raw fetch + `arrayBuffer()` (mirror `app/api/optical-orders/[orderId]/job-ticket/route.ts`) | `proxyToFastAPI` JSON-decodes body — corrupts binary |
| CSV Blob (`/pos/daily-close/{id}/export?format=csv`) | Raw fetch + `text()` | Streams text; not JSON |
| Webhook (`/webhooks/stripe/`) | Raw fetch + `body.text()` + X-Webhook-Internal HMAC seal (clone `app/api/webhooks/twilio/route.ts`) | Raw body must reach FastAPI unmodified — Stripe signature is over raw bytes |
| Per-tenant Stripe key PUT (`/admin/payment-config/`) | `proxyToFastAPI()` | Standard auth flow; secret encrypted at backend |

**Trailing slashes mandatory** on every upstream URL (`.claude/rules/bff-api.md` — FastAPI 307s without trailing slash, drops Authorization header).

### Anti-Patterns to Avoid

- **Float arithmetic for money.** `0.1 + 0.2 == 0.30000000000000004`. Use `Decimal` exclusively. Never `float(amount)` outside display.
- **Parsing JSON before signature verification.** Stripe signature is over raw bytes; `JSON.parse(body)` + re-serialize changes whitespace and breaks the signature.
- **Direct `import stripe` outside `stripe_processor.py`.** Defeats the PaymentProcessor abstraction. Always go through `get_processor()`.
- **Trusting client-reported `paymentIntent.id`.** FE sends the intent_id; backend MUST re-fetch with `stripe.PaymentIntent.retrieve(intent_id)` before recording succeeded status. Never write `Payment.status='succeeded'` from a client request.
- **Stock decrement at line-add time.** Cart edits would constantly churn stock. Stock decrements only at `open → paid` commit (one TXN).
- **Camelize on JSONB Stripe payload.** Stripe responses use snake_case Stripe-native keys (e.g., `latest_charge`, `payment_method_types`). Store these via raw dict / `payment.processor_metadata_jsonb` if needed; do NOT run through `camelizeKeys`. See `feedback_camelizekeys_nested.md`.
- **`db.refresh()` after flush.** Use `selectinload` re-query per `.claude/rules/backend-python.md`.
- **Native PostgreSQL enums.** Store all new enums as VARCHAR via `native_enum=False` (per Phase 9 onward — see `Enum` wrapper in `backend/db/models/public/saas.py:24-28`).
- **Hardcoded receipt-number sequence in app code.** Use a per-tenant Postgres sequence (e.g., `CREATE SEQUENCE tenant_{tenant_id}_sale_seq`) OR a `Sale.receipt_number` derived from `YYYYMMDD-{uuid4().hex[:6]}` (collision-safe, no contention). Recommendation: format `YYYYMMDD-NNNN` where NNNN is `LPAD(row_count_today + 1, 4, '0')` — simple but works at single-tenant pilot scale.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stripe webhook signature verification | Custom HMAC checker | `stripe.Webhook.construct_event(payload, sig, secret)` | Stripe handles timing-safe compare, timestamp tolerance, replay window |
| Stripe API request signing / retries | Custom HTTP client | `stripe.PaymentIntent.create(...)` via SDK | SDK adds idempotency keys, auto-retry on network errors, version pinning |
| Symmetric encryption for stored secrets | Custom AES wrapper | `cryptography.Fernet` | Battle-tested AES-128-CBC + HMAC-SHA256; supports `MultiFernet` for rotation |
| Decimal money arithmetic | Float math + manual rounding | `decimal.Decimal` + `quantize(Decimal("0.01"), ROUND_HALF_EVEN)` | Float rounding errors compound; banker's rounding minimizes systematic bias |
| PDF generation | HTML-to-PDF, weasyprint, headless Chrome | `reportlab.platypus.SimpleDocTemplate` | Already in project from Phase 9; sync API; no Chromium dep; flowable layouts |
| React payment form (card fields, validation) | Custom card-number input + Luhn check | `<PaymentElement />` from `@stripe/react-stripe-js` | PCI-DSS SAQ-A scope (card data never touches your server); auto-supports wallets |
| Email template HTML | Hand-written HTML strings | React Email components (`@react-email/components`) | Already in project from Phase 12; renders inline-CSS HTML for email clients |
| CSV serialization | Manual string building | `csv.writer(io.StringIO())` + `BytesIO` for Blob streaming | Handles quoting, escaping, locale safely |
| Webhook BFF passthrough | Reverse-proxy custom logic | Clone `app/api/webhooks/twilio/route.ts` shape verbatim | Already audited for HMAC seal + X-Forwarded-Host reconstruction (Pitfall 1 in Phase 12 RESEARCH) |
| Per-tenant secret rotation | Custom key versioning | `cryptography.fernet.MultiFernet([new_key, old_key])` | Built-in rotation primitive; old keys decrypt, new key encrypts |

**Key insight:** Phase 15 reuses *exact* shapes from Phases 9, 12, 13, 14. The Stripe integration is the only domain-new element — and Stripe's own SDK eliminates ~90% of what would otherwise be a payment-security rabbit hole.

---

## Common Pitfalls

### Pitfall 1: Stripe Signature Verified Over Modified Body
**What goes wrong:** BFF route does `await request.json()` then re-serializes for upstream → whitespace/order changes break Stripe's signature check.
**Why it happens:** Default Next.js routing parses JSON. Stripe signs over raw bytes.
**How to avoid:** BFF uses `request.text()` and forwards body as-is. FastAPI uses `await request.body()` (NOT `request.json()`) before calling `stripe.Webhook.construct_event`.
**Warning signs:** 403 from `stripe_webhook` with "Invalid signature" in tests that pass with stripe-cli local forwarding but fail in production.

### Pitfall 2: Trusting Client-Reported PaymentIntent Status
**What goes wrong:** FE sends `{ paymentIntentId, status: 'succeeded' }` after `stripe.confirmPayment` resolves. Attacker forges status. Backend writes `Payment.status='succeeded'` without verifying with Stripe.
**Why it happens:** Convenience — the client knows; why re-fetch?
**How to avoid:** `/api/sales/{id}/payments/stripe-confirm/` accepts ONLY the `paymentIntentId`. Backend calls `stripe.PaymentIntent.retrieve(intent_id)` and reads server-authoritative status. Set `Payment.status` from the retrieve result, NOT the request body.
**Warning signs:** Reconciliation drift between Stripe Dashboard and `Payment.status` values.

### Pitfall 3: Stock Over-Decrement Under Concurrency at Sale.paid
**What goes wrong:** Two clerks close two sales for the same last-in-stock product simultaneously; both read stock_qty=1, both decrement to 0, you've oversold.
**Why it happens:** Without row-locking, concurrent transactions see the same pre-decrement value.
**How to avoid:** Clone Phase 13 pattern: `select(Product).where(...).with_for_update()` BEFORE mutating. Phase 13's zero-stock soft-block (200 + warning) carries through — Sale.paid logs `zero_stock` warning but proceeds.
**Warning signs:** Negative stock_qty with no `InventoryTransaction(reason='manual_adjust')` audit row.

### Pitfall 4: Decimal Quantization Drift in Tax Calculation
**What goes wrong:** Compute tax on subtotal as `subtotal * Decimal("0.0725")` → result has 6 decimal places. Save as Numeric(10,2) → silent truncation. Sum across lines diverges from expected total by pennies.
**Why it happens:** Postgres Numeric(10,2) truncates on insert; Python Decimal does not auto-quantize.
**How to avoid:** Always `quantize_money()` at compute boundaries before assignment. Tax sums sum-of-rounded vs round-of-sum — use round-of-sum (`quantize_money(sum_taxable * rate)`), not per-line rounding then sum, for receipt-line consistency.
**Warning signs:** Daily-close variance "off by a penny" complaints.

### Pitfall 5: Fernet Master Key Loss = All Tenant Stripe Keys Lost
**What goes wrong:** `PAYMENTS_FERNET_KEY` env var changes between deploys (or rotates without `MultiFernet` transition) → existing tenant `stripe_secret_key_encrypted` rows become unreadable.
**Why it happens:** Treating Fernet key as a regular env config rather than a cryptographic root secret.
**How to avoid:** (a) Generate `PAYMENTS_FERNET_KEY` ONCE per environment, store in DO secrets / Vercel envs, NEVER rotate without `MultiFernet([new, old])` transition window. (b) Document rotation procedure in the phase's VALIDATION.md. (c) Add a healthcheck: try decrypting a known canary string at FastAPI startup; fail loud if mismatch.
**Warning signs:** `InvalidToken` exceptions in production after deploy.

### Pitfall 6: Webhook Idempotency Gap on Stripe Retry
**What goes wrong:** Stripe retries event delivery if FastAPI doesn't 200 in <10s (network blip, slow DB write). Backend processes the same `payment_intent.succeeded` twice → double-flips Sale.status or double-writes audit rows.
**Why it happens:** No idempotency key check.
**How to avoid:** Persist Stripe `event.id` in a `StripeWebhookEvent(event_id PK, tenant_id, event_type, received_at)` table at the start of webhook processing. Check existence before any state mutation. Mirror the `_STATUS_PRIORITY` monotonic-status guard from Phase 12 webhooks.
**Warning signs:** Duplicate `STRIPE_WEBHOOK_RECEIVED` audit rows for the same `event.id`.

### Pitfall 7: PaymentIntent Created But Sale Closed With Other Method
**What goes wrong:** Staff initiates Stripe payment → PaymentIntent created → customer card declines → staff switches to cash and closes sale. Orphan PaymentIntent stays open in Stripe. If customer later retries through the same intent, they get charged for a sale that's already paid.
**Why it happens:** PaymentIntents persist until canceled or succeeded.
**How to avoid:** On Sale.close, call `stripe.PaymentIntent.cancel()` for any pending stripe_card Payments that aren't `succeeded`. Add explicit "Cancel Stripe attempt" UI control. Audit `PAYMENT_FAILED` with reason `staff_canceled`.
**Warning signs:** Stripe Dashboard shows "Incomplete" intents that don't match any Sale.

### Pitfall 8: Receipt Generation Before Sale Commit
**What goes wrong:** Receipt endpoint generates PDF from Sale data — but if called before the close TXN commits, line items / payments are incomplete.
**Why it happens:** UI calls receipt endpoint immediately after close button click; race with DB commit.
**How to avoid:** `/sales/{id}/receipt/` requires `sale.status IN ('paid', 'refunded')`. Returns 409 if `open`. Close endpoint awaits commit before responding to FE. FE only enables "Print/Email" after close response succeeds.

### Pitfall 9: Stripe Elements `redirect: 'always'` Breaks /pos Flow
**What goes wrong:** Default `stripe.confirmPayment({ elements })` uses `redirect: 'always'` for payment methods that may require redirect (3DS, bank transfers). Page navigates away from `/pos`, clerk loses cart state.
**Why it happens:** Stripe defaults to redirect for compatibility with all methods.
**How to avoid:** Pass `redirect: 'if_required'` — cards (the 99% case) stay in-page; only redirect-required methods (rare for optometry) trigger navigation. Handle the `requires_action` status from the response for SCA/3DS cases.

### Pitfall 10: Camelize Mangles Stripe-Native JSON Keys
**What goes wrong:** Storing Stripe metadata via `apiFetch` triggers `camelizeKeys` recursion — Stripe's `payment_method_types: ['card']` becomes `paymentMethodTypes: ['card']`. When FE/BE compare against Stripe's documented schema, it mismatches.
**Why it happens:** Per `feedback_camelizekeys_nested.md`, `apiFetch`'s recursive camelize breaks nested JSONB domain keys.
**How to avoid:** For any endpoint that returns Stripe-native payloads (or echoes them via processor_metadata_jsonb), use raw fetch + `getAuthHeaders()` and opt out of camelize. Top-level Payment/Sale fields camelize normally (they're our domain), nested Stripe fields stay snake_case.

### Pitfall 11: Failure to Re-Encrypt on Stripe Key Update
**What goes wrong:** Admin updates Stripe key via PUT `/admin/payment-config/`; route handler stores plaintext or fails to call `encrypt_secret()`. Secret hits DB unencrypted.
**Why it happens:** Encryption is an easy step to skip during initial implementation.
**How to avoid:** Pydantic schema for update payload validates plaintext input; route handler MUST call `encrypt_secret()` before `tenant.stripe_secret_key_encrypted = ...`. Add a unit test that asserts `tenant.stripe_secret_key_encrypted.startswith("gAAAA")` (Fernet ciphertext prefix).

### Pitfall 12: Daily-Close "Counted Cash" Truncated to Integer
**What goes wrong:** Staff inputs counted cash as "1247.50" but form binds to integer → stored as 1247. Variance becomes -$0.50 phantom.
**Why it happens:** Currency inputs default to number/integer typing in many UI libraries.
**How to avoid:** Counted_cash input is `<input type="text" inputMode="decimal" />` parsed via `Decimal()` server-side; never `parseInt`. Schema: `Decimal(10, 2)`.

### Pitfall 13: Refund Restock Without Inventory TXN Row
**What goes wrong:** Refund handler updates Product.stock_qty +qty but forgets to write `InventoryTransaction(reason='refund_restock', ...)`. Audit trail missing — Phase 13 invariant broken.
**Why it happens:** Easy to miss in a wide-fanning refund handler.
**How to avoid:** Encapsulate restock logic in a single helper `restock_for_refund(db, refund, ctx)` that ALWAYS pairs Product mutation with InventoryTransaction. Mirror the cancel handler structure in `optical_order.py:790-840`.

### Pitfall 14: Audit Row Outside Primary TXN
**What goes wrong:** Refund flow calls `log_action(...)` AFTER `db.commit()` → if audit insert fails, refund persists without audit. HIPAA/clinical-safety violation.
**Why it happens:** Forgetting to flush audit before commit.
**How to avoid:** Per `.claude/rules/clinical-safety.md`, ALL writes including audit in single `db.commit()`. `log_action` is invoked before final commit, as in every existing route. Add a unit test that mocks `log_action` to raise — the refund must roll back.

### Pitfall 15: Stripe `automatic_payment_methods` vs `payment_method_types`
**What goes wrong:** Using `payment_method_types=['card']` locks you to cards even after enabling Apple Pay / Google Pay in Stripe Dashboard. Setting `automatic_payment_methods={'enabled': True}` is the modern equivalent and auto-detects browser capabilities.
**Why it happens:** Stripe migrated; old tutorials reference `payment_method_types`.
**How to avoid:** Always use `automatic_payment_methods={'enabled': True}` when creating PaymentIntents in 2026. This costs nothing if only cards are enabled in the Dashboard but futureproofs adding wallets.

---

## Code Examples

### Cart-Load — Superbill Prefill (Backend Service Layer)

```python
# backend/services/sale_lifecycle.py
async def prefill_from_superbill(
    db: AsyncSession, sale: Sale, superbill_id: UUID
) -> SaleLineItem:
    """Load a SaleLineItem from a Superbill — patient-owed amount only.

    Copay derivation (Phase 10.1 PatientInsurance.copay_amount):
      - If superbill.billed_payer_id is set → use PatientInsurance.copay_amount
        for the patient + payer match; remaining insurance balance stays on
        Superbill (settled later via V3-01 ERA).
      - Else (self-pay) → use Superbill.total_fee.
    """
    superbill = (await db.execute(
        select(Superbill).where(Superbill.id == superbill_id).options(
            selectinload(Superbill.encounter),
        )
    )).scalar_one()

    if superbill.billed_payer_id:
        ins = (await db.execute(
            select(PatientInsurance).where(
                PatientInsurance.patient_id == superbill.patient_id,
                PatientInsurance.payer_id == superbill.billed_payer_id,
                PatientInsurance.is_active.is_(True),
            )
        )).scalar_one_or_none()
        unit_price = (ins.copay_amount if ins and ins.copay_amount is not None
                      else Decimal("0.00"))
    else:
        unit_price = superbill.total_fee

    encounter_date = superbill.encounter.scheduled_for.date() if superbill.encounter.scheduled_for else None
    line = SaleLineItem(
        tenant_id=sale.tenant_id,
        sale_id=sale.id,
        source_type="superbill",
        source_id=superbill.id,
        description=f"Encounter copay — {encounter_date.isoformat() if encounter_date else 'walk-in'}",
        qty=1,
        unit_price=unit_price,
        discount_amount=Decimal("0.00"),
        taxable=False,                        # clinical service → not CA sales tax
        line_total=unit_price,
    )
    db.add(line)
    await db.flush()
    return line
```

### PaymentIntent Creation (Stripe Adapter)

```python
# backend/services/payments/stripe_processor.py
import stripe
from backend.services.payments.crypto import decrypt_secret
from backend.services.payments.base import PaymentProcessor, ProcessorIntent

class StripeProcessor:  # implements PaymentProcessor Protocol
    async def create_payment_intent(
        self, tenant: Tenant, amount: Decimal, currency: str, metadata: dict
    ) -> ProcessorIntent:
        if not tenant.stripe_secret_key_encrypted:
            raise PaymentProcessorError("Tenant has no Stripe key configured")
        api_key = decrypt_secret(tenant.stripe_secret_key_encrypted)

        # Stripe expects integer cents; never float
        amount_cents = int(quantize_money(amount) * 100)

        intent = stripe.PaymentIntent.create(
            api_key=api_key,
            amount=amount_cents,
            currency=currency,
            automatic_payment_methods={"enabled": True},   # NOT payment_method_types
            metadata={
                "tenant_id": str(tenant.id),                # needed for webhook → tenant lookup
                **metadata,                                  # sale_id, patient_id, etc.
            },
            idempotency_key=f"sale-{metadata['sale_id']}-{metadata.get('attempt', 1)}",
        )
        return ProcessorIntent(
            intent_id=intent.id,
            client_secret=intent.client_secret,
            amount=amount,
            currency=currency,
        )
```

### Refund Flow (Primary TXN)

```python
# backend/services/sale_lifecycle.py
async def issue_refund(
    db: AsyncSession,
    ctx: TenantContext,
    sale: Sale,
    line_refunds: list[RefundLineSpec],   # [(sale_line_item_id, qty, amount), ...]
    payment_refunds: list[RefundPaymentSpec],  # [(payment_id, amount), ...]
    reason: str,
    processor: PaymentProcessor,
) -> Refund:
    """Atomic item-level refund — restock + processor refund + audit in one TXN."""
    if not reason or len(reason) > 500:
        raise HTTPException(400, "reason required (max 500 chars)")

    staff = await resolve_staff(ctx, db)
    refund = Refund(
        tenant_id=ctx.tenant_id, sale_id=sale.id,
        total_amount=quantize_money(sum(lr.amount for lr in line_refunds)),
        reason=reason, refunded_by_id=staff.id if staff else None,
    )
    db.add(refund)
    await db.flush()

    # 1. Per-line restock + RefundLineItem
    for spec in line_refunds:
        line = await db.get(SaleLineItem, spec.sale_line_item_id)
        if line.source_type in ("product", "optical_order") and spec.qty > 0:
            # Row-lock product before incrementing
            product_id = line.source_id if line.source_type == "product" else _resolve_optical_product(line)
            product = (await db.execute(
                select(Product).where(Product.id == product_id).with_for_update()
            )).scalar_one()
            product.stock_qty += spec.qty
            db.add(InventoryTransaction(
                tenant_id=ctx.tenant_id, product_id=product.id,
                delta=spec.qty, reason="refund_restock",
                staff_id=staff.id if staff else None,
                refund_id=refund.id,
            ))
        db.add(RefundLineItem(
            tenant_id=ctx.tenant_id, refund_id=refund.id,
            sale_line_item_id=line.id, qty=spec.qty, amount=spec.amount,
        ))

    # 2. Per-payment processor refund + RefundPayment
    tenant = await db.get(Tenant, ctx.tenant_id)
    for spec in payment_refunds:
        payment = await db.get(Payment, spec.payment_id)
        if payment.method == "stripe_card":
            result = await processor.refund_payment(tenant, payment, spec.amount)
            processor_refund_id = result.refund_id
        else:
            processor_refund_id = None     # external_card / cash / write_off — ledger-only
        db.add(RefundPayment(
            tenant_id=ctx.tenant_id, refund_id=refund.id,
            payment_id=payment.id, amount=spec.amount,
            processor_refund_id=processor_refund_id,
        ))
        # Update Payment.status if fully refunded
        # (Logic: sum(RefundPayment.amount for payment) >= payment.amount → status='refunded')

    # 3. Flip Sale.status (partial or full same enum)
    sale.status = "refunded"

    # 4. If all OpticalOrder lines refunded, cancel order (Phase 13 semantics)
    await _maybe_cancel_optical_orders(db, sale, refund)

    # 5. Audit
    await log_action(
        db, ctx, AuditAction.REFUND_ISSUED, "refund", refund.id,
        staff_id=staff.id if staff else None,
        patient_id=sale.patient_id,
        metadata={"sale_id": str(sale.id), "amount": str(refund.total_amount), "reason": reason},
    )
    await db.flush()
    return refund
```

### Daily-Close Aggregation Query

```python
# backend/services/sale_lifecycle.py
async def compute_daily_close(
    db: AsyncSession, tenant_id: UUID, close_date: date
) -> dict:
    """5-section daily close totals — no commits; pure query."""
    # 1. Sales summary
    sales_summary = (await db.execute(
        select(
            func.count(Sale.id).label("count"),
            func.coalesce(func.sum(Sale.total), 0).label("gross"),
        ).where(
            Sale.tenant_id == tenant_id,
            Sale.status.in_(("paid", "refunded")),
            func.date(Sale.closed_at) == close_date,
        )
    )).one()

    refunds_total = (await db.execute(
        select(func.coalesce(func.sum(Refund.total_amount), 0)).where(
            Refund.tenant_id == tenant_id,
            func.date(Refund.created_at) == close_date,
        )
    )).scalar_one()

    # 2. By payment method (cash, stripe_card, external_card, write_off)
    by_method = (await db.execute(
        select(
            Payment.method,
            func.count(Payment.id).label("count"),
            func.coalesce(func.sum(Payment.amount), 0).label("total"),
        ).join(Sale, Sale.id == Payment.sale_id).where(
            Sale.tenant_id == tenant_id,
            Payment.status == "succeeded",
            func.date(Payment.created_at) == close_date,
        ).group_by(Payment.method)
    )).all()

    # 3. By category (clinical, retail, optical)
    by_category = (await db.execute(
        select(
            case(
                (SaleLineItem.source_type == "superbill", "clinical"),
                (SaleLineItem.source_type == "optical_order", "optical"),
                else_="retail",
            ).label("category"),
            func.count(SaleLineItem.id).label("count"),
            func.coalesce(func.sum(SaleLineItem.line_total), 0).label("total"),
        ).join(Sale, Sale.id == SaleLineItem.sale_id).where(
            Sale.tenant_id == tenant_id,
            Sale.status.in_(("paid", "refunded")),
            func.date(Sale.closed_at) == close_date,
        ).group_by("category")
    )).all()

    # 4. Cash reconciliation: expected = cash payments - cash refund returns - cash change_due
    expected_cash = (await db.execute(
        select(
            func.coalesce(func.sum(Payment.amount), 0)
            - func.coalesce(func.sum(Payment.change_due), 0)
        ).join(Sale).where(
            Sale.tenant_id == tenant_id,
            Payment.method == "cash",
            Payment.status == "succeeded",
            func.date(Payment.created_at) == close_date,
        )
    )).scalar_one()
    # ... minus cash refunds returned (RefundPayment via cash Payment)

    return {
        "sales_summary": {"count": sales_summary.count, "gross": sales_summary.gross, "refunds": refunds_total, "net": sales_summary.gross - refunds_total},
        "by_method": [{"method": r.method, "count": r.count, "total": r.total} for r in by_method],
        "by_category": [{"category": r.category, "count": r.count, "total": r.total} for r in by_category],
        "expected_cash": expected_cash,
    }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stripe `<CardElement />` | `<PaymentElement />` | Stripe React 1.4+ (2021); now standard in 2026 | Auto-supports wallets, ACH, future methods without FE changes |
| Stripe `payment_method_types=['card']` | `automatic_payment_methods={'enabled': True}` | Stripe API 2022; required for newer wallet integrations | Decouples FE/BE from explicit method allow-lists |
| `stripe.confirmCardPayment(clientSecret)` | `stripe.confirmPayment({ elements, redirect: 'if_required' })` | Stripe React 1.7+ | One API for all payment methods; `redirect: 'if_required'` keeps cards in-page |
| Hosted Stripe Checkout for everything | Elements for embedded UX; Checkout for hosted PSP | Industry preference 2024+ | Elements when control matters (POS), Checkout when speed matters (e-commerce) |
| Floats for money | `Decimal` with `ROUND_HALF_EVEN` | Always best practice; widely violated in tutorials | Banker's rounding minimizes systematic bias; critical for daily-close reconciliation |
| `db.refresh()` after `db.flush()` | `selectinload` re-query | SQLAlchemy 2.0 + asyncpg | `db.refresh` triggers MissingGreenlet in async; project standard per `backend-python.md` |
| Postgres native ENUM | VARCHAR + CHECK | Phase 9+ project standard | Avoids `ALTER TYPE ADD VALUE` migrations; matches `native_enum=False` wrapper |

**Deprecated/outdated:**
- `stripe.Charge.create()` direct (replaced by PaymentIntent flow ~2020).
- `loadStripe` returning Stripe object synchronously (now returns Promise; awaited via `<Elements stripe={loadStripe(...)} />`).

---

## Open Questions

1. **SaleLineItem grouping for OpticalOrder lines: self-FK vs flat?**
   - What we know: An OpticalOrder may have multiple line items (frame + lens + coatings); on the Sale, these all share `source_type='optical_order'` and the same `source_id=<optical_order_id>`.
   - What's unclear: Whether to add a `SaleLineItem.parent_line_id` self-FK for explicit grouping, or rely on shared `source_id` + UI grouping logic.
   - Recommendation: **Flat with shared `source_id`** — simpler schema, no migration complexity, UI groups by `source_id` when rendering. Self-FK only if a future use case needs nested receipts (deferred).

2. **`Sale.receipt_url` Supabase Storage cache vs always regenerate?**
   - What we know: Receipt PDFs are cheap to regenerate (<200ms), but Supabase Storage caching gives stable URLs for emails.
   - What's unclear: Whether storage policy complexity (signed URLs, RLS, retention) is worth the stability.
   - Recommendation: **Always regenerate on demand** for Phase 15. `Sale.receipt_url` column stays nullable but unused; revisit if email link-rot becomes a problem.

3. **Receipt number format?**
   - Options: `YYYYMMDD-NNNN` (sequential, requires count-or-sequence per tenant per day), UUID short (`uuid4().hex[:8]`, no contention), monotonic per tenant (`Sale.receipt_seq` integer).
   - Recommendation: **`YYYYMMDD-{seq4}`** where seq4 is `LPAD(count(*) WHERE date(closed_at)=today + 1, 4, '0')`. Computed at close time in the close TXN. Simple, human-readable, no contention concern at pilot scale. Document upgrade path to a per-tenant Postgres SEQUENCE if multi-station concurrent close becomes a thing.

4. **Stripe fee estimation precision in daily close?**
   - What we know: Stripe charges 2.9% + 30¢ for in-person card-on-file; exact fee available on `Charge.balance_transaction.fee` (queryable post-settlement).
   - What's unclear: Whether to estimate live (`amount * 0.029 + 0.30`) or wait for the actual `balance_transaction.fee` from the webhook payload.
   - Recommendation: **Estimate inline** at daily-close time (`amount * 0.029 + 0.30 per Payment`) since balance_transaction fees may not settle until T+1. Label the column "estimated" in the PDF. Add a follow-up endpoint in Phase 16 (Reporting) to reconcile against actual Stripe payouts.

5. **Error states for failed Stripe confirmation?**
   - What we know: `stripe.confirmPayment` can return: success, requires_action (3DS), payment_failed (card declined), processing.
   - What's unclear: UI affordances for each.
   - Recommendation:
     - `succeeded` → show "Paid" + receipt prompt.
     - `requires_action` → Stripe auto-redirects to 3DS; on return, BFF retrieve and update Payment.
     - `payment_failed` → toast with `error.message`, keep PaymentElement mounted for retry, offer "Use cash instead" button. Audit `PAYMENT_FAILED` with metadata `{stripe_error_code, declined_reason}`.
     - `processing` → disable submit, poll `/sales/{id}/payments/{paymentId}/` every 2s until terminal.

6. **`requirements.txt` doesn't currently pin reportlab.**
   - What we know: reportlab is installed locally (4.4.10) but absent from `requirements.txt`. Phases 9, 12, 14 all rely on it.
   - What's unclear: Whether prod deploy has it (it does, since Phase 9 ships); but the pin is missing.
   - Recommendation: Add `reportlab>=4.4,<5.0` to `requirements.txt` as part of Phase 15 Wave 0. This is a pre-existing gap that this phase should resolve since we're adding two new reportlab PDFs.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | pytest >= 7 + pytest-asyncio >= 0.24 (already in `requirements.txt`) + freezegun + httpx ASGITransport |
| Frontend framework | vitest 4.x (unit) + Playwright 1.58 (E2E, `tests/e2e/*.spec.ts`) |
| Config files | `backend/tests/conftest.py` (some Wave 0 skip-stubs in place from Phase 13), `vitest.config.ts`, `playwright.config.ts` |
| Quick run | `npx vitest run <file>` (unit), `cd backend && pytest tests/test_pos*.py -x` |
| Full suite | `npm run test && cd backend && pytest && npm run test:e2e` |
| E2E pre-test gate | `bash scripts/dev.sh pre-test` (verifies both servers up) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| POS-01 | Open checkout with cart from Superbill + OpticalOrder + ad-hoc | E2E (Playwright) | `npx playwright test tests/e2e/pos-checkout.spec.ts -g "POS-01"` | ❌ Wave 0 |
| POS-01 | Cart-load Superbill copay derivation (insurance vs self-pay) | unit (pytest) | `pytest backend/tests/test_sale_cart_load.py::test_superbill_copay_with_insurance -x` | ❌ Wave 0 |
| POS-02 | Cash payment with tendered + change_due | unit + E2E | `pytest backend/tests/test_payment_cash.py -x` + Playwright cash scenario | ❌ Wave 0 |
| POS-02 | Stripe PaymentIntent creation (mocked stripe.PaymentIntent.create) | unit | `pytest backend/tests/test_stripe_processor.py::test_create_payment_intent -x` | ❌ Wave 0 |
| POS-02 | Stripe webhook signature verification | unit | `pytest backend/tests/test_webhooks_stripe.py::test_verify_signature -x` | ❌ Wave 0 |
| POS-02 | Stripe webhook idempotency (duplicate event.id) | unit | `pytest backend/tests/test_webhooks_stripe.py::test_idempotent_event_id -x` | ❌ Wave 0 |
| POS-02 | Stripe Elements PaymentElement renders (FE) | unit (vitest + jsdom) | `npx vitest run components/pos/StripePaymentForm.test.tsx` | ❌ Wave 0 |
| POS-03 | Receipt PDF generation (byte-comparison snapshot smoke) | unit | `pytest backend/tests/test_receipt_pdf.py::test_generate_receipt_smoke -x` | ❌ Wave 0 |
| POS-03 | Receipt email via Postmark with PDF attachment (mocked client) | unit | `pytest backend/tests/test_receipt_email.py -x` | ❌ Wave 0 |
| POS-03 | Print iframe flow renders Object URL Blob | unit (vitest) | `npx vitest run lib/pos/printReceipt.test.ts` | ❌ Wave 0 |
| POS-04 | Daily close aggregation totals correct | unit | `pytest backend/tests/test_daily_close.py::test_aggregation_by_method -x` | ❌ Wave 0 |
| POS-04 | Daily close cash reconciliation (expected vs counted vs variance) | unit | `pytest backend/tests/test_daily_close.py::test_cash_reconciliation -x` | ❌ Wave 0 |
| POS-04 | Daily close PDF + CSV export | unit (smoke) | `pytest backend/tests/test_daily_close_export.py -x` | ❌ Wave 0 |
| POS-05 | Refund item-level with restock | E2E + unit | `npx playwright test tests/e2e/pos-refund.spec.ts` + `pytest backend/tests/test_refund_restock.py -x` | ❌ Wave 0 |
| POS-05 | Refund triggers OpticalOrder cancellation when all lines refunded | unit | `pytest backend/tests/test_refund_optical_cascade.py -x` | ❌ Wave 0 |
| POS-06 | Split tender (multiple Payments per Sale until remaining=0) | unit + E2E | `pytest backend/tests/test_split_tender.py -x` + Playwright split scenario | ❌ Wave 0 |
| POS-07 | PaymentProcessor protocol satisfied by StripeProcessor | unit | `pytest backend/tests/test_processor_protocol.py -x` (uses `isinstance` / Protocol check) | ❌ Wave 0 |
| POS-08 | Fernet encrypt/decrypt round-trip; reject mismatched key | unit | `pytest backend/tests/test_payments_crypto.py -x` | ❌ Wave 0 |
| POS-08 | Stripe key update encrypts before persistence | unit | `pytest backend/tests/test_admin_payment_config.py::test_secret_encrypted_at_rest -x` (asserts ciphertext prefix `gAAAA`) | ❌ Wave 0 |
| POS-09 | Refund restock writes InventoryTransaction in primary TXN | unit | `pytest backend/tests/test_refund_restock.py::test_inventory_txn_in_same_commit -x` (mock log_action to raise → assert rollback) | ❌ Wave 0 |
| POS-09 | Superbill-source refund does NOT restock (clinical service) | unit | `pytest backend/tests/test_refund_restock.py::test_superbill_no_restock -x` | ❌ Wave 0 |
| POS-10 | DailyCloseRun persisted with variance | unit + E2E | `pytest backend/tests/test_daily_close.py::test_persist_run -x` | ❌ Wave 0 |
| POS-11 | Write-off requires OWNER+ADMIN role | unit | `pytest backend/tests/test_permissions_pos.py::test_write_off_role_gate -x` | ❌ Wave 0 |
| POS-11 | Write-off requires non-empty reason_note | unit | `pytest backend/tests/test_payment_writeoff.py::test_reason_required -x` | ❌ Wave 0 |
| POS-12 | All 13 AuditAction + 6 ClinicalAction values present | unit | `pytest backend/tests/test_pos_enums.py -x` | ❌ Wave 0 |
| POS-13 | Tax computed only on taxable lines (superbill excluded) | unit | `pytest backend/tests/test_sale_tax.py::test_only_taxable_lines -x` | ❌ Wave 0 |
| POS-13 | Tax rounding banker's-rounding consistent | unit | `pytest backend/tests/test_sale_tax.py::test_banker_rounding -x` | ❌ Wave 0 |
| POS-14 | Copay derivation from PatientInsurance.copay_amount when billed | unit | `pytest backend/tests/test_sale_cart_load.py::test_copay_from_insurance -x` | ❌ Wave 0 |
| POS-14 | Copay falls back to Superbill.total_fee when self-pay | unit | `pytest backend/tests/test_sale_cart_load.py::test_copay_self_pay_fallback -x` | ❌ Wave 0 |
| POS-15 | Discount with reason persists; audit row written | unit | `pytest backend/tests/test_sale_discount.py -x` | ❌ Wave 0 |
| POS-16 | Pydantic by_alias snapshot matches TS literal keys | contract test | `pytest backend/tests/test_sales_contract.py -x` + `npx vitest run types/sales.contract.test.ts` | ❌ Wave 0 |
| Manual | Live Stripe testmode end-to-end (testmode card 4242…) | manual checkpoint | Documented in VALIDATION.md; OWNER runs before merge | n/a |
| Manual | Stripe live keys configured in production tenant + webhook URL registered in Stripe Dashboard | manual checkpoint | Document procedure; only OWNER does this | n/a |
| Manual | Fernet master-key rotation runbook | manual checkpoint | Documented; not tested in CI | n/a |

### Sampling Rate

- **Per task commit:** Wave-local unit tests (`pytest backend/tests/test_<module>.py -x` or `npx vitest run <file>`).
- **Per wave merge:** Full backend unit suite (`cd backend && pytest`) + full vitest (`npm run test`) + tsc clean.
- **Phase gate (before `/gsd:verify-work`):** Above + full Playwright suite (`npm run test:e2e`) + manual Stripe testmode E2E checkpoint + Fernet round-trip canary.

### Wave 0 Gaps

- [ ] `backend/tests/conftest.py` — extend with `sale_factory`, `payment_factory`, `refund_factory` fixtures; stub `StripeProcessor` for tests (returns canned ProcessorIntent/ProcessorPayment).
- [ ] `backend/tests/test_sale_cart_load.py` — covers POS-01, POS-14.
- [ ] `backend/tests/test_payment_cash.py` — covers POS-02 (cash branch).
- [ ] `backend/tests/test_stripe_processor.py` — covers POS-02 (stripe branch, mocked `stripe` module).
- [ ] `backend/tests/test_webhooks_stripe.py` — covers POS-02 webhook + idempotency.
- [ ] `backend/tests/test_receipt_pdf.py` — covers POS-03 (smoke: PDF bytes non-empty + has `%PDF-` magic).
- [ ] `backend/tests/test_receipt_email.py` — covers POS-03 email.
- [ ] `backend/tests/test_daily_close.py` — covers POS-04, POS-10.
- [ ] `backend/tests/test_daily_close_export.py` — covers POS-04 PDF + CSV.
- [ ] `backend/tests/test_refund_restock.py` — covers POS-05, POS-09.
- [ ] `backend/tests/test_refund_optical_cascade.py` — covers POS-05 cancellation cascade.
- [ ] `backend/tests/test_split_tender.py` — covers POS-06.
- [ ] `backend/tests/test_processor_protocol.py` — covers POS-07.
- [ ] `backend/tests/test_payments_crypto.py` — covers POS-08 round-trip + key mismatch.
- [ ] `backend/tests/test_admin_payment_config.py` — covers POS-08 encrypt-on-write.
- [ ] `backend/tests/test_permissions_pos.py` — covers POS-11 role matrix.
- [ ] `backend/tests/test_payment_writeoff.py` — covers POS-11 reason_note required.
- [ ] `backend/tests/test_pos_enums.py` — covers POS-12 enum coverage.
- [ ] `backend/tests/test_sale_tax.py` — covers POS-13.
- [ ] `backend/tests/test_sale_discount.py` — covers POS-15.
- [ ] `backend/tests/test_sales_contract.py` — covers POS-16 by_alias snapshot.
- [ ] `components/pos/StripePaymentForm.test.tsx` — vitest+jsdom render check.
- [ ] `lib/pos/printReceipt.test.ts` — vitest unit for iframe Blob flow.
- [ ] `types/sales.contract.test.ts` — vitest literal-keys mirror.
- [ ] `tests/e2e/pos-checkout.spec.ts` — Playwright covering POS-01..06.
- [ ] `tests/e2e/pos-refund.spec.ts` — Playwright refund flow.
- [ ] `tests/e2e/pos-daily-close.spec.ts` — Playwright daily-close run + variance.
- [ ] Framework install: `pip install stripe>=15.2,<16 cryptography>=46.0,<48.0` — also add `reportlab>=4.4,<5.0` (currently unpinned).
- [ ] Frontend install: `npm install @stripe/stripe-js@^9.7.0 @stripe/react-stripe-js@^6.4.0`.
- [ ] Env vars to add: `PAYMENTS_FERNET_KEY` (master key for tenant Stripe secret encryption), `STRIPE_API_VERSION` (pin to `2026-03-25.dahlia` or current stable).
- [ ] Stripe test-mode account access — document in onboarding wizard for new clinics.
- [ ] `backend/tests/conftest.py` may need a `freezegun` import for time-sensitive daily-close tests (already in `requirements.txt`).

---

## Sources

### Primary (HIGH confidence)

- **Local codebase (verified by reading):**
  - `backend/api/routes/webhooks.py` — Twilio/Postmark webhook pattern (clone for Stripe)
  - `backend/api/routes/optical_order.py` lines 570-769, 790-840 — `with_for_update()` + InventoryTransaction primary-TXN pattern
  - `backend/services/job_ticket_pdf.py` — reportlab letter-size template (clone for receipt)
  - `backend/services/messaging/compliance_report.py` — reportlab landscape pattern + SQL aggregation (clone for daily-close)
  - `backend/services/messaging/email_client.py` — Postmark client (NOT Resend); confirms Phase 12 BAA decision
  - `backend/core/permissions.py` — ClinicalAction enum + PERMISSION_MATRIX extension points
  - `backend/db/models/tenant/clinical.py:127-213` — AuditAction enum, confirming VARCHAR via `native_enum=False`
  - `backend/db/models/tenant/clinical.py:1334-1390` — `PatientInsurance.copay_amount` (Numeric(10,2), nullable=True) — confirms CONTEXT.md
  - `backend/db/models/tenant/clinical.py:1109-1196` — Superbill (total_fee, billed_payer_id) — confirms cart-prefill source
  - `backend/db/models/public/saas.py` — Tenant model + `settings_jsonb` extension point; `Enum` VARCHAR wrapper
  - `lib/bff.ts` — `proxyToFastAPI` for JSON; understand boundary
  - `app/api/optical-orders/[orderId]/job-ticket/route.ts` — raw fetch + arrayBuffer pattern for PDF Blob (clone for receipt endpoint)
  - `app/api/webhooks/twilio/route.ts` — raw body + X-Webhook-Internal HMAC seal (clone for Stripe webhook BFF)
  - `package.json` — confirms `@react-email/components 1.0.12`, `@react-email/render 2.0.8` already installed
  - `requirements.txt` — confirms reportlab NOT pinned (gap); confirms `python-jose[cryptography]>=3.3` pulls cryptography transitively

- **Version verification commands run 2026-05-27:**
  - `pip index versions stripe` → 15.2.0 latest
  - `pip index versions reportlab` → 4.5.1 latest (4.4.10 installed locally)
  - `pip index versions cryptography` → 48.0.0 latest (46.0.5 installed locally)
  - `npm view @stripe/react-stripe-js version` → 6.4.0
  - `npm view @stripe/stripe-js version` → 9.7.0

- **Official Stripe documentation:**
  - [Create a PaymentIntent](https://docs.stripe.com/api/payment_intents/create) — Stripe API reference
  - [Refund API](https://docs.stripe.com/api/refunds) — partial refund via `amount` parameter
  - [Webhook signature verification](https://docs.stripe.com/webhooks/signature) — `construct_event` is canonical
  - [React Stripe.js reference](https://stripe.com/docs/stripe-js/react) — Elements + PaymentElement
  - [stripe-python on PyPI](https://pypi.org/project/stripe/) — 15.2.0 with 2026-03-25 API pin

- **Official cryptography documentation:**
  - [Fernet](https://cryptography.io/en/latest/fernet/) — AES-128-CBC + HMAC-SHA256, MultiFernet rotation

### Secondary (MEDIUM confidence — WebSearch, verified against official docs)

- [Stripe Webhook Security: Signature Verification, Idempotency, and Local Testing (DEV.to 2026)](https://dev.to/whoffagents/stripe-webhook-security-signature-verification-idempotency-and-local-testing-1lk3) — verified pattern matches Stripe official docs
- [Add Stripe payments to ANY Next.js 14 App (priceos.com)](https://www.priceos.com/blog/nextjs-14-stripe-payment-element-setup) — `'use client'` requirement + `automatic_payment_methods` pattern; aligned with Stripe React docs
- [Python decimal — Real Python](https://realpython.com/python-rounding/) — ROUND_HALF_EVEN as banker's rounding default; aligned with [Python docs decimal module](https://docs.python.org/3/library/decimal.html)
- [Fernet Encryption in Python Practical Guide (SecValley)](https://www.secvalley.com/insights/fernet-encryption-guide/) — multi-Fernet rotation pattern

### Tertiary (LOW confidence — single source, flagged for validation)

- Stripe fee structure (2.9% + 30¢) — varies by card type / region; should be parameterizable in daily-close per CONTEXT §G optional section.
- Daily-close UI affordances — no canonical "right" pattern; defer to UX taste.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all versions verified via PyPI/npm 2026-05-27; libraries are official-vendor
- Architecture patterns: **HIGH** — direct clones from existing Phase 12/13/14 code that's already in production
- Pitfalls: **HIGH** — most pitfalls grounded in concrete prior-phase feedback files (`feedback_camelizekeys_nested.md`, `feedback_contract_tests.md`) or Stripe documented gotchas
- Open questions: **MEDIUM** — recommendations given but planner has discretion

**Research date:** 2026-05-27
**Valid until:** 2026-06-27 (Stripe SDK + React libs are stable; 30-day shelf life)

---

*Phase: 15-point-of-sale*
*Research complete: 2026-05-27*
