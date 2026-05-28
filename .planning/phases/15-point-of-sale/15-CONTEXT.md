# Phase 15: Point of Sale - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 15 adds the financial-ledger plane to ClarityOS — a single-sale checkout that closes out clinical copays (from existing Superbills), placed retail/optical orders (from Phase 13 `OpticalOrder`), and ad-hoc retail line items. Front desk takes cash + Stripe-card (via a pluggable `PaymentProcessor` interface with Stripe Elements as the shipped implementation), records external-terminal/write-off payments manually, issues item-level refunds with restock, prints/emails reportlab receipts, and runs an OWNER-gated daily-close report with cash reconciliation. Gated on the existing `retail_pos` entitlement (Phase 13).

**In scope (success criteria 1-5 from ROADMAP.md §Phase 15):**
- Cart composition pulling in Superbill copay + placed OpticalOrders + ad-hoc retail; per-line discount with reason.
- Cash (tendered + change), Stripe-card (Elements + per-tenant credentials), external-terminal (manual entry), write-off / on-account. Split tender supported.
- Sales tax per-tenant rate, applied to retail/optical lines only.
- PDF + email + browser-print receipts (reportlab, Resend, hidden-iframe `window.print`).
- Daily close page with totals by payment method + category, cash reconciliation, PDF/CSV export.
- Item-level + full-sale refunds with restock + card-refund through processor.
- PaymentProcessor abstraction in place (Stripe-only implementation).

**Out of scope (deferred — see §Deferred):**
- Stripe Terminal hardware (physical reader).
- Additional payment processors (Square, Authorize.net, Helcim) — V3 / first-customer ask.
- Check payment method, tips, gift cards, loyalty, deposits / layaway, payment plans.
- Insurance receipt reconciliation (ERA/EOB) — V3-01.
- TaxJar / zip-based tax resolution.
- Auto end-of-day close trigger.
- Vision-plan-specific pricing.
- FSA/HSA-specific receipt format.

</domain>

<decisions>
## Implementation Decisions

### A. Sale composition & schema
- **New tables (4):** `Sale`, `SaleLineItem`, `Payment`, `Refund` (+ join tables `RefundLineItem`, `RefundPayment`). Separate from `Superbill` / `OpticalOrder` — those stay clinical/operational; Sale is the financial ledger.
- **`Sale`:** `tenant_id`, `patient_id`, `status` ENUM `[open, paid, refunded, voided]`, `subtotal Numeric(10,2)`, `tax Numeric(10,2)`, `discount_total Numeric(10,2)`, `total Numeric(10,2)`, `created_by_id`, `opened_at`, `closed_at?`, `receipt_url?` (Supabase Storage cache, optional), `notes?`.
- **`SaleLineItem`:** `sale_id`, `source_type` ENUM `[superbill, optical_order, product, adhoc]`, `source_id UUID?` (FK to source row when source_type ∈ {superbill, optical_order, product}; null for adhoc), `description String(500)`, `qty Integer`, `unit_price Numeric(10,2)`, `discount_amount Numeric(10,2) default 0`, `discount_reason String(200)?`, `taxable Boolean`, `line_total Numeric(10,2)` (= qty × unit_price − discount_amount).
- **`Payment`:** `sale_id`, `method` ENUM `[cash, stripe_card, external_card, write_off]`, `amount Numeric(10,2)`, `tendered Numeric(10,2)?` (cash only), `change_due Numeric(10,2)?` (cash only), `processor_payment_id String?` (Stripe PaymentIntent id), `processor_charge_id String?`, `last4 String(4)?` (external_card free-typed, stripe_card from PI), `auth_code String(20)?` (external_card free-typed), `status` ENUM `[pending, succeeded, failed, refunded, partial_refund]`, `reason_note String(500)?` (mandatory for write_off), `created_by_id`, `created_at`.
- **`Refund` + `RefundLineItem` + `RefundPayment`:** `Refund(sale_id, total_amount, reason String(500) NOT NULL, refunded_by_id, processor_refund_id?, created_at)`. `RefundLineItem(refund_id, sale_line_item_id, qty, amount)` — drives restock. `RefundPayment(refund_id, payment_id, amount)` — drives card refund via processor.
- **Cart-load semantics:**
  - Pull-in Superbill: `SaleLineItem(source_type=superbill, source_id=<superbill_id>, description="Encounter copay — <encounter_date>", qty=1, unit_price=copay, taxable=false)`. Copay derived from `PatientInsurance.copay` (Phase 10.1) for the superbill's `billed_payer_id`; full `Superbill.total_fee` when self-pay. Remaining insurance balance stays on Superbill (status untouched; V3-01 will reconcile via ERA).
  - Pull-in OpticalOrder: one `SaleLineItem` per `OpticalOrderLineItem`, snapshot of unit_price + description. `source_type=optical_order`, `source_id=<optical_order_id>` on header line; child lines reference back via `parent_line_id?` (optional self-FK on SaleLineItem for grouping) OR flat with same source_id (planner decides — leaning flat for simplicity). `taxable=true`.
  - Ad-hoc retail (product): pick from Product catalog (Phase 13). `SaleLineItem(source_type=product, source_id=<product_id>, ...)`. `taxable=true`. Decrements stock on Sale.paid transition (writes `InventoryTransaction reason='sale_placed'`).
  - Free-text line: `source_type=adhoc, source_id=NULL`. Staff types description + unit_price. `taxable=true` by default, overrideable.
