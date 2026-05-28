"""POS-04 — daily-close PDF + CSV export smoke tests."""

import pytest

try:
    from backend.services.receipts.daily_close_csv import render_daily_close_csv
    from backend.services.receipts.daily_close_pdf import render_daily_close_pdf
except ImportError:
    pytest.skip(
        "daily-close export not yet implemented (Plan 15-07)",
        allow_module_level=True,
    )


def test_render_daily_close_pdf_is_callable():
    assert callable(render_daily_close_pdf)


def test_render_daily_close_csv_is_callable():
    assert callable(render_daily_close_csv)
