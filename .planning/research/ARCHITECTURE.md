# Architecture Patterns

**Project:** ClarityOS EHR — Production Readiness Milestone
**Domain:** Multi-tenant optometry EHR/PMS SaaS
**Researched:** 2026-03-05
**Overall confidence:** HIGH (Supabase + Next.js integration), MEDIUM (FHIR export mapping)

---

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Next.js 14 (Vercel)                                        │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐  │   │
│  │  │middleware.ts│  │  Route       │  │  Client Components │  │   │
│  │  │(Supabase   │  │  Handlers    │  │  + Zustand Stores  │  │   │
│  │  │ SSR auth)  │  │ (BFF proxy)  │  │  (real API calls)  │  │   │
│  │  └────────────┘  └──────┬───────┘  └────────┬───────────┘  │   │
│  └────────────────────────-│──────────────────-│──────────────┘   │
└────────────────────────────│──────────────────-│──────────────────┘
                             │ JWT in header      │ JWT in header
                             ▼                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  FastAPI (Railway / Fly.io)                                       │
│  ┌──────────────────────┐  ┌───────────────────────────────────┐ │
│  │  Auth Middleware     │  │  Clinical API Routes              │ │
│  │  (JWKS verification  │  │  encounters, patients, vitals,    │ │
│  │   ES256 → PyJWT)     │  │  refractions, diagnoses, audit,  │ │
│  └──────────────────────┘  │  AI scribe, FHIR export          │ │
│                            └──────────────┬────────────────────┘ │
└───────────────────────────────────────────│───────────────────────┘
                                            │
                             ┌──────────────▼──────────────┐
                             │  Supabase (managed)         │
                             │  ┌─────────┐ ┌───────────┐  │
                             │  │  Auth   │ │ PostgreSQL │  │
                             │  │(JWKS/   │ │ public +   │  │
                             │  │ ES256)  │ │ per-tenant │  │
                             │  └─────────┘ └───────────┘  │
                             └─────────────────────────────┘
```

---

## Component Boundaries

### What Talks to What

| From | To | Protocol | Auth |
|------|----|----------|------|
| Browser → Next.js middleware | Supabase Auth API | HTTPS | Cookie (Supabase SSR) |
| Browser client components | FastAPI routes | HTTPS + Bearer JWT | Supabase access token |
| Next.js route handlers (BFF) | FastAPI routes | HTTPS + Bearer JWT | Forwarded Supabase token |
| FastAPI | Supabase PostgreSQL | asyncpg | Service role key (server only) |
| FastAPI AI Scribe | Anthropic API | HTTPS | API key (env var) |
| FastAPI FHIR export | (returns FHIR JSON) | — | Same JWT as clinical routes |

### Component Responsibilities

| Component | Responsibility | Must NOT Do |
|-----------|---------------|-------------|
| `middleware.ts` (Next.js) | Token refresh, route protection, redirect to /login | Database queries, business logic |
| Next.js route handlers (`app/api/`) | BFF proxy for audit + AI accept calls (keep FastAPI URL server-side), token forwarding | Own clinical business logic |
| Zustand stores | Client state, optimistic UI, debounced saves | Seed from mock data in production |
| FastAPI auth middleware | JWT signature verification via JWKS, extract TenantContext | Trust frontend claims blindly |
| FastAPI route handlers | RBAC enforcement, DB queries scoped by tenant_id, audit log | Bypass permission checks |
| Supabase Auth | User identity, custom claims injection (tenant_id, role), token lifecycle | Replace FastAPI's clinical logic |
| Supabase PostgreSQL | Persistent data store | Run clinical business logic (leave to FastAPI) |

---

## Data Flow

### 1. Auth Flow (Login → Session)

```
User submits credentials
  → POST /auth/login (Next.js Server Action or route handler)
    → supabase.auth.signInWithPassword()
      → Supabase validates credentials
      → Custom Access Token Hook fires:
          queries tenant_members for tenant_id, role
          injects into claims.app_metadata: { tenant_id, role }
      → Returns { access_token (JWT), refresh_token }
      → Supabase SSR stores tokens in httpOnly cookies
  → middleware.ts runs on next request:
      supabase.auth.getClaims() validates JWT signature (JWKS/ES256)
      refreshes token if expired via response.cookies.set
  → sessionStore.ts hydrated from JWT claims:
      setSession(hydrateRealSession(accessToken))
