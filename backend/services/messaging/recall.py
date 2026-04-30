"""Recall queue: live candidate query + batch run.

Per CONTEXT.md: 12mo-since-last-finalized + no-future-appt + not-exhausted
+ not-deceased. Cadence: 2 touches max (m12 + m14), then ``recall_exhausted``
flips to true so the patient drops out of subsequent queues.

The candidate query is recomputed every page load (no materialized view) —
acceptable at the pilot's patient volume. RecallQueueRun captures one row
per "Send All" press for analytics + audit.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.audit import log_action
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction, Patient
from backend.db.models.tenant.messaging import RecallQueueRun

from .bulk_send import BulkRecipient
from .bulk_send import bulk_send as service_bulk_send

logger = logging.getLogger(__name__)


async def candidate_query(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    """Return recall candidates: 12mo since last finalized encounter, no
    future appointment, not exhausted, not deceased, with at least one
    contact channel populated.
    """
    sql = text(
        """
        WITH last_finalized AS (
          SELECT patient_id, MAX(finalized_at) AS last_finalized_at
          FROM encounters
          WHERE tenant_id = :tenant_id
                AND finalized_at IS NOT NULL
                AND deleted_at IS NULL
          GROUP BY patient_id
        ), future_appts AS (
          SELECT DISTINCT patient_id
          FROM appointments
          WHERE tenant_id = :tenant_id
                AND start_time > now()
                AND status NOT IN ('cancelled', 'no_show')
        )
        SELECT p.id AS patient_id,
               p.first_name,
               p.last_name,
               lf.last_finalized_at,
               (p.contact_info_jsonb ->> 'phone_e164') AS phone_e164,
               (p.contact_info_jsonb ->> 'email') AS email,
               (p.contact_info_jsonb ->> 'consent_sms_marketing_at') IS NOT NULL
                   AS has_marketing_consent_sms,
               (p.contact_info_jsonb ->> 'consent_email_marketing_at') IS NOT NULL
                   AS has_marketing_consent_email,
               COALESCE((p.contact_info_jsonb ->> 'recall_exhausted')::bool, FALSE)
                   AS recall_exhausted,
               COALESCE((p.contact_info_jsonb ->> 'recall_touch_count')::int, 0)
                   AS recall_touch_count
        FROM patients p
        JOIN last_finalized lf ON lf.patient_id = p.id
        LEFT JOIN future_appts fa ON fa.patient_id = p.id
        WHERE p.tenant_id = :tenant_id
          AND p.deleted_at IS NULL
          AND lf.last_finalized_at < (now() - INTERVAL '12 months')
          AND fa.patient_id IS NULL
          AND COALESCE((p.contact_info_jsonb ->> 'recall_exhausted')::bool, FALSE) = FALSE
          AND COALESCE((p.contact_info_jsonb ->> 'deceased')::bool, FALSE) = FALSE
          AND ((p.contact_info_jsonb ->> 'phone_e164') IS NOT NULL
               OR (p.contact_info_jsonb ->> 'email') IS NOT NULL)
        ORDER BY lf.last_finalized_at ASC
        LIMIT 500
        """
    )
    rows = (await db.execute(sql, {"tenant_id": str(tenant_id)})).mappings().all()
    return [dict(r) for r in rows]


async def run_recall_batch(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    candidate_patient_ids: list[UUID],
    template_id: UUID,
    channel: Literal["sms", "email"],
    fetch_patient,
    fetch_template,
    fetch_tenant,
    status_callback_url: str = "",
) -> RecallQueueRun:
    """Dispatch a recall batch + mark exhausted after 2nd touch.

    Returns the populated ``RecallQueueRun`` row (caller commits).
    """
    run = RecallQueueRun(
        tenant_id=ctx.tenant_id,
        started_by_user_id=ctx.user_id,
        candidate_count=len(candidate_patient_ids),
    )
    db.add(run)
    await db.flush()

    await log_action(
        db,
        ctx,
        AuditAction.RECALL_QUEUE_RUN_STARTED,
        "recall_queue_run",
        run.id,
        metadata={"candidate_count": len(candidate_patient_ids)},
    )

    recipients: list[BulkRecipient] = []
    for pid in candidate_patient_ids:
        p = (
            await db.execute(select(Patient).where(Patient.id == pid))
        ).scalar_one_or_none()
        if p is None:
            continue
        recipients.append(
            BulkRecipient(
                patient_id=pid,
                tokens={
                    "patient_first_name": p.first_name,
                    "clinic_name": "Your Eye Clinic",
                    "confirm_link": "",
                },
            )
        )

    bulk_result = await service_bulk_send(
        db,
        ctx,
        recipients=recipients,
        template_id=template_id,
        channel=channel,
        purpose="marketing",
        force_outside_quiet_hours=False,
        fetch_patient=fetch_patient,
        fetch_template=fetch_template,
        fetch_tenant=fetch_tenant,
        status_callback_url=status_callback_url,
    )

    run.sent_count = bulk_result.sent_count
    run.failed_count = bulk_result.failed_count
    run.excluded_count = bulk_result.excluded_count
    run.completed_at = datetime.now(timezone.utc)
    run.metadata_ = {
        "batch_id": str(bulk_result.batch_id),
        "errors": bulk_result.errors[:20],
    }

    now_iso = datetime.now(timezone.utc).isoformat()
    for pid in candidate_patient_ids:
        p = (
            await db.execute(select(Patient).where(Patient.id == pid))
        ).scalar_one_or_none()
        if p is None:
            continue
        contact = dict(p.contact_info_jsonb or {})
        touch_count = int(contact.get("recall_touch_count", 0)) + 1
        contact["recall_touch_count"] = touch_count
        contact["last_recall_sent_at"] = now_iso
        if touch_count >= 2:
            contact["recall_exhausted"] = True
        p.contact_info_jsonb = contact
        flag_modified(p, "contact_info_jsonb")

    await log_action(
        db,
        ctx,
        AuditAction.RECALL_QUEUE_RUN_COMPLETED,
        "recall_queue_run",
        run.id,
        metadata={
            "sent": run.sent_count,
            "failed": run.failed_count,
            "excluded": run.excluded_count,
        },
    )
    await db.flush()
    return run
