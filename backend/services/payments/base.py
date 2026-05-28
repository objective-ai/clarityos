"""PaymentProcessor abstract seam for Phase 15 POS.

POS-07: every payment-touching code path goes through this interface.
StripeProcessor is the only shipped adapter; future Square/Helcim adapters
drop in as new files implementing PaymentProcessor.

NEVER `import stripe` outside stripe_processor.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from backend.db.models.public.saas import Tenant
    from backend.db.models.tenant.clinical import Payment


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
    status: str  # "succeeded" | "failed" | "requires_action" | "processing" | "canceled"
    failure_reason: str | None = None


@dataclass(frozen=True)
class ProcessorRefund:
    refund_id: str
    amount: Decimal
    status: str  # "succeeded" | "pending" | "failed"


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

    async def cancel_intent(
        self, tenant: "Tenant", payment_intent_id: str
    ) -> None:
        """Cancel an unconfirmed PaymentIntent (Pitfall 7 — orphan-intent mitigation)."""
        ...


def get_processor(processor_name: str = "stripe") -> PaymentProcessor:
    if processor_name == "stripe":
        from backend.services.payments.stripe_processor import StripeProcessor

        return StripeProcessor()
    raise ValueError(f"Unknown processor: {processor_name}")
