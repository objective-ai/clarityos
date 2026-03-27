---
phase: 10-encounter-workflow-redesign
plan: "03"
subsystem: encounter-workflow
tags: [encounter, pre-test, doctor-mode, ai-scribe, sticky-mic, role-gating]

dependency_graph:
  requires: [10-02]
  provides: [mode-split-encounter-page, sticky-mic-fab]
  affects: [encounter-workflow, ai-scribe-position, bottom-tab-visibility]

tech_stack:
  added: []
  patterns:
    - "Ternary mode-split rendering: isPreTest ? <PreTestBranch> : <DoctorBranch>"
    - "Dynamic import for lazy-loaded encounter sub-views"
    - "PermissionGate + status check for role+state gating of FAB"
    - "Nested IDs: section-plan wraps ai-scribe-section for dual scroll targeting"

key_files:
  created:
    - components/encounter/StickyMicButton.tsx
  modified:
    - app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx

key_decisions:
  - "EncounterBottomTabs removed from DOM via ternary else branch (not !isPreTest &&) — functionally equivalent, cleaner nesting"
  - "No standalone Plan textarea component — assessmentAndPlan is managed entirely inside AiScribeWidget; section-plan ID moved to AiScribeWidget wrapper"
  - "StickyMicButton is a UI scaffold in Phase 10 — no MediaRecorder; audio pipeline deferred to Phase 12"
  - "section-plan and ai-scribe-section are nested divs — section-plan is scroll-spy anchor, ai-scribe-section is Done-button scroll target"
  - "Pre-test mode omits audit trail toggle (not needed for technician workflow)"

requirements_completed: [EWR-01, EWR-02, EWR-03, EWR-04, EWR-05]

metrics:
  duration: "18 min"
  completed: "2026-03-27"
  tasks_completed: 2
  files_modified: 2
---

# Phase 10 Plan 03: Encounter Mode Split and Sticky Mic Summary

Mode-split encounter page rendering pre-test technician view vs doctor exam view with AI Scribe relocated to bottom and StickyMicButton FAB gated on in_exam + doctor/owner role.

**Duration:** 18 min | **Tasks:** 2/2 | **Files:** 2

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Restructure page.tsx — pre-test/doctor mode split | bc78dfb | app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx |
| 2 | Build StickyMicButton FAB component | bc78dfb | components/encounter/StickyMicButton.tsx |

## What Was Built

### Task 1: page.tsx Mode Split

Restructured the 774-line encounter page into two mutually exclusive rendering branches:

**Pre-test mode** (`isPreTest === true`):
- CC/HPI (EncounterWorkflowHeader) at top
- PreTestView component (accordion vitals + All Normal + Ready for Doctor)
- No bottom tabs, no doctor sections, no AI Scribe

**Doctor exam mode** (`isPreTest === false`):
- PrepMeCard, CC/HPI, finalized banner
- VitalsForm/VitalsCard, RefractionGrid, ContinuitySidebar
- ExamFindings (anterior + posterior), DiagnosisPicker
- AddendumSection (finalized only)
- AiScribeWidget relocated to bottom (after all clinical sections)
- EncounterBottomTabs (6 tabs with scroll-spy)
- StickyMicButton FAB (in_exam + doctor/owner only)

### Task 2: StickyMicButton

Fixed-position FAB at bottom: 128px, right: 24px with three visual states:
- **idle**: accent background, Mic icon
- **recording**: red background + animate-pulse, Mic icon
- **paused**: amber background, Pause icon

Done button (shown when not idle): resets to idle, scrolls to `#ai-scribe-section`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] No standalone Plan textarea in original page**
- **Found during:** Task 1
- **Issue:** The plan called for a "Plan textarea" section before AiScribeWidget, but the original page had no standalone textarea — `assessmentAndPlan` is managed entirely inside AiScribeWidget. Adding a non-existent `AssessmentAndPlanSection` component would have caused a TS error.
- **Fix:** Removed the `AssessmentAndPlanSection` Card block. Moved `id="section-plan"` wrapper to the AiScribeWidget's outer div (which serves as the scroll-spy anchor for the Plan tab). Nested `id="ai-scribe-section"` inside for the Done-button scroll target.
- **Files modified:** app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx
- **Commit:** bc78dfb

**Total deviations:** 1 auto-fixed (1 Rule 1 bug). **Impact:** None — behavior matches plan intent. The Plan tab still scrolls to the AiScribeWidget section.

## Verification

- `npx tsc --noEmit` — passes (no errors in modified files)
- `isPreTest` derived state: present (2 matches)
- Dynamic import for PreTestView: present (3 matches)
- Dynamic import for StickyMicButton: present (4 matches)
- EncounterBottomTabs in doctor-only branch: confirmed (ternary else)
- `encounterStatus === "in_exam"` gating StickyMicButton: confirmed
- StickyMicButton: all acceptance criteria met (MicState, useState, fixed, bottom 128, animate-pulse, Done, scrollIntoView)

## Next

Ready for Phase 10 complete — all 3 plans done.
