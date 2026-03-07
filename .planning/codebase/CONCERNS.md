# ClarityOS EHR — Technical Debt & Concerns

**Last updated:** 2026-03-05
**Scope:** Full codebase audit — Next.js 14 frontend + FastAPI backend
**Legend:** [CRITICAL] [HIGH] [MEDIUM] [LOW]

---

## Table of Contents

1. [Security Concerns](#1-security-concerns)
2. [HIPAA / Compliance Gaps](#2-hipaa--compliance-gaps)
3. [Architecture Concerns](#3-architecture-concerns)
4. [Mock Data Dependency](#4-mock-data-dependency)
5. [Missing Features / Incomplete Implementations](#5-missing-features--incomplete-implementations)
6. [Known Bugs & Type Errors](#6-known-bugs--type-errors)
7. [Technical Debt](#7-technical-debt)
8. [Performance Concerns](#8-performance-concerns)
9. [Observability & Testing Gaps](#9-observability--testing-gaps)
10. [Summary Priority Matrix](#10-summary-priority-matrix)

---

## 1. Security Concerns

### [CRITICAL] Backend dev-bypass: JWT verification skipped when SUPABASE_JWT_SECRET is empty

**File:** `app/core/security.py` lines 68-75

```python
if not settings.SUPABASE_JWT_SECRET:
    return TenantContext(
        user_id=UUID("a0000000-0000-0000-0000-000000000001"),
        tenant_id=UUID("b0000000-0000-0000-0000-000000000001"),
        role="doctor",
    )
```

Any request to the FastAPI backend with a missing or empty `SUPABASE_JWT_SECRET` bypasses all authentication and is granted doctor-level access to a hard-coded demo tenant. If this backend is accidentally deployed without the secret configured (e.g., a staging environment with incomplete env vars), all endpoints are effectively public. There is no middleware-level guard preventing unauthenticated access to clinical data.

**Risk:** Full unauthenticated read/write access to ePHI if the env var is unset in any environment.

---

### [CRITICAL] Hardcoded SECRET_KEY default in Python config

**File:** `app/core/config.py` line 21

```python
SECRET_KEY: str = "your-super-secret-key-for-us-saas-2026"
```

This key is used for any internal signing operations. If the production environment does not explicitly override it, the default value is in use. Because this file is in version control, the key is public. It should have no default, causing a startup failure if unset.

---

### [CRITICAL] Hardcoded Supabase project reference in source code

**File:** `app/core/config.py` line 12

```python
SUPABASE_URL: str = "https://iedzzcokfwnbyfyevjoz.supabase.co"
```

The live Supabase project reference (`iedzzcokfwnbyfyevjoz`) is committed directly into the config file's default value. This is visible to anyone with access to the repository and is also documented in `.planning/codebase/INTEGRATIONS.md`. Combined with the service role key gap, this leaks infrastructure discovery information.

---

### [CRITICAL] Frontend session store pre-loaded with premium_doctor mock in production build

**File:** `store/sessionStore.ts` line 61

```typescript
session: getMockSession("premium_doctor"),
```

The Zustand session store initializes with a mock premium doctor session unconditionally. There is no environment guard. If `NEXT_PUBLIC` env vars are missing or the Supabase auth flow is not yet wired up, every user who visits the deployed app will be silently authenticated as a premium doctor with full clinical access. There is no `middleware.ts` in the Next.js app to protect routes.

---

### [CRITICAL] No Next.js route middleware — all pages are publicly accessible

There is no `middleware.ts` file in the project. All routes under `app/(tenant)/[tenantId]/` are accessible without authentication. The only guard is client-side: the Zustand session store populates from the mock session. A user who navigates directly to any URL gets full access.

---

### [HIGH] AI Scribe transcript persisted to localStorage without expiry or PHI warning

**File:** `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx` lines 156-175

```typescript
localStorage.setItem(storageKey, transcript);
```

The clinical transcript (which may contain detailed patient history, symptoms, and diagnoses dictated aloud) is written to `localStorage` under the key `draft-transcript-{encounterId}`. There is no expiry, no encryption, no automatic cleanup after finalization, and no warning to the user that transcript text is being stored in the browser. On a shared workstation, this persists across sessions.

---

### [HIGH] Encounter state (including aiSummaryText and chief complaint) persisted to localStorage indefinitely

**File:** `store/encounterStore.ts` lines 173-176

```typescript
{ name: "clarity-encounters", partialize: (state) => ({ encounters: state.encounters }) }
```

The entire `encounters` map, including `aiSummaryText`, `chiefComplaint`, `signedByName`, and `signedAt`, is persisted to `localStorage` via Zustand's `persist` middleware under the key `clarity-encounters`. This data is ePHI. It has no TTL and is not cleared on logout. The `clearSession` action in `sessionStore.ts` does not clear this store.

---

### [HIGH] 7-day access token lifetime with no refresh token mechanism

**File:** `app/core/config.py` line 22

```python
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 1 week
```

JWT tokens are valid for 7 days. There is no evidence of a refresh token implementation in any route file. A compromised token grants full access for up to 7 days with no revocation mechanism. HIPAA requires automatic session timeout after inactivity (typically 15-30 minutes for clinical applications).

---

### [HIGH] No rate limiting on FastAPI endpoints

No rate limiting middleware is present in `app/main.py` or any route file. The AI Scribe endpoint (`/api/encounters/{id}/ai-scribe`) streams responses from Anthropic's API with no per-user or per-tenant throttle. This exposes both an Anthropic API cost vector and a denial-of-service vector.

---

### [MEDIUM] Frontend RBAC is UI-only — no server-side enforcement from the frontend layer

`components/auth/PermissionGate` reads from the Zustand session store, which is seeded with a mock. Until real auth is wired up end-to-end, role restrictions on the frontend are meaningless. The backend `require_permission()` dependency is the only real enforcement layer, but the frontend provides no token to most fetch calls that go through `/api/*` Next.js proxy paths (those paths don't exist — see architecture concern below).

---

### [MEDIUM] `hydrateRealSession` does not verify JWT signature client-side

**File:** `lib/auth/mock-session.ts` lines 193-202

The `hydrateRealSession` function decodes the JWT payload with `atob()` but does not verify the signature. This means a tampered JWT could be used to claim elevated entitlements on the frontend. Signature verification must happen on the backend; however, the frontend should at minimum validate expiry before seeding the store.

---

### [LOW] Zustand DevTools enabled unconditionally — exposes session and clinical state to browser devtools

All stores are wrapped with `devtools(...)` with no environment guard. In production, Zustand DevTools broadcasts full store state (including session tokens, patient data, encounter data, AI-generated SOAP notes) to any Redux DevTools browser extension. The `name` labels like `"ClarityOS/Session"` make it trivially discoverable.

---

## 2. HIPAA / Compliance Gaps

### [CRITICAL] No PHI access logging on READ operations

The `log_action` utility is called on CREATE, UPDATE, DELETE, FINALIZE, and AI_SCRIBE events. However, no `READ` audit log entries are written on any GET endpoint. Under HIPAA 164.312(b), all access to ePHI — including reads — must be logged with the user's identity, timestamp, and the data accessed.

Affected routes without read logging:
- `GET /api/encounters/{id}` (encounter.py)
- `GET /api/encounters/{id}/vitals` (implicit in encounter fetch)
- `GET /api/encounters/{id}/diagnoses` (no dedicated GET route — returned in encounter)
- `GET /patients/{id}/problems` (patient_problem.py)
- `GET /api/staff/` and `GET /api/staff/{id}` (staff.py — no audit at all)

---

### [HIGH] Staff management routes have zero audit logging

**File:** `app/api/routes/staff.py`

`list_staff`, `get_staff`, and `update_staff` do not call `log_action` at any point. Staff records contain name, NPI, email, and role. Updates to staff roles (privilege escalation) are not logged, which would be difficult to detect and report in a HIPAA breach investigation.

---

### [HIGH] PatientProblem CRUD has no audit logging

**File:** `app/api/routes/patient_problem.py`

`create_problem`, `update_problem`, and `delete_problem` do not call `log_action`. The master problem list is persistent clinical data that flows forward into encounters. Modifications to it without an audit trail are a compliance gap.

---

### [HIGH] Diagnosis model lacks `recorded_by_id` — no clinical attribution

**File:** `app/db/models/tenant/clinical.py` — `Diagnosis` class (lines 654-698)

The `Diagnosis` model does not have a `recorded_by_id` column. `VitalsAndPretest`, `Refraction`, and `ExamFindings` all have `recorded_by_id` linking to the Staff member who entered the data. Diagnoses — the most clinically and legally significant data — have no staff attribution beyond the `user_id` in the audit log. For a finalized encounter, it is not possible to query "which diagnoses did Dr. X enter" directly from the diagnosis table.

---

### [HIGH] AuditTrailSidebar fetches from a Next.js route (`/api/encounters/{id}/audit-logs`) that does not exist

**File:** `components/encounter/AuditTrailSidebar.tsx` line 136

```typescript
fetch(`/api/encounters/${encounterId}/audit-logs`)
```

This fetch targets a Next.js API route handler. No such file exists under `app/api/` (there are no `route.ts` files at all — only FastAPI Python files). The sidebar silently fails. Clinical staff cannot review the audit trail from the encounter view in the current deployment. The admin page's audit log panel calls `/api/audit-logs` which has the same issue.

---

### [MEDIUM] No data retention policy or PHI purge mechanism

There is no mechanism to delete or anonymize patient records, encounters, or audit logs after a configurable retention period. No soft-delete is implemented on patients or encounters (only on diagnoses, problems, and exam findings). This will need to be addressed before production: both for HIPAA's "minimum necessary" principle and for right-to-be-forgotten requests under state privacy laws.

---

### [MEDIUM] Audit log export (CSV) has no row limit and no authorization scope check

**File:** `app/api/routes/audit.py` — `export_audit_logs`

The CSV export endpoint loads the entire filtered result set into memory with no `LIMIT` clause. A tenant with years of audit data could trigger an OOM condition. Additionally, there is no secondary check that the calling user's `staff_id` corresponds to an active staff record — the `VIEW_AUDIT_LOG` permission is checked, but the Supabase service role key is used, meaning the audit log export endpoint runs as a privileged user.

---

## 3. Architecture Concerns

### [CRITICAL] Python FastAPI files live inside `app/` alongside Next.js App Router pages

The project root `app/` directory serves double duty: it is both the Next.js App Router root (`app/layout.tsx`, `app/page.tsx`, `app/(tenant)/`) and the FastAPI Python package (`app/__init__.py`, `app/main.py`, `app/api/`, `app/core/`, `app/db/`, `app/schemas/`). This creates real risks:

1. **Namespace collision:** Next.js will attempt to process `app/main.py`, `app/__init__.py`, and every `.py` file as potential routes or co-located modules. While it currently does not crash (`.py` is not a recognized extension), adding `app/api/route.ts` files in the future will conflict with `app/api/routes/*.py`.
2. **Build contamination:** `tsconfig.json` includes `"**/*.ts"` and `"**/*.tsx"` — the `app/` directory is in scope. All Python files will be present in the build context passed to the TypeScript compiler.
3. **Deployment ambiguity:** When deploying to Vercel (a Node.js platform), the Python files are dead weight. A CI step could accidentally include them in the Node.js bundle or trigger path-based routing confusion.
4. **`__pycache__` artifacts:** Python bytecode directories appear inside `app/` alongside JSX components.

The FastAPI backend should live in a top-level `backend/` or `server/` directory, completely separate from the Next.js `app/` directory.

---

### [HIGH] No Next.js API proxy layer — frontend fetch calls target localhost:8000 directly

**File:** `lib/api-client.ts` line 10

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
```

The frontend API client calls the FastAPI backend directly. In production on Vercel, this means the browser must make cross-origin requests to wherever the FastAPI service is hosted. There are no Next.js `app/api/` route handlers proxying requests. This has several consequences:

- The FastAPI service URL must be exposed as a `NEXT_PUBLIC_` variable, making it visible in the browser bundle.
- CORS must be permissive enough to allow browser requests (currently `allow_methods=["*"]`).
- The `AuditTrailSidebar` and admin audit log panel call `/api/encounters/{id}/audit-logs` — a relative path that would hit a Next.js route handler, not the FastAPI backend. These calls will always 404 in production.

---

### [HIGH] `unlockEncounter` exposes a data integrity bypass — no backend enforcement of finalization

**File:** `store/encounterStore.ts` line 135; `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx` line 675

The "Dev: Unlock Encounter" button is gated by `process.env.NODE_ENV === "development"` in the JSX, but the `unlockEncounter` action in Zustand itself has no environment guard. More critically, finalization is stored in `localStorage` via the persist middleware. A user who opens DevTools and calls `useEncounterStore.getState().unlockEncounter("enc-id")` can reverse a finalized encounter in any environment. There is no backend call that validates or enforces the finalized state.

---

### [MEDIUM] Tenant isolation relies entirely on Python-level `tenant_id` WHERE clauses — no RLS defense-in-depth

**File:** `app/core/security.py` lines 6-9

The backend connects via the Supabase service role key, which bypasses all PostgreSQL Row Level Security policies. The comment in `security.py` acknowledges this: "tenant isolation MUST be enforced at the Python level." However, `TenantBase` models do not use dynamic `search_path` routing (the comment in `db/base.py` describes it as future work — the implementation sets `server_settings: jit=off` but does NOT set `search_path`). If a single query omits the `tenant_id` filter, data from another tenant is accessible. There is no database-level fallback.

---

### [MEDIUM] `VitalsCreate` uses `CamelCaseModel` while all other request schemas use `AppBaseModel` — inconsistent API contract

**File:** `app/schemas/vitals.py` line 55

Only `VitalsCreate` uses `CamelCaseModel` (which applies camelCase alias generation). Every other request schema (`DiagnosisCreateRequest`, `EncounterCreateRequest`, `ExamFindingsUpdateRequest`, etc.) uses `AppBaseModel` with snake_case fields. This means the vitals PUT endpoint accepts camelCase field names while all other endpoints expect snake_case. The `vitalsStore.ts` explicitly builds a snake_case payload (`iop_od`, `iop_os`, etc.), so the vitals save likely fails silently or uses the snake_case fallback from `populate_by_name=True`.

---

### [MEDIUM] `DiagnosisResponse` is defined in two separate schema files with different field sets

**Files:** `app/schemas/diagnosis.py` line 54 and `app/schemas/encounter.py` line 270

Two separate `DiagnosisResponse` classes exist. The one in `encounter.py` is used when embedding diagnoses in the `EncounterResponse`. The one in `diagnosis.py` is returned by the individual diagnosis endpoints. If their fields diverge, clients that use encounter-embedded responses see different data than those hitting diagnosis endpoints directly.

---

### [LOW] `StaffUpdateRequest` in `app/schemas/staff.py` inherits from raw `BaseModel` instead of `AppBaseModel`

**File:** `app/schemas/staff.py` line 38

`StaffUpdateRequest` inherits from Pydantic's `BaseModel` directly instead of `AppBaseModel`. This means it does not have `from_attributes=True` (ORM mode), which is inconsistent with all other schemas in the project.

---

## 4. Mock Data Dependency

### [HIGH] 9 production pages/components import from mock data modules directly

The following source files have live imports from `lib/mock-*` modules. These are not conditional on `NODE_ENV` and will be bundled into production:

| File | Mock module imported |
|---|---|
| `app/(tenant)/[tenantId]/dashboard/page.tsx` | `lib/mock-patient-data` |
| `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx` | `lib/mock-patient-data`, `lib/mock-schedule-data`, `lib/mock/personas` |
| `app/(tenant)/[tenantId]/layout.tsx` | `lib/mock-patient-data`, `lib/mock-schedule-data` |
| `app/(tenant)/[tenantId]/patients/page.tsx` | `lib/mock-patient-data` |
| `app/(tenant)/[tenantId]/patients/[patientId]/page.tsx` | `lib/mock-patient-data` |
| `app/(tenant)/[tenantId]/schedule/page.tsx` | `lib/mock-schedule-data` |
| `app/(tenant)/[tenantId]/admin/page.tsx` | `lib/mock-staff-data` |
| `components/PatientChartModal.tsx` | `lib/mock-patient-data` |

There is approximately 1,400 lines of mock data in these files including realistic patient names, DOBs, ICD-10 codes, and clinical findings. This data will appear in the production JS bundle.

---

### [HIGH] `lib/mock/personas.ts` seeds Zustand stores directly on encounter page load

**File:** `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx` line 592

```typescript
const [persona] = useState(() => getInitialStoreState(params.encounterId, patientId));
```

On every encounter page mount, `getInitialStoreState` is called and its result seeds all clinical stores (vitals, refraction, diagnoses, exam findings). When real API calls return data and attempt to hydrate the stores, the mock initial state is already committed. The stores use idempotent `init()` guards ("don't overwrite existing state"), which means mock data can block real data from loading if the encounter was previously visited in the same browser session.

---

### [MEDIUM] Analytics page displays hardcoded KPIs as if they are real data

**File:** `app/(tenant)/[tenantId]/analytics/page.tsx` lines 65-68

```typescript
<StatCard label="Total Patients" value="1,247" ... />
<StatCard label="Revenue" value="$48.2K" ... />
```

There is no visual indicator that these figures are placeholder/demo values. A premium plan user who upgrades specifically for analytics will see fabricated metrics with no "demo data" disclaimer.

---

### [LOW] `lib/mock/personas.ts` is 788 lines and will be tree-shaken only if imports are removed

The personas file is large. Because it is imported with a named import (`getInitialStoreState`) and that function references the entire `DEMO_ENCOUNTERS` object, the entire file will be included in the production bundle regardless of which encounter is rendered.

---

## 5. Missing Features / Incomplete Implementations

### [HIGH] No patient CRUD API — patients exist only in mock data

There are no FastAPI routes for creating, reading, updating, or listing patients. The `app/db/models/tenant/clinical.py` defines a `Patient` model, but no `app/api/routes/patients.py` file exists, and no patient router is registered in `app/main.py`. The patient list page, patient detail page, and encounter page all source patient data entirely from `lib/mock-patient-data.ts`.

---

### [HIGH] No appointment / scheduling API

The schedule page is 100% mock data from `lib/mock-schedule-data.ts`. There are no FastAPI routes for appointments, no appointment model in the ORM, and no router registered in `main.py`. Creating encounters from the schedule view, which is shown in the UI, has no backend operation behind it.

---

### [HIGH] No login page — root redirects directly to demo clinic dashboard

**File:** `app/page.tsx`

```typescript
redirect("/sunview/dashboard");
```

The application has no authentication entry point. There is no `/login` page, no Supabase Auth UI integration, and no sign-up flow. The root URL goes directly into the demo tenant. Wiring up real auth requires creating the login page, connecting the Supabase Auth SDK, and replacing the mock session initialization in `sessionStore.ts`.

---

### [HIGH] No API route handlers (Next.js `route.ts`) — audit log and AI accept calls will 404 in production

There are zero `route.ts` files in the `app/` directory. The following frontend calls target relative paths that assume Next.js API routes exist:

- `fetch('/api/audit-logs?...')` — admin page audit log panel
- `fetch('/api/encounters/${encounterId}/audit-logs')` — AuditTrailSidebar
- `fetch('/api/encounters/${encounterId}/ai-scribe/accept', ...)` — AI Scribe accept action

These will 404 in any deployment because Next.js has no handlers for these paths, and the FastAPI backend is on a different origin/port. Either Next.js proxy route handlers need to be created, or the frontend needs to use `apiFetch()` with the full backend URL for these calls.

---

### [MEDIUM] Encounter addenda not implemented

**File:** `store/encounterStore.ts` line 47

```typescript
// V2: Add unlockForAddendum(id) action — creates timestamped amendment record
// rather than reopening original fields.
```

Once an encounter is finalized, there is no mechanism to append an addendum. The current `unlockEncounter` action is a dev-only reset that destroys the finalization record entirely. Clinical workflows routinely require post-finalization corrections.

---

### [MEDIUM] Analytics page is entirely placeholder — no chart library, no data queries

All four chart panels display "Chart coming soon" placeholders. The KPI stats are hardcoded strings. There is no chart library in `package.json` (no Recharts, Chart.js, Victory, etc.) and no data fetching.

---

### [MEDIUM] Billing export entitlement exists but has no implementation

`Entitlement.BILLING_EXPORT` is defined in `lib/entitlements.ts` and referenced in plan detection logic in `mock-session.ts`, but there is no billing export page, no superbill generation, no CMS-1500 form output, and no corresponding FastAPI route. The entitlement is effectively dead code.

---

### [LOW] ICD-10 search in DiagnosisPicker is a hardcoded static list of ~25 optometry codes

**File:** `components/encounter/DiagnosisPicker.tsx` lines 29-80

The diagnosis picker has a static array of approximately 25 ICD-10 codes filtered client-side. There is no connection to a full ICD-10-CM code set (which contains ~70,000 codes). Searching for conditions outside this static list returns no results.

---

## 6. Known Bugs & Type Errors

### [HIGH] Pre-existing TypeScript error: `personas.ts` line 240 — iop_method type mismatch

The `IopMethod` type in `types/vitals.ts` is defined as `"goldmann" | "icare" | "air_puff"`. The Python schema (`app/schemas/vitals.py`) accepts a free-form string. If any persona data uses a value outside the three accepted literals (e.g., `"non-contact"`), TypeScript will report a type error. The MEMORY.md documents this as a known pre-existing error on line 240. This error is suppressed by `skipLibCheck: true` in tsconfig but will surface under `tsc --noEmit` (the `type-check` script).

---

### [MEDIUM] `vitalsStore.ts` fallback creates a mock ID on save failure — committed state gets a fake ID

**File:** `store/vitalsStore.ts` lines 135-139

```typescript
} catch {
  await new Promise((resolve) => setTimeout(resolve, 400));
  savedDraft = { ...draft, id: draft.id ?? `mock-vitals-${Date.now()}` };
}
```

When the FastAPI backend is unreachable, a mock ID like `mock-vitals-1709000000000` is committed to the store. If the backend later becomes available, subsequent PUT calls will include this fake ID in the payload, potentially creating a new record or triggering a 404 instead of updating the existing draft. There is no retry queue or conflict resolution.

---

### [MEDIUM] AI Scribe accept silently ignores audit log failures

**File:** `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx` lines 302-309

```typescript
}).catch((e) => console.error("Audit log failed:", e));
```

The audit log call after AI Scribe accept is fire-and-forget with a `catch` that only logs to the console. If the audit write fails (network error, 404 because the API route does not exist), the data is written but the access event is not recorded. This is a HIPAA compliance gap.

---

### [LOW] `clearSession` does not clear the persisted encounter store or transcript localStorage keys

**File:** `store/sessionStore.ts` lines 69-73

```typescript
clearSession: () => {
    set({ session: null, isLoading: false }, false, "clearSession");
    // In production: clear cookies, redirect to /login
    // router.push('/login')
},
```

Logout clears only the session Zustand store. It does not:
- Clear `localStorage['clarity-encounters']` (persisted encounter state including AI summaries)
- Clear `localStorage['draft-transcript-*']` keys (raw clinical transcripts)
- Clear `localStorage['clarity-tenant-customization']` (tenant branding, tenant ID)
- Redirect to `/login`

A subsequent user on the same browser sees the previous user's encounter data and AI-generated SOAP notes.

---

## 7. Technical Debt

### [HIGH] camelCase / snake_case mismatch between frontend stores and FastAPI schemas is inconsistent

Most FastAPI schemas (`AppBaseModel`) serialize with snake_case. The `vitalsStore.ts` builds an explicit snake_case payload, which works if the backend's `CamelCaseModel` with `populate_by_name=True` accepts either form. However:

- `refractionStore.ts` fields (`sphere`, `cylinder`, `axis`, `add`, `visual_acuity`) are snake_case and match the Python schema directly.
- `vitalsStore.ts` sends snake_case but `VitalsCreate` inherits `CamelCaseModel` which aliases to camelCase. The `populate_by_name=True` setting should handle this, but it is untested end-to-end.
- `encounterStore.ts` fields (`chiefComplaint`, `providerName`, `isFinalized`) are camelCase internally but never sent to the API.

The lack of integration tests means these mismatches will only be caught at runtime.

---

### [HIGH] No Alembic migrations — schema management is manual

There is no `alembic.ini` and no `alembic/` directory anywhere in the project. The ORM models are defined in `app/db/models/tenant/clinical.py` and `app/db/models/public/saas.py`, but there is no migration tooling to apply schema changes to a live database. The only database setup script is `backend/seed_db.py`. Any schema change (adding a column, creating an index) must be applied manually via raw SQL or by re-running the seed script, which would destroy existing data.

---

### [MEDIUM] `app/schemas/encounter.py` duplicates vitals and diagnosis schemas locally

`app/schemas/encounter.py` defines its own `VitalsUpdateRequest` (line 53), `VitalsResponse` (line 221), `DiagnosisResponse` (line 270), and `ExamFindingsResponse` (line 288) rather than importing from their canonical schema files. These local definitions can drift from the canonical ones silently.

---

### [MEDIUM] `venv/` directory is tracked in the project root

**Confirmed by grep:** The Python virtual environment at `clarityos-erp/venv/` is present in the filesystem and its `site-packages` are traversable by tools. While `*.pyc` and `__pycache__/` are gitignored, the `venv/` directory itself is not explicitly listed in `.gitignore`. If it is in the git tree, it adds hundreds of megabytes of third-party code to the repository.

---

### [MEDIUM] `requirements.txt` has no pinned versions — dependency resolution is non-deterministic

```
fastapi>=0.115
sqlalchemy[asyncio]>=2.0
anthropic>=0.40
```

All dependencies use `>=` version constraints with no upper bound. A `pip install -r requirements.txt` at any future date may pull breaking changes. There is no `requirements.lock`, `poetry.lock`, or `uv.lock` file.

---

### [MEDIUM] No `package-lock.json` integrity or npm audit integration in CI

There is no CI pipeline (no `.github/workflows/`, no `vercel.json` build checks, no pre-commit hooks). The `npm audit` and `pip-audit` commands are not run. Known CVEs in dependencies will not be surfaced automatically.

---

### [LOW] `next.config.mjs` is empty

```javascript
const nextConfig = {};
```

No security headers (`X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`), no image domain allow-list, no redirect rules for the future login flow, and no bundle analyzer configuration. Security headers should be added before any public deployment.

---

### [LOW] `app/page.tsx` hardcodes `/sunview/dashboard` as the redirect target

```typescript
redirect("/sunview/dashboard");
```

The string `sunview` is a hardcoded tenant slug. When real tenants are onboarded, this redirect makes no sense. It should redirect to `/login` in production or read the tenant from a cookie/session.

---

## 8. Performance Concerns

### [MEDIUM] Zustand stores accumulate encounter data in memory indefinitely during a session

`vitalsStore`, `examFindingsStore`, `diagnosisStore`, and `refractionStore` all use the pattern `encounters: Record<string, ...>`. Each encounter the user opens adds an entry. There is no eviction, no maximum size, and no `cleanup` action. In a busy clinic with 20+ appointments per day, the in-memory state will grow throughout the day. Combined with the `persist` middleware on `encounterStore`, the `localStorage` entry also grows unbounded.

---

### [MEDIUM] Mock personas file (`lib/mock/personas.ts`) is eagerly imported and cannot be code-split

The `getInitialStoreState` function is called in a `useState` initializer on the encounter page. Because it is called synchronously on mount, the entire 788-line personas module is included in the initial page bundle. In production this should be replaced by an API call and the mock import removed.

---

### [LOW] Audit log tenant-wide query runs two separate database queries (count + data) with duplicated filter logic

**File:** `app/api/routes/audit.py` — `get_tenant_audit_logs`

The tenant-wide audit log endpoint builds the filter conditions twice: once for the `COUNT(*)` query and once for the paginated data query. If a filter is added to one but not the other, the total count will be incorrect. This should use a single CTE or SQLAlchemy's `with_labels` approach.

---

## 9. Observability & Testing Gaps

### [HIGH] Zero test coverage — no unit tests, no integration tests, no e2e tests

There are no `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx` files in the project. There are no pytest files for the Python backend. The `package.json` `scripts` object has no `test` entry. Critical paths (Rx validation, finalization logic, RBAC enforcement, audit log writes) are entirely untested. In a HIPAA-regulated application, the absence of tests for clinical calculation logic is a material risk.

---

### [MEDIUM] `console.error` is used for silent audit failures and JSON parse errors in production

Four `console.error` calls exist in production code paths:
- AI Scribe JSON parse error (two occurrences in `useAiScribe.ts`)
- AI Accept audit log failure (`encounter/[encounterId]/page.tsx`)
- AI Accept general error

These errors are invisible to operators. There is no error tracking (Sentry, Datadog, etc.) and no structured logging. A silent audit failure in production will not trigger any alert.

---

### [LOW] No health check endpoint on the FastAPI backend

`app/main.py` only exposes `GET /` which returns a static JSON object. There is no `/health` or `/healthz` endpoint that checks database connectivity, which is needed for load balancer health checks and deployment readiness probes.

---

## 10. Summary Priority Matrix

| # | Item | Priority | Category |
|---|---|---|---|
| 1 | Backend dev-bypass when SUPABASE_JWT_SECRET is empty | CRITICAL | Security |
| 2 | Hardcoded SECRET_KEY default in config | CRITICAL | Security |
| 3 | Hardcoded Supabase project URL in source | CRITICAL | Security |
| 4 | Frontend mock session initialized unconditionally | CRITICAL | Security |
| 5 | No Next.js route middleware — all pages publicly accessible | CRITICAL | Security |
| 6 | No PHI access logging on READ operations | CRITICAL | HIPAA |
| 7 | Python FastAPI files co-located with Next.js `app/` | CRITICAL | Architecture |
| 8 | No patient or scheduling API | HIGH | Missing Feature |
| 9 | No login page or real auth flow | HIGH | Missing Feature |
| 10 | Staff management has no audit logging | HIGH | HIPAA |
| 11 | PatientProblem CRUD has no audit logging | HIGH | HIPAA |
| 12 | Diagnosis model lacks `recorded_by_id` | HIGH | HIPAA |
| 13 | Audit trail sidebar / admin log calls 404 in production | HIGH | Bug |
| 14 | Clinical transcript stored in localStorage without expiry | HIGH | Security |
| 15 | Encounter state (ePHI) persisted to localStorage indefinitely | HIGH | Security |
| 16 | 7-day access token with no refresh or revocation | HIGH | Security |
| 17 | No rate limiting on AI Scribe or any endpoint | HIGH | Security |
| 18 | 9 pages import from mock data modules in production | HIGH | Mock Dependency |
| 19 | Mock personas seed stores and can block real API data | HIGH | Mock Dependency |
| 20 | No Alembic migrations — schema management is manual | HIGH | Tech Debt |
| 21 | Zero test coverage | HIGH | Testing |
| 22 | Frontend API client calls backend directly (not proxied) | HIGH | Architecture |
| 23 | `unlockEncounter` has no backend enforcement | HIGH | Architecture |
| 24 | `clearSession` does not clear ePHI from localStorage | MEDIUM-HIGH | Security |
| 25 | AI Scribe accept silently drops audit failures | MEDIUM | Bug |
| 26 | camelCase / snake_case contract untested end-to-end | MEDIUM | Tech Debt |
| 27 | VitalsCreate uses CamelCaseModel — inconsistent with all other schemas | MEDIUM | Tech Debt |
| 28 | Duplicate `DiagnosisResponse` in two schema files | MEDIUM | Tech Debt |
| 29 | Tenant isolation has no RLS defense-in-depth | MEDIUM | Architecture |
| 30 | Analytics page shows hardcoded KPIs with no demo disclaimer | MEDIUM | Mock Dependency |
| 31 | Billing export entitlement is dead code | MEDIUM | Missing Feature |
| 32 | Encounter addenda not implemented | MEDIUM | Missing Feature |
| 33 | ICD-10 picker is a static list of ~25 codes | MEDIUM | Missing Feature |
| 34 | Zustand stores accumulate state in memory without eviction | MEDIUM | Performance |
| 35 | `requirements.txt` uses `>=` with no pinned versions | MEDIUM | Tech Debt |
| 36 | `venv/` may be in git tree | MEDIUM | Tech Debt |
| 37 | `next.config.mjs` is empty — no security headers | LOW | Security |
| 38 | `app/page.tsx` hardcodes `sunview` tenant slug | LOW | Tech Debt |
| 39 | Zustand DevTools enabled unconditionally in production | LOW | Security |
| 40 | No health check endpoint on FastAPI backend | LOW | Observability |
| 41 | Audit log export runs no-limit query — OOM risk at scale | LOW | Performance |
| 42 | Known TS error: `personas.ts` line 240 `iop_method` literal | LOW | Bug |
| 43 | `StaffUpdateRequest` inherits raw `BaseModel` not `AppBaseModel` | LOW | Tech Debt |
| 44 | Vitals mock ID committed on save failure — blocks future updates | MEDIUM | Bug |