```

**Critical:** `getClaims()` not `getSession()` — getClaims validates the JWT signature against Supabase's published JWKS public keys. getSession() trusts cookies without verification.

### 2. Clinical Data Flow (Store → API → DB)

```
Clinician edits Rx cell
  → refractionStore.setDraftCell() → saveStatus = "dirty"
  → 1.5s debounce fires → saveColumnToAPI()
    → lib/api-client.ts: apiFetch("/api/encounters/{id}/refraction/{type}", PATCH)
      → supabase.auth.getSession().access_token attached as Bearer
      → FastAPI /api/encounters/{id}/refraction/{type}
          → get_current_tenant():
              PyJWT JWKS client fetches public keys from
              https://{ref}.supabase.co/auth/v1/.well-known/jwks.json
              verifies ES256 signature → extracts TenantContext
          → require_permission(EDIT_REFRACTION)
          → UPDATE refraction WHERE id=X AND tenant_id=ctx.tenant_id
          → log_action("UPDATE_REFRACTION", ...)
          → returns RefractionResponse
      → committed state updated, saveStatus = "saved"
```

### 3. Page Load (Mock → Real API migration target)

**Current (to be replaced):**
```
encounter/[encounterId]/page.tsx mounts
  → useState(() => getInitialStoreState(encounterId, patientId))  ← REMOVE
  → initEncounter(id, persona.encounter)                          ← REPLACE
  → initVitals(id, persona.vitals)                               ← REPLACE
  → ...etc
```

**Target pattern (per store, incremental migration):**
```
encounter/[encounterId]/page.tsx mounts
  → useEffect: apiFetch("/api/encounters/{id}")
      → returns full encounter with embedded vitals, refractions, diagnoses
      → initEncounter(id, data.encounter)      ← real data
      → initVitals(id, data.vitals)            ← real data
      → initDiagnoses(id, data.diagnoses)      ← real data
      → (no mock import, no persona seeding)
```

The idempotent `init*` guards in the stores (skip if key exists) must be removed or inverted — they currently block real data from loading if mock state was seeded previously.

### 4. AI Scribe SSE Flow (unchanged, but audit fix needed)

```
Provider clicks Generate
  → POST /api/encounters/{id}/ai-scribe (via apiFetch, not relative path)
    → FastAPI streams SSE events
    → Frontend accumulates → parses structured JSON
  → Provider clicks "Accept & Auto-Fill"
    → dispatches to 5 stores simultaneously
    → POST /api/encounters/{id}/ai-scribe/accept (via apiFetch, NOT fetch('/api/...'))
        ← this currently calls a nonexistent Next.js route, must use apiFetch()
```

### 5. FHIR Export Flow

```
Admin/provider requests export
  → GET /api/patients/{id}/fhir-export?resources=Patient,Encounter,Observation,Condition
    → require_permission(EXPORT_RECORDS)
    → log_action("FHIR_EXPORT", patient_id=...)  ← PHI access log
    → Mapper layer:
        Patient model  → fhir.resources R4B Patient resource
        Encounter model → fhir.resources R4B Encounter resource
        Diagnosis[]    → fhir.resources R4B Condition resources
        Refraction[]   → fhir.resources R4B Observation resources (LOINC-coded)
        VitalsAndPretest → fhir.resources R4B Observation resources
    → Returns FHIR Bundle (JSON)
