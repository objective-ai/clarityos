"""POS-06 — split tender: multiple Payment rows per Sale; remaining=0 enforced at close."""

import pytest

try:
    from backend.services.sale_lifecycle import compute_remaining_balance
except ImportError:
    pytest.skip(
        "compute_remaining_balance not yet implemented (Plan 15-03)",
        allow_module_level=True,
    )


def test_compute_remaining_balance_is_callable():
    assert callable(compute_remaining_balance)
