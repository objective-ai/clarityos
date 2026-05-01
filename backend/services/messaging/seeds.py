"""Industry-pack template seeding.

Picked during onboarding wizard step 6 — optometry / ophthalmology / general.
Idempotent: skips templates that already exist for (kind, channel, language).
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models.tenant.messaging import MessageTemplate, TemplateKind


OPTOMETRY_SMS_EN: dict[str, str] = {
    TemplateKind.REMINDER_7D.value: (
        "Hi {{patient_first_name}}, this is {{clinic_name}} — your eye exam is on "
        "{{appt_date}} at {{appt_time}}. Reply YES to confirm or visit "
        "{{reschedule_link}} to reschedule."
    ),
    TemplateKind.REMINDER_72H.value: (
        "Hi {{patient_first_name}}, reminder: your eye exam at {{clinic_name}} is in "
        "3 days, {{appt_date}} at {{appt_time}}. Reply YES to confirm."
    ),
    TemplateKind.REMINDER_24H.value: (
        "Hi {{patient_first_name}}, your eye exam is tomorrow at {{appt_time}}. "
        "Reply YES to confirm or {{reschedule_link}} to reschedule."
    ),
    TemplateKind.RECALL_M12.value: (
        "Hi {{patient_first_name}}, it's been a year since your last eye exam at "
        "{{clinic_name}}. Time to schedule? Book at {{confirm_link}}"
    ),
    TemplateKind.RECALL_M14.value: (
        "Hi {{patient_first_name}}, just a friendly reminder — your eyes deserve "
        "regular care. Book your annual exam: {{confirm_link}}"
    ),
    TemplateKind.MANUAL.value: "Hi {{patient_first_name}}, ",
    TemplateKind.BOUNCE_FALLBACK_NOTICE.value: (
        "Hi {{patient_first_name}}, we tried reaching you by SMS but couldn't deliver. "
        "Please update your contact info at {{clinic_name}}."
    ),
}

OPTOMETRY_SMS_ES: dict[str, str] = {
    TemplateKind.REMINDER_7D.value: (
        "Hola {{patient_first_name}}, le habla {{clinic_name}} — su examen de la vista "
        "es el {{appt_date}} a las {{appt_time}}. Responda SÍ para confirmar o visite "
        "{{reschedule_link}} para reprogramar."
    ),
    TemplateKind.REMINDER_72H.value: (
        "Hola {{patient_first_name}}, recordatorio: su examen de la vista en "
        "{{clinic_name}} es en 3 días, {{appt_date}} a las {{appt_time}}. "
        "Responda SÍ para confirmar."
    ),
    TemplateKind.REMINDER_24H.value: (
        "Hola {{patient_first_name}}, su examen de la vista es mañana a las "
        "{{appt_time}}. Responda SÍ para confirmar."
    ),
    TemplateKind.RECALL_M12.value: (
        "Hola {{patient_first_name}}, ha pasado un año desde su último examen en "
        "{{clinic_name}}. ¿Listo para agendar? Reserve en {{confirm_link}}"
    ),
    TemplateKind.RECALL_M14.value: (
        "Hola {{patient_first_name}}, sus ojos merecen cuidado regular. Reserve su "
        "examen anual: {{confirm_link}}"
    ),
    TemplateKind.MANUAL.value: "Hola {{patient_first_name}}, ",
    TemplateKind.BOUNCE_FALLBACK_NOTICE.value: (
        "Hola {{patient_first_name}}, no pudimos enviarle un SMS. Por favor actualice "
        "su información de contacto en {{clinic_name}}."
    ),
}

OPTOMETRY_EMAIL_EN: dict[str, tuple[str, str]] = {
    TemplateKind.REMINDER_7D.value: (
        "Eye exam reminder",
        "Your annual eye exam is on {{appt_date}} at {{appt_time}}. "
        "Confirm or reschedule via the buttons below.",
    ),
    TemplateKind.REMINDER_24H.value: (
        "Eye exam tomorrow",
        "A friendly reminder that your eye exam is tomorrow at {{appt_time}}.",
    ),
    TemplateKind.RECALL_M12.value: (
        "Time for your annual eye exam",
        "It's been a year since your last visit. Schedule your annual exam to "
        "keep your eyes healthy.",
    ),
}


PracticeType = Literal["optometry", "ophthalmology", "general"]


async def seed_default_templates(
    db: AsyncSession,
    tenant_id: UUID,
    practice_type: PracticeType = "optometry",
) -> int:
    """Seed default templates for a clinic. Idempotent.

    Returns the number of templates inserted (skipped duplicates not counted).
    practice_type currently ships optometry copy for all variants — ophthalmology
    and general fall back to optometry text until industry packs ship.
    """
    rows = (
        await db.execute(
            select(
                MessageTemplate.kind,
                MessageTemplate.channel,
                MessageTemplate.language,
            ).where(MessageTemplate.tenant_id == tenant_id)
        )
    ).all()
    existing: set[tuple[str, str, str]] = {
        (r.kind, r.channel, r.language) for r in rows
    }

    seeded = 0

    for kind, body in OPTOMETRY_SMS_EN.items():
        if (kind, "sms", "en") in existing:
            continue
        db.add(
            MessageTemplate(
                tenant_id=tenant_id,
                kind=kind,
                channel="sms",
                language="en",
                body=body,
                is_default=True,
            )
        )
        seeded += 1

    for kind, body in OPTOMETRY_SMS_ES.items():
        if (kind, "sms", "es") in existing:
            continue
        db.add(
            MessageTemplate(
                tenant_id=tenant_id,
                kind=kind,
                channel="sms",
                language="es",
                body=body,
                is_default=True,
            )
        )
        seeded += 1

    for kind, (subject, body) in OPTOMETRY_EMAIL_EN.items():
        if (kind, "email", "en") in existing:
            continue
        db.add(
            MessageTemplate(
                tenant_id=tenant_id,
                kind=kind,
                channel="email",
                language="en",
                subject=subject,
                body=body,
                is_default=True,
            )
        )
        seeded += 1

    await db.flush()
    return seeded


__all__ = [
    "seed_default_templates",
    "OPTOMETRY_SMS_EN",
    "OPTOMETRY_SMS_ES",
    "OPTOMETRY_EMAIL_EN",
    "PracticeType",
]
