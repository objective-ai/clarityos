"""
core/triage.py

AI-powered triage of patient chief complaints via Anthropic Claude.
Classifies urgency as routine / moderate / urgent with flags and reasoning.
Gracefully falls back to {urgency: "unknown"} if the API is unavailable.
"""

from __future__ import annotations

import json
import logging

from backend.core.ai_models import DEFAULT_AI_MODEL
from backend.core.config import settings

logger = logging.getLogger("clarityos.triage")

TRIAGE_SYSTEM_PROMPT = """\
You are an optometric triage assistant. Given a patient's chief complaint and \
review of systems, classify the urgency level and identify clinical flags.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "urgency": "routine" | "moderate" | "urgent",
  "flags": ["flag1", "flag2"],
  "reasoning": "Brief clinical reasoning (1-2 sentences)"
}

Guidelines:
- urgent: sudden vision loss, flashing lights with new floaters, eye trauma, \
chemical exposure, acute angle closure symptoms (severe pain + halos + nausea)
- moderate: new-onset double vision, persistent eye pain, significant redness \
with discharge, sudden onset of floaters without flashes
- routine: blurry vision (gradual), dry eyes, itching, routine exam, \
contact lens fitting, glasses prescription update
"""


async def triage_chief_complaint(
    chief_complaint: str,
    review_of_systems: dict | None = None,
    ai_model: str = DEFAULT_AI_MODEL,
) -> dict:
    """
    Classify a chief complaint using Claude.

    Returns dict with keys: urgency, flags, reasoning.
    Falls back to {"urgency": "unknown", "flags": [], "reasoning": "AI triage unavailable"}
    on any failure.
    """
    fallback = {
        "urgency": "unknown",
        "flags": [],
        "reasoning": "AI triage unavailable",
    }

    if not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set — skipping triage")
        return fallback

    ros_text = ""
    if review_of_systems:
        positive = [k.replace("_", " ") for k, v in review_of_systems.items() if v]
        if positive:
            ros_text = f"\n\nPositive review of systems: {', '.join(positive)}"

    user_message = f"Chief complaint: {chief_complaint}{ros_text}"

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model=ai_model,
            max_tokens=300,
            system=TRIAGE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw = response.content[0].text.strip()
        result = json.loads(raw)

        if result.get("urgency") not in ("routine", "moderate", "urgent"):
            result["urgency"] = "unknown"
        if not isinstance(result.get("flags"), list):
            result["flags"] = []
        if not isinstance(result.get("reasoning"), str):
            result["reasoning"] = ""

        return result

    except Exception:
        logger.exception("AI triage failed — returning fallback")
        return fallback
