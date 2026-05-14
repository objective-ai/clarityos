# Phase 14: Optical Order Configuration — Research

**Researched:** 2026-05-14
**Domain:** Optical order configurator UI, lens reference catalog, AI suggestion extraction, reportlab job-ticket PDF
**Confidence:** HIGH (every Phase 14 design decision in CONTEXT.md has a working donor pattern in the repo)

<user_constraints>
## User Constraints (from 14-CONTEXT.md)

### Locked Decisions

**A. Lens catalog model** — 3 new reference tables (`lens_types`, `lens_materials`, `lens_coatings`), NOT extension of `Product`. No pricing on reference rows in Phase 14. Soft delete via `is_active=false`. Partial unique index `(tenant_id, name) WHERE is_active = true`. Seed via `_seed_lens_reference()` (4 types + 6 materials + 7 coatings, idempotent).

**B. Order schema extension — `ADD COLUMN` only.**
- On `OpticalOrder`: `vision_plan_jsonb`, `fitting_jsonb`, `habitual_refraction_id` (FK→refractions, nullable), `final_refraction_id` (FK→refractions, nullable), `job_ticket_generated_at`, `suggestion_resolutions_jsonb`.
- On `OpticalOrderLineItem`: `lens_config_jsonb` (null when frame-only / contacts).
- Single Alembic revision (0019) adds 3 reference tables + 5 OpticalOrder columns + 1 OpticalOrderLineItem column.

**C. Lifecycle preserved** — `draft → placed → dispensed → cancelled`. No new statuses. Lens config added during `draft`, locked at `placed`. Place handler runs lens-config validation (lens_type/material required when lens_config_jsonb present; seg_height_od/os required when lens_type.requires_seg_height; vertex_distance required when requires_vertex). 400 with `field_errors: [{path, code, message}]`.

**D. Full-page configurator** — `app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx`. Two-column desktop layout (left: Rx side-by-side; right: frame picker + lens config + measurements + vision plan). Autosave 1.5s debounce + flush-on-blur to PATCH `/optical-orders/{id}`. Three entry points: (1) optical-queue card "Configure Order", (2) Patient Orders tab on draft order, (3) walk-in modal redirect after create.

**E. AI suggestions — READ-ONLY extraction from `encounter.ai_summary_text` + persisted `assessment_and_plan`.** No new Claude calls, no streaming. Backend helper `extract_optical_suggestions(encounter)` returns `{ lens_type?, material?, coatings?: [], rationale: str }`. Dismissals persist via `OpticalOrder.suggestion_resolutions_jsonb`. View: `VIEW_OPTICAL_ORDER`; Accept/dismiss: `CREATE_OPTICAL_ORDER`.

**F. Job ticket PDF via reportlab** — `POST /optical-orders/{id}/job-ticket` returns 200 + `application/pdf`. Gated on `status='placed'`. Header (clinic), patient block, two-column Rx (Habitual | Final), frame, lens, coatings, measurements, vision plan, footer (staff + timestamp). Writes `JOB_TICKET_GENERATE` audit + sets `job_ticket_generated_at`. NOT persisted; streamed on demand.

**G. Permissions** — 2 new ClinicalAction values: `GENERATE_JOB_TICKET` {T, R, A, O}, `MANAGE_LENS_CATALOG` {A, O}. All Phase 14 routes inherit `Depends(require_entitlement("retail_pos"))` from Phase 13 — no new entitlement key.

**H. Audit** — 5 new AuditAction VARCHAR values: `OPTICAL_ORDER_CONFIGURE_UPDATE`, `JOB_TICKET_GENERATE`, `LENS_TYPE_CREATE`, `LENS_MATERIAL_CREATE`, `LENS_COATING_CREATE`. UPDATE/DEACTIVATE reuse with `metadata.action` discriminator. Logged in primary TXN via `log_action()`.

**I. BFF routes** (planner reference)
- `app/api/optical-orders/[orderId]/` — PATCH (configurator autosave; extends existing GET).
- `app/api/optical-orders/[orderId]/job-ticket/` — POST (PDF stream; raw `fetch` not `proxyToFastAPI`).
- `app/api/optical-orders/[orderId]/suggestions/` — GET.
- `app/api/optical-orders/[orderId]/suggestions/[suggestionId]/` — POST `accept` | `dismiss`.
- `app/api/lens-catalog/{types|materials|coatings}/` — GET, POST, plus `[id]/` GET, PATCH, DELETE.

**K. Absorb the Phase 13 `2026-05-08-optical-queue-draft-order-indicator` todo** — `OpticalQueueItem.draft_order_count` + UI pill on `OpticalQueueCard.tsx`. Also absorb INV-15 (`OrderDetailDrawer`) because routing depends on it. INV-04 / INV-05 / INV-20 stay as Phase 13 leftovers.

### Claude's Discretion

- Exact reportlab template styling (font sizes, table padding).
- Color of the ✨ AI-suggestion chip and ghosted placeholder fade-in timing.
- Validation message wording (follow Phase 9 `field_errors` precedent).
- TS camelCase field names mapping the new JSONB shapes — follow Phase 13 conventions (snake_case JSONB keys preserved verbatim).
- E2E fixture data shape (lean on Phase 13 seed).
- Whether to ship INV-15 inside Phase 14 — recommended yes; configurator routing depends on it.

### Deferred Ideas (OUT OF SCOPE)

- Vision-plan-specific pricing / allowance schedules → Phase 15 POS.
- Vendor / lab management; lab tracking states (`ordered_with_lab`, `received_from_lab`) → V3.
- Lens product images / measurement diagrams → V3.
- Bulk frame import CSV → Phase 16 / V3.
- Streaming live AI suggestions during configurator edit → V3.
- Photochromic / Transitions brand-name SKU tracking → V3.
- Tax application / refunds / returns → Phase 15 POS.
- Patient-facing "Order Status" view → V3.
- Edit-after-place workflow — cancel-and-recreate remains the only edit path.

</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 14 has no pre-assigned IDs. Planner will allocate `OPT14-01..OPT14-N` and append to `.planning/REQUIREMENTS.md`. Recommended mapping (planner can refine numbering):

