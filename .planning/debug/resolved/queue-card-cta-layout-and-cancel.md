---
status: resolved
trigger: "Optical queue cards render the new Configure Order CTA without overlapping existing buttons (Print Rx, + Create Order, Start Processing) AND accidental clicks on + Create Order have a cancel/undo path."
created: 2026-05-27T00:00:00Z
updated: 2026-05-27T00:00:00Z
mode: find_root_cause_only
---

## Current Focus

hypothesis: Two independent defects on OpticalQueueCard surface: (a) footer row uses non-wrapping `flex items-center gap-2` while accumulating four+ Buttons (Print Rx, Start Processing/Mark Dispensed, + Create Order, Configure Order) — exceeds card width at md grid columns; (b) "Configure Order" CTA POSTs a draft on click with no confirmation, and the configurator's Cancel button only `router.back()`s without deleting the draft.
test: Read full card JSX, configurator page, configurator footer, store.createOrder, walk-in modal, queue page grid layout.
expecting: Two distinct root causes with shared surface (queue card footer) → shared fix scope.
next_action: Return ROOT CAUSE FOUND.

## Symptoms

expected: Queue card shows Configure Order CTA cleanly alongside Phase 13 buttons (Print Rx, + Create Order, Start Processing) without visual overlap. Accidentally clicking + Create Order has an obvious cancel/back path before a persisted draft order is created.
actual: User reported "issue with displaying cards — Configure Order CTA overlaps Print Rx button on queue cards (screenshot)." Plus: "if I click + Create Order by accident, there's no way to go back or cancel the action." Test 11 UAT later confirmed 5 stray draft orders accumulated for one encounter from accidental clicks.
errors: None — purely UX / visual layout + missing undo affordance.
reproduction: `npm run db:reseed`, login duytran@yahoo.com/123456, navigate to /optical queue page, observe the encounter-linked queue cards.
started: Plan 14-10 (commit `30422ca`) — added Configure Order CTA to OpticalQueueCard footer without revisiting Phase 13's 3-button layout.

## Eliminated

None — both symptoms were confirmed via direct code reading on first pass; no hypotheses needed elimination.

## Evidence

- timestamp: 2026-05-27T00:00:00Z
  checked: knowledge-base.md keyword overlap with symptoms.
  found: No matching entries. Only resolved session is `billing-no-edit-capability` (unrelated).
  implication: Fresh diagnosis required.

- timestamp: 2026-05-27T00:00:00Z
  checked: components/optical/OpticalQueueCard.tsx — footer action row (lines 266-338).
  found: Container is `<div className="flex items-center gap-2 pt-1">` — no `flex-wrap`, no responsive shrinking. Buttons rendered in order: (1) Print Rx (always), (2) Start Processing / Mark Dispensed (when `nextStatus !== null` — i.e. status is waiting or in_progress), (3) + Create Order (when `canCreateOrder`), (4) Configure Order (when `canCreateOrder`). For a waiting/in-progress encounter where the user has RETAIL_POS + a privileged role, ALL FOUR buttons render in a non-wrapping flex row.
  implication: Layout overflow root cause. Each `Button size="sm"` is ~95-130px. Total ≈ 95 + 120 + 120 + 130 + (3 × 8px gap) ≈ 489px of intrinsic content. On `md:grid-cols-2` (~1024-1280px viewport) each card is ~480-620px wide minus internal padding (CardContent default ~px-6 ≈ 48px) → ~430-570px usable. At md breakpoint and at narrower card widths (e.g. a sidebar-collapsed dashboard or zoom 110%) the four buttons exceed available width. Because flex children without `min-w-0` keep intrinsic size and there is no `flex-wrap`, buttons either visually overlap, push outside the card boundary, or get clipped — matching the user's screenshot showing "Configure Order label visually overlapping the printer icon + 'Print Rx' label." Note that browser-default flex behavior for small buttons is to NOT shrink labels (no `min-width: 0` + buttons use `whitespace-nowrap` via shadcn `Button` defaults), so when the row overflows the cards' content container clips on the right while labels can visually collide if any button has negative margin or transform; more likely cause is buttons rendering on top of one another at sub-card widths because the parent has no overflow handling. Either way, the missing primitives are `flex-wrap` and/or width-aware responsive button layout.

