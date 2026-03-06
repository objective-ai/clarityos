---
phase: 02-api-integration-hipaa-compliance
verified: 2026-03-05T00:00:00Z
status: gaps_found
score: 10/11 must-haves verified
re_verification: false
gaps:
  - truth: "No production file imports from any mock data module"
    status: partial
    reason: "components/TopNav.tsx has a top-level (unconditional) import of getMockSession from lib/auth/mock-session. The import is not wrapped in any dev-only guard — only the JSX that calls switchRole() is gated behind {isDev && ...}. The module is included in the production bundle at build time."
    artifacts:
      - path: "components/TopNav.tsx"
        issue: "Line 19: `import { getMockSession, type MockScenario } from \"@/lib/auth/mock-session\";` is at module scope, not inside a dev-only block. Next.js tree-shaking cannot eliminate it because getMockSession is referenced inside switchRole(), which is referenced inside the JSX even if that JSX is conditionally rendered."
    missing:
      - "Move the import and switchRole() function inside a dev-only conditional block, or dynamically import lib/auth/mock-session only when NODE_ENV is development, or replace with a proper dynamic import to ensure the module is excluded from production builds"
human_verification:
  - test: "Saving clinical data persists through a full page refresh"
    expected: "After editing a vitals field and saving (waitng 1.5s debounce + saved indicator), refreshing the page shows the updated value (not the pre-edit value)"
    why_human: "Cannot programmatically verify persistence across a page refresh without a running backend — requires a live FastAPI + PostgreSQL connection"
  - test: "Audit trail sidebar loads real entries (no 404)"
    expected: "Opening the audit trail sidebar in the encounter view shows real audit log entries fetched from /api/encounters/[encounterId]/audit-logs — no 404 or empty state due to proxy failure"
    why_human: "BFF route exists and is correctly wired, but verifying the full round-trip requires a live backend with real encounter data"
  - test: "Session timeout clears ePHI after 30 minutes of inactivity"
    expected: "After 30 minutes of no interaction, the user is redirected to /login and localStorage/Zustand state containing clinical data is cleared"
    why_human: "Behavior implemented in Phase 1 (react-idle-timer), cannot programmatically simulate 30 minutes of inactivity"
---

# Phase 2: API Integration & HIPAA Compliance Verification Report

**Phase Goal:** The application runs entirely on real data from FastAPI — every mock import removed, every clinical GET endpoint logged for HIPAA
**Verified:** 2026-03-05
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|---------|
| 1  | apiFetch() attaches Supabase session token via SSR-safe createClient() | VERIFIED | `lib/api-client.ts:10` imports `createClient` from `@/lib/supabase/client`; `getAuthHeaders()` calls `createClient()` not legacy singleton |
| 2  | apiFetch() retries failed requests 3 times with exponential backoff | VERIFIED | `withRetry<T>(fn, 3, 500)` at line 19–37; delays are `500 * 2^attempt` ms |
| 3  | apiFetch() transparently converts camelCase payloads to snake_case and snake_case responses to camelCase | VERIFIED | `lib/case-convert.ts` exports `camelizeKeys`, `snakifyKeys`, `toCamel`, `toSnake`; api-client calls `snakifyKeys` on body and `camelizeKeys` on response |
| 4  | Audit trail sidebar in encounter view can fetch audit logs without 404 | VERIFIED | `app/api/encounters/[encounterId]/audit-logs/route.ts` exists and implements the BFF proxy pattern with `createServerSupabaseClient`, `getUser()`, `getSession()`, `AbortSignal.timeout(10_000)` |
| 5  | All GET endpoints returning PHI log a phi_viewed audit entry | VERIFIED | `encounter.py:208` has `log_action(AuditAction.READ, ...)` with `patient_id`; `exam_findings.py:163` has `log_action(AuditAction.READ, ...)` with `patient_id`; vitals has no standalone GET endpoint (vitals data returned inline from encounter response) |
| 6  | encounterStore.loadEncounter() fetches from API and populates state including patientId | VERIFIED | `store/encounterStore.ts:86` — `loadEncounter(id)` calls `apiFetch<EncounterApiResponse>(/api/encounters/${id})` and force-sets `patientId` on state via `set()` directly |
| 7  | All 6 stores surface real errors as saveStatus error (no silent mock fallback) | VERIFIED | vitalsStore: catch sets `saveStatus: "error"`, errors `[{ field: "_load" }]`; refractionStore: catch sets columns to `saveStatus: "error"`; examFindingsStore: catch sets `saveStatus: "error"`; diagnosisStore: catch sets `saveStatus: "error"`; problemListStore: catch sets `loadStatus: "error"`; no mock data returned from any catch block |
| 8  | Opening an encounter fires parallel fetches for all clinical sections | VERIFIED | `encounter/page.tsx:591-600` — single `useEffect` fires `loadEncounter`, `loadVitals`, `loadRefractions`, `loadFindings(anterior_segment)`, `loadFindings(posterior_segment)`, `loadDiagnoses` in parallel; secondary `useEffect:603-607` fires `fetchProblems(patientId)` once `patientId` is available |
| 9  | Each encounter section shows skeleton shimmer while loading | VERIFIED | `encounter/page.tsx:610-617` — renders 3 stacked `<GlassCardSkeleton>` when `encounterLoadStatus === "loading"` or `"idle"`; error state with retry button rendered when `encounterLoadStatus === "error"` |
| 10 | No production file imports from any mock data module | PARTIAL | All deleted mock data files are confirmed gone (`lib/mock-patient-data.ts`, `lib/mock/personas.ts`, `lib/mock-schedule-data.ts`, `lib/mock-staff-data.ts`, `lib/mock-refraction-data.ts`, `lib/mock-vitals-data.ts`). No `from.*lib/mock-*` import exists anywhere in `app/` or `store/`. **EXCEPTION:** `components/TopNav.tsx:19` has `import { getMockSession, type MockScenario } from "@/lib/auth/mock-session"` at module scope — the import is unconditional and cannot be tree-shaken from the production bundle |
| 11 | Pages for future phases (schedule, patients, admin) show appropriate fallback instead of crashing | VERIFIED | `schedule/page.tsx` — entitlement gate then "Phase 3 will wire real appointment data" placeholder; `patients/page.tsx` — entitlement gate then empty state; both render without errors |