```

---

## Critical Architecture Fixes Required Before Feature Work

### Fix 1: Python Backend Relocation (CRITICAL)

**Problem:** FastAPI files live in `app/` alongside Next.js App Router pages. Next.js 14 will attempt to process `app/main.py`, creating namespace collisions. `app/api/` already conflicts — any `route.ts` files added there will collide with `app/api/routes/*.py`.

**Solution:** Move all Python files to a top-level `backend/` directory.

**Target directory structure:**
```
clarityos-erp/
  app/                    ← Next.js App Router only
    (tenant)/
    api/                  ← Next.js route handlers (BFF proxy) only
      encounters/
        [id]/
          audit-logs/
            route.ts      ← proxies to FastAPI
          ai-scribe/
            accept/
              route.ts    ← proxies to FastAPI
  backend/                ← FastAPI (new, moved from app/)
    main.py
    api/
    core/
    db/
    schemas/
  middleware.ts           ← Next.js auth middleware (project root)
  lib/
  store/
```

**Build order implication:** This is the first task. Nothing else can proceed cleanly until the namespace is resolved. The frontend route handlers (`app/api/`) cannot be created while Python files occupy that namespace.

### Fix 2: Next.js middleware.ts (CRITICAL)

**Problem:** No `middleware.ts` exists. All routes are publicly accessible.

**Solution:** Create `middleware.ts` at project root using `@supabase/ssr`.

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  // ALWAYS use getClaims() not getSession() — validates JWT signature
  const { data: { user } } = await supabase.auth.getUser()

  // Protect all tenant routes
  if (!user && request.nextUrl.pathname.startsWith('/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}
```

**Package required:** `@supabase/ssr` (not the deprecated `@supabase/auth-helpers-nextjs`).

### Fix 3: FastAPI JWKS Verification (CRITICAL)

**Problem:** Backend uses `python-jose` with static HS256 secret. Supabase projects created after May 2025 use ES256 asymmetric keys (JWKS).

**Solution:** Migrate to PyJWT + JWKS client.

```python
# backend/core/security.py
import jwt
from jwt import PyJWKClient

JWKS_URL = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
_jwks_client = PyJWKClient(JWKS_URL, cache_keys=True)

def get_current_tenant(token: str = Depends(http_bearer)) -> TenantContext:
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token.credentials)
        payload = jwt.decode(
            token.credentials,
            signing_key.key,
            algorithms=["ES256", "HS256"],  # support both during migration
            audience="authenticated",
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=str(e))

    return TenantContext(
        user_id=UUID(payload["sub"]),
        tenant_id=UUID(payload["app_metadata"]["tenant_id"]),
        role=payload["app_metadata"]["role"],
    )
```

**Package required:** `PyJWT[crypto]` (replaces `python-jose`). The `[crypto]` extra adds `cryptography` for ES256 support.

### Fix 4: Supabase Custom Access Token Hook (CRITICAL)

**Problem:** `tenant_id` and `role` must be injected into the Supabase JWT at token issuance time. Without this, `app_metadata.tenant_id` is absent from the JWT and all FastAPI tenant scoping fails.

**Solution:** Create a Supabase Auth Hook (Database Function or Edge Function):

```sql
-- Supabase SQL Editor: Custom Access Token Hook
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  member_record RECORD;
BEGIN
  SELECT tm.tenant_id, tm.role
  INTO member_record
  FROM public.tenant_members tm
  WHERE tm.global_user_id = (event->>'user_id')::uuid
  LIMIT 1;

  IF FOUND THEN
    event := jsonb_set(event, '{claims,app_metadata,tenant_id}',
                       to_jsonb(member_record.tenant_id::text));
    event := jsonb_set(event, '{claims,app_metadata,role}',
                       to_jsonb(member_record.role));
  END IF;

  RETURN event;
END;
$$;
```

Register in Supabase Dashboard → Authentication → Hooks → Custom Access Token.

**Build order implication:** This hook must be registered before the login page is built — the login page is untestable without real JWTs containing tenant_id.

### Fix 5: Next.js BFF Route Handlers (HIGH)

**Problem:** Three frontend calls use relative `/api/` paths targeting Next.js routes that do not exist. These 404 in production.

**Solution:** Create Next.js route handlers that proxy to FastAPI. This keeps the FastAPI origin URL server-side (not in the browser bundle as a `NEXT_PUBLIC_` var).

```typescript
// app/api/encounters/[id]/audit-logs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies()
  const supabase = createServerClient(/* env vars */)
  const { data: { session } } = await supabase.auth.getSession()

  const upstream = await fetch(
    `${process.env.API_URL}/api/encounters/${params.id}/audit-logs`,
    { headers: { Authorization: `Bearer ${session?.access_token}` } }
  )
  const data = await upstream.json()
  return NextResponse.json(data, { status: upstream.status })
}
```

Note: `API_URL` (server-only, no `NEXT_PUBLIC_` prefix) keeps the FastAPI origin private.

---

## Patterns to Follow

### Pattern 1: Store Migration (Mock → Real API)

**What:** Replace `getInitialStoreState(encounterId)` call with a `useEffect` that calls `apiFetch` and dispatches to stores. Do one store at a time, starting with `encounterStore` (the root), then `vitalsStore`, then `refractionStore`, then `examFindingsStore`, then `diagnosisStore`.

**When:** Immediately before the store is needed for a real workflow.

**Implementation:**
```typescript
// In encounter/[encounterId]/page.tsx
useEffect(() => {
  async function loadEncounter() {
    const data = await apiFetch(`/api/encounters/${encounterId}`)
    // initEncounter is idempotent — remove the "skip if exists" guard first
    initEncounter(encounterId, data)
    initVitals(encounterId, data.vitals)
    // etc.
  }
  loadEncounter()
}, [encounterId])

