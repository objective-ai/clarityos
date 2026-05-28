---
phase: 15
slug: point-of-sale
status: draft
shadcn_initialized: false
preset: none
created: 2026-05-28
---

# Phase 15 — UI Design Contract

> Visual and interaction contract for the Point of Sale phase. Inherits the established ClarityOS glassmorphism design system; declares POS-specific elements (full-page checkout, Stripe Elements styling, daily-close, refund dialog, receipt prompt) on top.

Sources pre-populating this contract:
- `app/globals.css` — design tokens, glass classes, typography scale, animations (HIGH trust, ships in prod).
- `tailwind.config.ts` — CSS-variable bindings (`accent`, `surface`, `glass`, etc.).
- `.planning/phases/15-point-of-sale/15-CONTEXT.md` — §B entry points, §F receipts, §G daily close, §I permissions.
- `.planning/phases/15-point-of-sale/15-RESEARCH.md` — Stripe Elements appearance, hidden-iframe print, Pattern 6/9.
- `CLAUDE.md` — feedback rule `feedback_no_hardcoded_text_colors.md` (no hard-coded white/black, use CSS vars).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (hand-rolled glass system; no shadcn CLI / `components.json`) |
| Preset | not applicable |
| Component library | Radix primitives (via `tailwindcss-animate`) + hand-rolled glass components in `components/` |
| Icon library | `lucide-react` ^0.576.0 (already in `package.json`) |
| Font | `Plus Jakarta Sans` (`--font-jakarta`) for UI; `JetBrains Mono` (`--font-mono`) for prescriptions, money values, last4, processor IDs, receipt #s |

**Theme support:** dark theme (default) + light theme via `[data-theme="light"]`. POS pages MUST work in both. Receipt PDF (server-side reportlab) is always light-on-white — printer/email medium dictates, not theme.

**Mandatory rule (from `feedback_no_hardcoded_text_colors.md`):** never hard-code `text-white/*`, `bg-white/*`, `text-black/*`, `text-gray-*`. Always use the CSS-variable tokens (`var(--text-primary)`, `--text-secondary`, `--text-muted`, `--bg-glass`, `--glass-border`, etc.) or the Tailwind aliases declared in `tailwind.config.ts` (`text-primary`, `text-secondary`, `text-muted`, `bg-surface`, `border-default`, etc.).

---

## Spacing Scale

Inherited from `app/globals.css` + Tailwind defaults (8-point + 4-point hybrid, already canonical across phases 8–14). All values are multiples of 4.

| Token | Value | Usage in Phase 15 |
|-------|-------|-------------------|
| xs | 4px (`p-1`) | Icon-to-label gap on payment-method pills, badge inner padding |
| sm | 8px (`p-2`, `gap-2`) | Cart-row inline gaps; CTA icon-to-text gap; cash-tendered input/change-due inline pair |
| md | 12px (`p-3`, `gap-3`) | Default form-field vertical rhythm; payment-panel sub-section vertical gap |
| md+ | 16px (`p-4`, `gap-4`) | Glass-card inner padding; cart-line vertical padding |
| lg | 24px (`p-6`, `gap-6`) | Section padding between cart / payment panel; daily-close card padding |
| xl | 32px (`p-8`) | `/pos` page horizontal gutter on desktop; `/pos/close-of-day` outer padding |
| 2xl | 48px (`gap-12`) | Major section breaks on daily-close (Sales summary → By payment method) |
| 3xl | 64px (`pt-16`) | Page-top to first card on `/pos/close-of-day` |

**Exceptions:**
- Touch target floor: 44px (`--touch-target`, enforced by `@media (pointer: coarse)` rule in globals.css line 410). All POS interactive controls (payment method pills, cash-tendered input, "Pay", "Print", "Email", refund row checkboxes) MUST meet 44px on touch — this is non-negotiable because the front desk uses iPads.
- `/pos` page split: cart pane `60%` width, payment pane `40%` width on `lg:` breakpoint (≥1024px). Below `lg`, stack vertically (payment pane on top to mirror standard mobile checkout flows).
- Right-slide drawer width: 480px (canonical from `AppointmentDetailDrawer`, `OrderDetailDrawer`). Used by `RefundDialog` and any line-item edit drawers.

