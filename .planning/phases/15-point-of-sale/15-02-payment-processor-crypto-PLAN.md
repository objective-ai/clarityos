---
phase: 15-point-of-sale
plan: 02
type: execute
wave: 3
depends_on: [15-01]
files_modified:
  - backend/services/payments/__init__.py
  - backend/services/payments/base.py
  - backend/services/payments/crypto.py
  - backend/services/payments/stripe_processor.py
  - backend/core/config.py
autonomous: true
requirements: [POS-07, POS-08]

must_haves:
  truths:
    - "PaymentProcessor Protocol defined with 4 async methods + 4 dataclasses (ProcessorIntent, ProcessorPayment, ProcessorRefund, WebhookEvent)"
    - "StripeProcessor implements PaymentProcessor and is the ONLY place backend imports `stripe` directly"
    - "Fernet encrypt_secret/decrypt_secret round-trips correctly; ciphertext begins `gAAAA`"
    - "MultiFernet rotation supported (decrypts with old key while encrypting with new)"
    - "PAYMENTS_FERNET_KEY missing → backend startup fails LOUD (RuntimeError on first use, not silent fallback)"
    - "Stripe API key is `decrypt_secret(tenant.stripe_secret_key_encrypted)` per call — NEVER cached, NEVER logged"
  artifacts:
    - path: "backend/services/payments/base.py"
      provides: "PaymentProcessor Protocol + 4 dataclasses + get_processor() factory"
      contains: "class PaymentProcessor(Protocol)"
    - path: "backend/services/payments/crypto.py"
      provides: "encrypt_secret/decrypt_secret + MultiFernet rotation"
      contains: "def encrypt_secret"
    - path: "backend/services/payments/stripe_processor.py"
      provides: "StripeProcessor — PaymentIntent.create/retrieve + Refund.create + Webhook.construct_event"
      contains: "class StripeProcessor"
    - path: "backend/core/config.py"
      provides: "PAYMENTS_FERNET_KEY + STRIPE_API_VERSION settings"
      contains: "PAYMENTS_FERNET_KEY"
  key_links:
    - from: "StripeProcessor.create_payment_intent"
      to: "Tenant.stripe_secret_key_encrypted"
      via: "decrypt_secret per call"
      pattern: "decrypt_secret\\(tenant\\.stripe_secret_key_encrypted\\)"
    - from: "StripeProcessor.create_payment_intent"
      to: "Stripe metadata.tenant_id"
      via: "always set metadata['tenant_id']"
      pattern: "tenant_id.*metadata"
    - from: "Anywhere in backend that does payments"
      to: "get_processor()"
      via: "factory function — NEVER `import stripe` outside stripe_processor.py"
      pattern: "get_processor\\("
---

<objective>
Build the payment-processor seam: PaymentProcessor Protocol + StripeProcessor adapter + Fernet credential-encryption helpers. This is the abstraction barrier — every other plan that does anything payment-related (routes, webhook, refund) imports from `backend.services.payments` and NEVER imports `stripe` directly.

Purpose: future processors (Square, Helcim) drop in as new adapters; per-tenant Stripe secrets never touch disk in plaintext; backend fails loud when PAYMENTS_FERNET_KEY missing (no silent fallback).

Output: `pytest backend/tests/test_processor_protocol.py backend/tests/test_payments_crypto.py backend/tests/test_stripe_processor.py` all GREEN.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@.planning/phases/15-point-of-sale/15-RESEARCH.md
@backend/core/config.py
@backend/db/models/public/saas.py
@backend/db/models/tenant/clinical.py
@backend/tests/conftest.py

<interfaces>
<!-- Existing config Settings pattern -->
```python
# backend/core/config.py
class Settings(BaseSettings):
    SECRET_KEY: str
    SUPABASE_JWT_SECRET: str
    # ... etc.
```
Pattern: load via pydantic-settings, fail at instantiation if required field missing.

<!-- Existing payment in clinical.py from Plan 15-01 -->
```python
class Payment(TimestampMixin, TenantBase):
    sale_id: UUID
    method: PaymentMethod  # cash | stripe_card | external_card | write_off
    amount: Decimal
    processor_payment_id: str | None  # pi_xxx
    processor_charge_id: str | None   # ch_xxx
    last4: str | None
    card_brand: str | None
    status: PaymentStatus  # pending | succeeded | failed | refunded | partial_refund
```

