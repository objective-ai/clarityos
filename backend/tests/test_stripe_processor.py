"""POS-02, POS-07 — StripeProcessor.create_payment_intent + confirm + refund (mocked stripe module)."""

from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet


@pytest.fixture
def tenant_with_stripe(monkeypatch):
    from backend.core import config
    from backend.services.payments.crypto import encrypt_secret

    monkeypatch.setattr(
        config.settings, "PAYMENTS_FERNET_KEY", Fernet.generate_key().decode()
    )
    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", "")
    t = MagicMock()
    t.id = uuid4()
    t.stripe_secret_key_encrypted = encrypt_secret("sk_test_fakekey123")
    t.stripe_webhook_secret_encrypted = encrypt_secret("whsec_fake")
    return t


def test_stripe_processor_class_exists():
    from backend.services.payments.stripe_processor import StripeProcessor

    assert StripeProcessor is not None


@pytest.mark.asyncio
async def test_create_payment_intent_includes_tenant_id_metadata(tenant_with_stripe):
    from backend.services.payments.stripe_processor import StripeProcessor

    with patch(
        "backend.services.payments.stripe_processor.stripe.PaymentIntent.create"
    ) as create_mock:
        create_mock.return_value = MagicMock(id="pi_x", client_secret="pi_x_secret")
        p = StripeProcessor()
        await p.create_payment_intent(
            tenant_with_stripe, Decimal("12.34"), "usd", {"sale_id": "abc"}
        )
        kwargs = create_mock.call_args.kwargs
        assert kwargs["metadata"]["tenant_id"] == str(tenant_with_stripe.id)
        assert kwargs["amount"] == 1234  # integer cents, not float
        assert kwargs["automatic_payment_methods"] == {"enabled": True}
        assert kwargs["idempotency_key"] == "sale-abc-1"
        assert kwargs["currency"] == "usd"


@pytest.mark.asyncio
async def test_confirm_payment_calls_retrieve_not_trusts_client(tenant_with_stripe):
    from backend.services.payments.stripe_processor import StripeProcessor

    with patch(
        "backend.services.payments.stripe_processor.stripe.PaymentIntent.retrieve"
    ) as retrieve_mock:
        mock_pi = MagicMock()
        mock_pi.id = "pi_x"
        mock_pi.status = "succeeded"
        mock_pi.payment_method = None
        mock_pi.latest_charge = "ch_x"
        mock_pi.last_payment_error = None
        retrieve_mock.return_value = mock_pi
        p = StripeProcessor()
        result = await p.confirm_payment(tenant_with_stripe, "pi_x")
        retrieve_mock.assert_called_once()
        assert result.status == "succeeded"
        assert result.intent_id == "pi_x"
        assert result.charge_id == "ch_x"


@pytest.mark.asyncio
async def test_create_intent_fails_when_no_tenant_key():
    from backend.services.payments.base import PaymentProcessorError
    from backend.services.payments.stripe_processor import StripeProcessor

    t = MagicMock()
    t.stripe_secret_key_encrypted = None
    with pytest.raises(PaymentProcessorError, match="no Stripe key"):
        await StripeProcessor().create_payment_intent(t, Decimal("1"), "usd", {})


@pytest.mark.asyncio
async def test_refund_payment_requires_processor_payment_id(tenant_with_stripe):
    from backend.services.payments.base import PaymentProcessorError
    from backend.services.payments.stripe_processor import StripeProcessor

    payment = MagicMock()
    payment.id = uuid4()
    payment.processor_payment_id = None
    with pytest.raises(PaymentProcessorError, match="no processor_payment_id"):
        await StripeProcessor().refund_payment(
            tenant_with_stripe, payment, Decimal("10.00")
        )


@pytest.mark.asyncio
async def test_refund_payment_passes_cents_and_intent_id(tenant_with_stripe):
    from backend.services.payments.stripe_processor import StripeProcessor

    payment = MagicMock()
    payment.id = uuid4()
    payment.processor_payment_id = "pi_x"
    with patch(
        "backend.services.payments.stripe_processor.stripe.Refund.create"
    ) as refund_mock:
        refund_mock.return_value = MagicMock(id="re_x", status="succeeded")
        result = await StripeProcessor().refund_payment(
            tenant_with_stripe, payment, Decimal("10.00")
        )
        kwargs = refund_mock.call_args.kwargs
        assert kwargs["payment_intent"] == "pi_x"
        assert kwargs["amount"] == 1000
        assert result.refund_id == "re_x"
        assert result.status == "succeeded"


def test_verify_webhook_uses_construct_event(tenant_with_stripe):
    from backend.services.payments.stripe_processor import StripeProcessor

    with patch(
        "backend.services.payments.stripe_processor.stripe.Webhook.construct_event"
    ) as ce:
        mock_event = MagicMock()
        mock_event.id = "evt_x"
        mock_event.type = "payment_intent.succeeded"
        mock_event.data.object = MagicMock(id="pi_x", latest_charge="ch_x")
        ce.return_value = mock_event
        evt = StripeProcessor().verify_webhook_signature(
            tenant_with_stripe, b'{"raw":"bytes"}', "sig123"
        )
        ce.assert_called_once_with(b'{"raw":"bytes"}', "sig123", "whsec_fake")
        assert evt.event_id == "evt_x"
        assert evt.event_type == "payment_intent.succeeded"
        assert evt.payment_intent_id == "pi_x"


def test_verify_webhook_fails_without_secret(tenant_with_stripe):
    from backend.services.payments.base import PaymentProcessorError
    from backend.services.payments.stripe_processor import StripeProcessor

    tenant_with_stripe.stripe_webhook_secret_encrypted = None
    with pytest.raises(PaymentProcessorError, match="webhook secret"):
        StripeProcessor().verify_webhook_signature(
            tenant_with_stripe, b"raw", "sig"
        )
