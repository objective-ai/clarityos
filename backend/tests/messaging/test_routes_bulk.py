"""Tests for POST /api/messaging/bulk-send + bulk_send service (Plan 12-05 Task 1)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import backend.db.models.tenant.intake  # noqa: F401  (mapper bootstrap)
from backend.api.routes import messaging as messaging_routes
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction, AuditLog
from backend.db.models.tenant.messaging import MessageLog, MessageStatus
from backend.schemas.messaging import (
    BulkRecipient as BulkRecipientSchema,
    BulkSendRequest,
)
from backend.services.messaging import bulk_send as bulk_send_service
from backend.services.messaging.bulk_send import (
    BULK_SEND_LIMIT,
    THROTTLE_SECONDS,
    BulkRecipient,
    bulk_send,
)
from backend.services.messaging.opt_out_guard import OptOutBlocked


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


class FakeSession:
    def __init__(self) -> None:
        self.added: list = []
        self.commits: int = 0

    def add(self, obj) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    def audit_logs(self) -> list[AuditLog]:
        return [o for o in self.added if isinstance(o, AuditLog)]


@pytest.fixture
def fake_session() -> FakeSession:
    return FakeSession()


@pytest.fixture
def ctx() -> TenantContext:
    return TenantContext(
        user_id=uuid4(), tenant_id=uuid4(), role="admin", plan_name="Plus"
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
            "consent_sms_marketing_at": past,
            "consent_sms_operational_at": past,
            "phone_e164": "+14155550100",
            "email": "pat@example.com",
            "preferred_language": "en",
            "timezone": "America/Los_Angeles",
        },
    }


@pytest.fixture
def template_dict():
    return {
        "id": uuid4(),
        "kind": "manual",
        "channel": "sms",
        "language": "en",
        "body": "Hi {patient_first_name}",
        "subject": None,
    }


@pytest.fixture
def tenant_dict():
    return {
        "id": uuid4(),
        "timezone": "America/Los_Angeles",
        "name": "Sunview",
        "twilio_messaging_service_sid": "MG_test",
        "twilio_phone_number": "+14155551234",
    }


# ---------------------------------------------------------------------------
# Schema-level validation
# ---------------------------------------------------------------------------


def test_bulk_send_request_rejects_51_recipients() -> None:
    """Test 8: Pydantic max_length=50 enforces the cap."""
    recipients = [BulkRecipientSchema(patient_id=uuid4()) for _ in range(51)]
    with pytest.raises(ValidationError):
        BulkSendRequest(
            recipients=recipients,
            template_id=uuid4(),
            channel="sms",
        )


# ---------------------------------------------------------------------------
# Service-level
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bulk_send_audits_batch_creation_before_first_send(
    fake_session, ctx, template_dict, tenant_dict, patient_dict, monkeypatch
) -> None:
    """Test 9: BULK_MESSAGE_BATCH_CREATED audit is committed before sends fire."""
    sent_log = MessageLog(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=patient_dict["id"],
        channel="sms",
        purpose="manual",
        recipient_e164="+14155550100",
        recipient_kind="patient",
        body="Hi",
        language="en",
        status=MessageStatus.SENT.value,
        status_priority=1,
        retry_count=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    monkeypatch.setattr(bulk_send_service, "dispatch", AsyncMock(return_value=sent_log))
    monkeypatch.setattr(
        bulk_send_service.asyncio, "sleep", AsyncMock()
    )  # skip throttle

    result = await bulk_send(
        fake_session,
        ctx,
        recipients=[BulkRecipient(patient_id=patient_dict["id"])],
        template_id=template_dict["id"],
        channel="sms",
        purpose="manual",
        fetch_patient=AsyncMock(return_value=patient_dict),
        fetch_template=AsyncMock(return_value=template_dict),
        fetch_tenant=AsyncMock(return_value=tenant_dict),
    )

    audit_rows = fake_session.audit_logs()
    assert any(
        row.action == AuditAction.BULK_MESSAGE_BATCH_CREATED.value
        for row in audit_rows
    ), f"expected BULK_MESSAGE_BATCH_CREATED audit, got {[r.action for r in audit_rows]}"
    # First commit MUST happen before the dispatch loop's per-send commit.
    # We expect at least 2 commits: 1 lock-the-audit + 1 per recipient.
    assert fake_session.commits >= 2
    assert result.sent_count == 1
    assert result.batch_id is not None


@pytest.mark.asyncio
async def test_bulk_send_throttles_one_per_second(
    fake_session, ctx, template_dict, tenant_dict, patient_dict, monkeypatch
) -> None:
    """Test 10: bulk_send sleeps THROTTLE_SECONDS between recipients."""
    sent_log = MessageLog(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=patient_dict["id"],
        channel="sms",
        purpose="manual",
        recipient_e164="+14155550100",
        recipient_kind="patient",
        body="Hi",
        language="en",
        status=MessageStatus.SENT.value,
        status_priority=1,
        retry_count=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    sleep_mock = AsyncMock()
    monkeypatch.setattr(bulk_send_service, "dispatch", AsyncMock(return_value=sent_log))
    monkeypatch.setattr(bulk_send_service.asyncio, "sleep", sleep_mock)

    recipients = [BulkRecipient(patient_id=uuid4()) for _ in range(3)]

    await bulk_send(
        fake_session,
        ctx,
        recipients=recipients,
        template_id=template_dict["id"],
        channel="sms",
        purpose="manual",
        fetch_patient=AsyncMock(return_value=patient_dict),
        fetch_template=AsyncMock(return_value=template_dict),
        fetch_tenant=AsyncMock(return_value=tenant_dict),
    )

    assert sleep_mock.await_count == 3
    for call in sleep_mock.await_args_list:
        assert call.args[0] == THROTTLE_SECONDS


@pytest.mark.asyncio
async def test_bulk_send_excludes_opt_out_separately_from_failures(
    fake_session, ctx, template_dict, tenant_dict, patient_dict, monkeypatch
) -> None:
    """OptOutBlocked → excluded_count, not failed_count."""
    monkeypatch.setattr(
        bulk_send_service,
        "dispatch",
        AsyncMock(side_effect=OptOutBlocked("opted out", code="SMS_OPTED_OUT")),
    )
    monkeypatch.setattr(bulk_send_service.asyncio, "sleep", AsyncMock())

    result = await bulk_send(
        fake_session,
        ctx,
        recipients=[BulkRecipient(patient_id=patient_dict["id"])],
        template_id=template_dict["id"],
        channel="sms",
        purpose="manual",
        fetch_patient=AsyncMock(return_value=patient_dict),
        fetch_template=AsyncMock(return_value=template_dict),
        fetch_tenant=AsyncMock(return_value=tenant_dict),
    )

    assert result.excluded_count == 1
    assert result.failed_count == 0
    assert result.sent_count == 0
    assert result.errors[0]["code"] == "SMS_OPTED_OUT"


@pytest.mark.asyncio
async def test_bulk_send_route_raises_422_above_limit(
    fake_session, ctx, monkeypatch
) -> None:
    """Service-level guard fires when caller bypasses Pydantic (defense-in-depth)."""
    too_many = [BulkRecipient(patient_id=uuid4()) for _ in range(BULK_SEND_LIMIT + 1)]

    with pytest.raises(HTTPException) as exc_info:
        await bulk_send(
            fake_session,
            ctx,
            recipients=too_many,
            template_id=uuid4(),
            channel="sms",
            purpose="manual",
            fetch_patient=AsyncMock(),
            fetch_template=AsyncMock(),
            fetch_tenant=AsyncMock(),
        )

    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_bulk_send_provider_failure_increments_failed_count(
    fake_session, ctx, template_dict, tenant_dict, patient_dict, monkeypatch
) -> None:
    """Provider returns log with status=failed → failed_count += 1, errors row recorded."""
    failed_log = MessageLog(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=patient_dict["id"],
        channel="sms",
        purpose="manual",
        recipient_e164="+14155550100",
        recipient_kind="patient",
        body="Hi",
        language="en",
        status=MessageStatus.FAILED.value,
        status_priority=99,
        retry_count=0,
        failure_reason="provider rejected",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    monkeypatch.setattr(
        bulk_send_service, "dispatch", AsyncMock(return_value=failed_log)
    )
    monkeypatch.setattr(bulk_send_service.asyncio, "sleep", AsyncMock())

    result = await bulk_send(
        fake_session,
        ctx,
        recipients=[BulkRecipient(patient_id=patient_dict["id"])],
        template_id=template_dict["id"],
        channel="sms",
        purpose="manual",
        fetch_patient=AsyncMock(return_value=patient_dict),
        fetch_template=AsyncMock(return_value=template_dict),
        fetch_tenant=AsyncMock(return_value=tenant_dict),
    )

    assert result.failed_count == 1
    assert result.sent_count == 0
    assert result.errors[0]["code"] == "PROVIDER_FAILED"
