"""POS-11 — write-off payments require non-empty reason_note (gated on RECORD_WRITE_OFF)."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

pytestmark = pytest.mark.asyncio


def _ctx():
    return SimpleNamespace(tenant_id=uuid4(), role="admin")


def _sale():
    return SimpleNamespace(id=uuid4(), tenant_id=uuid4(), patient_id=None)


def _db():
    db = MagicMock()
    db.add = MagicMock()
    return db


def _body(reason_note, amount="100.00"):
    return SimpleNamespace(
        method="write_off",
        amount=Decimal(amount),
        tendered=None,
        change_due=None,
        last4=None,
        auth_code=None,
        reason_note=reason_note,
    )


async def test_writeoff_requires_reason_note():
    from fastapi import HTTPException

    from backend.api.routes.sale_payments import _record_writeoff

    with pytest.raises(HTTPException) as ei:
        await _record_writeoff(
            _body(None), _sale(), MagicMock(id=uuid4()), _ctx(), _db()
        )
    assert ei.value.status_code == 400
    assert "reason" in ei.value.detail.lower()


async def test_writeoff_empty_reason_400():
    from fastapi import HTTPException

    from backend.api.routes.sale_payments import _record_writeoff

    with pytest.raises(HTTPException) as ei:
        await _record_writeoff(
            _body("   "), _sale(), MagicMock(id=uuid4()), _ctx(), _db()
        )
    assert ei.value.status_code == 400


async def test_writeoff_succeeds_with_reason():
    from backend.api.routes.sale_payments import _record_writeoff

    payment = await _record_writeoff(
        _body("Insurance contractual write-off — Aetna negotiated rate"),
        _sale(),
        MagicMock(id=uuid4()),
        _ctx(),
        _db(),
    )
    assert payment.method == "write_off"
    assert payment.status == "succeeded"
    assert "Aetna" in payment.reason_note
    assert payment.amount == Decimal("100.00")


def test_payment_create_schema_exists():
    """Sanity check: PaymentCreate still importable (kept from Wave-0 stub)."""
    from backend.schemas.sales import PaymentCreate

    assert PaymentCreate is not None
