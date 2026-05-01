# Phase 13: Retail Inventory — Research

**Researched:** 2026-04-30
**Domain:** Retail inventory + thin optical-order primitive (frames + contacts), wired to existing Phase 6 optical handoff and Phase 9/10.1 patterns. Scope locked by `13-CONTEXT.md`.
**Confidence:** HIGH (all findings verified against current codebase; CONTEXT.md is the authoritative spec).

## Summary

Phase 13 is an **execution problem, not a design problem**. The CONTEXT.md is exhaustive; the design is locked; the planner's job is to thread the new tables, routes, and UI surfaces through patterns that already exist three to four times in this repo (Phase 6 optical, Phase 9 payers/insurance, Phase 10.1 partial unique index, Phase 10.2 drawer, Phase 12 messaging entitlement). This research document is therefore a **citation pack**: the planner gets exact file paths, exact function signatures, exact migration SQL, and exact 5–15 line snippets so it can write a goal-backward PLAN.md without re-reading source.

**Primary recommendation:** Clone the *Phase 9 Payers tab + InsurancePayer CRUD route + payerStore* shape for the Inventory page and Product table; clone the *Phase 10.1 PatientInsurance partial unique index* SQL verbatim for `Product.sku`; clone the *Phase 10.2 AppointmentDetailDrawer* 480px drawer for `OrderDetailDrawer`; clone the *Phase 12 MESSAGING* entitlement-pair pattern for `RETAIL_POS` (with one twist: it is NOT in PLAN_FEATURES — it's a true add-on). Decrement-on-place and restock-on-cancel must live in the same primary transaction as the line-item insert/update plus an `InventoryTransaction` audit row.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. Product type scope & schema shape**
- Scope: Frames + Contacts only. Lenses excluded.
- Schema: Single `Product` table with `product_type` enum (`frame`, `contact_lens`) + JSONB `attributes` column. Mirrors `Patient.medical_history_jsonb` precedent.
- Identifier: Auto-generated SKU built from brand+model+color+size (e.g. `FR-RAYBAN-WAYFARER-BLK-52`); optional manual `upc` field.
- Lifecycle: Soft delete only via `is_active=false`. Mirrors `PatientInsurance` pattern; preserves order history.
- Frame attributes JSONB: `brand`, `model`, `color`, `eye_size`, `bridge_size`, `temple_size`, `gender` ∈ {`men`,`women`,`unisex`,`kids`}, `material` ∈ {`acetate`,`metal`,`titanium`,`other`}.
- Contact lens attributes JSONB: `brand`, `modality` ∈ {`daily`,`biweekly`,`monthly`}, `base_curve`, `diameter`, `power`, `cylinder?`, `axis?`, `box_size`.

**B. Stock model & low-stock behavior**
- Variants: Each variant (frame color/size, contact base curve/power) is its own `Product` row sharing brand+model.
- Low-stock threshold: Per-product `reorder_threshold` column (default 3).
- Zero-stock behavior: Soft-block — warn (toast + order badge) but allow order creation. Mirrors Phase 10.2 overbooking pattern.
- Decrement timing: On order `placed` transition, in primary TXN with `OpticalOrderLineItem` insert. Phase 14 may revisit.
- Restock workflow: Dedicated "Receive Stock" action on each product row → modal asks `qty_received` + optional `po_reference` → writes `InventoryTransaction` with `reason='receive_stock'`. Manual qty edits also write an audit row with `reason='manual_adjust'`.

**C. Order primitive & Phase 14 boundary**
- Tables: `OpticalOrder` (patient_id, encounter_id?, status, total_price, created_by, timestamps) + `OpticalOrderLineItem` (order_id, product_id, qty, unit_price, line_total). Phase 14 will `ADD COLUMN` for lens config, coatings, measurements, vision plan.
- Status lifecycle: `draft` → `placed` → `dispensed` → `cancelled`. Stock decrements on `placed`; restocks on `cancelled`.
- Encounter linkage: Optional `encounter_id` FK. Patient required; encounter nullable to support walk-in retail and contact refills.
- Edit lifecycle: Once `placed`, line items are locked. Cancel-and-recreate is the only path.
- Cancellation: Restocks qty for each line + writes `InventoryTransaction` rows in primary TXN.
- InventoryTransaction table: `product_id`, `delta` (signed int), `reason` ∈ {`order_placed`,`order_cancelled`,`receive_stock`,`manual_adjust`}, `optical_order_id?`, `staff_id`, `note?`, `created_at`.
- Encounter.optical_status reconciliation: Existing column from Phase 6 stays as-is. Optical-queue card status is computed: any order in `placed` → `in_progress`; all orders `dispensed` → `dispensed`; no orders → fall back to `Encounter.optical_status`. Phase 14 must respect this rollup.

**D. Inventory page & patient order history surface**
- Inventory page: Per-type tabs (`Frames` | `Contacts`), one filterable table per tab. Mirrors Phase 9 Payers tab.
- Filters: Brand/model search + stock-status filter (in stock / low / out) + active/inactive toggle + type-specific filter (frames: gender; contacts: modality).
- Order entry surfaces: (1) optical-queue card action (encounter-linked, Rx pre-filled) and (2) "New Walk-In Order" button on patient detail Orders tab (no encounter).
- Patient Orders tab: Chronological list (newest first) — order date, status badge, line-item count, total. Click → drawer (mirrors Phase 10.2 `AppointmentDetailDrawer`) showing line items, status timeline, cancel button.

**E. Pricing**
- Columns on Product: `retail_price` (pre-tax) + `cost_price` (wholesale) — both stored now to enable Phase 16 margin reporting without schema churn.
- Tax handling: Phase 13 stores prices pre-tax. Tax application deferred to Phase 15 POS.
- Vision-plan vs cash pricing: Single price now. Plan-specific pricing deferred to Phase 14/15.

**F. Permissions (new `ClinicalAction` enum values)**
- `VIEW_INVENTORY` — OWNER, ADMIN, DOCTOR, TECHNICIAN, RECEPTIONIST.
- `MANAGE_INVENTORY` (catalog CRUD + restock) — OWNER, ADMIN.
- `CREATE_OPTICAL_ORDER` — OWNER, ADMIN, TECHNICIAN, RECEPTIONIST.
- `VIEW_OPTICAL_ORDER` — OWNER, ADMIN, DOCTOR, TECHNICIAN, RECEPTIONIST.
- `CANCEL_OPTICAL_ORDER` — OWNER, ADMIN.

**G. Audit (new `AuditAction` enum values)**
`PRODUCT_CREATE`, `PRODUCT_UPDATE`, `PRODUCT_DEACTIVATE`, `STOCK_RECEIVE`, `STOCK_ADJUST`, `OPTICAL_ORDER_CREATE`, `OPTICAL_ORDER_PLACE`, `OPTICAL_ORDER_CANCEL`, `OPTICAL_ORDER_DISPENSE`. All logged via `log_action()` in primary TXN.

**H. Entitlement gating — `retail_pos` add-on**
- New entitlement key: `retail_pos` — covers both Phase 13 (Inventory + Orders) AND Phase 15 (POS) as a single bundled add-on.
- Pricing: $150/month add-on. Not bundled into Core, Plus, or Premium.
- Files to update: `backend/core/entitlements.py`, `lib/entitlements.ts`, `ENTITLEMENT_META`. NOT added to PLAN_FEATURES Core/Plus/Premium arrays.
- Gate behavior: Sidebar Inventory tab + patient Orders tab + order-create CTAs hidden when `!has(Entitlement.RETAIL_POS)`. Upsell modal copy: "Retail & POS — $150/mo add-on".

**I. Catalog seeding**
- Manual entry only via admin UI for Phase 13.
- Dev seed file (`backend/seed_db.py` — there is no `backend/db/seed/` dir; seeding lives in `seed_db.py`) adds ~10 synthetic frames + 5 contact lens products for E2E tests.
- CSV import deferred to V3 / Phase 16.

**J. New BFF routes (planner reference — see §New BFF routes below for verbatim list).**

### Claude's Discretion

- Exact Pydantic field names and TS camelCase mappings (follow project conventions: snake_case in DB/Pydantic, camelCase in TS via `apiFetch` `camelizeKeys`).
- SKU collision handling within an active set (incrementing suffix).
- Exact drawer animation timing / styles (reuse Phase 10.2 patterns verbatim).
- E2E test fixture data (within seeded ~10 frames + 5 contacts).
- Order detail drawer layout (status timeline shape, line-item presentation).

### Deferred Ideas (OUT OF SCOPE)

- Product images / drag-drop upload — V3.
- CSV bulk catalog import — Phase 16 / V3.
- Vision-plan-specific pricing — Phase 14/15.
- Refunds / returns — Phase 15 POS.
- Tax application — Phase 15 POS.
- Edit-after-place workflow — Phase 14 may revisit.
- Vendor / supplier model + reorder PO generation — V3.
- Low-stock dashboard widget on `/dashboard` — defer.

## Phase Requirements

The planner will mint INV-01..INV-N during `/gsd:plan-phase`. The 5 ROADMAP success criteria each become at least one INV-* requirement; CONTEXT.md decisions §A–§I expand into the rest. Suggested mapping (planner is free to renumber):

| Suggested ID | Description | Research Support |
|---|---|---|
| INV-01 | Admin can create/edit/deactivate Products (frames + contacts) with brand/model/price/stock_qty | Standard Stack §Product table; Code Examples §CRUD route shape (mirrors `payer.py:177–213` create + `:249–297` patch + `:305–340` soft-delete) |
| INV-02 | Optical staff can create OpticalOrder from Encounter Rx, selecting products | §Phase 6 surfaces — `optical/page.tsx`, `OpticalQueueCard.tsx`; Rx data already shaped via `OpticalQueueItem.od/.os/.pd_*` |
| INV-03 | Placing order decrements stock atomically; low-stock items show warning badge | §Architecture Patterns — atomic decrement; §Common Pitfalls §1 transaction atomicity |
| INV-04 | Inventory page filterable by product_type, stock-status, active flag, gender/modality | §Phase 9 Payers tab pattern — `app/(tenant)/[tenant]/admin/page.tsx:2267–2492` `PayersSection` |
| INV-05 | Patient detail "Orders" tab shows order history with status + delivery date | §PatientDetailTabs registration — `app/(tenant)/[tenant]/patients/[patientId]/page.tsx:54–64` (TABS array) |
| INV-06 | Single Product table with product_type enum + JSONB attributes | §Standard Stack — Patient.medical_history_jsonb precedent (`clinical.py:282`) |
| INV-07 | Auto-generated SKU + optional UPC; partial unique index `(tenant_id, sku) WHERE is_active = true` | §Migration SQL — verbatim from `0012_insurance_revamp_fields.py:64–67` |
| INV-08 | Per-product reorder_threshold (default 3); stock-status derived (in_stock/low/out) | §Standard Stack |
| INV-09 | OpticalOrder + OpticalOrderLineItem thin tables with `draft/placed/dispensed/cancelled` lifecycle | §Phase 14 boundary — Phase 14 will `ADD COLUMN`, not redesign |
| INV-10 | Optional encounter_id FK on OpticalOrder (walk-in retail support) | §Architecture |
| INV-11 | InventoryTransaction audit table on every stock movement | §Architecture |
| INV-12 | Encounter optical-queue rollup: any `placed` order → in_progress; all `dispensed` → dispensed | §Phase 6 status reconciliation |
| INV-13 | Restock workflow: dedicated "Receive Stock" action with optional po_reference | §Decisions §B |
| INV-14 | New ClinicalAction values: VIEW_INVENTORY, MANAGE_INVENTORY, CREATE_OPTICAL_ORDER, VIEW_OPTICAL_ORDER, CANCEL_OPTICAL_ORDER | §Code Examples — extend `permissions.py:26–82` |
| INV-15 | New AuditAction values (9 listed in §G) | §Code Examples — extend `clinical.py:127–195` |
| INV-16 | `retail_pos` entitlement key (add-on, $150/mo, NOT in PLAN_FEATURES) | §Code Examples — Phase 12 MESSAGING precedent (`entitlements.py:36–37`, `lib/entitlements.ts:48`) but with discriminator: NOT added to PLAN_FEATURES |
| INV-17 | Sidebar Inventory link + patient Orders tab + order-create CTAs gated on `retail_pos` | §Sidebar `components/Sidebar.tsx:107–113` `requiredEntitlement` pattern |
| INV-18 | OrderDetailDrawer 480px right-slide modal mirroring `AppointmentDetailDrawer` | §Code Examples — drawer panel spec |
| INV-19 | Seed ~10 synthetic frames + 5 contact lens products in `backend/seed_db.py` | §Seed pattern from `_seed_insurance_payers` |
| INV-20 | Zero-stock soft-block (warn but allow); cancellation restocks atomically | §Architecture |

## Standard Stack

### Core (already in use — Phase 13 adds NO new packages)

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| FastAPI | (project pin) | Backend HTTP routes | Already used everywhere — `backend/api/routes/payer.py`, `optical.py` |
| SQLAlchemy 2.0 async | (project pin) | ORM + transactions | All clinical models already use `AsyncSession` + `Mapped[]` |
| Alembic | (project pin) | Migrations | 16 existing migrations 0001–0016; Phase 13 will be 0017 |
| Pydantic v2 | (project pin) | Schemas + camelCase aliasing via `to_camel` in `backend/schemas/common.py` | Existing `AppBaseModel` + `CamelCaseModel` |
| Next.js 14 App Router | 14.x | BFF + UI | All `app/api/.../route.ts` files use `proxyToFastAPI` |
| Zustand 4.5 + devtools | 4.x | Frontend stores (`opticalStore`, `payerStore`) | Phase 13 adds `inventoryStore` + `opticalOrderStore` mirroring shape |
| shadcn/ui (`Card`, `Dialog`, `Badge`, `Button`) | local | Inventory modals + drawer | All existing admin/patient UI uses these |
| Tailwind 3.4 + glass-* utility classes | 3.x | Styling — `glass-card`, `glass-input` defined in `globals.css` | Phase 9 + 10.2 patterns |
| Playwright `@playwright/test` | (project pin) | E2E specs in `tests/e2e/*.spec.ts` with `storageState` | Per `.claude/rules/testing.md` |
| pytest + pytest-asyncio | (project pin) | Backend tests in `backend/tests/` | Pattern matches `backend/tests` for transaction atomicity tests |

**Verification:** No `npm install` or `pip install` needed for Phase 13 — every dependency required is already in `package.json` / `requirements.txt`. No new packages — see project rule "Don't add new npm/pip packages without asking first."

### Alternatives Considered (and rejected — locked by CONTEXT)

| Instead of | Could Use | Why rejected |
|---|---|---|
| Single `Product` table + JSONB | Separate `frame_products` and `contact_lens_products` tables | CONTEXT.md §A locks single table — mirrors `Patient.medical_history_jsonb`; JSONB attributes already a project convention |
| Soft delete via `is_active` | Hard delete | CONTEXT.md §A locks soft delete — preserves order history (same reason `PatientInsurance` uses partial unique index) |
| Decrement on order create | Decrement on `placed` transition | CONTEXT.md §B locks decrement-on-`placed` for the v1 thin primitive; Phase 14 may revisit |
| Edit-after-place | Cancel-and-recreate only | CONTEXT.md §C locks; Phase 14 may revisit |

## Architecture Patterns

### Recommended File Structure

```
backend/
├── alembic/versions/0017_retail_inventory.py     # NEW — products, optical_orders, optical_order_line_items, inventory_transactions
├── api/routes/
│   ├── inventory.py                               # NEW — Product CRUD + restock + adjust
│   └── optical_order.py                           # NEW — OpticalOrder list/detail/place/cancel/dispense
├── db/models/tenant/clinical.py                   # EXTEND — add Product, OpticalOrder, OpticalOrderLineItem, InventoryTransaction; extend AuditAction
├── core/
│   ├── permissions.py                             # EXTEND — add 5 new ClinicalAction values
│   └── entitlements.py                            # EXTEND — add RETAIL_POS = "retail_pos" (NOT added to PLAN_FEATURES)
├── schemas/
│   ├── inventory.py                               # NEW — ProductCreate/Update/Response, ReceiveStockRequest, AdjustStockRequest
│   └── optical_order.py                           # NEW — OpticalOrderResponse, OpticalOrderCreateRequest, OpticalOrderLineItemRequest
├── seed_db.py                                     # EXTEND — add _seed_retail_inventory(session) with 10 frames + 5 contacts
└── tests/
    ├── test_inventory_atomicity.py                # NEW — pytest: place/cancel transaction atomicity
    └── test_optical_order_contract.py             # NEW — Pydantic by_alias contract test for OpticalOrder + Product

app/
├── api/
│   ├── inventory/products/route.ts                # NEW — GET (list+filters) + POST
│   ├── inventory/products/[id]/route.ts           # NEW — GET + PATCH + DELETE
│   ├── inventory/products/[id]/receive/route.ts   # NEW — POST receive stock
│   ├── inventory/products/[id]/adjust/route.ts    # NEW — POST manual adjust
│   ├── optical-orders/route.ts                    # NEW — GET (list, ?patient_id=, ?encounter_id=) + POST
│   ├── optical-orders/[id]/route.ts               # NEW — GET detail
│   ├── optical-orders/[id]/place/route.ts         # NEW — POST
│   ├── optical-orders/[id]/cancel/route.ts        # NEW — POST
│   └── optical-orders/[id]/dispense/route.ts      # NEW — POST
└── (tenant)/[tenant]/
    └── inventory/page.tsx                          # NEW — admin Inventory page (Frames | Contacts tabs)

components/
├── inventory/
│   ├── ProductTable.tsx                            # NEW — list + filters (clones Payers table)
│   ├── ProductFormModal.tsx                        # NEW — create/edit Product (clones CreatePayerModal)
│   ├── ReceiveStockModal.tsx                       # NEW — qty_received + po_reference
│   └── AdjustStockModal.tsx                        # NEW — manual qty adjust
├── orders/
│   ├── OrdersTab.tsx                               # NEW — patient Orders tab (chronological list)
│   ├── OrderDetailDrawer.tsx                       # NEW — 480px right-slide drawer (clones AppointmentDetailDrawer)
│   └── OrderCreateModal.tsx                        # NEW — opens from optical-queue card OR walk-in CTA
└── optical/
    └── OpticalQueueCard.tsx                        # EDIT — add "Create Order" action button + computed-status rollup

store/
├── inventoryStore.ts                               # NEW — products list, filters, CRUD; clones payerStore shape
└── opticalOrderStore.ts                            # NEW — orders list, place/cancel/dispense actions

lib/
└── entitlements.ts                                 # EXTEND — add RETAIL_POS constant + ENTITLEMENT_META entry (plan: "Add-on")

types/
├── inventory.ts                                    # NEW — Product, FrameAttributes, ContactLensAttributes
└── opticalOrder.ts                                 # NEW — OpticalOrder, OpticalOrderLineItem, OrderStatus enum

tests/e2e/
└── retail-inventory.spec.ts                        # NEW — 5-criterion E2E (per Validation Architecture)
```

### Pattern 1: Atomic stock decrement on `placed`
**What:** Place transition mutates `Product.stock_qty`, inserts `InventoryTransaction`, updates `OpticalOrder.status`, and writes `log_action(..., OPTICAL_ORDER_PLACE)` — all in one `db.commit()`.
**When to use:** `POST /api/optical-orders/{id}/place` and `POST /api/optical-orders/{id}/cancel`.
**Why:** `.claude/rules/clinical-safety.md` mandates "Clinical data writes: always in the primary DB transaction — never fire-and-forget fetch calls." Plus inventory atomicity bug-prevention.
**Example shape:**
```python
# backend/api/routes/optical_order.py — pseudo-code based on payer.py:177-213 + optical.py:364-411
@router.post("/{order_id}/place", response_model=OpticalOrderResponse)
async def place_order(
    order_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CREATE_OPTICAL_ORDER)),
    db: AsyncSession = Depends(get_db),
):
    staff = await resolve_staff(ctx, db)
    order = (await db.execute(
        select(OpticalOrder)
        .where(OpticalOrder.id == order_id, OpticalOrder.tenant_id == ctx.tenant_id)
        .options(selectinload(OpticalOrder.line_items))
    )).scalar_one_or_none()
    if not order or order.status != "draft":
        raise HTTPException(409, "Order not in draft state")

    # Lock products for update (SELECT ... FOR UPDATE) to avoid TOCTOU
    for line in order.line_items:
        product = (await db.execute(
            select(Product).where(Product.id == line.product_id).with_for_update()
        )).scalar_one()
        product.stock_qty -= line.qty   # may go negative — soft-block warned at UI
        db.add(InventoryTransaction(
            tenant_id=ctx.tenant_id, product_id=product.id,
            delta=-line.qty, reason="order_placed",
            optical_order_id=order.id, staff_id=staff.id if staff else None,
        ))
    order.status = "placed"
    await log_action(db, ctx, AuditAction.OPTICAL_ORDER_PLACE, "optical_order", order.id,
        staff_id=staff.id if staff else None, patient_id=order.patient_id,
        ip_address=request.client.host if request.client else None)
    await db.flush()
    # Re-fetch with selectinload after flush — required by .claude/rules/backend-python.md
    order = (await db.execute(
        select(OpticalOrder).where(OpticalOrder.id == order.id)
        .options(selectinload(OpticalOrder.line_items))
    )).scalar_one()
    await db.commit()
    return _order_response(order)
```

### Pattern 2: Per-tenant SKU partial unique index
**What:** Allow soft-deleted products to keep their SKU; only enforce uniqueness on active rows.
**When to use:** `0017_retail_inventory.py` migration on `products` table.
**Source:** `backend/alembic/versions/0012_insurance_revamp_fields.py:64–67` — verbatim shape:
```python
op.execute(
    "CREATE UNIQUE INDEX uq_products_active_sku "
    "ON products (tenant_id, sku) WHERE is_active = true"
)
```

### Pattern 3: Encounter optical_status rollup (computed)
**What:** Optical-queue card status no longer reads `Encounter.optical_status` directly. It computes:
- if any `OpticalOrder.status == 'placed'` for that encounter → display `in_progress`
- else if all orders are `dispensed` → display `dispensed`
- else fall back to `Encounter.optical_status` (Phase 6 column stays as-is).

**Where to wire:** `backend/api/routes/optical.py:199–242` — extend the queue-loop to fetch `OpticalOrder` rows for each encounter via `selectinload`, then compute display status. CONTEXT.md §C explicitly says "Phase 14 must respect this rollup."

### Anti-Patterns to Avoid
- **Don't decrement stock on order create (`draft`)** — only on `placed` transition. CONTEXT.md §B locks this. Decrementing-on-create breaks the abandoned-draft scenario.
- **Don't issue separate HTTP requests from frontend to "decrement stock then place order"** — single `POST /place` endpoint handles both atomically. Project rule from `clinical-safety.md`: "never fire-and-forget fetch calls."
- **Don't camelize Product.attributes JSONB at the apiFetch boundary** — see Pitfall 1 below; attribute JSON keys must round-trip without case conversion.
- **Don't use SQLAlchemy native enums** for ProductType, OrderStatus, InventoryReason — see Pitfall 3.
- **Don't use `db.refresh()` after `db.flush()`** — use `selectinload` re-fetch instead. See Pitfall 2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| BFF → FastAPI proxy | Custom fetch wrapper | `proxyToFastAPI()` from `lib/bff.ts` | Handles Supabase auth (`getUser()` then `getSession()` for token), trailing-slash quirk, 204, timeout, 504. See `app/api/payers/route.ts` (3-line proxy). |
| Audit log entries | Direct `AuditLog(...)` inserts | `log_action()` from `backend/core/audit.py:20–78` | Centralized — already handles `tenant_id`, `user_id`, `staff_id`, `ip_address`, JSONB `changes` |
| Permission gating on routes | Hand-rolled role checks | `require_permission(ClinicalAction.X)` from `backend/core/permissions.py:159` | FastAPI dependency factory — already raises 403 with structured detail |
| Entitlement gating on routes | Hand-rolled plan checks | `require_entitlement(key)` from `backend/core/entitlements.py:76` | Reads `ctx.plan_name`, returns 403 with `{code, entitlement, plan}` |
| camelCase ↔ snake_case wire conversion | Manual key renaming | `apiFetch` does it via `camelizeKeys`/`snakifyKeys` automatically; or use raw `fetch + getAuthHeaders()` to opt out (see Pitfall 1) | `lib/api-client.ts:104–126` |
| 480px right-side drawer | Custom modal | Clone `components/schedule/AppointmentDetailDrawer.tsx` | ESC handler, backdrop click, `translate-x-full` open/close, `w-[480px] max-md:w-full`, `aria-modal`, early-return null when `!open && !appt` (Phase 10.2-07 fix) |
| List + CRUD modal admin tab | New layout | Clone `PayersSection` from `app/(tenant)/[tenant]/admin/page.tsx:2267–2492` | Already handles loading state, empty state, modal toggle, table-with-actions |
| Patient detail tab registration | New page | Edit `TABS` array in `app/(tenant)/[tenant]/patients/[patientId]/page.tsx:54–64` and add a `dynamic()` import | Existing `MessagesTab` (Phase 12) is the most recent precedent |
| Sidebar nav with entitlement gate | New nav code | Add `NavItem` to `navItems` in `components/Sidebar.tsx:147–154` with `requiredEntitlement: Entitlement.RETAIL_POS` | Existing pattern hides locked items via `locked` derived from `has(...)` |
| Date / time formatting | Manual `Intl` | `formatClinicDate` / `formatClinicTime` from `lib/timezone` | Already tenant-timezone aware |
| Glass UI primitives | Inline styles | `glass-card`, `glass-input`, `Card`, `Badge`, `Button` from `components/ui/*` | Project design system |

**Key insight:** Phase 13 has zero novel architecture. Every problem (CRUD, audit, drawer, entitlement, partial unique index, JSONB attributes, status enum as VARCHAR) has a 3-month-old or younger precedent in this repo. The planner should treat these as copy-with-find-replace tasks, not design tasks.

## Common Pitfalls

### Pitfall 1: Recursive `camelizeKeys` will mangle `Product.attributes` JSONB
**What goes wrong:** `apiFetch` runs `camelizeKeys(json)` recursively on the entire response (`lib/api-client.ts:126`). If a frame's JSONB attributes ship `{"eye_size": 52, "bridge_size": 18}`, the FE receives `{eyeSize: 52, bridgeSize: 18}`. Save back through `apiFetch` and `snakifyKeys` (`api-client.ts:105`) re-converts — but if any nested JSON contains a key that doesn't round-trip cleanly (e.g. `axis` stays `axis`, but `power` ↔ `power`), or if the round-trip is asymmetric (e.g. `base_curve` ↔ `baseCurve` works, but a custom user key `BC_2` does not), the JSONB silently corrupts.
**Why it happens:** `apiFetch` recursively walks the entire response object — it doesn't know which fields are domain JSONB and which are surface camelCase.
**How to avoid:** Two safe options — pick one and document on the route:
1. **Use raw `fetch + getAuthHeaders()`** for inventory + optical-order fetches (mirror `fetchPatientInsurance` from `lib/api-client.ts:135–139`). Keep snake_case end-to-end inside `Product.attributes`.
2. Alternatively, on save, explicitly `snakifyKeys(draftAttributes)` before submit, and on load, *do not* camelize the `attributes` field (mutate the response post-fetch).
**Memory reference:** `feedback_camelizekeys_nested.md` — this exact bug bit Phase 12 inbound JSONB.

### Pitfall 2: `MissingGreenlet` after `db.flush()` if you use `db.refresh()`
**What goes wrong:** `db.refresh(order)` after creating an `OpticalOrder` raises `sqlalchemy.exc.MissingGreenlet` in async context.
**Why it happens:** `db.refresh` issues a synchronous-style lazy load; SQLAlchemy 2.0 async needs `selectinload`.
**How to avoid:** After `db.flush()`, re-fetch via `select(...).options(selectinload(...))`. See `payer.py:140–148` (post-bulk-update re-fetch) and `payer.py:206–212` (post-create re-fetch with eager relationships).
**Source:** `.claude/rules/backend-python.md` line 7.

### Pitfall 3: Native PostgreSQL enums require `ALTER TYPE` migrations
**What goes wrong:** `sa.Enum(ProductType, name="product_type")` creates a native PG enum type; adding a new value later requires `ALTER TYPE ... ADD VALUE ...`.
**Why it happens:** Default SQLAlchemy `Enum()` uses `native_enum=True`.
**How to avoid:** Use the project's wrapper from `clinical.py:36–40`:
```python
def Enum(enum_class, **kw):
    kw.setdefault("native_enum", False)
    return _Enum(enum_class, values_callable=lambda e: [x.value for x in e], **kw)
```
Stores as VARCHAR; new enum values require zero migration. Apply to `ProductType`, `OrderStatus`, `InventoryReason`.
**Source:** `.claude/rules/backend-python.md` line 7.

### Pitfall 4: 204 No Content from "no orders yet" endpoints
**What goes wrong:** Returning `null`-equivalent for "no orders for this patient" as 404 trips the FE error handler.
**Why it happens:** REST convention conflict — empty list vs missing resource.
**How to avoid:** For `GET /api/optical-orders?patient_id=X` returning empty, return **200 with `[]`**, not 204 (a list endpoint should always return a list). For `GET /api/optical-orders/{id}` not-found, **404 is correct**. The 204 quirk only applies to single-record lazy endpoints (vitals, exam-findings, superbill) — see `MEMORY.md` "Encounter Architecture". Phase 13 has no such single-record lazy endpoints.

### Pitfall 5: Decrementing stock without `SELECT ... FOR UPDATE` allows race condition
**What goes wrong:** Two simultaneous `POST /place` calls for orders sharing a product can both read `stock_qty=1` and both decrement to 0, then 1 becomes -1 with no transaction-level protection.
**Why it happens:** Transaction isolation in PostgreSQL is `READ COMMITTED` by default; concurrent reads see the same baseline.
**How to avoid:** Use `with_for_update()` on the product row inside the place handler (see Pattern 1 above). Project precedent: limited — explicit row-locking is rare in this codebase, but it's the textbook fix and `clinical-safety.md` "primary DB transaction" rule strongly implies it.
**Warning sign:** E2E spec for two-concurrent-orders-same-product produces stock_qty < 0 without warning.

### Pitfall 6: New `ClinicalAction` enum values must be added to `PERMISSION_MATRIX`
**What goes wrong:** `require_permission(ClinicalAction.MANAGE_INVENTORY)` returns 403 for ALL roles because the enum value isn't in the matrix; the dependency reads `PERMISSION_MATRIX.get(action, set())` which defaults to empty set.
**How to avoid:** Every new `ClinicalAction` value gets a row in `PERMISSION_MATRIX` (`backend/core/permissions.py:94–151`). Symmetrical edits — both files in same plan task.

### Pitfall 7: Forgetting BFF route after creating a backend route
**What goes wrong:** New backend route `POST /api/optical-orders/` works in pytest but BFF returns 404 from browser.
**Why it happens:** Project rule: every backend route needs a matching `app/api/.../route.ts`. The middleware allowlist enumerates only `/api/public/` and `/api/address/` as auth-free; everything else requires the BFF passthrough.
**How to avoid:** `.claude/rules/bff-api.md`: "New backend endpoints MUST also get a BFF proxy route in `app/api/`". Cross-check during plan tasks.

### Pitfall 8: Contract drift between Pydantic response and TS type
**What goes wrong:** `OpticalOrderResponse` returns `total_price`, FE expects `totalPrice`, but a hand-mocked unit test does NOT catch the divergence because both sides use the same hand-typed mock.
**Why it happens:** Memory: `feedback_contract_tests.md`.
**How to avoid:** New FE/BE endpoint pairs need a contract test — choose one of:
- `pydantic by_alias` assert: `OpticalOrderResponse.model_validate({...}).model_dump(by_alias=True)` matches `Object.keys(typescriptType)` literal
- E2E test that round-trips real wire bytes
- Schema-derived TS type (`openapi-typescript`) — not currently used in repo

## Code Examples

Verified patterns from current codebase:

### CRUD route shape (mirror for `inventory.py`)
```python
# Source: backend/api/routes/payer.py:177–213 (POST create — most relevant template)
@router.post("/", response_model=PayerResponse, status_code=status.HTTP_201_CREATED)
async def create_payer(
    payload: PayerCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    staff = await resolve_staff(ctx, db)
    payer = InsurancePayer(
        tenant_id=ctx.tenant_id, name=payload.name, payer_id=payload.payer_id,
        phone=payload.phone, address=payload.address, is_active=payload.is_active,
    )
    db.add(payer)
    await db.flush()
    await log_action(
        db, ctx, AuditAction.CREATE, "insurance_payer", payer.id,
        staff_id=staff.id if staff else None,
        detail=f"Created payer: {payer.name}",
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    payer = (await db.execute(
        select(InsurancePayer).where(InsurancePayer.id == payer.id)
    )).scalar_one()
    return _payer_response(payer)
```
For Phase 13: replace `MANAGE_BILLING` → `MANAGE_INVENTORY`, `AuditAction.CREATE` → `AuditAction.PRODUCT_CREATE`, and use `selectinload(Product.attributes_unused_or_none)` if the model has eager relationships.

### BFF proxy shape (3 files — list+create, detail+patch+delete, action)
```typescript
// Source: app/api/payers/route.ts (verbatim — list+create)
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, "/api/payers/");
}
export async function POST(request: NextRequest) {
  return proxyToFastAPI(request, "/api/payers/");
}
```
```typescript
// Source: app/api/payers/[payerId]/route.ts (verbatim — detail+patch+delete)
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { payerId: string } }) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/`);
}
export async function PATCH(request: NextRequest, { params }: { params: { payerId: string } }) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/`);
}
export async function DELETE(request: NextRequest, { params }: { params: { payerId: string } }) {
  return proxyToFastAPI(request, `/api/payers/${params.payerId}/`);
}
```
```typescript
// Source: app/api/appointments/[appointmentId]/check-in/route.ts (verbatim — action endpoint)
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const { appointmentId } = await params;
  return proxyToFastAPI(request, `/api/appointments/${appointmentId}/check-in`);
}
```
**NOTE the trailing slash:** `/api/payers/` and `/api/payers/${id}/` — required by FastAPI; `/check-in` (no trailing slash) is fine because it's a final action segment. The CONTEXT.md J list correctly uses trailing slashes; planner should keep them.

