"""Phase 12 messaging test fixtures.

Source-of-truth for: mock Twilio/Postmark SDKs, frozen clock, signed webhook payloads,
mock Anthropic classifier. Imported by every test file in backend/tests/messaging/.

Email provider: Postmark (Resend was rejected on 2026-04-29 because it does not offer
a BAA on any tier the owner is willing to pay for; SendGrid Pro tier exceeded budget).
See .planning/compliance/RESEND-BAA-CHECKPOINT.md.
"""
from __future__ import annotations

import base64
from typing import Any, Callable
from unittest.mock import AsyncMock, MagicMock

import pytest
from freezegun import freeze_time


@pytest.fixture(autouse=True)
def disable_messaging_scheduler(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prevent the asyncio scheduler from starting in tests (mirrors Phase 10.3 self-pinger)."""
    monkeypatch.setenv("MESSAGING_SCHEDULER_ENABLED", "false")


@pytest.fixture
def frozen_clock():
    """Fix wall-clock to 2026-05-01T15:00:00Z (a Friday, mid-afternoon clinic-local PT)."""
    with freeze_time("2026-05-01T15:00:00+00:00") as frozen:
        yield frozen


@pytest.fixture
def mock_twilio_client() -> MagicMock:
    """Mock twilio.rest.Client with messages.create returning a MessageSid."""
    client = MagicMock()
    client.messages.create = MagicMock(return_value=MagicMock(sid="SM_test_message_sid_001"))
    client.available_phone_numbers.return_value.local.list = MagicMock(
        return_value=[MagicMock(phone_number="+15555550100")]
    )
    client.incoming_phone_numbers.create = MagicMock(
        return_value=MagicMock(sid="PN_test_number_sid_001", phone_number="+15555550100")
    )
    return client


@pytest.fixture
def mock_postmark_client() -> MagicMock:
    """Mock postmarker.core.PostmarkClient with .emails.send returning {'MessageID': '<uuid>'}."""
    client = MagicMock()
    client.emails.send = MagicMock(
        return_value={
            "To": "patient@example.com",
            "SubmittedAt": "2026-05-01T15:00:00.000Z",
            "MessageID": "11111111-2222-3333-4444-555555555555",
            "ErrorCode": 0,
            "Message": "OK",
        }
    )
    return client


@pytest.fixture
def mock_anthropic_classifier() -> AsyncMock:
    """Mock the Anthropic classifier to return 'reschedule_request' by default."""
    response = MagicMock()
    response.content = [MagicMock(text="reschedule_request")]
    return AsyncMock(return_value=response)


@pytest.fixture
def signed_twilio_webhook_factory(monkeypatch: pytest.MonkeyPatch) -> Callable[..., dict[str, Any]]:
    """Build a (form_dict, headers) tuple with a valid X-Twilio-Signature against a known auth_token.

    Uses real twilio.request_validator.RequestValidator so signature is byte-correct.
    """
    from twilio.request_validator import RequestValidator
    auth_token = "test_auth_token_phase_12"
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", auth_token)
    validator = RequestValidator(auth_token)

    def _factory(
        url: str = "https://test.clarityos.app/api/webhooks/twilio",
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        params = params or {
            "MessageSid": "SM_test_message_sid_001",
            "MessageStatus": "delivered",
            "From": "+15555550100",
            "To": "+14155551234",
            "Body": "",
        }
        signature = validator.compute_signature(url, params)
        return {
            "url": url,
            "form": params,
            "headers": {"X-Twilio-Signature": signature, "X-Forwarded-Host": "test.clarityos.app"},
        }

    return _factory


@pytest.fixture
def postmark_webhook_request_factory(monkeypatch: pytest.MonkeyPatch) -> Callable[..., dict[str, Any]]:
    """Build a Postmark webhook request: JSON body + HTTP Basic Auth header.

    Postmark webhooks do NOT use HMAC or Svix signing. They authenticate via
    HTTP Basic Auth on the webhook URL (username/password set in Postmark dashboard).
    See https://postmarkapp.com/developer/webhooks/webhooks-overview#securing-webhooks.
    Plan 12-04 webhook router must call `verify_postmark_basic_auth(request)` on every event.
    """
    import json

    user = "postmark_webhook_user"
    pw = "test_postmark_webhook_pw_phase_12"
    monkeypatch.setenv("POSTMARK_WEBHOOK_USER", user)
    monkeypatch.setenv("POSTMARK_WEBHOOK_PASSWORD", pw)
    token = base64.b64encode(f"{user}:{pw}".encode()).decode()

    def _factory(payload: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = payload or {
            "RecordType": "Delivery",
            "MessageID": "11111111-2222-3333-4444-555555555555",
            "Recipient": "patient@example.com",
            "DeliveredAt": "2026-05-01T15:00:05.000Z",
        }
        body = json.dumps(payload).encode()
        return {
            "raw_body": body,
            "headers": {
                "Authorization": f"Basic {token}",
                "Content-Type": "application/json",
            },
        }

    return _factory
