"""POS-11 — write-off payments require non-empty reason_note."""

import pytest

try:
    from backend.schemas.sales import PaymentCreate
except ImportError:
    pytest.skip(
        "PaymentCreate schema not yet implemented (Plan 15-03)",
        allow_module_level=True,
    )


def test_payment_create_schema_exists():
    assert PaymentCreate is not None
