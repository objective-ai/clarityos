"""
Tests for tenant_addons-aware entitlement checks (Phase 13-15 gap closure).

Proves:
1. `has_entitlement(plan_name, key, *, addon_keys=None)` honors add-ons.
2. `require_entitlement(...)` unions `tenant_addons.feature_key` when a
   session is present.
3. Back-compat: existing callers using `await dep(ctx)` (no `db` kwarg)
   continue to work — Optional `db` defaults to None.
"""
from __future__ import annotations

from uuid import UUID

import pytest
from fastapi import HTTPException

from backend.core.entitlements import (
    Entitlement,
    has_entitlement,
    require_entitlement,
)
from backend.core.security import TenantContext
from backend.db.models.public.saas import TenantAddon


# ──────────────────────────────────────────────────────────────────────────
# Test helpers
# ──────────────────────────────────────────────────────────────────────────


class RecordingSession:
    """Async-session test double that records the SQLAlchemy Select passed to .execute().

    We capture the actual Select object so tests can introspect
    column_descriptions to confirm the right entity was queried — beats
    SQL-text matching, no string fragility.
    """

    def __init__(self, scalar_rows: list[str]):
        self.scalar_rows = scalar_rows
        self.last_select = None  # the SQLAlchemy Select object

    async def execute(self, stmt):
        self.last_select = stmt

        class _Result:
            def __init__(self, rows):
                self._rows = rows

            def scalars(self):
                class _S:
                    def __init__(self, r):
                        self._r = r

                    def all(self):
                        return self._r

                return _S(self._rows)

        return _Result(self.scalar_rows)


def _ctx(plan_name: str = "Core") -> TenantContext:
    return TenantContext(
        user_id=UUID("00000000-0000-0000-0000-0000000000aa"),
        tenant_id=UUID("b0000000-0000-0000-0000-000000000001"),
        role="receptionist",
        plan_name=plan_name,
    )


# ──────────────────────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────────────────────


def test_has_entitlement_plan_features_unchanged_for_base_keys():
    """2-arg signature still works (back-compat for messaging tests)."""
    assert has_entitlement("Core", "scheduling") is True
    assert has_entitlement("Core", "retail_pos") is False


def test_has_entitlement_returns_true_when_addon_keys_contains_key():
    assert (
        has_entitlement("Core", "retail_pos", addon_keys={"retail_pos"})
        is True
    )
    assert (
        has_entitlement("Premium", "retail_pos", addon_keys=set())
        is False
    )
    # addon_keys=None unioning with empty set: plan grant wins.
    assert has_entitlement("Plus", "messaging", addon_keys=None) is True


@pytest.mark.asyncio
async def test_require_entitlement_unions_tenant_addons_when_db_present():
    rec = RecordingSession(scalar_rows=["retail_pos"])
    dep = require_entitlement(Entitlement.RETAIL_POS)
    ctx = _ctx(plan_name="Core")  # plan does NOT include retail_pos

    result = await dep(ctx, db=rec)

    assert result is ctx
    assert rec.last_select is not None, "Select statement should have been recorded"
    entity = rec.last_select.column_descriptions[0]["entity"]
    assert entity is TenantAddon, f"Expected TenantAddon, got {entity}"


@pytest.mark.asyncio
async def test_require_entitlement_returns_403_when_neither_plan_nor_addons_grant_key():
    rec = RecordingSession(scalar_rows=[])
    dep = require_entitlement(Entitlement.RETAIL_POS)
    ctx = _ctx(plan_name="Core")

    with pytest.raises(HTTPException) as exc_info:
        await dep(ctx, db=rec)

    assert exc_info.value.status_code == 403
    detail = exc_info.value.detail
    assert detail["entitlement"] == "retail_pos"
    assert detail["plan"] == "Core"


@pytest.mark.asyncio
async def test_require_entitlement_back_compat_no_db_kwarg_messaging():
    """Direct exercise of the back-compat call shape (await dep(ctx)).

    Mirrors backend/tests/messaging/test_routes_send.py:180 — proves the
    signature change does NOT break existing messaging tests.
    """
    dep = require_entitlement("messaging")

    # Plus has messaging via PLAN_FEATURES → fast path returns ctx.
    plus_ctx = _ctx(plan_name="Plus")
    result = await dep(plus_ctx)
    assert result is plus_ctx

    # Core lacks messaging; no db kwarg → addon_keys empty → 403.
    core_ctx = _ctx(plan_name="Core")
    with pytest.raises(HTTPException) as exc_info:
        await dep(core_ctx)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["entitlement"] == "messaging"
    assert exc_info.value.detail["plan"] == "Core"
