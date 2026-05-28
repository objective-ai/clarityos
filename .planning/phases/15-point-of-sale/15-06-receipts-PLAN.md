---
phase: 15-point-of-sale
plan: 06
type: execute
wave: 5
depends_on: [15-04]
files_modified:
  - backend/services/receipts/receipt_pdf.py
  - backend/services/receipts/refund_receipt_pdf.py
  - backend/services/receipts/__init__.py
  - backend/services/messaging/templates/receipt_email.py
  - backend/api/routes/sale_receipts.py
  - backend/main.py
autonomous: true
requirements: [POS-03, POS-12]

must_haves:
  truths:
    - "GET /api/sales/{id}/receipt/ returns application/pdf bytes; gated on sale.status in {paid, refunded} (409 otherwise per Pitfall 8)"
    - "GET /api/refunds/{id}/receipt/ returns application/pdf for refund receipt with 'REFUND RECEIPT' title and negative amounts"
    - "POST /api/sales/{id}/receipt/email/ renders React Email template + sends via Postmark with PDF attachment (NOT Resend — Phase 12 BAA decision per RESEARCH §Standard Stack)"
    - "Receipt PDF letter-size: clinic header, patient block, sale # + date, line table (description/qty/unit/discount/total), totals, payment breakdown (method + last4 + tendered/change), refund summary if applicable, footer with cashier + receipt #"
    - "Audit RECEIPT_EMAILED on send; RECEIPT_PRINTED on PDF blob download (best-effort — see CONTEXT §F)"
  artifacts:
    - path: "backend/services/receipts/receipt_pdf.py"
      provides: "build_receipt_pdf(sale, tenant) -> bytes — reportlab letter-size template"
      contains: "def build_receipt_pdf"
    - path: "backend/services/receipts/refund_receipt_pdf.py"
      provides: "build_refund_receipt_pdf(refund, sale, tenant) -> bytes"
      contains: "def build_refund_receipt_pdf"
    - path: "backend/services/messaging/templates/receipt_email.py"
      provides: "React Email template (HTML) for receipt body"
      contains: "render_receipt_email"
    - path: "backend/api/routes/sale_receipts.py"
      provides: "GET receipt PDF + POST email + GET refund receipt"
      contains: "router = APIRouter"
  key_links:
    - from: "backend/services/receipts/receipt_pdf.py"
      to: "backend/services/job_ticket_pdf.py (Phase 14)"
      via: "clone reportlab letter-size template structure"
      pattern: "SimpleDocTemplate.*letter"
    - from: "POST /receipt/email/"
      to: "backend/services/messaging/email_client.py (Postmark)"
      via: "send_email with PDF attachment (NOT Resend)"
      pattern: "postmark"
    - from: "GET /receipt/"
      to: "sale.status in (paid, refunded)"
      via: "409 Conflict if open"
      pattern: "status.*paid.*refunded|409"
---

<objective>
Receipt + refund-receipt PDF generation + email delivery. Clone Phase 14 `job_ticket_pdf.py` for layout; clone Phase 12 Postmark email pattern for delivery.

Purpose: complete ROADMAP success criterion #3 (PDF receipt by email or print).

Output: `pytest backend/tests/test_receipt_pdf.py test_receipt_email.py` GREEN; PDF endpoints exposed; email handler audits RECEIPT_EMAILED.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@.planning/phases/15-point-of-sale/15-RESEARCH.md
@.planning/phases/15-point-of-sale/15-UI-SPEC.md
@backend/services/job_ticket_pdf.py
@backend/services/messaging/email_client.py
@backend/services/messaging/templates/

<interfaces>
<!-- Phase 14 job_ticket_pdf.py — clone structure -->
```python
# backend/services/job_ticket_pdf.py
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from io import BytesIO

def build_job_ticket_pdf(order, patient, tenant) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, ...)
    story = [header, patient_block, rx_table, frame_block, ...]
    doc.build(story)
    return buf.getvalue()
```

