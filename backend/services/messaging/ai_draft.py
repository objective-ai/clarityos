"""AI draft assist — staff types intent, Claude returns a HIPAA-safe body.

Always preflights opt-out BEFORE invoking Claude (CRM-12 contract). For
operational SMS the rendered body is also re-scrubbed with the same
``scrub_phi_for_operational_sms`` defense the sender uses.

Reuses the AsyncAnthropic pattern from backend.api.routes.ai_scribe.
Non-streaming (single short response → 300 token cap).
"""
from __future__ import annotations

import logging
from typing import Literal

from backend.core.config import settings

from .opt_out_guard import preflight_or_raise
from .templates import scrub_phi_for_operational_sms

logger = logging.getLogger(__name__)

_client = None

DRAFT_MODEL = "claude-haiku-4-5-20251001"

DRAFT_SYSTEM = """You draft a single message to an eye clinic patient.
Constraints (NEVER violate):
- Include patient first name only (no last name, no DOB, no medical record number)
- For SMS: never mention diagnoses, prescription values, or specific reasons-for-visit
- For email: medical specifics OK as long as caller marked them appropriate
- Keep under 160 characters for SMS; under 200 words for email
- Use a warm but professional tone
- End with the clinic name as signature
- Include a confirm or reschedule link if appropriate (placeholder: {{confirm_link}})

Output the message body only. No explanation."""


def _get_client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def draft_message(
    *,
    intent: str,
    channel: Literal["sms", "email"],
    purpose: Literal["operational", "marketing", "manual"],
    patient_first_name: str,
    patient_contact_info: dict,
    clinic_name: str,
) -> str:
    """Return a HIPAA-safe message body.

    Raises ``OptOutBlocked`` (caught at the route layer → 409) when the
    patient cannot legally receive ``channel`` for ``purpose`` — Claude is
    never invoked in that case (CRM-12 contract).
    """
    preflight_or_raise(
        contact_info=patient_contact_info,
        channel=channel,
        purpose=purpose,
    )

    user_msg = (
        f"Patient first name: {patient_first_name}\n"
        f"Clinic: {clinic_name}\n"
        f"Channel: {channel.upper()}\n"
        f"Purpose: {purpose}\n"
        f"Staff intent: {intent}\n\n"
        f"Draft the message now."
    )

    client = _get_client()
    response = await client.messages.create(
        model=DRAFT_MODEL,
        max_tokens=300,
        system=DRAFT_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    body = response.content[0].text.strip()

    # Defense-in-depth: re-scrub operational SMS the same way sender does.
    if channel == "sms" and purpose == "operational":
        scrub_phi_for_operational_sms(body)  # raises PHIInTemplate on violation

    return body
