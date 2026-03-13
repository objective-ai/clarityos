# ClarityOS EHR — System Architecture

## Overview

ClarityOS is a multi-tenant optometry EHR/PMS (Electronic Health Record / Practice Management System) built as a SaaS platform. The system separates into two independent runtimes:

- **Frontend**: Next.js 14 (App Router) served on Vercel
- **Backend**: Python FastAPI served via Uvicorn, backed by Supabase Postgres

Both runtimes share a common identity contract: the Supabase JWT, which carries `tenant_id`, `role`, and `entitlements[]` claims used for authorization on both sides.

---

## Frontend Architecture

### Framework and Stack

- **Next.js 14** with the App Router (RSC + Client Components)
- **TypeScript 5.5** in strict mode
- **Tailwind CSS 3.4** with PostCSS v3 pipeline (`tailwindcss` + `autoprefixer`)
- **shadcn/ui** component primitives (Card, Badge, Button, DropdownMenu, Dialog)
- **Zustand 4.5** for all client state
- **Supabase JS SDK** for auth token management
- **Fonts**: Plus Jakarta Sans (UI) + JetBrains Mono (clinical data)

### App Router Structure

```
app/
  layout.tsx                    Root layout — fonts + ThemeProvider
  page.tsx                      Redirect to /sunview/dashboard
  globals.css                   Global CSS tokens, glass system, animations
  (tenant)/
    [tenantId]/
      layout.tsx                Tenant shell: ambient-bg + Sidebar + TopNav
      dashboard/page.tsx        KPI command center
      schedule/page.tsx         Timeline view (entitlement-gated)
      patients/
        page.tsx                Glass table with search
        [patientId]/page.tsx    Patient detail + Rx history
      encounter/
        [encounterId]/page.tsx  Full clinical workspace (exam, Rx, AI Scribe)
      admin/page.tsx            Admin panel
      analytics/page.tsx        Analytics dashboard
      settings/page.tsx         Logo upload + accent color (owner/admin only)
```

### Route Groups

The `(tenant)` directory is a Next.js **route group** — the parentheses are a convention that prevents the segment name from appearing in the URL. It exists solely to apply a shared layout (`[tenantId]/layout.tsx`) across all clinic pages without affecting the URL path.

The resulting URL structure is: `/:tenantId/:section`, e.g., `/sunview/dashboard`, `/sunview/encounter/enc-001`.

### Layout Hierarchy

```
RootLayout (app/layout.tsx)
  ThemeProvider              — Syncs dark/light + derives 9 accent CSS vars
  (tenant)/[tenantId]/layout.tsx
    SidebarProvider          — Passes collapsed state via React Context
    Sidebar                  — Glass nav sidebar (collapsible)
    TopNav                   — Page title + sun/moon toggle + avatar (patient info shown inline on encounter routes)
    <main>
      {children}             — The actual page content
```

**ThemeProvider** is a client component that renders `null` (no DOM output). It uses two `useEffect` hooks: one to sync the `data-theme` attribute on `<html>`, and another to recompute all 9 accent CSS custom properties (`--accent`, `--accent-dim`, `--accent-hover`, `--accent-glow`, etc.) from a single hex color stored in the tenant customization store.

**SidebarProvider** is a thin React Context that passes the `sidebarCollapsed: boolean` value to any descendant that needs to adjust its layout (e.g., the EncounterBottomTabs).

### Multi-Tenancy Pattern

Tenancy on the frontend is entirely URL-driven: `[tenantId]` is a dynamic route segment extracted from `params.tenantId` in server components, or via `usePathname()` in client components. There is no global tenant context object separate from the session store — the tenant identity lives in `sessionStore.ts` as `session.tenant.tenantId`.

The sidebar receives `tenantId` as a prop and uses it to construct all navigation links: `/${tenantId}/dashboard`, `/${tenantId}/patients`, etc. This means navigating between clinics requires only a URL change.

**Current Dev State**: The `tenantId` from the URL is treated as an opaque slug. All data is mock. In production, `tenantId` would be validated against the JWT's `tenant_id` claim, and mismatch would trigger a redirect to `/unauthorized`.

---

## Backend Architecture

