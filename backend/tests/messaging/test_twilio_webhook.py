"""Tests for the Twilio webhook handler (Plan 12-04).

Direct-handler pattern + fake AsyncSession (same approach Plan 10.3-04 used
because backend/tests has no conftest that wires the full ASGI stack and
the upstream signature validator just needs a properly-signed form).

Covers: internal seal, X-Twilio-Signature verification, idempotent +
monotonic status callback, inbound STOP keyword (canonical CRM-04),
non-STOP inbound non-blocking classifier (CRM-04 latency budget),
record_bounce wiring on failure events (CRM-20).
"""
from __future__ import annotations

import asyncio
import time
import uuid
from datetime import date, datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

import backend.db.models.tenant.intake  # noqa: F401  (mapper bootstrap)
from backend.api.routes import webhooks as webhooks_module
from backend.api.routes.webhooks import twilio_webhook
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import AuditAction, Patient, Sex
from backend.db.models.tenant.messaging import InboundMessage, MessageLog


# ─── Helpers ────────────────────────────────────────────────────────────────


def _seal_env(monkeypatch: pytest.MonkeyPatch, secret: str = "test-internal-seal") -> str:
    from backend.core.config import settings as _settings

    monkeypatch.setattr(_settings, "WEBHOOK_INTERNAL_SECRET", secret)
    return secret


def _make_log(
    *,
    sid: str = "SM_test_sid",
    status: str = "queued",
    status_priority: int = 0,
    channel: str = "sms",
    patient_id: uuid.UUID | None = None,
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
        provider_message_id=sid,
    )


def _make_patient(phone_e164: str = "+15555550100") -> Patient:
    return Patient(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        first_name="Pat",
        last_name="Smith",
        dob=date(1990, 1, 1),
        sex=Sex.FEMALE,
        chart_number=42,
        contact_info_jsonb={"phone_e164": phone_e164},
    )


def _make_tenant(twilio_phone: str = "+14155551234") -> Tenant:
    return Tenant(
        id=uuid.uuid4(),
        name="Test Clinic",
        slug=f"clinic-{uuid.uuid4().hex[:6]}",
        schema_name=f"clinic_{uuid.uuid4().hex[:6]}",
        timezone="America/Los_Angeles",
        settings_jsonb={"messaging": {"twilio_phone_number": twilio_phone}},
    )


def _fake_request(
    *,
    seal: str | None,
    twilio_signature: str = "",
    form: dict[str, str] | None = None,
    forwarded_host: str = "test.clarityos.app",
) -> MagicMock:
    headers = {}
    if seal is not None:
        headers["X-Webhook-Internal"] = seal
    if twilio_signature:
        headers["X-Twilio-Signature"] = twilio_signature
    headers["X-Forwarded-Host"] = forwarded_host
    headers["X-Forwarded-Proto"] = "https"

    req = MagicMock()
    req.headers = headers
    url_obj = MagicMock()
    url_obj.hostname = forwarded_host
    req.url = url_obj
    req.form = AsyncMock(return_value=form or {})
    return req


def _fake_session(
    *,
    log: MessageLog | None = None,
    patient: Patient | None = None,
    tenants: list[Tenant] | None = None,
):
    """Route SELECTs by table heuristic. MessageLog/Patient queries return
    scalar_one_or_none(); Tenant scan returns scalars().all()."""
    captured_added: list[Any] = []

    def _execute(stmt):
        result = MagicMock()
        compiled = str(stmt).lower()
        if "message_log" in compiled:
            result.scalar_one_or_none = MagicMock(return_value=log)
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=[log] if log else [])
            scalars.first = MagicMock(return_value=log)
            result.scalars = MagicMock(return_value=scalars)
        elif "patients" in compiled:
            result.scalar_one_or_none = MagicMock(return_value=patient)
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=[patient] if patient else [])
            scalars.first = MagicMock(return_value=patient)
            result.scalars = MagicMock(return_value=scalars)
        elif "tenant" in compiled:
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=tenants or [])
            result.scalars = MagicMock(return_value=scalars)
            result.scalar_one_or_none = MagicMock(return_value=None)
        else:
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=[])
            result.scalars = MagicMock(return_value=scalars)
            result.scalar_one_or_none = MagicMock(return_value=None)
        return result

    session = MagicMock()
    session.execute = AsyncMock(side_effect=_execute)
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock(side_effect=lambda obj: captured_added.append(obj))
    session.captured_added = captured_added
    return session


def _signed_form(monkeypatch: pytest.MonkeyPatch, params: dict[str, str]) -> tuple[dict[str, str], str]:
    """Return (form, signature) for the canonical webhook URL."""
    from twilio.request_validator import RequestValidator

    from backend.core.config import settings as _settings

    auth = "test_auth_token_phase_12_webhook"
    monkeypatch.setattr(_settings, "TWILIO_AUTH_TOKEN", auth)
    sig = RequestValidator(auth).compute_signature(
        "https://test.clarityos.app/api/webhooks/twilio", params
    )
    return params, sig


