---
phase: 15
slug: point-of-sale
type: baa-checkpoint
status: deferred
decided: 2026-05-27
decided_by: Duy Tran
---

# Phase 15 — BAA HIPAA Checkpoint

## Decision: **Deferred to first production-tenant onboarding**

No production tenant is being onboarded for the Phase 15 pilot milestone. Phase 15 is built and verified against a **testmode-only dev tenant** using Stripe test API keys. Postmark sandbox/test domains.

This checkpoint must be re-opened and signed before any **production** clinic configures Stripe payment processing.

---

## Re-open trigger

Re-open this checkpoint before the first of:

- A production tenant enters their live `sk_live_*` Stripe secret key via `/admin/payment-config/`
- A production tenant has Postmark configured with a verified, non-sandbox domain
- The first real-money transaction is processed through `Sale → Payment(method='stripe_card')`

---

## What must be verified at re-open

| # | Verification | Owner |
|---|--------------|-------|
| 1 | Postmark BAA active for ClarityOS (Phase 12 BAA covers transactional email — confirm still in force) | Compliance |
| 2 | Stripe scoping decision documented in `15-CONTEXT.md` addendum: PaymentElement iframe keeps Stripe out of PHI scope; merchant handles PHI in own ledger; Stripe does NOT sign HIPAA BAAs | Eng + Compliance |
| 3 | Phase 10.3 PHI scrubber deny-list confirmed to cover `STRIPE_KEYS_UPDATED` + `STRIPE_WEBHOOK_RECEIVED` audit metadata fields (only Stripe IDs `pi_xxx`/`evt_xxx`/`ch_xxx` — never card numbers, PANs, or full patient names) | Eng |
| 4 | Signed acceptance recorded on this file (`status: approved`, `decided_by`, `decided` date) | Owner |

---

## Testmode constraints active until re-open

- Production deploy must keep `STRIPE_API_VERSION` pinned and `PAYMENTS_FERNET_KEY` blank in any non-test env
- `payment-config` endpoint must hard-block `sk_live_*` keys until this checkpoint flips to `approved`
- E2E suite uses Stripe test cards (`4242 4242 4242 4242` + friends); webhook handler dispatches via Stripe CLI forwarding only

---

*Deferred 2026-05-27 — pilot launch milestone is testmode-only.*
