"""Appointment reminder cadence: 7d / 72h / 24h pre-appointment.

Per CONTEXT.md line 31. Idempotent via appointments.reminders_sent_count counter.
CRM-19 household bundling: bundle_household_reminders + dispatch_bundled_reminder
collapse multi-member households into ONE SMS to the household primary contact.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import Appointment
from backend.db.models.tenant.messaging import TemplateKind

from .sender import DispatchRequest, OptOutBlocked, dispatch

logger = logging.getLogger(__name__)

# (touch_index, hours_before, template_kind)
REMINDER_OFFSETS: list[tuple[int, int, str]] = [
    (0, 7 * 24, TemplateKind.REMINDER_7D.value),
    (1, 72, TemplateKind.REMINDER_72H.value),
    (2, 24, TemplateKind.REMINDER_24H.value),
]

# How wide the "due now" window is — must be >= the scheduler tick interval.
_DUE_WINDOW_MINUTES = 7  # 5min tick + 2min slack


@dataclass
class DueReminder:
    appointment_id: UUID
    patient_id: UUID
    touch_index: int
    template_kind: str
    appt_start_time: datetime


async def compute_due_reminders(
    db: AsyncSession,
    tenant_id: UUID,
    *,
    now: datetime | None = None,
) -> list[DueReminder]:
    """Return reminders that should fire in this tick window.

    Due iff:
      now <= start_time - offset < now + DUE_WINDOW
      AND patient_confirmed_at IS NULL
      AND status NOT IN ('cancelled', 'no_show')
      AND reminders_sent_count <= touch_index   (idempotency gate)
    """
    now = now or datetime.now(timezone.utc)
    out: list[DueReminder] = []
    window_end = now + timedelta(minutes=_DUE_WINDOW_MINUTES)

    for touch_idx, hours_before, kind in REMINDER_OFFSETS:
        start_lower = now + timedelta(hours=hours_before)
        start_upper = window_end + timedelta(hours=hours_before)

        rows = (
            await db.execute(
                select(Appointment).where(
                    Appointment.tenant_id == tenant_id,
                    Appointment.patient_confirmed_at.is_(None),
                    ~Appointment.status.in_(("cancelled", "no_show")),
                    Appointment.start_time >= start_lower,
                    Appointment.start_time < start_upper,
                    Appointment.reminders_sent_count <= touch_idx,
                )
            )
        ).scalars().all()

        for appt in rows:
            out.append(
                DueReminder(
                    appointment_id=appt.id,
                    patient_id=appt.patient_id,
                    touch_index=touch_idx,
                    template_kind=kind,
                    appt_start_time=appt.start_time,
                )
            )
    return out


async def bundle_household_reminders(
    due_list: list[DueReminder],
    *,
    fetch_patient: Callable[[UUID], Awaitable[dict]],
) -> dict[tuple[str, str, int, str], list[DueReminder]]:
    """Group due reminders by (shared_contact, ISO_date, touch_index, template_kind).

    Patients sharing a phone_e164 (or email when no phone) on the same date for the
    same touch get bundled into one group; caller dispatches one SMS per group.

    Singletons (no shared contact, or phone missing) get their own group keyed
    on patient_id so they pass through the per-patient dispatch path.
    """
    groups: dict[tuple[str, str, int, str], list[DueReminder]] = defaultdict(list)
    for d in due_list:
        patient = await fetch_patient(d.patient_id)
        contact = patient.get("contact_info_jsonb") or {}
        key_contact = contact.get("phone_e164") or contact.get("email") or ""
        if not key_contact:
            key_contact = f"missing:{d.patient_id}"
        key_date = d.appt_start_time.date().isoformat()
        groups[(key_contact, key_date, d.touch_index, d.template_kind)].append(d)
    return groups


def render_bundled_body(
    bundle: list[DueReminder],
    *,
    patient_first_names: list[str],
    clinic_name: str,
) -> str:
    """One SMS body covering multiple household members on the same date.

    "Reminder for {names} from {clinic}: appointments on {Day Mon DD}.
    Reply YES to confirm or visit our portal to reschedule."
    """
    if len(patient_first_names) == 1:
        names = patient_first_names[0]
    elif len(patient_first_names) == 2:
        names = f"{patient_first_names[0]} and {patient_first_names[1]}"
    else:
        names = ", ".join(patient_first_names[:-1]) + f", and {patient_first_names[-1]}"
    appt_date = bundle[0].appt_start_time.strftime("%a %b %d")
    return (
        f"Reminder for {names} from {clinic_name}: appointments on {appt_date}. "
        f"Reply YES to confirm or visit our portal to reschedule."
    )


async def dispatch_bundled_reminder(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    bundle: list[DueReminder],
    fetch_patient: Callable[[UUID], Awaitable[dict]],
    fetch_template: Callable[[str, str, str], Awaitable[dict]],
    fetch_tenant: Callable[[], Awaitable[dict]],
    status_callback_url: str = "",
) -> None:
    """Dispatch ONE SMS to the household primary contact + update ALL bundled appts.

    Primary contact = the patient on the first appointment (sorted by appointment_id
    for stable ordering). All appointments in the bundle have their idempotency
    counters bumped so a future tick does not re-bundle them.
    """
    assert len(bundle) >= 1, "bundle must contain at least one reminder"
    sorted_bundle = sorted(bundle, key=lambda x: str(x.appointment_id))
    primary_due = sorted_bundle[0]
    primary_patient = await fetch_patient(primary_due.patient_id)
    tenant = await fetch_tenant()

    first_names: list[str] = []
    for d in sorted_bundle:
        if d.patient_id == primary_due.patient_id:
            p = primary_patient
        else:
            p = await fetch_patient(d.patient_id)
        first_names.append(p.get("first_name") or "")

    body = render_bundled_body(
        sorted_bundle,
        patient_first_names=first_names,
        clinic_name=tenant["name"],
    )

    contact = primary_patient.get("contact_info_jsonb") or {}
    preferred_channel = contact.get("preferred_channel", "sms")
    if preferred_channel not in ("sms", "email"):
        preferred_channel = "sms"
    language = contact.get("preferred_language", "en")
    template = await fetch_template(
        primary_due.template_kind, preferred_channel, language
    )

    req = DispatchRequest(
        tenant_id=ctx.tenant_id,
        patient_id=primary_due.patient_id,  # billing/audit ownership = primary contact
        channel=preferred_channel,
        purpose="operational",
        template_id=template["id"],
        template_kind=primary_due.template_kind,
        body_override=body,  # bundled body bypasses single-patient template render
        tokens={},
        appointment_id=primary_due.appointment_id,
        actor_user_id=None,
        force_outside_quiet_hours=False,
        language=language,
        bundled_appointment_ids=[d.appointment_id for d in sorted_bundle],
    )

    try:
        await dispatch(
            db,
            ctx,
            req,
            patient=primary_patient,
            tenant=tenant,
            template=template,
            status_callback_url=status_callback_url,
        )
    except OptOutBlocked as exc:
        logger.info("Bundled reminder %s skipped: %s", primary_due.template_kind, exc.code)

    now = datetime.now(timezone.utc)
    for d in sorted_bundle:
        await db.execute(
            update(Appointment)
            .where(Appointment.id == d.appointment_id)
            .values(
                reminders_sent_count=d.touch_index + 1,
                last_reminder_sent_at=now,
                reminder_status=d.template_kind,
            )
        )


async def dispatch_reminder(
    db: AsyncSession,
    ctx: TenantContext,
    *,
    due: DueReminder,
    fetch_patient: Callable[[UUID], Awaitable[dict]],
    fetch_template: Callable[[str, str, str], Awaitable[dict]],
    fetch_tenant: Callable[[], Awaitable[dict]],
    status_callback_url: str = "",
) -> None:
    """Dispatch a single (singleton) reminder + bump idempotency counters."""
    patient = await fetch_patient(due.patient_id)
    tenant = await fetch_tenant()
    contact = patient.get("contact_info_jsonb") or {}
    preferred_channel = contact.get("preferred_channel", "sms")
    if preferred_channel not in ("sms", "email"):
        preferred_channel = "sms"
    language = contact.get("preferred_language", "en")

    template = await fetch_template(due.template_kind, preferred_channel, language)

    appt_local = due.appt_start_time
    tokens = {
        "patient_first_name": patient.get("first_name") or "",
        "appt_date": appt_local.strftime("%b %d"),
        "appt_time": appt_local.strftime("%I:%M %p").lstrip("0"),
        "provider_name": "your provider",
        "clinic_name": tenant["name"],
        "confirm_link": f"https://app.clarityos.app/confirm/{due.appointment_id}",
        "reschedule_link": f"https://app.clarityos.app/reschedule/{due.appointment_id}",
    }

    req = DispatchRequest(
        tenant_id=ctx.tenant_id,
        patient_id=due.patient_id,
        channel=preferred_channel,
        purpose="operational",
        template_id=template["id"],
        template_kind=due.template_kind,
        tokens=tokens,
        appointment_id=due.appointment_id,
        actor_user_id=None,
        force_outside_quiet_hours=False,
        language=language,
    )

    try:
        await dispatch(
            db,
            ctx,
            req,
            patient=patient,
            tenant=tenant,
            template=template,
            status_callback_url=status_callback_url,
        )
    except OptOutBlocked as exc:
        logger.info(
            "Reminder %s skipped for appt %s: %s",
            due.template_kind,
            due.appointment_id,
            exc.code,
        )

    await db.execute(
        update(Appointment)
        .where(Appointment.id == due.appointment_id)
        .values(
            reminders_sent_count=due.touch_index + 1,
            last_reminder_sent_at=datetime.now(timezone.utc),
            reminder_status=due.template_kind,
        )
    )


__all__ = [
    "REMINDER_OFFSETS",
    "DueReminder",
    "compute_due_reminders",
    "bundle_household_reminders",
    "render_bundled_body",
    "dispatch_bundled_reminder",
    "dispatch_reminder",
]
