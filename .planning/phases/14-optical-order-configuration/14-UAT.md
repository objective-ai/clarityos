---
status: resolved
phase: 14-optical-order-configuration
source: [14-00-SUMMARY.md, 14-01-SUMMARY.md, 14-02-SUMMARY.md, 14-03-SUMMARY.md, 14-04-SUMMARY.md, 14-05-SUMMARY.md, 14-06-SUMMARY.md, 14-07-SUMMARY.md, 14-08-SUMMARY.md, 14-09-SUMMARY.md, 14-10-SUMMARY.md, 14-11-SUMMARY.md]
started: 2026-05-26T15:00:00Z
updated: 2026-05-27T22:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Servers boot fresh, seed_db.py completes including `_seed_lens_reference` (4 types + 6 materials + 7 coatings) and `_seed_phase14_fixture` AI summary, login + optical queue page loads with data.
result: pass
note: First run produced empty Schedule + Optical queue pages — root cause was stale seed dates (latest appt was 2026-05-15, today is 2026-05-27). `seed_db.py` skips on existing rows so dates never refresh. Resolved by running `RESEED=true python backend/seed_db.py` (npm run db:reseed). Cold-start sequence itself worked once data was fresh.

### 2. Optical Queue — Configure Order CTA + Draft Pending Pill
expected: On the optical queue page, each queue card shows a "Configure Order" CTA. Cards for encounters with at least one draft optical order display a "Draft pending" pill. Clicking the pill or CTA routes to `/optical/orders/[orderId]` (the configurator) or creates a new draft.
result: issue
reported: "issue with displaying cards — Configure Order CTA overlaps Print Rx button on queue cards (screenshot). Also: if I click + Create Order by accident, there's no way to go back or cancel the action."
severity: major
note: Two issues from the optical queue card area — (a) button layout overlap; (b) accidental + Create Order has no undo (clicking creates a persisted draft order with no obvious cancel path from the configurator or queue).

### 3. Walk-In Order → Configurator Redirect (when frame selected)
expected: From the orders tab, click "+ New Walk-In Order". Select a frame in the modal. On submit, the modal closes and the browser navigates to the configurator page for the newly created draft order (not back to the orders list).
result: pass
note: User reached configurator (screenshot showed Lens Configuration section + Cancel/Place Order/Generate Job Ticket footer) — navigation flow worked. Visual finding on the configurator itself was logged against Test 5.

### 4. Patient Orders Tab — Status-Based Row Routing
expected: In a patient's Orders tab, clicking a row with `status=draft` opens the configurator page. Clicking a row with any other status (`placed`, `dispensed`, etc.) opens the OrderDetailDrawer side panel.
result: issue
reported: "no order tab for james thornton"
severity: major
note: Orders tab is gated on Entitlement.RETAIL_POS at app/(tenant)/[tenant]/patients/[patientId]/page.tsx:447. Either the entitlement isn't reaching this page for the dev user (silent fallback per debugging_supabase_jwt_entitlements.md), or the tab is genuinely missing for this account/plan. Cannot verify draft → configurator vs non-draft → drawer routing without the tab visible.

### 5. Configurator Page Layout
expected: Configurator renders a two-column responsive layout containing: Habitual | Final Rx side-by-side panel, Frame Picker, Lens Config Section (lens type + material + coatings dropdowns populated from seeded catalog), Measurements (seg height, vertex, PD), Vision Plan section, Suggestion chips area, and a footer with Place + Generate Job Ticket buttons. All text/background colors render correctly in both light and dark mode (no white-on-white).
result: issue
reported: "1. frames added but can't remove. took awhile after clicking on it too. 2. lens type and materials not selecting. 3. measurement and vision is empty. 4. not chips visible. 5. having just the RX on the left seems to have alot of white space after while the right is packed with things. Plus earlier: semi-transparent footer hard to read when text scrolls under."
severity: blocker
note: |
  Six configurator findings (5 above + 1 from earlier screenshot):
  (a) Frame add is slow (latency after click) and frame remove is broken (no working remove control on selected frame chip).
  (b) Lens Type + Material dropdowns don't select (click does not register / picker doesn't open / selection doesn't commit).
  (c) Measurements section and Vision Plan section appear empty (either no inputs rendering or sections not populated).
  (d) AI suggestion chips not visible — expected on the Thornton encounter (Phase 14 E2E fixture seeded an AI summary into encounter e0000000).
  (e) Layout imbalance — Final/Habitual Rx panel on left has trailing whitespace while right column is densely packed.
  (f) Footer (Cancel / Place Order / Generate Job Ticket) has glass background that is hard to read when scrolled content shows through.
  Findings (a)-(d) are functional blockers that prevent Tests 7-10 from being meaningfully exercised; (e)-(f) are layout/UX issues. Downstream tests will likely surface the same root causes.