### Framework and Stack

- **FastAPI** (async, Python 3.12)
- **SQLAlchemy 2.0** with asyncio (async sessions via asyncpg)
- **Supabase Postgres** as the managed database
- **python-jose** for JWT verification
- **Anthropic SDK** for AI Scribe streaming
- **Pydantic v2** for request/response schema validation
- **pydantic-settings** for environment configuration

### Application Entry Point

`app/main.py` creates the FastAPI application, configures CORS (allowing `http://localhost:3000` in dev), and mounts all route groups under their prefix:

| Prefix               | Router Module         | Domain               |
|----------------------|-----------------------|----------------------|
| `/api/encounters`    | `encounter.py`        | Encounter CRUD       |
| `/api/encounters`    | `ai_scribe.py`        | AI Scribe SSE        |
| `/api/encounters`    | `refraction.py`       | Rx entry             |
| `/api/encounters`    | `vitals.py`           | Vitals/pre-test      |
| `/api/encounters`    | `exam_findings.py`    | Exam findings JSONB  |
| `/api/encounters`    | `diagnosis.py`        | ICD-10 diagnoses     |
| `/api/encounters`    | `promotion.py`        | Dx → Problem list    |
| `/api/patients`      | `patient_problem.py`  | Master problem list  |
| `/api/staff`         | `staff.py`            | Staff management     |
| `/api`               | `audit.py`            | Audit log queries    |

### Database Layer

#### Dual-Schema Architecture

The database uses two distinct SQLAlchemy declarative bases:

- **`PublicBase`** — SaaS control plane, always in the PostgreSQL `public` schema. Contains: `tenants`, `subscription_plans`, `tenant_addons`, `tenant_members`.
- **`TenantBase`** — Clinical data, intended for per-tenant schema routing. Currently all tables are in `public` but with a `tenant_id` column on every row. Tenant isolation is enforced at the Python layer (every query must include `.where(Model.tenant_id == ctx.tenant_id)`).

#### Async Session Pattern

`app/db/session.py` creates a single `AsyncEngine` (asyncpg, pool size 20) and an `async_sessionmaker`. Routes consume sessions via the `get_db` FastAPI dependency which auto-commits on success and rolls back on exception.

#### ORM Model Hierarchy

All clinical models use two mixins:
- **`TimestampMixin`**: `created_at` + `updated_at` (server-side `func.now()`)
- **`SoftDeleteMixin`**: `is_deleted: bool` + `deleted_at: datetime` — used on `Patient`, `Encounter`, `Diagnosis`, `PatientProblem` for HIPAA-compliant audit trail (no hard deletes)

The `AuditLog` model is append-only — it has no `SoftDeleteMixin`, no `updated_at`, and is never modified after insert.

#### Clinical Entity Relationships

```
Tenant (public)
  └── Staff (tenant_id FK, global_user_id → Supabase Auth)
  └── Patient (tenant_id FK, soft-deleted)
       └── Appointment (provider FK → Staff)
            └── Encounter (1:1 with Appointment, soft-deleted)
                 ├── VitalsAndPretest (1:1)
                 ├── Refraction[] (one per RefractionType: habitual/auto/manifest/cycloplegic/final)
                 ├── ExamFindings[] (unique per exam_section: anterior/posterior)
                 └── Diagnosis[] (soft-deleted, ICD-10)
  └── PatientProblem (master problem list, promoted from Diagnosis)
  └── AuditLog (append-only, immutable)
```

### Security and Auth Flow

#### Backend JWT Verification (app/core/security.py)

Every protected route depends on `get_current_tenant` (or its wrapper `require_permission`):

1. Extract `Authorization: Bearer <token>` header via `HTTPBearer`
2. If `SUPABASE_JWT_SECRET` is not configured, return a hardcoded dev `TenantContext` (known dev bypass — a documented known gap)
3. Decode and verify the JWT using `python-jose` with `HS256` and audience `"authenticated"`
4. Extract `sub` → `user_id` UUID, `app_metadata.tenant_id` → `tenant_id` UUID, `app_metadata.role` → staff role string
5. Return an immutable `TenantContext(user_id, tenant_id, role)` dataclass

