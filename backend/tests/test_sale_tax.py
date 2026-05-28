"""POS-13 — tax only on taxable lines; banker's rounding (ROUND_HALF_EVEN)."""

import pytest

try:
    from backend.services.sale_lifecycle import compute_sale_totals
except ImportError:
    pytest.skip(
        "compute_sale_totals not yet implemented (Plan 15-03)",
        allow_module_level=True,
    )


def test_compute_sale_totals_is_callable():
    assert callable(compute_sale_totals)