### 6. Final Rx Auto-Prefill on Draft Creation
expected: Creating a new draft optical order from a finalized encounter auto-fills the Final Rx panel from that encounter's most recent FINAL refraction. For a walk-in order with no encounter, the Final Rx falls back to the patient's most recent FINAL refraction in history.
result: skipped
reason: Blocked by Test 5 — configurator has multiple functional blockers (dropdowns, sections empty). Cannot meaningfully verify auto-prefill until the configurator renders correctly. Re-test after fix plans land.

### 7. Configurator Autosave (1.5s debounce + flush on blur)
expected: Edit any configurator field (e.g. add a coating, change lens type, type a vision-plan member ID). Within ~1.5 seconds (or immediately when the input loses focus), a PATCH request fires to `/api/optical-orders/[orderId]`. Refreshing the page shows the saved changes persisted.
result: skipped
reason: Blocked by Test 5 — cannot edit fields when dropdowns don't select and measurements/vision plan sections are empty. Re-test after configurator fixes.

### 8. AI Suggestion Chips — Extract / Accept / Dismiss
expected: When the configurator is opened on a draft tied to the Phase 14 seeded encounter (Thornton patient), ✨ AI suggestion chips appear above relevant fields (lens type, material, coatings) with values extracted from the encounter's AI Scribe note. Clicking a chip accepts the suggestion (fills the field + chip disappears). Clicking the × dismisses (chip disappears + persists; doesn't re-appear on reload).
result: skipped
reason: Blocked by Test 5 — user reported "not chips visible" while testing configurator layout. Already captured under the Test 5 gap. Re-test once chips render.

### 9. Lens Config Validation Gate on Place
expected: With a progressive lens type selected but no seg height entered, click Place → request fails with a 400 field error explaining seg_height is required (no partial save, line items not committed). Same for a lens type that requires vertex distance with vertex_distance blank. Filling the required field and clicking Place succeeds.
result: skipped
reason: Blocked by Test 5 — cannot select a lens type to trigger the validation path. Re-test after lens dropdown fix.

### 10. Generate Job Ticket PDF Download
expected: After placing an order (status=placed), the configurator footer and OrderDetailDrawer both expose a "Generate Job Ticket" button. Clicking it triggers a PDF download (browser save dialog or auto-download with filename like `job-ticket-*.pdf`). Opening the PDF shows the 7-section lab work order (header, patient, Rx block, lens config, frame, measurements, vision plan). After first generation, the button label changes to "Re-generate Job Ticket".
result: skipped
reason: Blocked by Test 5 — cannot reach status=placed without a configurable order. Will partially re-verify via Test 11 (drawer Generate Job Ticket button against an existing placed order from seed).

