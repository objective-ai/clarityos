"""Channel bounce tracker — CRM-20 fallback path.

Webhooks are the PRIMARY caller (Plan 12-04). Routes (Plan 12-05) call
``record_bounce`` only on the synchronous-failure path so the counter
stays accurate when no webhook fires.

Counter strategy: ``contact_info_jsonb.consecutive_bounces[channel]``
increments on every failure. After 3 consecutive failures the counter
resets and ``preferred_channel`` flips to the alternate (sms↔email).
``needs_contact_update`` is set so staff see an inbox flag.
"""
from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.audit import log_action
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction, Patient

logger = logging.getLogger(__name__)

Channel = Literal["sms", "email"]
_FLIP_THRESHOLD = 3


async def record_bounce(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    patient_id: UUID,
    channel: str,
) -> None:
    """Increment the consecutive-bounce counter; flip preferred_channel after 3."""
    if channel not in ("sms", "email"):
        logger.warning("record_bounce ignoring unknown channel=%s", channel)
        return

    patient = (
        await db.execute(select(Patient).where(Patient.id == patient_id))
    ).scalar_one_or_none()
    if patient is None:
        logger.warning("record_bounce: patient %s not found", patient_id)
        return

    contact = dict(patient.contact_info_jsonb or {})
    bounces = dict(contact.get("consecutive_bounces") or {})
    bounces[channel] = int(bounces.get(channel, 0)) + 1
    flipped = False
    if bounces[channel] >= _FLIP_THRESHOLD:
        alt = "email" if channel == "sms" else "sms"
        contact["preferred_channel"] = alt
        contact["needs_contact_update"] = True
        bounces[channel] = 0
        flipped = True
    contact["consecutive_bounces"] = bounces
    patient.contact_info_jsonb = contact
    flag_modified(patient, "contact_info_jsonb")

    await log_action(
        db,
        ctx,
        AuditAction.CHANNEL_PREFERENCE_UPDATED,
        "patient",
        patient.id,
        patient_id=patient.id,
        metadata={
            "trigger": "bounce_fallback",
            "channel": channel,
            "consecutive_bounces": bounces[channel],
            "flipped": flipped,
        },
    )