# ─── Tests ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_missing_internal_seal_returns_403(monkeypatch):
    _seal_env(monkeypatch)
    req = _fake_request(seal=None)
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await twilio_webhook(req, _fake_session())
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_invalid_twilio_signature_returns_403(monkeypatch):
    seal = _seal_env(monkeypatch)
    params = {"MessageSid": "SM_x", "MessageStatus": "delivered", "From": "+15555550100", "To": "+14155551234"}
    req = _fake_request(seal=seal, twilio_signature="bogus", form=params)
    # Set a token so we don't hit TwilioConfigError
    from backend.core.config import settings as _settings

    monkeypatch.setattr(_settings, "TWILIO_AUTH_TOKEN", "real_token")
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await twilio_webhook(req, _fake_session())
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_status_callback_marks_delivered(monkeypatch):
    seal = _seal_env(monkeypatch)
    log = _make_log(sid="SM_known_1", status="sent", status_priority=1)
    params, sig = _signed_form(monkeypatch, {
        "MessageSid": "SM_known_1", "MessageStatus": "delivered",
        "From": "+15555550100", "To": "+14155551234",
    })
    session = _fake_session(log=log)
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    resp = await twilio_webhook(req, session)
    assert resp == {"ok": True, "kind": "status"}
    assert log.status == "delivered"
    assert log.status_priority == 2
    assert log.delivered_at is not None


@pytest.mark.asyncio
async def test_status_callback_idempotent(monkeypatch):
    seal = _seal_env(monkeypatch)
    log = _make_log(sid="SM_idem", status="delivered", status_priority=2)
    log.delivered_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    params, sig = _signed_form(monkeypatch, {
        "MessageSid": "SM_idem", "MessageStatus": "delivered",
        "From": "+15555550100", "To": "+14155551234",
    })
    session = _fake_session(log=log)
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    await twilio_webhook(req, session)
    # Second delivered with same priority overwrites timestamp but status stays delivered
    assert log.status == "delivered"
    assert log.status_priority == 2


@pytest.mark.asyncio
async def test_out_of_order_lower_priority_ignored(monkeypatch):
    seal = _seal_env(monkeypatch)
    log = _make_log(sid="SM_ooo", status="delivered", status_priority=2)
    params, sig = _signed_form(monkeypatch, {
        "MessageSid": "SM_ooo", "MessageStatus": "sent",
        "From": "+15555550100", "To": "+14155551234",
    })
    session = _fake_session(log=log)
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    await twilio_webhook(req, session)
    # Stayed delivered; sent (priority 1) was rejected
    assert log.status == "delivered"
    assert log.status_priority == 2


@pytest.mark.asyncio
async def test_failed_overrides_delivered(monkeypatch):
    seal = _seal_env(monkeypatch)
    log = _make_log(sid="SM_fail", status="delivered", status_priority=2)
    log.patient_id = uuid.uuid4()
    params, sig = _signed_form(monkeypatch, {
        "MessageSid": "SM_fail", "MessageStatus": "failed",
        "ErrorMessage": "carrier rejected", "ErrorCode": "30007",
        "From": "+15555550100", "To": "+14155551234",
    })
    session = _fake_session(log=log)
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    record_bounce_mock = AsyncMock()
    monkeypatch.setattr(webhooks_module, "record_bounce", record_bounce_mock)

    await twilio_webhook(req, session)
    assert log.status == "failed"
    assert log.status_priority == 99
    assert log.failed_at is not None
    assert log.failure_reason == "carrier rejected"
    record_bounce_mock.assert_awaited_once()
    kwargs = record_bounce_mock.await_args.kwargs
    assert kwargs["patient_id"] == log.patient_id
    assert kwargs["channel"] == "sms"


@pytest.mark.asyncio
async def test_unknown_message_sid_returns_200(monkeypatch):
    seal = _seal_env(monkeypatch)
    params, sig = _signed_form(monkeypatch, {
        "MessageSid": "SM_does_not_exist", "MessageStatus": "delivered",
        "From": "+15555550100", "To": "+14155551234",
    })
    session = _fake_session(log=None)
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    resp = await twilio_webhook(req, session)
    assert resp == {"ok": True, "kind": "status"}