// REMOVE: const [persona] = useState(() => getInitialStoreState(...))
// REMOVE: all initX(id, persona.X) calls
// REMOVE: all lib/mock-* imports
```

**Idempotent guard inversion:** The stores' `init*` actions currently have `if (key already exists) return`. This logic must be inverted after real API calls are introduced — API data should always win over any stale cached state.

### Pattern 2: localStorage ePHI Cleanup on Logout

**What:** `clearSession()` in `sessionStore.ts` must clear all persisted ePHI from localStorage.

**When:** Any logout action.

```typescript
clearSession: () => {
  // Clear all ePHI from localStorage
  localStorage.removeItem('clarity-encounters')
  // Clear any draft transcripts
  Object.keys(localStorage)
    .filter(k => k.startsWith('draft-transcript-'))
    .forEach(k => localStorage.removeItem(k))
  // Clear tenant customization (contains tenant identity)
  localStorage.removeItem('clarity-tenant-customization')
  // Clear session store
  set({ session: null, isLoading: false }, false, 'clearSession')
  // Redirect to login
  window.location.href = '/login'
}
```

### Pattern 3: FHIR R4B Export — Facade Pattern (Not a FHIR Server)

**What:** Map existing SQLAlchemy models to FHIR R4B resources on the fly for each export request. No FHIR storage, no FHIR-native querying.

**Library:** `fhir.resources` (PyPI) — Pydantic v2, supports R4B sub-package, covers Patient / Encounter / Observation / Condition.

**FHIR Resource Mapping for Optometry:**

| ClarityOS Model | FHIR R4B Resource | Key Fields |
|----------------|-------------------|------------|
| `Patient` | `Patient` | identifier (MRN), name, birthDate, gender, address |
| `Encounter` | `Encounter` | status (finished/in-progress), class (AMB), period, subject→Patient, participant→Staff |
| `Diagnosis` (ICD-10 + laterality) | `Condition` | code (ICD-10), bodySite (laterality), subject, encounter |
| `Refraction` row | `Observation` | status=final, code (LOINC), component[] (sphere, cylinder, axis, add, VA) |
| `VitalsAndPretest` | `Observation` | status=final, code (LOINC: 59408-5 O2Sat, 8867-4 HR, etc.), valueQuantity |

**Refraction LOINC mapping (MEDIUM confidence — verify against LOINC database):**
- Sphere: LOINC 79882-2 (Lens sphere power)
- Cylinder: LOINC 79883-0 (Lens cylinder power)
- Axis: LOINC 79885-5 (Lens cylinder axis)
- Add power: LOINC 79884-8 (Lens add power)
- Visual Acuity: LOINC 79880-6 (Visual acuity)
- IOP (Goldmann): LOINC 11399-0 (Intraocular pressure)

**Implementation sketch:**
```python
# backend/api/routes/fhir_export.py
from fhir.resources.R4B.patient import Patient as FHIRPatient
from fhir.resources.R4B.encounter import Encounter as FHIREncounter
from fhir.resources.R4B.observation import Observation as FHIRObservation
from fhir.resources.R4B.condition import Condition as FHIRCondition
from fhir.resources.R4B.bundle import Bundle as FHIRBundle