- **Sale lifecycle:** `open` → (`paid` on full payment) → (`refunded` on any refund, `voided` on staff cancel before any payment). Stock decrements for ad-hoc product lines happen on the `open → paid` transition (primary-TXN with InventoryTransaction). OpticalOrder.status moves `placed → dispensed` on Sale.paid (or stays `placed` per staff choice at checkout — toggle on cart line "Mark dispensed on payment ✓").

### B. Entry points & checkout UI
- **Dedicated `/pos` full-page checkout** (cart left ~60%, payment panel right ~40%). Reuses glass aesthetic; not a drawer or modal — roomier for cash math, split tender, Stripe Elements iframe, receipt preview, error states.
- **CTAs that route to `/pos?patient={id}&prefill={kind}:{id}`:**
  - Patient detail page — new "Payments" tab next to Billing; lists past Sales + "New Sale" button.
  - Superbill row in `/billing` dashboard — "Take Payment" button (prefill=superbill).
  - `OrderDetailDrawer` (Phase 13) — "Take Payment" footer button when order.status='placed' (prefill=optical_order).
  - Top-level `/pos` page with patient search box for walk-in retail (no patient context).
  - Schedule detail drawer (Phase 10.2) — "Take Payment" button when appointment.status='completed' AND linked encounter has Superbill (prefill=superbill).
- **All CTAs gated on `Entitlement.RETAIL_POS`** (existing add-on bundle from Phase 13). Sidebar gets a "Point of Sale" link gated on same entitlement.

### C. Payment methods & processor abstraction
- **`PaymentProcessor` abstract interface** in `backend/services/payments/base.py`:
  - `async create_payment_intent(tenant, amount, currency, metadata) -> ProcessorIntent`
  - `async confirm_payment(tenant, payment_intent_id) -> ProcessorPayment`
  - `async refund_payment(tenant, payment, amount) -> ProcessorRefund`
  - `verify_webhook_signature(tenant, body, signature) -> WebhookEvent`
- **Shipped implementation:** `backend/services/payments/stripe_processor.py` using `stripe-python` SDK with Stripe Elements (in-page card form, server-side PaymentIntent confirmation).
- **Per-tenant credentials** (`Tenant` model additions):
  - `stripe_publishable_key String?` (plain — public)
  - `stripe_secret_key_encrypted String?` (encrypted at rest via Fernet or similar; key from env)
  - `stripe_webhook_secret_encrypted String?`
  - Configured via **Admin > Settings > POS Payments** card (OWNER-only); audit `STRIPE_KEYS_UPDATED`.