<!-- Stripe SDK 15.2.0 surface -->
```python
import stripe
stripe.PaymentIntent.create(api_key, amount, currency, automatic_payment_methods, metadata, idempotency_key)
stripe.PaymentIntent.retrieve(intent_id, api_key)
stripe.Refund.create(payment_intent, amount, api_key)
stripe.Webhook.construct_event(payload: bytes, sig_header: str, secret: str)
```

<!-- Fernet 46.x surface -->
```python
from cryptography.fernet import Fernet, MultiFernet, InvalidToken
Fernet.generate_key() -> bytes
fernet = Fernet(key_bytes_or_str)
fernet.encrypt(b"plaintext") -> b"gAAAAA..."
fernet.decrypt(ciphertext) -> b"plaintext"  # raises InvalidToken on tamper/wrong-key

# Rotation:
multi = MultiFernet([Fernet(new_key), Fernet(old_key)])
multi.encrypt(data)   # uses first key
multi.decrypt(data)   # tries all keys in order
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add PAYMENTS_FERNET_KEY + STRIPE_API_VERSION to Settings; implement crypto.py (Fernet encrypt/decrypt + MultiFernet rotation) with TDD</name>
  <files>backend/core/config.py, backend/services/payments/__init__.py, backend/services/payments/crypto.py</files>
  <read_first>
    - backend/core/config.py (full file — see how SECRET_KEY is required-but-not-loud-at-import; mirror that for PAYMENTS_FERNET_KEY)
    - backend/tests/test_payments_crypto.py (Wave-0 skip-stub from Plan 15-00 — read existing assertions to honor)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pattern 1 (Fernet code example)
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pitfall 5 (master-key-loss horror story)
  </read_first>
  <behavior>
    - encrypt_secret("sk_test_abc") returns base64 string starting with "gAAAA" (Fernet ciphertext prefix)
    - decrypt_secret(encrypt_secret("sk_test_abc")) == "sk_test_abc" — round-trip
    - decrypt_secret with mangled ciphertext raises RuntimeError with helpful message ("Tenant payment secret unreadable — re-enter in Admin > POS Payments")
    - When PAYMENTS_FERNET_KEY is empty/None, encrypt_secret raises RuntimeError("PAYMENTS_FERNET_KEY must be set") — NOT silent fallback to plaintext
    - MultiFernet rotation: encrypt with new key, decrypt with old key still works during transition window
    - rotate_secret(ciphertext, old_keys=[...]) re-encrypts using current key
  </behavior>
  <action>
    Two concrete files.

    **A. `backend/core/config.py`** — extend `Settings` class:
    ```python
        PAYMENTS_FERNET_KEY: str = ""
        # Optional comma-separated previous keys for MultiFernet rotation transition window:
        PAYMENTS_FERNET_KEY_PREVIOUS: str = ""
        STRIPE_API_VERSION: str = "2026-03-25.dahlia"
    ```
    Do NOT validate-at-import (we want test environments where PAYMENTS_FERNET_KEY is blank to still IMPORT, just fail at first encrypt/decrypt call).

    **B. `backend/services/payments/__init__.py`** — empty file (package marker only; do NOT re-export to avoid circular imports).

    **C. `backend/services/payments/crypto.py`:**
    ```python
    """Per-tenant secret encryption via Fernet (AES-128-CBC + HMAC-SHA256).

    POS-08: Stripe secret keys MUST never hit disk in plaintext. Master key lives in
    `settings.PAYMENTS_FERNET_KEY` env var; generate once per environment via
    `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.

    ROTATION (per RESEARCH Pitfall 5): never rotate without MultiFernet transition window.
    Set PAYMENTS_FERNET_KEY = new key and PAYMENTS_FERNET_KEY_PREVIOUS = old key during
    transition; existing ciphertexts decrypt with old, new writes use new. After re-encryption
    pass via `rotate_secret()` on every Tenant, clear PAYMENTS_FERNET_KEY_PREVIOUS.
    """
    from __future__ import annotations
    from cryptography.fernet import Fernet, MultiFernet, InvalidToken
    from backend.core.config import settings

    def _build_fernet() -> MultiFernet:
        if not settings.PAYMENTS_FERNET_KEY:
            raise RuntimeError(
                "PAYMENTS_FERNET_KEY must be set — generate via "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        keys = [Fernet(settings.PAYMENTS_FERNET_KEY.encode())]
        if settings.PAYMENTS_FERNET_KEY_PREVIOUS:
            for prev in settings.PAYMENTS_FERNET_KEY_PREVIOUS.split(","):
                prev = prev.strip()
                if prev:
                    keys.append(Fernet(prev.encode()))
        return MultiFernet(keys)

    def encrypt_secret(plaintext: str) -> str:
        if not plaintext:
            raise ValueError("Cannot encrypt empty secret")
        return _build_fernet().encrypt(plaintext.encode()).decode()

    def decrypt_secret(ciphertext: str) -> str:
        try:
            return _build_fernet().decrypt(ciphertext.encode()).decode()
        except InvalidToken as e:
            raise RuntimeError(
                "Tenant payment secret unreadable — re-enter in Admin > POS Payments"
            ) from e

    def rotate_secret(ciphertext: str) -> str:
        """Decrypt with current MultiFernet, re-encrypt with primary key only."""
        return encrypt_secret(decrypt_secret(ciphertext))
    ```

    Write tests in `backend/tests/test_payments_crypto.py` (REPLACE the Wave-0 skip-stub with real bodies):
    ```python
    import os
    import pytest
    from cryptography.fernet import Fernet

    @pytest.fixture(autouse=True)
    def _set_fernet_key(monkeypatch):
        from backend.core import config
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", Fernet.generate_key().decode())
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", "")

    def test_round_trip():
        from backend.services.payments.crypto import encrypt_secret, decrypt_secret
        ct = encrypt_secret("sk_test_abc123")
        assert ct.startswith("gAAAA")
        assert decrypt_secret(ct) == "sk_test_abc123"

    def test_decrypt_mangled_raises_runtime(monkeypatch):
        from backend.services.payments.crypto import decrypt_secret
        with pytest.raises(RuntimeError, match="Tenant payment secret unreadable"):
            decrypt_secret("gAAAAtotallyMangled")

    def test_empty_key_loud_failure(monkeypatch):
        from backend.core import config
        from backend.services.payments.crypto import encrypt_secret
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", "")
        with pytest.raises(RuntimeError, match="PAYMENTS_FERNET_KEY must be set"):
            encrypt_secret("anything")

    def test_multifernet_rotation_decrypts_with_old(monkeypatch):
        from backend.core import config
        from backend.services.payments.crypto import encrypt_secret, decrypt_secret
        # Encrypt with old key
        old_key = Fernet.generate_key().decode()
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", old_key)
        ct = encrypt_secret("sk_old")
        # Rotate: new is primary, old is fallback
        new_key = Fernet.generate_key().decode()
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", new_key)
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", old_key)
        # Decryption still works
        assert decrypt_secret(ct) == "sk_old"

    def test_rotate_secret_re_encrypts_with_primary(monkeypatch):
        from backend.core import config
        from backend.services.payments.crypto import encrypt_secret, decrypt_secret, rotate_secret
        old_key = Fernet.generate_key().decode()
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", old_key)
        ct_old = encrypt_secret("sk_rotate_me")
        new_key = Fernet.generate_key().decode()
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", new_key)
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", old_key)
        ct_new = rotate_secret(ct_old)
        # Clear old key — decrypts only with new now
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", "")
        assert decrypt_secret(ct_new) == "sk_rotate_me"
    ```
  </action>
  <verify>
    <automated>cd backend && pytest tests/test_payments_crypto.py -v</automated>
  </verify>
  <acceptance_criteria>
    - `pytest backend/tests/test_payments_crypto.py -v` exits 0 with 5 passing tests
    - `python -c "from backend.services.payments.crypto import encrypt_secret, decrypt_secret, rotate_secret; print('ok')"` exits 0
    - `python -c "from backend.core.config import settings; print(settings.STRIPE_API_VERSION)"` prints `2026-03-25.dahlia`
    - `grep -c "PAYMENTS_FERNET_KEY" backend/core/config.py` returns >= 2 (both key + previous)
    - crypto.py file size is between 50 and 200 lines (small, focused)
  </acceptance_criteria>
  <done>Crypto layer ships with TDD; rotation supported; loud failure when key missing.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: PaymentProcessor Protocol + 4 dataclasses + get_processor() factory in base.py; StripeProcessor implementation in stripe_processor.py (with mocked stripe module in tests)</name>
  <files>backend/services/payments/base.py, backend/services/payments/stripe_processor.py</files>
  <read_first>
    - backend/db/models/tenant/clinical.py — Payment + Tenant ORM (need to know fields for type hints)
    - backend/tests/test_processor_protocol.py + backend/tests/test_stripe_processor.py — Wave-0 skip-stubs
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pattern 2 (PaymentProcessor code) + §PaymentIntent Creation code
    - .planning/phases/15-point-of-sale/15-RESEARCH.md §Pitfall 2 (re-fetch with retrieve, never trust client status) + §Pitfall 6 (idempotency key)
  </read_first>
  <behavior>
    PaymentProcessor protocol checks:
    - StripeProcessor satisfies PaymentProcessor (structural typing — `isinstance(p, PaymentProcessor)` works via runtime_checkable)
    - get_processor("stripe") returns a StripeProcessor instance
    - get_processor("unknown") raises ValueError("Unknown processor: unknown")

    StripeProcessor.create_payment_intent:
    - Decrypts tenant.stripe_secret_key_encrypted before calling stripe.PaymentIntent.create
    - Passes `automatic_payment_methods={"enabled": True}` — NEVER `payment_method_types=['card']`
    - Includes `metadata={"tenant_id": str(tenant.id), "sale_id": str(sale_id), ...}` — tenant_id ALWAYS in metadata (needed for webhook tenant lookup, Pitfall 1)
    - Passes `idempotency_key=f"sale-{sale_id}-{attempt}"` for safe retries
    - Converts Decimal → integer cents via `int(quantize_money(amount) * 100)` — never float
    - Returns ProcessorIntent(intent_id, client_secret, amount, currency)

    StripeProcessor.confirm_payment:
    - Calls stripe.PaymentIntent.retrieve(intent_id, api_key=...) — NEVER trusts client-reported status (Pitfall 2)
    - Returns ProcessorPayment with status read from server-side PaymentIntent.status mapping (succeeded/requires_action/processing/canceled → standard set)
    - Reads last4 from `payment_method.card.last4` (nullable safe)

    StripeProcessor.refund_payment:
    - Calls stripe.Refund.create(payment_intent=payment.processor_payment_id, amount=int(quantize_money(amount)*100), api_key=...)
    - Returns ProcessorRefund(refund_id, amount, status)
    - Raises PaymentProcessorError if payment.processor_payment_id is None (cannot refund non-Stripe ledger payments through this path)

    StripeProcessor.verify_webhook_signature:
    - Calls stripe.Webhook.construct_event(body: bytes, sig_header: str, webhook_secret: str)
    - Returns WebhookEvent(event_id, event_type, payment_intent_id, charge_id, raw_payload=dict(event))
  </behavior>
  <action>
    Two concrete files.

    **A. `backend/services/payments/base.py`:**

    ```python
    """PaymentProcessor abstract seam for Phase 15 POS.

    POS-07: every payment-touching code path goes through this interface.
    StripeProcessor is the only shipped adapter; future Square/Helcim adapters
    drop in as new files implementing PaymentProcessor.

    NEVER `import stripe` outside stripe_processor.py.
    """
    from __future__ import annotations
    from dataclasses import dataclass, field
    from decimal import Decimal
    from typing import Protocol, runtime_checkable, TYPE_CHECKING, Any
    from uuid import UUID

    if TYPE_CHECKING:
        from backend.db.models.tenant.clinical import Payment
        from backend.db.models.public.saas import Tenant

    class PaymentProcessorError(Exception):
        """Raised when processor cannot service a request (e.g., tenant lacks keys)."""

    @dataclass(frozen=True)
    class ProcessorIntent:
        intent_id: str
        client_secret: str
        amount: Decimal
        currency: str

    @dataclass(frozen=True)
    class ProcessorPayment:
        intent_id: str
        charge_id: str | None
        last4: str | None
        brand: str | None
        status: str            # "succeeded" | "failed" | "requires_action" | "processing" | "canceled"
        failure_reason: str | None = None

    @dataclass(frozen=True)
    class ProcessorRefund:
        refund_id: str
        amount: Decimal
        status: str            # "succeeded" | "pending" | "failed"

    @dataclass(frozen=True)
    class WebhookEvent:
        event_id: str
        event_type: str
        payment_intent_id: str | None
        charge_id: str | None
        raw_payload: dict[str, Any] = field(default_factory=dict)

    @runtime_checkable
    class PaymentProcessor(Protocol):
        async def create_payment_intent(
            self, tenant: "Tenant", amount: Decimal, currency: str, metadata: dict
        ) -> ProcessorIntent: ...
        async def confirm_payment(
            self, tenant: "Tenant", payment_intent_id: str
        ) -> ProcessorPayment: ...
        async def refund_payment(
            self, tenant: "Tenant", payment: "Payment", amount: Decimal
        ) -> ProcessorRefund: ...
        def verify_webhook_signature(
            self, tenant: "Tenant", body: bytes, signature: str
        ) -> WebhookEvent: ...

    def get_processor(processor_name: str = "stripe") -> PaymentProcessor:
        if processor_name == "stripe":
            from backend.services.payments.stripe_processor import StripeProcessor
            return StripeProcessor()
        raise ValueError(f"Unknown processor: {processor_name}")
    ```

    **B. `backend/services/payments/stripe_processor.py`:**

    ```python
    """Stripe adapter for PaymentProcessor (POS-02, POS-07).

    Per-tenant credentials decrypted at call time (RESEARCH Pattern 1).
    Server-authoritative status via stripe.PaymentIntent.retrieve (Pitfall 2).
    Idempotency keys on every create call (Pitfall 6).
    automatic_payment_methods (NOT payment_method_types) per Pitfall 15.
    """
    from __future__ import annotations
    from decimal import Decimal, ROUND_HALF_EVEN
    from typing import TYPE_CHECKING

    import stripe

    from backend.services.payments.base import (
        PaymentProcessor, ProcessorIntent, ProcessorPayment, ProcessorRefund,
        WebhookEvent, PaymentProcessorError,
    )
    from backend.services.payments.crypto import decrypt_secret
    from backend.core.config import settings

    if TYPE_CHECKING:
        from backend.db.models.tenant.clinical import Payment
        from backend.db.models.public.saas import Tenant

    _CENTS = Decimal("0.01")

    def _to_cents(amount: Decimal) -> int:
        return int(amount.quantize(_CENTS, rounding=ROUND_HALF_EVEN) * 100)

    def _from_cents(cents: int) -> Decimal:
        return (Decimal(cents) / Decimal(100)).quantize(_CENTS, rounding=ROUND_HALF_EVEN)

    # Stripe PaymentIntent.status → our canonical status
    _STATUS_MAP = {
        "succeeded": "succeeded",
        "processing": "processing",
        "requires_action": "requires_action",
        "requires_payment_method": "failed",
        "requires_confirmation": "processing",
        "canceled": "canceled",
    }

    class StripeProcessor:
        """Implements PaymentProcessor Protocol (structural typing)."""

        def _api_key(self, tenant: "Tenant") -> str:
            if not tenant.stripe_secret_key_encrypted:
                raise PaymentProcessorError("Tenant has no Stripe key configured")
            return decrypt_secret(tenant.stripe_secret_key_encrypted)

        async def create_payment_intent(
            self, tenant: "Tenant", amount: Decimal, currency: str, metadata: dict
        ) -> ProcessorIntent:
            api_key = self._api_key(tenant)
            # tenant_id MUST be in metadata — webhook handler reads it for tenant lookup (Pitfall 1)
            full_metadata = {"tenant_id": str(tenant.id), **metadata}
            sale_id = metadata.get("sale_id", "unknown")
            attempt = metadata.get("attempt", 1)
            intent = stripe.PaymentIntent.create(
                api_key=api_key,
                amount=_to_cents(amount),
                currency=currency,
                automatic_payment_methods={"enabled": True},
                metadata=full_metadata,
                idempotency_key=f"sale-{sale_id}-{attempt}",
                stripe_version=settings.STRIPE_API_VERSION,
            )
            return ProcessorIntent(
                intent_id=intent.id,
                client_secret=intent.client_secret,
                amount=amount,
                currency=currency,
            )

        async def confirm_payment(
            self, tenant: "Tenant", payment_intent_id: str
        ) -> ProcessorPayment:
            api_key = self._api_key(tenant)
            pi = stripe.PaymentIntent.retrieve(
                payment_intent_id, api_key=api_key,
                expand=["payment_method", "latest_charge"],
            )
            pm = pi.get("payment_method")
            card = (pm or {}).get("card") if isinstance(pm, dict) else (pm.card if pm else None)
            last4 = card.get("last4") if isinstance(card, dict) else (card.last4 if card else None)
            brand = card.get("brand") if isinstance(card, dict) else (card.brand if card else None)
            latest_charge = pi.get("latest_charge")
            charge_id = latest_charge if isinstance(latest_charge, str) else (latest_charge.id if latest_charge else None)
            last_error = pi.get("last_payment_error") or {}
            return ProcessorPayment(
                intent_id=pi.id,
                charge_id=charge_id,
                last4=last4,
                brand=brand,
                status=_STATUS_MAP.get(pi.status, pi.status),
                failure_reason=last_error.get("message") if isinstance(last_error, dict) else None,
            )

        async def refund_payment(
            self, tenant: "Tenant", payment: "Payment", amount: Decimal
        ) -> ProcessorRefund:
            if not payment.processor_payment_id:
                raise PaymentProcessorError(
                    f"Payment {payment.id} has no processor_payment_id — cannot Stripe-refund"
                )
            api_key = self._api_key(tenant)
            refund = stripe.Refund.create(
                payment_intent=payment.processor_payment_id,
                amount=_to_cents(amount),
                api_key=api_key,
            )
            return ProcessorRefund(
                refund_id=refund.id,
                amount=amount,
                status=refund.status,
            )

        def verify_webhook_signature(
            self, tenant: "Tenant", body: bytes, signature: str
        ) -> WebhookEvent:
            if not tenant.stripe_webhook_secret_encrypted:
                raise PaymentProcessorError("Tenant has no Stripe webhook secret configured")
            secret = decrypt_secret(tenant.stripe_webhook_secret_encrypted)
            event = stripe.Webhook.construct_event(body, signature, secret)
            obj = event.data.object if hasattr(event.data, "object") else {}
            pi_id = getattr(obj, "id", None) if event.type.startswith("payment_intent.") else getattr(obj, "payment_intent", None)
            return WebhookEvent(
                event_id=event.id,
                event_type=event.type,
                payment_intent_id=pi_id,
                charge_id=getattr(obj, "latest_charge", None) if event.type.startswith("payment_intent.") else None,
                raw_payload=dict(event),
            )
    ```

    **C. Wave-0 tests** (replace skip-stub bodies):

    `backend/tests/test_processor_protocol.py`:
    ```python
    def test_stripe_processor_satisfies_protocol():
        from backend.services.payments.base import PaymentProcessor, get_processor
        from backend.services.payments.stripe_processor import StripeProcessor
        p = get_processor("stripe")
        assert isinstance(p, StripeProcessor)
        assert isinstance(p, PaymentProcessor)  # runtime_checkable Protocol

    def test_get_processor_rejects_unknown():
        import pytest
        from backend.services.payments.base import get_processor
        with pytest.raises(ValueError, match="Unknown processor"):
            get_processor("square")
    ```

    `backend/tests/test_stripe_processor.py`:
    ```python
    import pytest
    from decimal import Decimal
    from unittest.mock import MagicMock, patch
    from uuid import uuid4

    @pytest.fixture
    def tenant_with_stripe(monkeypatch):
        from cryptography.fernet import Fernet
        from backend.core import config
        from backend.services.payments.crypto import encrypt_secret
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", Fernet.generate_key().decode())
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", "")
        t = MagicMock()
        t.id = uuid4()
        t.stripe_secret_key_encrypted = encrypt_secret("sk_test_fakekey123")
        t.stripe_webhook_secret_encrypted = encrypt_secret("whsec_fake")
        return t

    @pytest.mark.asyncio
    async def test_create_payment_intent_includes_tenant_id_metadata(tenant_with_stripe):
        from backend.services.payments.stripe_processor import StripeProcessor
        with patch("backend.services.payments.stripe_processor.stripe.PaymentIntent.create") as create_mock:
            create_mock.return_value = MagicMock(id="pi_x", client_secret="pi_x_secret")
            p = StripeProcessor()
            await p.create_payment_intent(tenant_with_stripe, Decimal("12.34"), "usd", {"sale_id": "abc"})
            kwargs = create_mock.call_args.kwargs
            assert kwargs["metadata"]["tenant_id"] == str(tenant_with_stripe.id)
            assert kwargs["amount"] == 1234   # integer cents, not float
            assert kwargs["automatic_payment_methods"] == {"enabled": True}
            assert kwargs["idempotency_key"] == "sale-abc-1"

    @pytest.mark.asyncio
    async def test_confirm_payment_calls_retrieve_not_trusts_client(tenant_with_stripe):
        from backend.services.payments.stripe_processor import StripeProcessor
        with patch("backend.services.payments.stripe_processor.stripe.PaymentIntent.retrieve") as retrieve_mock:
            retrieve_mock.return_value = MagicMock(
                id="pi_x", status="succeeded", payment_method=None,
                get=lambda k, default=None: {"latest_charge": "ch_x", "payment_method": None, "last_payment_error": None}.get(k, default),
            )
            p = StripeProcessor()
            result = await p.confirm_payment(tenant_with_stripe, "pi_x")
            retrieve_mock.assert_called_once()
            assert result.status == "succeeded"

    @pytest.mark.asyncio
    async def test_create_intent_fails_when_no_tenant_key():
        from unittest.mock import MagicMock
        from backend.services.payments.stripe_processor import StripeProcessor
        from backend.services.payments.base import PaymentProcessorError
        t = MagicMock()
        t.stripe_secret_key_encrypted = None
        with pytest.raises(PaymentProcessorError, match="no Stripe key"):
            await StripeProcessor().create_payment_intent(t, Decimal("1"), "usd", {})

    def test_verify_webhook_uses_construct_event(tenant_with_stripe):
        from backend.services.payments.stripe_processor import StripeProcessor
        with patch("backend.services.payments.stripe_processor.stripe.Webhook.construct_event") as ce:
            mock_event = MagicMock()
            mock_event.id = "evt_x"
            mock_event.type = "payment_intent.succeeded"
            mock_event.data.object = MagicMock(id="pi_x", latest_charge="ch_x")
            ce.return_value = mock_event
            evt = StripeProcessor().verify_webhook_signature(tenant_with_stripe, b'{"raw":"bytes"}', "sig123")
            ce.assert_called_once_with(b'{"raw":"bytes"}', "sig123", "whsec_fake")
            assert evt.event_id == "evt_x"
            assert evt.event_type == "payment_intent.succeeded"
    ```
  </action>
  <verify>
    <automated>cd backend && pytest tests/test_processor_protocol.py tests/test_stripe_processor.py tests/test_payments_crypto.py -v && python -c "from backend.services.payments.base import PaymentProcessor, get_processor; from backend.services.payments.stripe_processor import StripeProcessor; assert isinstance(get_processor('stripe'), PaymentProcessor); print('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - `pytest backend/tests/test_processor_protocol.py tests/test_stripe_processor.py tests/test_payments_crypto.py -v` exits 0 (all green, no skips)
    - `grep -c "automatic_payment_methods" backend/services/payments/stripe_processor.py` returns >= 1
    - `grep -c "payment_method_types" backend/services/payments/stripe_processor.py` returns 0 — NEVER use the deprecated allow-list
    - `grep -c "idempotency_key" backend/services/payments/stripe_processor.py` returns >= 1
    - `grep -c "metadata.*tenant_id\|tenant_id.*metadata" backend/services/payments/stripe_processor.py` returns >= 1
    - `grep -c "PaymentIntent.retrieve" backend/services/payments/stripe_processor.py` returns >= 1 (server-authoritative status)
    - `grep -rn "^import stripe\|^from stripe" backend/api backend/services/sale_lifecycle.py backend/services/receipts/ 2>/dev/null | grep -v stripe_processor.py | wc -l` returns 0 — abstraction barrier intact (file paths optional; the rule is: outside stripe_processor.py, NEVER import stripe)
    - `python -c "from backend.services.payments.base import PaymentProcessor, ProcessorIntent, ProcessorPayment, ProcessorRefund, WebhookEvent, get_processor, PaymentProcessorError; print('ok')"` exits 0
  </acceptance_criteria>
  <done>PaymentProcessor seam ready; StripeProcessor implements it; abstraction barrier enforced by acceptance criteria; tests green.</done>
</task>

</tasks>

<verification>
- All 3 payment-services tests green
- Abstraction barrier verified: `import stripe` only appears in stripe_processor.py
- Crypto layer round-trips and rotates correctly
- Loud failure on missing PAYMENTS_FERNET_KEY
</verification>

<success_criteria>
PaymentProcessor seam exists; Stripe adapter ships; per-tenant secret encryption ready for routes to consume.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-02-SUMMARY.md`
</output>
