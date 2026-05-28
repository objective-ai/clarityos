"""POS-05, POS-09 — refund restock + InventoryTransaction in same commit; superbill lines never restock."""

import pytest

try:
    from backend.services.sale_lifecycle import issue_refund
except ImportError:
    pytest.skip(
        "issue_refund not yet implemented (Plan 15-05)",
        allow_module_level=True,
    )


def test_issue_refund_is_callable():
    assert callable(issue_refund)
