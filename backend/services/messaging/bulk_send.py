"""Bulk send service — 50-recipient cap + 1 msg/sec throttle + single batch audit.

The choke point for staff-initiated bulk sends and recall batches. Wraps
``sender.dispatch`` with safeguards:

- ``BULK_SEND_LIMIT`` = 50 (HTTP 422 when exceeded)
- ``THROTTLE_SECONDS`` = 1.0 (per-recipient floor between sends)
- One ``BULK_MESSAGE_BATCH_CREATED`` audit row written + committed BEFORE the
  first send so the batch is recoverable if the process dies mid-loop.
- Per-recipient ``OptOutBlocked`` → ``excluded_count`` (not failed); the
  caller treats these as silently skipped.
- ``CostCapExceeded`` → ``failed_count`` for that recipient; the loop
  continues so per-tenant cost cap exhaustion is reported per-row.

CRM-20 bounce fallback is handled by ``backend/services/messaging/bounce_tracker.py``
(co-owned with the webhooks router). Routes (Plan 12-05) call ``record_bounce``
on synchronous dispatch failures; webhooks call it on async provider events.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction

from .opt_out_guard import OptOutBlocked
from .cost_cap import CostCapExceeded
from .sender import DispatchRequest, dispatch

logger = logging.getLogger(__name__)

BULK_SEND_LIMIT = 50
THROTTLE_SECONDS = 1.0


@dataclass
class BulkRecipient:
    patient_id: UUID
    tokens: dict[str, str] = field(default_factory=dict)


@dataclass
class BulkResult:
    batch_id: UUID
    sent_count: int
    failed_count: int
    excluded_count: int
    errors: list[dict]  # [{patient_id, code, message}]


PatientFetcher = Callable[[UUID], Awaitable[dict]]
TemplateFetcher = Callable[[UUID], Awaitable[dict]]
TenantFetcher = Callable[[], Awaitable[dict]]


async def bulk_send(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    recipients: list[BulkRecipient],
    template_id: UUID,
    channel: Literal["sms", "email"],
    purpose: Literal["operational", "marketing", "manual"] = "manual",
    force_outside_quiet_hours: bool = False,
    fetch_patient: PatientFetcher,
    fetch_template: TemplateFetcher,
    fetch_tenant: TenantFetcher,
    status_callback_url: str = "",
) -> BulkResult:
    """Dispatch each recipient serially under a 1 msg/sec floor.

    Raises ``HTTPException(422)`` if recipients exceed ``BULK_SEND_LIMIT``.
    """
    if len(recipients) > BULK_SEND_LIMIT:
        raise HTTPException(
            status_code=422,
            detail=f"Bulk send limit is {BULK_SEND_LIMIT} recipients (got {len(recipients)})",
        )

    batch_id = uuid4()
    template = await fetch_template(template_id)
    tenant = await fetch_tenant()

    # Audit batch creation BEFORE any sends — single source of truth
    await log_action(
        db,
        ctx,
        AuditAction.BULK_MESSAGE_BATCH_CREATED,
        "message_batch",
        batch_id,
        metadata={
            "recipient_count": len(recipients),
            "template_id": str(template_id),
            "channel": channel,
            "purpose": purpose,
        },
    )
    await db.commit()  # Lock the audit before any send

    sent = 0
    failed = 0
    excluded = 0
    errors: list[dict] = []

    for r in recipients:
        try:
            patient = await fetch_patient(r.patient_id)
            req = DispatchRequest(
                tenant_id=ctx.tenant_id,
                patient_id=r.patient_id,
                channel=channel,
                purpose=purpose,
                template_id=template_id,
                template_kind=template.get("kind"),
                tokens=r.tokens,
                batch_id=batch_id,
                actor_user_id=ctx.user_id,
                force_outside_quiet_hours=force_outside_quiet_hours,
                language=patient.get("contact_info_jsonb", {}).get(
                    "preferred_language", "en"
                ),
            )
            log = await dispatch(
                db,
                ctx,
                req,
                patient=patient,
                tenant=tenant,
                template=template,
                status_callback_url=status_callback_url,
            )
            if log.status == "failed":
                failed += 1
                errors.append(
                    {
                        "patient_id": str(r.patient_id),
                        "code": "PROVIDER_FAILED",
                        "message": log.failure_reason or "unknown",
                    }
                )
            else:
                sent += 1
        except OptOutBlocked as exc:
            excluded += 1
            errors.append(
                {
                    "patient_id": str(r.patient_id),
                    "code": exc.code,
                    "message": str(exc),
                }
            )
        except CostCapExceeded as exc:
            failed += 1
            errors.append(
                {
                    "patient_id": str(r.patient_id),
                    "code": "COST_CAP_EXCEEDED",
                    "message": str(exc),
                }
            )
        except Exception as exc:  # noqa: BLE001 — last-resort catch keeps batch alive
            logger.exception("bulk_send recipient %s failed", r.patient_id)
            failed += 1
            errors.append(
                {
                    "patient_id": str(r.patient_id),
                    "code": "UNHANDLED",
                    "message": str(exc),
                }
            )
        finally:
            await asyncio.sleep(THROTTLE_SECONDS)

        await db.commit()

    return BulkResult(
        batch_id=batch_id,
        sent_count=sent,
        failed_count=failed,
        excluded_count=excluded,
        errors=errors,
    )
