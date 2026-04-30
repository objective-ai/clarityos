"""Twilio SDK adapter — pure wrapper, no business logic.

Design rules:
- Lazy-initialized client. Importing this module must NOT touch credentials
  (RESEARCH.md anti-pattern: eager init breaks tests + import-time failures).
- Async-safe via `asyncio.to_thread` — twilio-python is sync-only.
- All higher-level decisions (opt-out, quiet hours, cost cap, audit) live in
  the choke-point sender service (Plan 12-03), NOT here.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.core.config import settings

logger = logging.getLogger(__name__)

_client: Any | None = None  # lazy singleton


class TwilioConfigError(RuntimeError):
    """Raised when Twilio credentials are missing at first use."""


class NoNumberAvailable(RuntimeError):
    """Raised when no Twilio numbers can be purchased in the requested area code."""


def _get_client() -> Any:
    global _client
    if _client is None:
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            raise TwilioConfigError(
                "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set"
            )
        from twilio.rest import Client

        _client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _client


def _reset_client_for_tests() -> None:
    global _client
    _client = None


async def send_sms(
    *,
    body: str,
    to: str,
    status_callback_url: str,
    messaging_service_sid: str | None = None,
) -> str:
    """Send an SMS via Twilio Messaging Service.

    Returns the Twilio MessageSid. Raises TwilioRestException on validation,
    rate-limit, or blocked-number errors. Higher-level retries belong in the
    sender service.
    """
    msid = messaging_service_sid or settings.TWILIO_MESSAGING_SERVICE_SID
    if not msid:
        raise TwilioConfigError("messaging_service_sid required")

    client = _get_client()
    msg = await asyncio.to_thread(
        client.messages.create,
        body=body,
        to=to,
        messaging_service_sid=msid,
        status_callback=status_callback_url,
    )
    return msg.sid


def validate_signature(
    *,
    url: str,
    form: dict[str, str],
    signature: str,
    auth_token: str | None = None,
) -> bool:
    """Validate `X-Twilio-Signature` for an inbound webhook.

    Caller MUST reconstruct the URL using `X-Forwarded-Host` (RESEARCH.md
    Pitfall 1) — Twilio signs the URL it called, not the URL FastAPI sees
    after the BFF proxy.
    """
    from twilio.request_validator import RequestValidator

    token = auth_token or settings.TWILIO_AUTH_TOKEN
    if not token:
        raise TwilioConfigError("TWILIO_AUTH_TOKEN required for signature validation")
    return RequestValidator(token).validate(url, form, signature)


async def provision_local_number(
    *,
    area_code: str,
    friendly_name: str,
    messaging_service_sid: str,
) -> dict[str, str]:
    """Buy a local US number in `area_code` and attach it to a Messaging Service.

    Returns: ``{"phone_number": "+1...", "sid": "PN..."}``.
    Raises ``NoNumberAvailable`` if no numbers exist for the area code.
    """
    client = _get_client()
    available = await asyncio.to_thread(
        client.available_phone_numbers("US").local.list,
        area_code=area_code,
        sms_enabled=True,
        limit=1,
    )
    if not available:
        raise NoNumberAvailable(f"No numbers available in area code {area_code}")

    purchased = await asyncio.to_thread(
        client.incoming_phone_numbers.create,
        phone_number=available[0].phone_number,
        friendly_name=friendly_name,
    )
    await asyncio.to_thread(
        client.messaging.v1.services(messaging_service_sid).phone_numbers.create,
        phone_number_sid=purchased.sid,
    )
    return {"phone_number": purchased.phone_number, "sid": purchased.sid}
