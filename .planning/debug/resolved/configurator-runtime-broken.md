---
status: resolved
trigger: "Phase 14 UAT BLOCKER — 6 sub-findings on configurator page: (1) frames added but can't remove, slow add. (2) lens type and materials not selecting. (3) measurement and vision is empty. (4) no chips visible. (5) left column whitespace, right packed. (6) semi-transparent footer hard to read."
created: 2026-05-27T00:00:00Z
updated: 2026-05-27T00:00:00Z
---

## Current Focus

hypothesis: All 6 findings are explained by 5 distinct root causes; only #1 (slow add) and #2 (no-op when no line yet) share a related code area (FramePicker + LensConfigSection both depend on order.lineItems[0]).
test: Source-only static analysis of the configurator render tree, stores, and the backend route handlers + seed_db fixture.
expecting: Identified 5 root causes from reading code; no runtime traces needed for the dominant ones (#1, #4, #5, #6 are unambiguous from source; #2/#3 are most-likely cause + a smaller alternative).
next_action: Report diagnosis; do not fix.

## Symptoms

expected: |
  Configurator at /[tenant]/optical/orders/[orderId] should:
  - Allow frame add/remove (Plan 14-09)
  - Allow lens type + material selection (catalog: 4 types, 6 materials, 7 coatings)
  - Render Measurements + Vision Plan inputs
  - Show AI suggestion chips on Hargrove encounter e0000000-0007 (Phase 14 fixture)
  - Balanced two-column layout
  - Readable footer (glassmorphism contrast OK)
actual: |
  1. Frames added but can't remove. Slow add.
  2. Lens type/material dropdowns not selecting.
  3. Measurements + Vision Plan sections empty.
  4. No AI chips visible.
  5. Left column has trailing whitespace, right is packed.
  6. Glass footer text hard to read when content scrolls under.
errors: None reported by user. Source analysis surfaced the runtime mechanics — no console capture needed.
reproduction: |
  After `npm run db:reseed`, login as duytran@yahoo.com / 123456, navigate to any
  optical queue card, click "+ Create Order" to land on /[tenant]/optical/orders/[orderId].
  A draft exists for Hargrove encounter e0000000-0007 (gap text) — but seed only
  attaches the Phase 14 AI fixture to **Thornton's** most-recent finalized encounter
  (backend/seed_db.py line 2117-2126 selects `last_name == "Thornton"`).
started: 2026-05-26, immediately after Plans 14-09, 14-10, 14-11 all landed same day

## Eliminated

- hypothesis: "Single shared bug — broken /api/optical-orders/{id} response breaking all sections"
  evidence: |
    OpticalOrderResponse (backend/schemas/optical_order.py:110-117) defaults
    vision_plan and fitting to dict[str, Any] = Field(default_factory=dict),
    never null. MeasurementsSection (line 47) and VisionPlanSection (line 26)
    always render their FITTING_FIELDS/VISION_PLAN_FIELDS arrays unconditionally.
    Sections rendering empty would require a JS error to break the React subtree.
  timestamp: 2026-05-27T00:00:00Z

- hypothesis: "BFF or backend 403/404 returning empty lens catalog"
  evidence: |
    backend/api/routes/lens_catalog.py:69-72 — GET /types/, /materials/, /coatings/
    all gated on VIEW_INVENTORY only. permissions.py:164 grants this to
    {Doctor, Tech, Receptionist, Admin, Owner}. Dev user is Owner per
    MEMORY.md. Backend permission check is pure-role, no entitlement gate.
    BFF (app/api/lens-catalog/types/route.ts:4-6) is a pass-through.
  timestamp: 2026-05-27T00:00:00Z

## Evidence

- timestamp: 2026-05-27T00:00:00Z
  checked: components/optical/configurator/FramePicker.tsx full file
  found: |
    No remove handler. The selected frame chip only renders an "Added" badge
    (lines 101-105). The store has no removeLineItem method.
  implication: |
    Symptom #1 (can't remove) is missing functionality, not a bug. End-to-end
    delete path doesn't exist: no DELETE endpoint, no store method, no UI control.

- timestamp: 2026-05-27T00:00:00Z
  checked: backend/api/routes/optical_order.py @router decorators (full file)
  found: |
    Only POST /{order_id}/line-items/ exists (line 359-364). No DELETE handler.
    The PATCH route (line 261) explicitly raises 400 unknown_line_item if a
    line id is unknown (line 318-325) — it CANNOT remove existing lines either.
  implication: |
    Confirms the missing remove path is at every layer.

- timestamp: 2026-05-27T00:00:00Z
  checked: store/opticalOrderConfigStore.ts addLineItem (line 96-129)
  found: |
    addLineItem does `await get().flush()` THEN `await fetch(POST /line-items)`.
    flush is no-op when dirty.size===0 (a fresh draft, no edits yet), so the
    serial chain effectively reduces to one network round-trip. Backend
    re-fetches with selectinload and returns full OpticalOrderResponse — the
    POST body returns the entire order including all lineItems.
  implication: |
    The "slow" perception is the round-trip latency of one POST + audit log +
    selectinload + re-fetch. Not a bug, just a long path. FramePicker
    additionally sets `setAdding(p.id)` so the button shows opacity-60 during
    the wait — UX has no spinner/text, just a faint fade. User reads this
    as "slow" because there's no progress signal.

- timestamp: 2026-05-27T00:00:00Z
  checked: components/optical/configurator/LensConfigSection.tsx (line 33-46)
  found: |
    lensLine = items.find(li => li.lensConfig != null) ?? items[0] ?? null
    setField guards: `if (!lensLine) return;` (line 45).
    When the draft has zero line items (fresh draft, no frame picked yet),
    lensLine is null. The <select> elements still render their option lists
    from lensTypes/lensMaterials/lensCoatings, but onChange is a silent no-op.
    The select is a controlled component bound to lc.lens_type_id ?? "" with
    lc = {} — so the user's pick reverts visually because state never updates.
  implication: |
    Symptom #2 root cause #1 (PRIMARY): When the user has not yet added a
    frame, lens type/material dropdowns appear functional but every selection
    silently no-ops. Once a frame line exists, dropdowns DO work (verified by
    setField → patchLineItemLensConfig → store mutation → re-render with new lc).
    Recommended verify step: confirm by adding a frame first, then trying the
    dropdown — it should select correctly.

- timestamp: 2026-05-27T00:00:00Z
  checked: backend/api/routes/optical_order.py:359-464 (add_optical_order_line_item)
  found: |
    When a frame line is added, lens_config_jsonb defaults to NULL (no init).
    LensConfigSection then falls back to `items[0]` (line 35), and `lc =
    items[0].lensConfig ?? {}` => `lc = {}`. setField becomes operative.
  implication: |
    Reinforces "add frame first, then lens dropdowns work" — but the UX
    doesn't communicate this ordering requirement. The dropdowns shouldn't
    even be enabled until a frame is selected, OR LensConfigSection should
    display a "Pick a frame first" empty state.

- timestamp: 2026-05-27T00:00:00Z
  checked: app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx:111-144
  found: |
    Layout: `grid grid-cols-1 gap-6 p-6 lg:grid-cols-2`
    Left column: RxSideBySidePanel (one section, ~10 rows of table content)
    Right column: FramePicker + LensConfigSection + MeasurementsSection +
                  VisionPlanSection (4 stacked sections, each with multiple inputs)
  implication: |
    Symptom #5 root cause: hard-coded 1:1 split with 1 section on left, 4 on
    right. The right column is ~4x as tall as the left, producing exactly the
    "left has whitespace, right is packed" complaint the user reported. This
    is purely a layout design issue, not a bug.

- timestamp: 2026-05-27T00:00:00Z
  checked: components/optical/configurator/ConfiguratorFooter.tsx
  found: |
    Line 22: `sticky bottom-0 z-10 ... bg-[var(--bg-glass)]`
    No `backdrop-blur-*` Tailwind class. No `bg-[var(--bg-solid)]` fallback.
    --bg-glass is a semi-transparent rgba (per app/globals.css glassmorphism
    convention). Content scrolling under the sticky footer is visible through
    a thin tinted layer with zero blur.
  implication: |
    Symptom #6 root cause: footer uses semi-transparent glass surface but
    omits backdrop-filter:blur — so scrolled text underneath is not blurred
    away and competes with the footer's own labels.

- timestamp: 2026-05-27T00:00:00Z
  checked: backend/seed_db.py:2094-2178 (_seed_phase14_fixture)
  found: |
    Selects patient by `last_name == "Thornton"` (line 2122), then attaches
    AI summary text + assessment_and_plan to that patient's most-recent
    finalized encounter. Hargrove is NOT touched by this fixture. Idempotency
    pre-check looks for "progressive" in encounter.ai_summary_text — if
    Thornton's encounter already has it, the seeder silently skips and
    re-seed does nothing.
  implication: |
    Symptom #4 root cause #1 (PRIMARY): The gap text says user is testing on
    a "Hargrove" draft (the most-recent draft per the queue). Hargrove's
    encounter has no AI summary text. /api/optical-orders/{id}/suggestions/
    returns { suggestions: [], rationale: "No AI Scribe data on encounter" }.
    The UI correctly shows no chips because there are none. There is no FE
    bug here — the user is testing the wrong patient.
    Secondary risk: if user clicks "+ Create Order" from the Thornton card
    queue, the draft IS pre-linked to Thornton's finalized encounter
    (OpticalQueueCard.tsx:128-132 — encounterId: item.encounterId) and chips
    WOULD render. The 5 stray Hargrove drafts from Test 2 (no-cancel bug)
    are the wrong test target.

- timestamp: 2026-05-27T00:00:00Z
  checked: components/optical/configurator/MeasurementsSection.tsx + VisionPlanSection.tsx
  found: |
    Both render their field arrays unconditionally with `value={fitting?.[key]
    ?? ""}` or `value={visionPlan?.[key] ?? ""}`. Inputs always render even
    when fitting/visionPlan are {} (which is the BE default). No gates that
    could hide the inputs. No data-dependent conditionals.
  implication: |
    Symptom #3 likely means "inputs render but are empty (no pre-filled
    values)" — which is correct behavior for a fresh draft. NOT a bug. The
    user's word "empty" is ambiguous; the most plausible reading is "I see
    blank fields, expected something pre-filled or autocompleted." If the
    user truly sees no inputs at all, that requires a runtime JS error
    breaking the React subtree (no evidence of one in static analysis).
    Recommend: open browser console on the configurator page and confirm no
    errors before treating #3 as a separate bug.