| ID | Description | Research Support |
|----|-------------|------------------|
| **OPT14-01** | Configurator route opens from optical queue with Final Rx pre-populated and PD pre-filled from `refraction.pd_distance` / `pd_near` | §"Refraction Auto-fill" — Refraction model fields (pd_distance/pd_near/pd_od/pd_os) confirmed lines 776–780. Use `is_final_rx=True` + most recent `FINAL` refraction for encounter. |
| **OPT14-02** | Habitual Rx column rendered side-by-side with Final Rx in the configurator left pane (OD/OS × sphere/cyl/axis/add/prism). Delta-flag row when \|Final − Habitual\| > 0.50D SE | §"Side-by-side Rx panel" — reuse `_compute_se` shape from `backend/api/routes/optical.py:96`; Phase 6 Rx Change Alert threshold confirmed at 0.50D. |
| **OPT14-03** | Frame picker reads Phase 13 `products?type=frame` catalog; lens type/material/coatings selectable from new reference catalogs | §"Lens Reference Catalog Tables" + §"Frame Picker" — donor: `inventoryStore.loadProducts({activeOnly:true})` already used in `CreateWalkInOrderModal`. |
| **OPT14-04** | Seg height OD/OS and vertex distance captured; required-marker triggers when `lens_type.requires_seg_height=true` / `requires_vertex=true` | §"Place-time Validation" — gate logic centralized in place handler; returns 400 `field_errors`. |
| **OPT14-05** | Vision plan name, member ID, group number captured in `vision_plan_jsonb` | §"JSONB column shapes" — keys: `name, member_id, group_number, authorization_number?, copay?, allowance?`. |
| **OPT14-06** | `POST /optical-orders/{id}/job-ticket` returns reportlab PDF with header, patient, two-column Rx, frame, lens, coatings, measurements, vision plan, footer; sets `job_ticket_generated_at` | §"Job Ticket PDF" — donor: `_build_cms1500_pdf()` in `backend/api/routes/billing.py:673`. |
| **OPT14-07** | AI Scribe optical recommendations surface as ghosted ✨ chips inline in configurator; accept fills field; dismiss persists to `suggestion_resolutions_jsonb` | §"AI Suggestion Extraction" — read-only scan of `Encounter.ai_summary_text` + persisted `assessment_and_plan`; deterministic keyword/regex extractor. |
| **OPT14-08** | Migration 0019 adds 3 lens reference tables + 5 OpticalOrder columns + 1 OpticalOrderLineItem column | §"Alembic Migration Shape" — follows 0017 pattern verbatim. |
| **OPT14-09** | 2 new ClinicalAction values (`GENERATE_JOB_TICKET` {T,R,A,O}, `MANAGE_LENS_CATALOG` {A,O}) wired into PERMISSION_MATRIX | §"Permissions & Audit Wiring". |
| **OPT14-10** | 5 new AuditAction VARCHAR values logged in primary TXN | §"Permissions & Audit Wiring". |
| **OPT14-11** | `_seed_lens_reference()` idempotently seeds 4 lens types + 6 materials + 7 coatings; wired into `seed_tenant_schema()` after `_seed_retail_inventory()` | §"Seeding". |
| **OPT14-12** | Full-page configurator route at `app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx` with autosave 1.5s debounce + flush-on-blur | §"Configurator Page Architecture". |
| **OPT14-13** | Three entry points wired: optical-queue card "Configure Order" button; Patient Orders tab draft-order click; walk-in modal redirect on submit | §"Entry-Point Wiring". |
| **OPT14-14** | `OpticalQueueItem.draft_order_count` field + draft-pending pill on `OpticalQueueCard.tsx` (absorbs 2026-05-08 todo) | §"Optical Queue Draft Indicator". |
| **OPT14-15** | `OrderDetailDrawer` (480px slide; absorbed INV-15) — read-only view for placed/dispensed/cancelled orders on Patient Orders tab; draft orders route to configurator instead | §"OrderDetailDrawer (absorbed INV-15)". |
| **OPT14-16** | BFF proxies registered for all new endpoints (10 routes) — every backend route also has a BFF mirror per `.claude/rules/bff-api.md` | §"BFF Route Inventory". |
| **OPT14-17** | Pydantic `by_alias` contract tests for `OpticalOrderResponse` (extended), `LensTypeResponse`, `LensMaterialResponse`, `LensCoatingResponse`, `JobTicketMetaResponse` | §"Validation Architecture". |
| **OPT14-18** | Playwright E2E covering optical queue → configurator → autosave → place (with validation gate) → generate job ticket → drawer view for placed order | §"Validation Architecture". |

</phase_requirements>

## Summary

Phase 14 is the natural Phase 13 follow-on the existing schema and routes were explicitly designed to absorb. Every CONTEXT.md decision has a working donor pattern already in the repo: Alembic migration 0017 (Phase 13) is the template for the 5-column ADD; `_build_cms1500_pdf()` (Phase 9, billing.py:673) is the reportlab donor for the job ticket; `_compute_optical_status()` (Phase 13-07, optical.py:71) is the helper to extend with `draft_order_count`; `AppointmentDetailDrawer.tsx` is the donor for OrderDetailDrawer; `inventoryStore.loadProducts` is the donor for the frame picker. The AI suggestion path is deterministic (no new Claude calls) — extractor reads `Encounter.ai_summary_text` (the SOAP narrative saved by ai_scribe.py:365) plus `Encounter.assessment_and_plan` (saved only via `applyResolutions()` per MEMORY.md), then scans against a curated optical keyword list.

The configurator UX is a full-page Next.js App Router route (not a drawer) because the form spans 5 distinct sections (Rx side-by-side, frame, lens, measurements, vision plan) plus AI chips — too dense for the 480px drawer pattern. Autosave clones the 1.5s-debounce + flush-on-blur pattern documented in `store/refractionStore.ts:11-22` (draft/committed dual-state).

**Primary recommendation:** Single Alembic revision 0019, single new router module `backend/api/routes/lens_catalog.py` plus PATCH/job-ticket/suggestions extensions to existing `optical_order.py`, single new full-page route in app/, single new Zustand store `opticalOrderConfigStore`. Plan in ~10-12 small plans rather than the 14-plan Phase 13 firehose — most of the surface area is straightforward extension.

## Pre-existing Foundation

What's already shipped that Phase 14 builds directly on:

### Phase 6 (Optical Handoff) — confirmed in production
- `backend/api/routes/optical.py` — optical queue route with `_compute_optical_status()` rollup (line 71). Phase 14 extends `OpticalQueueItem` schema with a new `draft_order_count` field; the existing eager-load `selectinload(Encounter.optical_orders)` (line 219) already exposes the orders needed to count drafts.
- `Encounter.optical_status` column (clinical.py:534) — `String(20), nullable`. Phase 14 **must not mutate this** (Phase 13 §C / STATE.md `[Phase 13-07]` rollup contract). Read-side only.
- `Refraction` model (clinical.py:726) with `pd_distance` / `pd_near` / `pd_od` / `pd_os` (lines 776–780), all `Numeric(4,1)` nullable. `is_final_rx` boolean on line 784. Phase 14 auto-fills `fitting_jsonb.pd_distance` from these.

### Phase 13 (Retail Inventory) — fresh, 14/16 plans complete
- `OpticalOrder` + `OpticalOrderLineItem` (clinical.py:1534 / 1616) — explicitly designed for `ADD COLUMN` extension per the model docstrings ("Phase 14 will ADD COLUMN here for lens config").
- 4-status lifecycle + concurrency control (`with_for_update()` row-locks on Product + Order) already in `backend/api/routes/optical_order.py` (place/cancel/dispense handlers, 13-04 / 13-05).
- `retail_pos` entitlement key — confirmed in `backend/core/entitlements.py:47`; Phase 14 routes inherit `Depends(require_entitlement("retail_pos"))` per the existing `optical_order.py:42` pattern (note: it uses the string literal "retail_pos" not `Entitlement.RETAIL_POS` — match the existing style or upgrade both).
- `inventoryStore` (raw fetch + getAuthHeaders to preserve JSONB snake_case per Pitfall 1) — donor for `lensCatalogStore`.
- `CreateWalkInOrderModal` — Phase 14 changes the submit path to redirect to configurator for spectacle orders (when at least one frame is in the cart); contacts-only walk-ins stay on the current "Create & Place" path.
- Phase 13 partial unique index pattern: `CREATE UNIQUE INDEX uq_products_active_sku ON products (tenant_id, sku) WHERE is_active = true` (migration 0017 line 89). Phase 14 mirrors this for `(tenant_id, name) WHERE is_active = true` on each lens reference table.
- `backend/seed_db.py::_seed_retail_inventory()` (line 1870) is the idempotency-pattern donor for `_seed_lens_reference()`.

### Phase 9 (Claims / CMS-1500 PDF)
- `_build_cms1500_pdf()` in `backend/api/routes/billing.py:673` — reportlab template donor. Imports already in scope at top of billing.py:18-22 (`HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle`, `colors`, `letter`, `inch`, `ParagraphStyle`, `getSampleStyleSheet`). PDF returned as `FastAPIResponse(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": ...})` — clone verbatim.

