# Phase 14: Optical Order Configuration - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Mode:** Auto (user invoked `/gsd:discuss-phase 14` with no-clarifying-questions directive — recommended defaults selected for every gray area; reviewer should sanity-check before `/gsd:plan-phase 14`)

<domain>
## Phase Boundary

Phase 14 turns the Phase 13 thin `OpticalOrder` primitive into a fully configurable optical order. An optician opens an order from the optical queue (or walk-in entry point), sees the patient's Final Rx and Habitual Rx side-by-side with PD pre-filled, picks a frame from the catalog, configures lens type/material/coatings, captures fitting measurements (seg height, vertex distance, monocular PD), records vision plan name/member ID/group, and generates a printable lab job ticket PDF. AI Scribe optical recommendations (extracted from the existing structured-JSON pipeline) appear as ghosted suggestions in the order form.

**In scope (ROADMAP §Phase 14 success criteria 1-7):**
1. Configurator opens from optical queue with Final Rx pre-populated and PD pre-filled.
2. Habitual Rx column displayed side-by-side with Final Rx for patient explanation.
3. Frame selectable from Phase 13 product catalog; lens type + material + coatings selectable from new admin-managed reference catalog; order persists to DB.
4. Seg height + vertex distance captured (required when lens type = progressive).
5. Vision plan name, member ID, group number recorded on the order.
6. "Generate Job Ticket" produces a server-rendered PDF (reportlab) with both Rx columns, frame, lens, coatings, measurements, vision plan, and clinic header.
7. AI Scribe optical recommendations (from existing assessment_and_plan structured JSON) surface as ghosted, accept/dismiss suggestions inline in the configurator.

**Schema strategy:** `ADD COLUMN` to existing `OpticalOrder` + `OpticalOrderLineItem` per Phase 13 §C — no rebuild. Lens configuration stored as `lens_config_jsonb` on the line item (mirrors `Product.attributes` + `Patient.medical_history_jsonb` precedent — keeps Phase 14 flexible without 10+ new columns).

**Out of scope (deferred):**
- Checkout / payment / receipt / tax / refunds → Phase 15 POS.
- Vision-plan-specific pricing (allowance schedules) → Phase 15 (Phase 14 only RECORDS the plan).
- CMS-1500 / VSP claim submission → V3 / future.
- Lab tracking states (`ordered_with_lab`, `received_from_lab`) — deferred (Phase 13 lifecycle stays 4-status).
- Edit-after-place workflow — line items still lock at `placed` (cancel-and-recreate remains the only edit path; Phase 13 §C contract preserved).
- Photochromic / Transitions brand-name management — handled as a coating-attribute selection, not a separate product.
- Lens product images / measurements diagrams — V3.
- AI Scribe live-streaming optical suggestions — Phase 14 surfaces ONLY what's already in the encounter's saved structured JSON; no new streaming pipeline.

</domain>

<decisions>
## Implementation Decisions

### A. Lens catalog model (NEW reference tables, not extension of `Product`)
- **Rationale:** Phase 13 §A explicitly scoped `Product` to frames + contact lenses only. Spectacle lenses are NOT stocked — they're made-to-order by the lab. Forcing them through `Product`/`stock_qty` would corrupt the inventory model.
- **New tables (small, tenant-scoped reference data, admin-managed):**
  - `lens_types` — `id`, `tenant_id`, `name` (single vision | bifocal | progressive | reading), `requires_seg_height: bool`, `requires_vertex: bool`, `display_order`, `is_active`.
  - `lens_materials` — `id`, `tenant_id`, `name` (CR-39 | polycarbonate | trivex | hi-index 1.67 | hi-index 1.74 | hi-index 1.80), `refractive_index: numeric(3,2)`, `abbe_value: int?`, `is_active`.
  - `lens_coatings` — `id`, `tenant_id`, `name` (AR | UV | blue light | photochromic | polarized | scratch-resistant | mirror), `category` (treatment | tint | finish), `is_active`.