- **Funds direction:** clinic's own Stripe account — funds land directly there; ClarityOS does NOT take a platform cut (not Stripe Connect for Phase 15).
- **Cash:** tendered amount + change due; both stored on `Payment.tendered` / `Payment.change_due`. Validate `tendered >= amount`.
- **External card terminal (manual entry):** staff enters amount + last4 (free text) + optional auth code. No integration — just ledger record. `method='external_card'`.
- **Write-off / on-account:** OWNER + ADMIN only; mandatory `reason_note`; closes Sale to AR. `method='write_off'`. New audit: `WRITE_OFF_RECORDED`.
- **Split tender:** Sale.total = sum(Payments where status='succeeded' or 'partial_refund'). UI shows "Amount remaining: $X — Add another payment" until remaining hits zero. Validates total payment amount ≤ Sale.total before allowing close.
- **NOT in scope:** check payment (add later if customer asks), tips (N/A optometry).
- **Stripe webhooks:** new BFF + FastAPI route `/api/webhooks/stripe/` with signature verification (clone `backend/api/routes/webhooks.py` Twilio/Resend pattern from Phase 12). Idempotent monotonic status updates on Payment. Middleware allowlist already covers `/api/webhooks/*`.

### D. Tax & pricing rules
- **`Tenant.sales_tax_rate Numeric(5,4) default 0.0725`** — single per-tenant rate (CA default 7.25%). Configurable in Admin > Settings > POS.
- **Taxable rule by source_type:**
  - `superbill` → `taxable=false` (clinical service, no CA sales tax)
  - `optical_order`, `product`, `adhoc` → `taxable=true` (CA optical retail)
  - Per-line override allowed at checkout for edge cases.
- **Tax computation:** `tax = sum(line_total WHERE taxable=true) × tenant.sales_tax_rate`. Computed server-side at Sale close; frontend shows live preview.
- **Insurance / copay derivation (Superbill line):**
  - If `Superbill.billed_payer_id IS NOT NULL` AND patient has matching `PatientInsurance`: copay = `PatientInsurance.copay` (Phase 10.1 field).
  - Else (self-pay): copay = `Superbill.total_fee`.
  - Insurance balance stays on Superbill — settled later via V3-01 ERA flow.
- **Discounts:** per-line, `%` or `$` toggle, **mandatory `discount_reason` text** (e.g., "loyalty", "manager override", "returning patient"). Stored on `SaleLineItem.discount_amount` + `discount_reason`. Audited via `log_action(SALE_DISCOUNT_APPLIED)`.
- **Rounding:** Decimal arithmetic throughout (no float). Banker's rounding to 2 decimal places at line and total levels.

### E. Refunds workflow
- **Granularity:** item-level (pick which `SaleLineItem`s + qty) OR full-sale (one-click "Refund entire sale").
- **Operator gate:** OWNER + ADMIN only. New `ClinicalAction.ISSUE_REFUND` in `backend/core/permissions.py`.
- **Time window:** none. Audit log captures who/when/why. `Refund.reason String(500) NOT NULL`.
- **Card refunds:** dispatched back through original payment(s) via `PaymentProcessor.refund_payment` (Stripe RefundIntent for stripe_card). `RefundPayment` row records the reversal. External_card refunds are ledger-only; staff handles physical reversal externally.
- **Restock:**
  - OpticalOrder lines: refund triggers `InventoryTransaction(reason='refund_restock', delta=+qty)` for each underlying `OpticalOrderLineItem.product_id`; if all OpticalOrder lines refunded, `OpticalOrder.status` → `cancelled` (matches Phase 13 cancel semantics).
  - Ad-hoc product lines: same `InventoryTransaction` pattern.
  - Superbill lines: no restock (clinical service).
  - All in primary-TXN with Refund + RefundLineItem + RefundPayment + log_action(REFUND_ISSUED).
- **Sale.status:** moves to `refunded` (partial or full — same enum value; client computes "fully refunded?" from `sum(refund.total_amount) == sale.total`).

### F. Receipts
- **Format:** reportlab PDF — clone shape from `backend/services/job_ticket_pdf.py` (Phase 14). Letter-size, clean professional layout (not thermal-style).
- **PDF contents:** clinic header (logo + name + address + phone + NPI), patient name + DOB, sale # + date, line table (description, qty, unit price, discount, line total), subtotal, discount total, tax, total, payment breakdown (method + amount, last4 for cards, cash tendered + change), refund summary if applicable, footer (cashier name + receipt #).
- **Delivery (post-checkout prompt "Print, Email, or Both"):**
  - **Print:** FE fetches `/api/sales/{id}/receipt/` (Blob), opens hidden iframe with PDF, calls `iframe.contentWindow.print()`. Mirrors Phase 6 Rx PDF pattern + Phase 14 job ticket Blob streaming.
  - **Email:** server endpoint POST `/api/sales/{id}/receipt/email/` → React Email template (mirror Phase 12 messaging templates) sent via Resend with PDF attachment. Uses `patient.email`; staff can override on prompt. Audit `RECEIPT_EMAILED`.
  - **Both:** both actions fire.