#### RBAC: Permission Matrix (app/core/permissions.py)

`require_permission(action)` is a FastAPI dependency factory. It wraps `get_current_tenant` and checks the caller's role against `PERMISSION_MATRIX` — a static dict mapping each `ClinicalAction` enum value to a set of allowed `StaffRole` values.

16 actions are defined across 7 domains. Example restrictions:
- `FINALIZE_ENCOUNTER`: only `doctor`, `owner`
- `EDIT_EXAM_FINDINGS`: only `doctor`, `owner` (technicians can see but not modify)
- `VIEW_AUDIT_LOG`: only `admin`, `owner`
- `GENERATE_AI_SCRIBE`: only `doctor`, `owner`

#### Audit Logging (app/core/audit.py)

Every clinical route calls `log_action()` after a successful database operation. The function appends an `AuditLog` row with: who (user_id, staff_id), what (action, resource_type, resource_id), context (encounter_id, patient_id, IP address), and a JSONB `changes` diff for mutations. Records are never deleted — HIPAA 164.312(b) compliance.

### AI Scribe (app/api/routes/ai_scribe.py)

The AI Scribe is a streaming SSE endpoint (`POST /api/encounters/{id}/ai-scribe`) that:

1. Validates the encounter exists and is not finalized
2. Resolves the AI model via `get_tenant_ai_model()` (tenant-configurable, defaults to `claude-sonnet-4-6-20250514`)
3. Streams from Claude via the Anthropic SDK; emits `data: {"text": "..."}` events word-by-word
4. After Claude emits `___JSON_START___`, the backend extracts the SOAP narrative and saves it to `encounter.ai_summary_text`
5. Does NOT auto-save `assessment_and_plan` — only persists when the doctor explicitly applies via the merge panel
6. Appends an `AI_SCRIBE_GENERATED` audit log entry on completion

A companion endpoint (`POST /api/encounters/{id}/ai-scribe/accept`) is called after the provider applies resolutions from the inline merge panel. It persists `assessment_and_plan` if included, and appends an `AI_SCRIBE_AUTOFILL` audit log entry with the full before/after diff.

---

## State Management

### Zustand Store Architecture

All Zustand stores follow the same pattern: `create<State>()(devtools(persist?(...)))`. Stores with client-sensitive data (theme, tenant customization) are persisted to `localStorage`. Clinical stores (encounter, vitals, refraction, etc.) are ephemeral per session.

#### Store Inventory

| Store | File | Persisted | Purpose |
|-------|------|-----------|---------|
| `useSessionStore` | `store/sessionStore.ts` | No | Auth session (AppSession \| null) |
| `useThemeStore` | `store/themeStore.ts` | Yes (`clarity-theme`) | Dark/light preference |
| `useTenantCustomizationStore` | `store/tenantCustomizationStore.ts` | Yes (`clarity-tenant-customization`) | Logo URL + accent hex |
| `useEncounterStore` | `store/encounterStore.ts` | Yes (`clarity-encounters`) | Encounter status, finalization, AI summary |
| `useRefractionStore` | `store/refractionStore.ts` | No | 4-column Rx grid, draft/committed, save status |
| `useVitalsStore` | `store/vitalsStore.ts` | No | Vitals/pre-test fields per encounter |
| `useExamFindingsStore` | `store/examFindingsStore.ts` | No | Anterior + posterior findings per encounter |
| `useDiagnosisStore` | `store/diagnosisStore.ts` | No | ICD-10 diagnoses per encounter |
| `useProblemListStore` | `store/problemListStore.ts` | No | Master problem list per patient |

#### Store Relationships

```
sessionStore
  └── provides session.tenant.entitlements → consumed by useEntitlements()
  └── provides session.user.role → consumed by PermissionGate + useEntitlements()

tenantCustomizationStore
  └── accentColor → ThemeProvider → 9 CSS custom properties on :root

encounterStore
  └── encounters[id].isFinalized → RefractionGrid (read-only), ExamFindings (read-only)
  └── encounters[id].status → EncounterBottomTabs (advance button label)
  └── encounters[id].aiSummaryText → AiScribeWidget (display saved summary)

refractionStore
  └── columns[i].draft → RefractionGrid inputs
  └── columns[i].saveStatus → per-column save indicator
  └── columns[i].committed → baseline for dirty detection
  └── encounterId → used in saveColumnToAPI()

vitalsStore, examFindingsStore, diagnosisStore
  └── all keyed by encounterId
  └── all have draft/committed split with 1.5s debounce save
```