- **Pricing:** No pricing on the reference tables in Phase 14 — pricing layered in Phase 15 POS (avoids vision-plan-pricing scope creep). Phase 14 line items carry `unit_price` already from Phase 13.
- **Soft delete:** `is_active=false` mirrors `Product` pattern. Partial unique index `(tenant_id, name) WHERE is_active=true` per `feedback_no_hardcoded_text_colors.md`/Phase 10.1 precedent.
- **Seeding:** Dev seed (`backend/seed_db.py` `_seed_lens_reference()`) pre-populates 4 lens types + 6 materials + 7 coatings idempotently.

### B. Order schema extension (`ADD COLUMN` only — no table rebuild)
- **On `OpticalOrder`:**
  - `vision_plan_jsonb` — `{ name, member_id, group_number, authorization_number?, copay?, allowance? }`. JSONB so Phase 15 can layer vision-plan-pricing logic without ALTER. Snake-case JSONB keys preserved end-to-end per `feedback_camelizekeys_nested.md`.
  - `fitting_jsonb` — `{ pd_distance, pd_near?, pd_monocular_od?, pd_monocular_os?, seg_height_od?, seg_height_os?, vertex_distance?, pantoscopic_tilt? }`. Decimal-as-string TS-side per Phase 13-03 convention.
  - `habitual_refraction_id` — nullable FK to `refractions.id`, optional override when the doctor flagged a non-default habitual Rx.
  - `final_refraction_id` — nullable FK to `refractions.id`, the Rx the order is built from (snapshot pointer, prevents post-finalization drift surprises).
  - `job_ticket_generated_at` — `DateTime(timezone=True), nullable=True`. Set on first PDF generation; null until then. UI shows "Generate" vs "Re-generate".
- **On `OpticalOrderLineItem` (only when `product_type='frame'`-linked line OR a new lens-line shape):**
  - `lens_config_jsonb` — `{ lens_type_id, material_id, coating_ids: [], tint?: {color, percent}, custom_notes? }`. Validation runs in the place-handler: if lens_type.requires_seg_height → fitting_jsonb.seg_height_od + seg_height_os required (400 with field-level error). Frames-only lines (sunglass replacement, contacts) leave this null.
- **Migration:** Single Alembic revision adding 3 reference tables + 5 OpticalOrder columns + 1 OpticalOrderLineItem column. `ADD COLUMN IF NOT EXISTS` idempotency per Phase 10.2 pattern.

### C. Order lifecycle — Phase 13 contract preserved
- **No new status values.** Stays `draft → placed → dispensed → cancelled` exactly as Phase 13 set up. Lens config is added during `draft`. Place validates lens config completeness. Phase 14 does NOT introduce `ordered_with_lab` / `ready` — lab tracking is a V3 problem.
- **Edit lifecycle:** Line items + lens_config_jsonb + vision_plan_jsonb + fitting_jsonb ALL lock at `placed`. Cancel-and-recreate remains the only edit path (Phase 13 §C unchanged).
- **Validation gates on `POST /optical-orders/{id}/place`:**
  - Every line item that's a "spectacle build" (has lens_config_jsonb) must have lens_type_id + material_id.
  - If lens_type.requires_seg_height = true → fitting_jsonb.seg_height_od + seg_height_os required.
  - If lens_type.requires_vertex = true → fitting_jsonb.vertex_distance required.
  - Returns 400 with `field_errors: [{path, code, message}]` shape (Phase 9 superbill validation precedent).
- **Habitual / Final Rx snapshot:** `final_refraction_id` set at `draft` creation (defaults to most recent `FINAL` refraction for patient). `habitual_refraction_id` defaults to most recent `FINAL` refraction from prior encounter (>= 365 days old), nullable if none. Both editable in `draft`, locked at `placed`.

### D. Configurator UX — full-page route (not drawer)
- **Route:** `app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx`. Full-page rather than drawer — Phase 14 form spans Rx columns + frame picker + lens config + measurements + vision plan + AI suggestions = too dense for the 480px drawer pattern.
- **Entry points (3):**
  1. Optical queue card → `Configure Order` button → opens configurator with new draft order pre-filled from encounter.
  2. Patient Orders tab → click draft order → opens configurator.
  3. Walk-in order modal (Phase 13) → on submit creates draft → redirects to configurator (replaces current "save as line items only" flow for spectacle orders).
