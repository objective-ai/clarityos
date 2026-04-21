"""Sentry initialization for the ClarityOS FastAPI backend.

init_sentry() is env-gated (no-op unless SENTRY_DSN is set AND SENTRY_ENVIRONMENT
== "production"). All error events flow through _before_send which delegates to
scrub_event (see backend.core.sentry_scrubber) — that composes ignore-rules,
clinical-route body-drop, and deny-list scrubbing before anything leaves the
process.

This module deliberately keeps sentry_sdk imports INSIDE init_sentry() so the
module itself is importable in local/dev/test environments where sentry-sdk may
not be installed.
"""
from __future__ import annotations

import os
from typing import Any, Optional

from backend.core.sentry_scrubber import scrub_event, CLINICAL_PREFIXES  # noqa: F401


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Sentry before_send hook.

    scrub_event already composes ignore-rules + clinical body-drop + deny-list
    scrub. The wrapper exists so init_sentry() can pass a stable callable and
    unit tests can exercise the hook without importing sentry_sdk.
    """
    return scrub_event(event, hint)


def init_sentry() -> None:
    """Initialize sentry-sdk for FastAPI. No-op unless in production with DSN set."""
    dsn = os.getenv("SENTRY_DSN")
    env = os.getenv("SENTRY_ENVIRONMENT")
    if not dsn or env != "production":
        return

    # Lazy imports so unit tests / local dev can import this module without
    # sentry-sdk installed.
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    from sentry_sdk.integrations.asyncio import AsyncioIntegration

    sentry_sdk.init(
        dsn=dsn,
        environment="production",
        release=os.getenv("GIT_SHA"),
        traces_sample_rate=0.0,
        send_default_pii=False,
        max_request_body_size="small",
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            AsyncioIntegration(),
        ],
        before_send=_before_send,
    )
