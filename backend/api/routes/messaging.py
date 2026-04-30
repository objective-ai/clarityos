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