- **Layout:** Two-column on desktop, stacked on mobile.
  - Left column: Rx side-by-side panel (Habitual | Final, OD/OS rows, sphere/cyl/axis/add); PD pre-fill from `refraction.pd_distance`.
  - Right column: frame picker (search Phase 13 product catalog with `product_type='frame'`), lens config (cascading dropdowns lens_type → material → coatings multi-select), measurements (seg height required-marker appears when progressive), vision plan card.
- **Autosave:** 1.5s debounce + flush-on-blur (matches existing encounter draft pattern). Saves to `PATCH /optical-orders/{id}`.
- **OrderDetailDrawer (the Phase 13 `INV-15` pending one):** stays as the READ-ONLY drawer for placed/dispensed/cancelled orders on the patient Orders tab. Click a `draft` order → routes to configurator; click a non-draft → opens drawer. Phase 14 does NOT re-implement INV-15; just wires the click-routing.

### E. AI Scribe optical recommendations — read-only surfacing
- **Source:** existing `encounter.ai_summary_text` + the structured JSON saved via `applyResolutions()` (per `MEMORY.md` AI Scribe section). Specifically, the `assessment_and_plan` field already persists optical-relevant recommendations like "polycarbonate for child", "AR coating", "progressive at presbyopic age".
- **Extraction strategy:** Phase 14 adds a backend helper `extract_optical_suggestions(encounter)` that scans the saved structured JSON + a curated keyword list. Output: `{ lens_type?, material?, coatings?: [], rationale: str }`. No new AI call. No streaming. No new Claude prompt.
- **Display:** Suggestions render as ghosted placeholder text + a small ✨ chip next to each affected field in the configurator. Click ✨ → fills the field. Dismiss × → suppresses for this order. Stored as `suggestion_resolutions_jsonb` on `OpticalOrder` so re-opens don't re-prompt.
- **Permissions:** Suggestions visible to anyone with `VIEW_OPTICAL_ORDER`. Accepting/dismissing requires `CREATE_OPTICAL_ORDER` (i.e. matches who can edit the draft).
- **Out of scope:** Streaming live suggestions, training a new model, asking Claude during configurator open, any new Anthropic API spend.

### F. Job Ticket PDF — server-side reportlab
- **Generation:** `POST /optical-orders/{id}/job-ticket` → 200 with PDF blob (mirrors Phase 9 CMS-1500 PDF pattern, NOT Phase 6 `window.print()`). Reasoning: labs need a clean, archivable, byte-stable document. Browser print varies by user.
- **Layout sections (single page, 8.5×11):**
  - Header: clinic name, address, phone, NPI (from tenant branding).
  - Patient block: name, DOB, patient ID, encounter date.
  - Rx block (two columns): Habitual | Final, with OD/OS rows × sphere/cyl/axis/add/prism, PD distance + near.
  - Frame block: brand, model, color, eye size / bridge size / temple size, SKU.
  - Lens block: type, material (with refractive index), coatings (comma-separated), tint, custom notes.
  - Measurements block: monocular PD OD/OS, seg height OD/OS, vertex distance, pantoscopic tilt.
  - Vision plan block: name, member ID, group, auth number, copay.
  - Footer: "Generated by ClarityOS — {staff_name}, {timestamp}".
- **Audit:** Writes `JOB_TICKET_GENERATE` audit row + sets `job_ticket_generated_at`. Re-generation allowed (new audit row each time); UI label flips from "Generate" → "Re-generate".
- **Storage:** PDF NOT persisted — streamed on demand. Phase 9 CMS-1500 follows the same pattern. (Optional V3: cache to Supabase Storage.)
- **Frontend:** "Generate Job Ticket" button gates on order status = `placed`. Disabled in `draft` (a draft job ticket would mislead the lab). Tooltip "Place order first" when disabled.

