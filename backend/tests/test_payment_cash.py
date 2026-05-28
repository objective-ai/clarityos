"""POS-02 — cash payment branch: tendered + change_due math."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

pytestmark = pytest.mark.asyncio


def _ctx():
    return SimpleNamespace(tenant_id=uuid4(), role="receptionist")


def _sale():
    return SimpleNamespace(id=uuid4(), tenant_id=uuid4(), patient_id=None)


def _db():
    db = MagicMock()
    db.add = MagicMock()
    return db


async def test_cash_change_due_computed():
    from backend.api.routes.sale_payments import _record_cash_payment

    body = SimpleNamespace(
        method="cash",
        amount=Decimal("30.00"),
        tendered=Decimal("50.00"),
        change_due=None,
        last4=None,
        auth_code=None,
        reason_note=None,
    )
    staff = MagicMock(id=uuid4())
    payment = await _record_cash_payment(body, _sale(), staff, _ctx(), _db())
    assert payment.amount == Decimal("30.00")
    assert payment.tendered == Decimal("50.00")
    assert payment.change_due == Decimal("20.00")
    assert payment.status == "succeeded"
    assert payment.method == "cash"


async def test_cash_tendered_below_amount_400():
    from fastapi import HTTPException

    from backend.api.routes.sale_payments import _record_cash_payment

    body = SimpleNamespace(
        method="cash",
        amount=Decimal("30.00"),
        tendered=Decimal("20.00"),
        change_due=None,
        last4=None,
        auth_code=None,
        reason_note=None,
    )
    with pytest.raises(HTTPException) as ei:
        await _record_cash_payment(body, _sale(), MagicMock(id=uuid4()), _ctx(), _db())
    assert ei.value.status_code == 400


async def test_cash_no_tendered_400():
    from fastapi import HTTPException

    from backend.api.routes.sale_payments import _record_cash_payment

    body = SimpleNamespace(
        method="cash",
        amount=Decimal("30.00"),
        tendered=None,
        change_due=None,
        last4=None,
        auth_code=None,
        reason_note=None,
    )
    with pytest.raises(HTTPException) as ei:
        await _record_cash_payment(body, _sale(), MagicMock(id=uuid4()), _ctx(), _db())
    assert ei.value.status_code == 400