def map_patient_to_fhir(patient: Patient) -> FHIRPatient:
    return FHIRPatient(
        id=str(patient.id),
        identifier=[{"system": "urn:clarityos:mrn", "value": patient.mrn}],
        name=[{"family": patient.last_name, "given": [patient.first_name]}],
        birthDate=patient.date_of_birth.isoformat(),
        gender=patient.sex.lower() if patient.sex else "unknown",
    )

@router.get("/patients/{patient_id}/fhir-export")
async def fhir_export(
    patient_id: UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.EXPORT_RECORDS)),
    db: AsyncSession = Depends(get_db),
):
    await log_action(db, ctx, "FHIR_EXPORT", "Patient", patient_id)
    patient = await get_patient(db, patient_id, ctx.tenant_id)
    encounters = await get_patient_encounters(db, patient_id, ctx.tenant_id)

    bundle_entries = [{"resource": map_patient_to_fhir(patient).model_dump()}]
    for enc in encounters:
        bundle_entries.append({"resource": map_encounter_to_fhir(enc).model_dump()})
        for dx in enc.diagnoses:
            bundle_entries.append({"resource": map_diagnosis_to_fhir(dx, enc).model_dump()})
        for rx in enc.refractions:
            bundle_entries.append({"resource": map_refraction_to_fhir(rx, enc).model_dump()})

    bundle = FHIRBundle(type="document", entry=bundle_entries)
    return bundle.model_dump()
```

### Pattern 4: Alembic Migration Setup (Required Before Schema Changes)

**What:** Set up Alembic with async support before any schema alterations (adding `recorded_by_id` to Diagnosis, adding Appointment table, etc.).

**Structure:**
```
backend/
  alembic/
    env.py         ← import all models, use async_engine_from_config
    versions/
      0001_initial.py
  alembic.ini
```

**Key configuration in `env.py`:**
```python
from app.db.base import PublicBase, TenantBase
# Import all models so autogenerate can detect them
from app.db.models.public import saas  # noqa
from app.db.models.tenant import clinical  # noqa

target_metadata = [PublicBase.metadata, TenantBase.metadata]
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Trusting getSession() in Server Components

**What:** Using `supabase.auth.getSession()` inside middleware or Server Components instead of `getClaims()` / `getUser()`.

**Why bad:** `getSession()` reads from cookies without verifying the JWT signature. A tampered cookie value would be trusted. Supabase's official docs (2025) explicitly state: "Never trust supabase.auth.getSession() inside server code."

**Instead:** Always use `supabase.auth.getClaims()` or `supabase.auth.getUser()` in middleware and Server Components. These validate the JWT signature against JWKS on every call.

### Anti-Pattern 2: Direct Backend URL as NEXT_PUBLIC_ Variable

**What:** Exposing the FastAPI service URL as `NEXT_PUBLIC_API_URL` so the browser calls the backend directly.

**Why bad:** Exposes the FastAPI host in the browser bundle. Requires permissive CORS (`allow_origins=["*"]` or `allow_origins=[vercel_url]`). The audit log and AI accept calls already use relative paths (implicitly assuming a BFF layer exists).

**Instead:** Use Next.js Route Handlers as a BFF layer. Store the FastAPI URL as `API_URL` (server-only env var, no `NEXT_PUBLIC_` prefix). The browser only ever talks to the same Vercel origin.

### Anti-Pattern 3: Seeding Zustand Stores from Mock Personas in Production

**What:** Calling `getInitialStoreState()` from a `useState` initializer on page mount.

**Why bad:** Mock data is committed to the store before any API response arrives. The `init*` idempotent guards then block real API data from loading. The 788-line personas module is bundled into production JS.

**Instead:** Load stores exclusively from API responses inside a `useEffect`. Use a loading state (skeleton UI) while the API fetch is in-flight. Remove all `lib/mock-*` imports from production page files.

### Anti-Pattern 4: python-jose with Static HS256 Secret for New Supabase Projects

**What:** Using `python-jose` to verify Supabase JWTs with the static JWT secret.

**Why bad:** Supabase projects created after May 2025 use ES256 asymmetric keys. `python-jose` is not actively maintained. Verification will fail for new projects using ES256 without additional configuration.

**Instead:** Use `PyJWT[crypto]` with a `PyJWKClient` that fetches from Supabase's JWKS endpoint. Cache the JWKS keys to avoid fetching on every request. Support both `ES256` and `HS256` in the algorithms list during transition.

