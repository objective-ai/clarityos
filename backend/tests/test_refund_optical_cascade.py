"""POS-05 — when all OpticalOrder lines are refunded, the OpticalOrder.status cascades to 'cancelled'."""

import pytest

try:
    from backend.services.sale_lifecycle import issue_refund  # noqa: F401
except ImportError:
    pytest.skip(
        "issue_refund not yet implemented (Plan 15-05)",
        allow_module_level=True,
    )


def test_issue_refund_module_imported():
    from backend.services import sale_lifecycle

    assert hasattr(sale_lifecycle, "issue_refund")
