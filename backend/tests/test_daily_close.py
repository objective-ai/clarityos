"""POS-04, POS-10 — daily-close aggregation by method/category + cash reconciliation."""

import pytest

try:
    from backend.services.sale_lifecycle import compute_daily_close_totals
except ImportError:
    pytest.skip(
        "compute_daily_close_totals not yet implemented (Plan 15-07)",
        allow_module_level=True,
    )


def test_compute_daily_close_totals_is_callable():
    assert callable(compute_daily_close_totals)
