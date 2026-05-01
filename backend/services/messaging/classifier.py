"""Inbound SMS classifier using Claude Haiku.

Called from backend/api/routes/webhooks.py via asyncio.create_task — must NOT block
the webhook response (RESEARCH Pitfall 8). Failures are swallowed: leave
classification=null so the inbox row simply renders as "uncategorized".
"""
from __future__ import annotations

import logging
from uuid import UUID

import anthropic
from sqlalchemy import update

from backend.core.config import settings
from backend.db.models.tenant.messaging import InboundMessage
from backend.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

INBOUND_LABELS: tuple[str, ...] = (
    "reschedule_request",
    "cancellation",
    "question_clinical",
    "question_billing",
    "thank_you",
    "spam",
)

_CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251015"

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    """Lazy-init the Anthropic client. Tests can monkeypatch this to raise."""
    global _client
    if _client is None:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY required for inbound classifier")
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


_SYSTEM = """You classify a single inbound SMS from a patient to an eye clinic.
Output exactly ONE label from this set, with no other text:
reschedule_request | cancellation | question_clinical | question_billing | thank_you | spam"""


async def classify_inbound_async(inbound_id: UUID, body: str) -> None:
    """Classify and update InboundMessage. Failures are swallowed (logged at WARN).

    Designed to be fired from a webhook handler via asyncio.create_task — never
    raises into the caller because that would 500 the Twilio webhook and trigger
    Twilio's retry storm.
    """
    try:
        label, confidence = await _classify(body)
    except Exception as exc:
        logger.warning("classify_inbound_async classify step failed for %s: %s", inbound_id, exc)
        return

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(InboundMessage)
                .where(InboundMessage.id == inbound_id)
                .values(classification=label, classification_confidence=confidence)
            )
            await db.commit()
    except Exception as exc:
        logger.warning("classify_inbound_async DB write failed for %s: %s", inbound_id, exc)


async def _classify(body: str) -> tuple[str, str]:
    """Call Claude Haiku and return (label, confidence)."""
    client = _get_client()
    response = await client.messages.create(
        model=_CLAUDE_HAIKU_MODEL,
        max_tokens=20,
        system=_SYSTEM,
        messages=[{"role": "user", "content": body}],
    )
    raw = response.content[0].text.strip().lower()

    if raw in INBOUND_LABELS:
        return raw, "high"
    matches = [lbl for lbl in INBOUND_LABELS if lbl in raw]
    if matches:
        return matches[0], "medium"
    return "spam", "low"


def _reset_for_tests() -> None:
    """Test helper — reset the lazy-init client so tests can re-patch."""
    global _client
    _client = None


__all__ = [
    "INBOUND_LABELS",
    "classify_inbound_async",
    "_reset_for_tests",
]