### Anti-Pattern 5: FHIR Server Instead of FHIR Export Facade

**What:** Building a full FHIR-native data store that stores all clinical data as FHIR resources natively.

**Why bad:** Massively over-engineered for the current product stage. FHIR as storage requires a complete rethink of the SQLAlchemy schema and Pydantic layer. The existing schema is well-structured for clinical workflows.

**Instead:** Map existing models to FHIR resources on demand (facade pattern). The `fhir.resources` library makes this straightforward — construct FHIR Pydantic models from SQLAlchemy data and return them as JSON. No persistent FHIR storage needed.

---

## Suggested Build Order (Phase Dependencies)

The following order is driven by hard dependencies — each item unblocks the next.

### Layer 1: Foundation (Unblocks Everything)

1. **Move FastAPI to `backend/`** — unblocks creating `app/api/route.ts` BFF handlers. Nothing else can be built cleanly without this.
2. **Set up Alembic** in `backend/alembic/` — unblocks any schema changes (patient API, scheduling, recorded_by_id, etc.)
3. **Supabase Custom Access Token Hook** — injects `tenant_id` + `role` into JWTs. Required before the login page is testable end-to-end.

### Layer 2: Auth Integration (Unblocks Store Migration)

4. **Next.js `middleware.ts`** — route protection. Required before any page is safe to deploy with real data.
5. **Login page + Supabase Auth flow** — `app/login/page.tsx`, sign in with email/password, stores session in httpOnly cookies via `@supabase/ssr`.
6. **`sessionStore.ts` hydration** — remove `getMockSession("premium_doctor")`. Call `hydrateRealSession(token)` after login. Add `getClaims()` call to derive entitlements from the real JWT.
7. **FastAPI JWKS verification** — replace `python-jose` HS256 with `PyJWT` JWKS client. Remove dev bypass.
8. **Security hardening** — remove `SECRET_KEY` default, move Supabase URL to env var, add `middleware.ts` NEXT_PUBLIC guard, gate Zustand devtools to development.

### Layer 3: Patient + Scheduling APIs (Unblocks Store Migration)

9. **Patient CRUD API** (`backend/api/routes/patients.py`) — GET /patients, GET /patients/{id}, POST /patients, PATCH /patients/{id}. Enables removing mock data from patients page.
10. **Appointment/Scheduling API** — Appointment model (Alembic migration), CRUD routes. Enables removing mock data from schedule page.
11. **Next.js BFF route handlers** — `app/api/encounters/[id]/audit-logs/route.ts`, `app/api/encounters/[id]/ai-scribe/accept/route.ts`. Fix the two 404 endpoints without exposing FastAPI URL.

### Layer 4: Store Migration (Incremental, Store by Store)

12. **`encounterStore` migration** — remove mock seeding, load from `GET /api/encounters/{id}`.
13. **`vitalsStore` migration** — load from embedded encounter response or dedicated GET.
14. **`refractionStore` migration** — load from `GET /api/encounters/{id}/refractions`.
15. **`examFindingsStore` migration** — load from embedded encounter response.
16. **`diagnosisStore` migration** — load from embedded encounter response.
17. **Dashboard + patients + schedule pages** — replace mock imports with real API calls. Remove all `lib/mock-*` imports from production pages.

### Layer 5: HIPAA Gaps + Missing Clinical Features

18. **PHI read logging** — add `log_action("READ_ENCOUNTER", ...)` to all GET endpoints.
19. **`Diagnosis.recorded_by_id`** — Alembic migration to add column.
20. **Staff + PatientProblem audit logging** — add `log_action` to all staff and problem routes.
21. **Encounter addenda** — new Addendum model + API. Timestamps amendments without reopening original fields.
22. **ICD-10 full code set** — replace static 25-code list with database table (import CMS-published ICD-10-CM tabular file) + FastAPI search endpoint.

### Layer 6: FHIR Export

23. **FHIR export route** — `GET /api/patients/{id}/fhir-export`. Implement facade mapper for Patient, Encounter, Condition, Observation. Install `fhir.resources` (R4B sub-package).
24. **Frontend export UI** — download button on patient detail page, requires EXPORT_RECORDS permission.

