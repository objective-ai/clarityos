"""Phase 12 messaging routes.

All endpoints sit behind the ``messaging`` entitlement (Plus + Premium plans).
Webhooks are NOT here — see ``backend/api/routes/webhooks.py`` (Plan 12-04).
The single send path mirrors the bulk path's per-failure ``record_bounce``
hook so CRM-20 fires regardless of which entry point the message took.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.config import settings
from backend.core.entitlements import Entitlement, require_entitlement
from backend.core.security import TenantContext, get_current_tenant
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import AuditAction, Patient
from backend.db.models.tenant.messaging import (
    InboundMessage,
    MessageLog,
    MessageTemplate,
)
from backend.db.session import get_db
from backend.schemas.messaging import (
    AIDraftRequest,
    AIDraftResponse,
    BulkSendError,
    BulkSendRequest,
    BulkSendResponse,
    ChannelPreferenceOut,
    ChannelPreferenceUpdate,
    ConsentFlagsOut,
    InboundMessageOut,
    MessageLogOut,
    MessageTemplateCreate,
    MessageTemplateOut,
    MessageTemplateUpdate,
    MessagingSettingsOut,
    MessagingSettingsUpdate,
    RecallSendAllRequest,
    RecallSendAllResponse,
    SingleSendRequest,
)
from backend.services.messaging.bounce_tracker import record_bounce
from backend.services.messaging.bulk_send import BulkRecipient
from backend.services.messaging.bulk_send import bulk_send as service_bulk_send
from backend.services.messaging.sender import (
    CostCapExceeded,
    DispatchRequest,
    OptOutBlocked,
    dispatch,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/messaging",
    tags=["messaging"],
    dependencies=[Depends(require_entitlement(Entitlement.MESSAGING.value))],
)


# ---------------------------------------------------------------------------
# Internal helpers — pre-fetch dicts for sender.dispatch()
# ---------------------------------------------------------------------------


async def _fetch_patient(db: AsyncSession, ctx: TenantContext, patient_id: UUID) -> dict:
    p = (
        await db.execute(
            select(Patient).where(
                Patient.id == patient_id,
                Patient.tenant_id == ctx.tenant_id,
                Patient.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    contact = dict(p.contact_info_jsonb or {})
    return {
        "id": p.id,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "dob": p.dob.isoformat() if p.dob else None,
        "phone_e164": contact.get("phone_e164") or contact.get("phone"),
        "email": contact.get("email"),
        "guardian": contact.get("guardian"),
        "contact_info_jsonb": contact,
    }


async def _fetch_template(db: AsyncSession, ctx: TenantContext, template_id: UUID) -> dict:
    t = (
        await db.execute(
            select(MessageTemplate).where(
                MessageTemplate.id == template_id,
                MessageTemplate.tenant_id == ctx.tenant_id,
                MessageTemplate.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return {
        "id": t.id,
        "kind": t.kind,
        "channel": t.channel,
        "language": t.language,
        "body": t.body,
        "subject": t.subject,
    }


async def _fetch_tenant(db: AsyncSession, ctx: TenantContext) -> dict:
    t = (
        await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))
    ).scalar_one()
    ms = dict((t.settings_jsonb or {}).get("messaging") or {})
    return {
        "id": t.id,
        "timezone": t.timezone,
        "name": t.name,
        "messaging_enabled": ms.get("messaging_enabled", False),
        "daily_sms_cap_cents": ms.get("daily_sms_cap_cents", 2500),
        "twilio_messaging_service_sid": ms.get("twilio_messaging_service_sid"),
        "twilio_phone_number": ms.get("twilio_phone_number"),
        "resend_from_email": ms.get("resend_from_email"),
    }


def _callback_url(channel: str) -> str:
    base = (getattr(settings, "PUBLIC_BASE_URL", None) or "https://app.clarityos.app").rstrip("/")
    if channel == "sms":
        return f"{base}/api/webhooks/twilio"
    return f"{base}/api/webhooks/postmark"


# ---------------------------------------------------------------------------
# Single send
# ---------------------------------------------------------------------------


@router.post("/send", response_model=MessageLogOut)
async def send_message(
    payload: SingleSendRequest,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageLogOut:
    """Dispatch a single message via ``sender.dispatch``.

    Returns 422 when neither ``body`` nor ``template_id`` is provided.
    OptOutBlocked → 409 ``{code, message}``.
    CostCapExceeded → 429 ``{code: COST_CAP_EXCEEDED, message}``.
    On provider failure (status == ``failed``), invokes ``record_bounce`` so
    CRM-20 fires on the synchronous path even when no webhook arrives.
    """
    if payload.body is None and payload.template_id is None:
        raise HTTPException(
            status_code=422,
            detail="Either body or template_id must be provided",
        )

    patient = await _fetch_patient(db, ctx, payload.patient_id)
    tenant = await _fetch_tenant(db, ctx)
    template = (
        await _fetch_template(db, ctx, payload.template_id)
        if payload.template_id
        else None
    )

    req = DispatchRequest(
        tenant_id=ctx.tenant_id,
        patient_id=payload.patient_id,
        channel=payload.channel,
        purpose=payload.purpose,
        body_override=payload.body,
        subject=payload.subject,
        template_id=payload.template_id,
        template_kind=payload.template_kind or (template["kind"] if template else None),
        tokens=payload.tokens,
        appointment_id=payload.appointment_id,
        actor_user_id=ctx.user_id,
        force_outside_quiet_hours=payload.force_outside_quiet_hours,
        language=payload.language,
    )

    try:
        log = await dispatch(
            db,
            ctx,
            req,
            patient=patient,
            tenant=tenant,
            template=template,
            status_callback_url=_callback_url(payload.channel),
        )
    except OptOutBlocked as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": exc.code, "message": str(exc)},
        )
    except CostCapExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={"code": "COST_CAP_EXCEEDED", "message": str(exc)},
        )

    if log.status == "failed":
        await record_bounce(
            db,
            ctx,
            patient_id=payload.patient_id,
            channel=payload.channel,
        )

    await db.commit()
    return MessageLogOut.model_validate(log)


# ---------------------------------------------------------------------------
# Bulk send
# ---------------------------------------------------------------------------


@router.post("/bulk-send", response_model=BulkSendResponse)
async def bulk_send_route(
    payload: BulkSendRequest,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BulkSendResponse:
    """Bulk dispatch up to 50 recipients with 1 msg/sec throttle.

    Audit row is committed BEFORE any send so a process kill mid-batch
    leaves a recoverable record. ``OptOutBlocked`` increments
    ``excluded_count`` (not ``failed_count``).
    """
    recipients = [
        BulkRecipient(patient_id=r.patient_id, tokens=r.tokens)
        for r in payload.recipients
    ]

    async def _patient(pid: UUID) -> dict:
        return await _fetch_patient(db, ctx, pid)

    async def _template(tid: UUID) -> dict:
        return await _fetch_template(db, ctx, tid)

    async def _tenant() -> dict:
        return await _fetch_tenant(db, ctx)

    result = await service_bulk_send(
        db,
        ctx,
        recipients=recipients,
        template_id=payload.template_id,
        channel=payload.channel,
        purpose="manual",
        force_outside_quiet_hours=payload.force_outside_quiet_hours,
        fetch_patient=_patient,
        fetch_template=_template,
        fetch_tenant=_tenant,
        status_callback_url=_callback_url(payload.channel),
    )

    return BulkSendResponse(
        batch_id=result.batch_id,
        sent_count=result.sent_count,
        failed_count=result.failed_count,
        excluded_count=result.excluded_count,
        errors=[BulkSendError(**e) for e in result.errors],
    )
