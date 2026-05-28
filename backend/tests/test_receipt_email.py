"""POS-03 — receipt email rendering + Postmark attachment shape (Plan 15-06).

The rendering helper is pure; the route is covered by an indirect assertion
on the payload shape we hand to ``send_email`` (Postmark Attachment dict).
The full E2E happens in Plan 15-11.
"""
from __future__ import annotations

import base64
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from backend.services.messaging.templates.receipt_email import render_receipt_email


pytestmark = pytest.mark.asyncio


async def test_render_receipt_email_subject_and_html():
    subject, html_body = render_receipt_email(
        patient_first_name="Pat",
        clinic_name="Acme Optometry",
        clinic_phone="(555) 555-1234",
        sale_date_human="May 28, 2026",
        total="$107.25",
        cash_change_str="tendered $120.00 • change $12.75",
    )
    assert "Acme Optometry" in subject
    assert "Pat" in html_body
    assert "$107.25" in html_body
    assert "May 28, 2026" in html_body
    assert "tendered $120.00" in html_body
    assert "<p" in html_body and "</p>" in html_body


async def test_render_receipt_email_escapes_html_in_clinic_name():
    """Caller-supplied strings must be HTML-escaped to keep the layout safe."""
    subject, html_body = render_receipt_email(
        patient_first_name="<script>x</script>",
        clinic_name="O'Hara & Co",
        clinic_phone="",
        sale_date_human="May 28, 2026",
        total="$10.00",
    )
    assert "<script>" not in html_body  # escaped
    assert "&lt;script&gt;" in html_body
    # html.escape(quote=True) renders ' as &#x27; — both ampersand and
    # apostrophe escapes appear in the rendered clinic name.
    assert "&amp;" in html_body
    assert "&#x27;" in html_body
    assert "Questions?" not in html_body  # phone-line block suppressed when blank


async def test_email_endpoint_attachment_payload_shape():
    """The receipt-email handler hands send_email a Postmark Attachment dict."""
    with patch(
        "backend.api.routes.sale_receipts.send_email", new_callable=AsyncMock
    ) as mock_send:
        mock_send.return_value = "msg-fake-1"

        from backend.services.receipts.receipt_pdf import build_receipt_pdf

        sale = SimpleNamespace(
            id="sale-1",
            receipt_number="R-20260528-0001",
            subtotal=Decimal("100"),
            tax=Decimal("7.25"),
            discount_total=Decimal("0"),
            total=Decimal("107.25"),
            opened_at=None,
            closed_at=None,
            lines=[],
            payments=[],
            refunds=[],
            patient=None,
        )
        tenant = SimpleNamespace(name="X", settings_jsonb={})

        pdf = build_receipt_pdf(sale, tenant, cashier_name="A")
        attachment = {
            "Name": "x.pdf",
            "Content": base64.b64encode(pdf).decode(),
            "ContentType": "application/pdf",
        }

        await mock_send(
            subject="x",
            html="<p>y</p>",
            to="a@b.com",
            idempotency_key="x:y",
            attachments=[attachment],
            tag="receipt",
        )

        assert mock_send.called
        kwargs = mock_send.call_args.kwargs
        assert kwargs["attachments"][0]["ContentType"] == "application/pdf"
        assert kwargs["attachments"][0]["Name"].endswith(".pdf")
        # Base64 round-trip recovers the PDF magic.
        recovered = base64.b64decode(kwargs["attachments"][0]["Content"])
        assert recovered[:5] == b"%PDF-"
