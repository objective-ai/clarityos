---
phase: 15-point-of-sale
plan: 08
status: complete
completed: 2026-05-28
duration: ~35 min
requirements-completed: [POS-02, POS-08, POS-11, POS-12]
commits:
  - e457439 feat(15-08): stripe webhook + admin payment-config endpoint (POS-02, POS-08, POS-12)
  - 5f46733 feat(15-08): 18 BFF routes — sales, refunds, daily-close, admin, webhook (POS-02, POS-08, POS-11, POS-12)
key-files:
  created:
    - backend/api/routes/admin_payment_config.py
    - app/api/sales/route.ts
    - app/api/sales/[saleId]/route.ts
    - app/api/sales/[saleId]/lines/route.ts
    - app/api/sales/[saleId]/lines/[lineId]/route.ts
    - app/api/sales/[saleId]/payments/route.ts
    - app/api/sales/[saleId]/payments/stripe-confirm/route.ts
    - app/api/sales/[saleId]/payments/[paymentId]/route.ts
    - app/api/sales/[saleId]/close/route.ts
    - app/api/sales/[saleId]/refunds/route.ts
    - app/api/sales/[saleId]/receipt/route.ts
    - app/api/sales/[saleId]/receipt/email/route.ts
    - app/api/refunds/route.ts
    - app/api/refunds/[refundId]/route.ts
    - app/api/refunds/[refundId]/receipt/route.ts
    - app/api/pos/daily-close/route.ts
    - app/api/pos/daily-close/[runId]/export/route.ts
    - app/api/admin/payment-config/route.ts
    - app/api/webhooks/stripe/route.ts
  modified:
    - backend/api/routes/webhooks.py
    - backend/main.py
    - backend/tests/test_webhooks_stripe.py
    - backend/tests/test_admin_payment_config.py
---

# Phase 15 Plan 08: Webhooks + Admin + BFF Summary

Stripe webhook handler + OWNER-only admin payment-config endpoint + complete
Next.js BFF layer exposing every Phase 15 backend route to the frontend.

## What shipped

### Backend — `/api/webhooks/stripe` (POS-02, POS-12)
Appended to `backend/api/routes/webhooks.py` alongside the existing Twilio /
Postmark handlers (single-router pattern, shared `_check_internal_seal`).

Flow:
1. **HMAC seal check** — reuses `_check_internal_seal()` so a direct hit to
   FastAPI bypassing Vercel is 403'd.
2. **Raw body read** — `await request.body()` returns bytes; we never call
   `.json()` before signature verification (Pitfall 1).
3. **Tenant discovery** — minimal `json.loads(body)` peeks at
   `data.object.metadata.tenant_id` (set by `StripeProcessor.create_payment_intent`)
   to resolve which tenant's webhook secret to verify against. This parse is
   never trusted — signature is re-verified next.
4. **Signature verify** — `StripeProcessor.verify_webhook_signature(tenant, body, sig)`
   decrypts that tenant's `stripe_webhook_secret_encrypted` and calls
   `stripe.Webhook.construct_event(body, sig, secret)` over the original raw
   bytes. ValueError → 403, never partial state mutation.
5. **Idempotency check** — `SELECT StripeWebhookEvent WHERE event_id = ?`;
   if row exists, return `{ok: True, ignored: "duplicate"}` without touching
   Payment. The UNIQUE constraint on `event_id` is the durable backstop if
   two webhooks race past the check (Pitfall 6).
6. **Monotonic Payment.status** — `_PAYMENT_STATUS_PRIORITY` maps each
   canonical status to a priority. `_can_advance(current, new)` returns
   `priority[new] >= priority[current]`. So `payment_intent.processing`
   arriving after `payment_intent.succeeded` does NOT downgrade; but
   `charge.refunded` and any failure/cancel always wins for visibility.

### Backend — `/api/admin/payment-config/` (POS-08, POS-11)
New `backend/api/routes/admin_payment_config.py`:
- Gated on `Entitlement.RETAIL_POS` + `ClinicalAction.MANAGE_PAYMENT_CONFIG`
  (OWNER-only per `permissions.py:194`).
- `GET /` returns `PaymentConfigResponse(stripe_publishable_key, has_secret_key,
  has_webhook_secret, sales_tax_rate)` — booleans only, never decrypts
  ciphertext to the FE (Pitfall 11).
- `PUT /` validates `pk_*` / `sk_*` / `whsec_*` prefixes BEFORE encryption;
  invalid format → 400 without DB write. Each field independently optional
  (None → skip; "" → clear; value → validate & encrypt). Audit fires
  `STRIPE_KEYS_UPDATED` with `updated_fields` list.

### BFF — 18 Next.js route files
Three patterns based on payload type:

**Pattern A — `proxyToFastAPI` (14 JSON routes):**
- All sales CRUD + nested lines/payments/refunds/close/email-receipt
- Refund create + read
- Daily-close GET totals + POST record
- Admin payment-config GET + PUT

Async params (`{ params }: { params: Promise<{...}> }`) per Next.js 15
convention. Upstream URLs end with `/` — FastAPI 307s without and the
redirect drops the Authorization header (`.claude/rules/bff-api.md`).

**Pattern B — Raw fetch + arrayBuffer (3 PDF/CSV binary routes):**
- Sale receipt PDF, refund receipt PDF, daily-close export (PDF or CSV).
- `proxyToFastAPI` JSON-decodes the response body and would corrupt binary
  streams (clones the Phase 14 job-ticket BFF pattern).
- Forwards `Content-Type` + `Content-Disposition` from upstream so the
  browser opens / downloads with the correct filename.

