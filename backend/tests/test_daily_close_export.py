"""POS-04 — daily-close PDF + CSV export smoke."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace


def _close_data() -> dict:
    return {
        "close_date": date(2026, 5, 28),
        "sales_summary": {
            "count": 5,
            "gross": Decimal("500.00"),
            "refunds": Decimal("25.00"),
            "net": Decimal("475.00"),
        },
        "by_method": [
            {"key": "cash", "count": 3, "total": Decimal("250.00")},
            {"key": "stripe_card", "count": 2, "total": Decimal("250.00")},
        ],
        "by_category": [
            {"key": "retail", "count": 4, "total": Decimal("400.00")},
            {"key": "clinical", "count": 1, "total": Decimal("100.00")},
        ],
        "expected_cash": Decimal("245.00"),
        "stripe_payout_estimate": Decimal("242.05"),
    }


def test_daily_close_pdf_smoke():
    from backend.services.receipts.daily_close_pdf import (
        build_daily_close_pdf,
    )

    tenant = SimpleNamespace(name="Acme Optometry")
    pdf = build_daily_close_pdf(
        _close_data(),
        tenant,
        counted_cash=Decimal("245.00"),
        variance=Decimal("0.00"),
        run_by="Alice",
    )
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 800


def test_daily_close_pdf_open_day_omits_counted_variance():
    """Open-day view (no DailyCloseRun yet) — counted/variance render as '—'
    placeholders so the PDF preview still works pre-close.
    """
    from backend.services.receipts.daily_close_pdf import (
        build_daily_close_pdf,
    )

    tenant = SimpleNamespace(name="Acme Optometry")
    pdf = build_daily_close_pdf(_close_data(), tenant)
    assert pdf[:5] == b"%PDF-"


def test_daily_close_csv_shape():
    from backend.services.receipts.daily_close_csv import (
        build_daily_close_csv,
    )

    csv_bytes = build_daily_close_csv(
        _close_data(),
        counted_cash=Decimal("245.00"),
        variance=Decimal("0.00"),
    )
    text = csv_bytes.decode()
    assert "section,key,count,total" in text
    assert "summary,gross" in text
    assert "by_method,cash" in text
    assert "by_method,stripe_card" in text
    assert "by_category,retail" in text
    assert "by_category,clinical" in text
    assert "cash,expected" in text
    assert "cash,counted" in text
    assert "cash,variance" in text
    assert "stripe,payout_estimate" in text


def test_daily_close_csv_open_day_skips_counted_variance():
    """Without counted/variance args, those rows are omitted (open-day view).
    """
    from backend.services.receipts.daily_close_csv import (
        build_daily_close_csv,
    )

    csv_bytes = build_daily_close_csv(_close_data())
    text = csv_bytes.decode()
    assert "cash,expected" in text
    assert "cash,counted" not in text
    assert "cash,variance" not in text
