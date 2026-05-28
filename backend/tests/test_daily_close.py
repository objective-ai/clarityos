"""POS-04 / POS-10 — daily-close aggregation + cash reconciliation."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_compute_daily_close_returns_documented_shape():
    """compute_daily_close returns the 5-section dict shape consumed by the
    route (Task 2) and by the PDF/CSV builders.
    """
    from backend.services.sale_lifecycle import compute_daily_close

    fake_db = AsyncMock()
    # Side-effect order mirrors compute_daily_close's query sequence:
    # 1) sales_summary (one())
    # 2) refunds_total (scalar_one())
    # 3) by_method (all())
    # 4) by_category (all())
    # 5) cash_received (scalar_one())
    # 6) cash_refund_returned (scalar_one())
    fake_db.execute = AsyncMock(
        side_effect=[
            MagicMock(
                one=MagicMock(
                    return_value=MagicMock(count=2, gross=Decimal("250.00"))
                )
            ),
            MagicMock(scalar_one=MagicMock(return_value=Decimal("0.00"))),
            MagicMock(
                all=MagicMock(
                    return_value=[
                        MagicMock(
                            method="cash",
                            count=1,
                            total=Decimal("100.00"),
                        ),
                        MagicMock(
                            method="stripe_card",
                            count=1,
                            total=Decimal("150.00"),
                        ),
                    ]
                )
            ),
            MagicMock(
                all=MagicMock(
                    return_value=[
                        MagicMock(
                            category="retail",
                            count=3,
                            total=Decimal("250.00"),
                        ),
                    ]
                )
            ),
            MagicMock(scalar_one=MagicMock(return_value=Decimal("100.00"))),
            MagicMock(scalar_one=MagicMock(return_value=Decimal("0.00"))),
        ]
    )

    result = await compute_daily_close(fake_db, uuid4(), date(2026, 5, 28))

    assert set(result.keys()) >= {
        "close_date",
        "sales_summary",
        "by_method",
        "by_category",
        "expected_cash",
        "stripe_payout_estimate",
    }
    assert result["sales_summary"] == {
        "count": 2,
        "gross": Decimal("250.00"),
        "refunds": Decimal("0.00"),
        "net": Decimal("250.00"),
    }
    assert len(result["by_method"]) == 2
    assert {m["key"] for m in result["by_method"]} == {"cash", "stripe_card"}
    assert result["expected_cash"] == Decimal("100.00")
    # 150 stripe - (150 * 0.029 + 0.30) = 150 - 4.65 = 145.35
    assert result["stripe_payout_estimate"] == Decimal("145.35")


@pytest.mark.asyncio
async def test_compute_daily_close_zero_day_yields_zero_estimate():
    """No stripe payments → stripe_payout_estimate is 0 (not None) so route
    serialization stays deterministic.
    """
    from backend.services.sale_lifecycle import compute_daily_close

    fake_db = AsyncMock()
    fake_db.execute = AsyncMock(
        side_effect=[
            MagicMock(
                one=MagicMock(
                    return_value=MagicMock(count=0, gross=Decimal("0.00"))
                )
            ),
            MagicMock(scalar_one=MagicMock(return_value=Decimal("0.00"))),
            MagicMock(all=MagicMock(return_value=[])),
            MagicMock(all=MagicMock(return_value=[])),
            MagicMock(scalar_one=MagicMock(return_value=Decimal("0.00"))),
            MagicMock(scalar_one=MagicMock(return_value=Decimal("0.00"))),
        ]
    )

    result = await compute_daily_close(fake_db, uuid4(), date(2026, 5, 28))
    assert result["sales_summary"]["count"] == 0
    assert result["expected_cash"] == Decimal("0.00")
    assert result["stripe_payout_estimate"] == Decimal("0.00")
    assert result["by_method"] == []
    assert result["by_category"] == []


def test_daily_close_run_unique_constraint():
    """The (tenant_id, close_date) UNIQUE constraint must be on the ORM table
    — POST /daily-close/ relies on IntegrityError → HTTP 409 for the
    duplicate-day gate (POS-10).
    """
    from sqlalchemy import UniqueConstraint

    from backend.db.models.tenant.clinical import DailyCloseRun

    uniques = [
        c
        for c in DailyCloseRun.__table__.constraints
        if isinstance(c, UniqueConstraint)
    ]
    assert any(
        {"tenant_id", "close_date"}.issubset({col.name for col in u.columns})
        for u in uniques
    ), (
        "DailyCloseRun missing UNIQUE(tenant_id, close_date); "
        f"got constraints: {[c.name for c in DailyCloseRun.__table__.constraints]}"
    )