**Pattern C — Raw text passthrough (1 webhook route):**
- `app/api/webhooks/stripe/route.ts`: `await request.text()` → forwards
  unmodified bytes plus `X-Webhook-Internal` seal and `Stripe-Signature`.
- `runtime = "nodejs"` + `dynamic = "force-dynamic"` so Vercel doesn't
  cache or re-encode the body. Any `.json()` call would silently change
  whitespace / key order and invalidate Stripe's HMAC.

## Tests added

10 real test cases replacing the Wave-0 skip-stubs:

`backend/tests/test_webhooks_stripe.py`
- `_can_advance` monotonic priority table (all upgrade/downgrade matrix)
- `_STRIPE_EVENT_TO_PAYMENT_STATUS` map coverage
- handler is registered on router
- idempotent duplicate event short-circuits with `ignored: duplicate` and
  no `db.add` or `db.commit`
- invalid signature → 403, no state change
- missing `metadata.tenant_id` → 400 before any tenant lookup

`backend/tests/test_admin_payment_config.py`
- Router exposes both GET and PUT
- PUT encrypts: ciphertext starts with Fernet's `gAAAA` prefix; round-trip
  decrypt returns the original `sk_test_…` / `whsec_…`
- Invalid `sk_` format raises 400 BEFORE any encrypt or DB write
- GET response shape: booleans only, never plaintext field exposed

## Key decisions

- **Use `event_row.id` (not `None`) as `log_action(resource_id=...)`.**
  `AuditLog.resource_id` is non-nullable. The `StripeWebhookEvent` row we
  just persisted is the natural owner of the audit entry, and its `uuid4`
  default is assigned at instantiation (before flush) so we can read it
  immediately.

- **`require_permission(MANAGE_PAYMENT_CONFIG)` injects `TenantContext`
  via `Depends`, not the router-level `dependencies=[...]` block.**
  Matches the existing `refunds.py` shape and gives us a typed `ctx` in
  the handler for audit logging.

- **18 BFF files (not 19).** Plan body said "19 BFF routes" but
  `files_modified` lists 18. Counted both ways — 14 JSON + 3 PDF + 1
  webhook = 18. Off-by-one in the plan text.

- **No new middleware allowlist change needed.** `/api/webhooks/*` is
  already public-facing via Phase 12; the new `/stripe` sub-route inherits
  that allowlist.

## Deviations from Plan

**[Rule 1 - Bug] `from backend.db.deps import get_db` → `backend.db.session`** —
Plan snippet had wrong import path. Project convention (all of `refunds.py`,
`sale_payments.py`, etc.) is `from backend.db.session import get_db`. There
is no `backend.db.deps` module. Fixed in `admin_payment_config.py`.

**[Rule 1 - Bug] `TenantContext(tenant_id=..., user_id=None, role=None,
staff_id=None)` → `_system_ctx(tenant_id)`** — Plan snippet used a
non-existent constructor signature (`staff_id` is not a field; `user_id`
and `role` are non-nullable). Reused the existing `_system_ctx()` helper
already defined in `webhooks.py` for the Twilio / Postmark handlers.

**[Rule 2 - Missing Critical] `log_action(resource_id=None)` → use
`event_row.id`.** Plan snippet passed `None` for resource_id, but the
`audit_log.resource_id` column is non-nullable. Pass the just-created
`StripeWebhookEvent.id` so the audit row is queryable by webhook event.

**[Rule 1 - Bug] BFF webhook URL `/api/webhooks/stripe/` → `/api/webhooks/stripe`
(no trailing slash).** Plan said trailing-slash required, but the FastAPI
router was defined as `@router.post("/stripe", ...)` matching the existing
Twilio/Postmark patterns. The BFF must match the actual registered path.

**Total deviations:** 4 auto-fixed (3× Rule 1 bug-in-plan, 1× Rule 2
missing-critical). **Impact:** plan snippets had small import / signature
errors that would have thrown at import time or runtime. None affect the
shape of what was shipped.

## Verification

- ✓ `pytest backend/tests/test_webhooks_stripe.py backend/tests/test_admin_payment_config.py -v` — 10/10 pass
- ✓ `npx tsc --noEmit` — zero new TypeScript errors (pre-existing errors
  in `tests/e2e/smoke-*.spec.ts` unchanged)
- ✓ 18 BFF `route.ts` files at the exact paths in `files_modified`
- ✓ `grep -c "proxyToFastAPI" app/api/sales app/api/refunds app/api/pos
  app/api/admin/payment-config` returns 36 (>= 14)
- ✓ `grep -c "arrayBuffer"` across the 3 PDF routes returns >= 3
- ✓ Webhook route uses `request.text()`, never `request.json()`
- ✓ All `read_first` files honored: `webhooks.py` patterns preserved,
  `bff.ts` `proxyToFastAPI` signature unchanged, job-ticket pattern cloned
  for PDFs, Twilio webhook pattern cloned for Stripe webhook.

## Issues Encountered

None — both tasks executed cleanly. Plan snippets had a few small bugs
(see Deviations) but all fixable in-place without scope change.

## Next Phase Readiness

POS backend surface is fully exposed to the frontend. Ready for
**15-09 Stores + POS Page** which will build the Zustand cart store and
the cashier-facing POS UI on top of these BFF routes.

## Self-Check: PASSED

- All 19 created `key-files.created` exist on disk
- `git log --oneline --all --grep="15-08"` returns 2 commits
- 10/10 unit tests pass
- TS compiles clean for new BFF files