### Phase 2 (AI Scribe) — read-only consumer
- `ai_scribe.py:365` saves only `enc.ai_summary_text` + `enc.ai_summary_generated_at` during streaming. `assessment_and_plan` is persisted **only** by `applyResolutions()` via the accept route (line 426–429) using `resolve_assessment_and_plan()` (services/ai_scribe.py:30) — a plain-string column on Encounter, NOT a nested JSONB. Phase 14 extractor reads these two text columns; no JSON-path navigation needed.

### Project rule conformance (already loaded)
- `backend/schemas/common.py:18-34` — `CamelCaseModel` extends `AppBaseModel` with `alias_generator=to_camel`; new Phase 14 schemas inherit `CamelCaseModel`.
- `.claude/rules/bff-api.md` — trailing-slash upstream URLs; raw `fetch` for non-JSON responses.
- `.claude/rules/backend-python.md` — `selectinload` after `db.flush()`, never `db.refresh`; enums as VARCHAR.
- `.claude/rules/clinical-safety.md` — clinical writes in primary TXN with `log_action()` before `db.commit()`.

## Implementation Approach

### 1. Alembic Migration Shape (CONTEXT §A + §B)

**File:** `backend/alembic/versions/0019_optical_order_configuration.py`
**Revision chain:** `down_revision = "0018_products_soft_delete"` (latest at time of research).

Donor: 0017 verbatim for table shapes; 0012 (`0012_insurance_revamp_fields.py`) for partial unique index. Migration shape:

```python
def upgrade() -> None:
    # 1) Three reference tables — each follows products' (tenant_id, name) pattern
    for ref in [
        ("lens_types",    [("requires_seg_height", sa.Boolean, "false"),
                           ("requires_vertex", sa.Boolean, "false"),
                           ("display_order", sa.Integer, "0")]),
        ("lens_materials",[("refractive_index", sa.Numeric(3,2), None),
                           ("abbe_value", sa.Integer, None)]),
        ("lens_coatings", [("category", sa.String(20), None)]),  # treatment|tint|finish
    ]:
        table_name, extras = ref
        op.create_table(table_name, ...standard cols + extras...)
        op.create_index(f"ix_{table_name}_tenant", table_name, ["tenant_id"])
        op.execute(
            f"CREATE UNIQUE INDEX uq_{table_name}_active_name "
            f"ON {table_name} (tenant_id, name) WHERE is_active = true"
        )

    # 2) ADD COLUMN on optical_orders (5 new)
    op.add_column("optical_orders",
        sa.Column("vision_plan_jsonb", postgresql.JSONB(),
                  nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("optical_orders",
        sa.Column("fitting_jsonb", postgresql.JSONB(),
                  nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("optical_orders",
        sa.Column("suggestion_resolutions_jsonb", postgresql.JSONB(),
                  nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("optical_orders",
        sa.Column("final_refraction_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("refractions.id", ondelete="SET NULL"), nullable=True))
    op.add_column("optical_orders",
        sa.Column("habitual_refraction_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("refractions.id", ondelete="SET NULL"), nullable=True))
    op.add_column("optical_orders",
        sa.Column("job_ticket_generated_at", sa.DateTime(timezone=True), nullable=True))

    # 3) ADD COLUMN on optical_order_line_items
    op.add_column("optical_order_line_items",
        sa.Column("lens_config_jsonb", postgresql.JSONB(), nullable=True))
```

**Critical conformance notes** (per STATE.md `[Phase 13-01]`):
- `server_default=sa.text("'{}'::jsonb")` for JSONB — bypasses asyncpg double-quoting bug.
- VARCHAR + CHECK CONSTRAINT for enum-like columns (lens_coatings.category) per backend-python.md.
- `nullable=False` + jsonb server_default '{}' for vision_plan_jsonb, fitting_jsonb, suggestion_resolutions_jsonb so existing rows backfill cleanly with empty objects.
- `lens_config_jsonb` is `nullable=True` — frame-only lines and contact-lens lines have null lens config.

**Downgrade:** drop FK columns first, then ADD COLUMNs, then partial indices, then ref tables. Mirror 0017's downgrade structure.

### 2. ORM Model Changes (clinical.py)

Append 3 new model classes (`LensType`, `LensMaterial`, `LensCoating`) immediately after `InventoryTransaction` at clinical.py:1724. Each follows `Product`'s shape:
- `TimestampMixin, SoftDeleteMixin, TenantBase` parent set
- `tenant_id`, `name`, `is_active`, type-specific extras
- `__table_args__` with the appropriate `Index` and `CheckConstraint` (for coatings.category)

Extend `OpticalOrder` with the 5 new columns + 2 new relationships:
```python
final_refraction: Mapped["Refraction | None"] = relationship(
    "Refraction", foreign_keys=[final_refraction_id], lazy="selectin")
habitual_refraction: Mapped["Refraction | None"] = relationship(
    "Refraction", foreign_keys=[habitual_refraction_id], lazy="selectin")
```
Mirrors `OpticalOrder.created_by`'s explicit `foreign_keys=[…]` pattern (clinical.py:1605–1607) — required because `Refraction` has multiple potential FK targets to `OpticalOrder`.

Extend `OpticalOrderLineItem` with `lens_config_jsonb: Mapped[dict | None]`.

Extend `AuditAction` enum (clinical.py:127) with 5 new string-VARCHAR values — no ALTER TYPE needed (audit_log.action is VARCHAR(50) per comment at line 196).

### 3. Pydantic Schemas (CamelCaseModel-based)

**New file:** `backend/schemas/lens_catalog.py` — `LensTypeCreate/Update/Response`, `LensMaterialCreate/Update/Response`, `LensCoatingCreate/Update/Response`. All inherit `CamelCaseModel` from `backend/schemas/common.py`.

**Extend:** `backend/schemas/optical_order.py` — add to `OpticalOrderResponse`:
```python
final_refraction_id: uuid.UUID | None = None
habitual_refraction_id: uuid.UUID | None = None
final_refraction: RefractionSummary | None = None  # nested, lazy-loaded
habitual_refraction: RefractionSummary | None = None
vision_plan: dict[str, Any] = {}     # JSONB; dict[str,Any] preserves snake_case
fitting: dict[str, Any] = {}          # JSONB; dict[str,Any] preserves snake_case
suggestion_resolutions: dict[str, Any] = {}
job_ticket_generated_at: datetime | None = None
```
Add to `OpticalOrderLineItemResponse`: `lens_config: dict[str, Any] | None = None`.

**CRITICAL** (per STATE.md `[Phase 13-03]`): JSONB columns ship as `dict[str, Any]` on the wire, NOT typed Pydantic submodels — preserves snake_case nested keys end-to-end. Phase 13 uses `FrameAttributes`/`ContactLensAttributes` as **validation-only** shapes. Mirror that pattern: define `VisionPlanShape`/`FittingShape`/`LensConfigShape` as validation helpers that drop `alias_generator` (override `model_config`), but expose the column as plain `dict`.

**New:** `PatchOpticalOrderRequest` — partial-update payload with optional `vision_plan`, `fitting`, `line_items[]` (each with optional `lens_config`), `habitual_refraction_id`, `final_refraction_id`. All fields optional → autosave can PATCH a single delta. **Reject PATCH** when `order.status != "draft"` (409).

### 4. Place-time Validation (CONTEXT §C)

Extend existing `place_order` handler in `backend/api/routes/optical_order.py:227`. After the existing draft-status check, before stock decrement, run lens-config validation:

```python
field_errors: list[dict] = []
for idx, line in enumerate(order.line_items):
    if not line.lens_config_jsonb:
        continue  # frames-only or contact lens line
    lc = line.lens_config_jsonb
    if not lc.get("lens_type_id"):
        field_errors.append({"path": f"line_items[{idx}].lens_config.lens_type_id",
                             "code": "required", "message": "Lens type required"})
        continue
    lens_type = await db.get(LensType, lc["lens_type_id"])
    if not lens_type or lens_type.tenant_id != ctx.tenant_id or not lens_type.is_active:
        field_errors.append({"path": f"line_items[{idx}].lens_config.lens_type_id",
                             "code": "invalid", "message": "Unknown lens type"})
        continue
    if not lc.get("material_id"):
        field_errors.append({"path": f"line_items[{idx}].lens_config.material_id",
                             "code": "required", "message": "Lens material required"})
    if lens_type.requires_seg_height:
        if not (order.fitting_jsonb.get("seg_height_od") and
                order.fitting_jsonb.get("seg_height_os")):
            field_errors.append({"path": "fitting.seg_height_od/os",
                                 "code": "required",
                                 "message": "Seg height required for progressives"})
    if lens_type.requires_vertex and not order.fitting_jsonb.get("vertex_distance"):
        field_errors.append({"path": "fitting.vertex_distance",
                             "code": "required",
                             "message": "Vertex distance required"})

if field_errors:
    raise HTTPException(status_code=400, detail={"field_errors": field_errors})
```

Validation runs **before** the stock-decrement / row-lock loop so a failed validation never leaves a dangling `with_for_update()` lock or partial InventoryTransaction. Returns 400 cleanly; no stock movement.

### 5. AI Suggestion Extraction (CONTEXT §E)

**New file:** `backend/services/optical_suggestions.py`. Pure function, no DB writes:

```python
LENS_TYPE_KEYWORDS = {
    "progressive": ["progressive", "PAL", "multifocal"],
    "bifocal":     ["bifocal", "lined bifocal"],
    "single_vision":["single vision", "SV"],
    "reading":     ["reading glasses", "near-only", "+2.00", "+2.25", "+2.50"],
}
MATERIAL_KEYWORDS = {
    "polycarbonate":["polycarbonate", "poly", "impact-resistant", "child"],
    "trivex":       ["trivex"],
    "hi-index 1.67":["hi-index 1.67", "1.67"],
    "hi-index 1.74":["hi-index 1.74", "1.74"],
    "hi-index 1.80":["1.80"],
    "CR-39":        ["CR-39", "standard plastic"],
}
COATING_KEYWORDS = {
    "AR":           ["anti-reflective", "AR coating", "no-glare", "anti-glare"],
    "blue light":   ["blue light", "blue-blocker"],
    "photochromic": ["photochromic", "transitions", "transition lens"],
    "polarized":    ["polarized"],
    "UV":           ["UV protection"],
    "scratch-resistant":["scratch-resistant", "scratch resistant"],
    "mirror":       ["mirror coating"],
}

def extract_optical_suggestions(encounter) -> dict:
    """Pure regex/keyword scan of saved AI Scribe output. NO Claude calls."""
    haystack = " ".join(filter(None, [
        encounter.ai_summary_text or "",
        encounter.assessment_and_plan or "",
    ])).lower()
    if not haystack.strip():
        return {"suggestions": [], "rationale": "No AI Scribe data on encounter"}

    suggestions = []
    for name, kws in LENS_TYPE_KEYWORDS.items():
        if any(kw.lower() in haystack for kw in kws):
            suggestions.append({"field": "lens_type", "value": name,
                                "matched": kws})
            break
    for name, kws in MATERIAL_KEYWORDS.items():
        if any(kw.lower() in haystack for kw in kws):
            suggestions.append({"field": "material", "value": name,
                                "matched": kws})
            break
    matched_coatings = []
    for name, kws in COATING_KEYWORDS.items():
        if any(kw.lower() in haystack for kw in kws):
            matched_coatings.append(name)
    if matched_coatings:
        suggestions.append({"field": "coatings", "value": matched_coatings})
    return {"suggestions": suggestions,
            "rationale": "Derived from saved SOAP + A&P keywords"}
```

The route `GET /optical-orders/{id}/suggestions/` loads the linked encounter (skip when `order.encounter_id is None` — walk-in flow has no AI context) and returns the result. Suggestion **resolution** (accept/dismiss) PATCHes `order.suggestion_resolutions_jsonb` with shape `{ "lens_type": "accepted" | "dismissed", "material": ..., "coatings": ... }`. UI checks the JSONB before re-rendering chips; once resolved, chip stays hidden for that order.

### 6. Job Ticket PDF (CONTEXT §F)

**New module:** `backend/services/job_ticket_pdf.py` — exports `build_job_ticket_pdf(order, patient, encounter, refractions_dict, products_by_id, lens_refs_by_id, tenant) -> bytes`.

Clone `_build_cms1500_pdf` structure from `billing.py:673` but invert the aesthetic per CONTEXT §F ("looks like a lab work order, not a brochure"):
- Remove the teal `#2DD4BF` accent — use plain black headers, white background.
- `Helvetica-Bold` for headers, `Courier` (monospace) for numeric data values (Rx values, measurements).
- 6 table sections stacked vertically; same `Table(... TableStyle(...))` pattern.

**Clinic header sources:** `Tenant.name` is the only branded field today (saas.py:75). Tenant address/phone/NPI **are not in the model** — use placeholder text or pull from `settings_jsonb` (saas.py:89) if present. **Open question for planner:** plumb a `Tenant.address`/`Tenant.phone`/`Tenant.npi` column add through Phase 14, OR put them in `settings_jsonb`, OR hardcode placeholder. Recommended: read from `settings_jsonb.get("clinic_address")` etc. (zero new columns), fallback to "—".

**Route:** `POST /optical-orders/{id}/job-ticket/` on existing `optical_order.py` router. Loads order + line_items + linked refractions + products + lens reference rows in one selectinload chain. Returns `FastAPIResponse(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="ticket-{order_id[:8]}.pdf"'})`. Sets `order.job_ticket_generated_at = datetime.now(timezone.utc)` and writes `AuditAction.JOB_TICKET_GENERATE` BEFORE `db.commit()`.

**BFF for the PDF stream:** raw `fetch` per Phase 10.4-04 CSV export pattern, NOT `proxyToFastAPI` (which JSON-decodes the body and would break the binary stream). Reference donor: `app/api/staff-schedule/attendance/export/` — copy that file shape.

### 7. Configurator Page Architecture (CONTEXT §D)

**Route:** `app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx`.

**New Zustand store:** `store/opticalOrderConfigStore.ts`. Donor pattern: `store/refractionStore.ts:11-22` (header diagram explicitly documents the draft/committed dual-state + 1.5s debounce + flush-on-blur). Adapt for OpticalOrder shape:

```typescript
interface OpticalOrderConfigState {
  draft: OpticalOrder | null;         // edited shape (snake_case JSONB preserved)
  committed: OpticalOrder | null;     // last successful PATCH
  dirty: Set<keyof OpticalOrder>;     // which fields pending save
  saveTimer: number | null;
  load: (orderId: string) => Promise<void>;
  patchField: <K extends keyof OpticalOrder>(field: K, value: OpticalOrder[K]) => void;
  patchLine: (lineId: string, patch: Partial<OpticalOrderLineItem>) => void;
  flush: () => Promise<void>;         // called on blur of last field
  // Suggestions
  suggestions: ExtractedSuggestion[];
  loadSuggestions: () => Promise<void>;
  acceptSuggestion: (id: string) => Promise<void>;
  dismissSuggestion: (id: string) => Promise<void>;
}
```