**Score:** 10/11 truths verified (1 partial)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/api-client.ts` | Upgraded API client with retry, case conversion, SSR-safe auth | VERIFIED | Exports `apiFetch`, imports from `@/lib/supabase/client` not legacy singleton, `withRetry` with 500ms base delay |
| `lib/case-convert.ts` | camelizeKeys and snakifyKeys conversion utilities | VERIFIED | Exports `camelizeKeys`, `snakifyKeys`, `toCamel`, `toSnake` — all 4 required functions present |
| `components/ui/skeleton.tsx` | GlassCardSkeleton shimmer component | VERIFIED | Exports `GlassCardSkeleton({ rows = 4 })` with `glass-card animate-pulse`, cycling 60%/75%/90% widths |
| `components/ui/save-status-dot.tsx` | Ambient save status indicator | VERIFIED | Exports `SaveStatus` type and `SaveStatusDot` with all 6 states; returns null on idle; has `title` + `aria-label` for accessibility |
| `app/api/encounters/[encounterId]/audit-logs/route.ts` | BFF proxy for encounter-scoped audit logs | VERIFIED | Exports `GET`, uses `createServerSupabaseClient`, `getUser()` auth check, `getSession()` token forwarding, 10s timeout, limit/offset forwarding |
| `store/encounterStore.ts` | Real API encounter loading with patientId exposure | VERIFIED | `loadEncounter(id)` present; `patientId` on `EncounterState`; `loadStatus` and `loadError` fields |
| `store/vitalsStore.ts` | Real API vitals load and save | VERIFIED | `loadVitals(encounterId)` present; explicit camelCase-to-snake_case mapping; no mock fallback in save |
| `store/refractionStore.ts` | Real API refraction load and save with camelCase keys | VERIFIED | `loadRefractions(encounterId, isReadOnly?)` present; `refractionSummaryToDraft()` converter; `saveColumnToAPI` calls real API |
| `store/examFindingsStore.ts` | Real API exam findings load and save | VERIFIED | `loadFindings(encounterId, section)` present; fetches from standalone GET endpoint; save sends camelCase payload |
| `store/diagnosisStore.ts` | Real API diagnosis CRUD | VERIFIED | `loadDiagnoses(encounterId)` present; all CRUD methods (add/update/remove) call real API with no mock fallback |
| `store/problemListStore.ts` | Real API problem list CRUD | VERIFIED | `fetchProblems(patientId)` present; no `_seedProblems` method; all CRUD surfaces errors via `saveStatus: "error"` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/api-client.ts` | `lib/supabase/client.ts` | import createClient for SSR-safe auth | WIRED | Line 10: `import { createClient } from "@/lib/supabase/client"` — used in `getAuthHeaders()` |
| `lib/api-client.ts` | `lib/case-convert.ts` | import camelizeKeys/snakifyKeys | WIRED | Line 11: `import { camelizeKeys, snakifyKeys } from "@/lib/case-convert"` — both used in `apiFetch` |
| `app/api/encounters/[encounterId]/audit-logs/route.ts` | `lib/supabase/server.ts` | BFF auth pattern | WIRED | Line 2: `import { createServerSupabaseClient } from "@/lib/supabase/server"` — called in GET handler |
| `store/encounterStore.ts` | `lib/api-client.ts` | apiFetch() for GET/PATCH | WIRED | Pattern `apiFetch.*encounters` matches: `apiFetch<EncounterApiResponse>(/api/encounters/${id})` |
| `store/vitalsStore.ts` | `lib/api-client.ts` | apiFetch() for GET/PUT | WIRED | Pattern `apiFetch.*vitals` matches: `apiFetch<VitalsResponse>(/api/encounters/${encounterId}/vitals)` |
| `store/refractionStore.ts` | `lib/api-client.ts` | apiFetch() for PATCH column | WIRED | Pattern `apiFetch.*column` matches: `apiFetch<{ id: string }>(/api/encounters/${encounterId}/column/${colIndex})` |
| `encounter/page.tsx` | `store/encounterStore.ts` | loadEncounter() in useEffect | WIRED | Line 593: `loadEncounter(encId)` inside `useEffect([params.encounterId])` |
| `encounter/page.tsx` | `store/vitalsStore.ts` | loadVitals() in useEffect | WIRED | Line 594: `loadVitals(encId)` inside same `useEffect` |
| `encounter/page.tsx` | `store/problemListStore.ts` | fetchProblems(patientId) in secondary useEffect | WIRED | Lines 603-607: `useEffect(() => { if (!patientId) return; fetchProblems(patientId); }, [patientId])` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| API-01 | 02-02-PLAN | encounterStore migrated from mock to real apiFetch() | SATISFIED | `store/encounterStore.ts` — `loadEncounter()` calls `apiFetch<EncounterApiResponse>` |
| API-02 | 02-02-PLAN | vitalsStore migrated from mock to real apiFetch() | SATISFIED | `store/vitalsStore.ts` — `loadVitals()` calls `apiFetch`, save calls `apiFetch` PUT with no mock catch block |
| API-03 | 02-02-PLAN | refractionStore migrated from mock to real apiFetch() | SATISFIED | `store/refractionStore.ts` — `loadRefractions()` calls `apiFetch`; `saveColumnToAPI` uses `apiFetch` PATCH |
| API-04 | 02-02-PLAN | examFindingsStore migrated from mock to real apiFetch() | SATISFIED | `store/examFindingsStore.ts` — `loadFindings()` calls `apiFetch` on standalone GET; save calls `apiFetch` PUT |
| API-05 | 02-02-PLAN | diagnosisStore migrated from mock to real apiFetch() | SATISFIED | `store/diagnosisStore.ts` — `loadDiagnoses()` calls `apiFetch`; CRUD actions use real API with error surfacing |
| API-06 | 02-02-PLAN | problemListStore migrated from mock to real apiFetch() | SATISFIED | `store/problemListStore.ts` — `fetchProblems()` calls `apiFetch`; `_seedProblems` removed entirely |
| API-07 | 02-03-PLAN | Mock persona seed imports removed from all 9 production pages | PARTIAL | All `lib/mock-*` files deleted. All pages in `app/` and `store/` clean. `components/TopNav.tsx` imports `getMockSession` from `lib/auth/mock-session` at module scope — not tree-shakeable for production build |
| API-08 | 02-01-PLAN | apiFetch() uses Supabase session token for Authorization header | SATISFIED | `lib/api-client.ts:10,44` — `createClient()` factory used in `getAuthHeaders()`; legacy singleton not present |
| HIPAA-01 | 02-01-PLAN | PHI read logging on all GET endpoints that return patient/encounter data | SATISFIED | `encounter.py:207-210` — `log_action(READ)` with `patient_id`; `exam_findings.py:163-166` — `log_action(READ)` with `patient_id`; vitals: no standalone GET (returned inline from encounter, covered by encounter READ log) |
| HIPAA-02 | 02-01-PLAN | Audit trail sidebar wired to real audit log API (no 404) | SATISFIED | `app/api/encounters/[encounterId]/audit-logs/route.ts` — BFF proxy fully implemented with auth, token forwarding, search param forwarding, timeout |
| HIPAA-03 | 02-03-PLAN | Automatic session timeout after 30 minutes of inactivity | SATISFIED (Phase 1) | Per plan decision and SUMMARY: Session timeout via react-idle-timer completed in Phase 1. HIPAA-03 is confirmed in REQUIREMENTS.md as complete. No additional work done in Phase 2. |

