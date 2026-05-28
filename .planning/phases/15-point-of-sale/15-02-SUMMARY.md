---
phase: 15-point-of-sale
plan: 02
subsystem: payments
tags: [stripe, fernet, payment-processor, protocol, abstraction, encryption, tdd]

requires:
  - phase: 15-00-wave0-foundation
    provides: stripe + cryptography deps installed; Wave-0 skip-stubs for test_payments_crypto, test_processor_protocol, test_stripe_processor
  - phase: 15-01-schema-orm
    provides: Tenant.stripe_secret_key_encrypted + Tenant.stripe_webhook_secret_encrypted + Payment.processor_payment_id columns

provides:
  - PaymentProcessor runtime_checkable Protocol with 4 methods (create_payment_intent, confirm_payment, refund_payment, verify_webhook_signature)
  - 4 frozen dataclasses (ProcessorIntent, ProcessorPayment, ProcessorRefund, WebhookEvent)
  - PaymentProcessorError + get_processor(name) factory
  - StripeProcessor — only shipped adapter, ONLY place backend imports `stripe`
  - Fernet encrypt_secret/decrypt_secret/rotate_secret with MultiFernet rotation support
  - PAYMENTS_FERNET_KEY + PAYMENTS_FERNET_KEY_PREVIOUS + STRIPE_API_VERSION on Settings

affects:
  - 15-04-sale-cart-payment-routes (consumes get_processor(); create_payment_intent on stripe_card payments)
  - 15-05-refunds (consumes StripeProcessor.refund_payment for Stripe-originated refunds)
  - 15-08-webhooks-admin-bff (consumes verify_webhook_signature; encrypts admin-submitted secrets via encrypt_secret)

tech-stack:
  added: []
  patterns:
    - "Per-call decryption — `decrypt_secret(tenant.stripe_secret_key_encrypted)` per request, never cached on instance"
    - "Abstraction barrier enforced by grep acceptance criterion — `import stripe` ONLY in stripe_processor.py"
    - "Server-authoritative status via PaymentIntent.retrieve (never trust client-reported status)"
    - "Idempotency keys per (sale, attempt) prevent double-charge on retry"
    - "tenant_id always injected into Stripe metadata (webhook handler reads it for tenant lookup)"
    - "Pinned STRIPE_API_VERSION on every create call to lock pricing/refund response shape"
    - "MultiFernet transition window — set PAYMENTS_FERNET_KEY_PREVIOUS to old key during rotation; clear after rotate_secret() runs over every Tenant row"
    - "Loud RuntimeError on missing PAYMENTS_FERNET_KEY (no silent plaintext fallback)"

key-files:
  created:
    - backend/services/payments/__init__.py
    - backend/services/payments/base.py
    - backend/services/payments/crypto.py
    - backend/services/payments/stripe_processor.py
    - .planning/phases/15-point-of-sale/15-02-SUMMARY.md
  modified:
    - backend/core/config.py
    - backend/tests/test_payments_crypto.py
    - backend/tests/test_processor_protocol.py
    - backend/tests/test_stripe_processor.py

key-decisions:
  - "runtime_checkable Protocol over ABC — structural typing lets StripeProcessor satisfy the seam without inheritance; future Square/Helcim adapters just implement the 4 methods"
  - "Per-call decryption (not cached on StripeProcessor instance) — credentials never live in memory across requests, reducing blast radius if a process dump leaks"
  - "Errors → RuntimeError(\"Tenant payment secret unreadable\") instead of InvalidToken — masks crypto internals, points operator to Admin UI"
  - "get_processor() factory enforces single entry point — adding 'square' is a one-line if-branch, not a refactor"
  - "Idempotency key pattern `sale-{sale_id}-{attempt}` — allows retry without double-creating PaymentIntent; attempt counter lives in caller (routes)"

patterns-established:
  - "Pattern: every payment-related code path imports from backend.services.payments — NEVER `import stripe` directly outside stripe_processor.py"
  - "Pattern: tenant_id mandatory in Stripe metadata — webhook handler uses it for tenant lookup before signature verification"
  - "Pattern: Fernet ciphertext detection via `gAAAA` prefix — round-trip test asserts this anchor"

