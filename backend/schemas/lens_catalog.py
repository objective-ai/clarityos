"""Phase 14 — Lens reference catalog Pydantic schemas (admin-managed).

Mirrors the Phase 13 ProductCreate/Update/Response pattern. All schemas
inherit ``CamelCaseModel`` so ``model_dump(by_alias=True)`` emits camelCase
keys matching the TypeScript interfaces in ``types/lensCatalog.ts``. The
OPT14-17 contract test in ``backend/tests/test_optical_order_contract.py``
snapshots the wire shape so FE/BE stay in lock-step.

``Decimal`` fields (refractive_index) serialize to JSON string by default in
Pydantic v2 — matches the Phase 13-03 TS convention (``retailPrice: string``).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import Field

from .common import CamelCaseModel


# ---------------------------------------------------------------------------
# LensType — Single Vision / Bifocal / Progressive / Reading
# ---------------------------------------------------------------------------


class LensTypeBase(CamelCaseModel):
    name: str = Field(min_length=1, max_length=50)
    requires_seg_height: bool = False
    requires_vertex: bool = False
    display_order: int = 0


class LensTypeCreate(LensTypeBase):
    pass


class LensTypeUpdate(CamelCaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    requires_seg_height: Optional[bool] = None
    requires_vertex: Optional[bool] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class LensTypeResponse(LensTypeBase):
    id: UUID
    tenant_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# LensMaterial — CR-39, polycarbonate, trivex, hi-index 1.67/1.74/1.80, …
# refractive_index range follows real optical materials (1.49 CR-39 …
# 1.80 hi-index). abbe_value caps at 100 (Abbe number is dimensionless;
# real materials fall in the 25-60 range, headroom for novel materials).
# ---------------------------------------------------------------------------


class LensMaterialBase(CamelCaseModel):
    name: str = Field(min_length=1, max_length=50)
    refractive_index: Optional[Decimal] = Field(
        default=None, ge=Decimal("1.00"), le=Decimal("2.00")
    )
    abbe_value: Optional[int] = Field(default=None, ge=10, le=100)
    display_order: int = 0


class LensMaterialCreate(LensMaterialBase):
    pass


class LensMaterialUpdate(CamelCaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    refractive_index: Optional[Decimal] = Field(
        default=None, ge=Decimal("1.00"), le=Decimal("2.00")
    )
    abbe_value: Optional[int] = Field(default=None, ge=10, le=100)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class LensMaterialResponse(LensMaterialBase):
    id: UUID
    tenant_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# LensCoating — AR, UV, blue light, photochromic, polarized, scratch, mirror
# Category segments treatments vs tints vs finishes for grouped configurator
# display; matches the migration 0019 CheckConstraint.
# ---------------------------------------------------------------------------


CoatingCategory = Literal["treatment", "tint", "finish"]


class LensCoatingBase(CamelCaseModel):
    name: str = Field(min_length=1, max_length=50)
    category: Optional[CoatingCategory] = None
    display_order: int = 0


class LensCoatingCreate(LensCoatingBase):
    pass


class LensCoatingUpdate(CamelCaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    category: Optional[CoatingCategory] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class LensCoatingResponse(LensCoatingBase):
    id: UUID
    tenant_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
