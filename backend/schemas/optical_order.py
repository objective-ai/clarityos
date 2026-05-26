"""Phase 13 — Optical Order schemas (thin primitive; Phase 14 will extend).

All models inherit from CamelCaseModel so ``model_dump(by_alias=True)``
emits camelCase keys matching the TypeScript interfaces in
``types/opticalOrder.ts``. This contract is verified by
``backend/tests/test_optical_order_contract.py`` (INV-13).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import AliasChoices, Field

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
    # Phase 14 — per-line lens configuration. dict[str, Any] preserves
    # snake_case JSONB nested keys end-to-end (Pitfall 1).
    lens_config: dict[str, Any] | None = Field(
        default=None,
        validation_alias=AliasChoices("lens_config", "lens_config_jsonb"),
    )


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
    # Phase 14 — configurator extensions. JSONB dicts ship as dict[str, Any]
    # so apiFetch's camelizeKeys does NOT mangle snake_case nested keys
    # (Pitfall 1; mirrors Product.attributes precedent).
    vision_plan: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("vision_plan", "vision_plan_jsonb"),
    )
    fitting: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("fitting", "fitting_jsonb"),
    )
    suggestion_resolutions: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices(
            "suggestion_resolutions", "suggestion_resolutions_jsonb"
        ),
    )
    final_refraction_id: UUID | None = None
    habitual_refraction_id: UUID | None = None
    job_ticket_generated_at: datetime | None = None


# --- Action responses ---


class OpticalOrderActionWarning(CamelCaseModel):
    """Returned alongside OpticalOrderResponse on /place when zero-stock soft-block triggers."""

    code: Literal["zero_stock", "low_stock"]
    product_id: UUID
    message: str


class OpticalOrderPlaceResponse(CamelCaseModel):
    order: OpticalOrderResponse
    warnings: list[OpticalOrderActionWarning] = []


# --- Phase 14 PATCH request shapes -----------------------------------------


class PatchOpticalOrderLineItem(CamelCaseModel):
    """Per-line patch — caller identifies the line by id and provides the
    new lens_config (JSONB pass-through, snake_case keys preserved)."""

    id: UUID
    lens_config: dict[str, Any] | None = None


class OpticalSuggestionResponse(CamelCaseModel):
    """Single suggestion chip returned by extract_optical_suggestions().

    ``value`` is ``str`` for ``lens_type`` / ``material``; ``list[str]`` for
    ``coatings``. ``matched`` records the substrings that triggered the hit
    for UX explainability ("matched 'progressive' in A&P").
    """

    field: str
    value: Any
    matched: list[str] = []


class OpticalSuggestionsListResponse(CamelCaseModel):
    suggestions: list[OpticalSuggestionResponse] = []
    rationale: str


class PatchOpticalOrderRequest(CamelCaseModel):
    """Configurator autosave shape — every field optional so the FE can
    PATCH a single delta. JSONB nested keys stay snake_case end-to-end
    because the type is dict[str, Any], not a typed submodel (Pitfall 1).

    Status transitions are out of scope: callers use POST /place/, /cancel/,
    or /dispense/ for those.
    """

    vision_plan: dict[str, Any] | None = None
    fitting: dict[str, Any] | None = None
    line_items: list[PatchOpticalOrderLineItem] | None = None
    final_refraction_id: UUID | None = None
    habitual_refraction_id: UUID | None = None
