---
phase: 02-api-integration-hipaa-compliance
plan: "02"
subsystem: store-migrations
tags: [zustand, api-client, store-migration, refraction, vitals, encounter, exam-findings, diagnosis, problem-list]
dependency_graph:
  requires: [02-01-apiFetch-retry, 02-01-apiFetch-case-conversion, 02-01-apiFetch-ssr-auth]
  provides: [encounterStore-loadEncounter, vitalsStore-loadVitals, refractionStore-loadRefractions, examFindingsStore-loadFindings, diagnosisStore-loadDiagnoses, problemListStore-fetchProblems]
  affects: [encounter-page-mount-hydration, finalize-sign-flow, audit-trail-sidebar]
tech_stack:
  added: []
  patterns: [loadX-fetch-action, force-overwrite-pattern, camelCase-to-snakeCase-mapping, error-surfacing-no-mock-fallback]
key_files:
  created: []
  modified:
    - store/encounterStore.ts
    - store/vitalsStore.ts
    - store/refractionStore.ts
    - store/examFindingsStore.ts
    - store/diagnosisStore.ts
    - store/problemListStore.ts
    - types/vitals.ts
decisions:
  - "loadRefractions isReadOnly parameter made optional (default false) to keep encounter page compatible — caller can pass true after encounterStore resolves isFinalized"
  - "diagnosisStore.removeDiagnosis now surfaces errors instead of silent local removal — callers must handle rejection"
  - "refractionSummaryToDraft converter maps camelCase API response fields to snake_case RefractionDraft shape (apiFetch returns camelCase, store uses snake_case internally)"
  - "vitalsStore.loadVitals maps camelCase API fields explicitly (iopOd->iop_od etc.) to prevent double-conversion pitfall"
  - "examFindingsStore.saveFindingsToAPI sends camelCase payload (isNormalWnl, findingsOd) and parses camelCase response — api-client handles snake_case conversion"
  - "problemListStore._seedProblems removed entirely — no mock path exists, encounter page calls fetchProblems(patientId) from encounterStore.patientId"
metrics:
  duration_minutes: 8
  completed_date: "2026-03-05"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 7
---

# Phase 2 Plan 02: Store Migrations to Real API Summary

**One-liner:** All 6 clinical Zustand stores migrated to real FastAPI endpoints via loadX() actions — mock fallbacks removed, camelCase/snake_case mapping handled, errors surface as saveStatus: "error".

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migrate encounterStore, vitalsStore, refractionStore to real API | `314a8fe` | `store/encounterStore.ts`, `store/vitalsStore.ts`, `store/refractionStore.ts`, `types/vitals.ts` |
| 2 | Migrate examFindingsStore, diagnosisStore, problemListStore to real API | `056469e` | `store/examFindingsStore.ts`, `store/diagnosisStore.ts`, `store/problemListStore.ts` |

## What Was Built

### store/encounterStore.ts
Added `loadEncounter(id: string)` action:
- Sets `loadStatus: "loading"` before fetch (force-overwrites persisted state)
- Calls `apiFetch<EncounterApiResponse>(/api/encounters/${id})`
- On success: force-sets encounter state via `set()` directly (NOT `initEncounter()` — bypasses idempotency guard that would skip stale localStorage data)
- Exposes `patientId` on `EncounterState` — downstream `problemListStore.fetchProblems()` depends on this
- Added `EncounterLoadStatus` type and `loadError` field to `EncounterState`

### store/vitalsStore.ts
Added `loadVitals(encounterId: string)` action:
- Sets `saveStatus: "loading"` (added `"loading"` to `VitalsSaveStatus` type in `types/vitals.ts`)
- Fetches from `/api/encounters/${encounterId}/vitals` with `retries: 2`
- Explicitly maps camelCase API response fields to snake_case `VitalsDraft` (e.g., `iopOd` → `iop_od`)
- Removed mock fallback catch block in `saveVitalsToAPI`
- Save payload now uses camelCase (`iopOd`, `bloodPressure`, etc.) — api-client converts to snake_case
- `flushSave` guards against `"loading"` status to prevent saves during load

### store/refractionStore.ts
Added `loadRefractions(encounterId: string, isReadOnly?: boolean)` action (isReadOnly defaults to false):
- Added `refractionSummaryToDraft()` converter — maps camelCase API response to snake_case `RefractionDraft` shape
- Fetches `exam_findings` array from `/api/encounters/${encounterId}` and extracts `refractions`
- Removed mock fallback and `setTimeout(resolve, 400)` delay in `saveColumnToAPI`
- Added `EyeRxDraft` import for converter type safety

### store/examFindingsStore.ts
Added `loadFindings(encounterId: string, section: ExamSection)` action:
- Fetches from `/api/encounters/${encounterId}/exam-findings/${section}` (standalone GET endpoint)
- Maps camelCase API response (`isNormalWnl`, `findingsOd`, etc.) to snake_case `FindingsDraft`
- Removed mock fallback in `saveFindingsToAPI`
- Save payload converted to camelCase (`isNormalWnl`, `findingsOd`, `providerNotes`) — api-client handles conversion

### store/diagnosisStore.ts
Added `loadDiagnoses(encounterId: string)` action:
- Added `"loading"` to `SaveStatus` type
- Fetches from `/api/encounters/${encounterId}/diagnoses`
- Removed mock fallback in `addDiagnosis` — errors surface as `saveStatus: "error"` with message
- Removed optimistic local update in `updateDiagnosis` — errors surface properly
- `removeDiagnosis` now wraps API call in try/catch and sets `saveStatus: "error"` on failure (no silent local removal)

### store/problemListStore.ts
- `fetchProblems()` already used real `apiFetch()` — verified and kept
- Removed `_seedProblems` method (interface + implementation) — no mock path
- Removed mock fallback in `addProblem` — errors surface as `saveStatus: "error"`
- Removed optimistic local update in `updateProblem` — errors surface properly
- `deleteProblem` now surfaces errors instead of silent local removal

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Made loadRefractions isReadOnly parameter optional**
- **Found during:** Task 2 TypeScript check
- **Issue:** The encounter page at `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx:595` calls `loadRefractions(encId)` with 1 argument. Our new signature required `isReadOnly: boolean` as second argument, causing `TS2554: Expected 2 arguments, but got 1`.
- **Fix:** Changed signature to `loadRefractions(encounterId: string, isReadOnly?: boolean)` with default `false` in implementation. Callers can pass `true` after `encounterStore` resolves `isFinalized`.
- **Files modified:** `store/refractionStore.ts`
- **Commit:** included in `056469e`

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| encounterStore.loadEncounter() fetches real data and exposes patientId | PASS |
| vitalsStore.loadVitals() with no mock fallback | PASS |
| refractionStore.loadRefractions() with camelCase normalization and refractionSummaryToDraft | PASS |
| examFindingsStore.loadFindings() for anterior/posterior sections | PASS |
| diagnosisStore.loadDiagnoses() with no mock fallback on CRUD | PASS |
| problemListStore has no mock seed path | PASS — _seedProblems removed |
| All 6 stores surface real errors as saveStatus error | PASS |
| No store imports from lib/mock/ or lib/mock-* files | PASS — grep returns no matches |
| No mock delay patterns (setTimeout 400) | PASS — grep returns no matches |
| npx tsc --noEmit passes for all 6 clinical stores | PASS — zero errors |

## Self-Check: PASSED

All task commits verified in git log:
- `314a8fe` — feat(02-02): migrate encounterStore, vitalsStore, refractionStore to real API
- `056469e` — feat(02-02): migrate examFindingsStore, diagnosisStore, problemListStore to real API
