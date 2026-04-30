"""Inbound-message classifier — Plan 12-06 stub.

Plan 12-04 webhooks fire-and-forget into ``classify_inbound_async`` to keep
webhook response latency under 2 s (RESEARCH Pitfall 8). Plan 12-06 fully
implements the Anthropic-backed classifier; until then this is a no-op so
the import in ``backend.api.routes.webhooks`` resolves at runtime.
"""
from __future__ import annotations

import logging
from uuid import UUID

logger = logging.getLogger(__name__)


async def classify_inbound_async(inbound_id: UUID, body: str) -> None:
    """No-op stub. Plan 12-06 will replace with the real classifier."""
    logger.debug("classify_inbound_async stub invoked for inbound_id=%s", inbound_id)