---

## Typography

Inherited from `app/globals.css` `@layer utilities` (lines 239–248). 6 roles already defined; Phase 15 uses 5 of them. **Do not introduce new sizes** — pick from this list.

| Role | Utility class | Size | Weight | Line height | Usage in Phase 15 |
|------|---------------|------|--------|-------------|-------------------|
| Display | `.text-display` | 32px | 700 | 1.2 | Sale total (right pane), Daily-close net total |
| Heading | `.text-heading` | 20px | 600 | 1.3 | `/pos` page title, drawer titles, daily-close section titles |
| Subhead | `.text-subhead` | 16px | 600 | 1.4 | Cart-line description, payment-method pill labels |
| Body | `.text-body` | 14px | 400 | 1.6 | Default text, cart-line metadata, helper text under inputs |
| Caption | `.text-caption` | 12px | 500 | 1.5 | "Amount remaining" hint, discount-reason placeholder, refund row qty selector helper |
| Overline | `.text-overline` | 11px | 600 (uppercase, 0.06em) | 1.5 | Section labels ("PAYMENT METHOD", "CART", "TOTAL"), table column headers |

**Mono usage (`.font-mono-data`):** all money values (`$123.45`), receipt numbers, last4 strings, Stripe PaymentIntent IDs, auth codes, change-due, tendered amount. Pairs with `.data-value` for total displays. This matches the existing `rx-value` / `data-value` patterns used throughout the EHR.

**Color binding rule:** typography classes already set `color: var(--text-primary | secondary | muted)` — DO NOT override with hard-coded colors. Override is allowed only when a state requires it (e.g., refund total in `--state-critical`, succeeded total in `--state-normal`).

---

## Color

Inherited from `:root` in `app/globals.css`. The 60/30/10 split is already the law of the ClarityOS palette — do not re-decide.

| Role | Token | Value (dark / light) | Usage |
|------|-------|----------------------|-------|
| Dominant (60%) | `--bg-base` | `#06080D` / `#F8F9FC` | `/pos` page background, `/pos/close-of-day` background |
| Secondary (30%) | `--bg-surface`, `--bg-elevated`, `--bg-glass` | layered glass surfaces | Cart card, payment panel card, drawer surface, daily-close section cards |
| Accent (10%) | `--accent` | `#2DD4BF` (teal) | Reserved — see explicit list below |
| Destructive | `--state-critical` | `#F87171` | Reserved — see explicit list below |
| Success state | `--state-normal` | `#34D399` | Reserved — see explicit list below |
| Warning state | `--state-warning` | `#FBBF24` | Reserved — see explicit list below |
| Info state | `--state-info` | `#60A5FA` | Reserved — see explicit list below |

### Accent reserved-for list (10% rule — never use for "all interactive elements")

Accent `#2DD4BF` may appear ONLY on:

1. Primary CTA: "Take Payment", "Record Payment", "Close Sale", "Issue Refund", "Run Daily Close" buttons (background or filled border).
2. Money value emphasis: `Sale.total` in `.text-display` (right pane), daily-close `Net total`.
3. Active payment-method pill in the payment panel (selected of {Cash | Card | External card | Write-off}).
4. Focused input border (already wired via `.glass-input:focus`).
5. "Stripe ready" status dot (when PaymentIntent is created and Elements is mounted).
6. Stripe Elements appearance theme — Stripe `PaymentElement` `appearance.variables.colorPrimary = '#2DD4BF'` to keep the in-iframe card form on-brand.

**Forbidden uses for accent:** body text, cart-line dividers, table borders, secondary buttons ("Cancel", "Back", "Switch to Cash"), the "Print" / "Email" buttons (those are secondary; use `--border-strong` outlined style).

### Destructive (`--state-critical`) reserved-for list

1. "Void Sale" button (confirmation step), "Issue Refund" final-step button background.
2. Failed Stripe payment banner ("Card declined — try again or switch payment method").
3. Refund totals in receipts ("-$XX.XX").
4. Daily-close variance amount when `variance < $0.00` (cash short).
5. Webhook signature-failure toast.

### Success (`--state-normal`) reserved-for list

