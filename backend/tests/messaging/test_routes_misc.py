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


# ---------------------------------------------------------------------------
# Templates / Settings / Preferences (Task 3)
# ---------------------------------------------------------------------------


class _ScalarOneResult:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value

    def scalar_one_or_none(self):
        return self._value


class _ScalarsAllResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return SimpleNamespace(all=lambda: self._values)


class FakeTenantSession:
    """AsyncSession that lets us inject the row returned by ``execute``.

    ``flush()`` mimics server-side defaults for newly-added rows the ORM
    would normally populate (id, created_at, updated_at) so the route can
    serialize the new template/run without a real Postgres roundtrip.
    """

    def __init__(self, row=None, rows=None) -> None:
        self.added: list = []
        self.commits = 0
        self._row = row
        self._rows = rows or []
        self.calls: list = []

    def add(self, obj) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        # Backfill defaults the live DB would populate on insert.
        from uuid import uuid4 as _uuid4

        now = datetime.now(timezone.utc)
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = _uuid4()
            if hasattr(obj, "created_at") and obj.created_at is None:
                obj.created_at = now
            if hasattr(obj, "updated_at") and obj.updated_at is None:
                obj.updated_at = now

    async def commit(self) -> None:
        self.commits += 1

    async def execute(self, stmt, params=None):
        self.calls.append(stmt)
        if self._rows:
            return _ScalarsAllResult(self._rows)
        return _ScalarOneResult(self._row)

    def audit_actions(self) -> list[str]:
        from backend.db.models.tenant.clinical import AuditLog

        return [o.action for o in self.added if isinstance(o, AuditLog)]


