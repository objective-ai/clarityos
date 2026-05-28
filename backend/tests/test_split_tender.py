"""POS-06 — split tender: multiple Payment rows per Sale; remaining=0 enforced at close."""

from decimal import Decimal
from types import SimpleNamespace

from backend.services.sale_lifecycle import compute_remaining


def _pmt(amount, status="succeeded"):
    return SimpleNamespace(amount=Decimal(amount), status=status)


def test_remaining_zero_when_fully_paid():
    assert compute_remaining(
        Decimal("100.00"), [_pmt("60.00"), _pmt("40.00")]
    ) == Decimal("0.00")


def test_remaining_positive_partial():
    assert compute_remaining(
        Decimal("100.00"), [_pmt("60.00")]
    ) == Decimal("40.00")


def test_failed_payment_excluded():
    assert compute_remaining(
        Decimal("100.00"), [_pmt("100.00", status="failed")]
    ) == Decimal("100.00")


def test_partial_refund_status_still_counted():
    # A partially-refunded payment still applied its original principal to the sale
    assert compute_remaining(
        Decimal("100.00"), [_pmt("100.00", status="partial_refund")]
    ) == Decimal("0.00")
