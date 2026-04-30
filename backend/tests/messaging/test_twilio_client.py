"""Tests for backend/services/messaging/twilio_client.py (Plan 12-02 Task 1).

Covers send_sms, validate_signature, provision_local_number, lazy init.
"""
from __future__ import annotations

import pytest

from backend.core.config import settings
from backend.services.messaging import twilio_client
from backend.services.messaging.twilio_client import (
    NoNumberAvailable,
    TwilioConfigError,
    provision_local_number,
    send_sms,
    validate_signature,
)


@pytest.fixture(autouse=True)
def _reset_twilio_singleton():
    twilio_client._reset_client_for_tests()
    yield
    twilio_client._reset_client_for_tests()


@pytest.mark.asyncio
async def test_send_sms_returns_message_sid(monkeypatch, mock_twilio_client):
    monkeypatch.setattr(twilio_client, "_client", mock_twilio_client)
    monkeypatch.setattr(settings, "TWILIO_MESSAGING_SERVICE_SID", "MG_test")

    sid = await send_sms(
        body="Hi",
        to="+15555550100",
        status_callback_url="https://x/cb",
        messaging_service_sid="MG_test",
    )

    assert sid == "SM_test_message_sid_001"


@pytest.mark.asyncio
async def test_send_sms_passes_args_through_to_sdk(monkeypatch, mock_twilio_client):
    monkeypatch.setattr(twilio_client, "_client", mock_twilio_client)
    monkeypatch.setattr(settings, "TWILIO_MESSAGING_SERVICE_SID", "MG_test")

    await send_sms(
        body="Reminder: appt tomorrow",
        to="+15555550100",
        status_callback_url="https://x/cb",
        messaging_service_sid="MG_clinic_specific",
    )

    mock_twilio_client.messages.create.assert_called_once_with(
        body="Reminder: appt tomorrow",
        to="+15555550100",
        messaging_service_sid="MG_clinic_specific",
        status_callback="https://x/cb",
    )


@pytest.mark.asyncio
async def test_send_sms_falls_back_to_settings_msid(monkeypatch, mock_twilio_client):
    monkeypatch.setattr(twilio_client, "_client", mock_twilio_client)
    monkeypatch.setattr(settings, "TWILIO_MESSAGING_SERVICE_SID", "MG_default")

    await send_sms(body="Hi", to="+15555550100", status_callback_url="https://x/cb")

    args = mock_twilio_client.messages.create.call_args
    assert args.kwargs["messaging_service_sid"] == "MG_default"


@pytest.mark.asyncio
async def test_send_sms_raises_without_messaging_service_sid(monkeypatch, mock_twilio_client):
    monkeypatch.setattr(twilio_client, "_client", mock_twilio_client)
    monkeypatch.setattr(settings, "TWILIO_MESSAGING_SERVICE_SID", None)

    with pytest.raises(TwilioConfigError):
        await send_sms(body="Hi", to="+15555550100", status_callback_url="https://x/cb")


def test_validate_signature_accepts_signed_payload(signed_twilio_webhook_factory):
    payload = signed_twilio_webhook_factory()

    assert validate_signature(
        url=payload["url"],
        form=payload["form"],
        signature=payload["headers"]["X-Twilio-Signature"],
    ) is True


def test_validate_signature_rejects_corrupted_signature(signed_twilio_webhook_factory):
    payload = signed_twilio_webhook_factory()

    assert validate_signature(
        url=payload["url"],
        form=payload["form"],
        signature="bogus_signature",
    ) is False


def test_validate_signature_uses_xforwarded_host(signed_twilio_webhook_factory):
    """Signature must be reconstructed against the public URL Twilio signed,
    not whatever URL FastAPI sees after the BFF proxy hop (Pitfall 1)."""
    forwarded_url = "https://test.clarityos.app/api/webhooks/twilio"
    payload = signed_twilio_webhook_factory(url=forwarded_url)

    assert validate_signature(
        url=forwarded_url,
        form=payload["form"],
        signature=payload["headers"]["X-Twilio-Signature"],
    ) is True

    # If we reconstruct against the wrong host, validation fails.
    assert validate_signature(
        url="https://internal-fastapi.local/webhooks/twilio",
        form=payload["form"],
        signature=payload["headers"]["X-Twilio-Signature"],
    ) is False


def test_validate_signature_raises_without_auth_token(monkeypatch, signed_twilio_webhook_factory):
    payload = signed_twilio_webhook_factory()
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", None)

    with pytest.raises(TwilioConfigError):
        validate_signature(
            url=payload["url"],
            form=payload["form"],
            signature=payload["headers"]["X-Twilio-Signature"],
        )


@pytest.mark.asyncio
async def test_provision_local_number_returns_phone_and_sid(monkeypatch, mock_twilio_client):
    monkeypatch.setattr(twilio_client, "_client", mock_twilio_client)

    result = await provision_local_number(
        area_code="415",
        friendly_name="Test Clinic SF",
        messaging_service_sid="MG_test",
    )

    assert result == {"phone_number": "+15555550100", "sid": "PN_test_number_sid_001"}


@pytest.mark.asyncio
async def test_provision_local_number_raises_when_none_available(monkeypatch, mock_twilio_client):
    mock_twilio_client.available_phone_numbers.return_value.local.list.return_value = []
    monkeypatch.setattr(twilio_client, "_client", mock_twilio_client)

    with pytest.raises(NoNumberAvailable):
        await provision_local_number(
            area_code="999",
            friendly_name="Test",
            messaging_service_sid="MG_test",
        )


def test_no_eager_client_init_at_import():
    """Module import must NOT instantiate the SDK client (lazy init only)."""
    twilio_client._reset_client_for_tests()
    assert twilio_client._client is None


def test_get_client_raises_when_credentials_missing(monkeypatch):
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", None)
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", None)
    twilio_client._reset_client_for_tests()

    with pytest.raises(TwilioConfigError):
        twilio_client._get_client()
