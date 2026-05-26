"""Phase 14 — Optical Order Configuration: lens reference catalog CRUD tests.

Plan 14-02 lands the lens_catalog routes; this file replaces the
Plan 14-00 skip-stubs with real assertions. Each test invokes the route
handler directly with the conftest `db_session` + `tenant_context`
fixtures. Until those fixtures graduate from Wave-0 skip-stubs to real
async-session + TenantContext factories, tests skip at fixture resolution
(matches the Phase 13 inventory test pattern).
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import select

from backend.api.routes.lens_catalog import (
    create_lens_coating,
    create_lens_material,
    create_lens_type,
    deactivate_lens_type,
    get_lens_type,
    list_lens_types,
    update_lens_type,
)
from backend.db.models.tenant.clinical import (
    AuditAction,
    AuditLog,
    LensCoating,
    LensMaterial,
    LensType,
)
from backend.schemas.lens_catalog import (
    LensCoatingCreate,
    LensMaterialCreate,
    LensTypeCreate,
    LensTypeUpdate,
)


class _FakeRequest:
    """Minimal stand-in for FastAPI's Request — the routes only read .client.host."""

    class _Client:
        host = "127.0.0.1"

    client = _Client()


@pytest.mark.asyncio
async def test_create_lens_type(db_session, tenant_context):
    """OPT14-03 — POST /lens-catalog/types/ creates a LensType row + audit row."""
    payload = LensTypeCreate(
        name="Progressive",
        requires_seg_height=True,
        requires_vertex=True,
        display_order=2,
    )
    row = await create_lens_type(
        payload, request=_FakeRequest(), ctx=tenant_context, db=db_session
    )
    assert row.name == "Progressive"
    assert row.requires_seg_height is True
    assert row.requires_vertex is True
    assert row.tenant_id == tenant_context.tenant_id

    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == AuditAction.LENS_TYPE_CREATE.value,
                AuditLog.resource_id == row.id,
            )
        )
    ).scalar_one_or_none()
    assert audit is not None, "Expected primary-TXN audit row for LENS_TYPE_CREATE"


@pytest.mark.asyncio
async def test_create_lens_material(db_session, tenant_context):
    """OPT14-03 — POST /lens-catalog/materials/ creates a LensMaterial row."""
    payload = LensMaterialCreate(
        name="Polycarbonate",
        refractive_index=Decimal("1.59"),
        abbe_value=30,
        display_order=1,
    )
    row = await create_lens_material(
        payload, request=_FakeRequest(), ctx=tenant_context, db=db_session
    )
    assert row.name == "Polycarbonate"
    assert row.refractive_index == Decimal("1.59")
    assert row.abbe_value == 30

    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == AuditAction.LENS_MATERIAL_CREATE.value,
                AuditLog.resource_id == row.id,
            )
        )
    ).scalar_one_or_none()
    assert audit is not None


@pytest.mark.asyncio
async def test_create_lens_coating(db_session, tenant_context):
    """OPT14-03 — POST /lens-catalog/coatings/ creates a LensCoating row."""
    payload = LensCoatingCreate(name="Anti-reflective", category="treatment")
    row = await create_lens_coating(
        payload, request=_FakeRequest(), ctx=tenant_context, db=db_session
    )
    assert row.name == "Anti-reflective"
    assert row.category == "treatment"

    audit = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == AuditAction.LENS_COATING_CREATE.value,
                AuditLog.resource_id == row.id,
            )
        )
    ).scalar_one_or_none()
    assert audit is not None


@pytest.mark.asyncio
async def test_partial_unique_index_allows_inactive_duplicate(
    db_session, tenant_context
):
    """OPT14-08 / mirrors Phase 13 INV-07 — partial unique on (tenant_id, name) WHERE
    is_active = true permits an inactive duplicate."""
    first = await create_lens_type(
        LensTypeCreate(name="Progressive", requires_seg_height=True),
        request=_FakeRequest(),
        ctx=tenant_context,
        db=db_session,
    )
    await update_lens_type(
        first.id,
        LensTypeUpdate(is_active=False),
        request=_FakeRequest(),
        ctx=tenant_context,
        db=db_session,
    )
    # Second active "Progressive" succeeds because the first one is now inactive.
    second = await create_lens_type(
        LensTypeCreate(name="Progressive", requires_seg_height=True),
        request=_FakeRequest(),
        ctx=tenant_context,
        db=db_session,
    )
    assert second.id != first.id
    assert second.name == first.name == "Progressive"
    assert second.is_active is True


@pytest.mark.asyncio
async def test_soft_delete_keeps_history(db_session, tenant_context):
    """OPT14-03 — DELETE flips is_active=false; row remains for historical orders."""
    row = await create_lens_type(
        LensTypeCreate(name="Bifocal", requires_seg_height=True),
        request=_FakeRequest(),
        ctx=tenant_context,
        db=db_session,
    )
    await deactivate_lens_type(
        row.id, request=_FakeRequest(), ctx=tenant_context, db=db_session
    )
    # Direct fetch must still return the row (soft-delete, not hard-delete).
    fetched = await get_lens_type(
        row.id, ctx=tenant_context, db=db_session
    )
    assert fetched.id == row.id
    assert fetched.is_active is False

    # Default list excludes inactive.
    actives = await list_lens_types(
        include_inactive=False, ctx=tenant_context, db=db_session
    )
    assert all(r.id != row.id for r in actives)

    # include_inactive=True returns the row.
    everything = await list_lens_types(
        include_inactive=True, ctx=tenant_context, db=db_session
    )
    assert any(r.id == row.id for r in everything)
