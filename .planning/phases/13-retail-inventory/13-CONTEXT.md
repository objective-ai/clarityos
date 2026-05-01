# Phase 13: Retail Inventory - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 13 adds the retail-side foundation to ClarityOS — a product catalog (frames + contacts) with stock tracking, plus a thin order-from-Rx primitive that decrements stock and surfaces order history per patient. Phase 14 will extend the order with full optical configuration (lens type, coatings, fitting measurements, job ticket PDF, AI Scribe suggestions). Phase 15 (POS) will handle checkout and payments.

**In scope (success criteria 1-5 from ROADMAP.md §Phase 13):**
- Product catalog: frames + contacts. Lenses excluded (configured per-Rx in Phase 14, not stocked).
- Stock tracking with per-product low-stock signal.
- Thin `OpticalOrder` + `OpticalOrderLineItem` tables — minimal columns Phase 14 will `ADD COLUMN` to.
- `InventoryTransaction` audit log for every stock movement.
- Inventory page (admin) with per-type tabs and filters.
- Patient detail "Orders" tab with chronological history.

**Out of scope:**
- Lens configuration / coatings / fitting measurements / job ticket PDF → Phase 14.
- POS / checkout / payment / receipt / tax application → Phase 15.
- AI Scribe optical recommendations → Phase 14.
- Inventory reporting / CSV import → Phase 16.
- Refunds / returns → Phase 15.
- Product images → V3.

</domain>

<decisions>
## Implementation Decisions

### A. Product type scope & schema shape
- **Scope:** Frames + Contacts only. Lenses excluded.
- **Schema:** Single `Product` table with `product_type` enum (`frame`, `contact_lens`) + JSONB `attributes` column. Mirrors `Patient.medical_history_jsonb` precedent.
- **Identifier:** Auto-generated SKU built from brand+model+color+size (e.g. `FR-RAYBAN-WAYFARER-BLK-52`); optional manual `upc` field.
- **Lifecycle:** Soft delete only via `is_active=false`. Mirrors `PatientInsurance` pattern; preserves order history.

**Attribute schema per type:**
- **Frame attributes JSONB:** `brand`, `model`, `color`, `eye_size`, `bridge_size`, `temple_size`, `gender` ∈ {`men`,`women`,`unisex`,`kids`}, `material` ∈ {`acetate`,`metal`,`titanium`,`other`}.
- **Contact lens attributes JSONB:** `brand`, `modality` ∈ {`daily`,`biweekly`,`monthly`}, `base_curve`, `diameter`, `power`, `cylinder?`, `axis?`, `box_size` (qty per box).

### B. Stock model & low-stock behavior
- **Variants:** Each variant (frame color/size, contact base curve/power) is its own `Product` row sharing brand+model.
- **Low-stock threshold:** Per-product `reorder_threshold` column (default 3).
- **Zero-stock behavior:** Soft-block — warn (toast + order badge) but allow order creation. Mirrors Phase 10.2 overbooking pattern.
- **Decrement timing:** On order `placed` transition, in primary TXN with `OpticalOrderLineItem` insert. Phase 14 may revisit.
- **Restock workflow:** Dedicated "Receive Stock" action on each product row → modal asks `qty_received` + optional `po_reference` → writes `InventoryTransaction` with `reason='receive_stock'`. Manual qty edits also write an audit row with `reason='manual_adjust'`.

### C. Order primitive & Phase 14 boundary
- **Tables:** `OpticalOrder` (patient_id, encounter_id?, status, total_price, created_by, timestamps) + `OpticalOrderLineItem` (order_id, product_id, qty, unit_price, line_total). Phase 14 will `ADD COLUMN` for lens config, coatings, measurements, vision plan.
- **Status lifecycle:** `draft` → `placed` → `dispensed` → `cancelled`. Stock decrements on `placed`; restocks on `cancelled`.
- **Encounter linkage:** Optional `encounter_id` FK. Patient required; encounter nullable to support walk-in retail and contact refills.
- **Edit lifecycle:** Once `placed`, line items are locked. Cancel-and-recreate is the only path.
- **Cancellation:** Restocks qty for each line + writes `InventoryTransaction` rows in primary TXN.
- **InventoryTransaction table:** `product_id`, `delta` (signed int), `reason` ∈ {`order_placed`,`order_cancelled`,`receive_stock`,`manual_adjust`}, `optical_order_id?`, `staff_id`, `note?`, `created_at`.
- **Encounter.optical_status reconciliation:** Existing column from Phase 6 stays as-is. Optical-queue card status is computed: any order in `placed` → `in_progress`; all orders `dispensed` → `dispensed`; no orders → fall back to `Encounter.optical_status`. Phase 14 must respect this rollup.