### Entitlement key pair pattern
```python
# Source: backend/core/entitlements.py:24–37 (extend with one line)
class Entitlement(StrEnum):
    SCHEDULING = "scheduling"
    # ... existing keys ...
    MESSAGING = "messaging"
    RETAIL_POS = "retail_pos"   # ← NEW (Phase 13 + Phase 15 add-on)
```
```typescript
// Source: lib/entitlements.ts:25–49 (extend Entitlement object)
export const Entitlement = {
  // ... existing ...
  MESSAGING: "messaging" as const,
  RETAIL_POS: "retail_pos" as const,   // ← NEW
} satisfies Record<string, EntitlementKey>;
```
```typescript
// Source: lib/entitlements.ts:90–155 ENTITLEMENT_META — add entry
retail_pos: {
  label: "Retail & POS",
  description: "Inventory catalog, optical orders, and point-of-sale checkout.",
  plan: "Add-on",
},
```
```python
# CRITICAL DIFFERENCE FROM MESSAGING:
# Do NOT add Entitlement.RETAIL_POS to PLAN_FEATURES["Plus"] or ["Premium"].
# It is purchased separately. The dict stays:
PLAN_FEATURES = {
    "Core":    { ... unchanged ... },
    "Plus":    { ... unchanged (still includes MESSAGING) ... },
    "Premium": { ... unchanged ... },
}
# Same in lib/entitlements.ts PLAN_FEATURES.
```

