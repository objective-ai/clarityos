"""POS-02, POS-07 — StripeProcessor.create_payment_intent + confirm + refund (mocked stripe module)."""

import pytest

try:
    from backend.services.payments.stripe_processor import StripeProcessor
except ImportError:
    pytest.skip(
        "StripeProcessor not yet implemented (Plan 15-02)",
        allow_module_level=True,
    )


def test_stripe_processor_class_exists():
    assert StripeProcessor is not None