## Resolution

root_cause: |
  Five distinct root causes mapped to the six sub-findings:

  RC-1 (Symptom #1 — can't remove frame): MISSING FUNCTIONALITY.
    No DELETE /optical-orders/{id}/line-items/{lineId}/ endpoint.
    No removeLineItem method in opticalOrderConfigStore.
    No remove control in FramePicker (only an "Added" badge on selected chips).
    The PATCH route would also reject an attempt to mutate by line list since
    it 400s on unknown_line_item and has no remove semantics.

  RC-2 (Symptom #1b — "slow add"): UX MISSING PROGRESS SIGNAL.
    addLineItem does flush() (no-op on fresh draft) → POST → backend audit +
    selectinload + commit + re-fetch → returns full order. The total wall-clock
    is one round trip but the only UX signal is opacity-60 on the button.
    Not a code bug; a UX gap.

  RC-3 (Symptoms #2 + part of #3 — dropdowns/lens-derived fields not committing):
    HIDDEN PRECONDITION. LensConfigSection's setField (line 45) silently no-ops
    when there are no line items. Dropdowns visually accept clicks but the
    controlled <select value=...> reverts because state didn't change. User
    must add a frame first; UI doesn't enforce or communicate this. MeasurementsSection
    also derives requiresSegHeight / requiresVertex from the first line item's
    lensConfig, so those red asterisks won't appear until both frame + lens
    type are chosen — possibly contributing to the user's "empty" perception
    on the measurements section (no asterisks, looks half-rendered).

  RC-4 (Symptom #4 — no AI chips): WRONG TEST DATA, NOT A BUG.
    Phase 14 AI fixture (seed_db.py:2094) targets Thornton's most-recent
    finalized encounter ONLY. The user is testing on a Hargrove draft (gap
    text + Test 11 evidence). Hargrove encounters have no ai_summary_text.
    /suggestions/ correctly returns []. To exercise chips: use a draft
    created from the Thornton queue card "+ Create Order" CTA. The fixture
    is also idempotent on "progressive in ai_summary_text" — re-seed is a
    no-op once seeded. Note: the gap text's parenthetical claim that "the
    Phase 14 fixture is on Hargrove not Thornton per the latest DB state"
    contradicts the seed source. Either the gap text is stale, OR a manual
    DB modification moved the fixture — verify with:
      `psql -c "SELECT p.last_name, length(e.ai_summary_text) FROM encounters e
       JOIN patients p ON p.id = e.patient_id
       WHERE e.ai_summary_text IS NOT NULL ORDER BY e.created_at DESC LIMIT 5;"`

  RC-5 (Symptom #5 — layout imbalance): LAYOUT DESIGN ERROR.
    page.tsx hard-codes a 1:1 lg:grid-cols-2 split with 1 section on the left
    (RxSideBySidePanel) and 4 stacked sections on the right (FramePicker,
    LensConfigSection, MeasurementsSection, VisionPlanSection). Right column
    is ~4x taller than left.

  RC-6 (Symptom #6 — footer readability): MISSING BACKDROP-FILTER.
    ConfiguratorFooter.tsx uses `bg-[var(--bg-glass)]` (semi-transparent rgba)
    sticky-positioned but lacks any `backdrop-blur-*` class. Scrolled content
    bleeds through with full sharpness, competing with footer labels.

fix: |
  (Diagnose-only mode — fixes not applied. Suggested directions:)

  - RC-1: Add DELETE /optical-orders/{id}/line-items/{lineId}/ backend
    endpoint (mirror POST 409 not-draft guard). Add removeLineItem to
    opticalOrderConfigStore. Add an × button on the selected frame chip in
    FramePicker (replace the "Added" badge with a clickable remove control,
    or render a small "Selected frames" row above the search input with
    deletable pills).

  - RC-2: Either add a loading spinner / "Adding…" label to the FramePicker
    button while `adding === p.id`, OR drop the unnecessary `await
    get().flush()` when dirty.size === 0 to save one event-loop tick.

  - RC-3: In LensConfigSection, render a clear empty state ("Select a frame
    above to configure lenses") + disable the selects when lensLine === null.
    Alternatively, eagerly create a placeholder line in the store on first
    PATCH (riskier — backend doesn't accept that shape today).

  - RC-4: First, verify which patient currently holds the AI fixture with the
    SQL query above. If Thornton, instruct UAT to test on a Thornton draft.
    If the fixture has drifted (e.g. data was edited), re-seed with
    `RESEED=true python backend/seed_db.py` and re-test from the Thornton
    queue card. Optionally: extend the fixture to also seed Hargrove so the
    happy-path matches the user's mental model of testing on the topmost
    queue card.

  - RC-5: Change layout from `grid-cols-1 lg:grid-cols-2` with RxSideBySidePanel
    as a single left column to either (a) full-width RxSideBySidePanel at the
    top + 2-column grid for the rest, or (b) left = Rx + Frame + Lens,
    right = Measurements + Vision Plan. Option (a) matches user expectation
    (Rx is a banner; configuration is below).

  - RC-6: Add `backdrop-blur-md` (or `backdrop-blur-lg`) and bump the
    bg-glass alpha for the footer specifically, e.g.
    `bg-[var(--bg-glass-solid)]` if you introduce a 90% opaque variant, or
    inline style: `style={{ backdropFilter: 'blur(8px)' }}`.

verification: (not applicable — diagnose-only)
files_changed: []
