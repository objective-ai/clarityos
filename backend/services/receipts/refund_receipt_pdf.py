"""Refund receipt PDF generator (POS-05, Plan 15-06).

Same letter-size template as ``receipt_pdf.py``; swaps the title to
``"Refund receipt"`` and renders refunded line totals + per-payment
reversals in red (#B91C1C) per 15-UI-SPEC.

Plan-vs-reality note: the ORM relationship on ``Refund`` is named
``payment_allocations`` (clinical.py:2301). The 15-06 PLAN body referenced
``refund.payment_refunds`` — that name is only the *schema* alias used in
``api/routes/refunds.py``. We read the ORM attribute directly here, with a
defensive fall-through to ``payment_refunds`` so the SimpleNamespace
fixtures used by the unit tests still resolve.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from backend.services.receipts.receipt_pdf import (
    _BODY,
    _H2,
    _TITLE,
    _clinic_header,
    _fmt_money,
    _footer,
    _meta_block,
    _patient_block,
)


_REFUND_RED = colors.HexColor("#B91C1C")


def _payment_reversals(refund: Any):
    """Resolve the per-payment refund rows regardless of attribute name."""
    return (
        getattr(refund, "payment_allocations", None)
        or getattr(refund, "payment_refunds", None)
        or []
    )


def build_refund_receipt_pdf(
    refund: Any,
    sale: Any,
    tenant: Any,
    *,
    cashier_name: str = "",
) -> bytes:
    """Render a letter-size refund receipt PDF and return bytes."""
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
    story.extend(_clinic_header(tenant, title="Refund receipt"))
    story.extend(_patient_block(sale))
    story.extend(_meta_block(sale))

    created_at = getattr(refund, "created_at", None) or datetime.now(timezone.utc)
    refund_short = str(getattr(refund, "id", ""))[:6] or "—"
    story.append(
        Paragraph(
            f"<b>Refund #</b> RF-{created_at.strftime('%Y%m%d')}-{refund_short}",
            _BODY,
        )
    )
    story.append(
        Paragraph(
            f"<b>Original Receipt #</b> {getattr(sale, 'receipt_number', None) or '—'}",
            _BODY,
        )
    )
    story.append(
        Paragraph(f"<b>Reason</b> {getattr(refund, 'reason', '') or '—'}", _BODY)
    )
    story.append(Spacer(1, 12))

    # Per-line refund table — red negative amounts.
    line_by_id = {getattr(li, "id", None): li for li in getattr(sale, "lines", []) or []}
    rows = [["Description", "Qty", "Amount"]]
    for rli in getattr(refund, "line_items", []) or []:
        sli_id = getattr(rli, "sale_line_item_id", None)
        sli = line_by_id.get(sli_id)
        desc = getattr(sli, "description", None) or f"Line {sli_id}"
        rows.append(
            [
                desc,
                str(getattr(rli, "qty", 0)),
                f"-{_fmt_money(getattr(rli, 'amount', None))}",
            ]
        )
    line_table = Table(rows, colWidths=[4.5 * inch, 0.8 * inch, 1.5 * inch])
    line_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (2, 1), (2, -1), "Courier"),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("TEXTCOLOR", (2, 1), (2, -1), _REFUND_RED),
            ]
        )
    )
    story.append(line_table)
    story.append(Spacer(1, 18))
    story.append(
        Paragraph(
            f"<b>Total refunded:</b> "
            f"<font face='Courier' color='#B91C1C'>"
            f"-{_fmt_money(getattr(refund, 'total_amount', None))}</font>",
            _BODY,
        )
    )
    story.append(Spacer(1, 18))

    # Per-payment reversal breakdown.
    story.append(Paragraph("Reversals", _H2))
    pay_by_id = {getattr(p, "id", None): p for p in getattr(sale, "payments", []) or []}
    rev_rows = [["Method", "Amount", "Detail"]]
    for rp in _payment_reversals(refund):
        p = pay_by_id.get(getattr(rp, "payment_id", None))
        if p is None:
            continue
        method = getattr(p, "method", "")
        method_label = {
            "cash": "Cash",
            "stripe_card": "Card (Stripe)",
            "external_card": "Card (external)",
            "write_off": "Write-off",
        }.get(method, method or "—")
        detail_parts = []
        last4 = getattr(p, "last4", None)
        if last4:
            detail_parts.append(f"••{last4}")
        processor_refund_id = getattr(rp, "processor_refund_id", None)
        if processor_refund_id:
            detail_parts.append(str(processor_refund_id))
        rev_rows.append(
            [
                method_label,
                f"-{_fmt_money(getattr(rp, 'amount', None))}",
                " • ".join(detail_parts),
            ]
        )
    rev_table = Table(rev_rows, colWidths=[1.6 * inch, 1.4 * inch, 4.0 * inch])
    rev_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (1, 1), (1, -1), "Courier"),
                ("TEXTCOLOR", (1, 1), (1, -1), _REFUND_RED),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ]
        )
    )
    story.append(rev_table)
    story.append(Spacer(1, 24))
    story.append(_footer(cashier_name, getattr(sale, "receipt_number", "") or ""))

    doc.build(story)
    return buffer.getvalue()
