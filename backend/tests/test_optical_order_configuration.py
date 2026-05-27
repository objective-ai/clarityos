"""Phase 14 — Optical Order Configuration: configurator PATCH + place validation tests.

Plan 14-03 implements the routes; this file replaces the Plan 14-00
skip-stubs with real assertion bodies. Tests skip cleanly via the conftest
`db_session` + `tenant_context` fixtures (still Wave-0 stubs from Phase 13-00).
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from backend.api.routes.optical_order import (
    create_order,
    patch_optical_order,
    place_order,
)
from backend.db.models.tenant.clinical import (
    AuditAction,
    AuditLog,
    OpticalOrder,
    OpticalOrderLineItem,
    Product,
)
from backend.schemas.optical_order import (
    OpticalOrderCreate,
    OpticalOrderLineItemCreate,
    PatchOpticalOrderLineItem,
    PatchOpticalOrderRequest,
)


class _FakeRequest:
    class _Client:
        host = "127.0.0.1"

    client = _Client()


@pytest.mark.asyncio
async def test_draft_creation_prefills_rx(
    db_session, tenant_context, patient_with_final_refraction, product_factory
):
    """OPT14-01 — POST /optical-orders/ auto-populates final_refraction_id from encounter."""
    product = await product_factory(sku="FR-TEST-OPT14-01")
    payload = OpticalOrderCreate(
        patient_id=patient_with_final_refraction.patient_id,
        encounter_id=patient_with_final_refraction.encounter_id,
        line_items=[
            OpticalOrderLineItemCreate(
                product_id=product.id, qty=1, unit_price=Decimal("100.00")
            )
        ],
    )
    response = await create_order(
        payload, request=_FakeRequest(), ctx=tenant_context, db=db_session
    )
    assert response.final_refraction_id == patient_with_final_refraction.refraction_id


@pytest.mark.asyncio
async def test_patch_vision_plan_persists(
    db_session, tenant_context, optical_order_in_draft
):
    """OPT14-05 — PATCH persists vision_plan JSONB with snake_case keys verbatim."""
    payload = PatchOpticalOrderRequest(
        vision_plan={
            "name": "VSP Vision Care",
            "member_id": "MEM-12345",
            "group_number": "GRP-678",
        }
    )
    await patch_optical_order(
        optical_order_in_draft.id,
        payload,
        request=_FakeRequest(),
        ctx=tenant_context,
        db=db_session,
    )
    reloaded = (
        await db_session.execute(
            select(OpticalOrder).where(OpticalOrder.id == optical_order_in_draft.id)
        )
    ).scalar_one()
    assert reloaded.vision_plan_jsonb == {
        "name": "VSP Vision Care",
        "member_id": "MEM-12345",
        "group_number": "GRP-678",
    }
    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == AuditAction.OPTICAL_ORDER_CONFIGURE_UPDATE.value,
                AuditLog.resource_id == optical_order_in_draft.id,
            )
        )
    ).scalar_one_or_none()
    assert audit is not None
    assert "vision_plan" in (audit.metadata_ or {}).get("fields_changed", [])


@pytest.mark.asyncio
async def test_patch_rejected_when_status_not_draft(
    db_session, tenant_context, optical_order_in_draft
):
    """Pitfall 11 — PATCH returns 409 once the order leaves draft."""
    optical_order_in_draft.status = "placed"
    await db_session.flush()
    with pytest.raises(HTTPException) as exc:
        await patch_optical_order(
            optical_order_in_draft.id,
            PatchOpticalOrderRequest(vision_plan={"name": "X"}),
            request=_FakeRequest(),
            ctx=tenant_context,
            db=db_session,
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_place_validates_seg_height_for_progressive(
    db_session, tenant_context, progressive_order_missing_seg
):
    """OPT14-04 / Pitfall 7 — place 400s when seg_height missing for progressive."""
    with pytest.raises(HTTPException) as exc:
        await place_order(
            progressive_order_missing_seg.id,
            request=_FakeRequest(),
            ctx=tenant_context,
            db=db_session,
        )
    assert exc.value.status_code == 400
    paths = [fe["path"] for fe in exc.value.detail["field_errors"]]
    assert any("seg_height" in p for p in paths)


@pytest.mark.asyncio
async def test_place_validates_vertex_for_requires_vertex_lens(
    db_session, tenant_context, vertex_required_order_missing_vd
):
    """OPT14-04 — place 400s when vertex_distance missing for requires_vertex lens."""
    with pytest.raises(HTTPException) as exc:
        await place_order(
            vertex_required_order_missing_vd.id,
            request=_FakeRequest(),
            ctx=tenant_context,
            db=db_session,
        )
    assert exc.value.status_code == 400
    paths = [fe["path"] for fe in exc.value.detail["field_errors"]]
    assert any("vertex" in p for p in paths)


@pytest.mark.asyncio
async def test_place_validation_runs_before_row_lock(
    db_session, tenant_context, progressive_order_missing_seg
):
    """Pitfall 7 — failed validation must NOT mutate Product.stock_qty."""
    line = progressive_order_missing_seg.line_items[0]
    product = await db_session.get(Product, line.product_id)
    initial_stock = product.stock_qty
    with pytest.raises(HTTPException):
        await place_order(
            progressive_order_missing_seg.id,
            request=_FakeRequest(),
            ctx=tenant_context,
            db=db_session,
        )
    await db_session.refresh(product)
    assert product.stock_qty == initial_stock


# ---------------------------------------------------------------------------
# Plan 14-12 — DELETE /line-items/{line_id}/ unit tests
#
# These are pure-unit tests using SimpleNamespace mocks (per the project
# anti-pattern memo on "real assertion bodies that skip via fixture chain").
# They don't depend on the Wave-0 conftest stubs, so they run today.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_remove_line_item_from_draft_unit():
    """Plan 14-12 — DELETE on a draft removes line + recomputes total + writes audit."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock, patch

    from backend.api.routes.optical_order import remove_optical_order_line_item

    fake_query = MagicMock()
    fake_query.where = MagicMock(return_value=fake_query)
    fake_query.options = MagicMock(return_value=fake_query)

    order_id = uuid.uuid4()
    line_id = uuid.uuid4()
    product_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    target_line = SimpleNamespace(
        id=line_id,
        product_id=product_id,
        qty=1,
        line_total=Decimal("100.00"),
    )
    surviving_line = SimpleNamespace(
        id=uuid.uuid4(),
        product_id=uuid.uuid4(),
        qty=2,
        line_total=Decimal("50.00"),
    )
    order_pre = SimpleNamespace(
        id=order_id,
        tenant_id=tenant_id,
        status="draft",
        patient_id=uuid.uuid4(),
        encounter_id=uuid.uuid4(),
        line_items=[target_line, surviving_line],
        total_price=Decimal("150.00"),
    )
    order_post = SimpleNamespace(
        id=order_id,
        tenant_id=tenant_id,
        status="draft",
        patient_id=order_pre.patient_id,
        encounter_id=order_pre.encounter_id,
        line_items=[surviving_line],
        total_price=Decimal("50.00"),
        # Fields _order_response will touch — keep minimal but non-None
        ordered_at=None,
        placed_at=None,
        cancelled_at=None,
        dispensed_at=None,
        final_refraction_id=None,
        vision_plan_jsonb=None,
        fitting_jsonb=None,
        notes=None,
        created_at=None,
        updated_at=None,
    )

    results = [
        MagicMock(scalar_one_or_none=MagicMock(return_value=order_pre)),
        MagicMock(scalar_one=MagicMock(return_value=order_post)),
    ]
    db = MagicMock()
    db.execute = AsyncMock(side_effect=results)
    db.delete = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.expire = MagicMock()

    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    ctx = SimpleNamespace(tenant_id=tenant_id)

    audit_calls: list[dict] = []

    async def fake_log_action(_db, _ctx, action, *args, **kwargs):
        audit_calls.append({"action": action, "metadata": kwargs.get("metadata")})

    async def fake_resolve_staff(_ctx, _db):
        return SimpleNamespace(id=uuid.uuid4())

    def fake_order_response(o):
        return SimpleNamespace(
            id=o.id,
            line_items=o.line_items,
            total_price=o.total_price,
        )

    with patch("backend.api.routes.optical_order.select", return_value=fake_query), \
         patch("backend.api.routes.optical_order.selectinload", return_value=MagicMock()), \
         patch("backend.api.routes.optical_order.log_action", side_effect=fake_log_action), \
         patch("backend.api.routes.optical_order.resolve_staff", side_effect=fake_resolve_staff), \
         patch("backend.api.routes.optical_order._order_response", side_effect=fake_order_response):
        resp = await remove_optical_order_line_item(
            order_id=order_id,
            line_id=line_id,
            request=request,
            ctx=ctx,
            db=db,
        )

    db.delete.assert_awaited_once_with(target_line)
    # Route recomputes total from surviving lines (not by subtraction)
    assert order_pre.total_price == Decimal("50.00")  # surviving line = 50
    assert any(
        c["metadata"].get("action") == "remove_line_item"
        and c["metadata"].get("line_id") == str(line_id)
        for c in audit_calls
    )
    assert len(resp.line_items) == 1
    assert resp.line_items[0].id == surviving_line.id