- timestamp: 2026-05-27T00:00:00Z
  checked: OpticalQueueCard.tsx lines 318-326 — "+ Create Order" handler.
  found: `onClick={() => setOrderModalOpen(true)}` — opens `CreateWalkInOrderModal` (line 341). This is the EXISTING Phase 13 walk-in flow, NOT a draft-creating shortcut. The modal at components/orders/CreateWalkInOrderModal.tsx line 252-262 has a "Cancel" button that closes without submitting; submission only persists when user clicks "Create draft" / "Create & Place" with at least one line item (`lines.length === 0` validation on line 91).
  implication: "+ Create Order" is NOT the actual culprit for accidental draft persistence. The button just opens a modal. The user retains a cancel path inside the modal. The complaint about "no cancel" must point at a different button.

- timestamp: 2026-05-27T00:00:00Z
  checked: OpticalQueueCard.tsx lines 124-138 — `handleConfigureOrder` (Configure Order CTA handler).
  found: ```ts
  async function handleConfigureOrder() {
    try {
      const newOrder = await useOpticalOrderStore.getState().createOrder({
        patientId: item.patientId,
        encounterId: item.encounterId,
        lineItems: [],
      });
      router.push(`/${tenant}/optical/orders/${newOrder.id}/`);
    } catch (e) { ... }
  }
  ```
  No confirmation dialog. No "are you sure". Immediately POSTs to `/api/optical-orders/` (store.createOrder, line 86-93) which persists a new draft row in `optical_orders` (status=draft), then navigates away. The button is rendered with `variant="outline"` size="sm" right next to the destructive primary `+ Create Order` button — visually small and unassuming, but a single click IS the commit.
  implication: This is the REAL "no cancel path" defect. The user's report labels it "+ Create Order" because (a) the buttons visually overlap per finding #2 and (b) "Configure Order" and "+ Create Order" are confusable names. Every accidental click leaves a persisted empty draft order, which then surfaces as the "Draft pending (N)" pill — UAT Test 11 observed 5 such accumulated drafts.

- timestamp: 2026-05-27T00:00:00Z
  checked: components/optical/configurator/ConfiguratorFooter.tsx + app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx line 151.
  found: ConfiguratorFooter's Cancel button calls `onCancel` which is wired to `() => router.back()` (page line 151). It does NOT call `cancelOrder` or `DELETE /api/optical-orders/{id}/`. The store does expose `cancelOrder` (opticalOrderStore.ts line 26) but no UI surface invokes it for drafts.
  implication: The escape hatch the user is looking for does not exist. Even if a user lands on the configurator from an accidental Configure Order click and immediately presses Cancel, the empty draft remains in the DB. There is no "discard draft" action anywhere in the configurator OR the queue card flow. This is why "Draft pending" pills accumulate without bound.

- timestamp: 2026-05-27T00:00:00Z
  checked: app/(tenant)/[tenant]/optical/page.tsx line 181 — queue grid layout.
  found: `<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">` — 2-col grid at md breakpoint (≥768px), 3-col at xl (≥1280px). Plus sidebar + page padding consumes additional width.
  implication: At xl on a 1440px laptop, cards are ~400-450px wide minus padding → ~360-400px usable. Four buttons (≥489px intrinsic) DEFINITELY exceed this. The original Phase 13 layout (3 buttons) was already tight; adding the fourth Phase 14 CTA pushed it over. This matches the user's screenshot showing visible overlap.

- timestamp: 2026-05-27T00:00:00Z
  checked: 14-10-PLAN.md Task 1 + 14-10-SUMMARY.md.
  found: Plan 14-10 specified the Configure Order CTA copy + handler + styling but did NOT specify how it should COEXIST with the three Phase 13 buttons in the footer. The plan's snippet (lines 140-149) shows only the new button in isolation. No instruction to (a) add flex-wrap, (b) collapse adjacent buttons into a dropdown menu, (c) verify card width budget, or (d) wire a "discard draft" affordance. Summary line 71 says "None substantive" under Deviations — the executor delivered exactly what the plan asked for, but the plan never thought about the cumulative button budget or the consequence of fire-and-forget draft persistence.
  implication: Process gap, not implementation gap. Plan 14-10 made the same mistake the gap analysis is now surfacing: it treated the new CTA in isolation rather than as the 4th occupant of a constrained surface.

## Resolution

