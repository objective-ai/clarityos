"""Phase 13 — Retail Inventory: Pydantic by_alias contract tests (Wave 0 stub).

INV-13 — Product.attributes JSONB must round-trip snake_case end-to-end.
ProductResponse and OpticalOrderResponse must serialize with the camelCase
keys listed below (and only those keys, modulo nested models).

Per feedback_camelizekeys_nested.md: apiFetch's recursive camelizeKeys would mangle
nested JSONB domain keys, so FE inventoryStore loads via raw fetch — and this contract
test snapshots the wire shape so FE never drifts from BE.
"""

import pytest

schemas = pytest.importorskip(
    "backend.schemas",
    reason="Wave 1 (13-03) — inventory + optical_order schemas not yet added",
)


EXPECTED_PRODUCT_RESPONSE_KEYS = {
    "id",
    "tenantId",
    "productType",
    "brand",
    "model",
    "sku",
    "upc",
    "attributes",
    "retailPrice",
    "costPrice",
    "stockQty",
    "reorderThreshold",
    "isActive",
    "createdAt",
    "updatedAt",
}

EXPECTED_OPTICAL_ORDER_RESPONSE_KEYS = {
    "id",
    "tenantId",
    "patientId",
    "encounterId",
    "status",
    "totalPrice",
    "createdById",
    "placedAt",
    "dispensedAt",
    "cancelledAt",
    "createdAt",
    "updatedAt",
    "lineItems",
}


def test_product_response_camel_keys():
    """INV-13 — ProductResponse.model_dump(by_alias=True) produces these exact keys."""
    pytest.skip("Wave 1 (13-03) — implement against ProductResponse")


def test_optical_order_response_camel_keys():
    """INV-13 — OpticalOrderResponse.model_dump(by_alias=True) produces these exact keys."""
    pytest.skip("Wave 1 (13-03)")


# ---------------------------------------------------------------------------
# Phase 14 — Optical Order Configuration contract extensions (OPT14-17)
# ---------------------------------------------------------------------------

EXPECTED_OPTICAL_ORDER_RESPONSE_PHASE14_EXTRA_KEYS = {
    "finalRefractionId",
    "habitualRefractionId",
    "visionPlan",
    "fitting",
    "jobTicketGeneratedAt",
    "suggestionResolutions",
}


def test_optical_order_response_contract_phase14_keys():
    """OPT14-17 — OpticalOrderResponse.model_dump(by_alias=True) includes Phase 14 extensions."""
    pytest.skip("Schemas extended in Phase 14-01")


def test_optical_order_line_item_contract_lens_config():
    """OPT14-17 — OpticalOrderLineItemResponse.model_dump(by_alias=True) includes lensConfig."""
    pytest.skip("Schemas extended in Phase 14-01")
