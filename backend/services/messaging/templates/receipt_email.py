"""Receipt email template (POS-03, Plan 15-06).

Postmark accepts inline-styled HTML — we render a small server-side HTML
string here rather than spinning up a React Email build pipeline. The
visual identity matches the React Email examples in the 15-UI-SPEC (sans
serif body, muted footer line).

Pure-function — no side effects, no I/O. Caller composes the Postmark
``send_email`` call separately.
"""
from __future__ import annotations

import html


def render_receipt_email(
    *,
    patient_first_name: str,
    clinic_name: str,
    clinic_phone: str,
    sale_date_human: str,
    total: str,
    cash_change_str: str | None = None,
) -> tuple[str, str]:
    """Return ``(subject, html_body)`` for the receipt email.

    All caller-provided strings are HTML-escaped before interpolation so an
    odd clinic name or patient note can't break the layout.
    """
    safe_first = html.escape(patient_first_name or "there")
    safe_clinic = html.escape(clinic_name or "your clinic")
    safe_phone = html.escape(clinic_phone or "")
    safe_date = html.escape(sale_date_human or "")
    safe_total = html.escape(total or "")
    safe_change = html.escape(cash_change_str) if cash_change_str else None

    subject = f"Your receipt from {clinic_name}".strip() or "Your receipt"

    change_line = (
        f"<p>Cash tendered, change due: {safe_change}.</p>" if safe_change else ""
    )
    phone_line = (
        f"<p style=\"color:#64748b;font-size:13px;\">"
        f"Questions? Reply to this email or call {safe_phone}.</p>"
        if safe_phone
        else ""
    )

    html_body = (
        "<!doctype html>"
        "<html><body style=\"font-family:Arial,Helvetica,sans-serif;color:#0f172a;\">"
        f"<p>Hi {safe_first},</p>"
        f"<p>Here's your receipt from <b>{safe_clinic}</b> on {safe_date}.</p>"
        f"<p><b>Total: {safe_total}</b></p>"
        f"{change_line}"
        "<p>Your detailed receipt is attached as a PDF.</p>"
        f"{phone_line}"
        "</body></html>"
    )
    return subject, html_body