1. Payment status badge "Paid" on Sale list / receipt header.
2. Daily-close variance amount when `variance == $0.00` (balanced) or `> $0.00` (over).
3. "Receipt emailed" toast confirmation.

### Warning (`--state-warning`) reserved-for list

1. "Zero stock" pill on ad-hoc product line (mirrors Phase 13 zero-stock soft-block badge).
2. "Spend cap at 80%" daily-close hint (if implemented — see CONTEXT §G "Stripe payout estimate").
3. "Stripe not configured" banner on `/pos` when tenant has no keys (gates the Card pill disabled state).

### Info (`--state-info`) reserved-for list

1. "Pending" payment status badge (Stripe processing, awaiting webhook).
2. "Counted cash equal to expected" reconciliation indicator.

---

## Component Inventory (Phase 15)

| Component | Pattern donor | Reuse / new |
|-----------|---------------|-------------|
| `/pos/page.tsx` (cart + payment panel) | New full-page layout; cart card from `BillingWorkflow.tsx` patterns; payment panel new | NEW |
| `CartLineList` | Table layout from `PatientBillingTab.tsx` | NEW |
| `PrefillSearchModal` | Patient search from `BookAppointmentModal` legacy | NEW (lightweight modal) |
| `PaymentPanel` (payment method tabs + form switch) | Tab pattern from optical-queue tabs | NEW |
| `CashPaymentForm` (tendered + change-due) | `glass-input` mono numeric | NEW |
| `StripePaymentForm` (Elements + PaymentElement) | New — wraps `@stripe/react-stripe-js` | NEW |
| `ExternalCardPaymentForm` (amount + last4 + auth code) | `glass-input` group | NEW |
| `WriteOffPaymentForm` (amount + mandatory reason textarea) | `glass-input` + textarea | NEW |
| `DiscountPopover` ($/% toggle + mandatory reason) | Radix Popover primitive | NEW |
| `RefundDialog` (item picker + total preview + reason textarea) | 480px right-slide drawer cloned from `OrderDetailDrawer.tsx` (Phase 13) | NEW drawer, donor `OrderDetailDrawer` |
| `ReceiptDeliveryPrompt` (Print / Email / Both) | Modal pattern from existing modals; hidden iframe per Phase 6 Rx PDF + Phase 14 job ticket | NEW |
| `DailyCloseTotalsCard` × 4 sections | `glass-card` + `.text-overline` headers + tables | NEW |
| `CashReconciliationCard` (expected / counted input / variance) | `glass-card` + `glass-input` (numeric, `inputMode="decimal"`) | NEW |
| `PosPaymentsCard` (Admin > Settings — Stripe key form) | Form pattern from existing Admin tabs | NEW |
| Sidebar entry "Point of Sale" | `nav-item` utility class | EXTEND `Sidebar.tsx` (or equivalent) |
| "Take Payment" CTA buttons | Embedded in `PatientBillingTab` (Superbill row), `OrderDetailDrawer` footer, schedule `AppointmentDetailDrawer`, `/pos` walk-in | EXTEND existing surfaces |

**Drawer width:** 480px (canonical). Drawer must support ESC + backdrop-click close. Hydration-safe early return: `if (!open && !data) return null` (mirrors Phase 13 §INV-15).

**Form input convention:** every `<input>` for money uses `<input type="text" inputMode="decimal" />` (per RESEARCH §Pitfall 12). Never `type="number"` for currency. Parse with `Decimal()` server-side.

---

## Copywriting Contract

Tone: clinical-professional, terse, action-first. No exclamation marks. No "Oops!" / "Whoops!" style copy. Money is serious. Errors give the user a clear next step.

### Primary CTAs