**Orphaned requirements:** None. All 11 Phase 2 requirements (API-01 through API-08, HIPAA-01 through HIPAA-03) appear in at least one plan's `requirements` field and are accounted for above.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/TopNav.tsx` | 19 | Module-level `import { getMockSession } from "@/lib/auth/mock-session"` without dev guard | WARNING | `lib/auth/mock-session` is a mock data module containing hardcoded JWT payloads and fake session data. The import is unconditional — Next.js cannot tree-shake it because `getMockSession` is referenced in the `switchRole()` function body. The mock-session module ships to production users. Does not cause a runtime error (the UI is dev-gated at `{isDev && ...}`) but violates the spirit of API-07 ("no file in the production bundle imports from any mock data module"). |
| `store/diagnosisStore.ts` | 56-61 | `_addLocal(encounterId, dx)` and `_removeLocal` methods named with underscore prefix | INFO | The comment "Optimistic add for mock/offline" is misleading — `_addLocal` is called in `ContinuitySidebar.tsx:63` after a real API call (`promoteToDiagnosis`), not as a mock fallback. The comment should read "Optimistic update after real API response." No functional issue. |
| `store/vitalsStore.ts` | 83-84 | Comment inside store reads "API save — real API only, no mock fallback" | INFO | Comment is accurate and intentional documentation. Not an anti-pattern — noting for completeness. |

