"""backend/tests/conftest.py — shared fixtures for top-level test files.

Phase 13 (Wave 0): introduces `product_factory`, `optical_order_factory`,
and `inventory_transaction_factory` for retail-inventory tests. The factories
import production ORM lazily — Wave 1 (13-01) lands the Product/OpticalOrder/
InventoryTransaction models, at which point invoking the factory inside a
non-skipped test will succeed.

`db_session` and `tenant_context` fixtures are also defined here as Wave 0
SKIP STUBS — they call `pytest.skip(...)` so any test that depends on them
skips cleanly rather than erroring during fixture resolution. Wave 1 (the
plan that needs real DB-touching tests) will replace these stubs with real
async-session + tenant-context implementations, at which point every Phase 13
test that lives behind a per-test `pytest.skip("Wave N — ...")` body line
will start to run for real.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio


# ---------------------------------------------------------------------------
# ASGI test client with synthetic auth — used by route-level RBAC tests.
#
# The override replaces `get_current_tenant` entirely, so no JWT verification,
# bearer header, or Supabase round-trip happens. Tests can call
# `set_role("technician")` to change which TenantContext the override returns.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def authed_client():
    """Yield (TestClient, set_role) for synthetic-auth route tests.

    The fixture is module-scoped so we instantiate the FastAPI app + override
    once per file, then mutate the role between tests via the closure.
    """
    from fastapi.testclient import TestClient

    from backend.core.security import TenantContext, get_current_tenant
    from backend.main import app

    state = {"role": "doctor", "tenant_id": uuid4()}

    def _override() -> TenantContext:
        return TenantContext(
            user_id=uuid4(),
            tenant_id=state["tenant_id"],
            role=state["role"],
            plan_name="Premium",
        )

    app.dependency_overrides[get_current_tenant] = _override

    def set_role(role: str) -> None:
        state["role"] = role

    # Don't use `with TestClient(...)` — that fires startup events
    # (messaging scheduler, etc.) which need a real DB.
    client = TestClient(app, raise_server_exceptions=False)

    yield client, set_role

    app.dependency_overrides.pop(get_current_tenant, None)


@pytest.fixture
def db_session():
    """Wave 0 stub — Wave 1 replaces with a real async SQLAlchemy session.

    Tests that depend on `db_session` skip cleanly until Wave 1 introduces
    the real fixture. This avoids ERROR-status fixture-resolution failures
    during the Wave 0 scaffold phase.
    """
    pytest.skip(
        "Wave 0 stub — db_session fixture lands in Wave 1 (first plan that "
        "needs a real DB session)"
    )


@pytest.fixture
def tenant_context():
    """Wave 0 stub — Wave 1 replaces with a real TenantContext fixture."""
    pytest.skip(
        "Wave 0 stub — tenant_context fixture lands in Wave 1 (first plan "
        "that needs a real tenant context)"
    )


@pytest_asyncio.fixture
async def product_factory(db_session, tenant_context):
    """Create a Product row for inventory tests. Wave 1 fills body."""

    async def _make(
        *,
        product_type: str = "frame",
        sku: str = "FR-TEST-001",
        stock_qty: int = 10,
        **overrides,
    ):
        # Lazy import — raises ImportError until Wave 1 (13-01) lands ORM.
        from backend.db.models.tenant.clinical import Product

        default_attrs = (
            {
                "brand": "Test",
                "model": "Frame",
                "color": "Black",
                "eye_size": 52,
                "bridge_size": 18,
                "temple_size": 145,
                "gender": "unisex",
                "material": "acetate",
            }
            if product_type == "frame"
            else {
                "brand": "Test",
                "modality": "daily",
                "base_curve": 8.5,
                "diameter": 14.3,
                "power": -2.0,
                "box_size": 90,
            }
        )
        product = Product(
            tenant_id=tenant_context.tenant_id,
            product_type=product_type,
            brand=overrides.pop("brand", default_attrs["brand"]),
            model=overrides.pop("model", default_attrs.get("model", "Test")),
            sku=sku,
            attributes=overrides.pop("attributes", default_attrs),
            retail_price=overrides.pop("retail_price", 100.00),
            cost_price=overrides.pop("cost_price", 40.00),
            stock_qty=stock_qty,
            reorder_threshold=overrides.pop("reorder_threshold", 3),
            is_active=overrides.pop("is_active", True),
            **overrides,
        )
        db_session.add(product)
        await db_session.flush()
        return product

    return _make


@pytest_asyncio.fixture
async def optical_order_factory(db_session, tenant_context, product_factory):
    """Create an OpticalOrder + line items. Wave 1 fills body."""

    async def _make(
        *,
        patient_id,
        encounter_id=None,
        status: str = "draft",
        line_items=None,
        **overrides,
    ):
        from backend.db.models.tenant.clinical import (
            OpticalOrder,
            OpticalOrderLineItem,
        )

        order = OpticalOrder(
            tenant_id=tenant_context.tenant_id,
            patient_id=patient_id,
            encounter_id=encounter_id,
            status=status,
            total_price=0,
            created_by_id=overrides.pop("created_by_id", None),
            **overrides,
        )
        db_session.add(order)
        await db_session.flush()
        for li in line_items or []:
            db_session.add(
                OpticalOrderLineItem(
                    tenant_id=tenant_context.tenant_id,
                    order_id=order.id,
                    product_id=li["product_id"],
                    qty=li.get("qty", 1),
                    unit_price=li["unit_price"],
                    line_total=li.get(
                        "line_total", li["unit_price"] * li.get("qty", 1)
                    ),
                )
            )
        await db_session.flush()
        return order

    return _make


@pytest_asyncio.fixture
async def inventory_transaction_factory(db_session, tenant_context):
    """Create an InventoryTransaction audit row. Wave 1 fills body."""

    async def _make(*, product_id, delta: int, reason: str = "manual_adjust", **overrides):
        from backend.db.models.tenant.clinical import InventoryTransaction

        tx = InventoryTransaction(
            tenant_id=tenant_context.tenant_id,
            product_id=product_id,
            delta=delta,
            reason=reason,
            **overrides,
        )
        db_session.add(tx)
        await db_session.flush()
        return tx

    return _make
