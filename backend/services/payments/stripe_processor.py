"""Stripe adapter for PaymentProcessor (POS-02, POS-07).

Per-tenant credentials decrypted at call time (RESEARCH Pattern 1).
Server-authoritative status via stripe.PaymentIntent.retrieve (Pitfall 2).
Idempotency keys on every create call (Pitfall 6).
automatic_payment_methods enabled (deprecated allow-list NOT used) per Pitfall 15.
"""
from __future__ import annotations

from decimal import ROUND_HALF_EVEN, Decimal
from typing import TYPE_CHECKING

import stripe

from backend.core.config import settings
from backend.services.payments.base import (
    PaymentProcessorError,
    ProcessorIntent,
    ProcessorPayment,
    ProcessorRefund,
    WebhookEvent,
)
from backend.services.payments.crypto import decrypt_secret

if TYPE_CHECKING:
    from backend.db.models.public.saas import Tenant
    from backend.db.models.tenant.clinical import Payment

_CENTS = Decimal("0.01")


def _to_cents(amount: Decimal) -> int:
    return int(amount.quantize(_CENTS, rounding=ROUND_HALF_EVEN) * 100)


# Stripe PaymentIntent.status → our canonical status
_STATUS_MAP = {
    "succeeded": "succeeded",
    "processing": "processing",
    "requires_action": "requires_action",
    "requires_payment_method": "failed",
    "requires_confirmation": "processing",
    "canceled": "canceled",
}


def _safe_get(obj, key, default=None):
    """Read key from either a dict-like Stripe response or an attribute object."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


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
            payment_intent_id,
            api_key=api_key,
            expand=["payment_method", "latest_charge"],
        )
        pm = _safe_get(pi, "payment_method")
        card = _safe_get(pm, "card") if pm else None
        last4 = _safe_get(card, "last4") if card else None
        brand = _safe_get(card, "brand") if card else None
        latest_charge = _safe_get(pi, "latest_charge")
        charge_id = (
            latest_charge
            if isinstance(latest_charge, str)
            else (_safe_get(latest_charge, "id") if latest_charge else None)
        )
        last_error = _safe_get(pi, "last_payment_error") or {}
        failure_reason = (
            _safe_get(last_error, "message") if last_error else None
        )
        status = _safe_get(pi, "status")
        return ProcessorPayment(
            intent_id=_safe_get(pi, "id"),
            charge_id=charge_id,
            last4=last4,
            brand=brand,
            status=_STATUS_MAP.get(status, status),
            failure_reason=failure_reason,
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
            raise PaymentProcessorError(
                "Tenant has no Stripe webhook secret configured"
            )
        secret = decrypt_secret(tenant.stripe_webhook_secret_encrypted)
        event = stripe.Webhook.construct_event(body, signature, secret)
        obj = _safe_get(_safe_get(event, "data"), "object") or {}
        if str(_safe_get(event, "type", "")).startswith("payment_intent."):
            pi_id = _safe_get(obj, "id")
            charge_id = _safe_get(obj, "latest_charge")
        else:
            pi_id = _safe_get(obj, "payment_intent")
            charge_id = None
        raw_payload = dict(event) if not isinstance(event, dict) else event
        return WebhookEvent(
            event_id=_safe_get(event, "id"),
            event_type=_safe_get(event, "type"),
            payment_intent_id=pi_id,
            charge_id=charge_id if isinstance(charge_id, str) else None,
            raw_payload=raw_payload,
        )
