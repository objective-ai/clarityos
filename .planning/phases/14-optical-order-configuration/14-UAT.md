---
status: complete
phase: 14-optical-order-configuration
source: [14-00-SUMMARY.md, 14-01-SUMMARY.md, 14-02-SUMMARY.md, 14-03-SUMMARY.md, 14-04-SUMMARY.md, 14-05-SUMMARY.md, 14-06-SUMMARY.md, 14-07-SUMMARY.md, 14-08-SUMMARY.md, 14-09-SUMMARY.md, 14-10-SUMMARY.md, 14-11-SUMMARY.md]
started: 2026-05-26T15:00:00Z
updated: 2026-05-26T16:15:00Z
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

- truth: "Admin surface exists for lens catalog CRUD (create/edit/soft-delete lens types, materials, coatings) and Inventory navigation is accessible to RETAIL_POS users"
  status: failed
  reason: "User reported: 'inventory is grayed out and no lens catalog.' No Phase 14 plan built an admin UI for the 15 lens-catalog endpoints; Inventory nav is grayed out (likely same RETAIL_POS / entitlement consistency issue as Test 4)."
  severity: minor
  test: 12
  artifacts: []
  missing: []

- truth: "Configurator page works end-to-end: frame add/remove, lens type & material selection commit, Measurements + Vision Plan inputs render, AI suggestion chips appear on Phase 14 fixture encounter, two-column layout balanced, footer readable when content scrolls under it"
  status: failed
  reason: "User reported six findings on the configurator: (a) frame add slow + remove not working; (b) lens type & material dropdowns don't select; (c) measurements + vision plan sections empty; (d) no AI chips visible (Thornton encounter has fixture); (e) left column whitespace vs right packed; (f) glass footer hard to read with scrolled content."
  severity: blocker
  test: 5
  artifacts: []
  missing: []

- truth: "Patient detail page exposes an Orders tab that lists the patient's optical orders, routing draft rows to the configurator and non-draft rows to the OrderDetailDrawer"
  status: failed
  reason: "User reported: 'no order tab for james thornton.' The tab is rendered only when has(Entitlement.RETAIL_POS) returns true at app/(tenant)/[tenant]/patients/[patientId]/page.tsx:447. Either the entitlement isn't reaching the patient page for this user (silent JWT fallback) or the tab gate needs to be re-evaluated."
  severity: major
  test: 4
  artifacts: []
  missing: []

- truth: "Optical queue cards render the new Configure Order CTA without overlapping existing buttons (Print Rx, + Create Order, Start Processing)"
  status: failed
  reason: "User reported: 'issue with displaying cards' — screenshot shows Configure Order label visually overlapping Print Rx button on the queue card footer. Multiple CTAs from Phase 13 + Phase 14 (Plan 14-10) compete for footer space."
  severity: major
  test: 2
  artifacts: []
  missing: []

- truth: "Accidentally clicking '+ Create Order' on the queue card has a recoverable path — user can cancel or back out without leaving a stray draft order behind"
  status: failed
  reason: "User reported: 'if I click create order by accident, there's no way to go back or cancel the action.' Clicking + Create Order on a queue card creates a persisted draft order and navigates away (likely to configurator) with no obvious Cancel, Discard, or Back action that removes the draft."
  severity: major
  test: 2
  artifacts: []
  missing: []

- truth: "Configurator footer (Cancel / Place Order / Generate Job Ticket) remains readable when content scrolls under its semi-transparent glass background"
  status: failed
  reason: "User reported: 'for configure order, the semi-transparent background is harder to read when text scrolled under.' Screenshot shows the Cancel/Place Order/Generate Job Ticket footer over the Lens Configuration section with low contrast where scrolled content shows through."
  severity: minor
  test: 5
  artifacts: []
  missing: []
