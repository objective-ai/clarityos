---
phase: 08-analytics-dashboard
plan: "00"
subsystem: api
tags: [recharts, pydantic, zustand, analytics, permissions, e2e]

# Dependency graph
requires:
  - phase: 06-billing
    provides: billing patterns (VIEW_BILLING permission, billingDashboardStore pattern)
provides:
  - recharts ^2.15.4 installed as runtime dependency
  - backend/schemas/analytics.py with AnalyticsDashboardResponse and 7 chart models + KpiCard
  - store/analyticsStore.ts with useAnalyticsStore, DateRange, AnalyticsDashboardData
  - VIEW_ANALYTICS ClinicalAction in permissions.py (doctor, admin, owner)
  - tests/e2e/smoke-analytics.spec.js with 4-suite scaffold
affects:
  - 08-01 (backend analytics route builds against AnalyticsDashboardResponse)
  - 08-02 (frontend builds against useAnalyticsStore and AnalyticsDashboardData)

# Tech tracking
tech-stack:
  added:
    - recharts ^2.15.4 (runtime dependency — chart rendering library)
  patterns:
    - Aggregate endpoint pattern: single /api/analytics endpoint returns all 7 datasets + 4 KPIs
    - DateRange type "7d"|"30d"|"90d"|"6mo" maps to days via RANGE_DAYS lookup
    - toDateParams() converts DateRange to ISO date_from/date_to query params
    - camelCase TypeScript interfaces mirror snake_case Pydantic models (apiFetch auto-converts)

key-files:
  created:
    - backend/schemas/analytics.py
    - store/analyticsStore.ts
    - tests/e2e/smoke-analytics.spec.js
  modified:
    - package.json (recharts added to dependencies)
    - backend/core/permissions.py (VIEW_ANALYTICS added)

key-decisions:
  - "kpi_avg_exam_duration used instead of kpi_avg_wait_time (no actual_start_time DB column)"
  - "Single aggregate endpoint pattern: all 7 charts + 4 KPIs in one request, not 11 separate calls"
  - "DateRange '6mo' maps to 180 days (not calendar months) for simplicity"

patterns-established:
  - "Analytics Zustand store: fetch(range) triggers API call, setDateRange(range) sets state then re-fetches"
  - "E2E smoke test: graceful SKIP for chart content before backend is wired (SKIP instead of FAIL)"

requirements-completed:
  - ANAL-V2-01
  - ANAL-V2-02

# Metrics
duration: 12min
completed: 2026-03-12
---

# Phase 8 Plan 00: Analytics Foundation Summary

**recharts installed, Pydantic AnalyticsDashboardResponse with 7 chart shapes defined, Zustand analyticsStore stub with DateRange/fetch/setDateRange, VIEW_ANALYTICS permission, and 4-suite E2E scaffold**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-12T03:00:00Z
- **Completed:** 2026-03-12T03:12:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Installed recharts ^2.15.4 as a runtime dependency (not devDependencies)
- Created `backend/schemas/analytics.py` with `AnalyticsDashboardResponse` (11 fields: 4 KPIs + 7 chart arrays + 2 metadata fields), 7 chart point models, and `KpiCard` with pct_change delta support
- Created `store/analyticsStore.ts` with `useAnalyticsStore`, `DateRange` type, `AnalyticsDashboardData` interface mirroring backend response (camelCase), and `fetch(range)`/`setDateRange(range)` actions
- Added `VIEW_ANALYTICS = "view_analytics"` to `ClinicalAction` enum and `PERMISSION_MATRIX` gated to doctor, admin, owner — same as VIEW_BILLING
- Created `tests/e2e/smoke-analytics.spec.js` with 4 suites (gate, charts, date range picker, KPI cards) that run gracefully before backend is wired

## Task Commits

Each task was committed atomically:

1. **Task 1: Install recharts and define Pydantic analytics schemas** - `61b1d0b` (feat)
2. **Task 2: Add VIEW_ANALYTICS permission, Zustand store stub, and E2E scaffold** - `f961fa2` (feat)

## Files Created/Modified
- `package.json` - recharts ^2.15.4 added to dependencies
- `backend/schemas/analytics.py` - AnalyticsDashboardResponse + 7 chart models + KpiCard
- `store/analyticsStore.ts` - Zustand store with DateRange, AnalyticsDashboardData, fetch, setDateRange
- `backend/core/permissions.py` - VIEW_ANALYTICS in ClinicalAction enum and PERMISSION_MATRIX
- `tests/e2e/smoke-analytics.spec.js` - 4-suite E2E scaffold (gate, charts, date range, KPI)

## Decisions Made
- Used `kpi_avg_exam_duration` instead of `kpi_avg_wait_time` — no `actual_start_time` DB column, so avg wait time is not computable; avg duration of completed appointments (duration_minutes) is
- Single aggregate endpoint (`/api/analytics?date_from=...&date_to=...`) returns all data in one request rather than 11 separate chart endpoints — reduces waterfall latency and simplifies loading state
- `6mo` range maps to 180 days (not calendar month arithmetic) for simplicity in toDateParams()

## Deviations from Plan

None — plan executed exactly as written. All files (permissions.py, analyticsStore.ts, smoke-analytics.spec.js) were pre-populated from a prior session; Task 1 commit added recharts + schemas cleanly.

## Issues Encountered
None.

## Next Phase Readiness
- Wave 1 (backend): `backend/api/routes/analytics.py` can import `AnalyticsDashboardResponse` from `backend.schemas.analytics` and build the aggregate SQL query
- Wave 2 (frontend): `app/(tenant)/[tenant]/analytics/page.tsx` can import `useAnalyticsStore` and `AnalyticsDashboardData` from `@/store/analyticsStore` without waiting for backend
- E2E scaffold runs now (Suites A/B/C/D will SKIP chart-specific checks until backend wired)

---
*Phase: 08-analytics-dashboard*
*Completed: 2026-03-12*
