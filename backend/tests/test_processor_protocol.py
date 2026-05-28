"""POS-07 — StripeProcessor satisfies the PaymentProcessor Protocol."""

import pytest


def test_stripe_processor_has_required_methods():
    from backend.services.payments.stripe_processor import StripeProcessor

    for name in (
        "create_payment_intent",
        "confirm_payment",
        "refund_payment",
        "verify_webhook_signature",
    ):
        assert hasattr(StripeProcessor, name), f"StripeProcessor missing {name!r}"


def test_payment_processor_protocol_exists():
    from backend.services.payments.base import PaymentProcessor

    assert PaymentProcessor is not None


def test_stripe_processor_satisfies_protocol():
    from backend.services.payments.base import PaymentProcessor, get_processor
    from backend.services.payments.stripe_processor import StripeProcessor

    p = get_processor("stripe")
    assert isinstance(p, StripeProcessor)
    assert isinstance(p, PaymentProcessor)  # runtime_checkable Protocol


def test_get_processor_rejects_unknown():
    from backend.services.payments.base import get_processor

    with pytest.raises(ValueError, match="Unknown processor"):
        get_processor("square")
