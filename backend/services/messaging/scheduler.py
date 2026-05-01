"""Background scheduler — 5-minute tick, advisory-locked, env-gated.

Mirrors Phase 10.3 self-pinger pattern (backend/main.py: _health_pinger_loop).

CRM-19: _process_tenant calls bundle_household_reminders BEFORE the dispatch loop.
  Multi-member groups → one dispatch_bundled_reminder call (one SMS per household).
  Singleton groups → dispatch_reminder (per-patient body).

v1 limitation: Deferred manual messages are CANCELLED when their deferred_until passes.
  No re-dispatch — see Plan 12-06 objective for rationale (PHI-scrub state cannot be
  reconstructed safely from a stored row at v1; user re-composes the next morning).
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Unique 64-bit advisory-lock key for messaging scheduler (RESEARCH § Pattern 2)
_ADVISORY_LOCK_KEY = 0x0C12C12C12C12C12
_TICK_SECONDS = 300  # 5 minutes — matches CONTEXT.md cron range 5-15min

_task: asyncio.Task | None = None


async def tick_messaging_scheduler(db: AsyncSession) -> dict[str, int]:
    """One scheduler iteration. Returns counts dict for observability."""
    got_lock = (
        await db.execute(select(func.pg_try_advisory_lock(_ADVISORY_LOCK_KEY)))
    ).scalar()
    counts = {
        "due_count": 0,
        "bundled_groups": 0,
        "deferred_cancelled": 0,
        "sent": 0,
        "skipped_lock": 0,
    }
    if not got_lock:
        logger.info("messaging scheduler: another instance holds the lock, skipping tick")
        counts["skipped_lock"] = 1
        return counts

    try:
        from backend.db.models.public.saas import Tenant

        tenants = (await db.execute(select(Tenant))).scalars().all()
        for tenant in tenants:
            ms = (tenant.settings_jsonb or {}).get("messaging", {})
            if not ms.get("messaging_enabled"):
                continue
            await _process_tenant(db, tenant.id, counts)
    finally:
        await db.execute(select(func.pg_advisory_unlock(_ADVISORY_LOCK_KEY)))
    return counts


async def _process_tenant(db: AsyncSession, tenant_id: UUID, counts: dict) -> None:
    """Process one tenant's due reminders + cancel-expired deferred messages.

    Order:
      1. Compute due reminders (compute_due_reminders).
      2. Bundle by household (CRM-19) — bundle_household_reminders BEFORE the dispatch loop.
      3. For each group:
           - size > 1 → dispatch_bundled_reminder (ONE SMS to household primary)
           - size == 1 → dispatch_reminder (singleton)
      4. Cancel-expired deferred messages (v1 — no re-dispatch).
    """
    from backend.core.security import TenantContext

    from .reminder_cadence import (
        bundle_household_reminders,
        compute_due_reminders,
        dispatch_bundled_reminder,
        dispatch_reminder,
    )

    ctx = TenantContext(
        user_id=UUID("00000000-0000-0000-0000-000000000000"),
        tenant_id=tenant_id,
        role="system",
    )

    due = await compute_due_reminders(db, tenant_id)
    counts["due_count"] += len(due)

    if not due:
        deferred_count = await _process_deferred(db, tenant_id)
        counts["deferred_cancelled"] += deferred_count
        await db.commit()
        return

    fetch_patient = _make_fetch_patient(db, tenant_id)
    fetch_template = _make_fetch_template(db, tenant_id)
    fetch_tenant = _make_fetch_tenant(db, tenant_id)

    bundled_groups = await bundle_household_reminders(due, fetch_patient=fetch_patient)
    counts["bundled_groups"] += len(bundled_groups)

    callback_url = _callback_url("sms")

    for key, group in bundled_groups.items():
        try:
            if len(group) > 1:
                await dispatch_bundled_reminder(
                    db,
                    ctx,
                    bundle=group,
                    fetch_patient=fetch_patient,
                    fetch_template=fetch_template,
                    fetch_tenant=fetch_tenant,
                    status_callback_url=callback_url,
                )
                counts["sent"] += 1
            else:
                await dispatch_reminder(
                    db,
                    ctx,
                    due=group[0],
                    fetch_patient=fetch_patient,
                    fetch_template=fetch_template,
                    fetch_tenant=fetch_tenant,
                    status_callback_url=callback_url,
                )
                counts["sent"] += 1
        except Exception as exc:
            logger.warning("scheduler dispatch failed for group %s: %s", key, exc)

    deferred_count = await _process_deferred(db, tenant_id)
    counts["deferred_cancelled"] += deferred_count
    await db.commit()


async def _process_deferred(db: AsyncSession, tenant_id: UUID) -> int:
    """v1: CANCEL deferred messages whose deferred_until has passed.

    Rationale (Plan 12-06 objective): reconstructing the original guard chain
    (PHI scan, opt-out re-check, cost cap, AI-draft state) from a stored row is
    risky for clinical data correctness. The clinic user re-composes the message
    the next morning if it's still relevant. A future v2 may re-dispatch from a
    durable payload + re-validation.
    """
    from backend.db.models.tenant.messaging import MessageLog, MessageStatus

    rows = (
        await db.execute(
            select(MessageLog)
            .where(
                MessageLog.tenant_id == tenant_id,
                MessageLog.status == MessageStatus.DEFERRED.value,
                MessageLog.deferred_until <= datetime.now(timezone.utc),
                MessageLog.deleted_at.is_(None),
            )
            .limit(50)
        )
    ).scalars().all()

    count = 0
    for log in rows:
        log.status = MessageStatus.CANCELLED.value
        log.failure_reason = "Deferred window expired (v1: not re-dispatched). User must re-send."
        count += 1
    if count:
        await db.flush()
    return count


# -----------------------------------------------------------------------------
# Fetcher closures (mirror Plan 12-05 helpers — keep dispatch pure-orchestration)
# -----------------------------------------------------------------------------


def _make_fetch_patient(db: AsyncSession, tenant_id: UUID):
    async def fetch_patient(pid: UUID) -> dict[str, Any]:
        from backend.db.models.tenant.clinical import Patient

        p = (
            await db.execute(select(Patient).where(Patient.id == pid))
        ).scalar_one()
        contact = p.contact_info_jsonb or {}
        return {
            "id": p.id,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "dob": p.dob.isoformat() if p.dob else None,
            "phone_e164": contact.get("phone_e164"),
            "email": contact.get("email"),
            "guardian": contact.get("guardian"),
            "contact_info_jsonb": contact,
        }

    return fetch_patient


def _make_fetch_template(db: AsyncSession, tenant_id: UUID):
    async def fetch_template(kind: str, channel: str, language: str) -> dict[str, Any]:
        from backend.db.models.tenant.messaging import MessageTemplate

        t = (
            await db.execute(
                select(MessageTemplate)
                .where(
                    MessageTemplate.tenant_id == tenant_id,
                    MessageTemplate.kind == kind,
                    MessageTemplate.channel == channel,
                    MessageTemplate.language == language,
                    MessageTemplate.deleted_at.is_(None),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if t is None:
            t = (
                await db.execute(
                    select(MessageTemplate)
                    .where(
                        MessageTemplate.tenant_id == tenant_id,
                        MessageTemplate.kind == kind,
                        MessageTemplate.channel == channel,
                        MessageTemplate.is_default.is_(True),
                        MessageTemplate.deleted_at.is_(None),
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
        if t is None:
            raise ValueError(f"No template found for kind={kind} channel={channel}")
        return {
            "id": t.id,
            "kind": t.kind,
            "channel": t.channel,
            "language": t.language,
            "body": t.body,
            "subject": t.subject,
        }

    return fetch_template


def _make_fetch_tenant(db: AsyncSession, tenant_id: UUID):
    async def fetch_tenant() -> dict[str, Any]:
        from backend.db.models.public.saas import Tenant

        t = (
            await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        ).scalar_one()
        ms = (t.settings_jsonb or {}).get("messaging", {})
        return {
            "id": t.id,
            "timezone": t.timezone,
            "name": t.name,
            "twilio_messaging_service_sid": ms.get("twilio_messaging_service_sid"),
            "twilio_phone_number": ms.get("twilio_phone_number"),
            "postmark_from_email": ms.get("postmark_from_email"),
        }

    return fetch_tenant


def _callback_url(_kind: str) -> str:
    from backend.core.config import settings

    base = (
        getattr(settings, "PUBLIC_BASE_URL", None) or "https://app.clarityos.app"
    ).rstrip("/")
    return f"{base}/api/webhooks/twilio"


# -----------------------------------------------------------------------------
# asyncio loop + lifecycle
# -----------------------------------------------------------------------------


async def _scheduler_loop() -> None:
    from backend.db.session import AsyncSessionLocal

    while True:
        try:
            async with AsyncSessionLocal() as db:
                await tick_messaging_scheduler(db)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("messaging scheduler tick failed: %s", exc)
        await asyncio.sleep(_TICK_SECONDS)


def start_scheduler() -> asyncio.Task | None:
    """Called from main.py @startup. No-op when MESSAGING_SCHEDULER_ENABLED != 'true'."""
    global _task
    if os.getenv("MESSAGING_SCHEDULER_ENABLED", "true").lower() != "true":
        logger.info("messaging scheduler disabled by env (MESSAGING_SCHEDULER_ENABLED)")
        return None
    _task = asyncio.create_task(_scheduler_loop())
    return _task


def stop_scheduler() -> None:
    global _task
    if _task is not None and not _task.done():
        _task.cancel()
        _task = None


__all__ = [
    "tick_messaging_scheduler",
    "start_scheduler",
    "stop_scheduler",
]
