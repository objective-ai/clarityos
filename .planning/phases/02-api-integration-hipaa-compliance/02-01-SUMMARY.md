---
phase: 02-api-integration-hipaa-compliance
plan: "01"
subsystem: api-client, hipaa-infrastructure
tags: [api-client, case-conversion, hipaa, phi-logging, bff-proxy, ui-components]
dependency_graph:
  requires: []
  provides: [apiFetch-retry, apiFetch-case-conversion, apiFetch-ssr-auth, audit-logs-bff, phi-read-logging, GlassCardSkeleton, SaveStatusDot]
  affects: [store-migrations-02-02-through-02-07, AuditTrailSidebar, exam-findings-hipaa]
tech_stack:
  added: [lib/case-convert.ts]
  patterns: [BFF-proxy, exponential-backoff, camelCase-snake_case-conversion, phi-audit-logging]
key_files:
  created:
    - lib/case-convert.ts
    - components/ui/skeleton.tsx
    - components/ui/save-status-dot.tsx
    - app/api/encounters/[encounterId]/audit-logs/route.ts
  modified:
    - lib/api-client.ts
    - backend/api/routes/exam_findings.py
decisions:
  - "SSR-safe Supabase client (createClient factory) replaces legacy singleton in api-client — matches Phase 1 browser client pattern"
  - "withRetry uses exponential backoff (500ms base): 500ms, 1000ms, 2000ms for retries 1-3"
  - "Encounter-level GET logging in encounter.py is sufficient for vitals PHI coverage (vitals loaded inline from encounter response)"
  - "exam_findings GET required standalone log_action(READ) since it is a separate endpoint returning PHI directly"
metrics:
  duration_minutes: 12
  completed_date: "2026-03-05"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 2
---

# Phase 2 Plan 01: API Client Foundation & HIPAA Infrastructure Summary

**One-liner:** SSR-safe apiFetch with exponential retry and transparent camelCase/snake_case conversion, encounter audit-logs BFF proxy, and PHI read logging on all standalone GET endpoints.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Upgrade apiFetch with retry, case conversion, SSR-safe auth | `71dd854` | `lib/api-client.ts`, `lib/case-convert.ts` |
| 2 | Create GlassCardSkeleton and SaveStatusDot UI components | `e5a3900` | `components/ui/skeleton.tsx`, `components/ui/save-status-dot.tsx` |
| 3 | Create encounter audit-logs BFF route and verify backend PHI logging | `ac2081d` | `app/api/encounters/[encounterId]/audit-logs/route.ts`, `backend/api/routes/exam_findings.py` |

## What Was Built

### lib/case-convert.ts (new)
Four exported utilities for transparent field name conversion between TypeScript (camelCase) and FastAPI (snake_case):
- `toCamel(str)` — regex `/_([a-z])/g` single-pass conversion
- `toSnake(str)` — regex `/([A-Z])/g` single-pass conversion
- `camelizeKeys<T>(obj)` — deep recursive, handles arrays + nested objects
- `snakifyKeys(obj)` — deep recursive, handles arrays + nested objects

### lib/api-client.ts (upgraded)
- Replaced `import { supabase } from "./supabase"` (legacy singleton) with `import { createClient } from "@/lib/supabase/client"` (SSR-safe factory)
- Added `withRetry<T>(fn, retries, baseDelayMs)` with exponential backoff: 500ms, 1000ms, 2000ms
- Request body: JSON parsed, snakified, re-stringified (non-JSON bodies pass through)
- Response: `camelizeKeys<T>(json)` applied before returning
- New `ApiFetchOptions` type with optional `retries` field (default 3)

### components/ui/skeleton.tsx (new)
`GlassCardSkeleton({ rows = 4 })` renders a shimmer loading placeholder using `glass-card animate-pulse` with a title bar (h-4, 33% width) and configurable content rows (h-8, cycling 60%/75%/90% widths).

### components/ui/save-status-dot.tsx (new)
`SaveStatusDot({ status: SaveStatus })` renders a 2px ambient dot:
- `idle` → null (hidden)
- `dirty` → `--text-muted`
- `loading`/`saving` → `--accent` with `animate-pulse`
- `saved` → `--state-normal`
- `error` → `--state-critical`
- Includes `title` + `aria-label` for accessibility

### app/api/encounters/[encounterId]/audit-logs/route.ts (new)
BFF proxy following exact pattern from `/api/audit-logs/route.ts`:
- `getUser()` for server-side JWT revalidation (401 if fails)
- `getSession()` for `access_token` to forward to FastAPI
- Extracts `encounterId` from route params
- Forwards `limit`/`offset` search params to upstream
- `AbortSignal.timeout(10_000)` with 504 response on timeout
- Unblocks `AuditTrailSidebar` which fetches `/api/encounters/${encounterId}/audit-logs`

### backend/api/routes/exam_findings.py (HIPAA fix)
Added `log_action(AuditAction.READ, "exam_findings", ...)` with `patient_id` to the `get_exam_findings` GET handler. Also added `request: Request` parameter for IP address capture. Encounter-level GET logging was already present in `encounter.py` (confirmed); vitals have no standalone GET endpoint (vitals data returned inline from encounter response).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added PHI read logging to exam_findings GET endpoint**
- **Found during:** Task 3 — backend PHI logging verification
- **Issue:** `get_exam_findings` GET handler in `exam_findings.py` returned PHI data without calling `log_action(AuditAction.READ)`, violating HIPAA-01. The handler also lacked `request: Request` parameter needed for IP address capture.
- **Fix:** Added `request: Request` parameter and `log_action(AuditAction.READ, "exam_findings", row.id, encounter_id=..., patient_id=..., detail=..., ip_address=...)` call before returning the row.
- **Files modified:** `backend/api/routes/exam_findings.py`
- **Commit:** `ac2081d`

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| apiFetch() uses SSR-safe Supabase client (API-08) | PASS — imports `createClient` from `@/lib/supabase/client` |
| Legacy `./supabase` singleton import removed | PASS — `grep` returns no matches |
| apiFetch() retries 3x with exponential backoff | PASS — `withRetry(fn, 3, 500)` |
| apiFetch() converts camelCase/snake_case transparently | PASS — snakifyKeys on request, camelizeKeys on response |
| BFF route at /api/encounters/[encounterId]/audit-logs | PASS — created, TypeScript clean |
| All PHI-returning GET endpoints have log_action(READ) | PASS — encounter.py (confirmed), exam_findings.py (fixed), vitals (no standalone GET) |
| GlassCardSkeleton type-checks cleanly | PASS |
| SaveStatusDot type-checks cleanly | PASS |
| `npx tsc --noEmit` passes for all new/modified files | PASS |

## Self-Check: PASSED

All created files confirmed present on disk. All task commits verified in git log:
- `71dd854` — feat(02-01): upgrade apiFetch
- `e5a3900` — feat(02-01): add skeleton and save-status-dot
- `ac2081d` — feat(02-01): BFF route and HIPAA PHI logging
