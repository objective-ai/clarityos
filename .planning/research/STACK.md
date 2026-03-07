# Technology Stack — Production Readiness Additions

**Project:** ClarityOS EHR
**Milestone:** Real auth, API integration, FHIR R4 export, real-time scheduling
**Researched:** 2026-03-05
**Scope:** Additive only — Next.js 14, Tailwind 3.4, shadcn/ui, Zustand, FastAPI, SQLAlchemy 2.0 are locked.

---

## 1. Supabase Auth — Next.js App Router Integration

The existing codebase already has `@supabase/supabase-js` v2.98.0 and a stub `lib/supabase.ts`. What is missing is the SSR layer and the Next.js middleware that enforces session on the server side.

### Required Packages

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@supabase/ssr` | 0.9.0 (March 2026) | SSR-aware Supabase clients for App Router | Replaces the deprecated `@supabase/auth-helpers-nextjs`. Official package for cookie-based sessions in Next.js Server Components and middleware. |
| `@supabase/supabase-js` | 2.98.0 (already installed) | Supabase browser client | Already present. No upgrade needed. |

**Confidence: HIGH** — Verified against official Supabase docs and `@supabase/ssr` GitHub releases (v0.9.0, released 2026-03-02).

### What NOT to Use

- `@supabase/auth-helpers-nextjs` — Deprecated. Supabase formally consolidated all framework helpers into `@supabase/ssr`. Do not add this package.
- `next-auth` (Auth.js) — Unnecessary complexity. Supabase Auth is already the chosen provider and the JWT verification layer in `app/core/security.py` is already written. Adding Auth.js would create a second auth abstraction that conflicts.
- Custom JWT cookie logic — `@supabase/ssr` handles token refresh and cookie propagation correctly within the App Router constraints. Rolling a custom solution introduces the same security bugs that already exist in the dev bypass.

### Implementation Pattern

Three files must be created or modified:

**`middleware.ts` (new file, project root)**

The middleware runs on every request. It must call `supabase.auth.getUser()` (not `getSession()`) to revalidate the token server-side. It reads the session cookie, refreshes the token if expired, and writes the updated token back to both the request (for Server Components) and response (for the browser).

Route protection logic belongs here: redirect unauthenticated users to `/login`, redirect authenticated users away from `/login`.

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // IMPORTANT: Use getUser(), not getSession() — getSession() does not
  // revalidate against the Supabase Auth server.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

**`lib/supabase/server.ts` (new file)**

Server-side client for Server Components, Server Actions, and Route Handlers. Uses `cookies()` from `next/headers`.

**`lib/supabase/client.ts` (replaces current `lib/supabase.ts`)**

Browser-only client. Continues to use `createBrowserClient` from `@supabase/ssr`. Existing `lib/api-client.ts` pattern (attaching `session.access_token` as Bearer) remains unchanged.

### The Dev Bypass Problem

`store/sessionStore.ts` and `app/core/security.py` both have hardcoded dev bypass paths that must be removed before enabling real auth. The middleware will handle session enforcement; the hardcoded `TenantContext` fallback in `security.py` must be gated behind an explicit `APP_ENV=development` flag, not the absence of `SUPABASE_JWT_SECRET`.

---

## 2. FastAPI Backend Hosting

The backend needs a persistent Python ASGI host. Vercel serverless cannot run FastAPI (Python processes require persistent connections for async database pools, WebSocket channels, and long-running AI scribe streams).

### Recommendation: Render

| Criterion | Render | Railway | Fly.io |
|-----------|--------|---------|--------|
| HIPAA BAA | Yes — Organization plan + 20% surcharge, $250/mo min | Yes — Enterprise only, $1,000/mo min | No public HIPAA BAA |
| FastAPI/ASGI | Native Uvicorn support via start command | Native, but recommends Hypercorn | Native via Dockerfile |
| Deployment method | Git push or Dockerfile | Git push or Dockerfile | Dockerfile + `flyctl` CLI |
| DX for this stack | Simple `render.yaml`, Web Service type, zero config | Simple but Railway-specific config syntax | Most complex; requires Fly machine concepts |
| Managed Postgres | Yes (not needed here — Supabase Postgres used) | Yes | Yes |
| Cold starts | No cold starts on paid tiers | No cold starts | No cold starts |
| Free tier | Yes (cold starts; 512MB RAM) | $5/mo hobby | Shared VMs available |
| Pricing model | Flat instance pricing | Per-second compute billing | Per-machine pricing |

**Use Render.** Rationale:

1. HIPAA BAA is available at the Organization plan tier ($250/mo minimum + 20% surcharge). Railway requires Enterprise at $1,000/mo minimum. For a pre-revenue SaaS EHR handling ePHI, a BAA path with a lower entry cost is important.
2. Render's start command model is the simplest fit for this `uvicorn app.main:app --workers 4` pattern. No Dockerfile required, though adding one for reproducibility is recommended.
3. The codebase audit identified that the Python backend lives in `app/` — the same directory as Next.js App Router pages. Render hosting requires moving the FastAPI root to a dedicated directory (e.g., `backend/`). This migration is required regardless of hosting choice.

**Confidence: MEDIUM** — Platform pricing and HIPAA tiers verified via official Render docs (render.com/docs/hipaa-compliance). Railway HIPAA pricing verified via Railway pricing page. Fly.io HIPAA BAA absence based on search at time of research; verify directly before finalizing.

### Production Start Command

```bash
uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port $PORT \
  --workers 4 \
  --loop uvloop \
  --http httptools
