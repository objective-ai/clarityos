"""Phase 13 — Retail Inventory: permission matrix + audit + entitlement stubs.

Covers INV-08 (restock audit), INV-14 (retail_pos entitlement), INV-18 (audit rows),
INV-19 (permission matrix). Wave 1/2 fills bodies.
"""

import pytest

# Defensive guard: backend.core.permissions imports backend.core.config which
# instantiates Settings() — that requires runtime env vars not present in CI
# collection. Catch any exception so collection stays green even before the
# new ClinicalAction values land. Wave 1 (13-02) replaces this with a real import.
try:
    permissions = __import__("backend.core.permissions", fromlist=["*"])
except Exception as _exc:  # pragma: no cover — Wave 0 collection guard
    pytest.skip(
        f"Wave 1 (13-02) — new ClinicalAction values not yet added ({type(_exc).__name__})",
        allow_module_level=True,
    )


def test_view_inventory_in_matrix_for_all_roles():
    """INV-19 — VIEW_INVENTORY granted to {DOCTOR, TECHNICIAN, RECEPTIONIST, ADMIN, OWNER}."""
    pytest.skip("Wave 1 (13-02)")


def test_manage_inventory_owner_admin_only():
    """INV-19 — MANAGE_INVENTORY restricted to {ADMIN, OWNER}."""
    pytest.skip("Wave 1 (13-02)")


def test_cancel_optical_order_owner_admin_only():
    """INV-19 — CANCEL_OPTICAL_ORDER restricted to {ADMIN, OWNER}."""
    pytest.skip("Wave 1 (13-02)")


@pytest.mark.asyncio
async def test_product_create_writes_audit_row(db_session, product_factory):
    """INV-18 — POST /products writes AuditAction.PRODUCT_CREATE row."""
    pytest.skip("Wave 2 (13-05)")


@pytest.mark.asyncio
async def test_receive_stock_writes_audit(db_session, product_factory):
    """INV-08 + INV-18 — receive-stock writes STOCK_RECEIVE audit row + InventoryTransaction in primary TXN."""
    pytest.skip("Wave 2 (13-05)")


def test_retail_pos_entitlement_key():
    """INV-14 — retail_pos exists in Entitlement enum but NOT in PLAN_FEATURES Core/Plus/Premium."""
    pytest.skip("Wave 1 (13-02)")