| Element | Copy | Notes |
|---------|------|-------|
| Open new sale (patient detail Payments tab) | `New sale` | Verb + noun, sentence case |
| Open POS for a Superbill | `Take payment` | Same phrasing across Superbill row, Schedule drawer, Order drawer |
| Open POS for an OpticalOrder | `Take payment` | Same phrasing |
| Sidebar nav | `Point of Sale` | Title case for nav |
| Cart panel section title | `Cart` | Single word |
| Payment panel section title | `Payment` | Single word |
| Cash form submit | `Record cash payment` | Includes method to disambiguate split-tender |
| Stripe form submit | `Charge card` | The Stripe button label; not "Pay" |
| External-card form submit | `Record card payment` | Manual / external terminal |
| Write-off form submit | `Record write-off` | Owner/admin only |
| Sale close (when remaining == 0) | `Close sale` | Final step button |
| Receipt prompt — Print | `Print receipt` | |
| Receipt prompt — Email | `Email receipt` | |
| Receipt prompt — Both | `Print and email` | |
| Refund dialog open | `Refund items` (per-line context) / `Refund full sale` (sale-level context) | |
| Refund dialog confirm | `Issue refund — $X.XX` | Inline amount in the button |
| Daily-close page button | `Run daily close` | |
| Daily-close PDF export | `Export PDF` | |
| Daily-close CSV export | `Export CSV` | |
| Admin > POS Payments save | `Save Stripe configuration` | Specific noun, not "Save" |

### Secondary CTAs

| Element | Copy |
|---------|------|
| Cancel any modal | `Cancel` |
| Drawer close (icon button) | aria-label `Close` |
| Switch payment method after Stripe decline | `Switch to cash` |
| Stripe retry after `requires_action` | `Try card again` |
| Cancel an in-flight Stripe PaymentIntent | `Cancel card attempt` |
| Add another cart line | `Add line` |
| Apply discount | `Apply discount` |

### Empty states

| Surface | Heading | Body |
|---------|---------|------|
| `/pos` with no patient context | `No sale started` | `Search for a patient or scan a product to begin. Walk-in sales without a patient stay assignable later.` |
| Patient Payments tab — no sales | `No sales yet` | `When you ring up a copay, retail item, or optical order, it shows here.` |
| Daily-close totals — date with zero activity | `No sales on this date` | `Pick another date or check the schedule.` |
| Refund dialog — no eligible lines | `Nothing to refund` | `All lines on this sale have already been refunded. Look at the refund history below.` |

### Error states

Format: `{Problem in plain English.} {Next step the user should take.}`

| Trigger | Copy |
|---------|------|
| Stripe card declined | `Card declined. Try a different card, switch to cash, or cancel the card attempt.` |
| Stripe network failure | `Couldn't reach Stripe. Check your internet and try again in a few seconds.` |
| Tenant Stripe not configured (Card pill click) | `Stripe isn't configured for this clinic. Ask an owner to add Stripe keys in Admin > POS Payments.` |
| Tenant missing tax rate | `Sales tax rate not set. An owner can configure it in Admin > POS Payments.` |
| Insufficient cash tendered | `Tendered amount is less than the payment amount. Increase tendered or adjust the payment amount.` |
| Write-off without reason | `A reason is required for write-offs. This shows up in the audit log.` |
| Discount without reason | `Discounts require a short reason. This shows up on the receipt and in the audit log.` |
| Refund without reason | `A reason is required for every refund. This shows up in the audit log.` |
| Sale close attempted with remaining > 0 | `Sale can't close — $X.XX still owed. Add another payment or adjust amounts.` |
| Sale close attempted with no payments | `Add at least one payment before closing the sale.` |
| Receipt requested before close | `Receipt is available after the sale is closed. Finish the payment first.` |
| Stripe key save validation | `That doesn't look like a Stripe key. Publishable keys start with pk_, secret keys with sk_.` |
| Variance not entered on close | `Enter the counted cash amount to record this close. The variance is captured for audit.` |
| Webhook signature failure (admin surface) | `Last Stripe webhook had an invalid signature. Check the webhook signing secret in Admin > POS Payments.` |
| API 5xx during payment | `Something went wrong on our end. The sale stays open — try again or finish another payment method.` |

### Destructive confirmations

Pattern: dialog with explicit action verb in the confirm button. NO generic "Are you sure?".