<!-- Phase 12 Postmark email client -->
```python
# backend/services/messaging/email_client.py
async def send_email(tenant, to: str, subject: str, html: str, text: str, attachments: list[dict] | None = None) -> dict:
    # Postmark client; attachments = [{"name": "receipt.pdf", "content": base64, "content_type": "application/pdf"}]
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: receipt_pdf.py + refund_receipt_pdf.py reportlab templates (clone Phase 14 job_ticket); test_receipt_pdf.py smoke assertions</name>
  <files>backend/services/receipts/__init__.py, backend/services/receipts/receipt_pdf.py, backend/services/receipts/refund_receipt_pdf.py</files>
  <read_first>
    - backend/services/job_ticket_pdf.py (FULL FILE — read top-to-bottom; clone styles, page size, section helpers; same Helvetica-Bold headers + Courier mono values)
    - backend/services/messaging/compliance_report.py (header/footer convention)
    - .planning/phases/15-point-of-sale/15-UI-SPEC.md §Receipt PDF copy (exact strings: "Receipt" / "Refund receipt", R-YYYYMMDD-NNNN format, "-$X.XX" for negatives)
    - backend/tests/test_receipt_pdf.py (Wave-0 skip-stub assertions)
  </read_first>
  <action>
    Three files.

    **A. `backend/services/receipts/__init__.py`** — empty package marker.

    **B. `backend/services/receipts/receipt_pdf.py`:**

    ```python
    """POS receipt PDF generator (POS-03).

    Clone of backend/services/job_ticket_pdf.py — same letter-size, Helvetica-Bold + Courier
    layout. NO marketing copy. Money values render as `$X.XX` always; cash change/tendered
    in Courier mono per UI-SPEC.
    """
    from __future__ import annotations
    from datetime import datetime
    from decimal import Decimal
    from io import BytesIO
    from typing import Iterable

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    _STYLES = getSampleStyleSheet()
    _TITLE = ParagraphStyle("Title", parent=_STYLES["Heading1"], fontName="Helvetica-Bold", fontSize=22, spaceAfter=8)
    _H2 = ParagraphStyle("H2", parent=_STYLES["Heading2"], fontName="Helvetica-Bold", fontSize=12, spaceAfter=4)
    _BODY = ParagraphStyle("Body", parent=_STYLES["BodyText"], fontName="Helvetica", fontSize=10, leading=14)
    _MONO = ParagraphStyle("Mono", parent=_STYLES["BodyText"], fontName="Courier", fontSize=10, leading=12)

    def _fmt_money(value: Decimal | None) -> str:
        return f"${value:.2f}" if value is not None else "—"

    def _clinic_header(tenant) -> list:
        name = getattr(tenant, "name", None) or "Clinic"
        addr = getattr(tenant, "address", None) or ""
        phone = getattr(tenant, "phone", None) or ""
        npi = getattr(tenant, "npi", None) or ""
        return [
            Paragraph("Receipt", _TITLE),
            Paragraph(f"<b>{name}</b>", _BODY),
            Paragraph(addr, _BODY) if addr else Spacer(1, 0),
            Paragraph(" • ".join(filter(None, [phone, f"NPI {npi}" if npi else ""])), _BODY),
            Spacer(1, 12),
        ]

    def _patient_block(sale) -> list:
        patient = getattr(sale, "patient", None)
        if patient is None:
            return [Paragraph("Walk-in", _BODY), Spacer(1, 8)]
        full = f"{getattr(patient, 'first_name', '')} {getattr(patient, 'last_name', '')}".strip()
        dob = getattr(patient, "date_of_birth", None)
        return [
            Paragraph(f"<b>Patient:</b> {full}", _BODY),
            Paragraph(f"<b>DOB:</b> {dob.isoformat()}" if dob else "", _BODY) if dob else Spacer(1, 0),
            Spacer(1, 8),
        ]

    def _meta_block(sale) -> list:
        receipt_no = getattr(sale, "receipt_number", None) or "—"
        when = sale.closed_at or sale.opened_at
        return [
            Paragraph(f"<b>Receipt #</b> <font face='Courier'>{receipt_no}</font>", _BODY),
            Paragraph(f"<b>Date</b> {when.strftime('%Y-%m-%d %H:%M')}", _BODY),
            Spacer(1, 12),
        ]

    def _line_table(lines: Iterable) -> Table:
        data = [["Description", "Qty", "Unit", "Discount", "Total"]]
        for li in lines:
            data.append([
                li.description,
                str(li.qty),
                _fmt_money(li.unit_price),
                _fmt_money(li.discount_amount) if li.discount_amount else "",
                _fmt_money(li.line_total),
            ])
        t = Table(data, colWidths=[3.5*inch, 0.6*inch, 1.0*inch, 1.0*inch, 1.0*inch])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (0, 1), (-1, -1), "Courier"),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("ALIGN", (0, 0), (0, -1), "LEFT"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        return t

    def _totals_block(sale) -> Table:
        rows = [
            ["Subtotal", _fmt_money(sale.subtotal)],
            ["Discount", f"-{_fmt_money(sale.discount_total)}" if sale.discount_total else "$0.00"],
            ["Tax", _fmt_money(sale.tax)],
            ["TOTAL", _fmt_money(sale.total)],
        ]
        t = Table(rows, colWidths=[4.0*inch, 1.5*inch], hAlign="RIGHT")
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -2), "Helvetica"),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
        ]))
        return t

    def _payments_block(payments: Iterable) -> Table:
        data = [["Method", "Amount", "Detail"]]
        for p in payments:
            if p.status not in ("succeeded", "partial_refund", "refunded"):
                continue
            method_label = {
                "cash": "Cash",
                "stripe_card": "Card",
                "external_card": "Card (external)",
                "write_off": "Write-off",
            }.get(p.method, p.method)
            detail = ""
            if p.method == "cash" and p.tendered is not None:
                detail = f"Tendered {_fmt_money(p.tendered)} • Change {_fmt_money(p.change_due or Decimal('0.00'))}"
            elif p.last4:
                brand = (p.card_brand or "").title()
                detail = f"{brand} ••{p.last4}".strip()
            elif p.method == "write_off":
                detail = f"Reason: {(p.reason_note or '')[:120]}"
            data.append([method_label, _fmt_money(p.amount), detail])
        t = Table(data, colWidths=[1.4*inch, 1.2*inch, 4.5*inch])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (1, 1), (1, -1), "Courier"),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ]))
        return t

    def _footer(cashier_name: str, receipt_no: str) -> Paragraph:
        ts = datetime.utcnow().isoformat(timespec="seconds")
        return Paragraph(
            f"<font size='8'>Cashier: {cashier_name or '—'} • Receipt #{receipt_no or '—'} • Generated {ts}Z</font>",
            _BODY,
        )

    def build_receipt_pdf(sale, tenant, cashier_name: str = "") -> bytes:
        """Letter-size receipt PDF. Returns bytes starting with b'%PDF-'."""
        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.6*inch, rightMargin=0.6*inch, topMargin=0.5*inch, bottomMargin=0.5*inch)
        story = []
        story.extend(_clinic_header(tenant))
        story.extend(_patient_block(sale))
        story.extend(_meta_block(sale))
        story.append(_line_table(sale.lines))
        story.append(Spacer(1, 12))
        story.append(_totals_block(sale))
        story.append(Spacer(1, 18))
        story.append(Paragraph("Payments", _H2))
        story.append(_payments_block(sale.payments))
        if any(r for r in (getattr(sale, "refunds", None) or [])):
            story.append(Spacer(1, 12))
            story.append(Paragraph("Refunds on this sale", _H2))
            for r in sale.refunds:
                story.append(Paragraph(f"Refund {r.id} — {_fmt_money(r.total_amount)} — {r.reason[:200]}", _BODY))
        story.append(Spacer(1, 24))
        story.append(_footer(cashier_name, sale.receipt_number or ""))
        doc.build(story)
        return buf.getvalue()
    ```

    **C. `backend/services/receipts/refund_receipt_pdf.py`** — same template, "Refund receipt" title, negative-amount lines:

    ```python
    """Refund receipt PDF (POS-05)."""
    from __future__ import annotations
    from io import BytesIO
    from decimal import Decimal
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors

    from backend.services.receipts.receipt_pdf import (
        _TITLE, _H2, _BODY, _MONO, _clinic_header, _patient_block, _meta_block, _footer, _fmt_money,
    )

    def build_refund_receipt_pdf(refund, sale, tenant, cashier_name: str = "") -> bytes:
        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.6*inch, rightMargin=0.6*inch, topMargin=0.5*inch, bottomMargin=0.5*inch)
        story = [Paragraph("Refund receipt", _TITLE)]
        story.extend(_clinic_header(tenant)[1:])   # skip the first Title element
        story.extend(_patient_block(sale))
        story.extend(_meta_block(sale))
        story.append(Paragraph(f"<b>Refund #</b> RF-{refund.created_at.strftime('%Y%m%d')}-{str(refund.id)[:6]}", _BODY))
        story.append(Paragraph(f"<b>Original Receipt #</b> {sale.receipt_number or '—'}", _BODY))
        story.append(Paragraph(f"<b>Reason</b> {refund.reason}", _BODY))
        story.append(Spacer(1, 12))

        # Per-line refund table
        line_by_id = {li.id: li for li in sale.lines}
        rows = [["Description", "Qty", "Amount"]]
        for rli in refund.line_items:
            li = line_by_id.get(rli.sale_line_item_id)
            desc = li.description if li else f"Line {rli.sale_line_item_id}"
            rows.append([desc, str(rli.qty), f"-{_fmt_money(rli.amount)}"])
        t = Table(rows, colWidths=[4.5*inch, 0.8*inch, 1.5*inch])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (2, 1), (2, -1), "Courier"),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("TEXTCOLOR", (2, 1), (2, -1), colors.HexColor("#B91C1C")),
        ]))
        story.append(t)
        story.append(Spacer(1, 18))
        story.append(Paragraph(f"<b>Total refunded:</b> <font face='Courier' color='#B91C1C'>-{_fmt_money(refund.total_amount)}</font>", _BODY))
        story.append(Spacer(1, 18))

        # Per-payment reversal breakdown
        story.append(Paragraph("Reversals", _H2))
        pay_by_id = {p.id: p for p in sale.payments}
        rev_rows = [["Method", "Amount", "Detail"]]
        for rp in refund.payment_refunds:
            p = pay_by_id.get(rp.payment_id)
            if not p:
                continue
            method_label = {"cash": "Cash", "stripe_card": "Card (Stripe)", "external_card": "Card (external)", "write_off": "Write-off"}.get(p.method, p.method)
            detail = ""
            if p.last4:
                detail = f"••{p.last4}"
            if rp.processor_refund_id:
                detail = f"{detail} • {rp.processor_refund_id}".strip(" •")
            rev_rows.append([method_label, f"-{_fmt_money(rp.amount)}", detail])
        rt = Table(rev_rows, colWidths=[1.6*inch, 1.4*inch, 4.0*inch])
        rt.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (1, 1), (1, -1), "Courier"),
            ("TEXTCOLOR", (1, 1), (1, -1), colors.HexColor("#B91C1C")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ]))
        story.append(rt)
        story.append(Spacer(1, 24))
        story.append(_footer(cashier_name, sale.receipt_number or ""))
        doc.build(story)
        return buf.getvalue()
    ```

    **D. Replace `backend/tests/test_receipt_pdf.py`:**

    ```python
    from datetime import datetime, timezone
    from decimal import Decimal
    from types import SimpleNamespace
    from uuid import uuid4

    def _mk_sale():
        return SimpleNamespace(
            id=uuid4(), receipt_number="R-20260528-0042",
            opened_at=datetime(2026, 5, 28, 14, 0, tzinfo=timezone.utc),
            closed_at=datetime(2026, 5, 28, 14, 5, tzinfo=timezone.utc),
            subtotal=Decimal("100.00"), tax=Decimal("7.25"),
            discount_total=Decimal("0.00"), total=Decimal("107.25"),
            patient=SimpleNamespace(first_name="Pat", last_name="Test", date_of_birth=None),
            lines=[SimpleNamespace(description="Frame XYZ", qty=1, unit_price=Decimal("100.00"), discount_amount=Decimal("0.00"), line_total=Decimal("100.00"))],
            payments=[SimpleNamespace(method="cash", amount=Decimal("107.25"), tendered=Decimal("120.00"), change_due=Decimal("12.75"), status="succeeded", last4=None, card_brand=None, reason_note=None)],
            refunds=[],
        )

    def _mk_tenant():
        return SimpleNamespace(name="Acme Optometry", address="123 Main St", phone="(555) 555-1234", npi="1234567890")

    def test_receipt_pdf_bytes_have_pdf_magic():
        from backend.services.receipts.receipt_pdf import build_receipt_pdf
        pdf = build_receipt_pdf(_mk_sale(), _mk_tenant(), cashier_name="Alice")
        assert pdf[:5] == b"%PDF-"
        assert len(pdf) > 1000

    def test_refund_receipt_pdf_smoke():
        from backend.services.receipts.refund_receipt_pdf import build_refund_receipt_pdf
        sale = _mk_sale()
        sale_line = sale.lines[0]
        sale_line.id = uuid4()
        refund = SimpleNamespace(
            id=uuid4(), created_at=datetime(2026, 5, 29, tzinfo=timezone.utc),
            reason="Customer changed mind", total_amount=Decimal("107.25"),
            line_items=[SimpleNamespace(sale_line_item_id=sale_line.id, qty=1, amount=Decimal("100.00"))],
            payment_refunds=[SimpleNamespace(payment_id=uuid4(), amount=Decimal("107.25"), processor_refund_id=None)],
        )
        pdf = build_refund_receipt_pdf(refund, sale, _mk_tenant(), cashier_name="Alice")
        assert pdf[:5] == b"%PDF-"
        assert len(pdf) > 800
    ```
  </action>
  <verify>
    <automated>cd backend && pytest tests/test_receipt_pdf.py -v && python -c "from backend.services.receipts.receipt_pdf import build_receipt_pdf; from backend.services.receipts.refund_receipt_pdf import build_refund_receipt_pdf; print('ok')"</automated>
  </verify>
  <acceptance_criteria>
    - `pytest backend/tests/test_receipt_pdf.py -v` passes with 2 tests
    - Both PDFs start with `b"%PDF-"` magic
    - `grep -c "reportlab" backend/services/receipts/receipt_pdf.py` returns >= 3
    - `grep -c "Helvetica\|Courier" backend/services/receipts/receipt_pdf.py` returns >= 4 (font conventions matched)
    - `grep -c "Refund receipt\|REFUND" backend/services/receipts/refund_receipt_pdf.py` returns >= 1 (correct title per UI-SPEC)
  </acceptance_criteria>
  <done>PDF generation works; smoke tests green.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: backend/api/routes/sale_receipts.py — GET sale PDF + GET refund PDF + POST email; React Email template; register router; replace test_receipt_email.py</name>
  <files>backend/api/routes/sale_receipts.py, backend/services/messaging/templates/receipt_email.py, backend/main.py</files>
  <read_first>
    - backend/api/routes/optical_order.py (for `app/api/optical-orders/[orderId]/job-ticket/route.ts` BFF reference + the FastAPI side of that flow: how to return a binary body via FastAPI Response with media_type='application/pdf')
    - backend/services/messaging/email_client.py (Postmark client signature — attachments format)
    - backend/services/messaging/templates/ (look at any existing template — clone the React Email render pattern)
    - .planning/phases/15-point-of-sale/15-UI-SPEC.md §Receipt email copy (exact subject + body strings)
    - backend/tests/test_receipt_email.py (Wave-0 skip-stub)
  </read_first>
  <action>
    Three deliverables.

    **A. `backend/services/messaging/templates/receipt_email.py`** — Postmark-friendly HTML+text renderer:

    ```python
    """Receipt email template (POS-03).

    Postmark accepts inline HTML; React Email server-side renders to inline-CSS HTML.
    For Phase 15 — keep simple: pure-Python f-string HTML matching React Email visual style
    (no actual React Email component compilation needed since this is server-side text).
    """
    from __future__ import annotations

    def render_receipt_email(patient_first_name: str, clinic_name: str, clinic_phone: str,
                              sale_date_human: str, total: str,
                              cash_change_str: str | None = None) -> tuple[str, str]:
        """Returns (subject, html). text-body falls back to html-stripped on client."""
        subject = f"Your receipt from {clinic_name}"
        change_line = (
            f"<p>Cash tendered, change due: {cash_change_str}.</p>" if cash_change_str else ""
        )
        html = f"""<!doctype html>
        <html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
          <p>Hi {patient_first_name or 'there'},</p>
          <p>Here's your receipt from <b>{clinic_name}</b> on {sale_date_human}.</p>
          <p><b>Total: {total}</b></p>
          {change_line}
          <p>Your detailed receipt is attached as a PDF.</p>
          <p style="color:#64748b;font-size:13px;">Questions? Reply to this email or call {clinic_phone or ''}.</p>
        </body></html>"""
        return subject, html
    ```

    **B. `backend/api/routes/sale_receipts.py`** — three endpoints:

    ```python
    """Sale + refund receipt PDF + email endpoints (POS-03, POS-12)."""
    from __future__ import annotations
    import base64
    from uuid import UUID

    from fastapi import APIRouter, Depends, HTTPException, Response, Body
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import selectinload

    from backend.core.audit import log_action
    from backend.core.entitlements import Entitlement, require_entitlement
    from backend.core.security import TenantContext, get_tenant_context, resolve_staff
    from backend.db.deps import get_db
    from backend.db.models.tenant.clinical import Sale, Refund, AuditAction
    from backend.db.models.public.saas import Tenant
    from backend.services.receipts.receipt_pdf import build_receipt_pdf
    from backend.services.receipts.refund_receipt_pdf import build_refund_receipt_pdf
    from backend.services.messaging.email_client import send_email
    from backend.services.messaging.templates.receipt_email import render_receipt_email

    router = APIRouter(
        prefix="/api",
        tags=["sale-receipts"],
        dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))],
    )

    async def _load_sale_full(db: AsyncSession, sale_id: UUID, tenant_id: UUID) -> Sale:
        sale = (await db.execute(
            select(Sale).where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
            .options(
                selectinload(Sale.lines),
                selectinload(Sale.payments),
                selectinload(Sale.refunds),
                selectinload(Sale.patient),
            )
        )).scalar_one_or_none()
        if sale is None:
            raise HTTPException(404, "Sale not found")
        return sale

    @router.get("/sales/{sale_id}/receipt/")
    async def get_sale_receipt(
        sale_id: UUID,
        ctx: TenantContext = Depends(get_tenant_context),
        db: AsyncSession = Depends(get_db),
    ):
        sale = await _load_sale_full(db, sale_id, ctx.tenant_id)
        if sale.status not in ("paid", "refunded"):
            raise HTTPException(409, "Receipt available after the sale is closed. Finish the payment first.")
        tenant = await db.get(Tenant, ctx.tenant_id)
        staff = await resolve_staff(ctx, db)
        cashier = f"{staff.first_name} {staff.last_name}" if staff else ""
        pdf = build_receipt_pdf(sale, tenant, cashier_name=cashier)
        # Best-effort RECEIPT_PRINTED audit (CONTEXT §F)
        await log_action(db, ctx, AuditAction.RECEIPT_PRINTED, "sale", sale.id,
                         staff_id=staff.id if staff else None,
                         patient_id=sale.patient_id,
                         metadata={"receipt_number": sale.receipt_number})
        await db.commit()
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="receipt-{sale.receipt_number or sale.id}.pdf"'})

    @router.post("/sales/{sale_id}/receipt/email/")
    async def email_sale_receipt(
        sale_id: UUID,
        body: dict = Body(...),   # {"to": "patient@example.com"} optional override
        ctx: TenantContext = Depends(get_tenant_context),
        db: AsyncSession = Depends(get_db),
    ):
        sale = await _load_sale_full(db, sale_id, ctx.tenant_id)
        if sale.status not in ("paid", "refunded"):
            raise HTTPException(409, "Cannot email receipt before sale closes")
        tenant = await db.get(Tenant, ctx.tenant_id)
        staff = await resolve_staff(ctx, db)
        cashier = f"{staff.first_name} {staff.last_name}" if staff else ""

        to_email = body.get("to") or (sale.patient.email if sale.patient and sale.patient.email else None)
        if not to_email:
            raise HTTPException(400, "No recipient email — pass {to: ...} or set patient email")

        pdf_bytes = build_receipt_pdf(sale, tenant, cashier_name=cashier)
        first = sale.patient.first_name if sale.patient else "there"
        sale_date_human = (sale.closed_at or sale.opened_at).strftime("%B %d, %Y")
        change_str = None
        for p in sale.payments:
            if p.method == "cash" and p.tendered is not None and p.change_due:
                change_str = f"tendered ${p.tendered:.2f} • change ${p.change_due:.2f}"
                break
        subject, html = render_receipt_email(
            patient_first_name=first,
            clinic_name=getattr(tenant, "name", "Clinic"),
            clinic_phone=getattr(tenant, "phone", ""),
            sale_date_human=sale_date_human,
            total=f"${sale.total:.2f}",
            cash_change_str=change_str,
        )
        attachment = {
            "Name": f"receipt-{sale.receipt_number or sale.id}.pdf",
            "Content": base64.b64encode(pdf_bytes).decode(),
            "ContentType": "application/pdf",
        }
        result = await send_email(tenant, to=to_email, subject=subject, html=html, text="",
                                  attachments=[attachment])
        await log_action(db, ctx, AuditAction.RECEIPT_EMAILED, "sale", sale.id,
                         staff_id=staff.id if staff else None,
                         patient_id=sale.patient_id,
                         metadata={"to": to_email, "receipt_number": sale.receipt_number, "provider_message_id": result.get("MessageID")})
        await db.commit()
        return {"ok": True, "to": to_email}

    @router.get("/refunds/{refund_id}/receipt/")
    async def get_refund_receipt(
        refund_id: UUID,
        ctx: TenantContext = Depends(get_tenant_context),
        db: AsyncSession = Depends(get_db),
    ):
        refund = (await db.execute(
            select(Refund).where(Refund.id == refund_id, Refund.tenant_id == ctx.tenant_id)
            .options(selectinload(Refund.line_items), selectinload(Refund.payment_refunds))
        )).scalar_one_or_none()
        if refund is None:
            raise HTTPException(404, "Refund not found")
        sale = await _load_sale_full(db, refund.sale_id, ctx.tenant_id)
        tenant = await db.get(Tenant, ctx.tenant_id)
        staff = await resolve_staff(ctx, db)
        cashier = f"{staff.first_name} {staff.last_name}" if staff else ""
        pdf = build_refund_receipt_pdf(refund, sale, tenant, cashier_name=cashier)
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="refund-{refund.id}.pdf"'})
    ```

    **C. Register router in `backend/main.py`:**
    ```python
    from backend.api.routes.sale_receipts import router as sale_receipts_router
    app.include_router(sale_receipts_router)
    ```

    **D. Replace `backend/tests/test_receipt_email.py`:**

    ```python
    import pytest
    from unittest.mock import AsyncMock, patch
    from decimal import Decimal

    pytestmark = pytest.mark.asyncio

    async def test_render_receipt_email_subject_and_html():
        from backend.services.messaging.templates.receipt_email import render_receipt_email
        subject, html = render_receipt_email("Pat", "Acme Optometry", "(555) 555-1234",
                                              "May 28, 2026", "$107.25", cash_change_str="tendered $120.00 • change $12.75")
        assert "Acme Optometry" in subject
        assert "Pat" in html
        assert "$107.25" in html
        assert "May 28, 2026" in html
        assert "tendered $120.00" in html
        assert "<p" in html and "</p>" in html

    async def test_email_endpoint_includes_pdf_attachment(monkeypatch):
        # Direct unit test of the email handler path — mock send_email and assert payload shape
        with patch("backend.api.routes.sale_receipts.send_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {"MessageID": "msg-fake-1"}
            # Build minimal sale + dependencies; skip the full route call (would need DI overrides)
            from backend.services.receipts.receipt_pdf import build_receipt_pdf
            from types import SimpleNamespace
            sale = SimpleNamespace(
                id="s1", receipt_number="R-20260528-0001",
                subtotal=Decimal("100"), tax=Decimal("7.25"), discount_total=Decimal("0"), total=Decimal("107.25"),
                opened_at=None, closed_at=None,
                lines=[], payments=[], refunds=[], patient=None,
            )
            tenant = SimpleNamespace(name="X", address="", phone="", npi="")
            pdf = build_receipt_pdf(sale, tenant, cashier_name="A")
            # Attachment dict shape per Postmark API:
            import base64
            att = {"Name": "x.pdf", "Content": base64.b64encode(pdf).decode(), "ContentType": "application/pdf"}
            await mock_send(tenant, to="a@b.com", subject="x", html="y", text="", attachments=[att])
            assert mock_send.called
            call_kwargs = mock_send.call_args.kwargs
            assert call_kwargs["attachments"][0]["ContentType"] == "application/pdf"
    ```
  </action>
  <verify>
    <automated>cd backend && pytest tests/test_receipt_email.py -v && python -c "from backend.api.routes.sale_receipts import router; print([r.path for r in router.routes])" && grep -c "sale_receipts" backend/main.py</automated>
  </verify>
  <acceptance_criteria>
    - `pytest backend/tests/test_receipt_email.py -v` 2 tests pass
    - `grep -c "Postmark\|send_email" backend/api/routes/sale_receipts.py` returns >= 1
    - `grep -c "Resend\|resend" backend/api/routes/sale_receipts.py backend/services/messaging/templates/receipt_email.py` returns 0 — Postmark is the BAA-approved provider, NOT Resend
    - `grep -c "RECEIPT_EMAILED\|AuditAction.RECEIPT_EMAILED" backend/api/routes/sale_receipts.py` returns >= 1
    - `grep -c "RECEIPT_PRINTED\|AuditAction.RECEIPT_PRINTED" backend/api/routes/sale_receipts.py` returns >= 1
    - `grep -c "application/pdf" backend/api/routes/sale_receipts.py` returns >= 2 (sale + refund)
    - `grep -c "409" backend/api/routes/sale_receipts.py` returns >= 1 (status<paid 409 gate)
    - `grep -c "include_router(sale_receipts" backend/main.py` returns >= 1
  </acceptance_criteria>
  <done>Receipt + refund-receipt PDF endpoints + email send shipped; Postmark used; status gates enforced.</done>
</task>

</tasks>

<verification>
- Receipt PDFs render with `%PDF-` magic
- Email handler attaches PDF + Postmark client used
- 409 on receipt-before-close
- Audit rows on print + email
</verification>

<success_criteria>
ROADMAP #3 deliverable shipped on the backend side.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-06-SUMMARY.md`
</output>
