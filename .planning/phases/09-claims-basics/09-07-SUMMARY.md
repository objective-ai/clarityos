---
phase: 09-claims-basics
plan: "07"
subsystem: billing-ui
tags: [pdf-download, billing-dashboard, superbill-editor, claims-ui]
dependency_graph:
  requires: [09-03, 09-04, 09-05, 09-06]
  provides: [billing-dashboard-pdf-download, superbill-editor-pdf-download]
  affects: [billing-dashboard, superbill-editor]
tech_stack:
  added: []
  patterns:
    - fetch-blob-anchor-download
    - per-row-loading-state
key_files:
  modified:
    - app/(tenant)/[tenant]/billing/page.tsx
    - components/billing/SuperbillEditor.tsx
    - backend/schemas/billing.py
    - backend/api/routes/billing_list.py
    - types/billing.ts
decisions:
  - Exposed last_pdf_generated_at in backend SuperbillListItem schema and list endpoint (DB column already existed from 09-01)
  - Used per-row Record<string, boolean> loading state so multiple rows can load PDFs simultaneously without blocking each other
  - Inlined handleDownloadPdf in SuperbillEditor rather than extracting to a shared util to keep the component self-contained
metrics:
  duration: "~20 minutes"
  completed: "2026-03-14"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 5
---

# Phase 9 Plan 07: Download PDF Buttons Summary

**One-liner:** CMS-1500 PDF download wired to billing dashboard rows and SuperbillEditor footer using fetch-blob-anchor pattern with per-row loading state.

## What Was Implemented

### Task 1 — Add Download PDF button to billing/page.tsx and SuperbillEditor.tsx

**billing/page.tsx:**
- Added `useState` and `FileDown`, `Eye`, `Loader2` icon imports
- Added `downloadPdf(encounterId, setLoading)` helper above component: fetch → blob → anchor click pattern (no `window.open` — handles auth cookies correctly)
- Added `pdfLoading: Record<string, boolean>` state for independent per-row loading
- Added PDF button to each billing row's action cell, next to `StatusActionsMenu`:
  - All statuses show the button (no status gate)
  - Draft rows: `Eye` icon + title "Preview PDF (Draft)"
  - Non-draft rows: `FileDown` icon + title "Download PDF"
  - Shows `Loader2` spinner while loading
- Added "Last printed: Xd ago" display near status badge when `lastPdfGeneratedAt` is set

**components/billing/SuperbillEditor.tsx:**
- Added `FileDown`, `Eye`, `Loader2` icon imports
- Added `pdfLoading: boolean` state
- Added `handleDownloadPdf` async function with same fetch → blob → anchor pattern
- Added PDF button to the editor footer (between CptAddDropdown and total):
  - Draft superbills: `Eye` icon + "Preview PDF (Draft)" label
  - Non-draft superbills: `FileDown` icon + "Download PDF" label

**Backend + TypeScript types:**
- Added `last_pdf_generated_at: datetime | None = None` to `SuperbillListItem` Pydantic schema
- Added `last_pdf_generated_at=sb.last_pdf_generated_at` to billing_list.py serialization
- Added `lastPdfGeneratedAt?: string | null` to TS `SuperbillListItem` interface

## Files Changed

| File | Change |
|------|--------|
| `app/(tenant)/[tenant]/billing/page.tsx` | Added downloadPdf helper, pdfLoading state, PDF button per row, "Last printed" display |
| `components/billing/SuperbillEditor.tsx` | Added handleDownloadPdf, pdfLoading state, PDF button in footer |
| `backend/schemas/billing.py` | Added last_pdf_generated_at to SuperbillListItem schema |
| `backend/api/routes/billing_list.py` | Serialize last_pdf_generated_at in list response |
| `types/billing.ts` | Added lastPdfGeneratedAt?: string | null to SuperbillListItem |

## TypeScript Check Result

`npx tsc --noEmit` returned 0 errors.

## Commits

| Hash | Message |
|------|---------|
| 1278dc1 | feat(claims-ui): add Download PDF buttons to billing dashboard and SuperbillEditor |

## Checkpoint Status

Task 2 is a `checkpoint:human-verify` — requires browser verification of all 6 Phase 9 features. Cannot be self-verified. Human verification is PENDING.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added last_pdf_generated_at to backend schema and list endpoint**
- **Found during:** Task 1
- **Issue:** `last_pdf_generated_at` DB column existed (from 09-01) but was not included in the backend `SuperbillListItem` Pydantic schema or serialized in the list endpoint
- **Fix:** Added field to schema and serialization; added `lastPdfGeneratedAt` to TS type
- **Files modified:** backend/schemas/billing.py, backend/api/routes/billing_list.py, types/billing.ts
- **Commit:** 1278dc1

## Self-Check: PASSED

- [x] `app/(tenant)/[tenant]/billing/page.tsx` — modified, committed
- [x] `components/billing/SuperbillEditor.tsx` — modified, committed
- [x] `backend/schemas/billing.py` — modified, committed
- [x] `backend/api/routes/billing_list.py` — modified, committed
- [x] `types/billing.ts` — modified, committed
- [x] Commit 1278dc1 exists in git log
- [x] `npx tsc --noEmit` — 0 errors