```

`uvicorn[standard]` is already installed (v0.41.0), which includes `uvloop` and `httptools`.

### What NOT to Do

- Do not use Vercel Serverless Functions for FastAPI. The Python runtime on Vercel has a 10s execution limit, no persistent connection pools, and no WebSocket support — all of which break the AI Scribe SSE stream.
- Do not use Gunicorn as the process manager for async FastAPI. Gunicorn with Uvicorn workers is a legacy pattern; running Uvicorn directly with `--workers` is the current recommendation for containerized deployments.
- Do not leave the Python backend co-located in `app/` with the Next.js App Router. The namespace conflict will cause build failures on Vercel when Next.js tries to process Python files as route handlers.

---

## 3. FHIR R4 Export — Python Library

The requirement is export-only (not a full FHIR server): generate Patient, Encounter, Condition, and Observation bundles from existing SQLAlchemy model data and return them as FHIR R4B-compliant JSON.

### Recommendation: `fhir.resources` (R4B sub-package)

| Package | Version | FHIR Support | Pydantic | Network Client | Verdict |
|---------|---------|-------------|---------|----------------|---------|
| `fhir.resources` | 8.2.0 (Feb 2026) | R5 default, R4B as sub-package | V2 required | None | **Use this** |
| `fhirpy` | latest | R4/R5 | No V2 requirement | Yes (async) | Not needed |
| `fhirclient` (SMART) | — | R4 | No | Yes | Not needed |
| `google/fhir-py` | — | R4/R5 + BigQuery | — | Partial | Overkill |

**Use `fhir.resources[r4b]`**. Rationale:

1. Pydantic V2 — the project already uses `pydantic>=2.0` for request/response schemas. `fhir.resources` 8.x uses the same V2 model layer, meaning FHIR resource objects behave identically to existing Pydantic schemas. No new serialization patterns needed.
2. Export-only fit — no network client is needed. The library provides resource construction and `model_dump_json()` serialization. A FastAPI endpoint converts SQLAlchemy model data to FHIR objects and returns the JSON directly.
3. Actively maintained — version 8.2.0 released February 2, 2026. The project is current.
4. R4B vs R4 distinction: FHIR R4B (4.3.0) is the sub-package. Regulatorily R4 and R4B are compatible for the resources in scope (Patient, Encounter, Condition, Observation). Import path is `from fhir.resources.r4b.patient import Patient`.

**Confidence: HIGH** — Version and Pydantic requirement verified via PyPI (pypi.org/project/fhir.resources/).

### Installation

```bash
pip install "fhir.resources[r4b]"
```

### Resource Mapping (ClarityOS → FHIR R4B)

| ClarityOS Model | FHIR R4B Resource | Key Fields |
|-----------------|-------------------|-----------|
| `Patient` | `Patient` | name, birthDate, gender, identifier (MRN) |
| `Encounter` | `Encounter` | status, class (ambulatory), period, subject, participant |
| `Diagnosis` (laterality + ICD-10) | `Condition` | code (ICD-10), bodySite (laterality), subject, encounter |
| `Refraction` / `Vitals` | `Observation` | code (LOINC), valueQuantity, subject, encounter |

### Example Export Pattern

```python
from fhir.resources.r4b.patient import Patient
from fhir.resources.r4b.bundle import Bundle, BundleEntry

