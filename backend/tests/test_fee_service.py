"""backend/tests/test_fee_service.py — fee resolution coverage.

Closes audit gap #6 (2026-05-01): the three Wave 0 skip-stubs left over
from plan 09-02 are promoted to live tests using `AsyncMock` on the
SQLAlchemy session. No real DB needed — `resolve_line_item_fee` is a
thin two-query function whose only behavior is the payer-rate vs.
base-rate fallback logic.

Pinned invariants:
  1. Payer override wins when present (one query).
  2. Falls back to base catalog when payer override absent (two queries).
  3. payer_id=None skips the payer query entirely (one query).
  4. Returns (Decimal("0.00"), "base_rate") when no catalog entry exists.
  5. Every query filters by tenant_id — silent regression here would
     leak another tenant's negotiated payer rates.
  6. Return type is `Decimal`, not `float` — fees flow into the superbill
     line-item totals, where float drift would compound.

A real-DB integration test (with FeeScheduleItem fixtures) is left as a
Wave 1 stub at the bottom for once `db_session` lands.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from backend.services.fee_service import resolve_line_item_fee


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _execute_returning(items):
    """Build an AsyncMock for `db.execute` whose successive calls return
    Result objects whose `scalar_one_or_none()` yields each item in turn.

    `items` is a list — pass [payer_row, base_row] to simulate the two
    queries the function may make. A `None` element means "no row found".
    """
    results = []
    for item in items:
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=item)
        results.append(result)
    return AsyncMock(side_effect=results)


def _fake_fee_item(fee: Decimal) -> MagicMock:
    """Stand-in for a FeeScheduleItem ORM row. Only `.fee` is read."""
    item = MagicMock()
    item.fee = fee
    return item


def _where_columns(stmt) -> list[str]:
    """Return the column names referenced in the WHERE clause of a Select.

    We avoid `str(stmt)` / `stmt.compile()` because that triggers full
    mapper configuration, which fails when the entire ORM graph isn't
    loaded (the unrelated `IntakeToken` mapper is the usual offender in
    this repo's test runs). Walking `whereclause.clauses` directly is
    enough to verify the filter shape.
    """
    where = stmt.whereclause
    clauses = where.clauses if hasattr(where, "clauses") else [where]
    return [getattr(c.left, "name", "?") for c in clauses]


def _is_null_operator(stmt, column_name: str) -> bool:
    """True iff `column_name` is filtered with `IS NULL`."""
    where = stmt.whereclause
    clauses = where.clauses if hasattr(where, "clauses") else [where]
    for c in clauses:
        if getattr(c.left, "name", None) == column_name:
            return getattr(c, "operator", None) is not None and (
                c.operator.__name__ == "is_"
            )
    return False


def _executed_statements(execute_mock: AsyncMock) -> list:
    """Return the Select arg from each db.execute(...) call."""
    return [call.args[0] for call in execute_mock.await_args_list]


# ---------------------------------------------------------------------------
# 1. Payer override wins when present
# ---------------------------------------------------------------------------


class TestPayerRate:
    async def test_returns_payer_rate_when_payer_override_exists(self):
        payer_fee = Decimal("75.50")
        db = MagicMock()
        db.execute = _execute_returning([_fake_fee_item(payer_fee)])

        fee, source = await resolve_line_item_fee(
            cpt_code="92014",
            payer_id=uuid4(),
            tenant_id=uuid4(),
            db=db,
        )

        assert fee == payer_fee
        assert source == "payer_rate"
        # Only the payer-specific query ran — base-rate fallback never executed.
        assert db.execute.await_count == 1

    async def test_payer_rate_query_filters_by_payer_and_tenant(self):
        # Multitenancy invariant: the WHERE clause must constrain the
        # query to this tenant's negotiated rate. A regression here would
        # leak Aetna's contract pricing across clinics.
        db = MagicMock()
        db.execute = _execute_returning([_fake_fee_item(Decimal("100"))])
        await resolve_line_item_fee(
            cpt_code="92014",
            payer_id=uuid4(),
            tenant_id=uuid4(),
            db=db,
        )
        cols = _where_columns(_executed_statements(db.execute)[0])
        assert "tenant_id" in cols
        assert "payer_id" in cols
        assert "cpt_code" in cols


# ---------------------------------------------------------------------------
# 2. Base rate fallback
# ---------------------------------------------------------------------------


class TestBaseRateFallback:
    async def test_falls_back_to_base_when_no_payer_override(self):
        # payer_id is provided but no FeeScheduleItem exists for that
        # payer — must fall through to the base catalog (payer_id IS NULL).
        base_fee = Decimal("60.00")
        db = MagicMock()
        db.execute = _execute_returning([None, _fake_fee_item(base_fee)])

        fee, source = await resolve_line_item_fee(
            cpt_code="92014",
            payer_id=uuid4(),
            tenant_id=uuid4(),
            db=db,
        )

        assert fee == base_fee
        assert source == "base_rate"
        assert db.execute.await_count == 2  # payer query + base query

    async def test_skips_payer_query_when_payer_id_is_none(self):
        # Self-pay path — caller passed payer_id=None. Should NOT run the
        # payer-specific query; goes straight to base catalog.
        base_fee = Decimal("60.00")
        db = MagicMock()
        db.execute = _execute_returning([_fake_fee_item(base_fee)])

        fee, source = await resolve_line_item_fee(
            cpt_code="92014",
            payer_id=None,
            tenant_id=uuid4(),
            db=db,
        )

        assert fee == base_fee
        assert source == "base_rate"
        assert db.execute.await_count == 1

    async def test_base_query_filters_by_null_payer_and_tenant(self):
        # The base-catalog query must filter `payer_id IS NULL` AND
        # `tenant_id == ctx.tenant_id`. Without the IS NULL, the query
        # would non-deterministically pick any FeeScheduleItem for the
        # CPT code; without tenant_id, it'd cross tenants.
        db = MagicMock()
        db.execute = _execute_returning([_fake_fee_item(Decimal("60"))])
        await resolve_line_item_fee(
            cpt_code="92014",
            payer_id=None,
            tenant_id=uuid4(),
            db=db,
        )
        stmt = _executed_statements(db.execute)[0]
        cols = _where_columns(stmt)
        assert "tenant_id" in cols
        assert "payer_id" in cols
        assert "cpt_code" in cols
        assert _is_null_operator(stmt, "payer_id"), (
            "Base catalog query must filter `payer_id IS NULL`, not `== None`"
        )


# ---------------------------------------------------------------------------
# 3. Empty catalog — last-line-of-defense default
# ---------------------------------------------------------------------------


class TestNoCatalogEntry:
    async def test_returns_zero_when_neither_payer_nor_base_has_entry(self):
        db = MagicMock()
        db.execute = _execute_returning([None, None])

        fee, source = await resolve_line_item_fee(
            cpt_code="99999",  # nonsense CPT
            payer_id=uuid4(),
            tenant_id=uuid4(),
            db=db,
        )

        assert fee == Decimal("0.00")
        assert source == "base_rate"
        assert db.execute.await_count == 2

    async def test_returns_zero_when_payer_id_none_and_base_missing(self):
        db = MagicMock()
        db.execute = _execute_returning([None])

        fee, source = await resolve_line_item_fee(
            cpt_code="99999",
            payer_id=None,
            tenant_id=uuid4(),
            db=db,
        )

        assert fee == Decimal("0.00")
        assert source == "base_rate"
        assert db.execute.await_count == 1


# ---------------------------------------------------------------------------
# 4. Type guarantees — Decimal, not float
# ---------------------------------------------------------------------------


class TestReturnTypes:
    async def test_payer_rate_returns_decimal(self):
        db = MagicMock()
        db.execute = _execute_returning([_fake_fee_item(Decimal("75.50"))])
        fee, _ = await resolve_line_item_fee(
            cpt_code="92014",
            payer_id=uuid4(),
            tenant_id=uuid4(),
            db=db,
        )
        # Decimal — not float. The superbill total accumulates these,
        # and float drift would compound across line items.
        assert isinstance(fee, Decimal)

    async def test_zero_default_returns_decimal(self):
        db = MagicMock()
        db.execute = _execute_returning([None, None])
        fee, _ = await resolve_line_item_fee(
            cpt_code="99999",
            payer_id=uuid4(),
            tenant_id=uuid4(),
            db=db,
        )
        assert isinstance(fee, Decimal)
        assert fee == Decimal("0.00")

    async def test_fee_source_is_one_of_two_known_values(self):
        # The literal-string contract: callers (the superbill writer)
        # branch on this value. Pin it so a future "self_pay" string is
        # an intentional API change, not silent.
        valid = {"payer_rate", "base_rate"}

        # All three code paths
        for items in ([_fake_fee_item(Decimal("1"))], [None, _fake_fee_item(Decimal("1"))], [None, None]):
            db = MagicMock()
            db.execute = _execute_returning(items)
            _, source = await resolve_line_item_fee(
                cpt_code="92014",
                payer_id=uuid4(),
                tenant_id=uuid4(),
                db=db,
            )
            assert source in valid


# ---------------------------------------------------------------------------
# 5. Wave 1 integration stub — promote when db_session lands
# ---------------------------------------------------------------------------


class TestFeeServiceIntegration:
    """End-to-end against a real Postgres + FeeScheduleItem fixture."""

    def test_concurrent_resolution_isolated_per_tenant(self, db_session):
        # Two tenants with the SAME cpt_code in their fee schedule must
        # never see each other's negotiated rate. The unit tests above
        # assert the WHERE clause shape — this assert it through the
        # ORM/Postgres layer end-to-end.
        pytest.skip("Wave 0 — integration test requires real db_session + FeeScheduleItem factory")
