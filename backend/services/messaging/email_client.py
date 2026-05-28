"""Postmark SDK adapter (Phase 12 — email rail).

Lazy-initialized client. The original plan named this file `resend_client.py`,
but the Wave 0 BAA checkpoint chose Postmark (see
.planning/compliance/RESEND-BAA-CHECKPOINT.md, 2026-04-29). Renamed here to
match reality.

Postmark webhooks authenticate via HTTP Basic Auth, NOT Svix HMAC — the
plan's Path-A code (Svix) is dead. `verify_postmark_basic_auth` is the live
path consumed by Plan 12-04.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import secrets
from typing import Any

from backend.core.config import settings

logger = logging.getLogger(__name__)

_client: Any | None = None


class EmailConfigError(RuntimeError):
    """Raised when email-provider credentials or sender are missing."""


class EmailWebhookAuthError(RuntimeError):
    """Raised when an inbound webhook fails Basic-Auth verification."""


def _ensure_client() -> Any:
    global _client
    if _client is None:
        if settings.EMAIL_PROVIDER != "postmark":
            raise EmailConfigError(
                f"Unsupported EMAIL_PROVIDER: {settings.EMAIL_PROVIDER}. "
                "Phase 12 ships with Postmark per BAA decision."
            )
        if not settings.POSTMARK_SERVER_TOKEN:
            raise EmailConfigError("POSTMARK_SERVER_TOKEN must be set")
        from postmarker.core import PostmarkClient

        _client = PostmarkClient(server_token=settings.POSTMARK_SERVER_TOKEN)
    return _client


def _reset_for_tests() -> None:
    global _client
    _client = None


async def send_email(
    *,
    subject: str,
    html: str,
    to: str,
    idempotency_key: str,
    from_: str | None = None,
    reply_to: str | None = None,
    tag: str | None = None,
    attachments: list[dict] | None = None,
) -> str:
    """Send a pre-rendered HTML email via Postmark. Returns Postmark MessageID.

    The HTML must already be inline-styled (rendered server-side via the
    `/api/messaging/render-template` BFF endpoint — Plan 12-02 Task 3).

    Idempotency: Postmark does not have a native idempotency key like Resend.
    We pass it as a custom header `X-PM-Idempotency-Key` so retried sends are
    visible at the message-log layer; the actual de-dup happens upstream in
    the sender service (Plan 12-03).

    ``attachments`` (Plan 15-06): a list of Postmark attachment dicts —
    ``[{"Name": "...", "Content": <base64 str>, "ContentType": "..."}]``.
    Used by the receipt-email handler to attach the PDF body. Left optional
    so all existing call sites keep working unchanged.
    """
    client = _ensure_client()
    sender = from_ or settings.POSTMARK_FROM_EMAIL
    if not sender:
        raise EmailConfigError("from_ or POSTMARK_FROM_EMAIL must be set")

    headers = [{"Name": "X-PM-Idempotency-Key", "Value": idempotency_key}]
    kwargs: dict[str, Any] = {
        "From": sender,
        "To": to,
        "Subject": subject,
        "HtmlBody": html,
        "Headers": headers,
        "MessageStream": "outbound",
    }
    if reply_to:
        kwargs["ReplyTo"] = reply_to
    if tag:
        kwargs["Tag"] = tag
    if attachments:
        kwargs["Attachments"] = attachments

    result = await asyncio.to_thread(client.emails.send, **kwargs)
    return result["MessageID"]


def verify_postmark_basic_auth(*, authorization_header: str | None) -> None:
    """Constant-time validation of Postmark webhook Basic-Auth header.

    Raises EmailWebhookAuthError on missing/invalid creds. Returns None on
    success — webhook router fires through to event handler if no exception.
    """
    if not settings.POSTMARK_WEBHOOK_USER or not settings.POSTMARK_WEBHOOK_PASSWORD:
        raise EmailConfigError(
            "POSTMARK_WEBHOOK_USER and POSTMARK_WEBHOOK_PASSWORD must be set"
        )
    if not authorization_header or not authorization_header.startswith("Basic "):
        raise EmailWebhookAuthError("missing Basic auth header")

    try:
        decoded = base64.b64decode(authorization_header[len("Basic ") :]).decode()
        user, _, pw = decoded.partition(":")
    except Exception as exc:
        raise EmailWebhookAuthError("malformed Basic auth header") from exc

    user_ok = secrets.compare_digest(user, settings.POSTMARK_WEBHOOK_USER)
    pw_ok = secrets.compare_digest(pw, settings.POSTMARK_WEBHOOK_PASSWORD)
    if not (user_ok and pw_ok):
        raise EmailWebhookAuthError("invalid webhook credentials")