- **Receipt URL cache:** optionally `Sale.receipt_url` points to Supabase Storage object (uploaded once on first generate, reused for re-downloads). Decision deferred to planner — if Supabase Storage policy is non-trivial, just regenerate on demand.
- **Refund receipts:** separate `/api/refunds/{id}/receipt/` endpoint generates refund-receipt PDF (similar shape, "REFUND" header, negative amounts).

### G. Daily close report
- **`/pos/close-of-day` page** — full-page glass layout, OWNER + ADMIN gated.
- **Date picker** defaults to today; supports historical date selection.
- **Sections:**
  1. **Sales summary** — count, gross sales, refunds out, net (gross − refunds).
  2. **By payment method** — table: `cash`, `stripe_card`, `external_card`, `write_off`, `refund_returned`. Count + total per row.
  3. **By category** — `clinical` (source_type=superbill), `retail` (source_type=product|adhoc), `optical` (source_type=optical_order). Count + total per row.
  4. **Cash reconciliation** — "Expected cash" = sum(cash payments.amount) − sum(cash refunds returned) − sum(cash change_due). "Counted cash" = staff input. "Variance" = counted − expected.
  5. **Stripe payout estimate** (optional) — sum(stripe_card.amount) minus approximate fee (use Stripe SDK fee-estimate or store actual fees from webhook).
- **Export:** PDF (reportlab, landscape — clone shape from `backend/services/messaging/compliance_report.py`) + CSV.
- **Persistence:** `DailyCloseRun(tenant_id, close_date, expected_cash, counted_cash, variance, notes?, run_by_id, run_at)`. Captured for audit + Phase 16 reporting joins.
- **Trigger:** manual button only — no automatic end-of-day cron in Phase 15.
- **Audit:** `log_action(DAILY_CLOSE_RUN, metadata={close_date, variance})`.

### H. Entitlement
- **`retail_pos`** — existing add-on from Phase 13. Gates everything POS-related: `/pos` page, `/pos/close-of-day`, all `/api/sales/*` routes, all "Take Payment" CTAs, sidebar link, Admin > Settings > POS Payments card.
- **No new entitlement key.** Bundles together with Phase 13 inventory under one add-on ($150/mo per Phase 13 specifics).

### I. Permissions (new `ClinicalAction` enum values)
- `OPEN_POS` — OWNER, ADMIN, TECHNICIAN, RECEPTIONIST.
- `RECORD_PAYMENT` — OWNER, ADMIN, TECHNICIAN, RECEPTIONIST.
- `RECORD_WRITE_OFF` — OWNER, ADMIN only.
- `ISSUE_REFUND` — OWNER, ADMIN only.
- `RUN_DAILY_CLOSE` — OWNER, ADMIN only.
- `MANAGE_PAYMENT_CONFIG` — OWNER only (Stripe key management).

### J. Audit (new `AuditAction` enum values)
- `SALE_CREATE`, `SALE_OPENED`, `SALE_PAID`, `SALE_VOIDED`
- `PAYMENT_RECORDED`, `PAYMENT_FAILED`
- `WRITE_OFF_RECORDED`
- `REFUND_ISSUED`
- `RECEIPT_EMAILED`, `RECEIPT_PRINTED`
- `DAILY_CLOSE_RUN`
- `SALE_DISCOUNT_APPLIED`
- `STRIPE_KEYS_UPDATED`, `STRIPE_WEBHOOK_RECEIVED`

All logged via `log_action()` in primary-TXN per `.claude/rules/clinical-safety.md`.

