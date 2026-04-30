"""Public webhook endpoints — Twilio + Postmark.

Both endpoints are public (no JWT). Defense-in-depth:
  • X-Webhook-Internal HMAC seal between BFF and FastAPI (so direct hits to
    FastAPI bypassing Vercel are rejected).
  • Provider-specific signature verification:
      - Twilio  → X-Twilio-Signature (HMAC-SHA1 over URL+form, see Plan 12-02)
      - Postmark → HTTP Basic Auth (Postmark does not offer HMAC; see
        backend/services/messaging/email_client.verify_postmark_basic_auth)

Idempotency + monotonic status: incoming events that would regress
(e.g. delivered → sent) are silently ignored via _STATUS_PRIORITY.

Inbound SMS:
  • STOP keyword → DB sync of opt-out flags (Twilio Advanced Opt-Out is the
    legal layer; this is belt-and-suspenders).
  • Non-STOP → InboundMessage row + asyncio.create_task to classifier so the
    webhook acks <2 s even if Anthropic is slow (RESEARCH Pitfall 8).

CRM-20 bounce path: every webhook-driven failure (Twilio undelivered/failed,
Postmark Bounce/SpamComplaint) calls record_bounce so the consecutive-bounce
counter increments end-to-end on the PRIMARY production path.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.audit import log_action
from backend.core.config import settings
from backend.db.session import get_db
from backend.core.security import TenantContext
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import AuditAction, Patient
from backend.db.models.tenant.messaging import InboundMessage, MessageLog
from backend.services.messaging.bounce_tracker import record_bounce
from backend.services.messaging.email_client import (
    EmailWebhookAuthError,
    verify_postmark_basic_auth,
)
from backend.services.messaging.twilio_client import (
    TwilioConfigError,
    validate_signature,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


_STATUS_PRIORITY = {"queued": 0, "sent": 1, "delivered": 2, "read": 3, "failed": 99}

# STOP keywords per Twilio Advanced Opt-Out documentation.
_STOP_KEYWORDS = {
    "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT",
    "REVOKE", "OPTOUT", "OPT-OUT", "STOP ALL",
}

_SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-000000000000")


def _system_ctx(tenant_id: UUID) -> TenantContext:
    """System TenantContext for webhook-originated DB writes (no user session)."""
    return TenantContext(user_id=_SYSTEM_USER_ID, tenant_id=tenant_id, role="system")


def _check_internal_seal(request: Request) -> None:
    if not settings.WEBHOOK_INTERNAL_SECRET:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Internal seal not configured")
    if request.headers.get("X-Webhook-Internal") != settings.WEBHOOK_INTERNAL_SECRET:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Internal seal failed")


def _reconstruct_url(request: Request, path: str) -> str:
    """Twilio signs over the public URL — reconstruct from X-Forwarded-Host (RESEARCH Pitfall 1)."""
    forwarded_host = request.headers.get("X-Forwarded-Host", request.url.hostname or "")
    proto = request.headers.get("X-Forwarded-Proto", "https")
    return f"{proto}://{forwarded_host}{path}"


# ─── Twilio ─────────────────────────────────────────────────────────────────


@router.post("/twilio", status_code=http_status.HTTP_200_OK)
async def twilio_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    _check_internal_seal(request)

    form = dict(await request.form())
    twilio_signature = request.headers.get("X-Twilio-Signature", "")
    url = _reconstruct_url(request, "/api/webhooks/twilio")
    try:
        if not validate_signature(url=url, form=form, signature=twilio_signature):
            raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Invalid Twilio signature")
    except TwilioConfigError as exc:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, str(exc))

    message_sid = form.get("MessageSid")
    if not message_sid:
        return {"ok": True, "ignored": "no_message_sid"}

    if form.get("Body"):
        await _handle_inbound_sms(db, form)
        await db.commit()
        return {"ok": True, "kind": "inbound"}

    if "MessageStatus" in form:
        await _handle_status_callback(db, form)
        await db.commit()
        return {"ok": True, "kind": "status"}

    return {"ok": True, "ignored": "no_handler"}


async def _handle_status_callback(db: AsyncSession, form: dict[str, str]) -> None:
    sid = form["MessageSid"]
    status_str = form["MessageStatus"].lower()
    mapped = {
        "sending": "queued",
        "queued": "queued",
        "sent": "sent",
        "delivered": "delivered",
        "read": "read",
        "undelivered": "failed",
        "failed": "failed",
    }.get(status_str)
    if not mapped:
        logger.info("Twilio status %s ignored for sid=%s", status_str, sid)
        return

    incoming_priority = _STATUS_PRIORITY.get(mapped, 0)
    log = (
        await db.execute(select(MessageLog).where(MessageLog.provider_message_id == sid))
    ).scalar_one_or_none()
    if not log:
        logger.warning("Twilio status callback for unknown sid=%s", sid)
        return

    if incoming_priority < log.status_priority:
        logger.info("Ignoring lower-priority %s for sid=%s (current=%s)", mapped, sid, log.status)
        return

    is_new_failure = mapped == "failed" and log.status != "failed"

    log.status = mapped
    log.status_priority = incoming_priority
    now = datetime.now(timezone.utc)
    if mapped == "sent":
        log.sent_at = log.sent_at or now
    elif mapped == "delivered":
        log.delivered_at = now
    elif mapped == "failed":
        log.failed_at = now
        log.failure_reason = form.get("ErrorMessage") or form.get("ErrorCode")

    audit_action = (
        AuditAction.MESSAGE_DELIVERED if mapped == "delivered"
        else AuditAction.MESSAGE_FAILED if mapped == "failed"
        else None
    )
    if audit_action:
        await log_action(
            db,
            _system_ctx(log.tenant_id),
            audit_action,
            "message",
            log.id,
            patient_id=log.patient_id,
            metadata={"provider_message_id": sid, "channel": "sms"},
        )
    await db.flush()

    if is_new_failure and log.patient_id is not None:
        try:
            await record_bounce(
                db, _system_ctx(log.tenant_id),
                patient_id=log.patient_id, channel=log.channel,
            )
        except Exception as exc:  # never let bounce-tracker failures break the webhook ack
            logger.warning("record_bounce failed for sid=%s: %s", sid, exc)


async def _handle_inbound_sms(db: AsyncSession, form: dict[str, str]) -> None:
    body = (form.get("Body") or "").strip()
    from_e164 = form.get("From", "")
    sid = form["MessageSid"]
    to_e164 = form.get("To", "")

    tenant_id = await _tenant_from_phone(db, to_e164)
    if not tenant_id:
        logger.warning("Inbound SMS to unknown number %s — sid=%s", to_e164, sid)
        return

    patient = await _patient_from_phone(db, tenant_id, from_e164)

    is_stop = body.upper() in _STOP_KEYWORDS
    if is_stop and patient is not None:
        contact = dict(patient.contact_info_jsonb or {})
        now_iso = datetime.now(timezone.utc).isoformat()
        contact["sms_opted_out_at"] = now_iso
        contact["consent_sms_marketing_at"] = None
        prev_stop = contact.get("_last_stop_received_at")
        if prev_stop:
            try:
                prev_dt = datetime.fromisoformat(prev_stop.replace("Z", "+00:00"))
                if (datetime.now(timezone.utc) - prev_dt).total_seconds() < 86400:
                    contact["consent_sms_operational_at"] = None
            except ValueError:
                pass
        contact["_last_stop_received_at"] = now_iso
        patient.contact_info_jsonb = contact
        flag_modified(patient, "contact_info_jsonb")
        await log_action(
            db,
            _system_ctx(tenant_id),
            AuditAction.OPT_OUT_RECORDED,
            "patient",
            patient.id,
            patient_id=patient.id,
            metadata={"channel": "sms", "trigger": "stop_keyword"},
        )

    inbound = InboundMessage(
        tenant_id=tenant_id,
        patient_id=patient.id if patient else None,
        from_e164=from_e164,
        body=body,
        provider_message_id=sid,
        is_read=False,
    )
    db.add(inbound)
    await db.flush()

    if not is_stop:
        await log_action(
            db,
            _system_ctx(tenant_id),
            AuditAction.INBOUND_MESSAGE_RECEIVED,
            "inbound_message",
            inbound.id,
            patient_id=patient.id if patient else None,
            metadata={"from_e164": from_e164},
        )
        # Fire-and-forget classifier — non-blocking (RESEARCH Pitfall 8)
        from backend.services.messaging.classifier import classify_inbound_async

        asyncio.create_task(classify_inbound_async(inbound.id, body))


# ─── Postmark ───────────────────────────────────────────────────────────────


# Map Postmark RecordType → internal status.
# https://postmarkapp.com/developer/webhooks/webhooks-overview#supported-events
_POSTMARK_EVENT_MAP = {
    "Delivery": "delivered",
    "Open": "read",
    "Bounce": "failed",
    "SpamComplaint": "failed",
    # Postmark also emits SubscriptionChange / ManualSuppression — ignore for now.
}


@router.post("/postmark", status_code=http_status.HTTP_200_OK)
async def postmark_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    _check_internal_seal(request)

    try:
        verify_postmark_basic_auth(authorization_header=request.headers.get("Authorization"))
    except EmailWebhookAuthError as exc:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, str(exc))

    raw = await request.body()
    try:
        payload = json.loads(raw.decode() or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(http_status.HTTP_400_BAD_REQUEST, "invalid JSON body")

    record_type = payload.get("RecordType", "")
    message_id = payload.get("MessageID")
    if not message_id:
        return {"ok": True, "ignored": "no_message_id"}

    mapped = _POSTMARK_EVENT_MAP.get(record_type)
    if not mapped:
        return {"ok": True, "ignored": record_type or "unknown_record_type"}

    log = (
        await db.execute(select(MessageLog).where(MessageLog.provider_message_id == message_id))
    ).scalar_one_or_none()
    if not log:
        logger.warning("Postmark webhook for unknown MessageID=%s", message_id)
        return {"ok": True, "ignored": "unknown_message_id"}

    incoming = _STATUS_PRIORITY[mapped]
    if incoming < log.status_priority:
        return {"ok": True, "ignored": "stale"}

    is_new_failure = mapped == "failed" and log.status != "failed"

    log.status = mapped
    log.status_priority = incoming
    now = datetime.now(timezone.utc)
    if mapped == "delivered":
        log.delivered_at = now
    elif mapped == "read":
        log.read_at = now
    elif mapped == "failed":
        log.failed_at = now
        # Bounce events carry Type / Description; SpamComplaint just RecordType.
        log.failure_reason = (
            payload.get("Type") or payload.get("Description") or record_type
        )

    audit_action = {
        "delivered": AuditAction.MESSAGE_DELIVERED,
        "read": AuditAction.MESSAGE_READ,
        "failed": AuditAction.MESSAGE_FAILED,
    }.get(mapped)
    if audit_action:
        await log_action(
            db,
            _system_ctx(log.tenant_id),
            audit_action,
            "message",
            log.id,
            patient_id=log.patient_id,
            metadata={"channel": "email", "record_type": record_type},
        )
    await db.flush()

    if is_new_failure and log.patient_id is not None:
        try:
            await record_bounce(
                db, _system_ctx(log.tenant_id),
                patient_id=log.patient_id, channel=log.channel,
            )
        except Exception as exc:
            logger.warning("record_bounce failed for MessageID=%s: %s", message_id, exc)

    await db.commit()
    return {"ok": True}


# ─── Lookups ────────────────────────────────────────────────────────────────


async def _tenant_from_phone(db: AsyncSession, phone_e164: str) -> UUID | None:
    """Look up tenant by their Twilio number stored in settings_jsonb.messaging.twilio_phone_number."""
    rows = (await db.execute(select(Tenant))).scalars().all()
    for t in rows:
        ms = (t.settings_jsonb or {}).get("messaging", {})
        if ms.get("twilio_phone_number") == phone_e164:
            return t.id
    return None


async def _patient_from_phone(
    db: AsyncSession, tenant_id: UUID, phone_e164: str,
) -> Patient | None:
    """Match patient by contact_info_jsonb.phone_e164 (Postgres JSONB ->>operator)."""
    rows = (
        await db.execute(
            select(Patient).where(
                Patient.tenant_id == tenant_id,
                Patient.contact_info_jsonb["phone_e164"].astext == phone_e164,
            )
        )
    ).scalars().all()
    return rows[0] if rows else None
