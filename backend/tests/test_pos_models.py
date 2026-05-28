"""POS-12 — ORM models for Sale/SaleLineItem/Payment/Refund/RefundLineItem/RefundPayment + DailyCloseRun + StripeWebhookEvent."""

import pytest

try:
    from backend.db.models.tenant.clinical import (  # noqa: F401
        DailyCloseRun,
        Payment,
        Refund,
        RefundLineItem,
        RefundPayment,
        Sale,
        SaleLineItem,
        StripeWebhookEvent,
    )
except ImportError:
    pytest.skip(
        "POS ORM models not yet implemented (Plan 15-01)",
        allow_module_level=True,
    )


def test_sale_status_enum_values():
    from backend.db.models.tenant.clinical import SaleStatus

    assert {"open", "paid", "refunded", "voided"} == {s.value for s in SaleStatus}


def test_payment_method_enum_values():
    from backend.db.models.tenant.clinical import PaymentMethod

    assert {"cash", "stripe_card", "external_card", "write_off"} == {
        s.value for s in PaymentMethod
    }


def test_sale_line_item_source_type_enum():
    from backend.db.models.tenant.clinical import SaleLineItemSourceType

    assert {"superbill", "optical_order", "product", "adhoc"} == {
        s.value for s in SaleLineItemSourceType
    }