requirements-completed: [POS-07, POS-08]

duration: 16 min
completed: 2026-05-28
---

# Phase 15 Plan 02: Payment Processor + Crypto Summary

**PaymentProcessor Protocol seam with StripeProcessor adapter, plus per-tenant Fernet credential encryption — payment-routes can now create PaymentIntents and verify webhooks without ever importing `stripe` directly.**

## Performance

- **Duration:** 16 min
- **Tasks:** 2 (both TDD)
- **Files modified:** 8 (4 new source + 4 test files)
- **Tests:** 18 green (6 crypto + 4 protocol + 8 stripe processor)

## Accomplishments
- Fernet encrypt/decrypt/rotate helpers with MultiFernet rotation transition window
- Loud RuntimeError when PAYMENTS_FERNET_KEY missing (no silent plaintext fallback)
- runtime_checkable PaymentProcessor Protocol + 4 frozen dataclasses
- StripeProcessor as the single Stripe-touching surface in the backend
- Abstraction barrier verified by grep acceptance criterion: `import stripe` appears ONLY in stripe_processor.py
- Per-call decryption of tenant.stripe_secret_key_encrypted — never cached on instance, never logged
- Server-authoritative status via PaymentIntent.retrieve (Pitfall 2 from RESEARCH)
- Idempotency keys + automatic_payment_methods + pinned STRIPE_API_VERSION on every PaymentIntent.create

## Task Commits

1. **Task 1: Fernet crypto + config wiring** — `fca8812` (feat)
2. **Task 2: PaymentProcessor + StripeProcessor** — `49ac918` (feat)

## Files Created/Modified
- `backend/core/config.py` — PAYMENTS_FERNET_KEY, PAYMENTS_FERNET_KEY_PREVIOUS, STRIPE_API_VERSION
- `backend/services/payments/__init__.py` — package marker (intentionally empty to avoid circular imports)
- `backend/services/payments/crypto.py` — encrypt_secret / decrypt_secret / rotate_secret + _build_fernet (MultiFernet rotation)
- `backend/services/payments/base.py` — PaymentProcessor Protocol + 4 dataclasses + get_processor factory + PaymentProcessorError
- `backend/services/payments/stripe_processor.py` — StripeProcessor implementing the Protocol
- `backend/tests/test_payments_crypto.py` — 6 tests (round-trip, mangled, empty key, empty plaintext, rotation, rotate-and-clear)
- `backend/tests/test_processor_protocol.py` — 4 tests (methods exist, Protocol satisfied, factory resolves stripe, rejects unknown)
- `backend/tests/test_stripe_processor.py` — 8 tests (class, intent metadata + cents + APM + idempotency, retrieve confirms server-side, missing key, refund requires intent id, refund cents, webhook construct_event, missing webhook secret)

## Decisions Made
- Per-call decryption (not cached) — credentials never live in process memory across requests
- runtime_checkable Protocol over ABC — structural typing matches existing codebase conventions
- RuntimeError on tampered ciphertext (not InvalidToken bubble) — keeps crypto internals out of HTTP responses

## Deviations from Plan

None - plan executed exactly as written.

Minor: docstring originally referenced `payment_method_types` by name; rephrased to "deprecated allow-list NOT used" so that `grep -c payment_method_types` returns 0 per the acceptance criterion. No behavior change.

## Issues Encountered
None.

## User Setup Required
None — generation of the Fernet master key + Stripe testmode keys is documented in `.env.example` (added in Plan 15-00). Operator setup happens at deploy time, not in code.

## Next Phase Readiness
- Ready for Plan 15-03 (schemas + sale-lifecycle service): Pydantic schemas + types/sales.ts can now reference ProcessorIntent / ProcessorPayment shapes without coupling to stripe SDK types
- Ready for Plan 15-04 (sale-cart-payment-routes): payment-recording flow can call `get_processor().create_payment_intent(...)` and `confirm_payment(...)` from inside the primary DB TXN
- Ready for Plan 15-08 (webhooks + admin BFF): `encrypt_secret` available for admin form, `verify_webhook_signature` available for webhook route

---
*Phase: 15-point-of-sale*
*Completed: 2026-05-28*
