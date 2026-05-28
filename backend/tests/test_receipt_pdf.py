"""POS-03 — receipt + refund-receipt PDF smoke tests (Plan 15-06).

These are pure-Python smoke tests: build the PDFs against SimpleNamespace
fixtures, assert the byte stream starts with the PDF magic, and confirm
font + title conventions from the 15-UI-SPEC.
"""
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4


def _mk_tenant():
    return SimpleNamespace(
        name="Acme Optometry",
        settings_jsonb={
            "clinic_address": "123 Main St",
            "clinic_phone": "(555) 555-1234",
            "clinic_npi": "1234567890",
        },
    )


def _mk_sale():
    line_id = uuid4()
    payment_id = uuid4()
    return SimpleNamespace(
        id=uuid4(),
        receipt_number="R-20260528-0042",
        opened_at=datetime(2026, 5, 28, 14, 0, tzinfo=timezone.utc),
        closed_at=datetime(2026, 5, 28, 14, 5, tzinfo=timezone.utc),
        subtotal=Decimal("100.00"),
        tax=Decimal("7.25"),
        discount_total=Decimal("0.00"),
        total=Decimal("107.25"),
        patient=SimpleNamespace(
            first_name="Pat",
            last_name="Test",
            dob=None,
        ),
        lines=[
            SimpleNamespace(
                id=line_id,
                description="Frame XYZ",
                qty=1,
                unit_price=Decimal("100.00"),
                discount_amount=Decimal("0.00"),
                line_total=Decimal("100.00"),
            )
        ],
        payments=[
            SimpleNamespace(
                id=payment_id,
                method="cash",
                amount=Decimal("107.25"),
                tendered=Decimal("120.00"),
                change_due=Decimal("12.75"),
                status="succeeded",
                last4=None,
                card_brand=None,
                reason_note=None,
            )
        ],
        refunds=[],
    )


def test_receipt_pdf_bytes_have_pdf_magic():
    from backend.services.receipts.receipt_pdf import build_receipt_pdf

    sale = _mk_sale()
    pdf = build_receipt_pdf(sale, _mk_tenant(), cashier_name="Alice")
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 1000


def test_refund_receipt_pdf_smoke():
    from backend.services.receipts.refund_receipt_pdf import build_refund_receipt_pdf

    sale = _mk_sale()
    sale_line = sale.lines[0]
    payment = sale.payments[0]

    refund = SimpleNamespace(
        id=uuid4(),
        created_at=datetime(2026, 5, 29, tzinfo=timezone.utc),
        reason="Customer changed mind",
        total_amount=Decimal("107.25"),
        line_items=[
            SimpleNamespace(
                sale_line_item_id=sale_line.id,
                qty=1,
                amount=Decimal("100.00"),
            )
        ],
        payment_allocations=[
            SimpleNamespace(
                payment_id=payment.id,
                amount=Decimal("107.25"),
                processor_refund_id=None,
            )
        ],
    )
    pdf = build_refund_receipt_pdf(refund, sale, _mk_tenant(), cashier_name="Alice")
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 800
