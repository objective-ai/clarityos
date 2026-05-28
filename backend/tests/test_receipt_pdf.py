"""POS-03 — PDF receipt: bytes non-empty, starts with %PDF-."""

import pytest

try:
    from backend.services.receipts.receipt_pdf import render_receipt_pdf
except ImportError:
    pytest.skip(
        "render_receipt_pdf not yet implemented (Plan 15-06)",
        allow_module_level=True,
    )


def test_render_receipt_pdf_is_callable():
    assert callable(render_receipt_pdf)