@pytest.mark.asyncio
async def test_remove_line_item_blocked_on_non_draft_unit():
    """Plan 14-12 — DELETE 409 'not_draft' when order.status != 'draft'."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    from unittest.mock import patch

    from backend.api.routes.optical_order import remove_optical_order_line_item

    fake_query = MagicMock()
    fake_query.where = MagicMock(return_value=fake_query)
    fake_query.options = MagicMock(return_value=fake_query)

    order_id = uuid.uuid4()
    line_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    order_placed = SimpleNamespace(
        id=order_id,
        tenant_id=tenant_id,
        status="placed",
        line_items=[],
    )
    db = MagicMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=order_placed))
    )

    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    ctx = SimpleNamespace(tenant_id=tenant_id)

    with patch("backend.api.routes.optical_order.select", return_value=fake_query), \
         patch("backend.api.routes.optical_order.selectinload", return_value=MagicMock()), \
         pytest.raises(HTTPException) as exc:
        await remove_optical_order_line_item(
            order_id=order_id,
            line_id=line_id,
            request=request,
            ctx=ctx,
            db=db,
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "not_draft"


@pytest.mark.asyncio
async def test_remove_unknown_line_item_returns_404_unit():
    """Plan 14-12 — DELETE 404 when line_id is not present on the order."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    from unittest.mock import patch

    from backend.api.routes.optical_order import remove_optical_order_line_item

    fake_query = MagicMock()
    fake_query.where = MagicMock(return_value=fake_query)
    fake_query.options = MagicMock(return_value=fake_query)

    order_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    order_draft = SimpleNamespace(
        id=order_id,
        tenant_id=tenant_id,
        status="draft",
        line_items=[
            SimpleNamespace(
                id=uuid.uuid4(),
                product_id=uuid.uuid4(),
                qty=1,
                line_total=Decimal("10.00"),
            )
        ],
    )
    db = MagicMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=order_draft))
    )

    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    ctx = SimpleNamespace(tenant_id=tenant_id)

    with patch("backend.api.routes.optical_order.select", return_value=fake_query), \
         patch("backend.api.routes.optical_order.selectinload", return_value=MagicMock()), \
         pytest.raises(HTTPException) as exc:
        await remove_optical_order_line_item(
            order_id=order_id,
            line_id=uuid.uuid4(),  # bogus
            request=request,
            ctx=ctx,
            db=db,
        )
    assert exc.value.status_code == 404
