"""Tests for POST /api/messaging/send (Plan 12-05 Task 1).

Direct-handler invocation pattern (per feedback_contract_tests.md and
test_twilio_webhook.py / test_postmark_webhook.py): we call the route
function directly with a FakeSession and monkeypatch the helper fetchers
so we don't need a live Postgres or full-app TestClient.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

import backend.db.models.tenant.intake  # noqa: F401  (mapper bootstrap)
from backend.api.routes import messaging as messaging_routes
from backend.core.entitlements import Entitlement, has_entitlement, require_entitlement
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction
from backend.db.models.tenant.messaging import MessageLog, MessageStatus
from backend.schemas.messaging import SingleSendRequest
from backend.services.messaging.cost_cap import CostCapExceeded
from backend.services.messaging.opt_out_guard import OptOutBlocked


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


class FakeSession:
    """Minimal AsyncSession capturing add() / flush() / commit() calls."""

    def __init__(self) -> None:
        self.added: list = []
        self.commits: int = 0

    def add(self, obj) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1


@pytest.fixture
def fake_session() -> FakeSession:
    return FakeSession()


@pytest.fixture
def ctx() -> TenantContext:
    return TenantContext(
        user_id=uuid4(),
        tenant_id=uuid4(),
        role="receptionist",
        plan_name="Plus",
    )


@pytest.fixture
def patient_dict():
    past = datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat()
    return {
        "id": uuid4(),
        "first_name": "Pat",
        "last_name": "Doe",
        "dob": "1980-05-01",
        "phone_e164": "+14155550100",
        "email": "pat@example.com",
        "guardian": None,
        "contact_info_jsonb": {
            "consent_sms_operational_at": past,
            "consent_sms_marketing_at": past,
            "consent_email_operational_at": past,
            "consent_email_marketing_at": past,
            "phone_e164": "+14155550100",
            "email": "pat@example.com",
            "timezone": "America/Los_Angeles",
        },
    }


@pytest.fixture
def tenant_dict():
    return {
        "id": uuid4(),
        "timezone": "America/Los_Angeles",
        "name": "Sunview Eye",
        "twilio_messaging_service_sid": "MG_test",
        "twilio_phone_number": "+14155551234",
        "messaging_enabled": True,
    }


@pytest.fixture(autouse=True)
def _patch_fetchers(monkeypatch, patient_dict, tenant_dict):
    """Stub the DB fetchers so route logic runs without a real session."""
    monkeypatch.setattr(
        messaging_routes,
        "_fetch_patient",
        AsyncMock(return_value=patient_dict),
    )
    monkeypatch.setattr(
        messaging_routes,
        "_fetch_tenant",
        AsyncMock(return_value=tenant_dict),
    )
    monkeypatch.setattr(
        messaging_routes,
        "_fetch_template",
        AsyncMock(return_value=None),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_happy_path_returns_message_log(
    fake_session, ctx, patient_dict, monkeypatch
) -> None:
    """Test 1: POST /api/messaging/send returns a MessageLog when consented."""
    sent_log = MessageLog(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=patient_dict["id"],
        channel="sms",
        purpose="manual",
        recipient_e164="+14155550100",
        recipient_kind="patient",
        body="Reminder",
        language="en",
        status=MessageStatus.SENT.value,
        status_priority=1,
        retry_count=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    dispatch_mock = AsyncMock(return_value=sent_log)
    monkeypatch.setattr(messaging_routes, "dispatch", dispatch_mock)
    record_bounce_mock = AsyncMock()
    monkeypatch.setattr(messaging_routes, "record_bounce", record_bounce_mock)

    payload = SingleSendRequest(
        patient_id=patient_dict["id"],
        channel="sms",
        purpose="manual",
        body="Reminder",
    )

    result = await messaging_routes.send_message(payload, ctx, fake_session)

    assert result.status == "sent"
    assert dispatch_mock.await_count == 1
    record_bounce_mock.assert_not_awaited()
    assert fake_session.commits == 1


@pytest.mark.asyncio
async def test_send_returns_403_when_plan_lacks_messaging(ctx) -> None:
    """Test 2: Caller on Core plan is blocked by require_entitlement."""
    core_ctx = TenantContext(
        user_id=ctx.user_id,
        tenant_id=ctx.tenant_id,
        role="receptionist",
        plan_name="Core",
    )
    assert not has_entitlement(core_ctx.plan_name, Entitlement.MESSAGING)

    dep = require_entitlement(Entitlement.MESSAGING.value)
    with pytest.raises(HTTPException) as exc_info:
        await dep(core_ctx)

    assert exc_info.value.status_code == 403
    detail = exc_info.value.detail
    assert detail["entitlement"] == "messaging"
    assert detail["plan"] == "Core"


def test_send_validation_rejects_missing_patient_id() -> None:
    """Test 3: Pydantic raises 422-equivalent on missing patient_id."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        SingleSendRequest(channel="sms", body="hi")  # type: ignore[arg-type]