root_cause: |
  Two related defects on the OpticalQueueCard surface, both rooted in Plan 14-10 Task 1 adding new affordances without revisiting the existing footer's invariants.

  **Defect A — button-row overlap (layout):**
  components/optical/OpticalQueueCard.tsx lines 266-338. The action footer is a single non-wrapping flex row (`flex items-center gap-2 pt-1`) that now hosts up to 4 buttons: Print Rx + Start Processing/Mark Dispensed + "+ Create Order" + Configure Order. Intrinsic width (~489px) exceeds the per-card width budget at md and xl grid breakpoints (~360-450px usable per card). Without `flex-wrap` and without responsive collapsing (e.g. overflow menu or icon-only variants), buttons either clip the card or visually collide. Plan 14-10's Task 1 snippet only specified the new Configure Order button in isolation; the executor faithfully added a 4th button without altering layout primitives.

  **Defect B — no undo for Configure Order draft persistence (state/UX):**
  The user-reported "+ Create Order has no cancel" is mis-labelled. "+ Create Order" opens `CreateWalkInOrderModal` which DOES have a Cancel button (modal closes without persisting). The actual culprit is the adjacent "Configure Order" CTA — lines 124-138 of OpticalQueueCard.tsx call `useOpticalOrderStore.getState().createOrder(...)` on click with no confirmation, immediately POSTing a draft and routing to the configurator. The configurator's footer Cancel button (components/optical/configurator/ConfiguratorFooter.tsx lines 23-29) is wired to `router.back()` only (page.tsx line 151) and does NOT delete the draft. The store does export `cancelOrder` but no surface invokes it for an unwanted empty draft. Result: every accidental Configure Order click leaves a persisted empty draft, which then surfaces as a "Draft pending (N)" pill — UAT Test 11 observed 5 such accumulated drafts on Hargrove encounter.

  The two defects compound: the layout overlap makes buttons look like one another and increases mis-click probability; the no-undo behavior makes each mis-click permanent.

fix:
  empty — find_root_cause_only mode. Suggested fix direction below.

verification:
  empty — diagnose-only.

files_changed: []

## Suggested Fix Direction (for next plan to scope)

Both defects share the same surface (OpticalQueueCard.tsx) and should be addressed in a single plan.

**Defect A — layout (small):**
1. Easiest: add `flex-wrap` to the footer row (`flex flex-wrap items-center gap-2 pt-1`). Two-line button rows on narrow cards is acceptable.
2. Better: consolidate the secondary actions into a single primary button + an overflow menu. Candidate primary: status advance button (Start Processing/Mark Dispensed). Overflow menu items: Print Rx, + Create Order, Configure Order. Reduces footer to 1 visible button + 1 kebab/"More" trigger.
3. Best (UX-aware): rethink the dual entry point — "+ Create Order" and "Configure Order" overlap in intent. "+ Create Order" today opens a walk-in modal even from an encounter-linked card; "Configure Order" creates a draft and jumps to configurator. Consider collapsing both into a single "Create Order" action that opens the modal, with a checkbox or branch inside the modal for "configure spectacle / lens config" that triggers the configurator flow only on submit. This eliminates the cumulative-button-count problem AND removes the fire-and-forget draft creation in one stroke.

**Defect B — undo affordance (small-medium):**
1. Minimum: change `ConfiguratorFooter.onCancel` to a "Discard draft" action when `status === "draft"`. On click, call `useOpticalOrderStore.getState().cancelOrder(orderId)` (already exists in the store — line 26) THEN `router.back()`. The cancelOrder backend transition presumably soft-cancels (status=cancelled) rather than hard-deletes, which is auditable and clinically safe. Confirm the backend `cancelOrder` transition is allowed from `status=draft` — if not, add a `DELETE /api/optical-orders/{id}/` route gated on status=draft only.
2. Add a confirmation dialog on the queue card "Configure Order" click if option 3 above isn't taken: `if (!confirm("Create a new draft order for this encounter?")) return;` before calling createOrder. Lightweight and prevents accidental persistence without backend changes.
3. (Optional follow-up) Background cleanup job to purge `status=draft` rows older than N days with no line items. Defends against the entire class of "abandoned draft" bugs.

**Recommended scope for the next plan:**
- Single plan covering both defects, both in OpticalQueueCard.tsx + ConfiguratorFooter.tsx (+ page.tsx wiring for new onCancel behavior).
- Pick layout fix #1 (flex-wrap) OR #3 (consolidate buttons) — defer #2 unless overflow menus already exist in the design system.
- Pick undo fix #1 (Discard draft button wired to cancelOrder) — it's the smallest change with the highest leverage and reuses an existing store action.
- E2E coverage: extend the Plan 14-11 spec with a "discard draft" assertion (Configure Order → Discard → assert no Draft pending pill increment).

Both defects are major-severity UAT gaps but neither blocks Phase 14 launch on its own — they degrade UX and cause data hygiene problems (stray drafts) rather than breaking workflow.
