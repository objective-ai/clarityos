"""Phase 13 — Optical Order schemas (thin primitive; Phase 14 will extend).

All models inherit from CamelCaseModel so ``model_dump(by_alias=True)``
emits camelCase keys matching the TypeScript interfaces in
``types/opticalOrder.ts``. This contract is verified by
``backend/tests/test_optical_order_contract.py`` (INV-13).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import Field

from .common import CamelCaseModel


# --- Line items ---


class OpticalOrderLineItemCreate(CamelCaseModel):
    product_id: UUID
    qty: int = Field(default=1, gt=0)
    unit_price: Decimal


class OpticalOrderLineItemResponse(CamelCaseModel):
    id: UUID
    order_id: UUID
    product_id: UUID
    qty: int
    unit_price: Decimal
    line_total: Decimal
    created_at: datetime


# --- Order shapes ---


class OpticalOrderCreate(CamelCaseModel):
    patient_id: UUID
    encounter_id: Optional[UUID] = None  # null for walk-in retail
    line_items: list[OpticalOrderLineItemCreate]


class OpticalOrderResponse(CamelCaseModel):
    id: UUID
    tenant_id: UUID
    patient_id: UUID
    encounter_id: Optional[UUID] = None
    status: str
    total_price: Decimal
    created_by_id: UUID
    placed_at: Optional[datetime] = None
    dispensed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    line_items: list[OpticalOrderLineItemResponse]


# --- Action responses ---


class OpticalOrderActionWarning(CamelCaseModel):
    """Returned alongside OpticalOrderResponse on /place when zero-stock soft-block triggers."""

    code: Literal["zero_stock", "low_stock"]
    product_id: UUID
    message: str


class OpticalOrderPlaceResponse(CamelCaseModel):
    order: OpticalOrderResponse
    warnings: list[OpticalOrderActionWarning] = []