### Refraction Store: Draft/Committed Pattern

The refraction store is the most complex. Each of the 4 columns (Habitual, Auto, Manifest, Final) has:
- `draft`: live input state (updated on every keystroke)
- `committed`: last successfully saved server state
- `saveStatus`: `"idle" | "dirty" | "saving" | "saved" | "error"`
- `errors[]`: field-level validation errors

Save lifecycle: `idle → dirty (on keystroke) → saving (after 1.5s debounce) → saved (on API 200) | error`. Debounce timers are stored outside Zustand in a plain module-level `Record<number, NodeJS.Timeout>` to avoid triggering re-renders on timer creation/cancellation.

---

## Data Flow

### Mock Data → Stores → Components (Current Dev State)

```
lib/mock-patient-data.ts
lib/mock-schedule-data.ts
lib/mock-refraction-data.ts
lib/mock-vitals-data.ts
lib/mock-staff-data.ts
lib/mock/personas.ts
  └── getInitialStoreState(encounterId, patientId)
        └── encounter/[encounterId]/page.tsx
              ├── initEncounter(id, persona.encounter)
              ├── initVitals(id, persona.vitals)
              ├── initFindings(id, 'anterior_segment', persona.anteriorFindings)
              ├── initFindings(id, 'posterior_segment', persona.posteriorFindings)
              ├── initDiagnoses(id, persona.diagnoses)
              └── seedProblems(patientId, persona.problems)
```

All `init*` actions are idempotent — they skip if the key already exists in the store, preventing double-initialization on re-renders.

### API Client Chain (Production Path)

```
Component → Zustand store action
  → saveColumnToAPI() / apiFetch()
    → lib/api-client.ts: apiFetch()
      → supabase.auth.getSession()  (gets live Supabase access token)
      → fetch(`${NEXT_PUBLIC_API_URL}${path}`, { Authorization: Bearer <token> })
        → FastAPI endpoint
          → get_current_tenant() (verifies JWT)
          → require_permission(action) (RBAC check)
          → db query (scoped by tenant_id)
          → log_action() (HIPAA audit)
          → JSON response
    → Component state updated via store action
```

### AI Scribe Data Flow

```
Provider pastes transcript → AiScribeWidget (components/encounter/AiScribeWidget.tsx)
  → useAiScribe.generate(transcript)  [hooks/useAiScribe.ts]
    → POST /api/encounters/{id}/ai-scribe
      → FastAPI streams SSE: data: {"text": "..."}
      → Frontend accumulates text:
          before ___JSON_START___: updates soapText (displayed live)
          after  ___JSON_START___: buffers jsonBuffer (hidden)
      → data: {"done": true}
      → handleParsedJson(): strips markdown fences → JSON.parse()
      → normalizeScribeData()  [lib/scribe-normalizer.ts]
          rounds Rx to 0.25D, enforces minus-cyl, clamps axis 1-180, rounds IOP
      → structuredDataV2 stored in encounterStore.aiStructuredData

  → Widget status → "ai_ready": SOAP displayed, "Review & Merge (N)" button
  → Provider clicks "Review & Merge"
    → InlineReviewSection opens  [components/encounter/review-section/]
        Left pane: StickySoapNote (SOAPViewer with section syntax-highlighting)
        Right pane: ConflictTable — per-row Keep/Use AI toggles grouped by section
        buildConflicts(structuredDataV2, storeSnapshots) detects field-by-field diffs
          Sections: chief_complaint, vitals, exam_anterior, exam_posterior,
                    diagnoses, refraction(manifest), assessment_and_plan
          Rules: match → skip; AI only → default use_ai; conflict → default keep
                 new diagnoses → always default keep (clinical safety)
    → Provider reviews rows, optional "Approve All Safe (N)"
    → Provider clicks "Apply N Selected"
      → applyResolutions(encounterId, rows, soapText)  [conflict-resolver/applyResolutions.ts]
          dispatches use_ai rows to stores:
            encounterStore.setChiefComplaint / setAssessmentAndPlan
            vitalsStore.setField
            examFindingsStore.setStructureField
            diagnosisStore.addDiagnosis
            refractionStore.setCellValue
      → POST /api/encounters/{id}/ai-scribe/accept (audit log with diff)
```