### 11. OrderDetailDrawer — Phase 14 Read-Only Sections
expected: Opening a placed/dispensed optical order in the drawer shows new read-only sections: Lens Configuration (per line item, with lens type / material / coatings / seg height / vertex), Vision Plan (member ID, copay, plan name), and the Generate/Re-generate Job Ticket button (visible only when `status === 'placed'`).
result: skipped
reason: |
  User: "i cant' find a placed order. shows dispense as well as 5 draft orders" (screenshot of Hargrove card with Dispensed badge + Draft pending (5)).
  DB inspection confirms 1 placed + 5 draft optical orders, all on Hargrove, but no obvious UI surface exposes the placed order for drill-in (Orders tab missing per Test 4; queue card lacks a per-order picker).
  Two secondary findings observed in the same screenshot, both worth diagnosis:
  (i) Draft pending (5) = confirms the no-cancel issue from Test 2 created 5 unwanted drafts during this UAT session.
  (ii) Queue card displays "Dispensed" status badge while the DB has only 1 placed + 5 draft orders for this encounter — status rollup logic appears to over-promote or be detached from order state.
  Re-test once a placed-order drill-in path exists (depends on Test 4 fix + possibly a status-rollup fix).

### 12. Lens Catalog Admin CRUD (smoke)
expected: As an admin/owner role, navigate to the lens-catalog admin surface (or hit `/api/lens-catalog/types/` via the BFF). Creating a new lens type, material, or coating succeeds. Creating a duplicate active name returns a 409 duplicate_name error. Soft-deleting (DELETE) flips `is_active=false` and the row no longer appears in the catalog dropdowns inside the configurator.
result: issue
reported: "inventory is grayed out and no lens catalog"
severity: minor
note: |
  Two findings:
  (a) No admin UI for lens catalog CRUD exists. Plan 14-02 shipped 15 backend endpoints + Plan 14-07 shipped 6 BFF routes, but no Phase 14 plan built an admin page to exercise them. Seed data (4 types + 6 materials + 7 coatings) is verified present in the DB and consumed by the configurator dropdowns (when those work).
  (b) Inventory nav item is grayed out for this user. Likely same RETAIL_POS / entitlement consistency issue as Test 4 (Orders tab missing), since both are RETAIL_POS-gated surfaces.
  Backend correctness is partially verified via seed + Phase 14 unit tests; full CRUD smoke (create / 409 duplicate / soft-delete propagation to configurator dropdowns) cannot be exercised without either an admin UI or a logged-in API call.

## Summary

total: 12
passed: 2
issues: 4
pending: 0
skipped: 6

## Gaps

- truth: "Optical queue cards render the new Configure Order CTA without overlapping existing buttons AND accidental clicks on Configure/Create Order have a cancel/undo path before a persisted draft is created"
  status: resolved
  reason: "User reported card layout overlap + 5 stray drafts accumulated from clicks with no undo."
  severity: major
  test: 2
  root_cause: |
    Two defects on the same OpticalQueueCard surface (Plan 14-10 added affordances without revisiting footer invariants):
    (A) Layout — action footer is a single non-wrapping flex row hosting up to 4 buttons (Print Rx, Start Processing/Mark Dispensed, + Create Order, Configure Order). Intrinsic content width (~489px) exceeds per-card budget (~360-450px at md:grid-cols-2 / xl:grid-cols-3) with no flex-wrap or responsive collapse → visual collision.
    (B) No undo — the real culprit is Configure Order (not + Create Order which opens a modal with Cancel). handleConfigureOrder fires createOrder POST → persists draft → router.push → configurator footer Cancel only calls router.back() (does NOT delete the draft). Store exports cancelOrder but no UI invokes it.
  artifacts:
    - path: "components/optical/OpticalQueueCard.tsx"
      issue: "Action footer (lines 266-338) is non-wrapping flex row; handleConfigureOrder (lines 124-138) persists draft with no confirmation"
    - path: "components/optical/configurator/ConfiguratorFooter.tsx"
      issue: "Cancel button (lines 23-29) is router.back() only — doesn't discard the draft"
    - path: "app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx"
      issue: "onCancel handler at line 151 doesn't invoke store.cancelOrder for status=draft"
  missing:
    - "Wrap or collapse the footer button row (add flex-wrap, OR consolidate + Create Order and Configure Order into a single CTA, OR move secondary actions to overflow menu)"
    - "When status === 'draft', re-label ConfiguratorFooter Cancel → 'Discard draft' and call useOpticalOrderStore.cancelOrder(orderId) before router.back()"
    - "Confirm backend allows cancel transition from draft; if not, add DELETE /api/optical-orders/{id}/ route gated to status=draft"
    - "Extend Plan 14-11 Playwright spec with Configure → Discard → assert no Draft pending pill increment"
  debug_session: ".planning/debug/queue-card-cta-layout-and-cancel.md"

