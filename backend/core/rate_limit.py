"""Shared in-memory rate limiter.

Factored from api/routes/public_booking.py (Phase 10.2) so multiple
public endpoints can reuse the same sliding-window IP limiter.

NOTE: This is an in-process store. For multi-worker deployments
(uvicorn --workers > 1) use a Redis-backed limiter instead; for the
current single-worker Vercel/Fly setup this is sufficient.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, status

_store: dict[str, deque[float]] = defaultdict(deque)

DEFAULT_WINDOW_SECONDS = 60
DEFAULT_MAX_REQUESTS = 10


def check_rate_limit(
    ip: str,
    window_seconds: int = DEFAULT_WINDOW_SECONDS,
    max_requests: int = DEFAULT_MAX_REQUESTS,
) -> None:
    """Sliding-window rate limiter keyed by IP.

    Raises HTTPException 429 if the caller exceeded `max_requests`
    within the last `window_seconds`.
    """
    now = time.monotonic()
    q = _store[ip]
    # Purge expired entries at the left of the deque.
    while q and q[0] < now - window_seconds:
        q.popleft()
    if len(q) >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate_limited",
        )
    q.append(now)
