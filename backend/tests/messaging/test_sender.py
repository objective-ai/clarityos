"""Tests for backend/services/messaging/sender.py — the choke-point dispatcher.

Verifies the 8-step guard chain end-to-end. Heavy DB pieces (cost cap reservation,
flush) and provider SDK calls are patched so tests stay fast and dep-free.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from backend.core.security import TenantContext
# Import all tenant ORM modules so SQLAlchemy can resolve cross-module
# relationships (e.g. Appointment → IntakeToken) before we instantiate
# MessageLog / AuditLog and trigger mapper configuration.
import backend.db.models.tenant.intake  # noqa: F401  (mapper bootstrap)
from backend.db.models.tenant.clinical import AuditLog
from backend.db.models.tenant.messaging import MessageLog, MessageStatus
from backend.services.messaging import sender as sender_module
from backend.services.messaging.cost_cap import CostCapExceeded, Reservation
from backend.services.messaging.opt_out_guard import OptOutBlocked
from backend.services.messaging.recipient_resolver import NoValidRecipient
from backend.services.messaging.sender import DispatchRequest, dispatch
from backend.services.messaging.templates import PHIInTemplate


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


class FakeSession:
    """Minimal AsyncSession stand-in capturing add() / flush()."""

    def __init__(self):
        self.added: list = []

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        return None

    def message_logs(self) -> list[MessageLog]:
        return [o for o in self.added if isinstance(o, MessageLog)]

    def audit_logs(self) -> list[AuditLog]:
        return [o for o in self.added if isinstance(o, AuditLog)]


@pytest.fixture
def fake_session():
    return FakeSession()


@pytest.fixture
def ctx():
    return TenantContext(user_id=uuid4(), tenant_id=uuid4(), role="receptionist")


@pytest.fixture
def consented_patient():
    """An adult patient with sms+email operational consent and a phone."""
    past = datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat()
    return {
        "id": uuid4(),
        "first_name": "Pat",
        "last_name": "Doe",
        "dob": "1980-05-01",
        "phone_e164": "+14155550100",
        "email": "pat@example.com",
        "contact_info_jsonb": {
            "consent_sms_operational_at": past,
            "consent_sms_marketing_at": past,
            "consent_email_operational_at": past,
            "consent_email_marketing_at": past,
            "timezone": "America/Los_Angeles",
        },
    }


@pytest.fixture
def tenant_dict():
    return {
        "id": uuid4(),
        "timezone": "America/Los_Angeles",
        "twilio_messaging_service_sid": "MG_test",
    }


@pytest.fixture(autouse=True)
def _patch_provider_and_costcap(monkeypatch):
    """Patch provider sends + cost_cap to keep dispatch pure-orchestration in tests."""
    # Default: business hours so quiet_hours doesn't defer (override per-test if needed).
    monkeypatch.setattr(
        sender_module,
        "is_in_quiet_hours",
        MagicMock(return_value=False),
    )

    # Stub send_sms / send_email — capture call count + args
    monkeypatch.setattr(
        sender_module,
        "send_sms",
        AsyncMock(return_value="SM_test_message_sid"),
    )
    monkeypatch.setattr(
        sender_module,
        "send_email",
        AsyncMock(return_value="postmark-msg-id"),
    )

    # Cost cap reserve/refund: bypass DB
    monkeypatch.setattr(
        sender_module,
        "reserve_spend_or_raise",
        AsyncMock(return_value=Reservation(id=uuid4(), cost_cents=1, channel="sms", override=False)),
    )
    monkeypatch.setattr(
        sender_module,
        "refund_reservation",
        AsyncMock(return_value=None),
    )


def _req(patient, tenant, **overrides):
    base = dict(
        tenant_id=tenant["id"],
        patient_id=patient["id"],
        channel="sms",
        purpose="operational",
        body_override="Hi {{patient_first_name}}, your appointment is at {{appt_time}}.",
        tokens={"patient_first_name": "Pat", "appt_time": "9am"},
    )
    base.update(overrides)
    return DispatchRequest(**base)


# -----------------------------------------------------------------------------
# Tests
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_writes_log_and_calls_provider(
    fake_session, ctx, consented_patient, tenant_dict
):
    """Test 1: dispatch happy path — MessageLog with status=sent + provider call + audit."""
    req = _req(consented_patient, tenant_dict)
    log = await dispatch(
        fake_session, ctx, req,
        patient=consented_patient, tenant=tenant_dict,
    )
    assert log.status == MessageStatus.SENT.value
    assert log.provider_message_id == "SM_test_message_sid"
    assert log.recipient_e164 == "+14155550100"
    assert log.body == "Hi Pat, your appointment is at 9am."
    sender_module.send_sms.assert_awaited_once()
    audits = fake_session.audit_logs()
    assert len(audits) == 1
    assert audits[0].action == "message_sent"


@pytest.mark.asyncio
async def test_opt_out_blocks_send(fake_session, ctx, consented_patient, tenant_dict):
    """Test 2: opt-out blocks → no MessageLog, no provider call."""
    consented_patient["contact_info_jsonb"]["sms_opted_out_at"] = (
        datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat()
    )
    req = _req(consented_patient, tenant_dict)
    with pytest.raises(OptOutBlocked):
        await dispatch(fake_session, ctx, req,
                       patient=consented_patient, tenant=tenant_dict)
    assert fake_session.message_logs() == []
    assert fake_session.audit_logs() == []
    sender_module.send_sms.assert_not_awaited()


@pytest.mark.asyncio
async def test_quiet_hours_defers_log(
    fake_session, ctx, consented_patient, tenant_dict, monkeypatch
):
    """Test 3: in quiet hours + no force → status=deferred, deferred_until set, no provider call."""
    monkeypatch.setattr(sender_module, "is_in_quiet_hours", MagicMock(return_value=True))
    deferred_to = datetime(2026, 5, 2, 15, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(
        sender_module, "next_allowed_window", MagicMock(return_value=deferred_to)
    )

    req = _req(consented_patient, tenant_dict)
    log = await dispatch(fake_session, ctx, req,
                        patient=consented_patient, tenant=tenant_dict)

    assert log.status == MessageStatus.DEFERRED.value
    assert log.deferred_until == deferred_to
    sender_module.send_sms.assert_not_awaited()
    audits = fake_session.audit_logs()
    assert audits[0].action == "message_deferred"


@pytest.mark.asyncio
async def test_force_outside_quiet_hours_sends_anyway(
    fake_session, ctx, consented_patient, tenant_dict, monkeypatch
):
    """Test 4: force_outside_quiet_hours=True → provider IS called even mid-quiet."""
    monkeypatch.setattr(sender_module, "is_in_quiet_hours", MagicMock(return_value=True))
    req = _req(consented_patient, tenant_dict, force_outside_quiet_hours=True)
    log = await dispatch(fake_session, ctx, req,
                        patient=consented_patient, tenant=tenant_dict)
    assert log.status == MessageStatus.SENT.value
    sender_module.send_sms.assert_awaited_once()


@pytest.mark.asyncio
async def test_cost_cap_exceeded_blocks_send(
    fake_session, ctx, consented_patient, tenant_dict, monkeypatch
):
    """Test 5: cost cap raises → no provider call, no MessageLog."""
    monkeypatch.setattr(
        sender_module,
        "reserve_spend_or_raise",
        AsyncMock(side_effect=CostCapExceeded("nope")),
    )
    req = _req(consented_patient, tenant_dict)
    with pytest.raises(CostCapExceeded):
        await dispatch(fake_session, ctx, req,
                       patient=consented_patient, tenant=tenant_dict)
    assert fake_session.message_logs() == []
    sender_module.send_sms.assert_not_awaited()


@pytest.mark.asyncio
async def test_phi_in_operational_sms_blocks(
    fake_session, ctx, consented_patient, tenant_dict
):
    """Test 6: operational SMS containing PHI → PHIInTemplate raised, no log/provider."""
    req = _req(
        consented_patient, tenant_dict,
        body_override="Reminder: your glaucoma drops appointment at {{appt_time}}",
        tokens={"appt_time": "9am"},
    )
    with pytest.raises(PHIInTemplate):
        await dispatch(fake_session, ctx, req,
                       patient=consented_patient, tenant=tenant_dict)
    assert fake_session.message_logs() == []
    sender_module.send_sms.assert_not_awaited()


@pytest.mark.asyncio
async def test_provider_failure_marks_log_failed_and_refunds(
    fake_session, ctx, consented_patient, tenant_dict, monkeypatch
):
    """Test 7: provider exception → status=failed + failure_reason + refund called."""
    monkeypatch.setattr(
        sender_module,
        "send_sms",
        AsyncMock(side_effect=RuntimeError("twilio 500")),
    )
    req = _req(consented_patient, tenant_dict)
    log = await dispatch(fake_session, ctx, req,
                        patient=consented_patient, tenant=tenant_dict)

    assert log.status == MessageStatus.FAILED.value
    assert "twilio 500" in (log.failure_reason or "")
    assert log.failed_at is not None
    sender_module.refund_reservation.assert_awaited_once()


@pytest.mark.asyncio
async def test_template_tokens_replaced_before_provider_call(
    fake_session, ctx, consented_patient, tenant_dict
):
    """Test 8: rendered body (with tokens replaced) is what reaches the provider."""
    req = _req(
        consented_patient, tenant_dict,
        body_override="Hi {{patient_first_name}}, see you {{appt_date}}.",
        tokens={"patient_first_name": "Pat", "appt_date": "Friday"},
    )
    await dispatch(fake_session, ctx, req,
                   patient=consented_patient, tenant=tenant_dict)
    call_kwargs = sender_module.send_sms.await_args.kwargs
    assert call_kwargs["body"] == "Hi Pat, see you Friday."


@pytest.mark.asyncio
async def test_batch_id_recorded_on_log_and_audit(
    fake_session, ctx, consented_patient, tenant_dict
):
    """Test 9: batch_id propagates to MessageLog + AuditLog metadata."""
    batch_id = uuid4()
    req = _req(consented_patient, tenant_dict, batch_id=batch_id)
    log = await dispatch(fake_session, ctx, req,
                        patient=consented_patient, tenant=tenant_dict)

    assert log.batch_id == batch_id
    audit = fake_session.audit_logs()[0]
    assert audit.metadata_["batch_id"] == str(batch_id)


@pytest.mark.asyncio
async def test_message_log_and_audit_added_in_same_session_no_commit(
    fake_session, ctx, consented_patient, tenant_dict
):
    """Test 10: MessageLog + AuditLog both reach the session before any commit.

    Clinical-safety rule: writes happen in the primary TXN. We assert this by
    checking both objects appear in `session.added` (the dispatch never commits).
    """
    req = _req(consented_patient, tenant_dict)
    await dispatch(fake_session, ctx, req,
                   patient=consented_patient, tenant=tenant_dict)
    assert len(fake_session.message_logs()) == 1
    assert len(fake_session.audit_logs()) == 1


def test_choke_point_invariant_no_other_module_calls_sdks():
    """Test 11 (choke-point): no module in services/messaging/ except adapters
    references twilio.rest.Client or postmarker.core.PostmarkClient SDKs directly.
    """
    bad_patterns = [
        re.compile(r"twilio\.rest\.Client\b"),
        re.compile(r"postmarker\.core\.PostmarkClient\b"),
    ]
    allowed_files = {"twilio_client.py", "email_client.py"}
    base = "backend/services/messaging"
    violations: list[tuple[str, str]] = []
    for fname in os.listdir(base):
        if not fname.endswith(".py") or fname in allowed_files:
            continue
        with open(os.path.join(base, fname), encoding="utf-8") as f:
            src = f.read()
        for pat in bad_patterns:
            if pat.search(src):
                violations.append((fname, pat.pattern))
    assert not violations, f"Choke point violated: {violations}"


@pytest.mark.asyncio
async def test_minor_recipient_routes_to_guardian(
    fake_session, ctx, consented_patient, tenant_dict
):
    """Recipient resolver integration: minor → guardian phone in MessageLog + provider call."""
    consented_patient["dob"] = "2015-05-01"  # ~11 years old
    consented_patient["guardian"] = {
        "name": "Mom Doe",
        "phone_e164": "+14155559999",
        "email": "mom@example.com",
    }
    req = _req(consented_patient, tenant_dict)
    log = await dispatch(fake_session, ctx, req,
                        patient=consented_patient, tenant=tenant_dict)
    assert log.recipient_e164 == "+14155559999"
    assert log.recipient_kind == "guardian"
    call_kwargs = sender_module.send_sms.await_args.kwargs
    assert call_kwargs["to"] == "+14155559999"


@pytest.mark.asyncio
async def test_minor_no_guardian_phone_raises(
    fake_session, ctx, consented_patient, tenant_dict
):
    consented_patient["dob"] = "2015-05-01"
    consented_patient["guardian"] = {"name": "Mom", "email": "mom@e.com"}
    req = _req(consented_patient, tenant_dict)
    with pytest.raises(NoValidRecipient):
        await dispatch(fake_session, ctx, req,
                       patient=consented_patient, tenant=tenant_dict)


@pytest.mark.asyncio
async def test_email_channel_uses_send_email_with_html(
    fake_session, ctx, consented_patient, tenant_dict
):
    """Email branch: send_email called with subject + html + idempotency key."""
    req = _req(
        consented_patient, tenant_dict,
        channel="email",
        subject="Your appointment",
        body_override="<p>Hi {{patient_first_name}}</p>",
        tokens={"patient_first_name": "Pat"},
        rendered_html="<html><body><p>Hi Pat</p></body></html>",
    )
    log = await dispatch(fake_session, ctx, req,
                        patient=consented_patient, tenant=tenant_dict)
    assert log.status == MessageStatus.SENT.value
    sender_module.send_email.assert_awaited_once()
    call_kwargs = sender_module.send_email.await_args.kwargs
    assert call_kwargs["to"] == "pat@example.com"
    assert call_kwargs["subject"] == "Your appointment"
    assert call_kwargs["html"] == "<html><body><p>Hi Pat</p></body></html>"
    assert call_kwargs["idempotency_key"] == str(log.id)