- truth: "Patient detail page exposes Orders tab AND Sidebar Inventory link is enabled for users with RETAIL_POS entitlement"
  status: resolved
  reason: "User: 'no order tab for james thornton' (Test 4) and 'inventory is grayed out' (Test 12)."
  severity: major
  test: 4
  root_cause: |
    RETAIL_POS is missing from the user's current JWT app_metadata.entitlements. session-hydrator silently falls back to PLAN_FEATURES["Premium"], which does NOT include RETAIL_POS (it is an Add-on, never bundled). Patient page Orders tab gate (page.tsx:447), Sidebar Inventory gate (Sidebar.tsx:153), and OpticalQueueCard Phase 14 CTAs all gate on the same has(Entitlement.RETAIL_POS) — gate logic is correct; the entitlement value is wrong. Exact silent-fallback pattern documented in [debugging_supabase_jwt_entitlements.md] (recurring within same day). Test 2 capturing the queue card overlap suggests RETAIL_POS WAS present at one point (right after RESEED/fresh login) but is now degraded — likely tenant_addons row missing post-reseed or the JWT hook is mis-configured.
  artifacts:
    - path: "app/(tenant)/[tenant]/patients/[patientId]/page.tsx"
      issue: "Orders tab gate at line 447 — correct gate, missing entitlement (silent disappear UX vs Sidebar's locked-with-padlock UX)"
    - path: "components/Sidebar.tsx"
      issue: "Inventory entry at line 153 — correct gate; rendering at lines 191-218 produces the 'grayed out' visual"
    - path: "lib/auth/session-hydrator.ts"
      issue: "Lines 100-105 silently fall back to PLAN_FEATURES without console.warn"
    - path: "backend/db/sql/custom_access_token_hook.sql"
      issue: "Lines 86-139 union public.tenant_addons.feature_key into JWT claims — must be registered + DB row must exist"
    - path: "backend/seed_db.py"
      issue: "_seed_tenant_addons (lines 347-388) is the only seed path for RETAIL_POS — verify it ran during RESEED"
  missing:
    - "Walk the 5-link chain from [debugging_supabase_jwt_entitlements.md]: decode JWT → verify hook fn exists → verify Dashboard hook toggle → verify tenant_addons row → fresh login to mint new JWT"
    - "Direct hook invocation SQL: SELECT public.custom_access_token_hook(jsonb_build_object('user_id','c75da6ec-259c-4f97-933c-8dbea5ebbdf3','claims',jsonb_build_object('app_metadata','{}'::jsonb)));"
    - "Add console.warn in session-hydrator.ts when entitlements empty + fallback fires (saves future 30 min debug cycles)"
    - "Consider rendering a locked Orders tab with upsell tooltip (matching Sidebar pattern) so missing entitlement looks 'locked' not 'broken'"
  debug_session: ".planning/debug/orders-tab-missing-entitlement.md"

