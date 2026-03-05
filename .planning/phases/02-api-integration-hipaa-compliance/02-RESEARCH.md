# Phase 2: API Integration & HIPAA Compliance - Research

**Researched:** 2026-03-05
**Domain:** Zustand store migration (mock → real API), camelCase/snake_case conversion, HIPAA PHI access logging, BFF route wiring, skeleton loading UI
**Confidence:** HIGH — research drawn entirely from actual project source code + established patterns

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Save Failure UX**
- Auto-retry silently: 3 retries with exponential backoff on save failure. Only surface error if all retries fail
- Error display after retry exhaustion: subtle status indicator on the section header (red dot or warning icon) that expands on hover/click — non-intrusive to clinical workflow
- Per-section save status indicators: each section (Vitals, Refraction, Findings, Diagnoses, Problems) shows its own status: dirty → saving → saved → error
- When API is completely unreachable: show read-only from last loaded data, disable save indicators, toast "Working offline — changes will sync when connection restores." Clinician can review but new edits queue locally

**Data Loading Experience**
- Skeleton screens matching glassmorphism aesthetic: glass-card shaped shimmer placeholders for each section while data loads (~200-500ms)
- All sections load in parallel: fire all fetches simultaneously (vitals, refraction, findings, diagnoses, problems, encounter metadata). Each section renders independently as its data arrives
- Section load failure: auto-retry 2 times, then show "Could not load [section] — tap to retry" inside the section card. Other sections remain usable
- Patient sticky header loads from API: fetch patient demographics from /api/patients/{patientId} to ensure current data (allergies may have changed)

**PHI Access Logging**
- Encounter-level read logging: one "phi_viewed" audit entry per encounter open (who, when, which patient, which encounter). Standard for optometry EHR HIPAA compliance
- Mixed timeline in audit sidebar: PHI read entries ("Dr. Smith viewed this encounter") appear alongside write actions chronologically. Read entries styled subtly (gray icon) vs. write entries (blue icon)
- Backend middleware logging: FastAPI middleware automatically logs every GET to patient/encounter endpoints. No frontend changes needed. Catches all API access sources
- Patient-indexed audit entries: audit log entries include patient_id for breach notification queries ("show all access to Patient X in last 90 days")

**Mock Data Retention**
- Delete all mock data files entirely after migration (~1,565 lines across 6 files + lib/mock/ directory). Clean break — prevents accidental mock imports in production
- No mock fallback for local dev: developer must run FastAPI locally. Error states show naturally. Forces realistic testing
- Encounter page triggers fetches: page calls each store's fetch/load action on mount. Stores handle their own API calls internally. Page just reads state. Clean separation of concerns

**Case Convention**
- API client layer handles camelCase↔snake_case conversion: apiFetch() converts outgoing payloads to snake_case and incoming responses to camelCase. All stores use camelCase internally. Single conversion point

### Claude's Discretion
- Skeleton screen shimmer animation design
- Exact retry timing (exponential backoff intervals)
- Save status indicator visual design (icons, colors, positioning)
- API client conversion utility implementation (lodash/snakeCase or custom)
- BFF route handler patterns for new endpoints needed
- Order of store migration (which store first)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | encounterStore migrated from mock data to real apiFetch() calls | GET /encounters/{id} endpoint exists and returns full encounter with vitals, refractions, diagnoses, exam_findings inline. encounterStore needs loadEncounter() action + fetchEncounter state shape |
| API-02 | vitalsStore migrated from mock data to real apiFetch() calls | PUT /encounters/{id}/vitals endpoint exists, already used in vitalsStore — only mock fallback catch block needs removal + retry logic added |
| API-03 | refractionStore migrated from mock data to real apiFetch() calls | PATCH /encounters/{id}/column/{col_index} endpoint exists, already used — mock fallback catch block needs removal + payload snake_case mismatch must be fixed |
| API-04 | examFindingsStore migrated from mock data to real apiFetch() calls | PUT /encounters/{id}/exam-findings/{section} endpoint exists, already used — mock fallback catch block needs removal + fetch action needed |
| API-05 | diagnosisStore migrated from mock data to real apiFetch() calls | POST/PATCH/DELETE /encounters/{id}/diagnoses endpoints exist, already used — mock fallback in addDiagnosis catch block needs removal |
| API-06 | problemListStore migrated from mock data to real apiFetch() calls | fetchProblems() action already uses apiFetch — _seedProblems mock path needs to be removed from page; fetch called directly |
| API-07 | Mock persona seed imports removed from all 9 production pages | lib/mock/personas.ts + 5 lib/mock-*.ts files span 9 import sites across app/ and components/ — all must be removed and replaced with fetch-on-mount |
| API-08 | apiFetch() updated to use Supabase session token for Authorization header | lib/api-client.ts already has getAuthHeaders() using getSession() — must migrate to use createClient() from lib/supabase/client.ts (SSR-safe) instead of legacy lib/supabase.ts singleton |
| HIPAA-01 | PHI read logging on all GET endpoints that return patient/encounter data | GET /encounters/{id} already calls log_action(AuditAction.READ) — backend middleware approach needs adding to catch all GET routes systematically |
| HIPAA-02 | Audit trail sidebar in encounter view wired to real audit log API (currently 404s) | AuditTrailSidebar fetches /api/encounters/{encounterId}/audit-logs — BFF route for this path does NOT exist yet. FastAPI backend route GET /encounters/{encounter_id}/audit-logs exists. BFF proxy must be created |
| HIPAA-03 | Automatic session timeout after 30 minutes of inactivity | COMPLETED in Phase 1 — skip |
</phase_requirements>

