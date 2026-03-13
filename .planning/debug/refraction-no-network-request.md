---
status: investigating
trigger: "Refraction PATCH request never reaches network tab"
created: 2026-03-13T15:00:00Z
updated: 2026-03-13T15:00:00Z
symptoms_prefilled: true
goal: find_root_cause
---

## Current Focus

hypothesis: CONFIRMED - RefractionGrid's useEffect has `isReadOnly` in deps, causing init() to be called on every parent re-render, wiping user input
test: Fixed dependency array to only include [encounterId, init, initialRefractions], added separate effect for setIsReadOnly
expecting: User input should now persist when parent re-renders
next_action: Verify fix works — user should be able to enter values without them clearing

## Symptoms

expected: Enter refraction value → debounce (1.5s) → PATCH request to `/api/encounters/{id}/column/{col}` appears in network tab
actual: Input clears immediately but NO network request is sent
errors: None visible in console
reproduction: Enter any value in refraction grid, watch network tab — nothing appears
timeline: Happens every time, no PATCH requests at all

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-13
  checked: RefractionGrid dependency array
  found: `useEffect(() => { init(...) }, [encounterId, init, initialRefractions, isReadOnly])` - includes `isReadOnly` in deps
  implication: **CRITICAL BUG**: If parent component's `isReadOnly` (derived from `isFinalized` or auth state) changes, the effect runs and calls `init()` with empty `initialRefractions = []`, reinitializing the store and clearing user input!

- timestamp: 2026-03-13
  checked: Where isReadOnly comes from in parent
  found: `const clinicalReadOnly = isFinalized || !canEditClinical;` (line 218) — passed to RefractionGrid. If encounter store updates, this changes.
  implication: Any change to encounter store (even unrelated) triggers RefractionGrid re-init, wiping user input

- timestamp: 2026-03-13
  checked: Encounter store lifecycle
  found: EncounterStore updates from API calls, status changes, etc. Any such update causes parent to re-render with possibly different `isReadOnly`.
  implication: During typing, if ANY encounter store update happens, `isReadOnly` changes, effect runs, `init()` clears all columns with empty draft!

## Resolution

root_cause: RefractionGrid's useEffect dependency array included `isReadOnly`, causing the init() action to be called on every parent re-render. Since the component doesn't pass initialRefractions (defaults to []), each init() call reinitializes the store with blank drafts, immediately wiping out any user input. Parent re-renders frequently due to encounter store changes, loading states, etc.

fix:
1. Added new store action `setIsReadOnly()` that updates read-only flag WITHOUT reinitializing columns
2. Changed RefractionGrid's first useEffect to only depend on [encounterId, init, initialRefractions]
3. Added second useEffect with [isReadOnly, setIsReadOnly] to update read-only flag when it changes
4. This separates initialization (one-time per encounter) from read-only state updates (on-demand)

verification: Ready for user testing

files_changed:
  - components/encounter/RefractionGrid.tsx: Split useEffect, removed isReadOnly from init() deps, added setIsReadOnly() effect
  - store/refractionStore.ts: Added setIsReadOnly() action and logging throughout save flow
