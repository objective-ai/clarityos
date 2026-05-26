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