### D. Inventory page & patient order history surface
- **Inventory page:** Per-type tabs (`Frames` | `Contacts`), one filterable table per tab. Mirrors Phase 9 Payers tab.
- **Filters:** Brand/model search + stock-status filter (in stock / low / out) + active/inactive toggle + type-specific filter (frames: gender; contacts: modality).
- **Order entry surfaces:** (1) optical-queue card action (encounter-linked, Rx pre-filled) and (2) "New Walk-In Order" button on patient detail Orders tab (no encounter).
- **Patient Orders tab:** Chronological list (newest first) — order date, status badge, line-item count, total. Click → drawer (mirrors Phase 10.2 `AppointmentDetailDrawer`) showing line items, status timeline, cancel button.

### E. Pricing
- **Columns on Product:** `retail_price` (pre-tax) + `cost_price` (wholesale) — both stored now to enable Phase 16 margin reporting without schema churn.
- **Tax handling:** Phase 13 stores prices pre-tax. Tax application deferred to Phase 15 POS.
- **Vision-plan vs cash pricing:** Single price now. Plan-specific pricing deferred to Phase 14/15.

### F. Permissions (new `ClinicalAction` enum values)
- `VIEW_INVENTORY` — OWNER, ADMIN, DOCTOR, TECHNICIAN, RECEPTIONIST.
- `MANAGE_INVENTORY` (catalog CRUD + restock) — OWNER, ADMIN.
- `CREATE_OPTICAL_ORDER` — OWNER, ADMIN, TECHNICIAN, RECEPTIONIST.
- `VIEW_OPTICAL_ORDER` — OWNER, ADMIN, DOCTOR, TECHNICIAN, RECEPTIONIST.
- `CANCEL_OPTICAL_ORDER` — OWNER, ADMIN.

### G. Audit (new `AuditAction` enum values)
`PRODUCT_CREATE`, `PRODUCT_UPDATE`, `PRODUCT_DEACTIVATE`, `STOCK_RECEIVE`, `STOCK_ADJUST`, `OPTICAL_ORDER_CREATE`, `OPTICAL_ORDER_PLACE`, `OPTICAL_ORDER_CANCEL`, `OPTICAL_ORDER_DISPENSE`. All logged via `log_action()` in primary TXN.

### H. Entitlement gating — `retail_pos` add-on
- **New entitlement key:** `retail_pos` — covers both Phase 13 (Inventory + Orders) AND Phase 15 (POS) as a single bundled add-on.
- **Pricing model:** $150/month add-on. Not bundled into Core, Plus, or Premium plan tiers. Billing layer concern (subscription_plans table) — out of scope for Phase 13 implementation, but the entitlement check must be wired.
- **Files to update:**
  - `backend/core/entitlements.py` — add `retail_pos` key
  - `lib/entitlements.ts` — mirror constant + `ENTITLEMENT_META` description (plan: `"Add-on"`)
  - `PLAN_FEATURES` — NOT added to Core/Plus/Premium arrays.
- **Gate behavior:** Sidebar Inventory tab + patient Orders tab + order-create CTAs hidden when `!has(Entitlement.RETAIL_POS)`. Upsell modal copy: "Retail & POS — $150/mo add-on".

### I. Catalog seeding
- Manual entry only via admin UI for Phase 13.
- Dev seed file (`backend/db/seed/`) adds ~10 synthetic frames + 5 contact lens products for E2E tests.
- CSV import deferred to V3 / Phase 16.

### J. New BFF routes (planner reference)
- `app/api/inventory/products/` — GET list (filters), POST create
- `app/api/inventory/products/[id]/` — GET, PATCH, DELETE soft-delete
- `app/api/inventory/products/[id]/receive/` — POST receive stock
- `app/api/inventory/products/[id]/adjust/` — POST manual adjust
- `app/api/optical-orders/` — GET list (by patient/encounter), POST create
- `app/api/optical-orders/[id]/` — GET detail
- `app/api/optical-orders/[id]/place/` — POST draft→placed
- `app/api/optical-orders/[id]/cancel/` — POST →cancelled
- `app/api/optical-orders/[id]/dispense/` — POST placed→dispensed
- All proxied via `lib/bff.ts` `proxyToFastAPI()` with trailing-slash upstream URLs.

### K. Requirements (planner adds during /gsd:plan-phase)
Add `INV-01..INV-N` to `.planning/REQUIREMENTS.md` mapping to:
- INV-01..05 — five ROADMAP success criteria
- INV-06..N — decisions above (variant model, attribute JSONB, restock workflow, encounter rollup, entitlement gate, audit actions)

