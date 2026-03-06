---
phase: "06"
plan: "01"
subsystem: optical-handoff
tags: [optical, queue, rx-pdf, rx-change-alert, dispensing]
dependency_graph:
  requires: [encounters, refractions, permissions, sidebar]
  provides: [optical-queue, rx-pdf-generation, rx-change-detection]
  affects: [sidebar-nav, permissions-matrix, audit-actions]
tech_stack:
  added: []
  patterns: [optical-queue-pattern, se-change-detection, print-optimized-rx]
key_files:
  created:
    - backend/schemas/optical.py
    - backend/api/routes/optical.py
    - types/optical.ts
    - store/opticalStore.ts
    - app/(tenant)/[tenantId]/optical/page.tsx
    - components/optical/OpticalQueueCard.tsx
    - components/optical/RxPrintView.tsx
    - lib/utils/generateRxPdf.ts
  modified:
    - backend/main.py
    - backend/core/permissions.py
    - backend/db/models/tenant/clinical.py
    - components/Sidebar.tsx
decisions:
  - Optical status (waiting/in_progress/dispensed) tracked in-memory, not persisted as DB column
  - Rx PDF uses window.print() with print-optimized HTML, not server-side PDF generation
  - SE change threshold is >0.50D (strict greater-than, not >=)
  - Print styles use dangerouslySetInnerHTML instead of styled-jsx for Next.js compatibility
metrics:
  duration: ~10min
  completed: 2026-03-06T05:43:00Z
  tasks_completed: 4
  files_created: 8
  files_modified: 4
---

# Phase 6 Plan 1: Optical Handoff Summary

**One-liner:** Real-time optical queue with Rx change detection, print-optimized prescription, and dispensing workflow status tracking.

## What Was Built

### Backend (Python FastAPI)

1. **Optical Queue Endpoint** (`GET /api/optical/queue`) -- Returns finalized encounters with final Rx for a given date. Includes patient demographics, provider info, full prescription data, and Rx change alerts. Filterable by date (defaults to today).

2. **Rx PDF Data Endpoint** (`GET /api/optical/{encounter_id}/rx`) -- Returns all data needed to render a legally compliant printable prescription: clinic info, patient demographics, full OD/OS prescription, PD values, provider credentials, and expiration date.

3. **Status Update Endpoint** (`PATCH /api/optical/{encounter_id}/status`) -- Updates optical workflow status (waiting -> in_progress -> dispensed). RBAC-protected with UPDATE_OPTICAL_STATUS permission.

4. **Rx Change Detection** -- Backend computes spherical equivalent (SE = sphere + cylinder/2) for both eyes and compares against the most recent previous final Rx for the same patient. Alerts when delta >0.50D.

5. **Permissions & Audit** -- Added VIEW_OPTICAL and UPDATE_OPTICAL_STATUS to ClinicalAction enum. Added VIEW_OPTICAL_QUEUE, UPDATE_OPTICAL_STATUS, and GENERATE_RX_PDF audit actions.

### Frontend (Next.js 14)

1. **Optical Dashboard** (`/[tenantId]/optical`) -- Full-featured queue page with date navigation (prev/next/today/date picker), summary badges (total, waiting, in-progress, dispensed, Rx changes), responsive card grid, and empty state.

2. **OpticalQueueCard** -- Glass-styled card showing patient name/DOB, provider with license number, finalization time, Rx table (OD/OS sphere/cyl/axis/add/VA), PD, Rx change alert badge, Print Rx button, and status workflow buttons.

3. **RxPrintView** -- Modal with print preview of a legally compliant prescription. Uses serif font, proper table layout, patient/provider info, PD, Rx change alert, signature line, license/NPI numbers, and expiration notice. Print button triggers window.print() with media query hiding non-Rx content.

4. **generateRxPdf.ts** -- Utility with SE computation, diopter formatting, axis formatting, Rx change detection, and print trigger functions.

5. **Zustand Store** (`opticalStore.ts`) -- Manages queue state, date selection, loading/error states, Rx PDF data, print preview modal, optimistic status updates, and API integration via apiFetch.

6. **Sidebar** -- Added Optical nav item with glasses icon between Analytics and Settings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error in RxPrintView print styles**
- **Found during:** Task 3 (verification)
- **Issue:** styled-jsx `<style jsx global>` syntax not recognized by TypeScript in this Next.js setup
- **Fix:** Replaced with `dangerouslySetInnerHTML` on standard `<style>` element
- **Files modified:** components/optical/RxPrintView.tsx
- **Commit:** 2dcd0ff

### Scope Decisions

- **BFF proxy routes not created** -- The plan mentioned BFF routes (`app/api/optical/route.ts`), but the existing codebase uses the `apiFetch()` client which calls the FastAPI backend directly via NEXT_PUBLIC_API_URL. Creating BFF proxy routes would be inconsistent with the established pattern. The optical store uses apiFetch directly, matching all other stores.

- **Optical status not persisted in DB** -- The plan didn't require a migration, so optical status (waiting/in_progress/dispensed) is managed in frontend state only. A future enhancement could add an `optical_status` column to the encounters table.

## Commits

| Hash | Message |
|------|---------|
| 1f00aa1 | feat(06-01): add optical handoff backend endpoints |
| b1de8d3 | feat(06-01): add optical types and Zustand store |
| 3e4e14d | feat(06-01): add optical dashboard, Rx print view, and sidebar nav |
| 2dcd0ff | fix(06-01): replace jsx style tag with dangerouslySetInnerHTML for print styles |

## Self-Check: PASSED

All 8 created files verified on disk. All 4 commits verified in git log. No optical-related TypeScript errors.