| Destructive action | Confirm dialog copy |
|--------------------|---------------------|
| Void open sale (no payments yet) | Title: `Void this sale?` — Body: `This will discard the cart. Stock is unaffected since nothing was paid. The sale stays in the audit log.` — Confirm button: `Void sale` (destructive color) |
| Issue refund | Title: `Issue refund for $X.XX?` — Body: `{N} line item(s) will be refunded. {Stock will be restocked for {M} retail/optical items.} {Card refunds may take 5–10 business days to appear on the cardholder's statement.}` — Confirm button: `Issue refund — $X.XX` (destructive color) |
| Cancel an in-flight Stripe attempt | Title: `Cancel card attempt?` — Body: `The customer's card won't be charged. You can switch to cash or a different payment method.` — Confirm button: `Cancel card attempt` (destructive color) |
| Rotate Stripe keys (admin) | Title: `Replace Stripe configuration?` — Body: `The current keys will be encrypted-overwritten. Any in-flight PaymentIntents created with the old keys will fail. Make sure your Stripe Dashboard webhook endpoint is updated to match.` — Confirm button: `Replace configuration` (destructive color) |

### Status badges (single-word, lowercase except first letter — match existing pattern)

| State | Label | Color binding |
|-------|-------|---------------|
| Sale open | `Open` | `--text-secondary` chip on `--bg-glass` |
| Sale paid | `Paid` | `--state-normal` chip |
| Sale partially refunded | `Partial refund` | `--state-warning` chip |
| Sale fully refunded | `Refunded` | `--state-critical` chip (muted alpha) |
| Sale voided | `Voided` | `--text-muted` chip |
| Payment pending | `Pending` | `--state-info` chip |
| Payment succeeded | `Succeeded` | `--state-normal` chip |
| Payment failed | `Failed` | `--state-critical` chip |
| Payment refunded | `Refunded` | `--state-warning` chip (line-through optional) |

### Receipt PDF copy (server-side reportlab)

- Title block: `Receipt` (38px Helvetica-Bold). For refund receipts: `Refund receipt` (same size, no exclamation).
- Receipt # format: `R-YYYYMMDD-NNNN` (e.g., `R-20260528-0042`). Refund #: `RF-YYYYMMDD-NNNN`.
- Money convention: USD `$X.XX` with two decimals always; negative amounts render as `-$X.XX` (no parentheses).
- Footer: `Cashier: {staff_name} • Receipt #{number} • Generated {ISO8601}`. No marketing copy, no "Thank you" tagline (clinical-professional).

### Receipt email copy (React Email template, sent via Postmark per RESEARCH §Standard Stack)

- Subject: `Your receipt from {clinic_name}` (no exclamation, no emoji, no "Re:").
- Body heading: `Hi {patient_first_name},`
- Body line 1: `Here's your receipt from {clinic_name} on {sale_date_human}.`
- Body line 2 (if cash change): `Cash tendered $X.XX • Change $Y.YY.`
- Body line 3: `Your detailed receipt is attached as a PDF.`
- Footer: `Questions? Reply to this email or call {clinic_phone}.`

---

## Animation & Motion

Inherited from `app/globals.css` `@keyframes`. POS uses 4 named animations; no new keyframes needed.

| Animation | Use case |
|-----------|----------|
| `animate-fade-in-up` (500ms, ease-out-expo) | Cart line entry, payment-method form switch |
| `animate-slide-down` (200ms) | Error banner appearance |
| `animate-fade-in` (200ms) | Receipt prompt modal |
| `animate-pulse-glow` (2s loop) | Stripe Elements "processing" indicator, daily-close "running" state |

**Drawer slide:** use the existing 250ms cubic-bezier transition pattern from `AppointmentDetailDrawer.tsx`. Do not invent new timing.

**Reduced motion:** if `prefers-reduced-motion: reduce`, all transitions collapse to 0ms (already enforced by `tailwindcss-animate` defaults — verify in checker pass).

---

## State Coverage

Every interactive surface in Phase 15 MUST define these 5 states. Checker enforces.

