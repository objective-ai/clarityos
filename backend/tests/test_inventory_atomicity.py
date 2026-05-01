"""Phase 13 — Retail Inventory: stock atomicity tests (Wave 0 stubs).

Stubs for INV-03, INV-03b, INV-03c, INV-06, INV-07, INV-10, INV-11, INV-12.
Wave 1+ replaces each pytest.skip body with a real assertion.

Per 13-RESEARCH.md (lines 213-260): atomic decrement uses with_for_update + same-TXN
InventoryTransaction insert. Per lines 261-270: partial unique index on (tenant_id, sku)
WHERE is_active = true.
"""

import pytest
import pytest_asyncio  # noqa: F401  (re-exported for fixture decorators)

# Production symbols not yet implemented — Wave 1
clinical = pytest.importorskip(
    "backend.db.models.tenant.clinical",
    reason="Wave 1 (13-01) — Product/InventoryTransaction ORM not yet added",
)


@pytest.mark.asyncio
async def test_product_create_with_attrs(db_session, product_factory):
    """INV-06 — Product persists with JSONB attributes round-trip."""
    pytest.skip("Wave 1 — implement after 13-01 lands Product ORM")


@pytest.mark.asyncio
async def test_sku_partial_unique(db_session, product_factory):
    """INV-07 — partial unique index permits duplicate SKU on inactive rows."""
    pytest.skip("Wave 1 — implement after migration 0017_retail_inventory")


@pytest.mark.asyncio
async def test_sku_unique_only_when_active(db_session, product_factory):
    """INV-07 — alias of test_sku_partial_unique, named per VALIDATION map."""
    pytest.skip("Wave 1 — implement after migration 0017_retail_inventory")


@pytest.mark.asyncio
async def test_place_decrements_stock_atomically(
    db_session, product_factory, optical_order_factory
):
    """INV-03 — POST /place mutates stock_qty + InventoryTransaction in one TXN."""
    pytest.skip("Wave 2 (13-06) — implement after place handler exists")


@pytest.mark.asyncio
async def test_cancel_restocks_stock_atomically(
    db_session, product_factory, optical_order_factory
):
    """INV-10 — POST /cancel restores stock_qty + writes order_cancelled InventoryTransaction."""
    pytest.skip("Wave 2 (13-06) — implement after cancel handler exists")


@pytest.mark.asyncio
async def test_concurrent_place_no_negative_stock(
    db_session, product_factory, optical_order_factory
):
    """INV-11 — two simultaneous /place calls cannot drive stock below zero (with_for_update)."""
    pytest.skip("Wave 2 (13-06) — implement after with_for_update lock added")


@pytest.mark.asyncio
async def test_concurrent_place_no_oversell(
    db_session, product_factory, optical_order_factory
):
    """INV-11 alias per VALIDATION map."""
    pytest.skip("Wave 2 (13-06) — implement after with_for_update lock added")


@pytest.mark.asyncio
async def test_zero_stock_returns_warning(
    db_session, product_factory, optical_order_factory
):
    """INV-12 — POST /place against zero-stock product returns 200 + warning, NOT 4xx."""
    pytest.skip("Wave 2 (13-06) — implement after soft-block branch exists")