---

### Human Verification Required

### 1. Clinical Data Persistence Across Page Refresh

**Test:** With the FastAPI backend running locally, navigate to an encounter page, edit a vitals field (e.g., IOP OD), wait 2 seconds for the save indicator to show "saved", then hard refresh the page (Cmd+Shift+R / Ctrl+Shift+R).
**Expected:** The vitals field shows the value that was just saved, not a blank or the previous value. The data survived the refresh because it was persisted to the database.
**Why human:** Cannot verify database persistence without a live backend and real encounter data.

### 2. Audit Trail Sidebar End-to-End (HIPAA-02)

**Test:** With the FastAPI backend running, open an encounter, click "Audit Trail" to open the sidebar.
**Expected:** The sidebar populates with real audit log entries (timestamps, actions, staff names) — no 404 error in the browser console and no "Could not load" error state in the sidebar UI.
**Why human:** The BFF route is correctly implemented, but the full round-trip requires a live backend with audit log data for the encounter.

### 3. Session Timeout After Inactivity (HIPAA-03)

**Test:** Log in, leave the tab open with no interaction for 30 minutes.
**Expected:** User is automatically redirected to /login and all ePHI is cleared from localStorage/Zustand state (SOAP notes, encounter data, clinical transcripts).
**Why human:** Implemented in Phase 1 via react-idle-timer. Cannot programmatically simulate 30 minutes of inactivity.

---

### Gaps Summary

**1 gap blocking full goal achievement:**

**API-07 partial violation — TopNav.tsx module-level mock import.**

`components/TopNav.tsx` has an unconditional top-level import of `getMockSession` from `lib/auth/mock-session`. The render logic that uses it is properly gated behind `{isDev && (...)}`, so no mock session is set in production at runtime. However, the import statement at module scope means the `lib/auth/mock-session` module (which contains hardcoded JWT payloads and fake user data) is included in the production JavaScript bundle. API-07 states "no file in the production bundle imports from any mock data module."

The fix is straightforward: either use a dynamic import (`const { getMockSession } = await import("@/lib/auth/mock-session")`) inside the `switchRole` function body, or restructure the dev switcher as a lazy-loaded component that is only rendered in development and excluded at build time via Next.js `dynamic()` with `ssr: false`.

**Note:** This gap does not cause a security vulnerability or runtime failure. The `auth/mock-session` module is used only for the dev role switcher, and the switcher is JSX-gated. However, mock credential data ships in the bundle, which is a hygiene issue for the goal "no mock data module in the production bundle."

---

_Verified: 2026-03-05_
_Verifier: Claude (gsd-verifier)_