def build_patient_resource(db_patient) -> Patient:
    return Patient(
        id=str(db_patient.id),
        name=[{"family": db_patient.last_name, "given": [db_patient.first_name]}],
        birthDate=db_patient.date_of_birth.isoformat(),
        gender=db_patient.gender,
    )

def build_fhir_bundle(patient, encounters) -> str:
    entries = [BundleEntry(resource=build_patient_resource(patient))]
    # ... add encounter, condition, observation entries
    bundle = Bundle(type="document", entry=entries)
    return bundle.model_dump_json()
```

The FastAPI route then returns `Response(content=bundle_json, media_type="application/fhir+json")`.

### What NOT to Use

- `fhirpy` — provides a network client for connecting to external FHIR servers. This project does not consume a FHIR server; it generates FHIR output from its own database. `fhirpy` adds unnecessary dependency weight.
- Rolling a custom FHIR JSON builder — FHIR resource validation rules are non-trivial (required fields, cardinality constraints, terminology bindings). `fhir.resources` enforces these via Pydantic, catching malformed resources at construction time rather than at the receiving EHR.

---

## 4. Real-Time Appointment Scheduling

The existing `schedule/page.tsx` renders glass timeline cards from mock data. Real-time scheduling requires: (a) a calendar UI component, (b) real-time slot updates across concurrent users, and (c) double-booking prevention.

### Calendar UI: `react-big-calendar`

| Package | Version | Why |
|---------|---------|-----|
| `react-big-calendar` | 1.19.4 | Free, MIT, Google Calendar-style week/day/month views. Existing codebase uses glassmorphism CSS overrides on shadcn components; react-big-calendar exposes full class override via `className` props, making it compatible with the design system. No paid tier required. |
| `@types/react-big-calendar` | 1.16.3 | TypeScript definitions via DefinitelyTyped. |
| `date-fns` | 3.x | Required localizer for react-big-calendar. Date-fns v3 tree-shakes well and is TypeScript-native. |

**Confidence: MEDIUM** — Version verified via npm search results (1.19.4, published ~August 2025). FullCalendar was the alternative considered.

**Why not FullCalendar:** FullCalendar's resource scheduling (multi-provider, multi-room) requires the premium `@fullcalendar/resource-timeline` package at $599+/year per project. ClarityOS targets 1-4 provider practices where react-big-calendar's built-in multi-resource extensions are sufficient and free.

### Real-Time Updates: Supabase Realtime (already provisioned)

Supabase Realtime is already provisioned as part of the Supabase project. No new package is needed. The `@supabase/supabase-js` client already includes the Realtime SDK.

Pattern: Subscribe to `appointments` table Postgres Changes in the schedule page. When any insert/update arrives, refetch the affected time window rather than maintaining a full in-memory event list.

```typescript
// In schedule page useEffect
const channel = supabase
  .channel("appointments")
  .on(
    "postgres_changes",
    { event: "*", schema: "clinic_sunview", table: "appointments" },
    (payload) => { refetchSlots(); }
  )
  .subscribe();

return () => supabase.removeChannel(channel);
```

**Confidence: HIGH** — Supabase Realtime Postgres Changes is a core, well-documented feature of the already-provisioned Supabase project.

### Double-Booking Prevention: PostgreSQL Advisory Locks + Constraint

Do not implement optimistic UI double-booking prevention alone. The correct pattern is a database-level unique constraint with application-level conflict handling:

```sql
-- In tenant schema migration
CREATE UNIQUE INDEX appointments_provider_slot_unique
  ON appointments (provider_id, appointment_date, start_time)
  WHERE is_deleted = false;
