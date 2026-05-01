"""Phase 13 — Retail Inventory schemas.

Both request and response models inherit from CamelCaseModel so
``model_dump(by_alias=True)`` emits camelCase keys matching the
TypeScript interfaces in ``types/inventory.ts``. This contract is
verified by ``backend/tests/test_optical_order_contract.py`` (INV-13).

Pitfall 1 (see 13-RESEARCH.md / feedback_camelizekeys_nested.md):
the ``attributes`` JSONB column ships as a raw ``dict[str, Any]`` on
the wire, NOT as a typed Pydantic sub-model. The FrameAttributes /
ContactLensAttributes classes below are validation shapes used at the
route boundary, but nested keys MUST stay snake_case end-to-end so
``apiFetch``'s recursive ``camelizeKeys`` does not mangle JSONB keys.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import ConfigDict, Field

from .common import CamelCaseModel


# --- Attribute validation shapes (NOT the wire model — see Pitfall 1) ---


class FrameAttributes(CamelCaseModel):
    """Validation shape for Product.attributes when product_type == 'frame'.

    Nested keys remain snake_case on the wire (see Pitfall 1). We disable
    the inherited camelCase alias generator by overriding model_config.
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        extra="allow",
    )

    brand: str
    model: str
    color: Optional[str] = None
    eye_size: Optional[int] = None
    bridge_size: Optional[int] = None
    temple_size: Optional[int] = None
    gender: Optional[Literal["men", "women", "unisex", "kids"]] = None
    material: Optional[Literal["acetate", "metal", "titanium", "other"]] = None


class ContactLensAttributes(CamelCaseModel):
    """Validation shape for Product.attributes when product_type == 'contact_lens'.

    Nested keys remain snake_case on the wire (see Pitfall 1).
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        extra="allow",
    )

    brand: str
    modality: Literal["daily", "biweekly", "monthly"]
    base_curve: Optional[float] = None
    diameter: Optional[float] = None
    power: Optional[float] = None
    cylinder: Optional[float] = None
    axis: Optional[int] = None
    box_size: Optional[int] = None


# --- Product CRUD schemas ---


class ProductCreate(CamelCaseModel):
    product_type: Literal["frame", "contact_lens"]
    brand: str
    model: str
    sku: Optional[str] = None  # auto-generated server-side if absent
    upc: Optional[str] = None
    attributes: dict[str, Any]
    retail_price: Decimal
    cost_price: Optional[Decimal] = None
    stock_qty: int = 0
    reorder_threshold: int = 3
    is_active: bool = True


class ProductUpdate(CamelCaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    upc: Optional[str] = None
    attributes: Optional[dict[str, Any]] = None
    retail_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    reorder_threshold: Optional[int] = None
    is_active: Optional[bool] = None


class ProductResponse(CamelCaseModel):
    id: UUID
    tenant_id: UUID
    product_type: str
    brand: str
    model: str
    sku: str
    upc: Optional[str] = None
    attributes: dict[str, Any]
    retail_price: Decimal
    cost_price: Optional[Decimal] = None
    stock_qty: int
    reorder_threshold: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


# --- Stock-movement request schemas ---


class ReceiveStockRequest(CamelCaseModel):
    qty_received: int = Field(gt=0)
    po_reference: Optional[str] = None
    note: Optional[str] = None


class AdjustStockRequest(CamelCaseModel):
    qty_delta: int  # signed
    reason: Literal["manual_adjust"] = "manual_adjust"
    note: Optional[str] = None


# --- Filter shape (typing parity with FE; routes use Query() params) ---


class ProductListFilters(CamelCaseModel):
    """Reference shape — actual route uses Query() params; this exists for typing parity with FE."""

    product_type: Optional[Literal["frame", "contact_lens"]] = None
    search: Optional[str] = None
    stock_status: Optional[Literal["in_stock", "low", "out", "all"]] = "all"
    active_only: bool = True
    gender: Optional[str] = None
    modality: Optional[str] = None
