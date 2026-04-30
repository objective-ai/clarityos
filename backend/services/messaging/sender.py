"""The single choke point for outbound messaging.

EVERY outbound message — reminder, recall, manual, AI-drafted, bulk — funnels
through `dispatch()`. This is the ONLY place that calls twilio_client.send_sms
or email_client.send_email outside the adapters themselves.

Guard chain order (must NOT be reordered without HIPAA/TCPA review):
  1. Resolve recipient (minor → guardian)
  2. Opt-out preflight
  3. Quiet hours (skip-able when force_outside_quiet_hours=True)
  4. Render template + PHI scrub (operational SMS only)
  5. Cost cap reservation (skipped when deferred — reserve only when sending)
  6. Insert MessageLog (status=queued|deferred) IN PRIMARY TXN — clinical-safety rule
  7. Audit log MESSAGE_SENT|MESSAGE_DEFERRED IN SAME TXN
  8. Dispatch via provider (out-of-txn — failure marks log.status=failed + refunds)
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction
from backend.db.models.tenant.messaging import MessageLog, MessageStatus

from .cost_cap import (
    CostCapExceeded,
    Reservation,
    refund_reservation,
    reserve_spend_or_raise,
)
from .email_client import send_email
from .opt_out_guard import OptOutBlocked, preflight_or_raise
from .quiet_hours import is_in_quiet_hours, next_allowed_window
from .recipient_resolver import NoValidRecipient, resolve_recipient
from .templates import (
    PHIInTemplate,
    count_sms_segments,
    render_template,
    scrub_phi_for_operational_sms,
)
from .twilio_client import send_sms

logger = logging.getLogger(__name__)

_STATUS_PRIORITY: dict[str, int] = {
    "queued": 0,
    "deferred": 0,
    "cancelled": 0,
    "sent": 1,
    "delivered": 2,
    "read": 3,
    "failed": 99,
}


class QuietHoursDeferred(Exception):
    """Signaling sentinel — surfaces in API responses; not raised internally."""


@dataclass
class DispatchRequest:
    tenant_id: UUID
    patient_id: UUID
    channel: Literal["sms", "email"]
    purpose: Literal["operational", "marketing", "manual"]
    template_id: UUID | None = None
    template_kind: str | None = None
    body_override: str | None = None
    subject: str | None = None
    tokens: dict[str, str] = field(default_factory=dict)
    appointment_id: UUID | None = None
    batch_id: UUID | None = None
    actor_user_id: UUID | None = None
    force_outside_quiet_hours: bool = False
    admin_override_cost_cap: bool = False
    language: Literal["en", "es"] = "en"
    rendered_html: str | None = None  # email pre-rendered via BFF


async def dispatch(
    db: AsyncSession,
    ctx: TenantContext,
    req: DispatchRequest,
    *,
    patient: dict,
    tenant: dict,
    template: dict | None = None,
    status_callback_url: str = "",
) -> MessageLog:
    """Send a single message through the full guard chain.

    `patient`, `tenant`, `template` are pre-fetched dicts (caller does the
    SELECTs). Keeping `dispatch` pure-orchestration makes it easier to test
    against fakes and avoids hidden ORM round-trips inside the guard chain.

    Raises: OptOutBlocked, NoValidRecipient, PHIInTemplate, CostCapExceeded.
    """
    # 1. Resolve recipient
    recipient = resolve_recipient(patient=patient, channel=req.channel)

    # 2. Opt-out preflight
    contact_info = patient.get("contact_info_jsonb") or {}
    preflight_or_raise(
        contact_info=contact_info, channel=req.channel, purpose=req.purpose
    )

    # 3. Quiet hours
    deferred_until: datetime | None = None
    if not req.force_outside_quiet_hours:
        if is_in_quiet_hours(
            patient_contact_info=contact_info,
            tenant_timezone=tenant["timezone"],
        ):
            deferred_until = next_allowed_window(
                patient_contact_info=contact_info,
                tenant_timezone=tenant["timezone"],
            )

    # 4. Render + PHI scrub
    if req.body_override is not None:
        body = render_template(body=req.body_override, tokens=req.tokens)
    elif template is not None:
        body = render_template(body=template["body"], tokens=req.tokens)
    else:
        raise ValueError("Either template or body_override must be provided")

    if req.channel == "sms" and req.purpose != "manual":
        scrub_phi_for_operational_sms(body)  # raises PHIInTemplate

    # 5. Segment count + cost cap reservation (skip when deferred)
    segments, _enc = count_sms_segments(body) if req.channel == "sms" else (1, "n/a")
    reservation: Reservation | None = None
    if deferred_until is None:
        reservation = await reserve_spend_or_raise(
            db,
            req.tenant_id,
            req.channel,
            segments,
            admin_override=req.admin_override_cost_cap,
        )

    # 6. Insert MessageLog in primary TXN
    initial_status = (
        MessageStatus.DEFERRED.value if deferred_until else MessageStatus.QUEUED.value
    )
    log = MessageLog(
        id=uuid.uuid4(),
        tenant_id=req.tenant_id,
        patient_id=req.patient_id,
        appointment_id=req.appointment_id,
        channel=req.channel,
        purpose=req.purpose,
        template_kind=req.template_kind,
        template_id=req.template_id,
        recipient_e164=recipient.phone_e164,
        recipient_email=recipient.email,
        recipient_kind=recipient.kind,
        body=body,
        subject=req.subject,
        language=req.language,
        status=initial_status,
        status_priority=_STATUS_PRIORITY[initial_status],
        provider_segments=segments if req.channel == "sms" else None,
        provider_cost_cents=reservation.cost_cents if reservation else None,
        batch_id=req.batch_id,
        deferred_until=deferred_until,
        actor_user_id=req.actor_user_id,
        metadata_={
            "reservation_id": str(reservation.id) if reservation else None,
            "language": req.language,
            "batch_id": str(req.batch_id) if req.batch_id else None,
        },
    )
    db.add(log)
    await db.flush()

    # 7. Audit (same TXN — clinical-safety rule)
    audit_action = (
        AuditAction.MESSAGE_DEFERRED if deferred_until else AuditAction.MESSAGE_SENT
    )
    await log_action(
        db,
        ctx,
        audit_action,
        "message",
        log.id,
        patient_id=req.patient_id,
        metadata={
            "channel": req.channel,
            "purpose": req.purpose,
            "batch_id": str(req.batch_id) if req.batch_id else None,
            "recipient_kind": recipient.kind,
        },
    )

    if deferred_until:
        return log  # scheduler will re-attempt at deferred_until

    # 8. Dispatch via provider (out-of-txn)
    try:
        if req.channel == "sms":
            assert recipient.phone_e164, "recipient.phone_e164 required for sms"
            provider_id = await send_sms(
                body=body,
                to=recipient.phone_e164,
                status_callback_url=status_callback_url,
                messaging_service_sid=tenant.get("twilio_messaging_service_sid"),
            )
        else:
            assert recipient.email, "recipient.email required for email"
            html = req.rendered_html or body  # caller may pre-render via BFF
            provider_id = await send_email(
                subject=req.subject or "Message from your eye clinic",
                html=html,
                to=recipient.email,
                idempotency_key=str(log.id),
            )
        log.provider_message_id = provider_id
        log.status = MessageStatus.SENT.value
        log.status_priority = _STATUS_PRIORITY["sent"]
        log.sent_at = datetime.now(timezone.utc)
    except Exception as exc:
        logger.warning("dispatch provider call failed for log_id=%s: %s", log.id, exc)
        log.status = MessageStatus.FAILED.value
        log.status_priority = _STATUS_PRIORITY["failed"]
        log.failure_reason = str(exc)
        log.failed_at = datetime.now(timezone.utc)
        if reservation:
            await refund_reservation(db, req.tenant_id, reservation)

    await db.flush()
    return log


__all__ = [
    "dispatch",
    "DispatchRequest",
    "OptOutBlocked",
    "CostCapExceeded",
    "QuietHoursDeferred",
    "NoValidRecipient",
    "PHIInTemplate",
]
