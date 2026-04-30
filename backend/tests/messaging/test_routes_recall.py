"""Tests for /api/messaging/recall-queue + recall service (Plan 12-05 Task 2).

The candidate query itself is exercised via SQL-shape contracts (we don't
spin up Postgres in unit tests). The batch-run path is exercised against
``run_recall_batch`` with mocked ``service_bulk_send`` so we can verify
the per-patient touch-count + ``recall_exhausted`` semantics.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

import backend.db.models.tenant.intake  # noqa: F401  (mapper bootstrap)
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction, AuditLog, Patient
from backend.db.models.tenant.messaging import RecallQueueRun
from backend.services.messaging import bulk_send as bulk_send_service
from backend.services.messaging import recall as recall_module
from backend.services.messaging.bulk_send import BulkResult


# ---------------------------------------------------------------------------
# Fixtures — fake AsyncSession that satisfies recall.py's call surface
# ---------------------------------------------------------------------------


class _ScalarOneOrNoneResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _RowsResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return list(self._rows)


class FakeRecallSession:
    """AsyncSession stand-in.

    Every ``execute`` call returns a result that yields the *same* patient
    via ``scalar_one_or_none``. Tests that need multiple distinct patients
    pass a list and the fake rotates through it.
    """

    def __init__(self, patients: list) -> None:
        self.added: list = []
        self.commits = 0
        self._patients = list(patients)
        self._call_idx = 0

    def add(self, obj) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.commits += 1

    async def execute(self, stmt, params=None):
        # recall.py loops over candidate IDs and runs a select(Patient) per ID.
        # Two passes happen: (a) build BulkRecipients, (b) update touch counts.
        idx = self._call_idx % len(self._patients) if self._patients else 0
        self._call_idx += 1
        value = self._patients[idx] if self._patients else None
        return _ScalarOneOrNoneResult(value)

    def audit_logs(self) -> list[AuditLog]:
        return [o for o in self.added if isinstance(o, AuditLog)]

    def runs(self) -> list[RecallQueueRun]:
        return [o for o in self.added if isinstance(o, RecallQueueRun)]


@pytest.fixture(autouse=True)
def _stub_flag_modified(monkeypatch):
    """recall.py calls flag_modified(patient, ...) — no-op for plain SimpleNamespace patients."""
    monkeypatch.setattr(recall_module, "flag_modified", lambda *a, **k: None)


@pytest.fixture
def ctx() -> TenantContext:
    return TenantContext(
        user_id=uuid4(), tenant_id=uuid4(), role="receptionist", plan_name="Plus"
    )


def _make_patient(touch_count: int = 0, exhausted: bool = False):
    """Plain object — recall.py needs id/first_name/contact_info_jsonb only."""
    return SimpleNamespace(
        id=uuid4(),
        first_name="Pat",
        last_name="Doe",
        tenant_id=uuid4(),
        contact_info_jsonb={
            "phone_e164": "+14155550100",
            "email": "pat@example.com",
            "consent_sms_marketing_at": "2025-01-01T00:00:00+00:00",
            "recall_touch_count": touch_count,
            "recall_exhausted": exhausted,
            "preferred_language": "en",
        },
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_recall_batch_creates_run_row_and_audits(ctx, monkeypatch) -> None:
    """Test 4: send-all creates a RecallQueueRun + audit + dispatches via bulk_send."""
    p = _make_patient()
    fake = FakeRecallSession([p])

    bulk_result = BulkResult(
        batch_id=uuid4(), sent_count=1, failed_count=0, excluded_count=0, errors=[]
    )
    monkeypatch.setattr(
        recall_module,
        "service_bulk_send",
        AsyncMock(return_value=bulk_result),
    )

    run = await recall_module.run_recall_batch(
        fake,
        ctx,
        candidate_patient_ids=[p.id],
        template_id=uuid4(),
        channel="sms",
        fetch_patient=AsyncMock(return_value={"id": p.id, "contact_info_jsonb": p.contact_info_jsonb}),
        fetch_template=AsyncMock(return_value={"id": uuid4(), "kind": "recall_m12", "channel": "sms", "language": "en", "body": "Hi", "subject": None}),
        fetch_tenant=AsyncMock(return_value={"id": uuid4(), "timezone": "America/Los_Angeles", "name": "Sunview"}),
    )

    assert run.candidate_count == 1
    assert run.sent_count == 1
    assert run.failed_count == 0
    audit_actions = {row.action for row in fake.audit_logs()}
    assert AuditAction.RECALL_QUEUE_RUN_STARTED.value in audit_actions
    assert AuditAction.RECALL_QUEUE_RUN_COMPLETED.value in audit_actions


@pytest.mark.asyncio
async def test_run_recall_batch_marks_exhausted_after_second_touch(
    ctx, monkeypatch
) -> None:
    """Test 5: 2nd touch flips recall_exhausted=true so patient drops out next query."""
    p = _make_patient(touch_count=1, exhausted=False)
    fake = FakeRecallSession([p])

    bulk_result = BulkResult(
        batch_id=uuid4(), sent_count=1, failed_count=0, excluded_count=0, errors=[]
    )
    monkeypatch.setattr(
        recall_module,
        "service_bulk_send",
        AsyncMock(return_value=bulk_result),
    )

    await recall_module.run_recall_batch(
        fake,
        ctx,
        candidate_patient_ids=[p.id],
        template_id=uuid4(),
        channel="sms",
        fetch_patient=AsyncMock(return_value={"id": p.id, "contact_info_jsonb": p.contact_info_jsonb}),
        fetch_template=AsyncMock(return_value={"id": uuid4(), "kind": "recall_m14", "channel": "sms", "language": "en", "body": "Hi", "subject": None}),
        fetch_tenant=AsyncMock(return_value={"id": uuid4(), "timezone": "America/Los_Angeles", "name": "Sunview"}),
    )

    assert p.contact_info_jsonb["recall_touch_count"] == 2
    assert p.contact_info_jsonb["recall_exhausted"] is True


@pytest.mark.asyncio
async def test_run_recall_batch_first_touch_does_not_exhaust(ctx, monkeypatch) -> None:
    """First touch increments to 1 but does NOT mark exhausted."""
    p = _make_patient(touch_count=0, exhausted=False)
    fake = FakeRecallSession([p])

    monkeypatch.setattr(
        recall_module,
        "service_bulk_send",
        AsyncMock(
            return_value=BulkResult(
                batch_id=uuid4(),
                sent_count=1,
                failed_count=0,
                excluded_count=0,
                errors=[],
            )
        ),
    )

    await recall_module.run_recall_batch(
        fake,
        ctx,
        candidate_patient_ids=[p.id],
        template_id=uuid4(),
        channel="sms",
        fetch_patient=AsyncMock(return_value={"id": p.id, "contact_info_jsonb": p.contact_info_jsonb}),
        fetch_template=AsyncMock(return_value={"id": uuid4(), "kind": "recall_m12", "channel": "sms", "language": "en", "body": "Hi", "subject": None}),
        fetch_tenant=AsyncMock(return_value={"id": uuid4(), "timezone": "America/Los_Angeles", "name": "Sunview"}),
    )

    assert p.contact_info_jsonb["recall_touch_count"] == 1
    assert p.contact_info_jsonb.get("recall_exhausted") is not True


def test_candidate_query_sql_excludes_exhausted_and_deceased() -> None:
    """Test 2/3: the query SQL includes the right exclusion clauses.

    Pure SQL-text contract test — verifies the query string the candidate
    fetcher will issue contains the safety filters required by CRM-08
    (no-future-appt + 12-month gate + exhaustion + deceased exclusion).
    """
    import inspect

    src = inspect.getsource(recall_module.candidate_query)
    assert "recall_exhausted" in src
    assert "deceased" in src
    assert "INTERVAL '12 months'" in src
    assert "future_appts" in src
    assert "fa.patient_id IS NULL" in src


def test_candidate_query_orders_oldest_finalized_first() -> None:
    """Tests the SQL contract — ordering keeps the queue stable across loads."""
    import inspect

    src = inspect.getsource(recall_module.candidate_query)
    assert "ORDER BY lf.last_finalized_at ASC" in src