```

On conflict, the FastAPI endpoint catches `asyncpg.UniqueViolationError` and returns HTTP 409 with a conflict message. The frontend shows an error state and re-fetches current availability. This is simpler and more reliable than PostgreSQL advisory locks for this use case.

**Confidence: HIGH** — Standard PostgreSQL pattern, no external library required.

### What NOT to Use

- Supabase Realtime Broadcast for scheduling state — Broadcast is ephemeral (no persistence). If a client disconnects during a booking, the update is lost. Use Postgres Changes instead, which are WAL-backed and replay-safe.
- WebSocket connections direct to FastAPI for calendar updates — Adds infrastructure complexity. Supabase Realtime already provides the WebSocket layer through the existing client. A second WebSocket connection to FastAPI is redundant.

---

## 5. API Client Pattern — Mock to Real Migration

This is not a new library decision but a pattern decision that affects every store. The existing `lib/api-client.ts` authenticated fetch wrapper is correctly structured. The migration path is store-by-store replacement of mock imports.

### Pattern: SWR for Server Data

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `swr` | 2.x | Data fetching + cache for React | Replaces direct `useEffect` + `fetch` in components. Works with the existing `apiFetch()` wrapper. Provides stale-while-revalidate, mutation, and optimistic updates — all needed for clinical data that multiple staff can change. |

**Alternative considered:** React Query (TanStack Query v5). TanStack Query is more powerful but adds ~47KB. SWR is ~8KB and covers the needed patterns: fetching patient data, revalidating on focus, and mutating encounter stores. Choose TanStack Query only if the analytics dashboard phase needs complex dependent query chains.

**Confidence: MEDIUM** — Standard React data-fetching choice; SWR vs TanStack Query tradeoff is well-understood. Version from npm not independently verified in this research session; use `npm info swr` to confirm latest before installing.

---

## Installation Summary

### Frontend additions

```bash
npm install @supabase/ssr react-big-calendar date-fns swr
npm install -D @types/react-big-calendar
```

### Backend additions

```bash
pip install "fhir.resources[r4b]"
```

No other backend packages are needed. `fhir.resources` 8.2.0 requires Pydantic V2, which is already installed. `httpx` is already installed for any outbound HTTP needs.

---

## Alternatives Considered and Rejected

| Category | Recommended | Rejected | Reason |
|----------|-------------|----------|--------|
| Auth SSR helper | `@supabase/ssr` | `@supabase/auth-helpers-nextjs` | Deprecated |
| Auth provider | Supabase Auth (already decided) | Auth.js / NextAuth | Redundant abstraction over existing Supabase JWT layer |
| Backend host | Render | Railway | Railway HIPAA BAA requires $1,000/mo Enterprise; Render starts at $250/mo |
| Backend host | Render | Fly.io | Fly.io has no public HIPAA BAA as of March 2026 |
| Backend host | Render | Vercel Functions | Python async, SSE streams, and connection pools incompatible with serverless |
| FHIR library | `fhir.resources` | `fhirpy` | `fhirpy` is a FHIR client (consumes FHIR servers); not needed for export-only |
| FHIR library | `fhir.resources` | Custom builder | FHIR validation rules are complex; Pydantic-backed library catches errors at build time |
| Calendar UI | `react-big-calendar` | FullCalendar | FullCalendar resource scheduling requires $599+/yr paid plugins |
| Data fetching | `swr` | TanStack Query v5 | TanStack Query is heavier; SWR covers needed patterns at lower bundle cost |
| Real-time | Supabase Realtime (existing) | FastAPI WebSockets | Redundant channel; Supabase Realtime already provisioned |

---

## Sources

- Supabase SSR package: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase SSR GitHub releases (v0.9.0): https://github.com/supabase/ssr/releases
- Supabase middleware security guidance (getUser vs getSession): https://supabase.com/docs/guides/auth/server-side/creating-a-client
- fhir.resources PyPI (v8.2.0, Feb 2026): https://pypi.org/project/fhir.resources/
- fhir.resources GitHub: https://github.com/nazrulworld/fhir.resources
- Render HIPAA compliance docs: https://render.com/docs/hipaa-compliance
- Render HIPAA blog post: https://render.com/blog/introducing-hipaa-enabled-workspaces
- Railway HIPAA pricing: https://railway.com/pricing
- Railway FastAPI guide: https://docs.railway.com/guides/fastapi
- React Big Calendar npm (v1.19.4): https://www.npmjs.com/package/react-big-calendar
- Supabase Realtime docs: https://supabase.com/docs/guides/realtime
- Python hosting comparison 2025: https://www.nandann.com/blog/python-hosting-options-comparison
