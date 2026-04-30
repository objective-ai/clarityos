"""Tests for the Postmark webhook handler (Plan 12-04, adapted for Postmark BAA).

Postmark uses HTTP Basic Auth (NOT Svix HMAC). The handler verifies via
verify_postmark_basic_auth and maps Postmark RecordTypes (Delivery, Open,
Bounce, SpamComplaint) into the same internal status vocabulary used by
the Twilio path.

CRM-20: Bounce / SpamComplaint events call record_bounce.
"""
from __future__ import annotations

import base64
import json
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

import backend.db.models.tenant.intake  # noqa: F401  (mapper bootstrap)
from backend.api.routes import webhooks as webhooks_module
from backend.api.routes.webhooks import postmark_webhook
from backend.db.models.tenant.clinical import AuditAction
from backend.db.models.tenant.messaging import MessageLog


# ─── Helpers ────────────────────────────────────────────────────────────────


def _seal_env(monkeypatch: pytest.MonkeyPatch, secret: str = "test-internal-seal") -> str:
    from backend.core.config import settings as _settings
    monkeypatch.setattr(_settings, "WEBHOOK_INTERNAL_SECRET", secret)
    return secret


def _basic_auth_env(
    monkeypatch: pytest.MonkeyPatch,
    user: str = "pm_user",
    pw: str = "pm_pw_phase_12",
) -> str:
    from backend.core.config import settings as _settings
    monkeypatch.setattr(_settings, "POSTMARK_WEBHOOK_USER", user)
    monkeypatch.setattr(_settings, "POSTMARK_WEBHOOK_PASSWORD", pw)
    return "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()


def _make_log(
    *, message_id: str, status: str = "sent", status_priority: int = 1,
    channel: str = "email", patient_id: uuid.UUID | None = None,
) -> MessageLog:
    return MessageLog(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        patient_id=patient_id or uuid.uuid4(),
        channel=channel,
        purpose="operational",
        body="Hello",
        status=status,
        status_priority=status_priority,
        provider_message_id=message_id,
    )


def _fake_request(
    *, seal: str | None, auth_header: str | None, payload: dict[str, Any] | bytes,
) -> MagicMock:
    headers: dict[str, str] = {}
    if seal is not None:
        headers["X-Webhook-Internal"] = seal
    if auth_header is not None:
        headers["Authorization"] = auth_header

    if isinstance(payload, bytes):
        body_bytes = payload
    else:
        body_bytes = json.dumps(payload).encode()

    req = MagicMock()
    req.headers = headers
    req.body = AsyncMock(return_value=body_bytes)
    url_obj = MagicMock()
    url_obj.hostname = "test.clarityos.app"
    req.url = url_obj
    return req


def _fake_session(log: MessageLog | None = None):
    captured_added: list[Any] = []

    def _execute(stmt):
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=log)
        scalars = MagicMock()
        scalars.all = MagicMock(return_value=[log] if log else [])
        result.scalars = MagicMock(return_value=scalars)
        return result

    session = MagicMock()
    session.execute = AsyncMock(side_effect=_execute)
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock(side_effect=lambda obj: captured_added.append(obj))
    session.captured_added = captured_added
    return session


# ─── Tests ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_missing_internal_seal_returns_403(monkeypatch):
    _seal_env(monkeypatch)
    auth = _basic_auth_env(monkeypatch)
    req = _fake_request(seal=None, auth_header=auth, payload={"RecordType": "Delivery"})
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as info:
        await postmark_webhook(req, _fake_session())
    assert info.value.status_code == 403


@pytest.mark.asyncio
async def test_missing_basic_auth_returns_403(monkeypatch):
    seal = _seal_env(monkeypatch)
    _basic_auth_env(monkeypatch)
    req = _fake_request(seal=seal, auth_header=None, payload={"RecordType": "Delivery"})
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as info:
        await postmark_webhook(req, _fake_session())
    assert info.value.status_code == 403


@pytest.mark.asyncio
async def test_invalid_basic_auth_returns_403(monkeypatch):
    seal = _seal_env(monkeypatch)
    _basic_auth_env(monkeypatch)
    bad = "Basic " + base64.b64encode(b"wrong:creds").decode()
    req = _fake_request(seal=seal, auth_header=bad, payload={"RecordType": "Delivery"})
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as info:
        await postmark_webhook(req, _fake_session())
    assert info.value.status_code == 403


@pytest.mark.asyncio
async def test_delivery_event_marks_delivered(monkeypatch):
    seal = _seal_env(monkeypatch)
    auth = _basic_auth_env(monkeypatch)
    log = _make_log(message_id="MID-1", status="sent", status_priority=1)
    payload = {"RecordType": "Delivery", "MessageID": "MID-1"}
    req = _fake_request(seal=seal, auth_header=auth, payload=payload)
    session = _fake_session(log=log)

    resp = await postmark_webhook(req, session)
    assert resp == {"ok": True}
    assert log.status == "delivered"
    assert log.status_priority == 2
    assert log.delivered_at is not None