### Claude's Discretion
- Exact Pydantic field names and TS camelCase mappings (follow project conventions).
- SKU collision handling within an active set (incrementing suffix).
- Exact drawer animation timing / styles (reuse Phase 10.2 patterns).
- E2E test fixture data (within seeded ~10 frames + 5 contacts).
- Order detail drawer layout (status timeline shape, line-item presentation).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase boundaries
- `.planning/ROADMAP.md` §Phase 13 — success criteria 1-5
- `.planning/ROADMAP.md` §Phase 14 — Optical Order Configuration boundary (what Phase 13 must NOT build)
- `.planning/ROADMAP.md` §Phase 15 — Point of Sale boundary
- `.planning/REQUIREMENTS.md` — INV-* IDs to be added during plan-phase

### Project rules (non-negotiable)
- `.claude/rules/clinical-safety.md` — primary-TXN writes, audit on clinical changes
- `.claude/rules/bff-api.md` — every backend route gets a BFF proxy with trailing-slash upstream URLs
- `.claude/rules/backend-python.md` — `selectinload` after `db.flush()`, enums as VARCHAR
- `.claude/rules/testing.md` — vitest + Playwright conventions

### Memory references
- `research_document_management.md` — relevant for V3 product images deferral

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/db/models/tenant/clinical.py` — `TenantBase`, `TimestampMixin`, `SoftDeleteMixin`; `AuditAction` enum at line 127; `ClinicalAction` enum at `backend/core/permissions.py:26`.
- `backend/core/audit.py` `log_action()` — primary-TXN clinical writes with staff_id, ip_address, encounter/patient context.
- `backend/api/routes/optical.py`, `backend/schemas/optical.py`, `store/opticalStore.ts` — Phase 6 optical queue, Rx PDF, status transitions. Phase 13 attaches orders to encounters surfaced via this queue.
- `lib/entitlements.ts` (TS) + `backend/core/entitlements.py` (Python) — single-source-of-truth pair pattern; `MESSAGING` (Phase 12) is the most recent precedent for adding a new key.
- `lib/bff.ts` `proxyToFastAPI()` — trailing-slash upstream URLs.
- `components/schedule/AppointmentDetailDrawer.tsx` (Phase 10.2) — 480px slide drawer, ESC + backdrop close, early-return-null for hydration safety. Reuse for `OrderDetailDrawer`.

### Established Patterns
- Alembic `ADD COLUMN IF NOT EXISTS` idempotency from Phase 10.2.
- Partial unique index `WHERE is_active = true` from Phase 10.1 `PatientInsurance`. Apply to `(tenant_id, sku) WHERE is_active = true` on `Product`.
- Phase 9 Payers admin tab — list + CRUD modal pattern; clone shape for Inventory page.
- Phase 9 Insurance/Billing patient-detail tabs — clone shape for patient Orders tab.
- Pydantic `by_alias` serialization + camelize/snakify on FE — required contract test (per `feedback_contract_tests.md`).

### Integration Points
- `Encounter.optical_status` (clinical.py:497) coexists with new `OpticalOrder.status` — rollup rule defined in §C.
- `app/(tenant)/[tenant]/optical/page.tsx` — wire "Create Order" action on optical-queue cards.
- `components/patients/PatientDetailTabs.tsx` (or equivalent) — register Orders tab.
- Sidebar admin nav — add Inventory link gated on `retail_pos` entitlement.

</code_context>

<specifics>
## Specific Ideas

- "Retail and POS should be a $150 add-on" — single bundled `retail_pos` entitlement covering Phase 13 (catalog + orders) and Phase 15 (POS), purchased separately from Core/Plus/Premium tiers.
- Phase 13 is the "thin primitive" — leave room for Phase 14 to `ADD COLUMN` rather than locking down a full optical-order shape now.

</specifics>

<deferred>
## Deferred Ideas

- Product images / drag-drop upload — V3 (needs Supabase Storage decisions; see `research_document_management.md`)
- CSV bulk catalog import — Phase 16 reporting/exports or V3
- Vision-plan-specific pricing — Phase 14/15
- Refunds / returns — Phase 15 POS
- Tax application — Phase 15 POS
- Edit-after-place workflow — Phase 14 may revisit
- Vendor / supplier model + reorder PO generation — V3
- Low-stock dashboard widget on `/dashboard` — defer (Inventory page filter is sufficient)

</deferred>

---

*Phase: 13-retail-inventory*
*Context gathered: 2026-04-30*
