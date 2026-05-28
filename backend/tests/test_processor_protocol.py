"""POS-07 — StripeProcessor satisfies the PaymentProcessor Protocol."""

import pytest

try:
    from backend.services.payments.base import PaymentProcessor
    from backend.services.payments.stripe_processor import StripeProcessor
except ImportError:
    pytest.skip(
        "PaymentProcessor base / StripeProcessor not yet implemented (Plan 15-02)",
        allow_module_level=True,
    )


def test_stripe_processor_has_required_methods():
    for name in (
        "create_payment_intent",
        "confirm_payment",
        "refund_payment",
        "verify_webhook_signature",
    ):
        assert hasattr(StripeProcessor, name), f"StripeProcessor missing {name!r}"


def test_payment_processor_protocol_exists():
    assert PaymentProcessor is not None
