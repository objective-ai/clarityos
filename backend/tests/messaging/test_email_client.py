"""Tests for backend/services/messaging/email_client.py (Plan 12-02 Task 2).

Postmark adapter — send_email + verify_postmark_basic_auth.
"""
from __future__ import annotations

import base64

import pytest

from backend.core.config import settings
from backend.services.messaging import email_client
from backend.services.messaging.email_client import (
    EmailConfigError,
    EmailWebhookAuthError,
    send_email,
    verify_postmark_basic_auth,
)


@pytest.fixture(autouse=True)
def _reset_email_singleton():
    email_client._reset_for_tests()
    yield
    email_client._reset_for_tests()


@pytest.fixture
def _configure_postmark(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "postmark")
    monkeypatch.setattr(settings, "POSTMARK_SERVER_TOKEN", "pm_test_server_token")
    monkeypatch.setattr(settings, "POSTMARK_FROM_EMAIL", "noreply@clarityos.app")


@pytest.mark.asyncio
async def test_send_email_returns_message_id(monkeypatch, mock_postmark_client, _configure_postmark):
    monkeypatch.setattr(email_client, "_client", mock_postmark_client)

    msg_id = await send_email(
        subject="Reminder",
        html="<p>Hi</p>",
        to="patient@example.com",
        idempotency_key="key-001",
    )

    assert msg_id == "11111111-2222-3333-4444-555555555555"


@pytest.mark.asyncio
async def test_send_email_passes_idempotency_header(monkeypatch, mock_postmark_client, _configure_postmark):
    monkeypatch.setattr(email_client, "_client", mock_postmark_client)

    await send_email(
        subject="Reminder",
        html="<p>Hi</p>",
        to="patient@example.com",
        idempotency_key="abc-123",
    )

    args = mock_postmark_client.emails.send.call_args
    headers = args.kwargs["Headers"]
    assert {"Name": "X-PM-Idempotency-Key", "Value": "abc-123"} in headers


@pytest.mark.asyncio
async def test_send_email_includes_reply_to_when_provided(monkeypatch, mock_postmark_client, _configure_postmark):
    monkeypatch.setattr(email_client, "_client", mock_postmark_client)

    await send_email(
        subject="Reminder",
        html="<p>Hi</p>",
        to="patient@example.com",
        idempotency_key="k",
        reply_to="frontdesk@clinic.com",
    )

    assert mock_postmark_client.emails.send.call_args.kwargs["ReplyTo"] == "frontdesk@clinic.com"


@pytest.mark.asyncio
async def test_send_email_omits_reply_to_when_none(monkeypatch, mock_postmark_client, _configure_postmark):
    monkeypatch.setattr(email_client, "_client", mock_postmark_client)

    await send_email(
        subject="Reminder",
        html="<p>Hi</p>",
        to="patient@example.com",
        idempotency_key="k",
    )

    assert "ReplyTo" not in mock_postmark_client.emails.send.call_args.kwargs


@pytest.mark.asyncio
async def test_send_email_uses_settings_from_when_unspecified(monkeypatch, mock_postmark_client, _configure_postmark):
    monkeypatch.setattr(email_client, "_client", mock_postmark_client)

    await send_email(
        subject="Reminder",
        html="<p>Hi</p>",
        to="patient@example.com",
        idempotency_key="k",
    )

    assert mock_postmark_client.emails.send.call_args.kwargs["From"] == "noreply@clarityos.app"


@pytest.mark.asyncio
async def test_send_email_raises_when_no_sender(monkeypatch, mock_postmark_client):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "postmark")
    monkeypatch.setattr(settings, "POSTMARK_SERVER_TOKEN", "pm_test")
    monkeypatch.setattr(settings, "POSTMARK_FROM_EMAIL", None)
    monkeypatch.setattr(email_client, "_client", mock_postmark_client)

    with pytest.raises(EmailConfigError):
        await send_email(
            subject="Reminder",
            html="<p>Hi</p>",
            to="patient@example.com",
            idempotency_key="k",
        )


@pytest.mark.asyncio
async def test_send_email_raises_when_token_missing(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "postmark")
    monkeypatch.setattr(settings, "POSTMARK_SERVER_TOKEN", None)
    email_client._reset_for_tests()

    with pytest.raises(EmailConfigError):
        await send_email(
            subject="Reminder",
            html="<p>Hi</p>",
            to="patient@example.com",
            idempotency_key="k",
        )


def test_verify_basic_auth_accepts_valid(postmark_webhook_request_factory):
    payload = postmark_webhook_request_factory()

    verify_postmark_basic_auth(authorization_header=payload["headers"]["Authorization"])


def test_verify_basic_auth_rejects_wrong_password(monkeypatch):
    monkeypatch.setattr(settings, "POSTMARK_WEBHOOK_USER", "good_user")
    monkeypatch.setattr(settings, "POSTMARK_WEBHOOK_PASSWORD", "good_pw")
    bad = base64.b64encode(b"good_user:wrong_pw").decode()

    with pytest.raises(EmailWebhookAuthError):
        verify_postmark_basic_auth(authorization_header=f"Basic {bad}")


def test_verify_basic_auth_rejects_missing_header(monkeypatch):
    monkeypatch.setattr(settings, "POSTMARK_WEBHOOK_USER", "u")
    monkeypatch.setattr(settings, "POSTMARK_WEBHOOK_PASSWORD", "p")

    with pytest.raises(EmailWebhookAuthError):
        verify_postmark_basic_auth(authorization_header=None)


def test_verify_basic_auth_rejects_malformed(monkeypatch):
    monkeypatch.setattr(settings, "POSTMARK_WEBHOOK_USER", "u")
    monkeypatch.setattr(settings, "POSTMARK_WEBHOOK_PASSWORD", "p")

    with pytest.raises(EmailWebhookAuthError):
        verify_postmark_basic_auth(authorization_header="Basic !!!notbase64!!!")


def test_verify_basic_auth_raises_when_creds_unset(monkeypatch):
    monkeypatch.setattr(settings, "POSTMARK_WEBHOOK_USER", None)
    monkeypatch.setattr(settings, "POSTMARK_WEBHOOK_PASSWORD", None)

    with pytest.raises(EmailConfigError):
        verify_postmark_basic_auth(authorization_header="Basic dGVzdDp0ZXN0")


def test_no_eager_client_init_at_import():
    email_client._reset_for_tests()
    assert email_client._client is None


@pytest.mark.asyncio
async def test_send_email_passes_html_unchanged(monkeypatch, mock_postmark_client, _configure_postmark):
    monkeypatch.setattr(email_client, "_client", mock_postmark_client)
    html = "<html><body><p>Pre-rendered.</p></body></html>"

    await send_email(
        subject="Reminder",
        html=html,
        to="patient@example.com",
        idempotency_key="k",
    )

    assert mock_postmark_client.emails.send.call_args.kwargs["HtmlBody"] == html