def test_send_validation_rejects_empty_body() -> None:
    """Test 4: Empty body fails the field validator."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        SingleSendRequest(patient_id=uuid4(), channel="sms", body="   ")


@pytest.mark.asyncio
async def test_send_returns_409_on_opt_out_blocked(
    fake_session, ctx, patient_dict, monkeypatch
) -> None:
    """Test 5: OptOutBlocked → 409 with structured detail."""
    monkeypatch.setattr(
        messaging_routes,
        "dispatch",
        AsyncMock(side_effect=OptOutBlocked("opted out", code="SMS_OPTED_OUT")),
    )
    payload = SingleSendRequest(
        patient_id=patient_dict["id"], channel="sms", body="Reminder"
    )

    with pytest.raises(HTTPException) as exc_info:
        await messaging_routes.send_message(payload, ctx, fake_session)

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "SMS_OPTED_OUT"


@pytest.mark.asyncio
async def test_send_returns_429_on_cost_cap(
    fake_session, ctx, patient_dict, monkeypatch
) -> None:
    """Test 6: CostCapExceeded → 429 COST_CAP_EXCEEDED."""
    monkeypatch.setattr(
        messaging_routes,
        "dispatch",
        AsyncMock(side_effect=CostCapExceeded("daily cap hit")),
    )
    payload = SingleSendRequest(
        patient_id=patient_dict["id"], channel="sms", body="Reminder"
    )

    with pytest.raises(HTTPException) as exc_info:
        await messaging_routes.send_message(payload, ctx, fake_session)

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["code"] == "COST_CAP_EXCEEDED"


@pytest.mark.asyncio
async def test_send_invokes_record_bounce_on_provider_failure(
    fake_session, ctx, patient_dict, monkeypatch
) -> None:
    """Test 7: log.status == 'failed' triggers record_bounce (CRM-20 sync path)."""
    failed_log = MessageLog(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=patient_dict["id"],
        channel="sms",
        purpose="manual",
        recipient_e164="+14155550100",
        recipient_kind="patient",
        body="Reminder",
        language="en",
        status=MessageStatus.FAILED.value,
        status_priority=99,
        retry_count=0,
        failure_reason="twilio rejected",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    monkeypatch.setattr(
        messaging_routes,
        "dispatch",
        AsyncMock(return_value=failed_log),
    )
    record_bounce_mock = AsyncMock()
    monkeypatch.setattr(messaging_routes, "record_bounce", record_bounce_mock)

    payload = SingleSendRequest(
        patient_id=patient_dict["id"], channel="sms", body="Reminder"
    )

    await messaging_routes.send_message(payload, ctx, fake_session)

    record_bounce_mock.assert_awaited_once()
    call = record_bounce_mock.await_args
    assert call.kwargs["patient_id"] == patient_dict["id"]
    assert call.kwargs["channel"] == "sms"


@pytest.mark.asyncio
async def test_send_requires_body_or_template(fake_session, ctx, patient_dict) -> None:
    """Test 7b: 422 when neither body nor template_id provided."""
    payload = SingleSendRequest(patient_id=patient_dict["id"], channel="sms")

    with pytest.raises(HTTPException) as exc_info:
        await messaging_routes.send_message(payload, ctx, fake_session)

    assert exc_info.value.status_code == 422