---

## Scalability Considerations

| Concern | At 5 providers (now) | At 50 providers | At 500 providers |
|---------|---------------------|-----------------|-----------------|
| Tenant isolation | Python-level WHERE tenant_id clause | Add Supabase RLS as defense-in-depth | Schema-per-tenant with search_path routing (as originally planned in TenantBase) |
| Auth token validation | JWKS cached in memory per FastAPI process | Same — JWKS cache is efficient | Same — JWKS endpoint handles high traffic |
| API throughput | Single Uvicorn process | Uvicorn with multiple workers behind load balancer | Horizontal scaling on Railway/Fly.io |
| Database connections | Pool of 20 (current config) | Increase pool, add PgBouncer | Supabase connection pooler (already available) |
| FHIR export | Synchronous, in-request | Background task (Celery or FastAPI BackgroundTasks) with download URL | Same + CDN caching of generated bundles |
| Audit log queries | Full table scan mitigated by tenant_id index | Add composite index (tenant_id, created_at) | Partition audit_log by month |

---

## Confidence Assessment

| Area | Confidence | Sources | Notes |
|------|------------|---------|-------|
| Supabase SSR middleware pattern | HIGH | Official Supabase docs (2025) | `@supabase/ssr` is the current recommended package; auth-helpers is deprecated |
| JWKS / ES256 JWT verification | HIGH | Supabase changelog, objectgraph.com migration guide | ES256 is default for new projects after May 2025; PyJWT[crypto] is the correct Python path |
| Custom Access Token Hook | HIGH | Official Supabase docs | Hook structure and required/optional claims documented |
| Next.js BFF proxy pattern | HIGH | Official Next.js docs (Route Handlers, BFF guide) | Standard pattern, well-documented |
| Zustand store migration pattern | HIGH | Zustand official docs + community patterns | Straightforward async action replacement |
| FHIR R4B resource structure | MEDIUM | HL7 FHIR R4 spec, fhir.resources GitHub | R4 dropped in fhir.resources v7+; R4B is the maintained alternative |
| LOINC codes for optometry | MEDIUM | HL7 FHIR, general LOINC knowledge | Specific optometry LOINC codes need verification against LOINC database before implementation |
| Alembic async setup | HIGH | Multiple 2024-2025 guides (testdriven.io, berkkaraal.com) | Pattern is well-established for SQLAlchemy 2.0 + asyncpg |

---

## Sources

- [Setting up Server-Side Auth for Next.js — Supabase Docs](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Creating a Supabase Client for SSR — Supabase Docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Custom Access Token Hook — Supabase Docs](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [JWT Signing Keys — Supabase Docs](https://supabase.com/docs/guides/auth/signing-keys)
- [Migrating from Static JWT Secrets to JWKS in Supabase](https://objectgraph.com/blog/migrating-supabase-jwt-jwks/)
- [Implementing Supabase Authentication with Next.js and FastAPI — bytegoblin.io](https://bytegoblin.io/blog/implementing-supabase-authentication-with-next-js-and-fastapi.mdx)
- [Guides: Backend for Frontend — Next.js Docs](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Getting Started: Route Handlers — Next.js Docs](https://nextjs.org/docs/app/getting-started/route-handlers)
- [fhir.resources — GitHub (nazrulworld)](https://github.com/nazrulworld/fhir.resources)
- [fhir.resources — PyPI](https://pypi.org/project/fhir.resources/)
- [Building a HIPAA-Compliant FHIR API with FastAPI — Medium](https://medium.com/@petercovingtonmitchell/building-a-hipaa-compliant-fhir-api-with-fastapi-a-step-by-step-guide-f6d2897383ee)
- [Setup FastAPI Project with Async SQLAlchemy 2, Alembic, PostgreSQL — berkkaraal.com](https://berkkaraal.com/blog/2024/09/19/setup-fastapi-project-with-async-sqlalchemy-2-alembic-postgresql-and-docker/)
- [Supabase Auth: Asymmetric Keys support in 2025 — GitHub Discussion](https://github.com/orgs/supabase/discussions/29289)
- [Custom Claims for Multi-Tenancy and User Roles — Supabase Discussion](https://github.com/orgs/supabase/discussions/1148)