### K. New BFF + FastAPI routes (planner reference)
- `app/api/sales/` — GET (list with filters: patient, date range, status), POST (open new sale)
- `app/api/sales/[id]/` — GET, PATCH (update cart lines while open), DELETE (void)
- `app/api/sales/[id]/lines/` — POST add line, PATCH/DELETE [lineId]
- `app/api/sales/[id]/payments/` — POST record payment (cash / external_card / write_off / stripe_card-init)
- `app/api/sales/[id]/payments/stripe-confirm/` — POST after FE Elements confirms PaymentIntent
- `app/api/sales/[id]/close/` — POST move open → paid (only if remaining == 0)
- `app/api/sales/[id]/receipt/` — GET PDF Blob (raw fetch, no proxyToFastAPI for stream)
- `app/api/sales/[id]/receipt/email/` — POST
- `app/api/refunds/` — POST (issue refund)
- `app/api/refunds/[id]/receipt/` — GET PDF Blob
- `app/api/pos/daily-close/` — GET (compute totals for date), POST (record close with counted_cash)
- `app/api/pos/daily-close/[id]/export/` — GET PDF or CSV (query param `?format=pdf|csv`)
- `app/api/admin/payment-config/` — GET, PUT (Stripe keys; OWNER only)
- `app/api/webhooks/stripe/` — POST (signature-verified; middleware allowlist)
- All proxied via `lib/bff.ts` `proxyToFastAPI()` with trailing-slash upstream URLs per `.claude/rules/bff-api.md`. PDF/Blob endpoints use raw fetch + `getAuthHeaders()` (mirror Phase 14 job-ticket pattern).

### L. Requirements (planner adds during /gsd:plan-phase)
Add `POS-01..POS-N` to `.planning/REQUIREMENTS.md`:
- POS-01..05 — five ROADMAP success criteria
- POS-06..N — decisions above (split tender, processor abstraction, per-tenant Stripe keys, item-level refunds with restock, daily close cash reconciliation, write-off owner-gate, audit + permission additions, tax rule, copay derivation, discount reason note)

### Claude's Discretion
- Exact reportlab receipt + daily-close PDF visual design (typography, spacing, clinic logo placement).
- React Email receipt template visual design.
- Exact `/pos` page layout details (whether payment methods are tabs vs radio, cart line drag-handle, etc.).
- Stripe Elements styling to match glassmorphism palette.
- Whether to use `SaleLineItem.parent_line_id` self-FK for OpticalOrder line grouping, or flat with shared `source_id`.
- Whether `Sale.receipt_url` caches PDF in Supabase Storage vs always regenerates on demand.
- Exact discount UI (slider, $/% toggle, popover).
- Receipt # format (YYYYMMDD-NNNN, UUID short, etc.).
- Stripe fee estimation precision in daily-close (use payout_estimate vs sum of actual fees from webhook).
- Error states for failed Stripe confirmation (retry, switch to cash, etc.).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase boundaries & roadmap
- `.planning/ROADMAP.md` §Phase 15 — success criteria 1-5 (POS, payments, receipts, daily close, refunds)
- `.planning/ROADMAP.md` §Phase 13 — `retail_pos` entitlement (already gates POS)
- `.planning/ROADMAP.md` §Phase 16 — Reporting & Exports (DO NOT duplicate revenue / batch export work)
- `.planning/REQUIREMENTS.md` — POS-* IDs added during `/gsd:plan-phase`

### Prior phase context
- `.planning/phases/13-retail-inventory/13-CONTEXT.md` — `retail_pos` entitlement, `OpticalOrder` + `InventoryTransaction` schema, drawer pattern, items deferred to Phase 15 (refunds, tax, vision-plan pricing)
- `.planning/phases/09-claims-basics/09-CONTEXT.md` — `Superbill` shape, payer + insurance fields, CMS-1500 reportlab pattern
- `.planning/phases/12-crm-patient-engagement/` — Resend integration, React Email templates, webhook signature verification pattern (clone for Stripe webhooks)
- `.planning/phases/14-optical-order-configuration/` — job-ticket reportlab PDF + Blob streaming pattern (clone for receipt PDF)
- `.planning/phases/10.1-insurance-revamp/` — `PatientInsurance.copay` column (Phase 10.1) — drives Superbill-line patient-owed amount

### Project rules (non-negotiable)
- `.claude/rules/clinical-safety.md` — primary-TXN writes, audit on every state change
- `.claude/rules/bff-api.md` — every backend route gets a BFF proxy with trailing-slash upstream URLs
- `.claude/rules/backend-python.md` — `selectinload` after `db.flush()`, enums as VARCHAR
- `.claude/rules/testing.md` — vitest + Playwright conventions

