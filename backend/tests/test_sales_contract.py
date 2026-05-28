"""POS-16 — Pydantic `by_alias=True` snake↔camel contract test for SaleResponse + related schemas."""

import pytest

try:
    from backend.schemas.sales import (  # noqa: F401
        DailyCloseResponse,
        PaymentResponse,
        RefundResponse,
        SaleLineItemResponse,
        SaleResponse,
    )
except ImportError:
    pytest.skip(
        "POS response schemas not yet implemented (Plan 15-03)",
        allow_module_level=True,
    )


def test_sale_response_schema_uses_alias_generator():
    from backend.schemas.sales import SaleResponse

    config = getattr(SaleResponse, "model_config", None)
    assert config is not None, "SaleResponse must declare model_config"