### G. Permissions — extend Phase 13 ClinicalAction enum
- **Reuse existing where possible.** `CREATE_OPTICAL_ORDER` covers configurator edits; `VIEW_OPTICAL_ORDER` covers viewing the configurator; `CANCEL_OPTICAL_ORDER` unchanged.
- **New ClinicalAction values (2):**
  - `GENERATE_JOB_TICKET` → {T, A, O} (tech, admin, owner — doctors don't typically issue lab tickets, receptionists CAN per typical optical-shop workflow → also include R).
    - Actually finalize as: `GENERATE_JOB_TICKET` → {T, R, A, O} (matches CREATE_OPTICAL_ORDER's set).
  - `MANAGE_LENS_CATALOG` → {A, O} (admin/owner only — same scope as `MANAGE_INVENTORY`).
- **Entitlement gate:** All Phase 14 routes inherit Phase 13's `retail_pos` add-on gate via `Depends(require_entitlement(Entitlement.RETAIL_POS))`. No new entitlement keys.

### H. Audit — extend AuditAction enum
- **New AuditAction values (5):**
  - `OPTICAL_ORDER_CONFIGURE_UPDATE` — on PATCH to draft order (covers lens_config, fitting_jsonb, vision_plan_jsonb mutations as a single rolled-up action; spammy to log per-field).
  - `JOB_TICKET_GENERATE` — on PDF generation.
  - `LENS_TYPE_CREATE`, `LENS_MATERIAL_CREATE`, `LENS_COATING_CREATE` — admin reference-catalog management. UPDATE/DEACTIVATE reuse the same enum names with a `metadata.action` discriminator (avoids enum explosion).
- **All logged in primary TXN** via `log_action()` per `.claude/rules/clinical-safety.md`.

### I. BFF routes (planner reference)
- `app/api/optical-orders/[orderId]/` — PATCH (configurator autosave — extends Phase 13's GET-only route).
- `app/api/optical-orders/[orderId]/job-ticket/` — POST (PDF stream; raw `fetch` + `getAuthHeaders()` not `proxyToFastAPI()` because of Blob response, mirrors Phase 10.4 CSV export).
- `app/api/optical-orders/[orderId]/suggestions/` — GET (AI Scribe optical suggestions for this order).
- `app/api/optical-orders/[orderId]/suggestions/[suggestionId]/` — POST `accept` | POST `dismiss`.
- `app/api/lens-catalog/types/` — GET list, POST create.
- `app/api/lens-catalog/types/[id]/` — GET, PATCH, DELETE (soft).
- `app/api/lens-catalog/materials/` — GET, POST.
- `app/api/lens-catalog/materials/[id]/` — GET, PATCH, DELETE.
- `app/api/lens-catalog/coatings/` — GET, POST.
- `app/api/lens-catalog/coatings/[id]/` — GET, PATCH, DELETE.
- All with trailing-slash upstream URLs per `.claude/rules/bff-api.md`.

### J. Requirements to add during `/gsd:plan-phase` (planner task)
Add `OPT14-01..OPT14-N` (or follow existing `INV-` extension convention) to `.planning/REQUIREMENTS.md`:
- OPT14-01..07 — the 7 ROADMAP success criteria.
- OPT14-08..N — decisions above (lens reference tables, JSONB columns on order/line, Rx snapshot FK, AI suggestion resolution storage, permissions extension, audit extension, configurator route, OrderDetailDrawer routing).

### K. Pending todo to absorb
- `2026-05-08-optical-queue-draft-order-indicator.md` — "Optical queue: surface draft order existence on card." Phase 14 must include this fix (`OpticalQueueItem.draft_order_count` schema field + UI pill on OpticalQueueCard.tsx). It's a tiny scope but it's prerequisite for the Phase 14 configurator UX — a user who saves a draft must see it from the queue card next visit, or they'll create a duplicate. Treat as a sub-task inside the Phase 14 plan rather than a separate phase.

### Claude's Discretion
- Exact reportlab template styling (font sizes, table padding, header layout).
- Color of the ✨ AI-suggestion chip.
- Animation timing for ghosted placeholder fade-in.
- Validation message wording (use existing copy patterns).
- TS camelCase field names mapping the new JSONB shapes — follow Phase 13 conventions (snake_case JSONB keys preserved verbatim).
- E2E test fixture data shape (lean on Phase 13 seed).
- Whether to ship the patient Orders tab `INV-15` OrderDetailDrawer in Phase 14 or carry forward as a Phase 13 leftover — recommended to ship inside Phase 14 since the configurator routing depends on it.
- Whether to absorb `INV-04` / `INV-05` / `INV-20` (other Phase 13 pending requirements — Inventory page polish, patient Orders tab, sidebar gating) into Phase 14 plan or carry forward — recommend carrying forward to keep Phase 14 scope focused; planner should explicitly call out the carry-forward in PLAN.md.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase boundaries
- `.planning/ROADMAP.md` §Phase 14 — Optical Order Configuration success criteria 1-7 (authoritative scope).
- `.planning/ROADMAP.md` §Phase 13 — Retail Inventory boundary (what's already built; do not duplicate).
- `.planning/ROADMAP.md` §Phase 15 — Point of Sale boundary (what Phase 14 must NOT build: checkout, payment, vision-plan-pricing).
- `.planning/ROADMAP.md` §Phase 6 — Optical Handoff (existing `optical_status` column, Rx PDF, optical queue).
- `.planning/phases/13-retail-inventory/13-CONTEXT.md` — Phase 13 decisions, especially §C (`OpticalOrder` Phase 14 `ADD COLUMN` contract), §F (permissions baseline), §G (audit baseline), §H (`retail_pos` entitlement).
- `.planning/REQUIREMENTS.md` — `OPT14-*` requirements to be added during `/gsd:plan-phase`.

### Project rules (non-negotiable)
- `.claude/rules/clinical-safety.md` — primary-TXN writes (lens config + fitting + vision plan mutations write audit in same TXN); never log PHI.
- `.claude/rules/bff-api.md` — every new backend route gets a BFF proxy with trailing-slash upstream URLs.
- `.claude/rules/backend-python.md` — `selectinload` after `db.flush()`, enums as VARCHAR(20), JSONB `server_default` via `sa.text()`.
- `.claude/rules/testing.md` — vitest + Playwright conventions; new endpoint pairs need a contract test (Pydantic `by_alias` snapshot ↔ TS literal-keys vitest assert) per `feedback_contract_tests.md`.

### Existing code (orienting references)
- `backend/db/models/tenant/clinical.py:1480` — `Product` (Phase 13).
- `backend/db/models/tenant/clinical.py:1534` — `OpticalOrder` (Phase 14 ADD COLUMN target).
- `backend/db/models/tenant/clinical.py:1616` — `OpticalOrderLineItem` (Phase 14 ADD COLUMN target).
- `backend/db/models/tenant/clinical.py:726` — `Refraction` model + `pd_distance` (line 776) / `pd_near` (line 777) — auto-fill source.
- `backend/db/models/tenant/clinical.py:534` — `Encounter.optical_status` (Phase 6 column; Phase 14 must not mutate — read-side only per Phase 13 §C rollup).
- `backend/api/routes/optical.py` — Phase 6 optical queue routes; Phase 14 extends `OpticalQueueItem` schema with `draft_order_count`.
- `backend/api/routes/optical_order.py` — Phase 13 order routes; Phase 14 adds PATCH (configurator autosave), job-ticket, suggestions endpoints to this same module.
- `backend/api/routes/ai_scribe.py` — existing structured-JSON store; Phase 14 reads from saved `encounter.ai_summary_text` + `assessment_and_plan` JSON — no streaming.
- `components/schedule/AppointmentDetailDrawer.tsx` — pattern for read-only OrderDetailDrawer (placed/dispensed/cancelled view).
- `components/optical/OpticalQueueCard.tsx` — Phase 13 card; Phase 14 adds "Configure Order" CTA and draft-pending pill.
- `components/orders/CreateWalkInOrderModal.tsx` — Phase 13 walk-in entry; Phase 14 updates submit → redirect-to-configurator for spectacle orders.
- `app/(tenant)/[tenant]/optical/page.tsx` — Phase 6/13 queue page; Phase 14 wires the "Configure Order" action.

### Memory references (high-value, read before planning)
- `MEMORY.md` AI Scribe Architecture Notes — explains why `assessment_and_plan` is persisted only via `applyResolutions()` (not streaming/fire-and-forget); Phase 14 suggestions read from this persisted shape, NOT from live streams.
- `feedback_camelizekeys_nested.md` — JSONB nested keys must stay snake_case end-to-end (lens_config_jsonb, fitting_jsonb, vision_plan_jsonb all affected).
- `feedback_contract_tests.md` — Phase 14 ships ProductResponse-style contract tests for `OpticalOrderResponse` (extended) + `LensTypeResponse` + `LensMaterialResponse` + `LensCoatingResponse`.
- `feedback_no_hardcoded_text_colors.md` — configurator UI must use CSS variables (`--text-primary`, `--bg-glass`, `--glass-border`), no `text-white` / `text-black` hardcoded.
- `feedback_check_prior_commits_first.md` — `git log --grep="14-"` is step 2 of execute-phase (after plan index, before reading source).
- `feedback_execute_phase_no_confirm.md` — `/gsd:execute-phase 14-NN` runs that single plan, interactive, no scope confirmation.
- `bff-route-map.md` — check existing BFF route inventory before adding new endpoints (Phase 14 adds ~10 new routes; ensure no naming collisions).
- `seed-data.md` — canonical patient/encounter IDs for E2E test scaffolding.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OpticalOrder` + `OpticalOrderLineItem` from Phase 13 — `ADD COLUMN` extension target, lifecycle and concurrency control (`with_for_update()` on Product) already in place.
- `Product` catalog with `product_type='frame'` — frame picker reads from existing GET `/api/inventory/products?type=frame` route (Phase 13).
- `Refraction.pd_distance` + `pd_near` — auto-fill source for fitting_jsonb.
- `backend/api/routes/ai_scribe.py` `assessment_and_plan` — source of optical recommendations (read-only).
- `lib/utils/generateRxPdf.ts` (Phase 6) — Rx PDF pattern, but Phase 14 does NOT reuse this; uses reportlab instead (different printer-archival audience).
- `backend/api/routes/billing.py` CMS-1500 reportlab generator — template/file structure to clone for `job_ticket.py`.
- `lib/bff.ts` `proxyToFastAPI()` — most new routes proxy normally; job-ticket route uses raw `fetch` for Blob streaming (per Phase 10.4-04 CSV pattern).
- `components/schedule/AppointmentDetailDrawer.tsx` — clone for OrderDetailDrawer.
- `store/billingStore.ts` autosave debounce pattern — clone for orderConfigStore.

### Established Patterns
- JSONB columns with snake_case keys preserved end-to-end (`Patient.medical_history_jsonb`, `Product.attributes`); Phase 14 adds 4 more.
- Partial unique index `WHERE is_active=true` (Phase 10.1, Phase 13) — apply to `lens_types`, `lens_materials`, `lens_coatings` on `(tenant_id, name)`.
- Pydantic CamelCaseModel + `by_alias=True` serialization (Phase 13-03) — every new schema inherits.
- Decimal-as-string TS interface convention (`retailPrice`, `pdDistance`, `segHeight`).
- `Depends(require_entitlement(Entitlement.RETAIL_POS))` on router declaration (Phase 13-04 pattern) — Phase 14 inherits.
- `log_action()` in primary TXN for every clinical mutation (Phase 13-04/13-05) — Phase 14 adds 5 new audit actions.
- `with_for_update()` on Product row before stock mutation (Phase 13-05) — Phase 14 does not introduce new stock mutations; configurator edits draft only.
- Autosave: 1.5s debounce + flush-on-blur (encounter draft pattern from Phase 2).
- BFF Blob streaming via raw `fetch` + `getAuthHeaders()` (Phase 10.4-04 CSV export, Phase 9 CMS-1500 PDF download).

### Integration Points
- `app/(tenant)/[tenant]/optical/page.tsx` — wire "Configure Order" CTA on each queue card.
- `components/optical/OpticalQueueCard.tsx` — add draft-pending pill + "Configure Order" button.
- `components/patients/PatientOrdersTab.tsx` (Phase 13 INV-05 pending) — route draft orders to configurator, non-draft to drawer.
- `backend/seed_db.py` — extend `seed_tenant_schema()` with `_seed_lens_reference()` call.
- `lib/entitlements.ts` — no changes; Phase 14 reuses `retail_pos`.
- `backend/core/permissions.py` `PERMISSION_MATRIX` — add 2 rows (`GENERATE_JOB_TICKET`, `MANAGE_LENS_CATALOG`).
- `backend/api/routes/__init__.py` (or wherever routers are registered) — register `lens_catalog` router.
- Sidebar admin nav — no new top-level link; lens catalog management lives inside the Inventory page as a new "Lens Catalog" sub-tab (avoids menu sprawl).

</code_context>

<specifics>
## Specific Ideas

- **Side-by-side Rx panel** should mirror the "How EyeCloudPro shows habitual vs final" callout in `gap_analysis_eyecloudpro.md` — two parallel tables with OD/OS rows, sphere/cyl/axis/add/prism columns, plus a delta-flag row at the bottom highlighting any column where Final − Habitual exceeds ±0.50D (matches Phase 6 Rx Change Alert threshold).
- **PD pre-fill semantics:** auto-fill from `refraction.pd_distance` and `pd_near` if present; if missing, leave blank and badge "PD not captured — measure with pupillometer". Don't fabricate.
- **Progressive seg height required-marker** should visually highlight when lens_type changes to "progressive" — red asterisk + helper text "Required for progressives — measure from pupil center to bottom of lens".
- **AI suggestion accept/dismiss persistence:** once dismissed, suggestion stays hidden for THIS order only. Re-opening the configurator does not re-prompt. Implemented via `OpticalOrder.suggestion_resolutions_jsonb`.
- **Job Ticket PDF aesthetic:** "looks like a lab work order, not a marketing brochure" — black/white, monospaced data values, clear table grids. Patient-facing material is the Phase 6 Rx PDF.
- **Phase 13 carry-forward (INV-04, INV-05, INV-15, INV-20):** these are tracked Phase 13 pending requirements not yet shipped. Phase 14 plan should explicitly call out which it absorbs (recommend INV-15 OrderDetailDrawer = absorb, since the configurator routing depends on it; INV-04/INV-05/INV-20 = leave as Phase 13 leftover unless planner identifies tight coupling).

</specifics>

<deferred>
## Deferred Ideas

- Vision-plan-specific pricing / allowance schedules (VSP / EyeMed / Davis Vision benefit calculations) → Phase 15 POS.
- Vendor / lab management (per-tenant lab list, lab account credentials, electronic order submission) → V3.
- Lab tracking states (`ordered_with_lab`, `received_from_lab`, `ready_for_pickup`) → V3 (would require new status values; Phase 14 contract preserves Phase 13's 4-status lifecycle).
- Lens product images / measurement diagrams → V3.
- Bulk frame import via CSV → Phase 16 reporting/exports or V3.
- Streaming live AI suggestions during configurator edit (new Claude prompt, new model spend) → V3.
- Photochromic / Transitions brand-name SKU tracking (rather than a coating attribute) → V3 if customer demand emerges.
- Tax application on optical orders → Phase 15 POS.
- Refunds / returns on dispensed orders → Phase 15 POS.
- Patient-facing "Order Status" view (when can I pick up my glasses?) → V3 / patient portal.
- Reminder SMS when order is dispensed (overlap with Phase 12 CRM) → Phase 12.x extension.
- Lens-config snapshot diff viewer (like the AI Scribe Clinical Diff Viewer but for lens config) → V3 if cancel-and-recreate proves friction-heavy.
- Tracking of frame returns to vendor (negative inventory transactions tied to vendor RMA) → V3.

</deferred>

---

*Phase: 14-optical-order-configuration*
*Context gathered: 2026-05-14*
*Auto-mode: recommended defaults selected for every gray area; review before planning.*
