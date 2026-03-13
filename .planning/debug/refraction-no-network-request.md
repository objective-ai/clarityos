---
status: investigating
trigger: "Refraction PATCH request never reaches network tab"
created: 2026-03-13T15:00:00Z
updated: 2026-03-13T15:00:00Z
symptoms_prefilled: true
goal: find_root_cause
---

## Current Focus

hypothesis: Debounce timer is not firing OR flushSave is being blocked by a saveStatus check
test: Added comprehensive logging to trace entire flow: onChange → setCellValue → scheduleSave → flushSave → saveColumnToAPI
expecting: Console logs will show where the flow breaks
next_action: Run browser, enter value in refraction field, check console for log sequence

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
  checked: RefractionGrid component flow
  found: RxCell component uses local `rawText` state (line 233) AND store `storedValue` (line 206). On change, `handleChange` calls `setCellValue()` which updates Zustand.
  implication: Two-layer state; need to verify both update correctly

- timestamp: 2026-03-13
  checked: RxCell useEffect (lines 243-248)
  found: Effect resets `rawText` when `storedValue` changes AND `!hasFocus`. This prevents external updates from overwriting user typing.
  implication: When field loses focus, rawText will reset to formatted storedValue. But user is typing INTO the field, so hasFocus should be true.

- timestamp: 2026-03-13
  checked: handleChange implementation (lines 290-307)
  found: Calls `setRawText(raw)` first, then calls `setCellValue(colIndex, rowKey, value)` if parseError is null
  implication: rawText is updated immediately before store is updated. Good.

- timestamp: 2026-03-13
  checked: Keyboard handler for Enter/Arrow keys (useRefractionKeyboard.ts lines 232-245)
  found: When user presses Enter, handler calls `focusCellSelectAll()` to move to NEXT cell AND calls `setFocused()` to update store. This causes BLUR on current cell.
  implication: **CRITICAL**: When user presses Enter to confirm entry and move to next field, the current field gets onBlur called BEFORE the 1.5s debounce timer fires!

## Resolution

root_cause: (pending confirmation)

fix: (pending)

verification: (pending)

files_changed: []
