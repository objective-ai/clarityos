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
from backend.services.messaging.ai_draft import draft_message
from backend.services.messaging.bounce_tracker import record_bounce
from backend.services.messaging.bulk_send import BulkRecipient
from backend.services.messaging.bulk_send import bulk_send as service_bulk_send
from backend.services.messaging.recall import candidate_query, run_recall_batch
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


# ---------------------------------------------------------------------------
# Recall queue
# ---------------------------------------------------------------------------


@router.get("/recall-queue")
async def get_recall_queue(
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Live recall candidates: 12mo since last finalized + no future appt + not exhausted/deceased."""
    candidates = await candidate_query(db, ctx.tenant_id)
    return {"candidates": candidates}


@router.post("/recall-queue/send-all", response_model=RecallSendAllResponse)
async def send_recall_batch(
    payload: RecallSendAllRequest,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecallSendAllResponse:
    """Dispatch a recall batch and increment per-patient touch counts.

    A 2nd touch flips ``recall_exhausted=true`` so the patient drops out of
    subsequent ``GET /recall-queue`` results.
    """

    async def _patient(pid: UUID) -> dict:
        return await _fetch_patient(db, ctx, pid)

    async def _template(tid: UUID) -> dict:
        return await _fetch_template(db, ctx, tid)

    async def _tenant() -> dict:
        return await _fetch_tenant(db, ctx)

    run = await run_recall_batch(
        db,
        ctx,
        candidate_patient_ids=payload.candidate_patient_ids,
        template_id=payload.template_id,
        channel=payload.channel,
        fetch_patient=_patient,
        fetch_template=_template,
        fetch_tenant=_tenant,
        status_callback_url=_callback_url(payload.channel),
    )
    await db.commit()
    return RecallSendAllResponse(
        run_id=run.id,
        sent=run.sent_count,
        failed=run.failed_count,
        excluded=run.excluded_count,
    )


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@router.get("/history/{patient_id}", response_model=list[MessageLogOut])
async def history(
    patient_id: UUID,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, le=200),
) -> list[MessageLogOut]:
    """Per-patient message history, newest first. Soft-deleted rows hidden."""
    rows = (
        await db.execute(
            select(MessageLog)
            .where(
                MessageLog.tenant_id == ctx.tenant_id,
                MessageLog.patient_id == patient_id,
                MessageLog.deleted_at.is_(None),
            )
            .order_by(desc(MessageLog.created_at))
            .limit(limit)
        )
    ).scalars().all()
    return [MessageLogOut.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Inbox
# ---------------------------------------------------------------------------


@router.get("/inbox")
async def inbox(
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
    filter_classification: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
):
    """Inbound SMS feed — most-recent first, optional classification filter."""
    q = (
        select(InboundMessage)
        .where(
            InboundMessage.tenant_id == ctx.tenant_id,
            InboundMessage.deleted_at.is_(None),
        )
        .order_by(desc(InboundMessage.received_at))
        .limit(limit)
    )
    if filter_classification:
        q = q.where(InboundMessage.classification == filter_classification)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": str(r.id),
            "patient_id": str(r.patient_id) if r.patient_id else None,
            "from_e164": r.from_e164,
            "body": r.body,
            "classification": r.classification,
            "classification_confidence": r.classification_confidence,
            "is_read": r.is_read,
            "received_at": r.received_at.isoformat() if r.received_at else None,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Analytics aggregate (Phase 8 single-endpoint precedent)
# ---------------------------------------------------------------------------


@router.get("/analytics")
async def analytics(
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
    range_days: int = Query(default=30, ge=1, le=365),
):
    """Reminder funnel + recall conversion + opt-out trend + cost in one response.

    Mirrors Phase 8's ``/api/analytics`` aggregate pattern: one endpoint
    populates all charts + KPIs so the dashboard makes a single round-trip.
    """
    from sqlalchemy import text as _text

    funnel = (
        await db.execute(
            _text(
                """
                SELECT status, COUNT(*) AS count
                FROM message_log
                WHERE tenant_id = :t
                      AND created_at > now() - (:days || ' days')::interval
                      AND purpose = 'operational'
                      AND deleted_at IS NULL
                GROUP BY status
                """
            ),
            {"t": str(ctx.tenant_id), "days": range_days},
        )
    ).mappings().all()

    optout_trend = (
        await db.execute(
            _text(
                """
                SELECT date_trunc('week', created_at) AS week, COUNT(*) AS count
                FROM audit_log
                WHERE tenant_id = :t
                      AND action = 'opt_out_recorded'
                      AND created_at > now() - (:days || ' days')::interval
                GROUP BY 1
                ORDER BY 1
                """
            ),
            {"t": str(ctx.tenant_id), "days": range_days},
        )
    ).mappings().all()

    cost_volume = (
        await db.execute(
            _text(
                """
                SELECT date_trunc('day', created_at) AS day,
                       channel,
                       COUNT(*) AS count,
                       COALESCE(SUM(provider_cost_cents), 0) AS cost_cents
                FROM message_log
                WHERE tenant_id = :t
                      AND created_at > now() - (:days || ' days')::interval
                      AND status IN ('sent', 'delivered', 'read')
                      AND deleted_at IS NULL
                GROUP BY 1, 2
                ORDER BY 1, 2
                """
            ),
            {"t": str(ctx.tenant_id), "days": range_days},
        )
    ).mappings().all()

    recall_conversion = (
        await db.execute(
            _text(
                """
                SELECT
                  (SELECT COUNT(*) FROM message_log
                     WHERE tenant_id = :t
                           AND template_kind LIKE 'recall_%%'
                           AND status IN ('sent', 'delivered')
                           AND created_at > now() - (:days || ' days')::interval) AS sent,
                  (SELECT COUNT(DISTINCT a.patient_id) FROM appointments a
                     JOIN message_log m ON m.patient_id = a.patient_id
                                      AND m.template_kind LIKE 'recall_%%'
                     WHERE a.tenant_id = :t
                           AND a.start_time > m.sent_at
                           AND a.start_time < m.sent_at + INTERVAL '90 days'
                           AND m.created_at > now() - (:days || ' days')::interval) AS booked
                """
            ),
            {"t": str(ctx.tenant_id), "days": range_days},
        )
    ).mappings().one()

    sent_total = sum(
        r["count"] for r in funnel if r["status"] in ("sent", "delivered", "read")
    )
    failed_total = sum(r["count"] for r in funnel if r["status"] == "failed")
    optouts_total = sum(r["count"] for r in optout_trend)
    cost_total_cents = sum(r["cost_cents"] for r in cost_volume)

    return {
        "kpis": {
            "sent_total": sent_total,
            "failed_total": failed_total,
            "optouts_total": optouts_total,
            "cost_total_cents": cost_total_cents,
        },
        "reminder_funnel": [dict(r) for r in funnel],
        "recall_conversion": dict(recall_conversion),
        "optout_trend": [
            {"week": r["week"].isoformat() if r["week"] else None, "count": r["count"]}
            for r in optout_trend
        ],
        "cost_volume": [
            {
                "day": r["day"].isoformat() if r["day"] else None,
                "channel": r["channel"],
                "count": r["count"],
                "cost_cents": r["cost_cents"],
            }
            for r in cost_volume
        ],
    }


# ---------------------------------------------------------------------------
# AI draft assist
# ---------------------------------------------------------------------------


@router.post("/ai-draft", response_model=AIDraftResponse)
async def ai_draft_route(
    payload: AIDraftRequest,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AIDraftResponse:
    """Return a HIPAA-safe message body drafted by Claude. 409 on opt-out."""
    patient = await _fetch_patient(db, ctx, payload.patient_id)
    tenant = await _fetch_tenant(db, ctx)
    try:
        body = await draft_message(
            intent=payload.intent,
            channel=payload.channel,
            purpose=payload.purpose,
            patient_first_name=patient["first_name"],
            patient_contact_info=patient["contact_info_jsonb"],
            clinic_name=tenant["name"],
        )
    except OptOutBlocked as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": exc.code, "message": str(exc)},
        )
    return AIDraftResponse(body=body)


# ---------------------------------------------------------------------------
# Templates CRUD
# ---------------------------------------------------------------------------


@router.get("/templates", response_model=list[MessageTemplateOut])
async def list_templates(
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MessageTemplateOut]:
    """All templates for the caller's tenant, ordered by kind then language."""
    rows = (
        await db.execute(
            select(MessageTemplate)
            .where(
                MessageTemplate.tenant_id == ctx.tenant_id,
                MessageTemplate.deleted_at.is_(None),
            )
            .order_by(MessageTemplate.kind, MessageTemplate.language)
        )
    ).scalars().all()
    return [MessageTemplateOut.model_validate(r) for r in rows]


@router.post("/templates", response_model=MessageTemplateOut, status_code=201)
async def create_template(
    payload: MessageTemplateCreate,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageTemplateOut:
    """Create a tenant-scoped template; emits TEMPLATE_CREATED audit."""
    template = MessageTemplate(
        tenant_id=ctx.tenant_id,
        kind=payload.kind,
        channel=payload.channel,
        language=payload.language,
        subject=payload.subject,
        body=payload.body,
        is_default=False,
    )
    db.add(template)
    await db.flush()
    await log_action(
        db,
        ctx,
        AuditAction.TEMPLATE_CREATED,
        "message_template",
        template.id,
        metadata={
            "kind": payload.kind,
            "channel": payload.channel,
            "language": payload.language,
        },
    )
    await db.commit()
    return MessageTemplateOut.model_validate(template)


@router.patch("/templates/{template_id}", response_model=MessageTemplateOut)
async def update_template(
    template_id: UUID,
    payload: MessageTemplateUpdate,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageTemplateOut:
    """Update template body/subject; emits TEMPLATE_UPDATED audit."""
    template = (
        await db.execute(
            select(MessageTemplate).where(
                MessageTemplate.id == template_id,
                MessageTemplate.tenant_id == ctx.tenant_id,
                MessageTemplate.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    changed_keys: list[str] = []
    if payload.body is not None:
        template.body = payload.body
        changed_keys.append("body")
    if payload.subject is not None:
        template.subject = payload.subject
        changed_keys.append("subject")

    await db.flush()
    await log_action(
        db,
        ctx,
        AuditAction.TEMPLATE_UPDATED,
        "message_template",
        template.id,
        metadata={"changed_keys": changed_keys},
    )
    await db.commit()
    return MessageTemplateOut.model_validate(template)


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Soft-delete a template + emit TEMPLATE_UPDATED audit (action: soft_delete)."""
    template = (
        await db.execute(
            select(MessageTemplate).where(
                MessageTemplate.id == template_id,
                MessageTemplate.tenant_id == ctx.tenant_id,
                MessageTemplate.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    template.deleted_at = datetime.now(timezone.utc)
    await log_action(
        db,
        ctx,
        AuditAction.TEMPLATE_UPDATED,
        "message_template",
        template.id,
        metadata={"action": "soft_delete"},
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Settings (tenant-level messaging config)
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=MessagingSettingsOut)
async def get_settings(
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessagingSettingsOut:
    """Read tenant.settings_jsonb.messaging."""
    tenant = await _fetch_tenant(db, ctx)
    return MessagingSettingsOut(
        messaging_enabled=tenant.get("messaging_enabled", False),
        daily_sms_cap_cents=tenant.get("daily_sms_cap_cents", 2500),
        twilio_phone_number=tenant.get("twilio_phone_number"),
        twilio_messaging_service_sid=tenant.get("twilio_messaging_service_sid"),
        resend_from_email=tenant.get("resend_from_email"),
    )


@router.patch("/settings", response_model=MessagingSettingsOut)
async def update_settings(
    payload: MessagingSettingsUpdate,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessagingSettingsOut:
    """Update messaging settings; emit MESSAGING_ENABLED/DISABLED on toggle."""
    from sqlalchemy.orm.attributes import flag_modified

    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))
    ).scalar_one()

    settings_dict = dict(tenant.settings_jsonb or {})
    msg = dict(settings_dict.get("messaging") or {})
    was_enabled = bool(msg.get("messaging_enabled", False))

    if payload.messaging_enabled is not None:
        msg["messaging_enabled"] = payload.messaging_enabled
    if payload.daily_sms_cap_cents is not None:
        msg["daily_sms_cap_cents"] = payload.daily_sms_cap_cents
    if payload.twilio_phone_number is not None:
        msg["twilio_phone_number"] = payload.twilio_phone_number
    if payload.twilio_messaging_service_sid is not None:
        msg["twilio_messaging_service_sid"] = payload.twilio_messaging_service_sid
    if payload.resend_from_email is not None:
        msg["resend_from_email"] = payload.resend_from_email

    settings_dict["messaging"] = msg
    tenant.settings_jsonb = settings_dict
    flag_modified(tenant, "settings_jsonb")

    now_enabled = bool(msg.get("messaging_enabled", False))
    if now_enabled and not was_enabled:
        await log_action(
            db,
            ctx,
            AuditAction.MESSAGING_ENABLED,
            "tenant",
            ctx.tenant_id,
            metadata={},
        )
    elif not now_enabled and was_enabled:
        await log_action(
            db,
            ctx,
            AuditAction.MESSAGING_DISABLED,
            "tenant",
            ctx.tenant_id,
            metadata={},
        )

    await db.commit()
    return MessagingSettingsOut(
        messaging_enabled=now_enabled,
        daily_sms_cap_cents=msg.get("daily_sms_cap_cents", 2500),
        twilio_phone_number=msg.get("twilio_phone_number"),
        twilio_messaging_service_sid=msg.get("twilio_messaging_service_sid"),
        resend_from_email=msg.get("resend_from_email"),
    )


# ---------------------------------------------------------------------------
# Per-patient channel preferences
# ---------------------------------------------------------------------------


def _build_channel_preference(patient_id: UUID, contact: dict) -> ChannelPreferenceOut:
    """Project Patient.contact_info_jsonb into the ChannelPreferenceOut wire shape."""
    consents = ConsentFlagsOut(
        sms_marketing=bool(contact.get("consent_sms_marketing_at")),
        sms_operational=bool(contact.get("consent_sms_operational_at")),
        email_marketing=bool(contact.get("consent_email_marketing_at")),
        email_operational=bool(contact.get("consent_email_operational_at")),
        sms_marketing_at=contact.get("consent_sms_marketing_at"),
        sms_operational_at=contact.get("consent_sms_operational_at"),
        email_marketing_at=contact.get("consent_email_marketing_at"),
        email_operational_at=contact.get("consent_email_operational_at"),
        sms_opted_out_at=contact.get("sms_opted_out_at"),
        paused_until=contact.get("paused_until"),
    )
    guardian = contact.get("guardian") or {}
    return ChannelPreferenceOut(
        patient_id=patient_id,
        preferred_channel=contact.get("preferred_channel", "both"),
        preferred_language=contact.get("preferred_language", "en"),
        consents=consents,
        guardian_routing=bool(guardian),
        guardian_name=guardian.get("name"),
        guardian_phone_e164=guardian.get("phone_e164"),
        guardian_email=guardian.get("email"),
        guardian_relationship=guardian.get("relationship"),
        recall_exhausted=bool(contact.get("recall_exhausted", False)),
    )


@router.get("/preferences/{patient_id}", response_model=ChannelPreferenceOut)
async def get_preferences(
    patient_id: UUID,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChannelPreferenceOut:
    """Read per-patient channel + consent state."""
    patient = await _fetch_patient(db, ctx, patient_id)
    return _build_channel_preference(patient_id, patient["contact_info_jsonb"])


@router.patch("/preferences/{patient_id}", response_model=ChannelPreferenceOut)
async def update_preferences(
    patient_id: UUID,
    payload: ChannelPreferenceUpdate,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChannelPreferenceOut:
    """Update consent flags + paused_until + guardian fields.

    Emits CHANNEL_PREFERENCE_UPDATED + (CONSENT_GRANTED OR CONSENT_REVOKED)
    audits when individual consent flags change state.
    """
    from sqlalchemy.orm.attributes import flag_modified

    patient = (
        await db.execute(
            select(Patient).where(
                Patient.id == patient_id,
                Patient.tenant_id == ctx.tenant_id,
                Patient.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")

    contact = dict(patient.contact_info_jsonb or {})
    now_iso = datetime.now(timezone.utc).isoformat()
    granted: list[str] = []
    revoked: list[str] = []

    if payload.consents is not None:
        for key in ("sms_marketing", "sms_operational", "email_marketing", "email_operational"):
            wanted = getattr(payload.consents, key)
            consent_key = f"consent_{key}_at"
            prev = bool(contact.get(consent_key))
            if wanted and not prev:
                contact[consent_key] = now_iso
                granted.append(key)
            elif not wanted and prev:
                contact[consent_key] = None
                revoked.append(key)

    if payload.preferred_channel is not None:
        contact["preferred_channel"] = payload.preferred_channel
    if payload.preferred_language is not None:
        contact["preferred_language"] = payload.preferred_language

    if payload.guardian_routing is True or any(
        v is not None
        for v in (
            payload.guardian_name,
            payload.guardian_phone_e164,
            payload.guardian_email,
            payload.guardian_relationship,
        )
    ):
        guardian = dict(contact.get("guardian") or {})
        if payload.guardian_name is not None:
            guardian["name"] = payload.guardian_name
        if payload.guardian_phone_e164 is not None:
            guardian["phone_e164"] = payload.guardian_phone_e164
        if payload.guardian_email is not None:
            guardian["email"] = payload.guardian_email
        if payload.guardian_relationship is not None:
            guardian["relationship"] = payload.guardian_relationship
        contact["guardian"] = guardian

    patient.contact_info_jsonb = contact
    flag_modified(patient, "contact_info_jsonb")

    await log_action(
        db,
        ctx,
        AuditAction.CHANNEL_PREFERENCE_UPDATED,
        "patient",
        patient.id,
        patient_id=patient.id,
        metadata={"granted": granted, "revoked": revoked},
    )
    if granted:
        await log_action(
            db,
            ctx,
            AuditAction.CONSENT_GRANTED,
            "patient",
            patient.id,
            patient_id=patient.id,
            metadata={"consents": granted},
        )
    if revoked:
        await log_action(
            db,
            ctx,
            AuditAction.CONSENT_REVOKED,
            "patient",
            patient.id,
            patient_id=patient.id,
            metadata={"consents": revoked},
        )

    await db.commit()
    return _build_channel_preference(patient_id, contact)


# ---------------------------------------------------------------------------
# Onboarding wizard (Plan 12-10)
# ---------------------------------------------------------------------------


def _require_owner(ctx: TenantContext) -> None:
    if (ctx.role or "").lower() != "owner":
        raise HTTPException(status_code=403, detail="OWNER role required")


@router.post("/onboarding/provision-number")
async def onboarding_provision_number(
    payload: dict,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Provision a real Twilio local number in the requested area code and
    persist it on tenant.settings_jsonb.messaging.
    """
    from sqlalchemy.orm.attributes import flag_modified

    from backend.services.messaging.twilio_client import (
        NoNumberAvailable,
        provision_local_number,
    )

    _require_owner(ctx)
    area_code = (payload or {}).get("area_code")
    if not area_code or not str(area_code).isdigit() or len(str(area_code)) != 3:
        raise HTTPException(status_code=422, detail="area_code must be a 3-digit string")

    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))
    ).scalar_one()
    settings_dict = dict(tenant.settings_jsonb or {})
    msg = dict(settings_dict.get("messaging") or {})
    msid = msg.get("twilio_messaging_service_sid") or settings.TWILIO_MESSAGING_SERVICE_SID
    if not msid:
        raise HTTPException(
            status_code=400,
            detail="TWILIO_MESSAGING_SERVICE_SID not configured for this tenant",
        )

    try:
        result = await provision_local_number(
            area_code=str(area_code),
            friendly_name=f"{tenant.name} - ClarityOS",
            messaging_service_sid=msid,
        )
    except NoNumberAvailable as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    msg["twilio_messaging_service_sid"] = msid
    msg["twilio_phone_number"] = result["phone_number"]
    msg["twilio_phone_sid"] = result["sid"]
    settings_dict["messaging"] = msg
    tenant.settings_jsonb = settings_dict
    flag_modified(tenant, "settings_jsonb")
    await db.commit()
    return {"phone_number": result["phone_number"], "sid": result["sid"]}


@router.post("/onboarding/seed-templates")
async def onboarding_seed_templates(
    payload: dict,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Seed industry-pack templates for the tenant. Idempotent."""
    from backend.services.messaging.seeds import seed_default_templates

    _require_owner(ctx)
    practice_type = (payload or {}).get("practice_type", "optometry")
    if practice_type not in ("optometry", "ophthalmology", "general"):
        raise HTTPException(status_code=422, detail="invalid practice_type")
    count = await seed_default_templates(db, ctx.tenant_id, practice_type)
    await db.commit()
    return {"seeded": count, "practice_type": practice_type}


@router.post("/onboarding/test-send")
async def onboarding_test_send(
    payload: dict,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Send a real test SMS + email to OWNER's contact via the provider clients
    directly. Bypasses the patient-bound dispatch path. Records audit but does
    NOT flip messaging_enabled.
    """
    from backend.services.messaging.email_client import send_email
    from backend.services.messaging.twilio_client import send_sms

    _require_owner(ctx)
    owner_phone = (payload or {}).get("owner_phone")
    owner_email = (payload or {}).get("owner_email")
    if not owner_phone or not owner_email:
        raise HTTPException(
            status_code=422,
            detail="owner_phone and owner_email required",
        )

    tenant = await _fetch_tenant(db, ctx)
    msid = tenant.get("twilio_messaging_service_sid")
    if not msid:
        raise HTTPException(
            status_code=400,
            detail="Twilio Messaging Service not provisioned (run step 3 first)",
        )

    sms_body = (
        "ClarityOS test: messaging is configured. "
        "Reply STOP to opt out at any time."
    )
    email_subject = "ClarityOS messaging test"
    email_html = (
        "<p>ClarityOS test: messaging is configured.</p>"
        "<p>You can unsubscribe at any time.</p>"
    )

    sms_sid = await send_sms(
        body=sms_body,
        to=owner_phone,
        status_callback_url=_callback_url("sms"),
        messaging_service_sid=msid,
    )
    email_id = await send_email(
        subject=email_subject,
        html=email_html,
        to=owner_email,
        idempotency_key=f"onboarding-test-{ctx.tenant_id}",
    )

    await log_action(
        db,
        ctx,
        AuditAction.MESSAGE_SENT,
        "tenant",
        ctx.tenant_id,
        metadata={
            "trigger": "onboarding_test_send",
            "sms_sid": sms_sid,
            "email_id": email_id,
        },
    )
    await db.commit()
    return {"sms_sid": sms_sid, "email_id": email_id}


@router.post("/onboarding/activate")
async def onboarding_activate(
    payload: dict,
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Flip tenant.settings_jsonb.messaging.messaging_enabled = true. OWNER only.

    Triggered by the wizard's "I Received Them" confirmation in step 7.
    """
    from sqlalchemy.orm.attributes import flag_modified

    _require_owner(ctx)
    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))
    ).scalar_one()
    settings_dict = dict(tenant.settings_jsonb or {})
    msg = dict(settings_dict.get("messaging") or {})
    was_enabled = bool(msg.get("messaging_enabled", False))
    msg["messaging_enabled"] = True
    settings_dict["messaging"] = msg
    tenant.settings_jsonb = settings_dict
    flag_modified(tenant, "settings_jsonb")

    if not was_enabled:
        await log_action(
            db,
            ctx,
            AuditAction.MESSAGING_ENABLED,
            "tenant",
            ctx.tenant_id,
            metadata={"trigger": "onboarding_wizard"},
        )
    await db.commit()
    return {"messaging_enabled": True}


# ---------------------------------------------------------------------------
# Compliance Report PDF (Plan 12-10, CRM-16)
# ---------------------------------------------------------------------------


@router.get("/compliance-report")
async def compliance_report(
    ctx: Annotated[TenantContext, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: str = Query(..., description="ISO date YYYY-MM-DD"),
    to_date: str = Query(..., description="ISO date YYYY-MM-DD"),
):
    """OWNER-only PDF download summarizing volume + opt-outs + consent events."""
    from datetime import date as _date

    from fastapi.responses import Response

    from backend.services.messaging.compliance_report import (
        generate_compliance_report_pdf,
    )

    if (ctx.role or "").lower() != "owner":
        raise HTTPException(status_code=403, detail="OWNER role required")

    try:
        f = _date.fromisoformat(from_date)
        t = _date.fromisoformat(to_date)
    except ValueError:
        raise HTTPException(
            status_code=422, detail="from_date and to_date must be YYYY-MM-DD"
        )

    pdf_bytes = await generate_compliance_report_pdf(
        db, ctx.tenant_id, from_date=f, to_date=t
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="compliance-{from_date}-to-{to_date}.pdf"'
            ),
        },
    )