### Add new ClinicalAction values
```python
# Source: backend/core/permissions.py:26–82 (extend enum + matrix)
class ClinicalAction(StrEnum):
    # ... existing ...

    # Inventory & Optical Orders (Phase 13)
    VIEW_INVENTORY = "view_inventory"
    MANAGE_INVENTORY = "manage_inventory"
    CREATE_OPTICAL_ORDER = "create_optical_order"
    VIEW_OPTICAL_ORDER = "view_optical_order"
    CANCEL_OPTICAL_ORDER = "cancel_optical_order"

# AND in PERMISSION_MATRIX (lines 94–151) add:
    ClinicalAction.VIEW_INVENTORY:        {_D, _T, _R, _A, _O},
    ClinicalAction.MANAGE_INVENTORY:      {_A, _O},
    ClinicalAction.CREATE_OPTICAL_ORDER:  {_T, _R, _A, _O},
    ClinicalAction.VIEW_OPTICAL_ORDER:    {_D, _T, _R, _A, _O},
    ClinicalAction.CANCEL_OPTICAL_ORDER:  {_A, _O},
```

### Add new AuditAction values
```python
# Source: backend/db/models/tenant/clinical.py:127–195 (extend enum)
class AuditAction(str, enum.Enum):
    # ... existing ...

    # Phase 13 — Retail Inventory & Optical Orders (migration 0017)
    # Stored as VARCHAR(50); no ALTER TYPE needed (see 0008_claims_basics.py:78).
    PRODUCT_CREATE = "product_create"
    PRODUCT_UPDATE = "product_update"
    PRODUCT_DEACTIVATE = "product_deactivate"
    STOCK_RECEIVE = "stock_receive"
    STOCK_ADJUST = "stock_adjust"
    OPTICAL_ORDER_CREATE = "optical_order_create"
    OPTICAL_ORDER_PLACE = "optical_order_place"
    OPTICAL_ORDER_CANCEL = "optical_order_cancel"
    OPTICAL_ORDER_DISPENSE = "optical_order_dispense"
```

