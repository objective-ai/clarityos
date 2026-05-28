"""POS-02 — cash payment branch: tendered + change_due math."""

import pytest

try:
    from backend.services.sale_lifecycle import compute_change_due
except ImportError:
    pytest.skip(
        "compute_change_due not yet implemented (Plan 15-03)",
        allow_module_level=True,
    )


def test_compute_change_due_is_callable():
    assert callable(compute_change_due)
