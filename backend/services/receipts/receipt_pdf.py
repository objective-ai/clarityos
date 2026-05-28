"""POS receipt PDF generator (POS-03, Plan 15-06).

Clone of ``backend/services/job_ticket_pdf.py`` — same letter-size,
Helvetica-Bold + Courier layout. NO marketing copy. Money values render as
``$X.XX``; cash change/tendered render in Courier mono per 15-UI-SPEC.

Public surface
--------------
``build_receipt_pdf(sale, tenant, *, cashier_name="") -> bytes`` returns a
letter-size PDF byte stream starting with ``b"%PDF-"``. Pure-sync; the caller
streams the bytes back via ``fastapi.Response``.

Helpers (``_clinic_header``, ``_patient_block``, ``_meta_block``,
``_footer``, ``_fmt_money``, ``_TITLE``, ``_H2``, ``_BODY``, ``_MONO``) are
re-imported by ``refund_receipt_pdf.py`` so both templates share the same
typographic identity.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from typing import Any, Iterable

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

_STYLES = getSampleStyleSheet()
_TITLE = ParagraphStyle(
    "ReceiptTitle",
    parent=_STYLES["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=22,
    spaceAfter=8,
)
_H2 = ParagraphStyle(
    "ReceiptH2",
    parent=_STYLES["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=12,
    spaceAfter=4,
)
_BODY = ParagraphStyle(
    "ReceiptBody",
    parent=_STYLES["BodyText"],
    fontName="Helvetica",
    fontSize=10,
    leading=14,
)
_MONO = ParagraphStyle(
    "ReceiptMono",
    parent=_STYLES["BodyText"],
    fontName="Courier",
    fontSize=10,
    leading=12,
)


def _fmt_money(value: Decimal | None) -> str:
    if value is None:
        return "—"
    return f"${Decimal(value):.2f}"


def _tenant_field(tenant: Any, *keys: str) -> str:
    """Read clinic branding from Tenant.settings_jsonb (mirrors job_ticket_pdf)."""
    if tenant is None:
        return ""
    settings = getattr(tenant, "settings_jsonb", None) or {}
    for key in keys:
        if settings.get(key):
            return str(settings[key])
        direct = getattr(tenant, key, None)
        if direct:
            return str(direct)
    return ""


def _clinic_header(tenant: Any, title: str = "Receipt") -> list:
    name = getattr(tenant, "name", None) or "Clinic"
    address = _tenant_field(tenant, "clinic_address", "address")
    phone = _tenant_field(tenant, "clinic_phone", "phone")
    npi = _tenant_field(tenant, "clinic_npi", "npi")
    meta_bits = [b for b in (phone, f"NPI {npi}" if npi else "") if b]
    story: list = [
        Paragraph(title, _TITLE),
        Paragraph(f"<b>{name}</b>", _BODY),
    ]
    if address:
        story.append(Paragraph(address, _BODY))
    if meta_bits:
        story.append(Paragraph(" • ".join(meta_bits), _BODY))
    story.append(Spacer(1, 12))
    return story


def _patient_block(sale: Any) -> list:
    patient = getattr(sale, "patient", None)
    if patient is None:
        return [Paragraph("Walk-in", _BODY), Spacer(1, 8)]
    full = f"{getattr(patient, 'first_name', '')} {getattr(patient, 'last_name', '')}".strip() or "—"
    # Patient ORM exposes ``dob`` (Date). Defensive ``date_of_birth`` fallback covers
    # SimpleNamespace fixtures used in unit tests.
    dob = getattr(patient, "dob", None) or getattr(patient, "date_of_birth", None)
    block: list = [Paragraph(f"<b>Patient:</b> {full}", _BODY)]
    if dob is not None:
        try:
            block.append(Paragraph(f"<b>DOB:</b> {dob.isoformat()}", _BODY))
        except AttributeError:
            block.append(Paragraph(f"<b>DOB:</b> {dob}", _BODY))
    block.append(Spacer(1, 8))
    return block


def _meta_block(sale: Any) -> list:
    receipt_no = getattr(sale, "receipt_number", None) or "—"
    when = getattr(sale, "closed_at", None) or getattr(sale, "opened_at", None)
    when_str = when.strftime("%Y-%m-%d %H:%M") if when else "—"
    return [
        Paragraph(
            f"<b>Receipt #</b> <font face='Courier'>{receipt_no}</font>",
            _BODY,
        ),
        Paragraph(f"<b>Date</b> {when_str}", _BODY),
        Spacer(1, 12),
    ]


def _line_table(lines: Iterable) -> Table:
    data = [["Description", "Qty", "Unit", "Discount", "Total"]]
    for li in lines or []:
        discount = getattr(li, "discount_amount", None)
        data.append(
            [
                getattr(li, "description", "—"),
                str(getattr(li, "qty", 1)),
                _fmt_money(getattr(li, "unit_price", None)),
                _fmt_money(discount) if discount else "",
                _fmt_money(getattr(li, "line_total", None)),
            ]
        )
    table = Table(
        data,
        colWidths=[3.5 * inch, 0.6 * inch, 1.0 * inch, 1.0 * inch, 1.0 * inch],
    )
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Courier"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def _totals_block(sale: Any) -> Table:
    discount_total = getattr(sale, "discount_total", None) or Decimal("0.00")
    rows = [
        ["Subtotal", _fmt_money(getattr(sale, "subtotal", None))],
        ["Discount", f"-{_fmt_money(discount_total)}" if discount_total else "$0.00"],
        ["Tax", _fmt_money(getattr(sale, "tax", None))],
        ["TOTAL", _fmt_money(getattr(sale, "total", None))],
    ]
    table = Table(rows, colWidths=[4.0 * inch, 1.5 * inch], hAlign="RIGHT")
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -2), "Helvetica"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
            ]
        )
    )
    return table


def _payments_block(payments: Iterable) -> Table:
    data = [["Method", "Amount", "Detail"]]
    for p in payments or []:
        status = getattr(p, "status", "succeeded")
        if status not in ("succeeded", "partial_refund", "refunded"):
            continue
        method = getattr(p, "method", "")
        method_label = {
            "cash": "Cash",
            "stripe_card": "Card",
            "external_card": "Card (external)",
            "write_off": "Write-off",
        }.get(method, method or "—")
        detail = ""
        tendered = getattr(p, "tendered", None)
        change_due = getattr(p, "change_due", None) or Decimal("0.00")
        last4 = getattr(p, "last4", None)
        card_brand = getattr(p, "card_brand", None) or ""
        reason_note = getattr(p, "reason_note", None) or ""
        if method == "cash" and tendered is not None:
            detail = f"Tendered {_fmt_money(tendered)} • Change {_fmt_money(change_due)}"
        elif last4:
            detail = f"{card_brand.title()} ••{last4}".strip()
        elif method == "write_off":
            detail = f"Reason: {reason_note[:120]}"
        data.append([method_label, _fmt_money(getattr(p, "amount", None)), detail])
    table = Table(data, colWidths=[1.4 * inch, 1.2 * inch, 4.5 * inch])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (1, 1), (1, -1), "Courier"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ]
        )
    )
    return table


def _footer(cashier_name: str, receipt_no: str) -> Paragraph:
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return Paragraph(
        f"<font size='8'>Cashier: {cashier_name or '—'} • "
        f"Receipt #{receipt_no or '—'} • Generated {ts}</font>",
        _BODY,
    )


def build_receipt_pdf(sale: Any, tenant: Any, *, cashier_name: str = "") -> bytes:
    """Render a letter-size sale receipt PDF and return the byte stream."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
    )
    story: list = []
    story.extend(_clinic_header(tenant, title="Receipt"))
    story.extend(_patient_block(sale))
    story.extend(_meta_block(sale))
    story.append(_line_table(getattr(sale, "lines", []) or []))
    story.append(Spacer(1, 12))
    story.append(_totals_block(sale))
    story.append(Spacer(1, 18))
    story.append(Paragraph("Payments", _H2))
    story.append(_payments_block(getattr(sale, "payments", []) or []))

    refunds = getattr(sale, "refunds", None) or []
    if refunds:
        story.append(Spacer(1, 12))
        story.append(Paragraph("Refunds on this sale", _H2))
        for r in refunds:
            reason = (getattr(r, "reason", "") or "")[:200]
            story.append(
                Paragraph(
                    f"Refund {getattr(r, 'id', '')} — "
                    f"{_fmt_money(getattr(r, 'total_amount', None))} — {reason}",
                    _BODY,
                )
            )

    story.append(Spacer(1, 24))
    story.append(_footer(cashier_name, getattr(sale, "receipt_number", "") or ""))
    doc.build(story)
    return buffer.getvalue()