**JSONB handling:** because `vision_plan`, `fitting`, `lens_config` are dict[str,Any] over the wire with snake_case keys, use raw `fetch` + `getAuthHeaders()` (donor: `inventoryStore.ts` per STATE.md `[Phase 13-09]`). NOT `apiFetch` — `apiFetch`'s recursive `camelizeKeys` mangles nested JSONB domain keys per `feedback_camelizekeys_nested.md`.

**Layout:**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <RxSideBySidePanel order={draft} habitualRx={habitualRx} finalRx={finalRx} />
  <div className="space-y-6">
    <FramePicker selected={draft.line_items.find(...)} onSelect={...} />
    <LensConfigSection lensTypes={...} materials={...} coatings={...}
                       value={lensLine?.lens_config} onChange={...}
                       suggestions={suggestions.filter(s => s.field.startsWith("lens"))} />
    <MeasurementsSection value={draft.fitting} onChange={...}
                          requiresSegHeight={lensType?.requires_seg_height} />
    <VisionPlanSection value={draft.vision_plan} onChange={...} />
  </div>
</div>
<ConfiguratorFooter
  onPlace={...}                          // gated; runs place validation, shows field_errors
  onGenerateTicket={...}                 // disabled until status==='placed'
  status={draft.status}
/>
```

**Side-by-side Rx panel:** scan repo for existing OD/OS row component. Found: `components/optical/RxPrintView.tsx` (Phase 6) renders OD/OS rows for the Rx PDF view; can be lifted into a reusable `<RxRow eye="OD" rx={...} mode="read-only" />`. Phase 14 wraps it in a 2-column side-by-side parent.

**Hardcoded color compliance:** every new component uses `text-[var(--text-primary)]` / `bg-[var(--bg-glass)]` / `border-[var(--glass-border)]` — never `text-white` / `bg-black` / hex literals (per `feedback_no_hardcoded_text_colors.md`, STATE.md `[Phase 10.2-06]`).

### 8. Entry-Point Wiring

1. **Optical queue card** (`components/optical/OpticalQueueCard.tsx`): existing "+ Create Order" button creates a walk-in modal flow. Phase 14 adds a second "Configure Order" CTA that creates a draft order via existing `createOrder` then `router.push(\`/optical/orders/${id}\`)`. The Phase 14 "draft pending" pill (§K, `OpticalQueueItem.draft_order_count`) displays next to the status badge — clicking the pill routes to the existing draft (don't create a duplicate).

2. **Patient Orders tab** (INV-15, absorbed): clicking a `draft` order → `router.push(\`/optical/orders/${id}\`)`. Clicking `placed`/`dispensed`/`cancelled` → opens `OrderDetailDrawer` (read-only).

3. **Walk-in modal** (`components/orders/CreateWalkInOrderModal.tsx`): after `createOrder` succeeds, if any line item's product is a `frame`, redirect to configurator instead of returning to the queue. Contacts-only walk-ins keep current behavior.

### 9. Optical Queue Draft Indicator (absorbed todo)

Add to `backend/schemas/optical.py::OpticalQueueItem`:
```python
draft_order_count: int = 0
```

Update `backend/api/routes/optical.py::get_optical_queue` — the existing loop already iterates `enc.optical_orders` for `_compute_optical_status` (line 88). Add:
```python
draft_count = sum(1 for o in enc.optical_orders if o.status == "draft")
```
to the per-encounter rollup. Zero N+1 cost — the orders are already eager-loaded (line 219).

UI: `OpticalQueueCard.tsx` renders a small "Draft pending" pill when `item.draftOrderCount > 0`, with a tooltip "Continue draft order →" that routes to `/optical/orders/?patientId=…&encounterId=…` or directly to the most recent draft. Planner should pick one — see Open Question #3.

### 10. OrderDetailDrawer (absorbed INV-15)

Clone `components/schedule/AppointmentDetailDrawer.tsx:53-120`:
- 480px right-slide, ESC + backdrop close, early-return-null hydration safety.
- Section list: status timeline (created → placed → dispensed/cancelled with timestamps), line items, vision plan, lens config (read-only display), Generate/Re-generate Job Ticket button (when `placed`).
- Cancel CTA gated on `CANCEL_OPTICAL_ORDER` permission and `status ∈ {draft, placed}`.

### 11. Permissions & Audit Wiring

`backend/core/permissions.py:83-88` — add to `ClinicalAction` enum:
```python
GENERATE_JOB_TICKET = "generate_job_ticket"
MANAGE_LENS_CATALOG = "manage_lens_catalog"
```
And to `PERMISSION_MATRIX` (line 159-164):
```python
ClinicalAction.GENERATE_JOB_TICKET:  {_T, _R, _A, _O},
ClinicalAction.MANAGE_LENS_CATALOG:  {_A, _O},
```

`backend/db/models/tenant/clinical.py:197-205` — append to `AuditAction`:
```python
OPTICAL_ORDER_CONFIGURE_UPDATE = "optical_order_configure_update"
JOB_TICKET_GENERATE = "job_ticket_generate"
LENS_TYPE_CREATE = "lens_type_create"
LENS_MATERIAL_CREATE = "lens_material_create"
LENS_COATING_CREATE = "lens_coating_create"
```
All VARCHAR-stored — no ALTER TYPE needed (comment at line 196 confirms).

UPDATE/DEACTIVATE of lens-catalog rows reuse `LENS_*_CREATE` with `metadata={"action": "update"}` per CONTEXT §H to avoid enum explosion. Acceptable per `log_action()` signature which already accepts `metadata: dict`.

### 12. BFF Route Inventory

All new BFF proxies under `app/api/`:

| BFF route | Method | Upstream | Notes |
|-----------|--------|----------|-------|
| `optical-orders/[orderId]/` | PATCH | `/api/optical-orders/{orderId}/` | proxyToFastAPI |
| `optical-orders/[orderId]/job-ticket/` | POST | `/api/optical-orders/{orderId}/job-ticket/` | **raw fetch** (PDF blob) |
| `optical-orders/[orderId]/suggestions/` | GET | `/api/optical-orders/{orderId}/suggestions/` | proxyToFastAPI |
| `optical-orders/[orderId]/suggestions/[suggestionId]/accept/` | POST | …/accept/ | proxyToFastAPI |
| `optical-orders/[orderId]/suggestions/[suggestionId]/dismiss/` | POST | …/dismiss/ | proxyToFastAPI |
| `lens-catalog/types/` | GET, POST | `/api/lens-catalog/types/` | proxyToFastAPI |
| `lens-catalog/types/[id]/` | GET, PATCH, DELETE | …/{id}/ | proxyToFastAPI |
| `lens-catalog/materials/` | GET, POST | …/materials/ | proxyToFastAPI |
| `lens-catalog/materials/[id]/` | GET, PATCH, DELETE | … | proxyToFastAPI |
| `lens-catalog/coatings/` | GET, POST | …/coatings/ | proxyToFastAPI |
| `lens-catalog/coatings/[id]/` | GET, PATCH, DELETE | … | proxyToFastAPI |

Trailing slashes on every upstream URL (STATE.md `[Phase 13-06]` — without it FastAPI 307 drops auth headers).

Register `lens_catalog.router` in wherever Phase 13 registered `optical_order.router` (likely `backend/main.py` or `backend/api/__init__.py` — planner should confirm the exact include site).

### 13. Seeding (CONTEXT §A + STATE.md `[Phase 13-08]`)

Append `_seed_lens_reference(session)` to `backend/seed_db.py` after `_seed_retail_inventory` (line 1870). Wire into `seed_tenant_schema` orchestrator at line 404 immediately after `_seed_retail_inventory(session)`.

```python
def _seed_lens_reference(session: Session) -> None:
    step("Seeding Lens Reference Catalog")
    LENS_TYPES = [
        ("Single Vision", False, False, 0),
        ("Bifocal", True, False, 1),
        ("Progressive", True, True, 2),
        ("Reading", False, False, 3),
    ]
    # idempotent guard: (tenant_id, name, is_active=true)
    for (name, seg, vert, order) in LENS_TYPES:
        existing = session.execute(_select(LensType).where(
            LensType.tenant_id == TENANT_ID,
            LensType.name == name,
            LensType.is_active.is_(True),
        )).first()
        if existing: continue
        session.add(LensType(tenant_id=TENANT_ID, name=name,
            requires_seg_height=seg, requires_vertex=vert, display_order=order))
    # …materials (CR-39, polycarbonate, trivex, hi-index 1.67/1.74/1.80)…
    # …coatings (AR, UV, blue light, photochromic, polarized, scratch-resistant, mirror)…
    session.flush()
```

After this migration ships, project memory rule applies: re-seed via `python backend/seed_db.py` (skill `/reseed` if available).

## Validation Architecture

`workflow.nyquist_validation = true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | `pytest` (existing) |
| Backend config | `backend/pytest.ini` (confirmed by existing tests under `backend/tests/`) |
| Backend quick run | `cd backend && pytest -x -k "optical_order or lens_catalog or job_ticket or suggestions"` |
| Backend full suite | `cd backend && pytest` |
| Frontend framework | `vitest` for unit/contract; `@playwright/test` for E2E |
| Frontend quick run | `npx vitest run` |
| Frontend contract | `npx vitest run tests/contract/` |
| E2E | `bash scripts/dev.sh pre-test && npx playwright test tests/e2e/optical-order-configuration.spec.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| OPT14-01 | Configurator pre-fills Final Rx + PD | integration | `pytest backend/tests/test_optical_order_configuration.py::test_draft_creation_prefills_rx -x` | ❌ Wave 0 |
| OPT14-02 | Habitual Rx side-by-side render + delta flag | unit + e2e | `npx vitest run tests/lib/rx-delta.test.ts && npx playwright test --grep "habitual.*side.*side"` | ❌ Wave 0 |
| OPT14-03 | Frame + lens reference catalog selectable | integration | `pytest -x -k "lens_catalog_list or place_with_lens_config"` | ❌ Wave 0 |
| OPT14-04 | Seg height required for progressive | unit + integration | `pytest -x -k "place_validates_seg_height"` | ❌ Wave 0 |
| OPT14-05 | Vision plan recordable | integration | `pytest -x -k "patch_vision_plan_persists"` | ❌ Wave 0 |
| OPT14-06 | Job ticket PDF reportlab output | integration (PDF bytes assertion) | `pytest -x -k "job_ticket_pdf_bytes"` | ❌ Wave 0 |
| OPT14-07 | AI suggestion extraction is deterministic | unit | `pytest -x -k "extract_optical_suggestions"` | ❌ Wave 0 |
| OPT14-08 | Migration 0019 up + down clean | integration | `pytest backend/tests/test_migrations.py::test_0019_round_trip -x` (if pattern exists) OR alembic upgrade head; downgrade -1; upgrade head | ❌ Wave 0 |
| OPT14-09 | New ClinicalActions wired into PERMISSION_MATRIX | unit | `pytest -x -k "permission_matrix_complete"` | ❌ Wave 0 |
| OPT14-10 | New AuditAction values writable via log_action | unit | `pytest -x -k "audit_log_phase14_actions"` | ❌ Wave 0 |
| OPT14-11 | Seed idempotent | integration | `pytest -x -k "seed_lens_reference_idempotent"` | ❌ Wave 0 |
| OPT14-12 | Autosave 1.5s debounce + flush-on-blur | unit (fake-timer) | `npx vitest run store/opticalOrderConfigStore.test.ts` | ❌ Wave 0 |
| OPT14-13 | Three entry points navigate to configurator | e2e | covered by master E2E flow | ❌ Wave 0 |
| OPT14-14 | Draft pending pill renders + routes | unit + e2e | `npx vitest run components/optical/OpticalQueueCard.test.tsx` | ❌ Wave 0 |
| OPT14-15 | OrderDetailDrawer renders placed/cancelled/dispensed | unit | `npx vitest run components/orders/OrderDetailDrawer.test.tsx` | ❌ Wave 0 |
| OPT14-16 | BFF proxies all reachable; trailing-slash preserved | unit (route file present) | grep-based test counting | ✅ partial (Phase 13 mirror) |
| OPT14-17 | Pydantic by_alias contract snapshots | unit | `pytest backend/tests/test_optical_order_contract.py -x` | ✅ exists (stub) — extend |
| OPT14-18 | Full E2E: queue → configurator → place → ticket | e2e | `npx playwright test tests/e2e/optical-order-configuration.spec.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd backend && pytest -x -k "<task-scope>"` AND `npx vitest run <touched files>`
- **Per wave merge:** `cd backend && pytest -x` AND `npx vitest run` AND `npx tsc --noEmit`
- **Phase gate:** Full backend pytest green; full vitest green; `bash scripts/dev.sh pre-test && npx playwright test tests/e2e/optical-order-configuration.spec.ts` green; manual smoke-test the configurator + PDF generation before `/gsd:verify-work 14`.

### Wave 0 Gaps

- [ ] `backend/tests/test_optical_order_configuration.py` — integration suite covering draft prefill, PATCH autosave, place-validation field_errors, lens-catalog CRUD, suggestions GET/accept/dismiss, job-ticket PDF byte assertion
- [ ] `backend/tests/test_optical_suggestions.py` — pure unit tests for `extract_optical_suggestions()` covering: progressive keyword hit, polycarbonate keyword hit (child mention), AR coating, no-AI-data fallback, multiple coatings, walk-in (no encounter) returns empty
- [ ] `backend/tests/test_lens_catalog.py` — CRUD + soft delete + idempotent name uniqueness (partial index)
- [ ] `backend/tests/test_job_ticket_pdf.py` — assert reportlab returns ≥ 1500 bytes; assert `application/pdf` content-type via direct service call (no FastAPI client needed)
- [ ] `backend/tests/test_optical_order_contract.py` — EXTEND existing stub with the new keys (`finalRefractionId`, `habitualRefractionId`, `visionPlan`, `fitting`, `jobTicketGeneratedAt`, `suggestionResolutions`); add `OpticalOrderLineItemResponse` contract with `lensConfig` key
- [ ] `tests/contract/lens-catalog.test.ts` — vitest literal-keys assertion mirror of the new lens-catalog schemas (per `feedback_contract_tests.md` — bidirectional contract)
- [ ] `tests/e2e/optical-order-configuration.spec.ts` — Playwright spec covering queue → configurator → autosave assertion (intercept PATCH) → place with missing seg height (assert 400) → fix → place → generate job ticket (assert PDF download)
- [ ] `store/opticalOrderConfigStore.test.ts` — vitest fake-timer test for 1.5s debounce + flush-on-blur (donor: existing refractionStore tests if present)
- [ ] `tests/conftest.py` (backend) — fixtures: `lens_type_progressive` (requires_seg_height=true), `lens_material_polycarbonate`, `lens_coating_ar`, `optical_order_in_draft` (with encounter + habitual_refraction + final_refraction)

## Pitfalls

### Pitfall 1 — JSONB camelCase mangling (carried from Phase 13)
**Scope:** All 4 new JSONB columns: `vision_plan_jsonb`, `fitting_jsonb`, `lens_config_jsonb`, `suggestion_resolutions_jsonb`. Nested keys are snake_case (`pd_distance`, `seg_height_od`, `vertex_distance`, `member_id`, `group_number`, `lens_type_id`, `material_id`, `coating_ids`).
**Detection:** Network panel — `apiFetch` recursively camelCases response bodies; you'll see `pdDistance` inside `fitting` after a load if `apiFetch` was used.
**Prevention:** `opticalOrderConfigStore` and `lensCatalogStore` use **raw `fetch` + `getAuthHeaders()`**, NOT `apiFetch`. Top-level response keys still arrive as camelCase (Pydantic `by_alias`), but nested JSONB dicts pass through verbatim. Mirror Phase 13's `inventoryStore` pattern (STATE.md `[Phase 13-09]`). On the schema side, expose JSONB as `dict[str, Any]` not as typed submodels (STATE.md `[Phase 13-03]`).

### Pitfall 2 — Refraction PD fields are nullable Decimal(4,1)
**Scope:** Auto-fill `fitting_jsonb.pd_distance` from `refraction.pd_distance`. Confirmed nullable at clinical.py:776–780.
**Detection:** TypeError or NaN in UI when patient has no recorded PD.
**Prevention:** Extractor must explicitly handle `None` → leave fitting_jsonb keys unset (NOT 0.0, NOT "—"). UI badges "PD not captured — measure with pupillometer" per CONTEXT §"Specific Ideas". Decimal-as-string on the wire (STATE.md `[Phase 13-03]` convention) — `pdDistance: string | null` on TS side.

### Pitfall 3 — OpticalOrder.encounter_id is optional (walk-in flow)
**Scope:** `encounter_id` is `nullable=True` (clinical.py:1567). Walk-in retail orders have no encounter, hence no Refraction, no AI suggestions, no habitual Rx context.
**Detection:** Backend 500 when configurator opens for a walk-in order and tries to load `encounter.refractions` from `None`.
**Prevention:** Every configurator-side and suggestion-side helper short-circuits on `order.encounter_id is None`. `extract_optical_suggestions` returns `{"suggestions": [], "rationale": "Walk-in order — no encounter context"}`. PD auto-fill becomes "blank, badge 'walk-in'". Final/Habitual Rx columns either empty or sourced from any prior encounter for the patient (planner discretion — see Open Question #1).

### Pitfall 4 — Phase 6 Encounter.optical_status must NOT be mutated
**Scope:** Phase 13 §C rollup contract is now load-bearing. Phase 14 cannot regress it.
**Detection:** `Encounter.optical_status` value changes after a Phase 14 order operation; rollup tests in `backend/tests/test_optical_rollup.py` fail.
**Prevention:** No Phase 14 handler writes to `Encounter.optical_status`. The `_compute_optical_status` helper at optical.py:71 remains the sole reader; `draft_order_count` is an additive computation off the same eager-loaded orders relationship — does NOT alter the column. Add a test that PATCHes a draft, generates a ticket, places, and dispenses, then asserts `Encounter.optical_status` is unchanged from baseline.

### Pitfall 5 — Migration 0019 + asyncpg JSONB server_default
**Scope:** All 3 new JSONB columns have `server_default='{}'` so existing rows backfill.
**Detection:** `alembic upgrade head` fails with `(asyncpg.exceptions.DataError) invalid input syntax for type json: '{}'` or similar.
**Prevention:** Use `server_default=sa.text("'{}'::jsonb")` NOT `server_default="{}"` — STATE.md `[Phase 13-01]` confirmed.

### Pitfall 6 — FK back-references to Refraction need explicit foreign_keys=[…]
**Scope:** `OpticalOrder.final_refraction` and `.habitual_refraction` both point at `refractions.id`. Without explicit `foreign_keys=[...]`, SQLAlchemy raises `AmbiguousForeignKeysError` at startup.
**Detection:** Backend fails to boot after migration; error mentions multiple FK paths.
**Prevention:** Mirror `OpticalOrder.created_by` (clinical.py:1605–1607) — explicit `foreign_keys=[final_refraction_id]` and `foreign_keys=[habitual_refraction_id]`. Same pattern STATE.md `[Phase 13-01]` calls out.

### Pitfall 7 — Place handler must validate BEFORE row-locking products
**Scope:** Extended `place_order` in `optical_order.py`. If validation runs after `with_for_update()` on Product, a failed validation leaves the transaction holding row locks until rollback, blocking concurrent /place calls unnecessarily.
**Detection:** Concurrency tests show /place latency spikes after a 400-returning request.
**Prevention:** Validate lens_config completeness + load LensType rows FIRST (without `with_for_update`). Only enter the existing line-item loop (with row-locks) once validation passes. Test: assert no `with_for_update` shows up in EXPLAIN ANALYZE for the 400 path.

### Pitfall 8 — `assessment_and_plan` is plain text, NOT JSONB (common misread)
**Scope:** Suggestion extractor. MEMORY.md AI Scribe note explicitly states A&P is "persisted only via applyResolutions() when the doctor explicitly applies AI suggestions" — and `resolve_assessment_and_plan` (services/ai_scribe.py:30) shows it's pulled as `changes["assessment_and_plan"]["new"]` and stored as `enc.assessment_and_plan` (a String column).
**Detection:** `json.loads(encounter.assessment_and_plan)` fails with JSONDecodeError on most real encounters.
**Prevention:** Extractor treats it as plain text. `haystack = enc.ai_summary_text + " " + enc.assessment_and_plan`. Lowercase. Keyword scan. No JSON parsing.

### Pitfall 9 — `OpticalOrder.line_items` already lazy="selectin" but new refraction relationships need it too
**Scope:** Newly added `final_refraction` / `habitual_refraction` relationships. Configurator load and job-ticket build both need them eagerly.
**Detection:** MissingGreenlet on `order.final_refraction.od_sphere` access in async context.
**Prevention:** Declare both relationships with `lazy="selectin"` (matches `OpticalOrder.line_items` at clinical.py:1600). Per backend-python.md: never call `db.refresh`; either lazy="selectin" or explicit `.options(selectinload(OpticalOrder.final_refraction))` in the route.

### Pitfall 10 — Hardcoded text-white/black in new UI components
**Scope:** All new Phase 14 components (configurator page, RxSideBySidePanel, LensConfigSection, MeasurementsSection, VisionPlanSection, OrderDetailDrawer, SuggestionChip).
**Detection:** Light-mode rendering shows white-on-white text; QA flags on visual review.
**Prevention:** Per `feedback_no_hardcoded_text_colors.md`, use only CSS variables. No `text-white`, `bg-white`, `text-black` literals. Reference donor: `OpticalQueueCard.tsx` (lines 124–215) which already follows the convention.

### Pitfall 11 — Configurator PATCH while order is `placed`
**Scope:** Autosave can fire after the user clicks Place. Race: user clicks Place → state transitions → autosave timer fires → 409 conflict.
**Detection:** Console warning toast on Place; user thinks save failed.
**Prevention:** Backend PATCH `optical-orders/{id}/` returns 409 when `order.status != "draft"`. Frontend `opticalOrderConfigStore.flush()` checks `draft.status` first and no-ops if non-draft. Belt-and-suspenders.

### Pitfall 12 — Job ticket PDF generation regenerates on every load
**Scope:** `job_ticket_generated_at` field. UI must not auto-generate; must require explicit user click.
**Detection:** Audit log spam — `JOB_TICKET_GENERATE` rows on every order open.
**Prevention:** PDF generation is POST-only (not GET, not part of GET /optical-orders/{id}/). UI button "Generate Job Ticket" / "Re-generate Job Ticket" — explicit user action only. `job_ticket_generated_at` is set on each successful POST, but UI only flips label from "Generate" to "Re-generate" — does not trigger a regeneration.

## Concerns

**None.** Every CONTEXT.md decision has a working donor pattern in the repo, and each pitfall has a documented prevention. The two open questions below are scope-sizing questions for the planner, not feasibility concerns.

## Open Questions for Planner

1. **Final/Habitual Rx default selection for walk-in orders.** CONTEXT §C says "habitual defaults to most recent FINAL refraction from prior encounter (>= 365 days old)." For walk-ins (no encounter), should the configurator (a) show empty Rx columns and require manual fill, (b) auto-select the patient's most recent FINAL refraction regardless of age, or (c) gate the configurator and force selecting an Rx source first? **Recommendation:** (b) — auto-fill from the patient's most recent FINAL refraction, badge it with the encounter date so the user knows the source. Cheap, no extra UX surface, matches "EyeCloudPro shows the most recent Rx by default" gap-analysis note.

2. **Tenant branding fields for the job-ticket PDF.** The `Tenant` model has `name` only. CONTEXT §F header requires "clinic name, address, phone, NPI". Three options: (a) add columns to Tenant in migration 0019, (b) read from `Tenant.settings_jsonb`, (c) hardcode placeholders. **Recommendation:** (b) — convention-driven `settings_jsonb.get("clinic_address", "—")` etc. — zero schema churn and matches how `Tenant.timezone` was once a settings_jsonb key before promotion (STATE.md `[Phase 10.4]`).

3. **Draft-pending pill navigation target.** Clicking the "Draft pending" pill on an optical-queue card: route to (a) the most recent draft for that encounter, or (b) a list of all drafts for that patient? **Recommendation:** (a) — most recent draft, single-click flow. If multiple drafts exist (rare; happens when staff abandoned a first attempt), surface a count in the pill but route to the newest. Phase 14 doesn't surface a "draft list" UI — too thin a need.

4. **Reportlab dependency.** `reportlab` is already in scope (billing.py:18-22). Confirm `requirements.txt` lists it — no install needed for Phase 14. **Verified:** yes, Phase 9 ships reportlab; no new dep.

5. **Plan count target.** Phase 13 shipped 16 plans (15 + 1 gap closure). Phase 14 has less surface area: 1 migration, 1 ORM extension, 1 new router (lens_catalog) + extensions to 1 existing router (optical_order), 1 PDF service, 1 suggestion service, ~10 BFF routes, 1 configurator page + ~6 components, 1 Zustand store, 1 seed extension, 1 OpticalQueueCard pill + 1 OrderDetailDrawer (absorbed INV-15). **Recommendation:** ~10–12 plans (Wave 0 test scaffold + 9-11 implementation plans). Smaller phase than 13.

6. **CONTEXT mentions both `Entitlement.RETAIL_POS` and bare string `"retail_pos"`.** Existing `backend/api/routes/optical_order.py:42` uses the string literal. STATE.md `[Phase 13-04]` says "typed enum form prevents typo silent-403 traps" yet the optical_order router contradicts that. Phase 14 should standardize. **Recommendation:** use `Entitlement.RETAIL_POS` for all new routers; optionally include a tiny cleanup commit upgrading optical_order.py:42 to match.

## Sources

### Primary (HIGH confidence — read directly from repo)

- **CONTEXT.md (Phase 14):** `c:\Users\duytr\Projects\clarityos\.planning\phases\14-optical-order-configuration\14-CONTEXT.md` — full text loaded
- **CONTEXT.md (Phase 13):** `c:\Users\duytr\Projects\clarityos\.planning\phases\13-retail-inventory\13-CONTEXT.md` — full text loaded
- **REQUIREMENTS.md:** full text loaded; Phase 13 INV-04, INV-05, INV-15, INV-20 pending confirmed
- **ROADMAP.md:** Phase 14 success criteria 1-7 confirmed
- **STATE.md:** all Phase 13 + Phase 10.x implementation notes loaded
- **clinical.py:** lines 127-205 (AuditAction enum), 520-560 (Encounter), 720-810 (Refraction with PD fields), 1470-1724 (Product / OpticalOrder / OpticalOrderLineItem / InventoryTransaction)
- **`backend/api/routes/optical_order.py`:** entire file loaded — confirmed place handler shape, row-locking, audit pattern, soft-block warnings
- **`backend/api/routes/optical.py`:** entire file loaded — `_compute_optical_status` confirmed pure function; eager-load already in place
- **`backend/schemas/optical.py`:** OpticalQueueItem shape confirmed for `draft_order_count` extension
- **`backend/api/routes/ai_scribe.py`:** entire file loaded — `enc.ai_summary_text` saved on streaming (line 365); `assessment_and_plan` saved only via accept route (line 426)
- **`backend/services/ai_scribe.py`:** entire file loaded — `resolve_assessment_and_plan` confirms A&P is plain string
- **`backend/api/routes/billing.py`:** lines 585-792 loaded — `_build_cms1500_pdf` reportlab donor confirmed
- **`backend/alembic/versions/0017_retail_inventory.py`:** entire file loaded — migration shape donor
- **`backend/seed_db.py`:** lines 1870-1972 loaded — idempotent seed pattern donor
- **`backend/core/permissions.py`:** entire file loaded — ClinicalAction enum + PERMISSION_MATRIX shape
- **`backend/core/entitlements.py`:** entire file loaded — `RETAIL_POS` confirmed at line 47
- **`backend/db/models/public/saas.py`:** Tenant model loaded — confirmed only `name`/`slug`/`schema_name`/`status`/`plan_id`/`timezone`/`settings_jsonb` columns; no address/phone/NPI
- **`lib/bff.ts`:** entire file loaded — proxyToFastAPI confirmed; raw `fetch` for non-JSON streams
- **`components/optical/OpticalQueueCard.tsx`:** entire file loaded — extension surface for draft-pending pill confirmed
- **`components/orders/CreateWalkInOrderModal.tsx`:** entire file loaded — submit-redirect path confirmed
- **`components/schedule/AppointmentDetailDrawer.tsx`:** lines 1-120 loaded — drawer donor pattern confirmed
- **`store/refractionStore.ts`:** lines 1-30 loaded — draft/committed dual-state + 1.5s debounce donor confirmed
- **`backend/tests/test_optical_order_contract.py`:** loaded — Wave 0 stub pattern confirmed
- **`backend/schemas/common.py`:** lines 18-34 — `CamelCaseModel` confirmed
- **`.claude/rules/{backend-python,bff-api,clinical-safety,testing}.md`:** all loaded
- **`.planning/config.json`:** loaded — `nyquist_validation: true` confirmed

### Secondary (none needed)

Every research question resolved via direct file read; no external WebSearch / Context7 / Brave Search required.

### Tertiary (none)

## Metadata

**Confidence breakdown:**
- Schema strategy & migration: HIGH — exact donor migration (0017) loaded and shape confirmed
- ORM extension: HIGH — `foreign_keys=[…]` pattern confirmed from clinical.py:1605–1607
- Place validation: HIGH — extension point confirmed at optical_order.py:268
- AI suggestion extraction: HIGH — saved-field shapes confirmed via ai_scribe.py:365–370 + services/ai_scribe.py:30
- Job ticket PDF: HIGH — donor confirmed at billing.py:673
- Configurator architecture: HIGH — autosave donor confirmed at refractionStore.ts:11–22
- AI extractor keyword list: MEDIUM — keyword list synthesized from domain knowledge + EyeCloudPro gap analysis; planner / first implementer should review and expand
- Tenant branding plumbing: MEDIUM — `settings_jsonb` path is conventional but not battle-tested; planner Open Question #2
- Plan count estimate: MEDIUM — Phase 13 had 16 plans, Phase 14 is leaner but the configurator UX has 6+ components; final count is planner discretion

**Research date:** 2026-05-14
**Valid until:** 2026-06-13 (30 days; stack is stable, no fast-moving deps)

## RESEARCH COMPLETE
