---
status: resolved
trigger: "Investigate why refraction values don't persist in the encounter page"
created: 2026-03-13T00:00:00Z
updated: 2026-03-13T14:45:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: CONFIRMED - When loadEncounter() is called (e.g., Start Exam / Revert to Pre-Test), encounterStore sets loadStatus:"loading", causing the encounter page to render a GlassCardSkeleton. This UNMOUNTS the RefractionGrid. On remount, init() is called with initialRefractions=[]. The guard only checks committed !== null — so dirty drafts (committed=null) get wiped. Even for loaded data, the guard works correctly, but for newly entered unsaved data the guard fails.
test: Traced code path: handleAdvanceStatus/handleRevertToPretest → loadEncounter → loadStatus:"loading" → GlassCardSkeleton renders → RefractionGrid unmounts → status:"loaded" → RefractionGrid remounts → init() called with [] → guard checks committed !== null → fails for dirty-only columns → blanks drafts
expecting: Fix: extend init() guard to also protect dirty/saving saveStatus (not just committed !== null)
next_action: Apply fix to store/refractionStore.ts

## Symptoms

expected: Switching tabs in the encounter (Exam → Pre-Test → Exam) should preserve all refraction data that was entered or loaded
actual: After navigating to Pre-Test tab and back to Exam, all refraction fields are blank/empty
errors: No console errors visible
reproduction: 1) Open an encounter, 2) Navigate to Exam tab, 3) Enter refraction data (or verify loaded data is visible), 4) Navigate to Pre-Test tab, 5) Navigate back to Exam tab — refraction fields are now empty
timeline: Current behavior; recent commit 9675509 "fix(refraction): guard init() against blanking data on review-mode remount" may be related or partially addressed this

## Eliminated

- hypothesis: Simple scroll-tab navigation causes component unmount
  evidence: EncounterBottomTabs uses IntersectionObserver scroll-spy only — never unmounts sections. Tabs scroll to section IDs, RefractionGrid always remains mounted during scroll navigation.
  timestamp: 2026-03-13T01:00:00Z

- hypothesis: loadRefractions being called multiple times
  evidence: loadRefractions is only called once in the encounter page mount useEffect with [params.encounterId] dep. Never called again on status changes.
  timestamp: 2026-03-13T01:00:00Z

## Evidence

- timestamp: 2026-03-13
  checked: BFF routes for refraction
  found: `/api/encounters/[encounterId]/column/[colIndex]` PATCH route exists, proxies to FastAPI
  implication: Frontend save request path appears correct

- timestamp: 2026-03-13
  checked: RefractionStore data flow
  found: Store has `flushSave()` that calls `saveColumnToAPI()` with 1.5s debounce, calls `/api/encounters/{id}/column/{col}` PATCH
  implication: Save mechanism is wired up; issue likely in API endpoint or data flow

- timestamp: 2026-03-13
  checked: RxCell component handlers
  found: `handleBlur()` calls `flushSave(colIndex)` when leaving column, `handleChange()` marks dirty and schedules save
  implication: Input events should trigger save

- timestamp: 2026-03-13
  checked: Backend refraction.py sync_refraction() endpoint (lines 25-97)
  found: Only saves od_sphere, od_cylinder, od_axis, os_sphere, os_cylinder, os_axis (lines 78-85)
  implication: ADD, PRISM, PRISM_BASE, VISUAL_ACUITY, PD_DISTANCE, PD_NEAR, PD_OD, PD_OS, IS_FINAL_RX fields are NOT saved

- timestamp: 2026-03-13
  checked: RefractionUpdateRequest schema (lines 416-437)
  found: Schema supports all fields: od, os, pd_distance, pd_near, pd_od, pd_os, is_final_rx, notes
  implication: Frontend sends all fields correctly, backend doesn't persist them

- timestamp: 2026-03-13T14:30:00Z
  checked: 404 errors for exam-findings endpoints (posterior_segment, anterior_segment)
  found: These are SEPARATE from refraction. RefractionStore loads via /api/encounters/{id} (encounter endpoint, includes refractions). ExamFindingsStore loads via /api/encounters/{id}/exam-findings/{section} (separate endpoint).
  implication: 404s for exam-findings do NOT block refraction saves. ExamFindingsStore handles 404 gracefully - treats it as "no data saved yet" and initializes blank draft (line 214 in examFindingsStore.ts)

- timestamp: 2026-03-13T14:30:00Z
  checked: commit 34ded3e applied to backend
  found: Expanded sync_refraction() to save ALL fields (od/os sphere/cylinder/axis/add/prism/prism_base/visual_acuity, pd fields, is_final_rx, notes)
  implication: Fix is deployed in current branch

- timestamp: 2026-03-13T01:00:00Z
  checked: EncounterBottomTabs.tsx tab navigation mechanism
  found: Tabs use IntersectionObserver scroll-spy ONLY. Clicking a tab calls scrollIntoView() — it does NOT unmount/remount any components.
  implication: Scroll tab navigation CANNOT cause the RefractionGrid to remount. The "tab navigation" in the symptom description is a misidentification of the trigger.

- timestamp: 2026-03-13T01:00:00Z
  checked: encounter page conditional render logic
  found: `if (encounterLoadStatus === "loading" || encounterLoadStatus === "idle") { return <GlassCardSkeleton /> }`. When loadEncounter() is called (e.g., "Start Exam" → loadEncounter, or "Revert to Pre-Test" → loadEncounter), it sets loadStatus:"loading" FIRST, causing the page to return a skeleton and UNMOUNT all clinical components including RefractionGrid.
  implication: ANY call to loadEncounter() after initial load causes RefractionGrid to unmount/remount.

- timestamp: 2026-03-13T01:00:00Z
  checked: RefractionGrid init() guard (refractionStore.ts lines 305-332)
  found: Guard condition: `current.encounterId === encounterId && current.columns.some((c) => c.committed !== null)`. This ONLY protects data that was already committed (saved to server). For dirty data (user typed but debounce hasn't fired), committed is null for all columns → guard fails → init([]) is called → drafts wiped.
  implication: The root cause: dirty (unsaved) refraction data is wiped whenever loadEncounter() is called because the loading skeleton causes a remount and the guard doesn't protect uncommitted drafts.

## Resolution

root_cause: When the user clicks "Start Exam" or "Revert to Pre-Test" in the status stepper, handleAdvanceStatus/handleRevertToPretest calls loadEncounter(). This sets encounterStore.loadStatus to "loading", causing the encounter page to render GlassCardSkeleton (because of the `encounterLoadStatus === "loading"` check). The skeleton render UNMOUNTS the RefractionGrid component. When loadEncounter completes, the page re-renders with RefractionGrid — but now init() is called with initialRefractions=[]. The guard in init() only skips re-init if committed !== null for at least one column. For newly entered but unsaved data (dirty), committed is null → guard fails → all drafts are reset to blank.

fix: Extended the idempotency guard in init() (store/refractionStore.ts) to also protect columns that have dirty or saving status (not just committed !== null). Changed condition to:
  current.columns.some((c) => c.committed !== null || c.saveStatus === "dirty" || c.saveStatus === "saving")

verification: CONFIRMED by user. Refraction data now survives status transitions (Start Exam / Revert to Pre-Test). TypeScript passes (npx tsc --noEmit, zero errors).

files_changed:
  - store/refractionStore.ts: Extended init() guard (lines 313-317) to protect dirty/saving columns
