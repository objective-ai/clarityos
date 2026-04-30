"""Opt-out preflight guard.

`preflight_or_raise` is called by the sender choke point on EVERY send.
Per CONTEXT.md: per-channel x per-purpose flags (4 combos):
  consent_sms_marketing, consent_sms_operational,
  consent_email_marketing, consent_email_operational.

Operational defaults to opted-in for new patients (CONTEXT line 77).
Marketing defaults to opted-out (must be explicitly granted).
Manual sends collapse to operational for consent classification — clinic-initiated
individual care communication is an operational-class TCPA send.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal


class OptOutBlocked(Exception):
    """Raised when a send violates patient opt-out / consent / pause."""

    def __init__(self, reason: str, code: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.code = code


def preflight_or_raise(
    *,
    contact_info: dict,
    channel: Literal["sms", "email"],
    purpose: Literal["operational", "marketing", "manual"],
    now_utc: datetime | None = None,
) -> None:
    """Raise OptOutBlocked if send is forbidden by patient consent state.

    Order of checks (most-conservative first):
      1. SMS carrier-level opt-out (STOP keyword)
      2. Pause-until-date
      3. Per-channel + per-purpose consent
      4. Recall-exhausted gate (marketing only)
      5. Deceased flag
    """
    now_utc = now_utc or datetime.now(timezone.utc)
    effective_purpose = "operational" if purpose == "manual" else purpose

    if channel == "sms" and contact_info.get("sms_opted_out_at"):
        raise OptOutBlocked(
            "Patient has opted out of SMS via STOP keyword.",
            "SMS_OPTED_OUT",
        )

    paused_until = contact_info.get("paused_until")
    if paused_until:
        if isinstance(paused_until, str):
            paused_until = datetime.fromisoformat(paused_until.replace("Z", "+00:00"))
        if paused_until > now_utc:
            raise OptOutBlocked(
                f"Patient communications paused until {paused_until.isoformat()}.",
                "PAUSED",
            )

    consent_key = f"consent_{channel}_{effective_purpose}_at"
    if not contact_info.get(consent_key):
        raise OptOutBlocked(
            f"Patient has not consented to {channel} {effective_purpose} messages.",
            f"NO_CONSENT_{channel.upper()}_{effective_purpose.upper()}",
        )

    if effective_purpose == "marketing" and contact_info.get("recall_exhausted"):
        raise OptOutBlocked(
            "Recall sequence exhausted for this patient.",
            "RECALL_EXHAUSTED",
        )

    if contact_info.get("deceased"):
        raise OptOutBlocked("Patient is marked deceased.", "DECEASED")