@pytest.mark.asyncio
async def test_open_event_marks_read(monkeypatch):
    seal = _seal_env(monkeypatch)
    auth = _basic_auth_env(monkeypatch)
    log = _make_log(message_id="MID-2", status="delivered", status_priority=2)
    payload = {"RecordType": "Open", "MessageID": "MID-2"}
    req = _fake_request(seal=seal, auth_header=auth, payload=payload)
    session = _fake_session(log=log)

    await postmark_webhook(req, session)
    assert log.status == "read"
    assert log.read_at is not None


@pytest.mark.asyncio
async def test_bounce_event_marks_failed_and_records_bounce(monkeypatch):
    seal = _seal_env(monkeypatch)
    auth = _basic_auth_env(monkeypatch)
    log = _make_log(message_id="MID-3", status="sent", status_priority=1)
    payload = {
        "RecordType": "Bounce", "MessageID": "MID-3",
        "Type": "HardBounce", "Description": "Bad address",
    }
    req = _fake_request(seal=seal, auth_header=auth, payload=payload)
    session = _fake_session(log=log)
    record_bounce_mock = AsyncMock()
    monkeypatch.setattr(webhooks_module, "record_bounce", record_bounce_mock)

    await postmark_webhook(req, session)
    assert log.status == "failed"
    assert log.failure_reason == "HardBounce"
    record_bounce_mock.assert_awaited_once()
    assert record_bounce_mock.await_args.kwargs["channel"] == "email"


@pytest.mark.asyncio
async def test_spam_complaint_records_bounce(monkeypatch):
    seal = _seal_env(monkeypatch)
    auth = _basic_auth_env(monkeypatch)
    log = _make_log(message_id="MID-4", status="delivered", status_priority=2)
    payload = {"RecordType": "SpamComplaint", "MessageID": "MID-4"}
    req = _fake_request(seal=seal, auth_header=auth, payload=payload)
    session = _fake_session(log=log)
    record_bounce_mock = AsyncMock()
    monkeypatch.setattr(webhooks_module, "record_bounce", record_bounce_mock)

    await postmark_webhook(req, session)
    assert log.status == "failed"
    record_bounce_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_idempotent_lower_priority_ignored(monkeypatch):
    seal = _seal_env(monkeypatch)
    auth = _basic_auth_env(monkeypatch)
    log = _make_log(message_id="MID-5", status="failed", status_priority=99)
    payload = {"RecordType": "Delivery", "MessageID": "MID-5"}
    req = _fake_request(seal=seal, auth_header=auth, payload=payload)
    session = _fake_session(log=log)
    record_bounce_mock = AsyncMock()
    monkeypatch.setattr(webhooks_module, "record_bounce", record_bounce_mock)

    resp = await postmark_webhook(req, session)
    assert resp == {"ok": True, "ignored": "stale"}
    assert log.status == "failed"
    record_bounce_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_unknown_message_id_returns_200(monkeypatch):
    seal = _seal_env(monkeypatch)
    auth = _basic_auth_env(monkeypatch)
    payload = {"RecordType": "Delivery", "MessageID": "MID-not-tracked"}
    req = _fake_request(seal=seal, auth_header=auth, payload=payload)
    session = _fake_session(log=None)

    resp = await postmark_webhook(req, session)
    assert resp == {"ok": True, "ignored": "unknown_message_id"}


@pytest.mark.asyncio
async def test_unknown_record_type_ignored(monkeypatch):
    seal = _seal_env(monkeypatch)
    auth = _basic_auth_env(monkeypatch)
    log = _make_log(message_id="MID-6")
    payload = {"RecordType": "SubscriptionChange", "MessageID": "MID-6"}
    req = _fake_request(seal=seal, auth_header=auth, payload=payload)
    session = _fake_session(log=log)

    resp = await postmark_webhook(req, session)
    assert resp == {"ok": True, "ignored": "SubscriptionChange"}
    # No status mutation
    assert log.status == "sent"


@pytest.mark.asyncio
async def test_audit_log_written_on_state_change(monkeypatch):
    seal = _seal_env(monkeypatch)
    auth = _basic_auth_env(monkeypatch)
    log = _make_log(message_id="MID-7", status="sent", status_priority=1)
    payload = {"RecordType": "Delivery", "MessageID": "MID-7"}
    req = _fake_request(seal=seal, auth_header=auth, payload=payload)
    session = _fake_session(log=log)

    await postmark_webhook(req, session)
    assert any(
        getattr(a, "action", None) == AuditAction.MESSAGE_DELIVERED.value
        for a in session.captured_added
    )