@pytest.mark.asyncio
async def test_inbound_non_stop_creates_inbound_message(monkeypatch):
    seal = _seal_env(monkeypatch)
    tenant = _make_tenant(twilio_phone="+14155551234")
    patient = _make_patient(phone_e164="+15555550100")
    patient.tenant_id = tenant.id
    params, sig = _signed_form(monkeypatch, {
        "MessageSid": "SM_inbound_1", "From": "+15555550100",
        "To": "+14155551234", "Body": "Yes that works for me",
    })
    session = _fake_session(patient=patient, tenants=[tenant])
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    classify_mock = AsyncMock()
    monkeypatch.setattr(
        "backend.services.messaging.classifier.classify_inbound_async",
        classify_mock,
    )

    resp = await twilio_webhook(req, session)
    assert resp == {"ok": True, "kind": "inbound"}
    assert any(isinstance(o, InboundMessage) for o in session.captured_added)
    inbound = next(o for o in session.captured_added if isinstance(o, InboundMessage))
    assert inbound.body == "Yes that works for me"
    assert inbound.from_e164 == "+15555550100"
    # Audit log added (action object, not InboundMessage)
    audit_actions = [
        a for a in session.captured_added
        if hasattr(a, "action") and not isinstance(a, InboundMessage)
    ]
    assert any(
        getattr(a, "action", None) == AuditAction.INBOUND_MESSAGE_RECEIVED.value
        for a in audit_actions
    )


@pytest.mark.asyncio
async def test_inbound_stop_records_optout(monkeypatch):
    """Canonical CRM-04 contract test (referenced from 12-VERIFICATION.md)."""
    seal = _seal_env(monkeypatch)
    tenant = _make_tenant(twilio_phone="+14155551234")
    patient = _make_patient(phone_e164="+15555550100")
    patient.tenant_id = tenant.id
    patient.contact_info_jsonb = {
        "phone_e164": "+15555550100",
        "consent_sms_marketing_at": "2026-01-01T00:00:00+00:00",
    }
    params, sig = _signed_form(monkeypatch, {
        "MessageSid": "SM_stop_1", "From": "+15555550100",
        "To": "+14155551234", "Body": "STOP",
    })
    session = _fake_session(patient=patient, tenants=[tenant])
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    resp = await twilio_webhook(req, session)
    assert resp == {"ok": True, "kind": "inbound"}
    assert patient.contact_info_jsonb["sms_opted_out_at"] is not None
    assert patient.contact_info_jsonb["consent_sms_marketing_at"] is None
    # OPT_OUT_RECORDED audit was written
    assert any(
        getattr(a, "action", None) == AuditAction.OPT_OUT_RECORDED.value
        for a in session.captured_added
    )


@pytest.mark.asyncio
async def test_inbound_returns_within_2s_when_classifier_slow(monkeypatch):
    """Pitfall 8: classifier must run in background, not block webhook ack."""
    seal = _seal_env(monkeypatch)
    tenant = _make_tenant(twilio_phone="+14155551234")
    patient = _make_patient(phone_e164="+15555550100")
    patient.tenant_id = tenant.id
    params, sig = _signed_form(monkeypatch, {
        "MessageSid": "SM_slow_1", "From": "+15555550100",
        "To": "+14155551234", "Body": "Need to reschedule",
    })
    session = _fake_session(patient=patient, tenants=[tenant])
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    async def slow_classifier(inbound_id, body):
        await asyncio.sleep(10)

    monkeypatch.setattr(
        "backend.services.messaging.classifier.classify_inbound_async",
        slow_classifier,
    )

    start = time.monotonic()
    resp = await twilio_webhook(req, session)
    elapsed = time.monotonic() - start
    assert resp["ok"] is True
    assert elapsed < 2.0


@pytest.mark.asyncio
async def test_failure_without_patient_skips_record_bounce(monkeypatch):
    """When MessageLog has no patient_id (rare), record_bounce is not called
    and the webhook still acks."""
    seal = _seal_env(monkeypatch)
    log = _make_log(sid="SM_no_pat", status="sent", status_priority=1)
    log.patient_id = None
    params, sig = _signed_form(monkeypatch, {
        "MessageSid": "SM_no_pat", "MessageStatus": "failed",
        "From": "+15555550100", "To": "+14155551234",
    })
    session = _fake_session(log=log)
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    record_bounce_mock = AsyncMock()
    monkeypatch.setattr(webhooks_module, "record_bounce", record_bounce_mock)

    resp = await twilio_webhook(req, session)
    assert resp == {"ok": True, "kind": "status"}
    assert log.status == "failed"
    record_bounce_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_no_message_sid_ignored(monkeypatch):
    seal = _seal_env(monkeypatch)
    params, sig = _signed_form(monkeypatch, {
        "From": "+15555550100", "To": "+14155551234", "MessageStatus": "delivered",
    })
    session = _fake_session()
    req = _fake_request(seal=seal, twilio_signature=sig, form=params)

    resp = await twilio_webhook(req, session)
    assert resp == {"ok": True, "ignored": "no_message_sid"}
