"""Communications Compliance Report PDF — for HIPAA / TCPA compliance binders.

Generated on demand by OWNER via GET /api/messaging/compliance-report.
Uses reportlab (already a Phase 9 dependency, see backend/api/routes/billing.py).
"""
from __future__ import annotations

import io
from datetime import date
from uuid import UUID

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import text as _text
from sqlalchemy.ext.asyncio import AsyncSession


async def generate_compliance_report_pdf(
    db: AsyncSession,
    tenant_id: UUID,
    *,
    from_date: date,
    to_date: date,
) -> bytes:
    """Render a Communications Compliance Report covering ``[from_date, to_date]``.

    Sections: Summary header, message volume by channel/status, opt-out total,
    consent grant/revoke counts. All figures derived from message_log + audit_log.
    """
    volume_rows = (
        await db.execute(
            _text(
                """
                SELECT channel, status, COUNT(*) AS count
                FROM message_log
                WHERE tenant_id = :t
                      AND created_at::date BETWEEN :f AND :u
                      AND deleted_at IS NULL
                GROUP BY channel, status
                ORDER BY channel, status
                """
            ),
            {"t": str(tenant_id), "f": from_date, "u": to_date},
        )
    ).mappings().all()

    optouts_total = (
        await db.execute(
            _text(
                """
                SELECT COUNT(*)
                FROM audit_log
                WHERE tenant_id = :t
                      AND action = 'opt_out_recorded'
                      AND created_at::date BETWEEN :f AND :u
                """
            ),
            {"t": str(tenant_id), "f": from_date, "u": to_date},
        )
    ).scalar() or 0

    consent_rows = (
        await db.execute(
            _text(
                """
                SELECT action, COUNT(*) AS count
                FROM audit_log
                WHERE tenant_id = :t
                      AND action IN ('consent_granted', 'consent_revoked')
                      AND created_at::date BETWEEN :f AND :u
                GROUP BY action
                ORDER BY action
                """
            ),
            {"t": str(tenant_id), "f": from_date, "u": to_date},
        )
    ).mappings().all()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        title="Communications Compliance Report",
    )
    styles = getSampleStyleSheet()
    story: list = [
        Paragraph("Communications Compliance Report", styles["Title"]),
        Paragraph(
            f"Period: {from_date.isoformat()} to {to_date.isoformat()}",
            styles["Normal"],
        ),
        Spacer(1, 12),
        Paragraph(
            f"Total opt-outs (STOP keyword + manual): <b>{optouts_total}</b>",
            styles["Normal"],
        ),
        Spacer(1, 12),
    ]

    volume_table_rows: list[list[str]] = [["Channel", "Status", "Count"]]
    if volume_rows:
        for row in volume_rows:
            volume_table_rows.append(
                [str(row["channel"]), str(row["status"]), str(row["count"])]
            )
    else:
        volume_table_rows.append(["—", "—", "0"])

    volume_table = Table(volume_table_rows, hAlign="LEFT")
    volume_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        )
    )
    story += [
        Paragraph("Message Volume", styles["Heading2"]),
        volume_table,
        Spacer(1, 12),
    ]

    consent_table_rows: list[list[str]] = [["Action", "Count"]]
    if consent_rows:
        for row in consent_rows:
            consent_table_rows.append([str(row["action"]), str(row["count"])])
    else:
        consent_table_rows.append(["—", "0"])

    consent_table = Table(consent_table_rows, hAlign="LEFT")
    consent_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        )
    )
    story += [
        Paragraph("Consent Events", styles["Heading2"]),
        consent_table,
    ]

    doc.build(story)
    return buf.getvalue()


__all__ = ["generate_compliance_report_pdf"]