### Codebase references (read these for patterns to clone)
- `backend/services/job_ticket_pdf.py` — reportlab PDF template (clone for receipts)
- `backend/services/messaging/compliance_report.py` — landscape reportlab report (clone for daily-close PDF)
- `backend/api/routes/billing.py:674` — CMS-1500 PDF generator (additional reportlab reference)
- `backend/api/routes/webhooks.py` — Twilio/Resend webhook signature pattern (clone for Stripe webhook)
- `backend/api/routes/optical_order.py` — Phase 13 routes; primary-TXN audit + with_for_update() pattern for stock mutations (clone for sale.close stock decrement)
- `lib/entitlements.ts` + `backend/core/entitlements.py` — `RETAIL_POS` key (already wired; just re-use)

### Memory references
- `feedback_camelizekeys_nested.md` — JSONB nested-key handling (relevant if Sale stores any JSONB snapshots)
- `feedback_contract_tests.md` — new FE/BE endpoint pairs need a contract test
- `em_crosswalk.md` — Phase 9 E/M crosswalk + fee schedule wiring (informs how Superbill copay derivation works)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/db/models/tenant/clinical.py` — `TenantBase`, `TimestampMixin`, `SoftDeleteMixin`; `AuditAction` enum at line 127; extend in-place. `Superbill` (line 1109), `SuperbillLineItem` (line 1204), `OpticalOrder` + `OpticalOrderLineItem` (Phase 13), `Tenant` model (add Stripe key columns + `sales_tax_rate`).
- `backend/core/permissions.py` — `ClinicalAction` enum + `PERMISSION_MATRIX`; add 6 new actions.
- `backend/core/entitlements.py` + `lib/entitlements.ts` — `RETAIL_POS` already exists from Phase 13.
- `backend/core/audit.py` `log_action()` — primary-TXN audit with staff_id, ip_address.
- `backend/services/job_ticket_pdf.py` — Phase 14 reportlab letter-size PDF template; clone for receipt PDF.
- `backend/services/messaging/compliance_report.py` — Phase 12 reportlab landscape PDF; clone for daily-close PDF export.
- `backend/services/messaging/templates/` — React Email patterns (clone for receipt email).
- `backend/api/routes/webhooks.py` — Twilio + Resend signature-verified webhook handlers + idempotent monotonic status updates (clone for Stripe webhook).
- `backend/api/routes/optical_order.py` — Phase 13: with_for_update() row-lock on Product, primary-TXN audit + InventoryTransaction in same db.commit() (mirror for Sale.close stock decrement).
- `components/schedule/AppointmentDetailDrawer.tsx` + `components/optical/OrderDetailDrawer.tsx` (Phase 13) — drawer patterns; "Take Payment" CTAs hook in.
- `components/patient/PatientBillingTab.tsx` — clone shape for new "Payments" tab on patient detail.
- `lib/bff.ts` `proxyToFastAPI()` — trailing-slash upstream URLs.
- Phase 6 Rx PDF window.print pattern — hidden iframe approach for browser-print receipts.
- Phase 14 Blob streaming pattern (`getAuthHeaders()` + raw fetch) — for PDF endpoints.

### Established Patterns
- Alembic migrations with DO blocks for idempotency (`ADD COLUMN IF NOT EXISTS`).
- SoftDeleteMixin + partial unique indexes WHERE is_active=true (Phase 10.1, 13).
- SQLAlchemy enums stored as VARCHAR via `native_enum=False` wrapper in clinical.py.
- Pydantic CamelCaseModel + `by_alias=True` for wire format; required contract test (`feedback_contract_tests.md`).
- Zustand store pattern: devtools + selectors + 1.5s debounce save + flush on blur for editable drafts.
- Decimal fields typed as `string` in TS interfaces (matches Pydantic JSON serialization — see Phase 13 §13-03).
- Webhook handler pattern (Phase 12): signature verification → internal HMAC seal → idempotent monotonic status updates → audit row.
- BFF proxy + middleware allowlist for `/api/webhooks/*` (already configured Phase 12).
- AppSession.user.role / staffId / tenantId access pattern (Phase 10.4).

### Integration Points
- `Encounter` → `Superbill` (1:1) — POS reads Superbill.total_fee + Superbill.billed_payer_id.
- `Patient` → `PatientInsurance.copay` (Phase 10.1) — POS reads copay for current billed payer.
- `OpticalOrder` (Phase 13) — POS reads order.total_price + line items; writes order.status='dispensed' on Sale.paid (or leaves placed per cart toggle).
- `Product.stock_qty` (Phase 13) — POS decrements on ad-hoc product line at Sale.paid; writes InventoryTransaction in same TXN.
- `Tenant` — add `sales_tax_rate`, `stripe_publishable_key`, `stripe_secret_key_encrypted`, `stripe_webhook_secret_encrypted` columns.
- Sidebar nav (`components/Sidebar.tsx` or similar) — add "Point of Sale" link gated on `RETAIL_POS`.
- `/admin` page — add "POS Payments" settings card (OWNER only) for Stripe key management.
- `app/api/webhooks/stripe/route.ts` — new webhook entry; middleware already allowlists `/api/webhooks/*`.

</code_context>

<specifics>
## Specific Ideas

- **"Build with plug-and-play feature" — pluggable PaymentProcessor architecture.** Single `PaymentProcessor` abstract interface (`backend/services/payments/base.py`), Stripe-only implementation shipped in Phase 15. Future processors (Square, Authorize.net, Helcim) add as new adapters when a real customer asks — V3 / on-demand. The seam exists day-one so adding a second processor is an adapter file, not a refactor.
- **"Less dependent on us" — per-tenant Stripe credentials.** Each clinic supplies their own Stripe publishable + secret + webhook-signing keys via Admin > Settings > POS Payments (OWNER-only). Funds land in the clinic's Stripe account directly. ClarityOS takes no cut, holds no funds, is not Stripe Connect platform — just orchestrates the API calls using the tenant's keys.
- **Receipt style — feels like the job-ticket PDF (Phase 14), not a thermal-printer receipt.** Clean letter-size layout with clinic header + NPI prominently displayed.
- **Cash reconciliation is a first-class daily-close feature** — expected vs counted vs variance is a real front-desk workflow, not an afterthought. Variance gets stored on `DailyCloseRun` for audit.
- **`/pos` is a full-page checkout, not a drawer.** Cart left, payment panel right. Drawers are too cramped for split tender + change calc + Stripe Elements + receipt prompt.
- **Sale model is the financial ledger; Superbill + OpticalOrder stay clinical/operational.** Decoupling lets V3-01 (ERA/EOB) reconcile insurance receipts against Superbills without touching Sale rows.

</specifics>

<deferred>
## Deferred Ideas

- **Stripe Terminal (physical card-present reader / WisePOS).** Adds hardware dependency + connection-token + reader-pairing complexity. Revisit when a clinic has retail volume justifying it (V3 or per-customer).
- **Additional payment processors** (Square, Authorize.net, Helcim, etc.). Build PaymentProcessor abstraction in Phase 15; ship adapter only when a customer requires it. Tracked as on-demand work, no fixed phase.
- **Check payment method.** Add when a customer requests it; small ledger addition.
- **Tips on payments.** Not standard in optometry. Skip.
- **Gift cards / store credit / loyalty points / on-account credit balances.** V3.
- **Pre-payment deposits / layaway / payment plans / financing (CareCredit etc.).** V3.
- **Insurance receipt reconciliation (ERA/EOB / claim payment posting).** V3-01 — Phase 15 leaves the insurance portion of Superbills as "pending" without trying to reconcile.
- **TaxJar / zip-based tax resolution.** Phase 15 uses a single per-tenant tax rate. Add when a multi-location tenant exists.
- **FSA/HSA-specific receipt format (line-itemized for IRS substantiation).** Phase 15 receipts already itemize lines, so this is mostly compliance documentation. Revisit if customer asks.
- **Vision-plan-specific pricing** (originally deferred from Phase 13 to "Phase 14/15"). Phase 15 uses single retail price per Product. Defer to V3 with broader insurance reconciliation work.
- **Auto end-of-day close trigger / scheduled close at clinic close time.** Manual button only in Phase 15.
- **Refund time-window enforcement / approval gate beyond role check.** OWNER + ADMIN role + audit log + mandatory reason is the gate in Phase 15.
- **Sale voids more nuanced than simple `voided` status.** Phase 15: an `open` sale can be voided (no payments yet); after first payment, only refunds — no void.
- **Stripe Connect / platform-managed payouts / ClarityOS taking a transaction cut.** Out of scope — clinics own their Stripe accounts.

</deferred>

---

*Phase: 15-point-of-sale*
*Context gathered: 2026-05-27*
