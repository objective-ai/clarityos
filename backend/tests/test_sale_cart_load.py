"""POS-01, POS-14 — cart prefill from Superbill (copay derivation) + OpticalOrder (line snapshot)."""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

pytestmark = pytest.mark.asyncio


def _fake_db():
    m = MagicMock()
    m.add = MagicMock()
    m.flush = AsyncMock()
    m.execute = AsyncMock()
    return m


async def test_copay_from_insurance():
    from backend.services.sale_lifecycle import prefill_from_superbill

    db = _fake_db()
    sale = MagicMock(id=uuid4(), tenant_id=uuid4())
    superbill = MagicMock(
        id=uuid4(),
        patient_id=uuid4(),
        billed_payer_id=uuid4(),
        total_fee=Decimal("250.00"),
        encounter=MagicMock(encounter_date=None),
    )
    ins = MagicMock(copay_amount=Decimal("20.00"))
    db.execute = AsyncMock(
        side_effect=[
            MagicMock(scalar_one=MagicMock(return_value=superbill)),
            MagicMock(scalar_one_or_none=MagicMock(return_value=ins)),
        ]
    )
    line = await prefill_from_superbill(db, sale, superbill.id)
    assert line.unit_price == Decimal("20.00")
    assert line.line_total == Decimal("20.00")
    assert line.taxable is False
    assert line.source_type == "superbill"
    assert line.source_id == superbill.id


async def test_copay_self_pay_fallback():
    from backend.services.sale_lifecycle import prefill_from_superbill

    db = _fake_db()
    sale = MagicMock(id=uuid4(), tenant_id=uuid4())
    superbill = MagicMock(
        id=uuid4(),
        patient_id=uuid4(),
        billed_payer_id=None,
        total_fee=Decimal("250.00"),
        encounter=MagicMock(encounter_date=None),
    )
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one=MagicMock(return_value=superbill))
    )
    line = await prefill_from_superbill(db, sale, superbill.id)
    assert line.unit_price == Decimal("250.00")
    assert line.line_total == Decimal("250.00")
    assert line.taxable is False
    assert line.source_type == "superbill"