### Audit log call shape
```python
# Source: backend/api/routes/optical.py:243–250
await log_action(
    db, ctx, AuditAction.OPTICAL_ORDER_PLACE, "optical_order", order.id,
    staff_id=staff.id if staff else None,
    encounter_id=order.encounter_id,
    patient_id=order.patient_id,
    detail=f"Placed optical order {order.id} ({len(order.line_items)} line items, total {order.total_price})",
    changes={"status": {"old": "draft", "new": "placed"}},
    ip_address=request.client.host if request.client else None,
)
```

### Migration shape — partial unique index + JSONB column + signed-int + composite index
```python
# Source pattern: backend/alembic/versions/0012_insurance_revamp_fields.py:22–73
# Source pattern: backend/alembic/versions/0014_staff_scheduling.py:20–32

revision: str = "0017_retail_inventory"
down_revision: str = "0016_crm_messaging"

def upgrade() -> None:
    # products
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_type", sa.String(20), nullable=False),     # VARCHAR per backend-python.md
        sa.Column("brand", sa.String(100), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("sku", sa.String(100), nullable=False),
        sa.Column("upc", sa.String(50), nullable=True),
        sa.Column("attributes", postgresql.JSONB(), nullable=False, server_default="'{}'::jsonb"),
        sa.Column("retail_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("cost_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("stock_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reorder_threshold", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("product_type IN ('frame', 'contact_lens')", name="ck_product_type"),
    )
    op.create_index("ix_products_tenant_id", "products", ["tenant_id"])
    op.create_index("ix_products_tenant_type_active", "products", ["tenant_id", "product_type", "is_active"])
    # Partial unique index — verbatim shape from 0012:
    op.execute(
        "CREATE UNIQUE INDEX uq_products_active_sku "
        "ON products (tenant_id, sku) WHERE is_active = true"
    )

    # optical_orders
    op.create_table(
        "optical_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("encounter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("encounters.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("total_price", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("staff.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("placed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispensed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('draft','placed','dispensed','cancelled')", name="ck_optical_order_status"),
    )
    op.create_index("ix_optical_orders_tenant_patient", "optical_orders", ["tenant_id", "patient_id"])
    op.create_index("ix_optical_orders_encounter", "optical_orders", ["encounter_id"])

    # optical_order_line_items — Phase 14 will ADD COLUMN here for lens config
    op.create_table(
        "optical_order_line_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("optical_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_optical_order_line_items_order", "optical_order_line_items", ["order_id"])

    # inventory_transactions — append-only audit-style table for stock movements
    op.create_table(
        "inventory_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),  # signed: -2 = decrement; +5 = receive
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("optical_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("optical_orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("staff_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("staff.id", ondelete="SET NULL"), nullable=True),
        sa.Column("po_reference", sa.String(100), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "reason IN ('order_placed','order_cancelled','receive_stock','manual_adjust')",
            name="ck_inventory_reason",
        ),
    )
    op.create_index("ix_inventory_transactions_product", "inventory_transactions", ["product_id", "created_at"])

def downgrade() -> None:
    op.drop_table("inventory_transactions")
    op.drop_table("optical_order_line_items")
    op.drop_table("optical_orders")
    op.execute("DROP INDEX IF EXISTS uq_products_active_sku")
    op.drop_table("products")
```

