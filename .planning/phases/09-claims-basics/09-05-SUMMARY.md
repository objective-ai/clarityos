---
phase: "09-claims-basics"
plan: "05"
subsystem: "billing"
tags: [insurance, billing, patient-detail, bff, components]
dependency_graph:
  requires: ["09-01", "09-02", "09-04"]
  provides: ["patient insurance tab", "patient billing tab", "insurance BFF routes", "superbills BFF route"]
  affects: ["app/(tenant)/[tenant]/patients/[patientId]/page.tsx", "components/patient/"]
tech_stack:
  added: []
  patterns: ["BFF proxy with proxyToFastAPI", "dynamic imports for heavy components", "Zustand store consumption (payerStore)", "glass-card two-column layout", "shadcn Dialog modal", "STATUS_STYLES inline constants"]
key_files:
  created:
    - app/api/patients/[patientId]/insurance/route.ts
    - app/api/patients/[patientId]/insurance/[insuranceId]/route.ts
    - app/api/patients/[patientId]/superbills/route.ts
    - components/patient/InsuranceTab.tsx
    - components/patient/PatientBillingTab.tsx
  modified:
    - app/(tenant)/[tenant]/patients/[patientId]/page.tsx
    - tests/e2e/verify-patient-insurance.js
    - tests/e2e/verify-patient-billing.js
decisions:
  - "STATUS_STYLES copied inline in PatientBillingTab (not imported from billing page) to avoid cross-component coupling"
  - "InsuranceTab uses dynamic import for SSR safety consistent with other patient sub-components"
  - "Old JSONB InsuranceCard fully removed from DemographicsTab and PatientHeaderCard; Insurance tab is the sole insurance surface"
metrics:
  duration: "~6 minutes"
  completed_date: "2026-03-14"
  tasks_completed: 2
  files_changed: 8
---

# Phase 09 Plan 05: Patient Insurance Tab and Billing Tab Summary

## One-liner
Patient detail page gains Insurance and Billing tabs: 3 BFF routes, InsuranceTab with primary/secondary glass cards and add/edit modal backed by payerStore, PatientBillingTab with superbill list and STATUS_STYLES badges; old JSONB insurance card removed from Demographics.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create BFF proxy routes for patient insurance and superbills | bf8f81d | insurance/route.ts, insurance/[insuranceId]/route.ts, superbills/route.ts |
| 2 | Build InsuranceTab + PatientBillingTab + extend patient detail page | 6dd8621 | InsuranceTab.tsx, PatientBillingTab.tsx, page.tsx, 2 E2E stubs |

## What Was Built

### BFF Routes (Task 1)
- `GET /api/patients/[patientId]/insurance` — list patient insurance records
- `POST /api/patients/[patientId]/insurance` — create new insurance record
- `PATCH /api/patients/[patientId]/insurance/[insuranceId]` — update single record
- `DELETE /api/patients/[patientId]/insurance/[insuranceId]` — remove record
- `GET /api/patients/[patientId]/superbills` — list patient superbills summary
- All use `proxyToFastAPI` pattern with async params (Next.js 14 App Router convention)

### InsuranceTab Component (Task 2)
- Two glass cards side by side (grid-cols-2 on md+): Primary (teal badge) and Secondary (purple badge)
- Empty state with "+ Add Primary/Secondary Insurance" button when no record exists
- Edit and Remove actions on each card
- InsuranceFormModal (shadcn Dialog): payer dropdown from `usePayerStore().payers`, plan type, priority (read-only in edit mode), subscriber ID, group number, plan name, relationship to subscriber; conditional subscriber name/DOB fields when relationship !== "self"
- POST on create, PATCH on edit, DELETE on remove; each refreshes the insurance list

### PatientBillingTab Component (Task 2)
- "Billing History" heading with glass-card table
- Columns: Date | Status | E&M Code | CPT Codes | Total
- STATUS_STYLES defined inline (not imported from billing page)
- 3-row animate-pulse skeleton while loading
- Centered "No superbills on file" empty state with icon

### Patient Detail Page Modifications (Task 2)
- `TabKey` extended: `"demographics" | "encounters" | "flowsheets" | "rx-history" | "insurance" | "billing"`
- TABS array: Insurance and Billing entries added
- Dynamic imports for both new components (ssr: false, consistent with existing tabs)
- `InsuranceCard` function removed from DemographicsTab grid
- `insuranceProvider`/`insuranceMemberId` display removed from PatientHeaderCard

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Out-of-Scope Issues Observed
- `app/(tenant)/[tenant]/admin/page.tsx` has 3 pre-existing TypeScript errors (unused imports, type mismatch in `createPayer` callback, `AppSession.role` property missing). These were already present before plan 09-05 execution and are not caused by this plan's changes. Deferred to admin page owner.

## Verification

- TypeScript compiles clean (0 errors in plan-owned files)
- Patient detail page `TabKey` includes "insurance" and "billing"
- InsuranceTab fetches from `/api/patients/{id}/insurance`
- PatientBillingTab fetches from `/api/patients/{id}/superbills`
- STATUS_STYLES defined inline in PatientBillingTab (grep confirms: no import from billing page)
- No JSONB insurance fields remain in the demographics branch (grep confirms: 0 matches)

## Self-Check: PASSED
