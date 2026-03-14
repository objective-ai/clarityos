"""
Fee service unit tests — Wave 0 stub.
Implementation in plan 09-02 (fee_service.py creation).
Tests are marked skip until fee_service.py exists.
"""
import pytest


@pytest.mark.skip(reason="stub — fee_service.py created in plan 09-02")
def test_resolve_fee_returns_payer_rate():
    """resolve_line_item_fee returns payer-specific rate when payer override exists."""
    pass


@pytest.mark.skip(reason="stub — fee_service.py created in plan 09-02")
def test_resolve_fee_fallback():
    """resolve_line_item_fee falls back to base catalog rate when no payer override."""
    pass


@pytest.mark.skip(reason="stub — fee_service.py created in plan 09-02")
def test_resolve_fee_returns_zero_when_missing():
    """resolve_line_item_fee returns Decimal('0.00') when neither payer nor base has entry."""
    pass