### 480px right-slide drawer (mirror for `OrderDetailDrawer`)
```tsx
// Source: components/schedule/AppointmentDetailDrawer.tsx:53–134
// ESC handler — keep verbatim
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) onClose();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [open, onClose]);

// Hydration safety — keep verbatim (Phase 10.2-07 fix)
if (!open && !appt) return null;

// Drawer panel — keep verbatim except `aria-label` text
<div
  className={`fixed right-0 top-0 bottom-0 z-50 w-[480px] max-md:w-full bg-[var(--bg-surface)] border-l border-[var(--border-default)] shadow-2xl flex flex-col transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
    open ? "translate-x-0" : "translate-x-full pointer-events-none"
  }`}
  role="dialog"
  aria-modal="true"
  aria-label={`Order details for ${order?.patientName ?? "patient"}`}
>
  {/* Always-visible close button — outside the order ternary */}
  <button
    type="button"
    onClick={onClose}
    className="absolute top-4 right-4 z-10 p-1.5 rounded-md ..."
    aria-label="Close drawer"
  >
    <X className="w-5 h-5" />
  </button>
  {order ? ( ... ) : ( ... )}
</div>
```

### Patient detail tab registration (verbatim shape)
```tsx
// Source: app/(tenant)/[tenant]/patients/[patientId]/page.tsx:54–64
type TabKey = "demographics" | "encounters" | "flowsheets" | "rx-history" | "insurance" | "billing" | "messages" | "orders";

const TABS: { key: TabKey; label: string }[] = [
  { key: "demographics", label: "Patient Info" },
  // ... existing 6 tabs ...
  { key: "messages", label: "Messages" },
  { key: "orders", label: "Orders" },   // ← NEW (gated by retail_pos)
];

// Then below in render section (line ~542-556):
const OrdersTab = dynamic(
  () => import("@/components/orders/OrdersTab").then((m) => ({ default: m.OrdersTab })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
// In TABS render:
{activeTab === "orders" && has(Entitlement.RETAIL_POS) && <OrdersTab patientId={patientId} />}
// And in the TABS array filter, hide "orders" when !has(Entitlement.RETAIL_POS) — there is no
// existing utility for tab-array filtering on this page, so add a `.filter(...)` before .map.
```

