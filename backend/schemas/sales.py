"""Pydantic schemas for Phase 15 Sale ledger (POS-01, POS-16).

All Decimal fields serialize as STRING in JSON (matches TS interface).
All wire keys camelCase via CamelCaseModel.by_alias.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field

from backend.schemas.common import CamelCaseModel

SaleStatusLiteral = Literal["open", "paid", "refunded", "voided"]
PaymentMethodLiteral = Literal["cash", "stripe_card", "external_card", "write_off"]
PaymentStatusLiteral = Literal[
    "pending", "succeeded", "failed", "refunded", "partial_refund"
]
SaleSourceLiteral = Literal["superbill", "optical_order", "product", "adhoc"]


# ---------- Line item ----------


class SaleLineItemBase(CamelCaseModel):
    source_type: SaleSourceLiteral
    source_id: UUID | None = None
    description: str = Field(max_length=500)
    qty: int = Field(ge=1)
    unit_price: Decimal
    discount_amount: Decimal = Decimal("0.00")
    discount_reason: str | None = Field(default=None, max_length=200)
    taxable: bool = True


class SaleLineItemCreate(SaleLineItemBase):
    pass


class SaleLineItemUpdate(CamelCaseModel):
    description: str | None = Field(default=None, max_length=500)
    qty: int | None = Field(default=None, ge=1)
    unit_price: Decimal | None = None
    discount_amount: Decimal | None = None
    discount_reason: str | None = Field(default=None, max_length=200)
    taxable: bool | None = None


class SaleLineItemResponse(SaleLineItemBase):
    id: UUID
    sale_id: UUID
    line_total: Decimal
    created_at: datetime
    updated_at: datetime


# ---------- Sale ----------


class SalePrefillItem(CamelCaseModel):
    kind: Literal["superbill", "optical_order"]
    source_id: UUID


class SaleCreate(CamelCaseModel):
    patient_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=1000)
    prefill: list[SalePrefillItem] = Field(default_factory=list)


class SaleResponse(CamelCaseModel):
    id: UUID
    tenant_id: UUID
    patient_id: UUID | None
    status: SaleStatusLiteral
    subtotal: Decimal
    tax: Decimal
    discount_total: Decimal
    total: Decimal
    receipt_number: str | None
    receipt_url: str | None
    notes: str | None
    opened_at: datetime
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    lines: list[SaleLineItemResponse] = Field(default_factory=list)
    payments: list["PaymentResponse"] = Field(default_factory=list)
    refunds: list["RefundResponse"] = Field(default_factory=list)
    remaining: Decimal = Decimal("0.00")  # computed: total - sum(succeeded payments)


# ---------- Payment ----------


class PaymentCreate(CamelCaseModel):
    method: PaymentMethodLiteral
    amount: Decimal
    tendered: Decimal | None = None
    change_due: Decimal | None = None
    last4: str | None = Field(default=None, max_length=4)
    auth_code: str | None = Field(default=None, max_length=20)
    reason_note: str | None = Field(default=None, max_length=500)


class StripeConfirmRequest(CamelCaseModel):
    payment_intent_id: str = Field(min_length=1, max_length=128)


class StripeIntentResponse(CamelCaseModel):
    payment_id: UUID
    client_secret: str
    publishable_key: str
    intent_id: str


class PaymentResponse(CamelCaseModel):
    id: UUID
    sale_id: UUID
    method: PaymentMethodLiteral
    amount: Decimal
    tendered: Decimal | None
    change_due: Decimal | None
    processor_payment_id: str | None
    processor_charge_id: str | None
    last4: str | None
    card_brand: str | None
    auth_code: str | None
    status: PaymentStatusLiteral
    reason_note: str | None
    created_at: datetime


# ---------- Refund ----------


class RefundLineSpec(CamelCaseModel):
    sale_line_item_id: UUID
    qty: int = Field(ge=1)
    amount: Decimal


class RefundPaymentSpec(CamelCaseModel):
    payment_id: UUID
    amount: Decimal


class RefundCreate(CamelCaseModel):
    line_refunds: list[RefundLineSpec] = Field(min_length=1)
    payment_refunds: list[RefundPaymentSpec] = Field(min_length=1)
    reason: str = Field(min_length=3, max_length=500)


class RefundLineItemResponse(CamelCaseModel):
    id: UUID
    refund_id: UUID
    sale_line_item_id: UUID
    qty: int
    amount: Decimal


class RefundPaymentResponse(CamelCaseModel):
    id: UUID
    refund_id: UUID
    payment_id: UUID
    amount: Decimal
    processor_refund_id: str | None


class RefundResponse(CamelCaseModel):
    id: UUID
    sale_id: UUID
    total_amount: Decimal
    reason: str
    processor_refund_id: str | None
    refunded_by_id: UUID | None
    created_at: datetime
    line_items: list[RefundLineItemResponse] = Field(default_factory=list)
    payment_refunds: list[RefundPaymentResponse] = Field(default_factory=list)


# ---------- Daily Close ----------


class DailyCloseRequest(CamelCaseModel):
    close_date: date
    counted_cash: Decimal
    notes: str | None = Field(default=None, max_length=1000)


class DailyCloseTotalsBucket(CamelCaseModel):
    key: str
    count: int
    total: Decimal


class DailyCloseSummary(CamelCaseModel):
    sales_count: int
    gross: Decimal
    refunds: Decimal
    net: Decimal


class DailyCloseResponse(CamelCaseModel):
    close_date: date
    summary: DailyCloseSummary
    by_method: list[DailyCloseTotalsBucket]
    by_category: list[DailyCloseTotalsBucket]
    expected_cash: Decimal
    counted_cash: Decimal | None = None
    variance: Decimal | None = None
    stripe_payout_estimate: Decimal | None = None
    run_id: UUID | None = None
    run_at: datetime | None = None
    notes: str | None = None
    is_closed: bool = False


# ---------- Admin Stripe config ----------


class PaymentConfigUpdate(CamelCaseModel):
    stripe_publishable_key: str | None = Field(default=None, max_length=128)
    stripe_secret_key: str | None = Field(default=None, min_length=10, max_length=256)
    stripe_webhook_secret: str | None = Field(
        default=None, min_length=10, max_length=256
    )


class PaymentConfigResponse(CamelCaseModel):
    stripe_publishable_key: str | None
    has_secret_key: bool
    has_webhook_secret: bool
    sales_tax_rate: Decimal


SaleResponse.model_rebuild()
