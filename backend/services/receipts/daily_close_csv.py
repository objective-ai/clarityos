"""Daily-close CSV export (POS-04). Plain CSV with a single header row
``section,key,count,total``; each section ID groups its rows together so
spreadsheet pivots work without further wrangling.
"""
from __future__ import annotations

import csv
from decimal import Decimal
from io import StringIO


def _row(*vals) -> list[str]:
    return [str(v) for v in vals]


def build_daily_close_csv(
    data: dict,
    counted_cash: Decimal | None = None,
    variance: Decimal | None = None,
) -> bytes:
    """Render the daily-close data dict as a flat CSV byte string."""
    buf = StringIO()
    w = csv.writer(buf)
    w.writerow(["section", "key", "count", "total"])

    s = data["sales_summary"]
    w.writerow(_row("summary", "count", s["count"], ""))
    w.writerow(_row("summary", "gross", "", f"{Decimal(s['gross']):.2f}"))
    w.writerow(_row("summary", "refunds", "", f"{Decimal(s['refunds']):.2f}"))
    w.writerow(_row("summary", "net", "", f"{Decimal(s['net']):.2f}"))

    for m in data["by_method"]:
        w.writerow(
            _row(
                "by_method",
                m["key"],
                m["count"],
                f"{Decimal(m['total']):.2f}",
            )
        )

    for c in data["by_category"]:
        w.writerow(
            _row(
                "by_category",
                c["key"],
                c["count"],
                f"{Decimal(c['total']):.2f}",
            )
        )

    w.writerow(
        _row("cash", "expected", "", f"{Decimal(data['expected_cash']):.2f}")
    )
    if counted_cash is not None:
        w.writerow(
            _row("cash", "counted", "", f"{Decimal(counted_cash):.2f}")
        )
    if variance is not None:
        w.writerow(_row("cash", "variance", "", f"{Decimal(variance):.2f}"))

    if data.get("stripe_payout_estimate") is not None:
        w.writerow(
            _row(
                "stripe",
                "payout_estimate",
                "",
                f"{Decimal(data['stripe_payout_estimate']):.2f}",
            )
        )

    return buf.getvalue().encode("utf-8")


__all__ = ["build_daily_close_csv"]