### Sidebar nav addition
```tsx
// Source: components/Sidebar.tsx:147–168
const navItems: NavItem[] = [
  // ... existing 6 items ...
  { label: "Optical", href: `${base}/optical`, icon: Icon.Optical },
  // ↓ NEW
  {
    label: "Inventory",
    href: `${base}/inventory`,
    icon: Icon.Optical,    // reuse Optical icon, or add new Icon.Inventory in the Icon obj
    requiredEntitlement: Entitlement.RETAIL_POS,
  },
  { label: "Billing", href: `${base}/billing`, icon: Icon.Billing, requiredRoles: ["doctor", "admin", "owner"] },
];
// renderNavItem already honors `requiredEntitlement` via the `locked` derived flag (line 191).
```

### Zustand store shape (mirror for `inventoryStore` and `opticalOrderStore`)
```typescript
// Source: store/payerStore.ts:1–120 (verbatim shape — replace InsurancePayer with Product)
export const useInventoryStore = create<InventoryStore>()(
  devtools(
    (set, get) => ({
      products: [],
      filters: { type: "frame", search: "", stockStatus: "all", activeOnly: true },
      loading: false,
      error: null,

      loadProducts: async () => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams(/* serialize filters */);
          const res = await fetch(`/api/inventory/products?${params}`);
          if (!res.ok) throw new Error("Failed to load products");
          set({ products: await res.json(), loading: false });
        } catch (e) { set({ error: String(e), loading: false }); }
      },

      // Note: use raw fetch (not apiFetch) to preserve attributes JSONB snake_case.
      // See Pitfall 1 above.
      // ... createProduct, updateProduct, deactivateProduct, receiveStock, adjustStock
    }),
    { name: "inventoryStore" },
  ),
);
```

### Seed shape — extend `backend/seed_db.py`
```python
# Source: backend/seed_db.py:1751–1816 _seed_insurance_payers — same shape
def _seed_retail_inventory(session: Session) -> None:
    step("Seeding Retail Inventory (frames + contacts)")

    FRAMES = [
        # (sku,                       brand,    model,         color, eye_size, bridge, temple, gender, material,  retail, cost, stock)
        ("FR-RAYBAN-WAYFARER-BLK-52", "Ray-Ban", "Wayfarer",   "Black", 52, 18, 145, "unisex", "acetate", 195.00, 75.00, 5),
        # ... 9 more
    ]
    for (sku, brand, model, color, eye, bridge, temple, gender, material, retail, cost, stock) in FRAMES:
        if session.execute(_select(Product).where(
            Product.tenant_id == TENANT_ID, Product.sku == sku, Product.is_active.is_(True)
        )).first():
            continue
        session.add(Product(
            id=uuid.uuid4(), tenant_id=TENANT_ID,
            product_type="frame", brand=brand, model=model, sku=sku,
            attributes={"brand": brand, "model": model, "color": color,
                        "eye_size": eye, "bridge_size": bridge, "temple_size": temple,
                        "gender": gender, "material": material},
            retail_price=Decimal(str(retail)), cost_price=Decimal(str(cost)),
            stock_qty=stock, reorder_threshold=3, is_active=True,
        ))

    CONTACTS = [
        # (sku,                          brand,        model,             modality,  bc,  diam, power, box)
        ("CL-ACUVUE-OASYS-DAILY-OD-200", "Acuvue",    "Oasys 1-Day",      "daily",   8.5, 14.3, -2.00,  90),
        # ... 4 more
    ]
    for (sku, brand, model, modality, bc, diam, power, box) in CONTACTS:
        if session.execute(_select(Product).where(
            Product.tenant_id == TENANT_ID, Product.sku == sku, Product.is_active.is_(True)
        )).first():
            continue
        session.add(Product(
            id=uuid.uuid4(), tenant_id=TENANT_ID,
            product_type="contact_lens", brand=brand, model=model, sku=sku,
            attributes={"brand": brand, "modality": modality, "base_curve": bc,
                        "diameter": diam, "power": power, "box_size": box},
            retail_price=Decimal("65.00"), cost_price=Decimal("28.00"),
            stock_qty=20, reorder_threshold=5, is_active=True,
        ))
    session.flush()
    ok(f"Created {len(FRAMES)} frames + {len(CONTACTS)} contact lens products")

# Wire into orchestrator:
def seed_tenant_schema(session):
    # ... existing seeds ...
    _seed_insurance_payers(session)
    _seed_retail_inventory(session)   # ← NEW
```

