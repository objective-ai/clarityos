"""Daily-close PDF export (POS-04). Landscape reportlab — clones the
Phase 12 compliance_report.py pattern; richer table styling because this
report is the OWNER's daily smoke-test.
"""
from __future__ import annotations

from datetime import date as date_cls
from decimal import Decimal
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
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
    "Title",
    parent=_STYLES["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=20,
    spaceAfter=10,
)
_H2 = ParagraphStyle(
    "H2",
    parent=_STYLES["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=14,
    spaceAfter=6,
)
_BODY = ParagraphStyle(
    "Body",
    parent=_STYLES["BodyText"],
    fontName="Helvetica",
    fontSize=10,
    leading=14,
)


def _fmt(v) -> str:
    return f"${Decimal(v):.2f}"


def _section_table(rows, col_widths):
    t = Table(rows, colWidths=col_widths)
    t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (1, 1), (-1, -1), "Courier"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ]
        )
    )
    return t


def build_daily_close_pdf(
    data: dict,
    tenant,
    counted_cash: Decimal | None = None,
    variance: Decimal | None = None,
    run_by: str = "",
) -> bytes:
    """Render the 5-section landscape daily-close PDF."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(letter),
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
        title="Daily Close",
    )

    story = [
        Paragraph(
            f"Close of day — {data['close_date'].isoformat()}", _TITLE
        ),
        Paragraph(f"<b>{getattr(tenant, 'name', 'Clinic')}</b>", _BODY),
        Spacer(1, 12),
        Paragraph("Sales summary", _H2),
    ]
    s = data["sales_summary"]
    story.append(
        _section_table(
            [
                ["Sales count", "Gross", "Refunds out", "Net"],
                [
                    str(s["count"]),
                    _fmt(s["gross"]),
                    _fmt(s["refunds"]),
                    _fmt(s["net"]),
                ],
            ],
            [2 * inch, 2 * inch, 2 * inch, 2 * inch],
        )
    )
    story.append(Spacer(1, 14))

    story.append(Paragraph("By payment method", _H2))
    method_rows = [["Method", "Count", "Total"]] + [
        [m["key"], str(m["count"]), _fmt(m["total"])]
        for m in data["by_method"]
    ]
    story.append(_section_table(method_rows, [3 * inch, 1 * inch, 2 * inch]))
    story.append(Spacer(1, 14))

    story.append(Paragraph("By category", _H2))
    cat_rows = [["Category", "Lines", "Total"]] + [
        [c["key"], str(c["count"]), _fmt(c["total"])]
        for c in data["by_category"]
    ]
    story.append(_section_table(cat_rows, [3 * inch, 1 * inch, 2 * inch]))
    story.append(Spacer(1, 14))

    story.append(Paragraph("Cash reconciliation", _H2))
    recon_rows = [
        ["Expected cash", _fmt(data["expected_cash"])],
        [
            "Counted cash",
            _fmt(counted_cash) if counted_cash is not None else "—",
        ],
        [
            "Variance",
            _fmt(variance) if variance is not None else "—",
        ],
    ]
    recon = Table(recon_rows, colWidths=[3 * inch, 2 * inch])
    recon.setStyle(
        TableStyle(
            [
                ("FONTNAME", (1, 0), (1, -1), "Courier"),
                ("FONTNAME", (0, 2), (0, 2), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ]
        )
    )
    story.append(recon)
    story.append(Spacer(1, 14))

    if data.get("stripe_payout_estimate"):
        story.append(
            Paragraph(
                "Stripe payout estimate (after 2.9% + $0.30 fees): "
                f"{_fmt(data['stripe_payout_estimate'])}",
                _BODY,
            )
        )
        story.append(Spacer(1, 14))

    story.append(
        Paragraph(
            f"<font size='8'>Run by: {run_by or '—'} • "
            f"Generated {date_cls.today().isoformat()}</font>",
            _BODY,
        )
    )
    doc.build(story)
    return buf.getvalue()


__all__ = ["build_daily_close_pdf"]
