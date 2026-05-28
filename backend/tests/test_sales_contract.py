"""POS-16 — Pydantic `by_alias=True` snake↔camel contract test for SaleResponse + related schemas."""

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from backend.schemas.sales import (
    DailyCloseResponse,
    DailyCloseSummary,
    DailyCloseTotalsBucket,
    PaymentResponse,
    RefundResponse,
    SaleLineItemResponse,
    SaleResponse,
)

EXPECTED_SALE_KEYS = {
    "id",
    "tenantId",
    "patientId",
    "status",
    "subtotal",
    "tax",
    "discountTotal",
    "total",
    "receiptNumber",
    "receiptUrl",
    "notes",
    "openedAt",
    "closedAt",
    "createdAt",
    "updatedAt",
    "lines",
    "payments",
    "refunds",
    "remaining",
}
EXPECTED_LINE_KEYS = {
    "id",
    "saleId",
    "sourceType",
    "sourceId",
    "description",
    "qty",
    "unitPrice",
    "discountAmount",
    "discountReason",
    "taxable",
    "lineTotal",
    "createdAt",
    "updatedAt",
}
EXPECTED_PAYMENT_KEYS = {
    "id",
    "saleId",
    "method",
    "amount",
    "tendered",
    "changeDue",
    "processorPaymentId",
    "processorChargeId",
    "last4",
    "cardBrand",
    "authCode",
    "status",
    "reasonNote",
    "createdAt",
}
EXPECTED_REFUND_KEYS = {
    "id",
    "saleId",
    "totalAmount",
    "reason",
    "processorRefundId",
    "refundedById",
    "createdAt",
    "lineItems",
    "paymentRefunds",
}
EXPECTED_DAILY_CLOSE_KEYS = {
    "closeDate",
    "summary",
    "byMethod",
    "byCategory",
    "expectedCash",
    "countedCash",
    "variance",
    "stripePayoutEstimate",
    "runId",
    "runAt",
    "notes",
    "isClosed",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def test_sale_response_schema_uses_alias_generator():
    config = getattr(SaleResponse, "model_config", None)
    assert config is not None, "SaleResponse must declare model_config"
    assert config.get("alias_generator") is not None
    assert config.get("populate_by_name") is True


def test_sale_by_alias_camel_keys():
    s = SaleResponse(
        id=uuid4(),
        tenantId=uuid4(),
        patientId=uuid4(),
        status="open",
        subtotal=Decimal("0"),
        tax=Decimal("0"),
        discountTotal=Decimal("0"),
        total=Decimal("0"),
        receiptNumber=None,
        receiptUrl=None,
        notes=None,
        openedAt=_now(),
        closedAt=None,
        createdAt=_now(),
        updatedAt=_now(),
        lines=[],
        payments=[],
        refunds=[],
        remaining=Decimal("0"),
    )
    out = s.model_dump(by_alias=True)
    assert set(out.keys()) == EXPECTED_SALE_KEYS


def test_line_item_by_alias_camel_keys():
    li = SaleLineItemResponse(
        id=uuid4(),
        saleId=uuid4(),
        sourceType="adhoc",
        sourceId=None,
        description="x",
        qty=1,
        unitPrice=Decimal("1"),
        discountAmount=Decimal("0"),
        discountReason=None,
        taxable=True,
        lineTotal=Decimal("1"),
        createdAt=_now(),
        updatedAt=_now(),
    )
    assert set(li.model_dump(by_alias=True).keys()) == EXPECTED_LINE_KEYS


def test_payment_by_alias_camel_keys():
    p = PaymentResponse(
        id=uuid4(),
        saleId=uuid4(),
        method="cash",
        amount=Decimal("1"),
        tendered=None,
        changeDue=None,
        processorPaymentId=None,
        processorChargeId=None,
        last4=None,
        cardBrand=None,
        authCode=None,
        status="succeeded",
        reasonNote=None,
        createdAt=_now(),
    )
    assert set(p.model_dump(by_alias=True).keys()) == EXPECTED_PAYMENT_KEYS


def test_refund_by_alias_camel_keys():
    r = RefundResponse(
        id=uuid4(),
        saleId=uuid4(),
        totalAmount=Decimal("1"),
        reason="x",
        processorRefundId=None,
        refundedById=None,
        createdAt=_now(),
        lineItems=[],
        paymentRefunds=[],
    )
    assert set(r.model_dump(by_alias=True).keys()) == EXPECTED_REFUND_KEYS


def test_daily_close_by_alias_camel_keys():
    dc = DailyCloseResponse(
        closeDate=date.today(),
        summary=DailyCloseSummary(
            salesCount=0,
            gross=Decimal("0"),
            refunds=Decimal("0"),
            net=Decimal("0"),
        ),
        byMethod=[
            DailyCloseTotalsBucket(key="cash", count=0, total=Decimal("0"))
        ],
        byCategory=[
            DailyCloseTotalsBucket(key="retail", count=0, total=Decimal("0"))
        ],
        expectedCash=Decimal("0"),
    )
    assert set(dc.model_dump(by_alias=True).keys()) == EXPECTED_DAILY_CLOSE_KEYS
