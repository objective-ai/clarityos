---
status: resolved
trigger: "ai-note-clears-refraction"
created: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:05:00Z
---

## Current Focus

hypothesis: CONFIRMED — RefractionGrid remounts after review mode exits, calling init() with empty initialRefractions which blanks the store
test: Applied idempotency guard to init() — skips blanking when store already has committed data for the same encounter
expecting: Refraction data survives review mode enter/exit cycle
next_action: Verify fix — confirm type check passes and logic is sound

## Symptoms

expected: Generating an AI note should NOT affect refraction data. Refraction values should remain intact after AI note generation.
actual: After clicking "Generate AI Note", the refraction data displayed in the refraction grid is cleared out. User can then override what was previously there.
errors: none
reproduction: Navigate to /sunview/encounter/15d50376..., ensure refraction data exists, click Generate AI Note, observe refraction data is cleared
started: Noticed after recent changes (Phase 8 / AI Scribe V2 / Validation Station)

## Eliminated

- hypothesis: AI note generation triggers loadRefractions re-fetch
  evidence: loadRefractions only called in useEffect([params.encounterId]) — not during AI generation
  timestamp: 2026-03-13

- hypothesis: setAiScribeStatus or setAiStructuredData triggers encounter reload
  evidence: Neither function calls loadEncounter; encounterStore loadStatus only set by loadEncounter()
  timestamp: 2026-03-13

- hypothesis: Backend ai_scribe endpoint updates refraction data
  evidence: Backend only saves ai_summary_text to encounter.ai_summary_text; no refraction mutations
  timestamp: 2026-03-13

- hypothesis: buildConflicts or AiScribeWidget useMemo has side effects on refraction store
  evidence: buildConflicts is a pure function; useMemo only reads getState()
  timestamp: 2026-03-13

## Evidence

- timestamp: 2026-03-13
  checked: RefractionGrid useEffect on mount
  found: init(encounterId, initialRefractions, isReadOnly) called with [encounterId] deps only; initialRefractions always [] (default)
  implication: Every RefractionGrid mount calls init() with empty data, blanking all 4 column drafts

- timestamp: 2026-03-13
  checked: Encounter page conditional rendering
  found: RefractionGrid ONLY rendered when !(reviewMode || exitingReview). Clicking "Review & Merge" sets reviewMode=true → RefractionGrid unmounts.
  implication: When user exits review mode (cancel or commit), reviewMode=false → RefractionGrid remounts → init() runs with empty data

- timestamp: 2026-03-13
  checked: Page useEffect([params.encounterId]) — the effect that calls loadRefractions
  found: Only runs when params.encounterId changes; does NOT re-run when reviewMode changes
  implication: After RefractionGrid remounts from review mode exit, loadRefractions is NOT called again, leaving store blank

- timestamp: 2026-03-13
  checked: Previous fix commit c7f6ffc
  found: Previous fix removed isReadOnly from init() useEffect deps (to prevent wipe on parent re-renders). But the mount-on-reviewMode-exit scenario was not addressed.
  implication: The fix prevents init() from running on re-renders, but NOT on remounts (which happen during reviewMode toggle)

## Resolution

root_cause: |
  RefractionGrid is unmounted when entering review mode (reviewMode=true) and remounts when leaving
  (reviewMode=false). On remount, the useEffect([encounterId]) fires init(encounterId, [], isReadOnly),
  which overwrites all 4 column drafts with blank data. The page's useEffect([params.encounterId]) that
  calls loadRefractions does NOT re-run after a reviewMode toggle (only on encounterId change), so the
  store stays blank after the remount.

  The user's perception is "AI note generation clears refraction" because generating a note leads to
  the "Review & Merge" button appearing, which they click, and then the clearing happens when they
  exit review mode.

fix: |
  Added idempotency guard to refractionStore.init():
  - If current.encounterId === encounterId AND any column has committed !== null, skip the blank
    initialization and only update the isReadOnly flag.
  - This preserves loaded data across RefractionGrid remounts (review mode toggles, any React
    unmount/remount within the same encounter navigation).
  - Falls through to normal init() for: different encounter, first mount with no data, fresh page load.

verification: Type check passes (npx tsc --noEmit — no errors)
files_changed:
  - store/refractionStore.ts: Added idempotency guard to init() action (lines 305-318)
