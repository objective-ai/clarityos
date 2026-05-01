---
phase: 13-retail-inventory
plan: 03
subsystem: api
tags: [pydantic, typescript, schemas, contract, camelcase, jsonb]

# Dependency graph
requires:
  - phase: 13-retail-inventory
    provides: "13-00 Wave 0 contract test stub (test_optical_order_contract.py) with EXPECTED_*_KEYS sets; CamelCaseModel base in backend/schemas/common.py"
provides:
  - "Pydantic ProductCreate / ProductUpdate / ProductResponse / ReceiveStockRequest / AdjustStockRequest / FrameAttributes / ContactLensAttributes / ProductListFilters in backend/schemas/inventory.py"
  - "Pydantic OpticalOrderCreate / OpticalOrderResponse / OpticalOrderLineItemCreate / OpticalOrderLineItemResponse / OpticalOrderActionWarning / OpticalOrderPlaceResponse in backend/schemas/optical_order.py"
  - "TypeScript Product / FrameAttributes / ContactLensAttributes / ProductCreatePayload / ProductUpdatePayload / ReceiveStockPayload / AdjustStockPayload / ProductFilters / deriveStockStatus() in types/inventory.ts"
  - "TypeScript OpticalOrder / OpticalOrderLineItem / OpticalOrderCreatePayload / OrderStatus union / OpticalOrderActionWarning / OpticalOrderPlaceResponse in types/opticalOrder.ts"
  - "Verifiable contract: ProductResponse.model_dump(by_alias=True) emits exactly 15 camelCase keys matching the Product TS interface; OpticalOrderResponse emits exactly 13 keys matching OpticalOrder TS interface"