---

## Key Abstractions

### ThemeProvider

A client-only "headless" component that renders `null`. It subscribes to two Zustand stores and applies changes to the DOM via:
- `document.documentElement.setAttribute("data-theme", theme)` — switches light/dark CSS class
- `document.documentElement.style.setProperty("--accent-*", ...)` — sets 9 CSS custom properties derived from the single accent hex using `hexToRgb()` and `lightenHex()` from `lib/color-utils.ts`

### EntitlementGating (useEntitlements)

`hooks/useEntitlements.ts` is the primary feature gate. It reads the session from Zustand and returns:
- `has(key)` — O(1) Set lookup against `session.tenant.entitlements`
- `hasAll(...keys)` / `hasAny(...keys)` — multi-key variants
- `requireRole(...roles)` — checks `user.role` or `user.clinicalRole` against allowed roles
- Safe defaults when session is null (all checks return false)

Superusers bypass all entitlement and role checks.

Entitlement keys are string literals defined in `lib/entitlements.ts` (frontend) and `app/core/entitlements.py` (backend). They must stay in sync.

### PermissionGate

`components/auth/PermissionGate.tsx` is a declarative React wrapper that:
- Accepts a `roles: StaffRole[]` prop
- Calls `useEntitlements().requireRole(...roles)`
- In `"hide"` mode (default): renders `null` or `fallback` when unauthorized
- In `"disable"` mode: renders children with `opacity-50 pointer-events-none aria-disabled`

Used throughout the encounter page to gate Exam Findings editing, Diagnosis entry, AI Scribe, and the Finalize button to `["doctor", "owner"]`.

### SaaS Entitlement Tiers

Three subscription tiers are defined (by convention, not enforced by a DB lookup on the frontend):
- **Core**: `scheduling`, `patient_demographics`, `basic_exam`, `icd10_diagnoses`
- **Plus**: adds `billing_export`, `multi_provider`
- **Premium**: adds `ai_scribe`, `advanced_analytics`, `equipment_import`

The `planName` in the session is derived from the entitlements Set at hydration time. Upsell modals are shown when a feature check fails.

---

## Cross-Cutting Concerns

### HIPAA Compliance

- Soft deletes on all PHI-bearing models (`Patient`, `Encounter`, `Diagnosis`, `PatientProblem`)
- Append-only `AuditLog` table with no update/delete operations
- Every READ and WRITE operation on clinical data calls `log_action()`
- `tenant_id` filter on every database query (Python-enforced, RLS as defense-in-depth)
- `ssn_last4` only — no full SSN stored

### Encounter Finalization

Finalization is a one-way operation enforced at three layers:
1. **Backend**: `POST /encounters/{id}/finalize` sets `is_finalized=True`, `finalized_at`, `signed_by_id`, `signed_at`. All subsequent PATCH requests return HTTP 409.
2. **Frontend Store**: `encounterStore.finalizeEncounter()` sets `isFinalized: true`. All form inputs switch to `readOnly`.
3. **UI**: `PermissionGate roles={["doctor", "owner"]}` gates the Finalize button. `clinicalReadOnly` computed flag disables all clinical input components.

Post-finalization, the backend syncs resolved diagnoses back to the master problem list by parsing `problem_id:` references in diagnosis notes.

### Dev vs Production Auth Bypass

The backend has an explicit development bypass: when `SUPABASE_JWT_SECRET` is not set, `get_current_tenant()` returns a hardcoded `TenantContext` with role `"doctor"`. This is a known security gap documented in the compliance audit log and must be removed before production.

The frontend similarly initializes `sessionStore` with `getMockSession("premium_doctor")` hardcoded in the store definition. The production swap is: remove the mock initialization and call `setSession(hydrateRealSession(jwt))` after a Supabase login response.