### Phase 6 optical-queue rollup edit (where to wire the status reconciliation)
```python
# Source: backend/api/routes/optical.py:199–242
# CURRENT loop fetches Encounter + final_rx, computes alert, returns OpticalQueueItem with
# status=_safe_optical_status(enc.optical_status).
#
# Phase 13 must extend this. Inside the loop, after fetching enc:
#   orders = (await db.execute(
#       select(OpticalOrder)
#       .where(OpticalOrder.encounter_id == enc.id, OpticalOrder.tenant_id == ctx.tenant_id)
#   )).scalars().all()
#
#   if any(o.status == "placed" for o in orders):
#       computed_status = OpticalStatus.IN_PROGRESS
#   elif orders and all(o.status == "dispensed" for o in orders):
#       computed_status = OpticalStatus.DISPENSED
#   else:
#       computed_status = _safe_optical_status(enc.optical_status)
#
# Or — simpler and faster — preload via selectinload(Encounter.optical_orders) and compute
# in Python without an extra round-trip per encounter. Add the back-relationship on Encounter:
#   optical_orders: Mapped[list["OpticalOrder"]] = relationship(
#       "OpticalOrder", back_populates="encounter", order_by="OpticalOrder.created_at"
#   )
# and in the queue query: .options(selectinload(Encounter.optical_orders))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Hard `UniqueConstraint("patient_id", "priority")` | Partial unique index `WHERE is_active = true` | Phase 10.1 (2026-04-03) | Soft-delete preserves historical rows; new active row silently deactivates predecessor. Apply same pattern to `Product.sku`. |
| Native PG enum + `ALTER TYPE` migrations | VARCHAR + `Enum(..., native_enum=False)` wrapper | Phase 1 baseline | New audit/clinical action values require ZERO migration. See `0008_claims_basics.py:78` comment. |
| Modal dialog for booking | Right-side slide drawer | Phase 10.2 | All future detail surfaces use the 480px drawer. `OrderDetailDrawer` follows. |
| Hand-rolled BFF auth | Centralized `proxyToFastAPI` | Phase 1 | 3-line route handlers — Phase 13 BFF routes are ~5 lines each. |
| Mixed mock/real session in stores | apiFetch + Supabase JWT | Phase 2 | Inventory store fetches via real `/api/inventory/products` — no mock data. |

**Deprecated/outdated in this domain:**
- The old `tests/e2e/*.spec.js` files using `require('playwright')` are NOT runnable (per `MEMORY.md`). Phase 13 E2E specs MUST use `tests/e2e/*.spec.ts` with `import { test, expect } from "./fixtures"` and `storageState`.
- `db.refresh()` after `db.flush()` in async — replaced by `selectinload` re-fetch (see Pitfall 2).

## Open Questions

1. **Concurrent stock-decrement protection — `SELECT ... FOR UPDATE` vs serializable isolation?**
   - What we know: Project precedent is thin; explicit row locking is uncommon.
   - What's unclear: Whether the planner should mandate `with_for_update()` in the place handler, or accept that v1 single-clinic / low-concurrency makes the race practically unhittable.
   - Recommendation: Ship `with_for_update()` in place + cancel handlers AND add a focused pytest that replays two simultaneous places against shared product. Cost is one line; risk avoidance is large.

2. **Should Encounter add a `optical_orders` back-relationship?**
   - What we know: Phase 13 wants to compute optical-queue card status from order rows.
   - What's unclear: Whether Phase 14 will further depend on this back-ref.
   - Recommendation: Add `Encounter.optical_orders` relationship (`order_by="OpticalOrder.created_at"`). Use `selectinload` in the queue query for one round-trip.

3. **OrderStatus rollup tie-break: a mix of `placed` and `cancelled` orders?**
   - What we know: CONTEXT §C says: any `placed` → `in_progress`; all `dispensed` → `dispensed`; else fall back to encounter column.
   - What's unclear: What if an encounter has only `cancelled` orders?
   - Recommendation: Treat cancelled as "no live orders" — fall back to `Encounter.optical_status`. Document this in PLAN.md and an integration test.

4. **`po_reference` on the receive-stock action — required or optional?**
   - What we know: CONTEXT §B says "optional `po_reference`."
   - Recommendation: Plain text, optional, `String(100)` on `InventoryTransaction`. Future PO module (V3) is out of scope.

5. **SKU collision policy — silent suffix or error to user?**
   - What we know: CONTEXT explicitly leaves to Claude's discretion.
   - Recommendation: Auto-append numeric suffix `(-2, -3, ...)` on the server inside `create_product`; log a warning; return the actual SKU in the response so the UI can echo it. This avoids modal round-trip friction.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend Framework | pytest + pytest-asyncio (existing — used by Phase 10.3 plan-04 tests, Phase 12 messaging tests) |
| Frontend Framework | vitest (`npx vitest run <file>` — uses `--reporter`, NOT `--testPathPattern`) |
| E2E Framework | Playwright `@playwright/test` (`tests/e2e/*.spec.ts` with `storageState` per `playwright.config.ts`) |
| Backend test config | `backend/pyproject.toml` / pytest convention; tests live under `backend/tests/` |
| FE test config | `vitest.config.ts` at repo root |
| Quick run command (BE) | `cd backend && pytest tests/test_inventory_atomicity.py -x` |
| Quick run command (FE unit) | `npx vitest run tests/unit/inventoryStore.test.ts` |
| Quick run command (E2E) | `bash scripts/dev.sh pre-test && npx playwright test tests/e2e/retail-inventory.spec.ts` |
| Full suite command | `npx vitest run && cd backend && pytest && cd .. && bash scripts/dev.sh pre-test && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| INV-01 | Admin can create/edit/deactivate Product (Frames + Contacts) | E2E | `npx playwright test tests/e2e/retail-inventory.spec.ts -g "admin CRUD"` | ❌ Wave 0 |
| INV-02 | Optical staff creates order from encounter Rx | E2E | `npx playwright test tests/e2e/retail-inventory.spec.ts -g "create from encounter"` | ❌ Wave 0 |
| INV-03 | Place transition decrements stock atomically | unit (pytest) | `cd backend && pytest tests/test_inventory_atomicity.py::test_place_decrements_stock_atomically -x` | ❌ Wave 0 |
| INV-03b | Cancel transition restocks atomically | unit (pytest) | `cd backend && pytest tests/test_inventory_atomicity.py::test_cancel_restocks_stock_atomically -x` | ❌ Wave 0 |
| INV-03c | Concurrent places do not over-decrement (with_for_update) | unit (pytest) | `cd backend && pytest tests/test_inventory_atomicity.py::test_concurrent_place_no_negative_stock -x` | ❌ Wave 0 |
| INV-04 | Inventory page filters by type, stock-status, active, gender/modality | E2E | `npx playwright test tests/e2e/retail-inventory.spec.ts -g "filters"` | ❌ Wave 0 |
| INV-05 | Patient Orders tab shows chronological history | E2E | `npx playwright test tests/e2e/retail-inventory.spec.ts -g "patient orders tab"` | ❌ Wave 0 |
| INV-06 | Single Product table with JSONB attributes round-trips without camelize corruption | unit (vitest) | `npx vitest run tests/unit/productAttributesRoundTrip.test.ts` | ❌ Wave 0 |
| INV-07 | Partial unique index on `(tenant_id, sku) WHERE is_active = true` | unit (pytest) | `cd backend && pytest tests/test_inventory_atomicity.py::test_sku_partial_unique -x` | ❌ Wave 0 |
| INV-09 | Order status lifecycle enforces `draft → placed → dispensed` and `* → cancelled` | unit (pytest) | `cd backend && pytest tests/test_optical_order_lifecycle.py -x` | ❌ Wave 0 |
| INV-10 | Walk-in order has null encounter_id | unit (pytest) | `cd backend && pytest tests/test_optical_order_lifecycle.py::test_walkin_no_encounter -x` | ❌ Wave 0 |
| INV-12 | Encounter optical-queue rollup computes correctly | unit (pytest) | `cd backend && pytest tests/test_optical_queue_rollup.py -x` | ❌ Wave 0 |
| INV-14/INV-15 | New ClinicalAction + AuditAction values are wired into PERMISSION_MATRIX & VARCHAR audit log | contract (pytest) | `cd backend && pytest tests/test_inventory_permissions.py -x` | ❌ Wave 0 |
| INV-16/INV-17 | `retail_pos` entitlement gates UI surfaces; NOT in PLAN_FEATURES | E2E | `npx playwright test tests/e2e/retail-inventory.spec.ts -g "entitlement gate"` | ❌ Wave 0 |
| INV-19 | Seed adds 10 frames + 5 contacts | smoke (pytest) | `cd backend && pytest tests/test_seed_inventory.py -x` | ❌ Wave 0 |
| INV-20 | Zero-stock soft-block (warn, allow place) | E2E | `npx playwright test tests/e2e/retail-inventory.spec.ts -g "zero stock soft block"` | ❌ Wave 0 |
| Contract | OpticalOrderResponse + ProductResponse Pydantic by_alias matches TS type | contract (pytest) | `cd backend && pytest tests/test_optical_order_contract.py -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd backend && pytest tests/test_inventory_atomicity.py -x && cd .. && npx vitest run tests/unit/` — fast (~10 s)
- **Per wave merge:** Full backend pytest + full vitest + the single retail-inventory Playwright spec.
- **Phase gate:** Full suite green AND manual canary: seed → log in as admin → create 1 frame → create order from encounter → place → verify stock decremented → cancel → verify stock restored. Captured in `13-VERIFICATION.md` as a HIPAA-style human checkpoint row.

### Wave 0 Gaps

- [ ] `backend/tests/test_inventory_atomicity.py` — covers INV-03, INV-03b, INV-03c, INV-07
- [ ] `backend/tests/test_optical_order_lifecycle.py` — covers INV-09, INV-10
- [ ] `backend/tests/test_optical_queue_rollup.py` — covers INV-12
- [ ] `backend/tests/test_inventory_permissions.py` — covers INV-14, INV-15 (matrix + audit log row written)
- [ ] `backend/tests/test_optical_order_contract.py` — Pydantic by_alias contract test (per memory `feedback_contract_tests.md`)
- [ ] `backend/tests/test_seed_inventory.py` — covers INV-19
- [ ] `tests/unit/productAttributesRoundTrip.test.ts` — covers INV-06; uses real `apiFetch` flow with mocked fetch boundary to surface camelizeKeys corruption
- [ ] `tests/e2e/retail-inventory.spec.ts` — covers INV-01, INV-02, INV-04, INV-05, INV-16/17, INV-20 with five scenarios:
  1. Admin CRUD: create + edit + soft-delete a frame
  2. Create order from optical-queue card → place → stock decrements + alert badge
  3. Inventory filters: type tab + stock-status + gender
  4. Patient Orders tab: chronological list + click → drawer + cancel → stock restores
  5. Entitlement gate: switch to dev session WITHOUT `retail_pos` → sidebar Inventory hidden + patient Orders tab hidden + queue card "Create Order" CTA hidden
- [ ] `backend/tests/conftest.py` extension — `product_factory()`, `optical_order_factory()` fixtures (mirror existing `payer_factory` / `appointment_factory` patterns if present; otherwise add minimal session-scoped factories)

No new test framework install needed — pytest, pytest-asyncio, vitest, and `@playwright/test` are all in place. The Wave 0 task is purely "create test files" + "extend conftest fixtures."

## New BFF Routes (planner copy-paste reference)

Verbatim list from CONTEXT.md §J — all use `proxyToFastAPI` with trailing-slash upstream URLs:

| Method(s) | Frontend BFF | Upstream FastAPI |
|---|---|---|
| GET, POST | `/api/inventory/products/` | `/api/inventory/products/` |
| GET, PATCH, DELETE | `/api/inventory/products/[id]/` | `/api/inventory/products/{id}/` |
| POST | `/api/inventory/products/[id]/receive/` | `/api/inventory/products/{id}/receive/` |
| POST | `/api/inventory/products/[id]/adjust/` | `/api/inventory/products/{id}/adjust/` |
| GET, POST | `/api/optical-orders/` | `/api/optical-orders/` |
| GET | `/api/optical-orders/[id]/` | `/api/optical-orders/{id}/` |
| POST | `/api/optical-orders/[id]/place/` | `/api/optical-orders/{id}/place/` |
| POST | `/api/optical-orders/[id]/cancel/` | `/api/optical-orders/{id}/cancel/` |
| POST | `/api/optical-orders/[id]/dispense/` | `/api/optical-orders/{id}/dispense/` |

Backend register in `backend/main.py` (mirror lines 87–91 for payers and 122–126 for optical):
```python
from backend.api.routes import inventory, optical_order
app.include_router(inventory.router,     prefix="/api/inventory/products", tags=["Inventory"])
app.include_router(optical_order.router, prefix="/api/optical-orders",     tags=["Optical Orders"])
```

## Sources

### Primary (HIGH confidence — all current codebase)

- `c:/Users/duytr/Projects/clarityos/.planning/phases/13-retail-inventory/13-CONTEXT.md` — locked spec
- `c:/Users/duytr/Projects/clarityos/.planning/REQUIREMENTS.md` — requirement ID conventions
- `c:/Users/duytr/Projects/clarityos/.planning/ROADMAP.md` — Phase 13/14/15 boundaries
- `c:/Users/duytr/Projects/clarityos/.claude/rules/clinical-safety.md` — primary-TXN rule
- `c:/Users/duytr/Projects/clarityos/.claude/rules/bff-api.md` — every backend route gets a BFF proxy
- `c:/Users/duytr/Projects/clarityos/.claude/rules/backend-python.md` — selectinload + VARCHAR enum
- `c:/Users/duytr/Projects/clarityos/.claude/rules/testing.md` — Playwright + vitest conventions
- `c:/Users/duytr/Projects/clarityos/CLAUDE.md` — project rules
- `c:/Users/duytr/Projects/clarityos/backend/db/models/tenant/clinical.py:36–195` — `Enum` wrapper, `AuditAction`, `Patient.medical_history_jsonb`, `Encounter.optical_status`, `PatientInsurance` model
- `c:/Users/duytr/Projects/clarityos/backend/core/audit.py:20–78` — `log_action` signature
- `c:/Users/duytr/Projects/clarityos/backend/core/permissions.py:26–193` — `ClinicalAction` enum, `PERMISSION_MATRIX`, `require_permission` factory
- `c:/Users/duytr/Projects/clarityos/backend/core/entitlements.py:24–93` — `Entitlement` enum, `PLAN_FEATURES`, `require_entitlement` factory
- `c:/Users/duytr/Projects/clarityos/lib/entitlements.ts:25–155` — TS mirror, `ENTITLEMENT_META`, plan column
- `c:/Users/duytr/Projects/clarityos/lib/bff.ts:37–102` — `proxyToFastAPI`
- `c:/Users/duytr/Projects/clarityos/lib/api-client.ts:90–139` — `apiFetch` camelize/snakify, raw `fetch + getAuthHeaders` opt-out
- `c:/Users/duytr/Projects/clarityos/backend/api/routes/optical.py:1–411` — Phase 6 queue, Rx PDF, status update
- `c:/Users/duytr/Projects/clarityos/backend/api/routes/payer.py:1–340` — CRUD route shape (most-relevant template)
- `c:/Users/duytr/Projects/clarityos/backend/schemas/optical.py:1–181` — Pydantic shape, `OpticalQueueItem`, `OpticalStatus`
- `c:/Users/duytr/Projects/clarityos/backend/schemas/common.py:1–58` — `AppBaseModel`, `CamelCaseModel`, `to_camel`
- `c:/Users/duytr/Projects/clarityos/backend/alembic/versions/0012_insurance_revamp_fields.py:22–73` — partial unique index template (verbatim source for SKU index)
- `c:/Users/duytr/Projects/clarityos/backend/alembic/versions/0014_staff_scheduling.py:20–66` — fresh-table migration template
- `c:/Users/duytr/Projects/clarityos/backend/alembic/versions/0008_claims_basics.py:78` — VARCHAR audit-action note
- `c:/Users/duytr/Projects/clarityos/backend/seed_db.py:1751–1816` — seed shape (`_seed_insurance_payers`)
- `c:/Users/duytr/Projects/clarityos/backend/main.py:42–169` — router registration shape
- `c:/Users/duytr/Projects/clarityos/store/opticalStore.ts:60–183` — Zustand store shape with apiFetch
- `c:/Users/duytr/Projects/clarityos/store/payerStore.ts:36–120` — Zustand store with raw `fetch` (closer to inventoryStore needs)
- `c:/Users/duytr/Projects/clarityos/components/schedule/AppointmentDetailDrawer.tsx:53–134` — drawer pattern
- `c:/Users/duytr/Projects/clarityos/app/(tenant)/[tenant]/admin/page.tsx:2267–2492` — `PayersSection` (clone for Inventory page)
- `c:/Users/duytr/Projects/clarityos/app/(tenant)/[tenant]/admin/page.tsx:1955–2096` — `CreatePayerModal` (clone for `ProductFormModal`)
- `c:/Users/duytr/Projects/clarityos/app/(tenant)/[tenant]/patients/[patientId]/page.tsx:54–64, 542–556` — patient tab registration
- `c:/Users/duytr/Projects/clarityos/app/(tenant)/[tenant]/optical/page.tsx:1–220` — optical queue page (where to wire "Create Order")
- `c:/Users/duytr/Projects/clarityos/components/optical/OpticalQueueCard.tsx:1–80` — queue card surface
- `c:/Users/duytr/Projects/clarityos/components/Sidebar.tsx:107–168` — nav item shape with `requiredEntitlement`
- `c:/Users/duytr/Projects/clarityos/app/api/payers/route.ts`, `app/api/payers/[payerId]/route.ts`, `app/api/appointments/[appointmentId]/check-in/route.ts` — three BFF templates (list+create, detail+patch+delete, action)
- `C:/Users/duytr/.claude/projects/c--Users-duytr-Projects-clarityos/memory/MEMORY.md` — `feedback_camelizekeys_nested.md`, `feedback_contract_tests.md`, `feedback_check_prior_commits_first.md`

### Secondary (MEDIUM confidence)

- None used — all findings sourced from primary repo files.

### Tertiary (LOW confidence)

- None — no WebSearch performed; no need given codebase precedent density.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every required dependency is already in use; zero new packages.
- Architecture: HIGH — every required pattern has 1+ in-repo precedent ≤ 3 months old.
- Pitfalls: HIGH — five of the six listed pitfalls are documented in `MEMORY.md` or `.claude/rules/*.md`.
- Migration SQL: HIGH — verbatim from `0012_insurance_revamp_fields.py`.
- Validation Architecture: HIGH — frameworks already configured; only test-file gaps to fill in Wave 0.

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (30 days for stable; revisit if Phase 12 messaging plans are still in flight when execution starts, since they touch the same `Sidebar`, `PatientDetailTabs`, and `entitlements.ts` files.)