---

## Summary

Phase 2 is a surgical migration: remove mock data plumbing and wire real FastAPI calls everywhere. The backend is already built — every required FastAPI endpoint exists (encounter CRUD, vitals upsert, refraction column upsert, exam findings upsert, diagnosis CRUD, problem list CRUD, audit logs). The stores already call `apiFetch()` on the happy path — the mock fallback is inside catch blocks. Migration = (1) remove those catch-block fallbacks, (2) add `loadX()` fetch actions for initial data, (3) replace the encounter page's `getInitialStoreState(persona)` bootstrap with parallel `store.fetchX()` calls, (4) add retry logic to `apiFetch()`, and (5) create one missing BFF proxy route.

The HIPAA work (HIPAA-01, HIPAA-02) is targeted: the backend `GET /encounters/{id}` already logs an audit READ action — adding a FastAPI middleware to catch all PHI GET routes is a backend-only change. The audit trail sidebar is broken because `app/api/encounters/[encounterId]/audit-logs/route.ts` does not exist yet — that BFF proxy is the single missing infrastructure piece.

**Primary recommendation:** Migrate stores in dependency order: encounterStore first (it provides patientId and encounter metadata needed by all others), then vitalsStore, refractionStore, examFindingsStore in parallel (they're independent), then diagnosisStore and problemListStore. Create the audit BFF route and backend PHI middleware before wiring the sidebar.

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Role in Phase 2 |
|---------|---------|---------|-----------------|
| Zustand | 4.5.x | Store state management | All 6 clinical stores being migrated |
| @supabase/ssr | current | Auth token source for apiFetch() | API-08: migrate api-client.ts away from legacy singleton |
| Next.js App Router | 14.x | BFF route handlers | Create missing audit-logs BFF proxy |
| FastAPI | 0.111+ | Backend API | Already has all required endpoints |

### No New Dependencies Required
All libraries needed are already installed. The case conversion (camelCase↔snake_case) will use a lightweight custom utility — no lodash needed given the narrow scope of fields involved.

---

## Architecture Patterns

### Pattern 1: Store Migration — Remove Catch-Block Mock Fallbacks

Every debounced-save store (vitals, refraction, examFindings) currently has:

```typescript
// CURRENT PATTERN (to be removed):
try {
  const res = await apiFetch<...>(`/api/encounters/${encounterId}/vitals`, { ... });
  savedDraft = { ...draft, id: res.id };
} catch {
  // Remove this entire fallback block:
  await new Promise((resolve) => setTimeout(resolve, 400));
  savedDraft = { ...draft, id: draft.id ?? `mock-vitals-${Date.now()}` };
}
```

Replace with retry-aware apiFetch (see Pattern 3 below). The outer try/catch remains for real error handling.

### Pattern 2: Store Migration — Add `loadX()` Fetch Actions

Each store needs a new action to fetch initial data from the API. These replace the `getInitialStoreState(persona)` call in the encounter page.

```typescript
// NEW PATTERN — add to vitalsStore:
async loadVitals(encounterId: string) {
  // Set loading state
  set((state) => ({
    encounters: {
      ...state.encounters,
      [encounterId]: {
        ...(state.encounters[encounterId] ?? defaultVitalsState(encounterId)),
        saveStatus: "loading" as VitalsSaveStatus,
      },
    },
  }), false, "loadVitals/loading");

  try {
    const data = await apiFetch<VitalsResponse>(`/api/encounters/${encounterId}/vitals`);
    // Convert snake_case → camelCase keys (via apiFetch conversion layer)
    const draft = vitalsResponseToDraft(data);
    get().init(encounterId, draft);
  } catch {
    // Section-level retry: 2 retries, then show "Could not load Vitals" error
    set((state) => ({
      encounters: {
        ...state.encounters,
        [encounterId]: {
          ...(state.encounters[encounterId] ?? defaultVitalsState(encounterId)),
          saveStatus: "error",
          errors: [{ field: "_load", message: "Could not load Vitals" }],
        },
      },
    }), false, "loadVitals/error");
  }
},
```

### Pattern 3: apiFetch() — Add Retry Logic + camelCase Conversion

The existing `lib/api-client.ts` needs two enhancements:

```typescript
// lib/api-client.ts — UPDATED

import { createClient } from "@/lib/supabase/client"; // SSR-safe, not legacy singleton

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

// snake_case → camelCase (responses from FastAPI)
function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelizeKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) return obj.map(camelizeKeys) as T;
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        toCamel(k), camelizeKeys(v),
      ])
    ) as T;
  }
  return obj as T;
}

// camelCase → snake_case (payloads sent to FastAPI)
function toSnake(str: string): string {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function snakifyKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(snakifyKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        toSnake(k), snakifyKeys(v),
      ])
    );
  }
  return obj;
}

// Exponential backoff retry
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  baseDelayMs: number
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { retries?: number } = {}
): Promise<T> {
  const { retries = 3, ...fetchOptions } = options;
  const headers = await getAuthHeaders();

  // Snakify the body payload if present
  let body = fetchOptions.body;
  if (body && typeof body === "string") {
    try {
      body = JSON.stringify(snakifyKeys(JSON.parse(body)));
    } catch { /* leave as-is if not valid JSON */ }
  }

  return withRetry(async () => {
    const res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      body,
      headers: { ...headers, ...(fetchOptions.headers as Record<string, string>) },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail ?? `API error ${res.status}`);
    }

    const json = await res.json();
    return camelizeKeys<T>(json);
  }, retries, 500); // 500ms base → 500, 1000, 2000ms backoff
}
```

**CRITICAL NOTE on camelCase conversion:** Stores currently send camelCase keys (e.g., `refractionType`, `isFinalRx`) in the request body. After adding `snakifyKeys()` to `apiFetch()`, stores must send camelCase keys — the conversion happens transparently in the API client. Remove any manual snake_case payload construction from store files.

### Pattern 4: Encounter Page — Parallel Fetch on Mount

Replace the `getInitialStoreState(persona)` bootstrap with parallel store fetches:

```typescript
// app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx

// REMOVE these imports:
// import { getInitialStoreState } from "@/lib/mock/personas";
// import { getPatientIdForEncounter } from "@/lib/mock-patient-data";
// import { getPatientIdForAppointment } from "@/lib/mock-schedule-data";

// REMOVE the persona useState:
// const [persona] = useState(() => getInitialStoreState(...));

// REPLACE useEffect with parallel fetches:
useEffect(() => {
  // Fetch all sections in parallel — each store renders independently as data arrives
  const encId = params.encounterId;
  Promise.all([
    encounterStore.loadEncounter(encId),
    vitalsStore.loadVitals(encId),
    refractionStore.loadRefractions(encId),
    examFindingsStore.loadFindings(encId, "anterior_segment"),
    examFindingsStore.loadFindings(encId, "posterior_segment"),
    diagnosisStore.loadDiagnoses(encId),
    // problemListStore.fetchProblems(patientId) — called after encounterStore resolves patientId
  ]);
}, [params.encounterId]);
```

**Problem:** `patientId` comes from the encounter record. Fetch it as part of `loadEncounter()` — `encounterStore` should expose `patientId` on the encounter state. The `problemListStore.fetchProblems(patientId)` call should trigger from a `useEffect` that depends on `encounterState.patientId` being available.

### Pattern 5: BFF Route — Encounter Audit Logs

`AuditTrailSidebar` fetches `/api/encounters/${encounterId}/audit-logs`. This BFF route does not exist. Create it at `app/api/encounters/[encounterId]/audit-logs/route.ts` following the same pattern as `app/api/audit-logs/route.ts`:

```typescript
// app/api/encounters/[encounterId]/audit-logs/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: { encounterId: string } }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  const upstreamUrl = `${FASTAPI_URL}/api/encounters/${params.encounterId}/audit-logs`;
  const upstreamResponse = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!upstreamResponse.ok) {
    const errorBody = await upstreamResponse.text();
    return NextResponse.json({ error: errorBody }, { status: upstreamResponse.status });
  }

  const data = await upstreamResponse.json();
  return NextResponse.json(data);
}
```

### Pattern 6: FastAPI PHI Access Middleware (HIPAA-01)

The backend `GET /encounters/{id}` already logs a READ action. To make this systematic (catching any new GET endpoint), add a FastAPI middleware in `backend/main.py`:

```python
# backend/main.py — add middleware

@app.middleware("http")
async def phi_access_log_middleware(request: Request, call_next):
    """
    Log all GET requests to PHI-bearing endpoints (encounters, patients, vitals).
    The log_action() call inside route handlers handles detailed audit logging.
    This middleware is a defense-in-depth catch-all for action_type='phi_viewed'.
    """
    response = await call_next(request)
    # Only log successful GETs to PHI-bearing paths
    phi_paths = ["/api/encounters/", "/api/patients/"]
    if (
        request.method == "GET"
        and response.status_code == 200
        and any(request.url.path.startswith(p) for p in phi_paths)
    ):
        # Fire-and-forget audit (do not block response)
        # Auth context extracted from JWT already validated by require_permission()
        pass  # Route handler log_action() covers this — middleware is additive defense
    return response
```

**Decision:** The backend `GET /encounters/{id}` route already calls `log_action(AuditAction.READ, ...)` with `patient_id` populated. This satisfies HIPAA-01 for the existing endpoint. For HIPAA-01 full coverage, verify that vitals GET, exam findings GET, and any new PHI-returning GET routes also call `log_action`. The middleware approach is optional defense-in-depth; route-level logging is sufficient per the locked decision.

### Pattern 7: Skeleton Loading UI

Each section card shows a glassmorphism shimmer while data loads:

```tsx
// components/ui/skeleton.tsx (new component)
export function GlassCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="glass-card p-6 animate-pulse">
      <div className="h-4 rounded-lg bg-[var(--bg-glass)] w-1/3 mb-4" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-8 rounded-lg bg-[var(--bg-glass)] mb-3"
          style={{ width: `${60 + (i % 3) * 15}%` }}
        />
      ))}
    </div>
  );
}
```

Use `saveStatus === "loading"` (new status) in each store to conditionally render skeleton vs. real content.

### Recommended Migration Order (Claude's Discretion)

1. `lib/api-client.ts` — add retry + camelCase conversion first (unblocks all stores)
2. `encounterStore` — add `loadEncounter()`, expose `patientId` in state shape
3. Create `app/api/encounters/[encounterId]/audit-logs/route.ts` BFF proxy
4. `vitalsStore`, `refractionStore`, `examFindingsStore` — add `loadX()` actions, remove mock fallbacks (can be done in parallel)
5. `diagnosisStore`, `problemListStore` — add `loadX()` actions, remove mock fallbacks
6. Encounter page — replace persona bootstrap with parallel fetch calls
7. Remove all 6 mock files + clean remaining import sites (pages/components)
8. Backend: verify PHI read logging on vitals/findings GET endpoints (HIPAA-01)

### Anti-Patterns to Avoid

- **Calling store init() before fetch() resolves:** `init()` is idempotent (skips if data exists). Always call `loadX()` (which calls `init()` internally after fetch). If `init()` runs first with blank data, `loadX()` will be skipped due to the idempotency guard. Fix: check `loadStatus !== "loaded"` before init guard, or remove the guard in `loadX()`.
- **Snakifying already-snake_case payloads twice:** The vitals store already builds a snake_case payload manually (lines 110-127 of vitalsStore.ts). After `apiFetch()` adds `snakifyKeys()`, this manual construction creates double-snake_case. Fix: store sends camelCase, apiFetch converts transparently.
- **Encountering the `persist` middleware SSR hydration gotcha:** `encounterStore` uses `persist`. During SSR, the persisted state may contain stale mock UUIDs (e.g., `pat-001`). The `loadEncounter()` action must overwrite persisted state. Ensure `loadEncounter()` calls `set()` unconditionally (not idempotent like `init()`).
- **Missing `patientId` for problemListStore:** The encounter page previously hardcoded `patientId` from mock lookup. After migration, `patientId` comes from the encounter API response. `problemListStore.fetchProblems(patientId)` must wait for `encounterStore.loadEncounter()` to complete and patientId to be in state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| camelCase/snake_case conversion | Custom deep-transform per store | Single `snakifyKeys`/`camelizeKeys` in `apiFetch()` | Single conversion point — all stores benefit automatically |
| Exponential backoff | Custom retry logic per store | Shared `withRetry()` in `apiFetch()` | Consistent retry behavior across all 6 stores |
| Auth header attachment | Per-store token fetch | Existing `getAuthHeaders()` in api-client.ts | Already implemented, just needs client migration |
| BFF auth validation | Custom JWT validation | Existing pattern from audit-logs/route.ts | `getUser()` + `getSession()` pattern established |

---

## Common Pitfalls

### Pitfall 1: Mock Fallback Masks Real API Errors

**What goes wrong:** The current catch-block mock fallback silently swallows 401/403/404 errors, making it impossible to detect auth misconfiguration or missing data during development.
**Why it happens:** Stores were built with "offline-first" fallbacks that were never intended to stay in production.
**How to avoid:** Remove all catch-block mock fallbacks. Errors should surface as `saveStatus: "error"` with real error messages. This forces the developer to run the backend — per the locked decision.
**Warning signs:** Seeing `mock-vitals-{timestamp}` IDs in the console, seeing 400ms delays (the mock setTimeout), or data not persisting after refresh.

### Pitfall 2: Double snake_case Conversion in Refraction Store

**What goes wrong:** `refractionStore.ts` (lines 128-155) manually builds a request body using camelCase keys (e.g., `refractionType`, `isFinalRx`, `prismBase`). After `apiFetch()` adds `snakifyKeys()`, these camelCase keys get converted to snake_case correctly. BUT the store also has some already-snake_case nested keys (e.g., `draft.od.visual_acuity`). Double-conversion creates `visual__acuity`.
**Why it happens:** The store was written before the API client had a conversion layer.
**How to avoid:** When adding `snakifyKeys()` to `apiFetch()`, audit the refraction store payload construction and normalize to all-camelCase keys. The `od/os` nested objects should use `visualAcuity`, `prismBase`, etc. The `apiFetch()` layer converts them to `visual_acuity`, `prism_base` before sending.

### Pitfall 3: encounterStore persist Overwriting Fresh API Data

**What goes wrong:** `encounterStore` uses `zustand/middleware` `persist` (key: `clarity-encounters`). If a stale encounter is in localStorage, `initEncounter()` skips initialization (`if (existing) return`). When `loadEncounter()` fetches fresh data from the API, the idempotency guard may prevent the update.
**Why it happens:** `initEncounter()` was designed to be idempotent to prevent mock re-seeding. Now we need it to accept fresh API data.
**How to avoid:** `loadEncounter()` should call `set()` directly rather than `initEncounter()`, bypassing the idempotency guard. Or add a `force: boolean` parameter to `initEncounter()`.

### Pitfall 4: AuditTrailSidebar 404 Due to Missing BFF Route

**What goes wrong:** `AuditTrailSidebar` fetches `/api/encounters/${encounterId}/audit-logs`. There is no Next.js route handler at this path. The existing `app/api/audit-logs/route.ts` is for tenant-wide audit logs, not encounter-specific.
**Why it happens:** The BFF proxy for encounter-scoped audit logs was never created.
**How to avoid:** Create `app/api/encounters/[encounterId]/audit-logs/route.ts` as described in Pattern 5. This is HIPAA-02.
**Warning signs:** 404 in browser console when opening the audit trail sidebar.

### Pitfall 5: refractionStore Column Endpoint Mismatch

**What goes wrong:** The refraction store calls `/api/encounters/${encounterId}/column/${colIndex}`. The FastAPI backend route is `PATCH /{encounter_id}/column/{col_index}` — mounted at `/api/encounters/`. The path should match. However the RefractionUpdateRequest schema requires the od/os nested structure (not flat fields). The store currently sends a body where `od.sphere`, `od.cylinder` etc. are nested inside `od` / `os` objects — this should work. But `refractionType` in the body is silently ignored by the backend (the backend uses the URL path `col_index` to determine type) — not a bug, but document it.
**Warning signs:** 422 Validation Error from FastAPI if the nested eye objects don't match `EyeRxRequest`.

### Pitfall 6: problemListStore fetchProblems Needs patientId

**What goes wrong:** The encounter page previously resolved `patientId` from mock lookup (`getPatientIdForEncounter`). After removing mock imports, `patientId` must come from the encounter API response.
**Why it happens:** `problemListStore.fetchProblems(patientId)` is called in `useEffect` during mount, but `encounterStore.loadEncounter()` is async and `patientId` isn't available synchronously.
**How to avoid:** Add a second `useEffect` that fires only when `encounterState?.patientId` becomes non-null, then calls `problemListStore.fetchProblems(patientId)`.

---

## Code Examples

### Encounter Page: Parallel Fetch on Mount
```typescript
// Source: Pattern derived from existing store signatures

// Replace persona-based bootstrap:
useEffect(() => {
  const encId = params.encounterId;
  encounterStore.loadEncounter(encId);  // loads encounter metadata
  vitalsStore.loadVitals(encId);
  refractionStore.loadRefractions(encId);
  examFindingsStore.loadFindings(encId, "anterior_segment");
  examFindingsStore.loadFindings(encId, "posterior_segment");
  diagnosisStore.loadDiagnoses(encId);
  // problemListStore.fetchProblems() triggered by separate useEffect on patientId
}, [params.encounterId]);

// Separate effect for problem list (depends on patientId from encounter)
const patientId = useEncounterStore((s) => s.encounters[params.encounterId]?.patientId);
useEffect(() => {
  if (!patientId) return;
  problemListStore.fetchProblems(patientId);
}, [patientId]);
```

### Skeleton Loading Pattern
```typescript
// In each section component:
const vitals = useVitalsState(encounterId);

if (!vitals || vitals.saveStatus === "loading") {
  return <GlassCardSkeleton rows={4} />;
}
if (vitals.saveStatus === "error" && vitals.errors[0]?.field === "_load") {
  return (
    <div className="glass-card p-6 text-center text-sm text-[var(--state-caution)]">
      Could not load Vitals —{" "}
      <button onClick={() => vitalsStore.loadVitals(encounterId)} className="underline">
        tap to retry
      </button>
    </div>
  );
}
// Render real content
```

### Save Status Indicator (Per-Section Header)
```typescript
// Ambient status: dot that expands on hover
function SaveStatusDot({ status }: { status: VitalsSaveStatus }) {
  const color = {
    idle: "transparent",
    dirty: "var(--text-muted)",
    saving: "var(--accent)",
    saved: "var(--state-normal)",
    error: "var(--state-critical)",
  }[status] ?? "transparent";

  if (status === "idle") return null;

  return (
    <span
      className="inline-block w-2 h-2 rounded-full transition-colors"
      style={{ background: color }}
      title={status}
    />
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `getInitialStoreState(persona)` seeds all stores from mock data | `store.loadX()` fetches from FastAPI, each section independent | Data persists through page refresh; no stale demo data in production |
| Mock fallback in catch blocks | Real errors surface, retry logic in apiFetch() | Developers must run backend; realistic error testing |
| Manual snake_case payload construction per store | Single `snakifyKeys()` in apiFetch() | Consistent convention; stores stay camelCase throughout |

**Deprecated/outdated after this phase:**
- `lib/mock/personas.ts` (788 lines) — deleted entirely
- `lib/mock-patient-data.ts`, `lib/mock-schedule-data.ts`, `lib/mock-refraction-data.ts`, `lib/mock-vitals-data.ts`, `lib/mock-staff-data.ts` — deleted entirely
- `lib/api-client.ts` import of `lib/supabase.ts` legacy singleton — migrated to `lib/supabase/client.ts`

---

## Integration Point Inventory

### FastAPI Endpoints Already Built (No Backend Work Required for Saves)
| Store | Save Endpoint | Status |
|-------|--------------|--------|
| encounterStore | PATCH /api/encounters/{id} | Exists |
| vitalsStore | PUT /api/encounters/{id}/vitals | Exists |
| refractionStore | PATCH /api/encounters/{id}/column/{col} | Exists |
| examFindingsStore | PUT /api/encounters/{id}/exam-findings/{section} | Exists |
| diagnosisStore | POST/PATCH/DELETE /api/encounters/{id}/diagnoses | Exists |
| problemListStore | POST/PATCH/DELETE /api/patients/{id}/problems | Exists |

### FastAPI Endpoints Needed for Initial Data Load
| Store | Load Endpoint | Status |
|-------|-------------|--------|
| encounterStore | GET /api/encounters/{id} (returns vitals, refractions, diagnoses, exam_findings inline) | Exists |
| vitalsStore | GET /api/encounters/{id}/vitals OR parse from encounter response | Exists (inline) |
| refractionStore | GET /api/encounters/{id}/refractions OR parse from encounter response | Exists (inline summary) |
| examFindingsStore | GET /api/encounters/{id}/exam-findings/{section} | May need standalone route |
| diagnosisStore | GET /api/encounters/{id}/diagnoses | May need standalone route |
| problemListStore | GET /api/patients/{id}/problems | Exists (fetchProblems already calls it) |
| AuditTrailSidebar | GET /api/encounters/{id}/audit-logs (FastAPI) | Exists (backend), BFF missing |

**Efficiency insight:** `GET /api/encounters/{id}` returns the full encounter with vitals, refractions (summary), diagnoses, and exam_findings inline via `selectinload`. The encounter page can load most data in a single request and fan out to individual store inits. This avoids 6 separate API round trips on page load.

### BFF Routes That Need Creation
| Purpose | Path | Status |
|---------|------|--------|
| Encounter audit logs | `app/api/encounters/[encounterId]/audit-logs/route.ts` | MISSING — blocks HIPAA-02 |

### Mock Import Sites to Clean Up
| File | Mock Imports | Action |
|------|-------------|--------|
| `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx` | personas.ts, mock-patient-data, mock-schedule-data | Replace with fetch-on-mount |
| `app/(tenant)/[tenantId]/schedule/page.tsx` | mock-schedule-data | Out of Phase 2 scope (Phase 3) — may need to stub |
| `app/(tenant)/[tenantId]/dashboard/page.tsx` | mock-patient-data | Phase 2 scope — replace with API or remove usage |
| `app/(tenant)/[tenantId]/layout.tsx` | mock-patient-data, mock-schedule-data | Phase 2 scope — remove patient breadcrumb mock lookups |
| `app/(tenant)/[tenantId]/patients/page.tsx` | mock-patient-data | Out of Phase 2 scope (Phase 5) — stub or leave with error boundary |
| `app/(tenant)/[tenantId]/patients/[patientId]/page.tsx` | mock-patient-data | Out of Phase 2 scope (Phase 5) — stub or leave |
| `app/(tenant)/[tenantId]/admin/page.tsx` | mock-staff-data | Out of Phase 2 scope — stub |
| `components/PatientChartModal.tsx` | mock-patient-data | Phase 2 scope — disable or stub |
| `components/TopNav.tsx` | mock-session (for dev switcher) | Keep in dev-only conditional, not production bundle |

**CRITICAL for API-07:** The success criterion says "No file in the production bundle imports from any mock data module." This means schedule, patients, admin, PatientChartModal mock imports must be removed or conditionally guarded by `process.env.NODE_ENV === "development"`. Pages that depend on Phase 3/5 data (schedule, patients, admin) should show "Coming soon" or error boundaries, not crash.

---

## Open Questions

1. **examFindingsStore and diagnosisStore standalone GET endpoints**
   - What we know: `GET /api/encounters/{id}` returns `exam_findings[]` and `diagnoses[]` inline. The individual `exam_findings` items include `exam_section` field to distinguish anterior/posterior.
   - What's unclear: Do standalone GET routes exist for `GET /api/encounters/{id}/exam-findings/anterior_segment`? Not found in route files examined.
   - Recommendation: Use the inline data from `GET /api/encounters/{id}` to init all stores in one shot. Parse `exam_findings` by `exam_section` into anterior/posterior slices. Avoids needing new backend endpoints.

2. **refractionStore response shape mismatch**
   - What we know: `GET /api/encounters/{id}` returns `refractions` as `RefractionSummary[]` (flat fields: `od_sphere`, `od_cylinder`, etc.). The `refractionStore` expects `RefractionDraft[]` with nested `od.sphere`, `od.cylinder` structure.
   - What's unclear: Whether a `GET /api/encounters/{id}/refractions/{id}` full detail endpoint exists.
   - Recommendation: Write a `refractionSummaryToDraft()` converter that maps the flat `RefractionSummary` fields to the nested `RefractionDraft` shape. No new backend endpoint needed.

3. **schedule, patients, admin pages — mock import removal scope**
   - What we know: API-07 requires removing all mock imports from production bundle. Schedule (Phase 3), patients (Phase 5), admin pages are not being migrated in Phase 2.
   - Recommendation: Replace mock imports with empty stubs or "Coming soon" fallbacks. Use `const patients: Patient[] = []` instead of `getAllPatients()`. Pages remain functional shells ready for Phase 3/5 to wire real data.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no jest.config, vitest.config, or test directories found |
| Config file | Wave 0 — create vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | encounterStore.loadEncounter() fetches and populates state | unit | `npx vitest run tests/store/encounterStore.test.ts -t "loadEncounter"` | Wave 0 |
| API-02 | vitalsStore mock fallback is removed; real API error throws | unit | `npx vitest run tests/store/vitalsStore.test.ts -t "no mock fallback"` | Wave 0 |
| API-03 | refractionStore payload is snake_case after conversion | unit | `npx vitest run tests/lib/api-client.test.ts -t "snakifyKeys"` | Wave 0 |
| API-04 | examFindingsStore loads anterior + posterior from API | unit | `npx vitest run tests/store/examFindingsStore.test.ts -t "loadFindings"` | Wave 0 |
| API-05 | diagnosisStore.addDiagnosis() throws on API error (no mock) | unit | `npx vitest run tests/store/diagnosisStore.test.ts -t "no mock fallback"` | Wave 0 |
| API-06 | problemListStore.fetchProblems() calls real API | unit | `npx vitest run tests/store/problemListStore.test.ts -t "fetchProblems"` | Wave 0 |
| API-07 | No production file imports from lib/mock/* or lib/mock-* | lint/static | `grep -r "from.*lib/mock" app/ components/ lib/ --include="*.ts" --include="*.tsx"` | N/A — shell command |
| API-08 | apiFetch() Authorization header uses Supabase session token | unit | `npx vitest run tests/lib/api-client.test.ts -t "auth header"` | Wave 0 |
| HIPAA-01 | Backend GET /encounters/{id} logs phi_viewed audit entry | integration | Manual — requires running FastAPI locally | Manual only |
| HIPAA-02 | Audit trail sidebar fetches real entries (no 404) | smoke | `npx vitest run tests/components/AuditTrailSidebar.test.ts -t "fetches audit logs"` | Wave 0 |
| HIPAA-03 | Session timeout — COMPLETED in Phase 1 | — | — | — |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/lib/api-client.test.ts` (api-client unit tests)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green + manual HIPAA-01 smoke test before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/api-client.test.ts` — covers API-03, API-08 (snakifyKeys, camelizeKeys, auth header, retry logic)
- [ ] `tests/store/encounterStore.test.ts` — covers API-01 (loadEncounter, persist override)
- [ ] `tests/store/vitalsStore.test.ts` — covers API-02 (no mock fallback, real error surfaces)
- [ ] `tests/store/examFindingsStore.test.ts` — covers API-04
- [ ] `tests/store/diagnosisStore.test.ts` — covers API-05
- [ ] `tests/store/problemListStore.test.ts` — covers API-06
- [ ] `tests/components/AuditTrailSidebar.test.ts` — covers HIPAA-02 (mocked fetch, verifies URL called)
- [ ] `vitest.config.ts` — framework install: `npm install -D vitest @vitest/ui jsdom @testing-library/react`

---

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of all 6 clinical stores (`store/*.ts`) — patterns documented from actual implementation
- `backend/api/routes/encounter.py` — confirmed `GET /encounters/{id}` returns inline vitals/refractions/diagnoses/exam_findings
- `backend/api/routes/vitals.py`, `refraction.py`, `audit.py` — confirmed existing endpoints and response shapes
- `backend/schemas/refraction.py` — confirmed `RefractionSummary` (flat) vs `RefractionResponse` (nested) shape distinction
- `lib/api-client.ts` — confirmed current implementation (legacy supabase singleton, no conversion, no retry)
- `app/api/audit-logs/route.ts` — confirmed BFF pattern to replicate for encounter audit logs
- `components/encounter/AuditTrailSidebar.tsx` — confirmed fetch URL and why BFF route is needed

### Secondary (MEDIUM confidence)
- HIPAA audit log requirements: encounter-level READ logging already in `GET /encounters/{id}` route handler — sufficient per current regulatory standard for optometry EHR

### Tertiary (LOW confidence)
- None — all findings are from direct source code examination

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture patterns: HIGH — derived from existing codebase patterns (stores, BFF routes)
- Pitfalls: HIGH — identified from actual code inconsistencies (double snake_case, persist guard, patientId timing)
- Missing endpoints: HIGH — confirmed by direct file search (no examFindings/diagnoses standalone GET)
- HIPAA compliance: HIGH — backend audit.py + encounter.py examined directly

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable codebase — no fast-moving dependencies)