| Component | Default | Hover | Focus | Active/Loading | Disabled |
|-----------|---------|-------|-------|----------------|----------|
| Primary CTA ("Take Payment", "Close sale") | Filled `--accent` background, white text | Brightens to `--accent-hover` | 3px `--accent-dim` ring | Mono spinner, label stays | Opacity 0.45, cursor `not-allowed` |
| Secondary button ("Cancel", "Switch to cash") | Outlined `--border-default` | `--border-strong` | 3px `--accent-dim` ring | Spinner | Opacity 0.45 |
| Destructive CTA ("Void sale", "Issue refund") | Filled `--state-critical` muted alpha | Full `--state-critical` | 3px `--state-critical` 20% ring | Spinner | Opacity 0.45 |
| Cart line row | `--bg-glass` | `hover-row` utility (already exists) | Outline on focus-within | n/a | n/a |
| Payment method pill (selected) | `--accent` border + 10% accent bg | n/a (it's selected) | 3px ring | n/a | Show tooltip "Stripe not configured" if Card pill disabled |
| `glass-input` for money | Border-left `--accent` (already wired) | n/a | Focus ring already wired | n/a | Read-only styling already wired |
| Stripe `PaymentElement` (iframe) | Stripe-rendered, use `appearance.theme: 'night'` (dark) / `'stripe'` (light) — switch on `[data-theme]` | Stripe-controlled | Stripe-controlled | Stripe-controlled | Stripe-controlled |
| Refund dialog row checkbox | Empty checkbox, `--border-default` | Border `--border-strong` | 3px ring | Checked: `--accent` fill | Already-refunded lines: disabled + line-through |

---

## Accessibility Floor

- All interactive elements meet 44px touch target on coarse pointers (already enforced via `@media (pointer: coarse)` in globals.css).
- All icon-only buttons require `aria-label`.
- Color is never the sole carrier of state — every status pill pairs color with text label (e.g., "Paid" + green, not just green).
- Stripe Elements styling MUST preserve Stripe's built-in focus rings and high-contrast field labels (do not flatten via `appearance.rules` overrides that remove outlines).
- Money inputs use `aria-describedby` to link the input to its helper text (e.g., "Cash tendered" helper links to "Change due" computed value).
- Drawer close: ESC key + visible X button (44px) + backdrop click. Trap focus inside drawer while open (existing pattern from `AppointmentDetailDrawer`).
- Error banners use `role="alert"` for screen readers.
- Form errors appear inline beneath the field with `aria-invalid="true"` on the input.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | not applicable | not applicable — project does not use shadcn CLI; no `components.json` exists |
| Third-party shadcn registries | none declared | not applicable |
| Stripe Elements (`@stripe/react-stripe-js`) | `<Elements>`, `<PaymentElement>` | vetted — official Stripe SDK; security model is PCI-DSS SAQ-A (card data never touches our server); installed as standard npm dep, not a registry block |
| Radix primitives (via `tailwindcss-animate`) | Popover (DiscountPopover), Dialog (confirmations) | vetted — already in `package.json` from prior phases; not a registry block |
| lucide-react icons | All POS icons | vetted — already in `package.json` from prior phases |
| Reportlab (server PDF) | n/a (server-side, not a UI registry) | n/a |
| Postmark React Email (`@react-email/components`) | Receipt email template | vetted — already in `package.json` from Phase 12 |

**No third-party shadcn registries declared. The shadcn vetting gate is not applicable for Phase 15.**

---

## Phase-Specific UI Patterns (notes for executor)

These are not new tokens — they are decisions about how to compose the existing tokens. Captured here so the executor doesn't re-decide mid-implementation.

### `/pos` page layout

```
+--------------------------------------------------------------------------+
| TopNav (existing)                                                        |
+--------------------------------------------------------------------------+
| Page header: "Point of Sale" + patient chip + sale-status badge          |
+--------------------------------------------------+-----------------------+
| Cart (60% width on lg+)                          | Payment panel (40%)   |
| .glass-card                                      | .glass-card           |
|                                                  |                       |
| Prefill bar:                                     | Payment method pills: |
|   [Search patient] [Add Superbill] [Add Order]   | [Cash][Card]          |
|   [Add product] [Add custom line]                | [External][Write-off] |
|                                                  |                       |
| Cart lines table (sticky header):                | Active form           |
|   description / qty / unit / discount / total    |   (varies per method) |
|   (each row: hover-row, click to edit qty/disc)  |                       |
|                                                  | Totals stack:         |
| Discount summary row                             |   Subtotal $X.XX      |
| Subtotal/tax preview row                         |   Discount -$X.XX     |
|                                                  |   Tax     $X.XX       |
|                                                  |   Total   $X.XX       |
|                                                  |   ---                 |
|                                                  |   Amount remaining    |
|                                                  |     $X.XX             |
|                                                  |                       |
|                                                  | [Add payment] (if    |
|                                                  |   split tender)       |
|                                                  | [Close sale]          |
|                                                  |   (disabled until     |
|                                                  |    remaining == 0)    |
+--------------------------------------------------+-----------------------+
```

- Cart pane: scrolls internally if many lines; payment pane stays sticky.
- Mobile (`< lg`): payment pane stacks on top, cart below. The "Close sale" CTA becomes a sticky bottom bar (use `var(--bg-bottom-bar)` and the existing bottom-bar pattern from `EncounterBottomTabs.tsx`).

### Receipt delivery prompt

Modal appears after successful Sale.close. Three large buttons (44px+ touch target):
```
+----------------------------------+
| Sale closed — $X.XX             |
| Receipt #R-20260528-0042         |
+----------------------------------+
| [ Print receipt ] (primary)      |
| [ Email receipt ] (secondary)    |
| [ Print and email ] (secondary)  |
| [ Skip ] (text-only link)        |
+----------------------------------+
```
- If email selected, prefills `patient.email`; staff may override before send.
- Closing the modal (X or backdrop) skips both — receipt remains downloadable later from Patient > Payments tab.

### Refund dialog (480px right-slide drawer)

- Item picker: each `SaleLineItem` rendered as a row with checkbox + qty stepper (defaults to full qty). Already-refunded lines are disabled with the refunded qty shown.
- Live preview: `Refund total: $X.XX` updates as items are selected, rendered in `.text-display` with `--state-critical` color.
- Reason: required `<textarea>` (200-char min length 3). Helper text: "Shows up on the audit log and refund receipt."
- Confirm button at footer: `Issue refund — $X.XX` (destructive). Disabled until at least one item is selected AND reason length >= 3.
- After confirm: triggers Refund receipt prompt (same shape as sale-close prompt).

### Daily-close page layout

```
+--------------------------------------------------------------------------+
| Page header: "Close of day" + date picker (default today)               |
+--------------------------------------------------------------------------+
| Section 1: Sales summary (4 KPI cards in a row)                          |
|   Sales count | Gross | Refunds out | Net                                |
+--------------------------------------------------------------------------+
| Section 2: By payment method (table)                                     |
|   Cash | Stripe card | External card | Write-off | Refund returned       |
+--------------------------------------------------------------------------+
| Section 3: By category (table)                                           |
|   Clinical | Retail | Optical                                            |
+--------------------------------------------------------------------------+
| Section 4: Cash reconciliation (.glass-card-accent)                      |
|   Expected cash: $X.XX (computed, read-only mono)                        |
|   Counted cash:  [____________] (text input, inputMode="decimal")        |
|   Variance:      $X.XX (state-normal if 0, critical if <0, normal if >0) |
|   Optional notes textarea                                                |
|   [Save and close day] (primary CTA)                                     |
+--------------------------------------------------------------------------+
| Section 5 (optional): Stripe payout estimate                             |
+--------------------------------------------------------------------------+
| Footer: [Export PDF] [Export CSV] (both secondary)                       |
+--------------------------------------------------------------------------+
```

- OWNER + ADMIN only. Sidebar link gated; page-level entitlement + role guard.
- Save and close day → POST records `DailyCloseRun` with counted/expected/variance. Variance enforcement: not blocked, but captured for audit.
- Historical dates: read-only mode — totals shown, no "Save" button (a date can only be closed once; subsequent runs are read-only views).

### Admin > POS Payments card

Lives inside `/admin` next to other settings cards. OWNER-only — hidden for ADMIN per CONTEXT §I `MANAGE_PAYMENT_CONFIG`.

- Three `glass-input` fields: Publishable key, Secret key, Webhook signing secret.
- Visible-state behavior: when keys exist, fields show `pk_test_…last4` / `sk_***encrypted***` placeholders (NEVER decrypt to FE). To replace, staff types the new key in plain.
- "Test webhook" button (optional V2 polish) — sends a synthetic event via Stripe SDK to verify reachability.
- Save triggers the destructive-confirmation pattern (see Copywriting §Destructive confirmations — "Rotate Stripe keys").
- Inline validation on key format (regex `^pk_(test|live)_[A-Za-z0-9]+$` for publishable; analogous for secret/webhook).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