@pytest.mark.asyncio
async def test_list_templates_returns_all(ctx, monkeypatch) -> None:
    """Test 11: GET /templates returns all templates for tenant."""
    from backend.db.models.tenant.messaging import MessageTemplate

    template = MessageTemplate(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        kind="reminder_24h",
        channel="sms",
        language="en",
        body="Reminder: {patient_first_name}",
        is_default=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    fake = FakeTenantSession(rows=[template])

    rows = await messaging_routes.list_templates(ctx=ctx, db=fake)

    assert len(rows) == 1
    assert rows[0].kind == "reminder_24h"


@pytest.mark.asyncio
async def test_create_template_emits_audit(ctx) -> None:
    """Test 12: POST /templates emits TEMPLATE_CREATED audit."""
    from backend.schemas.messaging import MessageTemplateCreate

    fake = FakeTenantSession()
    payload = MessageTemplateCreate(
        kind="manual",
        channel="sms",
        language="en",
        body="Hi {patient_first_name}",
    )

    result = await messaging_routes.create_template(
        payload=payload, ctx=ctx, db=fake
    )

    assert "template_created" in fake.audit_actions()
    assert result.kind == "manual"


@pytest.mark.asyncio
async def test_update_template_emits_audit(ctx) -> None:
    """Test 13: PATCH /templates/{id} emits TEMPLATE_UPDATED audit."""
    from backend.db.models.tenant.messaging import MessageTemplate
    from backend.schemas.messaging import MessageTemplateUpdate

    template = MessageTemplate(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        kind="manual",
        channel="sms",
        language="en",
        body="Old body",
        is_default=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    fake = FakeTenantSession(row=template)

    payload = MessageTemplateUpdate(body="New body")
    result = await messaging_routes.update_template(
        template_id=template.id, payload=payload, ctx=ctx, db=fake
    )

    assert template.body == "New body"
    assert "template_updated" in fake.audit_actions()
    assert result.body == "New body"


@pytest.mark.asyncio
async def test_delete_template_soft_deletes(ctx) -> None:
    """Test 14: DELETE /templates/{id} sets deleted_at + emits audit."""
    from backend.db.models.tenant.messaging import MessageTemplate

    template = MessageTemplate(
        id=uuid4(),
        tenant_id=ctx.tenant_id,
        kind="manual",
        channel="sms",
        language="en",
        body="x",
        is_default=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    fake = FakeTenantSession(row=template)

    await messaging_routes.delete_template(
        template_id=template.id, ctx=ctx, db=fake
    )

    assert template.deleted_at is not None
    assert "template_updated" in fake.audit_actions()


@pytest.mark.asyncio
async def test_get_settings_reads_messaging_block(ctx, monkeypatch) -> None:
    """Test 15: GET /settings returns messaging settings."""
    monkeypatch.setattr(
        messaging_routes,
        "_fetch_tenant",
        AsyncMock(
            return_value={
                "id": ctx.tenant_id,
                "timezone": "America/Los_Angeles",
                "name": "Sunview",
                "messaging_enabled": True,
                "daily_sms_cap_cents": 5000,
                "twilio_phone_number": "+14155551234",
                "twilio_messaging_service_sid": "MG_test",
                "resend_from_email": None,
            }
        ),
    )

    result = await messaging_routes.get_settings(ctx=ctx, db=FakeTenantSession())

    assert result.messaging_enabled is True
    assert result.daily_sms_cap_cents == 5000


@pytest.mark.asyncio
async def test_update_settings_emits_messaging_enabled_audit(ctx) -> None:
    """Test 16: PATCH /settings emits MESSAGING_ENABLED when toggling on."""
    from backend.db.models.public.saas import Tenant
    from backend.schemas.messaging import MessagingSettingsUpdate

    tenant = Tenant(
        id=ctx.tenant_id,
        name="Sunview",
        slug="sunview",
        schema_name="clinic_sunview",
        settings_jsonb={"messaging": {"messaging_enabled": False}},
    )
    fake = FakeTenantSession(row=tenant)

    payload = MessagingSettingsUpdate(messaging_enabled=True)
    result = await messaging_routes.update_settings(
        payload=payload, ctx=ctx, db=fake
    )

    assert result.messaging_enabled is True
    assert "messaging_enabled" in fake.audit_actions()


@pytest.mark.asyncio
async def test_update_settings_emits_messaging_disabled_audit(ctx) -> None:
    """Test 17: PATCH /settings emits MESSAGING_DISABLED when toggling off."""
    from backend.db.models.public.saas import Tenant
    from backend.schemas.messaging import MessagingSettingsUpdate

    tenant = Tenant(
        id=ctx.tenant_id,
        name="Sunview",
        slug="sunview",
        schema_name="clinic_sunview",
        settings_jsonb={"messaging": {"messaging_enabled": True}},
    )
    fake = FakeTenantSession(row=tenant)

    payload = MessagingSettingsUpdate(messaging_enabled=False)
    await messaging_routes.update_settings(payload=payload, ctx=ctx, db=fake)

    assert "messaging_disabled" in fake.audit_actions()


@pytest.mark.asyncio
async def test_get_preferences_projects_consents(ctx, patient_dict, monkeypatch) -> None:
    """Test 18: GET /preferences/{patient_id} returns ChannelPreferenceOut."""
    monkeypatch.setattr(
        messaging_routes,
        "_fetch_patient",
        AsyncMock(return_value=patient_dict),
    )

    result = await messaging_routes.get_preferences(
        patient_id=patient_dict["id"], ctx=ctx, db=FakeTenantSession()
    )

    assert result.consents.sms_marketing is True
    assert result.consents.sms_operational is True
    assert result.preferred_channel == "both"


@pytest.mark.asyncio
async def test_update_preferences_emits_consent_granted(ctx, patient_dict) -> None:
    """Test 19: PATCH /preferences grants new email_marketing consent → CONSENT_GRANTED audit."""
    from backend.db.models.tenant.clinical import Patient
    from backend.schemas.messaging import (
        ChannelPreferenceUpdate,
        ConsentFlagsOut,
    )

    patient = Patient(
        id=patient_dict["id"],
        tenant_id=ctx.tenant_id,
        first_name="Pat",
        last_name="Doe",
        dob=datetime(1980, 5, 1).date(),
        sex="female",
        chart_number=1001,
        contact_info_jsonb={
            "consent_sms_operational_at": "2025-01-01T00:00:00+00:00",
            # NO email_marketing consent yet — patch will grant it
        },
    )
    fake = FakeTenantSession(row=patient)

    payload = ChannelPreferenceUpdate(
        consents=ConsentFlagsOut(email_marketing=True, sms_operational=True),
    )

    await messaging_routes.update_preferences(
        patient_id=patient_dict["id"], payload=payload, ctx=ctx, db=fake
    )

    actions = fake.audit_actions()
    assert "channel_preference_updated" in actions
    assert "consent_granted" in actions


@pytest.mark.asyncio
async def test_update_preferences_emits_consent_revoked(ctx, patient_dict) -> None:
    """Test 20: PATCH /preferences sending sms_operational=False revokes existing consent."""
    from backend.db.models.tenant.clinical import Patient
    from backend.schemas.messaging import (
        ChannelPreferenceUpdate,
        ConsentFlagsOut,
    )

    patient = Patient(
        id=patient_dict["id"],
        tenant_id=ctx.tenant_id,
        first_name="Pat",
        last_name="Doe",
        dob=datetime(1980, 5, 1).date(),
        sex="female",
        chart_number=1002,
        contact_info_jsonb={
            "consent_sms_operational_at": "2025-01-01T00:00:00+00:00",
        },
    )
    fake = FakeTenantSession(row=patient)

    payload = ChannelPreferenceUpdate(
        consents=ConsentFlagsOut(sms_operational=False),
    )

    await messaging_routes.update_preferences(
        patient_id=patient_dict["id"], payload=payload, ctx=ctx, db=fake
    )

    actions = fake.audit_actions()
    assert "channel_preference_updated" in actions
    assert "consent_revoked" in actions
    # Underlying timestamp was cleared
    assert patient.contact_info_jsonb["consent_sms_operational_at"] is None