affects: [13-retail-inventory Wave 2 routes, 13-retail-inventory Wave 3 stores, 13-retail-inventory Wave 0 contract test (INV-13), phase 14-optical-orders, phase 15-pos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CamelCaseModel inheritance for all Phase 13 schemas (model_dump default by_alias=True per backend/schemas/common.py)"
    - "JSONB attributes ship as raw dict[str, Any] on the wire — typed FrameAttributes/ContactLensAttributes are validation-only shapes (Pitfall 1 / feedback_camelizekeys_nested.md)"
    - "Decimal serialized as string in TS interfaces (matches Pydantic JSON convention)"
    - "Snake_case nested keys preserved end-to-end inside attributes (e.g. eye_size, base_curve) so apiFetch's recursive camelizeKeys cannot mangle them"

key-files:
  created:
    - "backend/schemas/inventory.py - Product CRUD + stock-movement Pydantic schemas; FrameAttributes/ContactLensAttributes validation shapes"
    - "backend/schemas/optical_order.py - thin OpticalOrder primitive Pydantic schemas (Phase 14 will extend)"
    - "types/inventory.ts - Product TS interfaces + payload shapes + deriveStockStatus() helper"
    - "types/opticalOrder.ts - OpticalOrder TS interfaces + OrderStatus union + place-response shape"
  modified: []

key-decisions:
  - "All Phase 13 schemas inherit CamelCaseModel (not AppBaseModel) — gives camelCase wire format automatically without per-route response_model_by_alias=True"
  - "FrameAttributes / ContactLensAttributes inherit CamelCaseModel but override model_config to drop the alias_generator — keeps snake_case nested keys per Pitfall 1 while still enabling from_attributes/populate_by_name"
  - "Product.attributes is dict[str, Any] on the wire (not a typed Pydantic union) — validation lives at route boundary, transport stays flat dict per feedback_camelizekeys_nested.md"
  - "Decimal fields typed as `string` in TS (Pydantic serialization convention) — FE uses string math libraries or parseFloat at presentation"
  - "ProductListFilters provided as a reference shape only (routes will use Query() params); exists for FE typing parity"

patterns-established:
  - "CamelCaseModel with overridden model_config can selectively disable alias_generator on child models when JSONB nested-key preservation is required"
  - "Phase 13 attributes JSONB pattern: typed BE validators + dict[str, Any] wire format + matching snake_case TS nested-key interface — replicable for any future phase that ships polymorphic JSONB"

requirements-completed: [INV-13]

# Metrics
duration: ~3min
completed: 2026-05-01
---

# Phase 13 Plan 03: Pydantic Schemas + TypeScript Types Summary

**Pydantic ProductResponse and OpticalOrderResponse landed with exact 15-key and 13-key camelCase contracts (verified via model_dump(by_alias=True) round-trip), matching new TypeScript Product/OpticalOrder interfaces — unblocks Wave 0 INV-13 contract test and Wave 2 route schemas.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-01T19:25:39Z
- **Completed:** 2026-05-01T19:28:14Z
- **Tasks:** 2
- **Files created:** 4 (2 Python, 2 TypeScript)

## Accomplishments

- Pydantic schemas for all Phase 13 retail-inventory and optical-order shapes (request bodies + responses), all inheriting from `CamelCaseModel` so `model_dump(by_alias=True)` emits camelCase by default
- TypeScript interfaces with top-level keys camelCased, mirroring Pydantic by_alias output
- Critical invariant verified by direct Python round-trip: `ProductResponse.model_dump(by_alias=True).keys()` = exactly 15 keys (`id, tenantId, productType, brand, model, sku, upc, attributes, retailPrice, costPrice, stockQty, reorderThreshold, isActive, createdAt, updatedAt`); `OpticalOrderResponse` = exactly 13 keys (`id, tenantId, patientId, encounterId, status, totalPrice, createdById, placedAt, dispensedAt, cancelledAt, createdAt, updatedAt, lineItems`)
- Pitfall 1 honored: `attributes` is `dict[str, Any]` on the wire and `FrameAttributes`/`ContactLensAttributes` keep snake_case nested keys (e.g. `eye_size`, `base_curve`, `box_size`) on both sides
- `pytest backend/tests/test_optical_order_contract.py --collect-only` collects both INV-13 stub tests cleanly (importorskip on `backend.schemas` no longer triggers)

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend Pydantic schemas (inventory.py + optical_order.py)** - `cf4d9ed` (feat)
2. **Task 2: TypeScript types (types/inventory.ts + types/opticalOrder.ts)** - `11f5a59` (feat)

## Files Created/Modified

- `backend/schemas/inventory.py` (created, 4.4 KB) - `ProductCreate`, `ProductUpdate`, `ProductResponse`, `ReceiveStockRequest`, `AdjustStockRequest`, `FrameAttributes`, `ContactLensAttributes`, `ProductListFilters`
- `backend/schemas/optical_order.py` (created, 1.9 KB) - `OpticalOrderLineItemCreate`, `OpticalOrderLineItemResponse`, `OpticalOrderCreate`, `OpticalOrderResponse`, `OpticalOrderActionWarning`, `OpticalOrderPlaceResponse`
- `types/inventory.ts` (created, 2.9 KB) - `Product`, `FrameAttributes`, `ContactLensAttributes`, `ProductAttributes`, `ProductCreatePayload`, `ProductUpdatePayload`, `ReceiveStockPayload`, `AdjustStockPayload`, `ProductFilters`, `deriveStockStatus()`
- `types/opticalOrder.ts` (created, 1.3 KB) - `OpticalOrder`, `OpticalOrderLineItem`, `OpticalOrderLineItemCreatePayload`, `OpticalOrderCreatePayload`, `OrderStatus`, `OpticalOrderActionWarning`, `OpticalOrderPlaceResponse`

## Decisions Made

- **Selective camelCase opt-out for nested validation models:** `FrameAttributes` and `ContactLensAttributes` inherit `CamelCaseModel` but override `model_config` to a fresh `ConfigDict(from_attributes=True, populate_by_name=True, extra="allow")` — this drops the `alias_generator=to_camel`. Keeps the file structure idiomatic while honoring Pitfall 1 (JSONB nested keys must stay snake_case end-to-end).
- **Dict[str, Any] on the wire for `attributes`:** Even though we have validation shapes, `ProductCreate.attributes` and `ProductResponse.attributes` are typed as `dict[str, Any]` so Pydantic does not invoke the typed model's serializer (which would otherwise coerce keys). Routes (Wave 2) will validate dict-shape against `FrameAttributes`/`ContactLensAttributes` based on `product_type`.
- **Decimal as string in TS:** Pydantic serializes `Decimal` to JSON as a string. TS `Product.retailPrice: string` (and `costPrice: string | null`, `unitPrice`, `lineTotal`, `totalPrice`) reflects that. FE will format/parse at presentation.
- **`ProductListFilters` is reference-only:** Listed in plan for parity, but Wave 2 routes will use FastAPI `Query()` params on the path, not a request body. Schema kept for FE typing convenience.

## Deviations from Plan

None — plan executed exactly as written, with one micro-clarification:

The plan's `FrameAttributes`/`ContactLensAttributes` snippet used `model_config = {"extra": "allow", "populate_by_name": True}` (a dict literal) plus per-field `alias="snake_case"` overrides to defeat the parent `to_camel` alias generator. That works but is verbose. The cleaner equivalent — used here — is to overwrite the inherited `model_config` with a fresh `ConfigDict(from_attributes=True, populate_by_name=True, extra="allow")` (no alias_generator), which means NO per-field `alias=` overrides are needed. Same wire behavior (snake_case nested keys), simpler code. This is a literal-equivalent simplification, not a deviation in shape or semantics.

## Issues Encountered

- **Initial `python -c` from inside `backend/` failed:** `ModuleNotFoundError: No module named 'backend'`. Resolution: project pattern is to invoke with `PYTHONPATH=.` from the repo root, so all imports resolve as `from backend.schemas...` (consistent with `backend/services/billing_service.py:21` and friends). The plan's verify command was rewritten to use this convention.
- DeprecationWarning on `datetime.utcnow()` during the verify script — informational only, the script exits 0 and prints OK. Not in scope to refactor existing donor patterns.

## User Setup Required

None — schemas/types are pure code; no external service configuration required.

## Next Phase Readiness

- **Wave 0 (INV-13 contract test):** Stub at `backend/tests/test_optical_order_contract.py` can now be filled in — `EXPECTED_PRODUCT_RESPONSE_KEYS` and `EXPECTED_OPTICAL_ORDER_RESPONSE_KEYS` already match the implemented Pydantic shapes byte-for-byte. The two `pytest.skip(...)` lines are the only remaining edits to make INV-13 pass.
- **Wave 2 routes:** `backend/api/routes/inventory.py` and `backend/api/routes/optical_order.py` (when authored) can `from backend.schemas.inventory import ...` and `from backend.schemas.optical_order import ...` directly.
- **Wave 3 stores:** `store/inventoryStore.ts` and `store/opticalOrderStore.ts` (when authored) can `import type { Product, ... } from "@/types/inventory"` and `import type { OpticalOrder, ... } from "@/types/opticalOrder"`.
- **Phase 14:** `OpticalOrderResponse` is intentionally thin — Phase 14 will `ADD COLUMN` for lens config / coatings / measurements / vision-plan, then extend the Pydantic response in place. The 13-key set will grow; downstream consumers should be additive-tolerant.

## Self-Check: PASSED

- backend/schemas/inventory.py — FOUND
- backend/schemas/optical_order.py — FOUND
- types/inventory.ts — FOUND
- types/opticalOrder.ts — FOUND
- Commit cf4d9ed — FOUND
- Commit 11f5a59 — FOUND

---

*Phase: 13-retail-inventory*
*Completed: 2026-05-01*
