"""Tests for backend/services/messaging/classifier.py.

The classifier is called fire-and-forget from the webhook (RESEARCH Pitfall 8),
so all failure modes must NOT raise to the caller.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

# Mapper bootstrap
import backend.db.models.tenant.intake  # noqa: F401
from backend.services.messaging import classifier as classifier_module
from backend.services.messaging.classifier import (
    INBOUND_LABELS,
    _classify,
    _reset_for_tests,
    classify_inbound_async,
)


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


class _FakeDB:
    def __init__(self):
        self.executed = []
        self.committed = False

    async def execute(self, stmt):
        try:
            params = stmt.compile().params
        except Exception:
            params = {}
        self.executed.append(params)
        return SimpleNamespace()

    async def commit(self):
        self.committed = True


class _FakeDBContextManager:
    def __init__(self, db: _FakeDB):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, *exc):
        return False


@pytest.fixture(autouse=True)
def _reset_classifier_state():
    _reset_for_tests()
    yield
    _reset_for_tests()


def _claude_response(text: str):
    return SimpleNamespace(content=[SimpleNamespace(text=text)])


def _patch_client(monkeypatch, response_text: str):
    fake_client = MagicMock()
    fake_client.messages.create = AsyncMock(return_value=_claude_response(response_text))
    monkeypatch.setattr(classifier_module, "_get_client", lambda: fake_client)
    return fake_client


def _patch_session(monkeypatch, fake_db: _FakeDB):
    monkeypatch.setattr(
        classifier_module,
        "AsyncSessionLocal",
        lambda: _FakeDBContextManager(fake_db),
    )


# -----------------------------------------------------------------------------
# Tests
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_classify_returns_reschedule_request_label(monkeypatch):
    _patch_client(monkeypatch, "reschedule_request")
    label, confidence = await _classify("I need to reschedule my appointment")
    assert label == "reschedule_request"
    assert confidence == "high"


@pytest.mark.asyncio
async def test_classify_returns_thank_you_label(monkeypatch):
    _patch_client(monkeypatch, "thank_you")
    label, confidence = await _classify("Thanks!")
    assert label == "thank_you"
    assert confidence == "high"


@pytest.mark.asyncio
async def test_classify_inbound_async_writes_classification(monkeypatch):
    _patch_client(monkeypatch, "cancellation")
    fake_db = _FakeDB()
    _patch_session(monkeypatch, fake_db)

    inbound_id = uuid4()
    await classify_inbound_async(inbound_id, "I need to cancel.")

    assert fake_db.committed is True
    assert any(
        p.get("classification") == "cancellation" and p.get("classification_confidence") == "high"
        for p in fake_db.executed
    )


@pytest.mark.asyncio
async def test_classify_unrecognized_response_defaults_to_spam(monkeypatch):
    _patch_client(monkeypatch, "totally-not-a-known-label-zzz")
    label, confidence = await _classify("???")
    assert label == "spam"
    assert confidence == "low"


@pytest.mark.asyncio
async def test_classify_inbound_async_swallows_exceptions(monkeypatch):
    """If _classify raises (e.g. API down), classify_inbound_async must NOT raise."""

    def _raise_get_client():
        raise RuntimeError("anthropic api unreachable")

    monkeypatch.setattr(classifier_module, "_get_client", _raise_get_client)

    # If this raises, the test fails.
    await classify_inbound_async(uuid4(), "Anything")


@pytest.mark.asyncio
async def test_client_is_lazy_initialized(monkeypatch):
    """The module must NOT eagerly construct the Anthropic client at import time."""
    import importlib

    # Re-import to ensure fresh module state
    classifier_mod = importlib.reload(classifier_module)
    assert classifier_mod._client is None

    # Without an API key, _get_client must raise — proving no eager init happened
    monkeypatch.setattr(classifier_mod.settings, "ANTHROPIC_API_KEY", "")
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        classifier_mod._get_client()


@pytest.mark.asyncio
async def test_inbound_labels_contains_six_labels():
    assert len(INBOUND_LABELS) == 6
    assert set(INBOUND_LABELS) == {
        "reschedule_request",
        "cancellation",
        "question_clinical",
        "question_billing",
        "thank_you",
        "spam",
    }
