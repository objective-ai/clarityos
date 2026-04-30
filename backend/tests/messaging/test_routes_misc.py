"""Tests for history + inbox + analytics + ai-draft routes (Plan 12-05 Task 2).

History/inbox SQL is exercised at the route level with a stubbed
AsyncSession.execute. Analytics is similarly stubbed. AI-draft uses a
mocked AsyncAnthropic client so we never reach the network.

The CRM-12 contract test (opt-out preflight runs BEFORE invoking Claude)
is the headline assertion — see ``test_ai_draft_does_not_call_claude_on_opt_out``.
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
from backend.core.security import TenantContext
from backend.db.models.tenant.messaging import InboundMessage, MessageLog, MessageStatus
from backend.schemas.messaging import AIDraftRequest
from backend.services.messaging import ai_draft as ai_draft_module
from backend.services.messaging.opt_out_guard import OptOutBlocked


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


class FakeSession:
    def __init__(self, scalars: list | None = None) -> None:
        self._scalars = scalars or []
        self.added: list = []
        self.commits = 0

    def add(self, obj) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def execute(self, stmt, params=None):
        scalars_obj = SimpleNamespace(all=lambda: self._scalars)
        return SimpleNamespace(scalars=lambda: scalars_obj)


@pytest.fixture
def ctx() -> TenantContext:
    return TenantContext(
        user_id=uuid4(), tenant_id=uuid4(), role="receptionist", plan_name="Plus"
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
            "consent_email_operational_at": past,
            "phone_e164": "+14155550100",
            "email": "pat@example.com",
            "preferred_language": "en",
        },
    }


@pytest.fixture
def tenant_dict():
    return {
        "id": uuid4(),
        "timezone": "America/Los_Angeles",
        "name": "Sunview Eye",
        "twilio_messaging_service_sid": "MG_test",
    }


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_returns_chronological_logs(ctx, patient_dict) -> None:
    """Test 6: history endpoint returns MessageLog rows newest-first."""
    log = MessageLog(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=patient_dict["id"],
        channel="sms",
        purpose="manual",
        recipient_e164="+14155550100",
        recipient_kind="patient",
        body="Hi",
        language="en",
        status=MessageStatus.DELIVERED.value,
        status_priority=2,
        retry_count=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    fake = FakeSession(scalars=[log])

    rows = await messaging_routes.history(
        patient_id=patient_dict["id"], ctx=ctx, db=fake, limit=50
    )

    assert len(rows) == 1
    assert rows[0].status == "delivered"


# ---------------------------------------------------------------------------
# Inbox
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_inbox_serializes_classification_field(ctx) -> None:
    """Test 7: inbox returns classification + classification_confidence fields."""
    inbound = InboundMessage(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        patient_id=uuid4(),
        from_e164="+14155550100",
        body="Can I reschedule?",
        classification="reschedule_request",
        classification_confidence="high",
        is_read=False,
        provider_message_id="SM_inbound_1",
        received_at=datetime.now(timezone.utc),
    )
    fake = FakeSession(scalars=[inbound])

    rows = await messaging_routes.inbox(
        ctx=ctx, db=fake, filter_classification=None, limit=50
    )

    assert len(rows) == 1
    assert rows[0]["classification"] == "reschedule_request"
    assert rows[0]["classification_confidence"] == "high"


# ---------------------------------------------------------------------------
# Analytics — verify shape only (single-aggregate response)
# ---------------------------------------------------------------------------


class _AnalyticsSession:
    """AsyncSession stub that returns canned mappings rows for each query."""

    def __init__(self) -> None:
        self.added: list = []
        self.commits = 0
        self._results = [
            # funnel
            [
                {"status": "sent", "count": 10},
                {"status": "delivered", "count": 8},
                {"status": "failed", "count": 1},
            ],
            # optout_trend
            [{"week": datetime(2026, 4, 27, tzinfo=timezone.utc), "count": 2}],
            # cost_volume
            [
                {
                    "day": datetime(2026, 4, 28, tzinfo=timezone.utc),
                    "channel": "sms",
                    "count": 7,
                    "cost_cents": 42,
                }
            ],
            # recall_conversion (returns ONE row via .one())
            {"sent": 25, "booked": 4},
        ]
        self._idx = 0

    def add(self, obj) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def execute(self, stmt, params=None):
        result = self._results[self._idx]
        self._idx += 1

        class _Mappings:
            def __init__(self, rows):
                self._rows = rows

            def all(self):
                return self._rows if isinstance(self._rows, list) else [self._rows]

            def one(self):
                return self._rows

        m = _Mappings(result)
        return SimpleNamespace(mappings=lambda: m)


@pytest.mark.asyncio
async def test_analytics_returns_kpis_funnel_optout_cost_recall(ctx) -> None:
    """Test 8: analytics returns 4 KPIs + funnel + recall + optout + cost in one shape."""
    fake = _AnalyticsSession()

    result = await messaging_routes.analytics(ctx=ctx, db=fake, range_days=30)

    assert "kpis" in result
    assert set(result["kpis"].keys()) == {
        "sent_total",
        "failed_total",
        "optouts_total",
        "cost_total_cents",
    }
    assert result["kpis"]["sent_total"] == 18  # sent + delivered
    assert result["kpis"]["failed_total"] == 1
    assert result["kpis"]["optouts_total"] == 2
    assert result["kpis"]["cost_total_cents"] == 42

    assert isinstance(result["reminder_funnel"], list)
    assert result["recall_conversion"] == {"sent": 25, "booked": 4}
    assert isinstance(result["optout_trend"], list)
    assert isinstance(result["cost_volume"], list)


# ---------------------------------------------------------------------------
# AI draft
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ai_draft_returns_body_when_consent_present(
    ctx, patient_dict, tenant_dict, monkeypatch
) -> None:
    """Test 9: ai-draft returns a body string when patient consents."""
    fake_response = SimpleNamespace(
        content=[SimpleNamespace(text="Hi Pat, your appointment is coming up.")]
    )
    fake_client = SimpleNamespace(
        messages=SimpleNamespace(create=AsyncMock(return_value=fake_response))
    )
    monkeypatch.setattr(ai_draft_module, "_get_client", lambda: fake_client)

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

    payload = AIDraftRequest(
        patient_id=patient_dict["id"],
        intent="confirm tomorrow's appointment",
        channel="sms",
        purpose="operational",
    )

    result = await messaging_routes.ai_draft_route(
        payload=payload, ctx=ctx, db=FakeSession()
    )

    assert "Hi Pat" in result.body
    fake_client.messages.create.assert_awaited_once()


@pytest.mark.asyncio
async def test_ai_draft_does_not_call_claude_on_opt_out(
    ctx, patient_dict, tenant_dict, monkeypatch
) -> None:
    """Test 10 (CRM-12 contract): preflight blocks BEFORE Anthropic is invoked."""
    # Patient has no marketing consent → marketing draft must be blocked.
    blocked_patient = {
        **patient_dict,
        "contact_info_jsonb": {
            "phone_e164": "+14155550100",
            # NO consent_sms_marketing_at — preflight will raise NO_CONSENT_SMS_MARKETING
        },
    }

    create_mock = AsyncMock()
    fake_client = SimpleNamespace(messages=SimpleNamespace(create=create_mock))
    monkeypatch.setattr(ai_draft_module, "_get_client", lambda: fake_client)

    monkeypatch.setattr(
        messaging_routes,
        "_fetch_patient",
        AsyncMock(return_value=blocked_patient),
    )
    monkeypatch.setattr(
        messaging_routes,
        "_fetch_tenant",
        AsyncMock(return_value=tenant_dict),
    )

    payload = AIDraftRequest(
        patient_id=blocked_patient["id"],
        intent="recall — time for your annual exam",
        channel="sms",
        purpose="marketing",
    )

    with pytest.raises(HTTPException) as exc_info:
        await messaging_routes.ai_draft_route(
            payload=payload, ctx=ctx, db=FakeSession()
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"].startswith("NO_CONSENT_")
    create_mock.assert_not_awaited()  # Claude was NEVER called


@pytest.mark.asyncio
async def test_ai_draft_scrubs_phi_for_operational_sms(
    ctx, patient_dict, tenant_dict, monkeypatch
) -> None:
    """Defense-in-depth: operational SMS is re-scrubbed against PHI even if Claude slips."""
    from backend.services.messaging.templates import PHIInTemplate

    fake_response = SimpleNamespace(
        content=[
            SimpleNamespace(
                # Body containing an Rx-value (OD +2.50) — scrub_phi_for_operational_sms
                # raises PHIInTemplate on this pattern.
                text="Hi Pat, your latest Rx is OD +2.50 — confirm to pick up."
            )
        ]
    )
    fake_client = SimpleNamespace(
        messages=SimpleNamespace(create=AsyncMock(return_value=fake_response))
    )
    monkeypatch.setattr(ai_draft_module, "_get_client", lambda: fake_client)

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

    payload = AIDraftRequest(
        patient_id=patient_dict["id"],
        intent="confirm appt",
        channel="sms",
        purpose="operational",
    )

    # The PHI scrubber should raise on the dollar-sign / DOB-shaped body.
    with pytest.raises(PHIInTemplate):
        await messaging_routes.ai_draft_route(
            payload=payload, ctx=ctx, db=FakeSession()
        )
