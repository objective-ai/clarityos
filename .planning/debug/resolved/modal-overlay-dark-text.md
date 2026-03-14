---
status: resolved
trigger: "modal-overlay-dark-text"
created: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
---

## Current Focus

hypothesis: glass-card CSS class has backdrop-filter: blur() which creates a new CSS stacking context, trapping position:fixed children inside the Card's bounds instead of the full viewport.
test: Apply React Portal (createPortal to document.body) to both DictationComingSoonModal and UpsellModal to escape the stacking context
expecting: Overlay covers full viewport; modal card floats above all panels including those below AI Scribe widget
next_action: Apply portal fix to AiScribeWidget.tsx

## Symptoms

expected: Modal looks clean and readable with good contrast. Backdrop dims page content behind it subtly without looking broken or dark.
actual: Text inside modal is hard to read. Backdrop darkens the AI Scribe panel section in a visually jarring way — turns very dark gray when modal is open.
errors: No JS errors — purely visual/CSS
reproduction: Go to encounter page, click "Dictate" button to open Live Dictation coming soon modal. Same issue on upsell modal.
timeline: Introduced with feat(ai-scribe): add live dictation coming soon modal and teaser button

## Eliminated

- hypothesis: Issue is with CSS variables not resolving correctly
  evidence: CSS variables (--text-primary, --glass-bg etc.) all resolve correctly in globals.css
  timestamp: 2026-03-13

- timestamp: 2026-03-13
  checked: AiScribeWidget.tsx modals rendered inside Card (glass-card class) component tree
  found: glass-card has backdrop-filter: blur(var(--glass-blur)) in globals.css line 171. backdrop-filter creates a new CSS stacking context. position:fixed children are positioned relative to this stacking context, not the viewport. This explains why the overlay only covers the AI Scribe card area, not the full screen.
  implication: React Portal (createPortal to document.body) is the correct fix — renders modal outside the stacking context tree

## Evidence

- timestamp: 2026-03-13
  checked: AiScribeWidget.tsx lines 33-37 (DictationComingSoonModal backdrop)
  found: background="rgba(0,0,0,0.75)" with backdropFilter="blur(10px)" on fixed inset-0 overlay
  implication: 75% black + 10px blur is extremely heavy - this is what creates the dark jarring effect on the page behind the modal

- timestamp: 2026-03-13
  checked: AiScribeWidget.tsx lines 147-148 (UpsellModal backdrop)
  found: background="rgba(0,0,0,0.7)" with backdropFilter="blur(8px)" on fixed inset-0 overlay
  implication: Same issue, slightly less severe but still too heavy

- timestamp: 2026-03-13
  checked: globals.css glass-card definition
  found: background uses var(--glass-bg) = rgba(15,19,28,0.75) in dark mode — semi-transparent dark
  implication: Inner card text uses --text-primary (#F0F2F5 in dark) so text IS light-on-dark in dark mode. But with the heavy backdrop causing the whole page to be near-black, the glass card blends in poorly — the "glass" effect shows through to the now-very-dark backdrop, making the card itself look darker than intended.

- timestamp: 2026-03-13
  checked: globals.css --glass-bg light theme
  found: --glass-bg = rgba(255,255,255,0.70) in light mode, --text-primary = #0F1729 (dark text)
  implication: In light mode the glass card should have a white-ish background, but backdrop blur at 75% black opacity will still darken everything severely

## Resolution

root_cause: Three separate problems: (1) backdrop used plain black rgba(0,0,0) instead of teal-navy brand color, (2) modal card used glass-card CSS class which inherits --glass-bg = rgba(255,255,255,0.70) in light mode, making it blend with the white page background instead of contrasting, (3) z-index was z-50 which is the same as AuditTrailSidebar panel, allowing the modal to slip underneath.
fix: (1) Backdrop changed to rgba(15,25,40,0.65) teal-navy tint, no blur on overlay. (2) Modal card replaced glass-card class with explicit dark glass: rgba(15,19,28,0.92) background + blur(20px) on card itself, all text colors hardcoded to white/near-white values. (3) Overlay z-index raised to z-[60], card z-index raised to 61, above all sticky/fixed page elements.
verification: Confirmed by user — modal displays correctly with dark glass card, readable white text, and correct overlay behavior across light and dark themes.
files_changed:
  - components/encounter/AiScribeWidget.tsx