- truth: "Configurator page works end-to-end: frame add/remove, lens type & material selection commit, Measurements + Vision Plan inputs render, AI suggestion chips appear on Phase 14 fixture encounter, two-column layout balanced, footer readable when content scrolls under it"
  status: resolved
  reason: "Six sub-findings on configurator."
  severity: blocker
  test: 5
  root_cause: |
    Six symptoms → five distinct root causes (no single shared origin):
    RC-1 (can't remove frame): MISSING end-to-end — no DELETE backend route, no removeLineItem store method, no × control in FramePicker. PATCH route also can't remove (returns 400 unknown_line_item).
    RC-2 (slow add): UX missing progress signal — addLineItem awaits flush() → POST → backend audit + selectinload + commit + re-fetch; only feedback is opacity-60 on button. User perceives slow because no spinner/label change. Not a code bug, missing UI affordance.
    RC-3 (dropdowns don't select + sections look empty): HIDDEN PRECONDITION — LensConfigSection lensLine = items.find(li => li.lensConfig != null) ?? items[0] ?? null; setField guards if (!lensLine) return. When draft has zero line items, onChange is silent no-op. MeasurementsSection requiresSegHeight/requiresVertex also derive from lineItems[0].lensConfig.lens_type_id → blank state. User tried lens dropdowns before adding a frame → silent failure.
    RC-4 (no chips): WRONG TEST DATA — _seed_phase14_fixture targets THORNTON's most-recent finalized encounter (seed_db.py:2122 last_name='Thornton'). User was testing on a HARGROVE draft. extract_optical_suggestions correctly returns suggestions=[], rationale='No AI Scribe data on encounter'. Not a code bug.
    RC-5 (layout imbalance): LAYOUT DESIGN ERROR — page.tsx:124-144 hard-codes grid-cols-1 lg:grid-cols-2 with left=1 section (Rx ~10 rows) vs right=4 stacked sections. Right ~4× taller than left.
    RC-6 (glass footer readability): MISSING CSS — ConfiguratorFooter.tsx:22 uses bg-[var(--bg-glass)] (semi-transparent rgba) with no backdrop-blur-*. Scrolled content shows through sharp.
    Eliminated hypotheses: "single bug breaking everything" (visionPlan/fitting default to {} never null; sections render unconditionally) and "backend 403 hiding lens catalog" (route gates on VIEW_INVENTORY granted to Owner).
  artifacts:
    - path: "backend/api/routes/optical_order.py"
      issue: "RC-1: Missing DELETE /optical-orders/{id}/line-items/{lineId}/ route (only POST at lines 359-364)"
    - path: "store/opticalOrderConfigStore.ts"
      issue: "RC-1: Missing removeLineItem method. RC-2: addLineItem at lines 96-129 always flushes synchronously"
    - path: "components/optical/configurator/FramePicker.tsx"
      issue: "RC-1: No × control on selected chip (lines 101-105). RC-2: No spinner/Adding... label on the picker button"
    - path: "components/optical/configurator/LensConfigSection.tsx"
      issue: "RC-3: Lines 33-45 silently no-op when no lineItems present; no empty-state UI or disabled selects"
    - path: "components/optical/configurator/MeasurementsSection.tsx"
      issue: "RC-3 secondary: Lines 33-45 derive requirements from lineItems[0] — appear empty before frame added"
    - path: "components/optical/configurator/ConfiguratorFooter.tsx"
      issue: "RC-6: Line 22 missing backdrop-blur-md; --bg-glass alone is too transparent for sticky chrome"
    - path: "app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx"
      issue: "RC-5: Lines 124-144 grid-cols-1 lg:grid-cols-2 produces imbalanced columns (1 left vs 4 right)"
    - path: "backend/seed_db.py"
      issue: "RC-4: _seed_phase14_fixture (lines 2094-2178) only targets Thornton; Hargrove drafts have no AI summary so chips correctly empty"
  missing:
    - "RC-1: Build DELETE /optical-orders/{id}/line-items/{lineId}/ (status=draft only) + removeLineItem store action + × button on selected frame chip"
    - "RC-2: Add 'Adding…' label or spinner when adding === p.id; skip no-op flush when dirty set is empty"
    - "RC-3: Render empty-state ('Select a frame above to configure lenses') and disable selects when lensLine === null; same for measurements"
    - "RC-4: Either redirect UAT to test on Thornton draft OR extend _seed_phase14_fixture to also seed Hargrove encounter so the topmost queue card matches user expectation"
    - "RC-5: Re-layout — either RxSideBySidePanel banner full-width at top then 2-col below, or rebalance left=Rx+Frame+Lens / right=Measurements+VisionPlan"
    - "RC-6: Add backdrop-blur-md (or -lg) to ConfiguratorFooter; consider --bg-glass-solid CSS variable for sticky chrome"
  debug_session: ".planning/debug/configurator-runtime-broken.md"

- truth: "Lens catalog admin UI exists for create/edit/soft-delete of lens types, materials, coatings"
  status: resolved
  reason: "User: 'no lens catalog' — separate from Inventory grayed out which shares root cause with Test 4."
  severity: minor
  test: 12
  root_cause: |
    SCOPE GAP, not a regression. Phase 14 was deliberately backend-only for the catalog (Plan 14-02: 15 endpoints, Plan 14-07: 6 BFF routes, Plans 14-08/14-09: read-only consumption by configurator). Zero OPT14-* requirements (REQUIREMENTS.md lines 165-182) cover an admin CRUD UI. OPT14-03 'admin-managed reference catalogs' describes data lineage, not UI. Plan 14-02 explicitly defers admin UI: 'Admin Inventory page eventually gets a Lens Catalog sub-tab.' lensCatalogStore is read-only (zero create/update/delete methods). The 9 mutation BFF routes have no FE caller. (Inventory grayed-out portion is tracked under the Test 4 entitlement gap — same RETAIL_POS root cause; do not duplicate.)
  artifacts:
    - path: ".planning/REQUIREMENTS.md"
      issue: "Lines 165-182 (OPT14-01..18) contain no admin-UI requirement — confirms deliberate scope gap"
    - path: ".planning/phases/14-optical-order-configuration/14-02-PLAN.md"
      issue: "Lines 41-44 explicit deferral of admin UI to future work"
    - path: "store/lensCatalogStore.ts"
      issue: "Read-only — no createType/updateType/deleteType actions (×3 resources = 9 missing)"
    - path: "app/(tenant)/[tenant]/inventory/page.tsx"
      issue: "Lines 52-110 — has Frames + Contacts tabs only; no Lens Catalog tab; whole page top-gated on RETAIL_POS (line 52)"
  missing:
    - "New plan (e.g. Phase 14.5): add Lens Catalog tab to inventory page (third tab alongside Frames + Contacts)"
    - "New component components/inventory/LensCatalogTab.tsx with three sub-tabs (Types | Materials | Coatings) using existing button-group pattern at inventory/page.tsx:79-110"
    - "Three modals: LensTypeFormModal, LensMaterialFormModal, LensCoatingFormModal modeled on ProductFormModal.tsx"
    - "Extend store/lensCatalogStore.ts with 9 new actions (createX/updateX/deleteX × 3 resources) via raw fetch + getAuthHeaders"
    - "Gate tab on ClinicalAction.MANAGE_LENS_CATALOG to match backend route gate"
    - "Playwright spec tests/e2e/lens-catalog-admin.spec.ts: create type → assert in configurator dropdown → soft-delete → assert removed"
  debug_session: ".planning/debug/lens-catalog-admin-missing.md"

- truth: "Accidentally clicking '+ Create Order' on the queue card has a recoverable path — user can cancel or back out without leaving a stray draft order behind"
  status: resolved
  reason: "User reported: 'if I click create order by accident, there's no way to go back or cancel the action.' Clicking + Create Order on a queue card creates a persisted draft order and navigates away (likely to configurator) with no obvious Cancel, Discard, or Back action that removes the draft."
  severity: major
  test: 2
  artifacts: []
  missing: []

- truth: "Configurator footer (Cancel / Place Order / Generate Job Ticket) remains readable when content scrolls under its semi-transparent glass background"
  status: resolved
  reason: "User reported: 'for configure order, the semi-transparent background is harder to read when text scrolled under.' Screenshot shows the Cancel/Place Order/Generate Job Ticket footer over the Lens Configuration section with low contrast where scrolled content shows through."
  severity: minor
  test: 5
  artifacts: []
  missing: []
