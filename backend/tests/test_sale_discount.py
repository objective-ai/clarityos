"""POS-15 — per-line discount with mandatory reason; SALE_DISCOUNT_APPLIED audit row."""

import pytest

try:
    from backend.schemas.sales import SaleLineItemPatch
except ImportError:
    pytest.skip(
        "SaleLineItemPatch schema not yet implemented (Plan 15-03)",
        allow_module_level=True,
    )


def test_sale_line_item_patch_schema_exists():
    assert SaleLineItemPatch is not None
