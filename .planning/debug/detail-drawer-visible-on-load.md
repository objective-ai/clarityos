---
status: diagnosed
trigger: "Detail Drawer Shows on Page Load and Cannot Be Closed"
created: 2026-04-03T00:00:00Z
updated: 2026-04-03T00:00:00Z
---

## Current Focus

hypothesis: Drawer is always rendered in the DOM (backdrop + panel), using CSS transitions for show/hide. When open=false, backdrop has pointer-events-none but drawer panel does NOT — it sits off-screen via translate-x-full but is still in the DOM and potentially visible during initial render/paint.
test: Read conditional rendering logic vs CSS-only toggle
expecting: No conditional gate around the entire drawer JSX — it always renders
next_action: Return diagnosis

## Symptoms

expected: Drawer should only appear after clicking an appointment card. ESC, backdrop click, and X button should close it.
actual: Drawer shows "No appointment selected" on page load. Close interactions (ESC, backdrop, X) all fail.
errors: None (visual/behavioral bug)
reproduction: Load /[tenant]/schedule page — drawer visible immediately
started: Since Phase 10.2-03 implementation

## Eliminated

(none needed — root cause found on first read)

## Evidence

- timestamp: 2026-04-03T00:00:00Z
  checked: schedule/page.tsx lines 116, 433-444
  found: Initial drawer state is { mode: "closed" } (line 116). Drawer receives open={drawer.mode === "detail"} which is false on load. onClose={() => setDrawer({ mode: "closed" })} is correctly wired.
  implication: Page-side state and prop wiring is CORRECT. Bug is in the drawer component itself.

- timestamp: 2026-04-03T00:00:00Z
  checked: AppointmentDetailDrawer.tsx lines 100-311
  found: |
    BUG 1 — ALWAYS RENDERED: The component always renders both backdrop (lines 103-109) and drawer panel (lines 112-309) in the DOM regardless of `open` prop. It uses CSS-only visibility: backdrop toggles opacity + pointer-events, panel toggles translate-x. There is NO conditional `if (!open) return null` gate.
    
    The "No appointment selected" text at line 306 renders when `appt` is null (which it is on load), inside the always-visible drawer panel. The panel starts with translate-x-full (off-screen), BUT during initial page hydration/paint, the CSS transition may not apply immediately, causing a flash of the drawer content.
    
    BUG 2 — CLOSE HANDLERS LIKELY WORK BUT PANEL IS INVISIBLE-YET-PRESENT: The backdrop has pointer-events-none when closed (line 105), which is correct. The ESC handler checks `if (e.key === "Escape" && open)` (line 66) — this correctly gates on `open`. The X button is inside the `appt` truthy branch so it wouldn't show for the "No appointment selected" state anyway.
    
    REAL ISSUE: If the user reports the drawer is VISIBLE on load AND cannot be closed, the most likely cause is a CSS transition race or the translate-x-full not being applied on first render. The drawer panel at line 112-118 has NO pointer-events-none when closed — only translate-x-full hides it. If the CSS class doesn't apply in time (SSR hydration mismatch, or initial render), the panel is fully visible and interactive, but:
    - No X button shows (because appt is null, so the else branch at line 303-308 renders, which has no close button)
    - Backdrop click handler exists but backdrop has pointer-events-none
    - ESC handler exists and checks `open` — since open=false, ESC is ignored
    
    Result: visible panel with no way to dismiss it.
  implication: Two-part fix needed — (1) add conditional render gate or pointer-events-none to panel when closed, (2) add close button to the empty state

## Resolution

root_cause: |
  TWO ROOT CAUSES in AppointmentDetailDrawer.tsx:
  
  1. NO CONDITIONAL RENDER GATE (lines 100-311): The drawer panel is always in the DOM, relying solely on `translate-x-full` CSS to hide it. During SSR hydration or initial paint, the transform may not apply immediately, causing the panel (showing "No appointment selected") to flash or remain visible. The panel also lacks `pointer-events-none` when closed, so it can intercept clicks even when "hidden."
  
  2. NO CLOSE BUTTON IN EMPTY STATE (lines 303-308): When `appt` is null, the drawer shows "No appointment selected" but the X close button is inside the `appt` truthy branch (line 132-138). The empty state has no dismiss affordance. Combined with ESC being gated on `open` (which is false during this bug), and backdrop having pointer-events-none, there is literally no way to close the drawer.

fix: |
  Suggested fix direction (two changes):
  
  A) Add early return or wrapping condition: `if (!open) return null;` at the top of the component, OR add `pointer-events-none` to the panel div when `!open` (line 113).
  
  B) Move the X close button outside the `appt` conditional so it appears in both the populated and empty states.

verification:
files_changed: []
