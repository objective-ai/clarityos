"""Resolve recipient + handle minor → guardian routing + household bundling.

Per CONTEXT.md:
- Minors (<18) → guardian.phone_e164 / guardian.email
- 18th birthday surfaces "switch to patient" prompt (UI handles — Plan 12-08)
- Household bundling: shared phone + same-day appointments → single bundled SMS
- Emergency contact never auto-messaged (only explicit manual sends)
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal


@dataclass
class Recipient:
    patient_id: str
    kind: Literal["patient", "guardian"]
    name: str
    phone_e164: str | None
    email: str | None
    bundled_appointment_ids: list[str] | None = None  # set when household-bundled


class NoValidRecipient(Exception):
    pass


def _calculate_age(dob_iso: str | None, *, now: datetime | None = None) -> int | None:
    if not dob_iso:
        return None
    now = now or datetime.now(timezone.utc)
    if "T" in dob_iso:
        dob = datetime.fromisoformat(dob_iso.replace("Z", "+00:00")).date()
    else:
        dob = date.fromisoformat(dob_iso)
    today = now.date()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def resolve_recipient(
    *,
    patient: dict,
    channel: Literal["sms", "email"],
    now: datetime | None = None,
) -> Recipient:
    """Resolve who actually receives the message (patient vs guardian).

    `patient` is a flat dict with keys: id, first_name, last_name, dob,
    phone_e164, email, guardian (optional dict with name/phone_e164/email/relationship).
    """
    age = _calculate_age(patient.get("dob"), now=now)
    contact_field = "phone_e164" if channel == "sms" else "email"
    guardian = patient.get("guardian") or {}

    if age is not None and age < 18:
        contact = guardian.get(contact_field)
        if not contact:
            raise NoValidRecipient(
                f"Minor patient has no guardian {channel} contact."
            )
        return Recipient(
            patient_id=str(patient["id"]),
            kind="guardian",
            name=guardian.get("name", "Guardian"),
            phone_e164=guardian.get("phone_e164") if channel == "sms" else None,
            email=guardian.get("email") if channel == "email" else None,
        )

    contact = patient.get(contact_field)
    if not contact:
        raise NoValidRecipient(f"Patient has no {channel} contact.")
    return Recipient(
        patient_id=str(patient["id"]),
        kind="patient",
        name=patient.get("first_name", ""),
        phone_e164=patient.get("phone_e164") if channel == "sms" else None,
        email=patient.get("email") if channel == "email" else None,
    )


def bundle_household_recipients(
    *,
    recipients_with_appts: list[tuple[Recipient, str, datetime]],
    clinic_name: str = "",
    link_template: str = "",
) -> list[Recipient]:
    """Group recipients sharing phone+date into bundled Recipients.

    Input: list of (Recipient, appointment_id, appointment_date_utc).
    Returns: list of bundled Recipients (one per (contact, day) group).
    Single-member groups pass through unchanged.
    """
    groups: dict[tuple[str, str], list[tuple[Recipient, str]]] = defaultdict(list)
    for recipient, appt_id, appt_dt in recipients_with_appts:
        contact_key = recipient.phone_e164 or recipient.email or ""
        key = (contact_key, appt_dt.date().isoformat())
        groups[key].append((recipient, appt_id))

    out: list[Recipient] = []
    for _, members in groups.items():
        if len(members) == 1:
            out.append(members[0][0])
            continue
        first_recipient = members[0][0]
        appt_ids = [appt_id for _, appt_id in members]
        out.append(
            Recipient(
                patient_id=first_recipient.patient_id,
                kind=first_recipient.kind,
                name=first_recipient.name,
                phone_e164=first_recipient.phone_e164,
                email=first_recipient.email,
                bundled_appointment_ids=appt_ids,
            )
        )
    return out


def render_bundled_body(*, count: int, clinic_name: str, link: str) -> str:
    """Body for a household-bundled reminder."""
    return f"Reminder: {count} family appointments at {clinic_name} tomorrow. View all: {link}"
