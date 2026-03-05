# Domain Pitfalls

**Project:** ClarityOS EHR
**Domain:** Multi-tenant optometry EHR/PMS SaaS — mock-to-production migration, Supabase Auth integration, FastAPI backend deployment, FHIR R4 export, scheduling
**Researched:** 2026-03-05
**Sources:** Supabase official docs, CVE-2025-29927 analysis, FHIR R4 / HL7 ophthalmology IG, HIPAA Security Rule, Alembic migration guides, PostgreSQL RLS documentation, Zustand SSR hydration issue tracker

---

## Critical Pitfalls

Mistakes that cause data breaches, HIPAA violations, production outages, or full rewrites.

---

### Pitfall 1: Auth Bypass Survives to Production Because "It Only Skips in Dev"

**What goes wrong:** The FastAPI `security.py` dev bypass (return hardcoded doctor context when `SUPABASE_JWT_SECRET` is empty) is rationalized as a dev convenience. It ships to staging or production when the env var is misconfigured, forgotten, or set to an empty string by the deployment platform. All FastAPI endpoints become unauthenticated reads/writes of ePHI with zero log evidence.

**Why it happens:** Developers treat environment variables as deployment-time config, but platforms like Railway and Fly.io require secrets to be explicitly set per environment. A missing secret is silently an empty string in Python's `os.environ.get()` pattern with a default. The codebase's current pattern (`if not settings.SUPABASE_JWT_SECRET`) triggers on both missing and empty.

**Consequences:** Full unauthenticated read/write on every clinical endpoint. HIPAA breach. BAA invalidation.

**Prevention:**
- Remove the bypass entirely before deployment. There is no safe form of this pattern.
- Replace with `raise RuntimeError("SUPABASE_JWT_SECRET must be set")` at startup if empty.
- Add a startup check in `app/main.py` lifespan event that asserts all required secrets are non-empty.
- Harden `SECRET_KEY` the same way: remove the default string so the app refuses to start without it.

**Detection:** Search for `if not settings.SUPABASE_JWT_SECRET` in `app/core/security.py`. If the line exists and returns a context object, the bypass is active.

**Phase:** Must be addressed in Phase 1 (Security Hardening) before any backend deployment.

---

### Pitfall 2: Next.js Middleware Is Not Sufficient for Route Protection (CVE-2025-29927)

**What goes wrong:** The project currently has no `middleware.ts`. When it is added to protect routes via Supabase Auth session checks, the implementation pattern that checks session in middleware and redirects unauthenticated users is vulnerable to CVE-2025-29927 (disclosed March 2025). Any attacker who sends `x-middleware-subrequest` with the correct internal value bypasses the middleware entirely and accesses protected routes without authentication.

**Why it happens:** Next.js middleware was designed for edge-side logic (redirects, rewrites, header injection). It was not designed to be a security boundary. The internal subrequest header that enables middleware chaining can be spoofed from outside.

**Consequences:** Full access to all tenant routes without login. Patient records, encounter data, staff information exposed. Makes the middleware-as-guard pattern a false sense of security.

**Prevention:**
- Never rely on Next.js middleware as the sole auth check. It is a UX gate, not a security boundary.
- Every Server Component and Route Handler that touches ePHI must call `supabase.auth.getUser()` (not `getSession()`) independently.
- `getSession()` reads from cookies without revalidating with the auth server — it can be spoofed. `getUser()` makes a network call to verify the token. Use `getUser()` in all server-side protection checks.
- Upgrade Next.js to 14.2.24 or later (patched version). The project is on Next.js 14 — verify patch level.
- Keep the middleware for redirect UX only; treat every server-side data fetch as if middleware does not exist.

**Detection:** `grep -r "getSession" app/` in server components indicates the insecure pattern. The absence of `middleware.ts` means routes are currently wide open.

**Phase:** Phase 1 (Security Hardening). Middleware must be written and the getSession/getUser distinction enforced from day one of auth integration.

---

### Pitfall 3: Mock Session Store Pre-Seeds Production With Premium Doctor Access

**What goes wrong:** `store/sessionStore.ts` initializes Zustand state with `getMockSession("premium_doctor")`. This runs unconditionally, including in the production Vercel build. If the Supabase Auth wiring is incomplete, fails silently, or is partially deployed, every visitor to the live URL is silently authenticated with full clinical access under a fake identity.

**Why it happens:** Mock initialization is added for fast local development and never gated on `NODE_ENV`. Partial auth migrations where some stores are wired to real auth but others still fall back to mock are especially dangerous — the UI looks authenticated but the identity is fake.

**Consequences:** Anyone with the Vercel URL has premium doctor access. All audit log entries for this period will have a fake `user_id`. Irreversible compliance problem.

**Prevention:**
- Remove the `getMockSession()` default initialization before writing the first Supabase Auth integration line.
- Replace with `session: null` as initial state. The app must render an unauthenticated state and redirect to `/login`.
- Do not attempt incremental auth migration while the mock session default exists. It must be replaced atomically.
- Add a Vercel environment variable `NEXT_PUBLIC_USE_MOCK_SESSION=false` check as a last resort guard, but treat this as belt-and-suspenders only — not as the primary protection.

**Detection:** `grep -r "getMockSession" store/sessionStore.ts` — if it appears as a store initializer (not inside a test or dev-only function), the vulnerability is active.

**Phase:** Phase 1 (Security Hardening). This must be removed before `middleware.ts` is written, not after.

---

### Pitfall 4: ePHI in localStorage Without Expiry or Logout Clearing

**What goes wrong:** Two separate localStorage persistence problems exist simultaneously:
1. `encounterStore` persists the entire encounter map (AI SOAP notes, chief complaints, signed-by names) via Zustand `persist` middleware with no TTL.
2. `draft-transcript-{encounterId}` keys hold raw dictation transcripts (full clinical narrative) indefinitely.

Neither is cleared on logout (`clearSession` only resets the Zustand in-memory session store). On shared workstations — the standard in clinical settings — the next user who opens the browser sees the previous clinician's patient data before their own auth session loads.

**Why it happens:** Zustand `persist` middleware requires explicit configuration to set a TTL or hook into logout. The `clearSession` action was written as a stub with a TODO comment and never completed.

**Consequences:** HIPAA Technical Safeguard violation (164.312(a)(2)(iii) — automatic logoff; 164.312(b) — audit controls for ePHI access). On a shared workstation this is effectively a data breach per access.

**Prevention:**
- `clearSession` must call `localStorage.removeItem('clarity-encounters')` and iterate to remove all `draft-transcript-*` keys.
- The Zustand `persist` configuration for `encounterStore` should use a custom `storage` wrapper that checks session validity before returning persisted data.
- Set a TTL on the encounter persist data using the `partialize` + custom `storage` pattern, or simply do not persist encounter data to localStorage at all — fetch from API on mount instead.
- After auth integration, the Supabase `onAuthStateChange` listener should trigger localStorage purge on `SIGNED_OUT` events.

**Detection:** Open DevTools → Application → Local Storage on the deployed Vercel URL. If `clarity-encounters` contains patient names, diagnoses, or AI summaries, the violation is active.

**Phase:** Phase 1 (Security Hardening). Must be addressed before real patient data ever touches the frontend.

---

### Pitfall 5: Python Backend Co-Located in Next.js `app/` Directory Causes Build-Time Conflicts

**What goes wrong:** FastAPI source lives inside `app/` alongside App Router pages. When Next.js route handlers (`route.ts` files) are added to `app/api/` — which is required for audit log proxying, AI Scribe accept, and any server-side Next.js API — they will conflict with `app/api/routes/*.py`. Next.js will attempt to resolve `app/api/` as a routing subtree and find Python files. Build outputs on Vercel include the Python files as dead weight. `__pycache__` artifacts appear next to JSX components.

**Why it happens:** The backend was scaffolded before the project structure was defined. Moving it later feels disruptive. It keeps getting deferred.

**Consequences:** Cannot add any Next.js API route handlers until the conflict is resolved. The audit trail sidebar, AI accept action, and any server-side proxy all require `route.ts` files in `app/api/`. These currently 404 in production. Deferring the move makes it progressively harder as both codebases grow.

**Prevention:**
- Move the entire FastAPI codebase to a top-level `backend/` directory as the first action in the backend deployment phase.
- Update all import paths in Python files (`from app.core` → `from backend.core` or restructure with `src/`).
- Update `alembic.ini` and any scripts that reference the old path.
- The move is a single refactor commit — it is painful once and free forever.

**Detection:** `ls app/__init__.py` — if this file exists, the conflict is active.

**Phase:** Phase 2 (Backend Deployment). Must be the first task of that phase before any new `route.ts` files are written.

---

### Pitfall 6: No Alembic = Manual Schema Management = Data Destruction Risk

**What goes wrong:** Without Alembic, every schema change (adding `recorded_by_id` to `Diagnosis`, adding the `Appointment` model for scheduling, adding FHIR export columns) must be applied via raw SQL. There is no migration history. `seed_db.py` is the only setup script, and it destroys existing data. A developer who runs `seed_db.py` against a staging database with real test data loses everything with no undo path.

**Why it happens:** Initial development used `create_all()` to iterate fast. Migrations feel like overhead when the schema is changing daily. The technical debt compounds: the longer Alembic is deferred, the more schema drift exists between environments.

**Consequences:** Cannot safely add the `Appointment` model (scheduling), `recorded_by_id` on `Diagnosis` (HIPAA gap), or any FHIR-related schema changes without risking data loss. Production database changes become prayer-and-raw-SQL.

**Prevention:**
- Add Alembic before the backend is deployed with real data. Once real patient data exists, any schema change without migrations is a liability.
- Do NOT put the database URL in `alembic.ini` — read from env vars in `env.py` to avoid committing credentials.
- Import ALL models in `env.py` (common mistake: Alembic generates empty migrations because it cannot see models that are not imported).
- Always test `alembic upgrade head` and `alembic downgrade -1` locally before applying to staging.
- Replace `requirements.txt` with pinned versions at the same time (use `pip-compile` or `uv`).

**Detection:** `ls backend/alembic.ini` (or `app/alembic.ini`) — if no file exists, migrations are not set up.

**Phase:** Phase 2 (Backend Deployment). Alembic must be in place before any data-carrying deployment.

---

## Moderate Pitfalls

---

### Pitfall 7: `getSession()` Used in Server Context Returns Unvalidated Cookie Data

**What goes wrong:** When Supabase Auth is integrated, the natural pattern pulled from tutorials and older docs is `supabase.auth.getSession()` in Server Components and Route Handlers. `getSession()` reads from the cookie storage without making a network call to the Supabase auth server. It does not validate the JWT signature against the server's public keys. A tampered cookie can claim any role, any tenant, any user ID.

**Why it happens:** `getSession()` is faster (no network round-trip) and its name implies it is the right call for getting the current session. The security distinction is counterintuitive.

**Consequences:** An attacker can craft a cookie claiming to be a doctor in any tenant, pass `getSession()` validation, and access clinical data. The existing `hydrateRealSession` function in `lib/auth/mock-session.ts` already decodes JWT with `atob()` without signature verification — this pattern will likely be cargo-culted into the real auth integration.

**Prevention:**
- Use `supabase.auth.getUser()` in ALL server-side protection checks. It makes a network call but validates the token cryptographically.
- Use `supabase.auth.getClaims()` as a faster alternative when the middleware has already refreshed the token — it validates against published public keys without a full server round-trip.
- `getSession()` is only acceptable in client-side components where the user can tamper anyway.
- Add a code review checklist item: "No `getSession()` in server components or route handlers."

**Detection:** `grep -rn "getSession" app/` — any usage in server components (`page.tsx`, `layout.tsx`, or `route.ts` files without `"use client"`) is the vulnerable pattern.

**Phase:** Phase 1 (Auth Integration). Must be a team rule from the first auth commit.

---

### Pitfall 8: Mock Store `init()` Guard Blocks Real API Data From Loading

**What goes wrong:** All clinical stores (`vitalsStore`, `refractionStore`, `diagnosisStore`, `examFindingsStore`) use an `init()` pattern that checks "don't overwrite existing state." The encounter page currently calls `getInitialStoreState()` on mount, which seeds all stores from mock personas. When real API calls land later in the same component lifecycle, the stores already have data and `init()` no-ops. Real clinical data from the API is silently dropped.

**Why it happens:** The guard was added to prevent re-initialization when navigating back to an already-loaded encounter. It works correctly when the first write is from the API, but breaks when mock data pre-empts it.

**Consequences:** In a partially migrated state, real API data does not appear in the UI. Developers see the encounter page working (it shows mock data) and assume the API integration succeeded. The bug is invisible without explicit logging.

**Prevention:**
- Remove the `getInitialStoreState()` mock seed call before writing any API integration code. Do not attempt to run them in parallel.
- For each store, migrate the `init()` guard to use the API data's ID (e.g., `if (state.encounters[encounterId]?.vitalsId)`) rather than presence of any data. API-sourced data has real UUIDs; mock data has fake IDs.
- During migration, add console warnings in `init()` when it no-ops: `console.warn("init() skipped — existing state detected")`. This surfaces the bug in development.

**Detection:** Load the encounter page while the network tab is open. If API calls succeed (200) but the UI shows mock patient names or mock Rx values, the guard is blocking real data.

**Phase:** Phase 3 (Mock-to-API Migration). Each store migration must remove the mock seed before wiring the API call.

---

### Pitfall 9: vitalsStore Save Failure Commits a Mock ID That Permanently Breaks Future Saves

**What goes wrong:** `vitalsStore` catches API errors and creates a fake ID (`mock-vitals-${Date.now()}`). This fake ID is committed to the store's `committed` state. On the next save attempt, the store sends a PUT request with this fake ID — which the backend rejects with 404 or creates a duplicate. The user never sees an error. The vitals data appears saved locally but is never persisted to the database.

**Why it happens:** The fallback was added to prevent the UI from appearing broken during development when the backend is not running. It was not removed before the API integration phase.

**Consequences:** Silent data loss. Vitals that appear saved in the UI are not in the database. On page reload (which will fetch from API), the data is gone. In a finalized encounter, the attestation is signed but the vitals record doesn't exist.

**Prevention:**
- Remove all mock ID fallback patterns in `catch` blocks before API integration.
- Replace with an explicit error state: `set({ saveError: 'Network failure — vitals not saved', saveStatus: 'error' })`.
- Show a visible error toast to the clinician. Silent data loss is worse than a visible error.
- Implement a retry queue for failed saves using a background effect that retries with exponential backoff.

**Detection:** `grep -rn "mock-vitals-" store/vitalsStore.ts` — if the string exists in a catch block, the pattern is active.

**Phase:** Phase 3 (Mock-to-API Migration). Address in the same commit that wires up real vitals save.

---

### Pitfall 10: Tenant Isolation Relies Solely on Python-Layer WHERE Clauses With Service Role Key

**What goes wrong:** The FastAPI backend connects to Supabase using the service role key, which bypasses all PostgreSQL RLS policies. Tenant isolation is enforced entirely by the Python code adding `WHERE tenant_id = :tenant_id` to every query. A single query that omits this clause — a rushed admin endpoint, a new developer's first route, a query copied without the filter — exposes all tenants' data.

**Why it happens:** The comment in `security.py` acknowledges this and calls it "future work." The `search_path` schema-per-tenant approach described in `db/base.py` was never implemented. Using the service role key is the path of least resistance for Supabase backends.

**Consequences:** Cross-tenant data leakage. In a HIPAA context, accessing another patient's records — even accidentally — is a reportable breach if there is a reasonable likelihood of harm.

**Prevention:**
- Enable RLS on all tenant-scoped tables as a defense-in-depth layer. Even if the Python layer is the primary enforcement, RLS prevents accidental leakage at the database layer.
- Create a Supabase role that is not the service role but has tenant-scoped permissions, set via `SET app.current_tenant_id = :tenant_id` before queries. This allows RLS policies to reference `current_setting('app.current_tenant_id')`.
- Add a middleware test that makes a request with Tenant A's JWT and asserts zero rows from Tenant B are returned.
- Code review rule: every new route file must be checked for `tenant_id` filter presence.

**Detection:** Audit all FastAPI route files for `SELECT` queries without `.filter(Model.tenant_id == ctx.tenant_id)`. Any missing filter is a cross-tenant leak.

**Phase:** Phase 2 (Backend Deployment). RLS policies should be enabled on Supabase before the first real tenant is created.

---

### Pitfall 11: FHIR VisionPrescription Maps Incorrectly to Refraction Store Fields

**What goes wrong:** When implementing FHIR R4 export, developers map the internal refraction schema (sphere, cylinder, axis, add, prism, base, VA fields split by eye and by type: manifest, cycloplegic, contact) to FHIR's `VisionPrescription` resource. The FHIR `VisionPrescription` requires `lensSpecification[].eye` (right/left), `lensSpecification[].product` (lens type), and fields like `sphere`, `cylinder`, `axis`, `prism`, and `add` — but these do not directly accommodate the multi-row refraction schema (manifest vs. cycloplegic vs. contact lens Rx stored separately in the `Refraction` model).

**Why it happens:** The FHIR `VisionPrescription` was designed for dispensed prescriptions, not for the structured refraction measurement records that optometry EHRs capture during an exam. There is no FHIR R4 resource for "manifest refraction measurement" — it maps to `Observation`, not `VisionPrescription`.

**Consequences:** Exporting manifest refraction as `VisionPrescription` is semantically incorrect and will fail FHIR validator checks. Importing systems (pharmacy, optical labs, other EHRs) will misinterpret the exported data. Retrospective correction is expensive.

**Prevention:**
- Use `Observation` resources (with the HL7 Ophthalmology IG LOINC codes) for refraction measurements (sphere, cylinder, axis, VA).
- Use `VisionPrescription` only for the finalized, prescriber-signed prescription that would be given to a patient for glasses or contacts.
- The `Refraction` model rows map to `Observation` resources with component observations (one component per parameter: sphere, cylinder, axis, etc.), each coded with LOINC.
- `ExamFindings` (anterior/posterior) map to `Observation` with SNOMED CT codes per the HL7 Ophthalmology Eye Region Finding profile.
- `Diagnosis` maps to FHIR `Condition` with ICD-10 code, laterality extension, and link to the `Encounter`.

**Detection:** Review any FHIR serialization code for `Refraction` model rows mapped to `VisionPrescription`. That is the incorrect mapping.

**Phase:** Phase 4 (FHIR Export). Mapping design must be reviewed before any serialization code is written.

---

### Pitfall 12: Supabase Middleware Running on Static Assets Causes 9x Middleware Executions Per Page

**What goes wrong:** When `middleware.ts` is added without a `matcher` configuration, Next.js runs it on every request — including `_next/static/` bundles, favicon, images, and prefetched links. Supabase's official pattern calls `supabase.auth.getClaims()` in middleware, which is a lightweight JWT validation but still adds latency. Without a matcher, a single page load can trigger 9+ middleware executions.

**Why it happens:** The Supabase quickstart guide does not emphasize the matcher requirement. Developers add middleware, test it on the main route, and ship without noticing the static asset overhead.

**Consequences:** Measurable latency increase on every page load. Increased Vercel middleware invocation billing. Potential 400 errors from middleware executing on prefetched link requests.

**Prevention:**
- Always add a matcher that excludes static files:
  ```typescript
  export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
  }
  ```
- Do not perform Supabase auth operations in middleware on static asset paths.

**Detection:** Open the Network tab and load any page. Count how many requests show middleware processing overhead. If `_next/static/` requests take longer than expected, middleware is running on them.

**Phase:** Phase 1 (Auth Integration). Add the matcher in the same commit as the middleware file.

---

### Pitfall 13: Audit Log Failures Silently Drop — HIPAA Violation Without Anyone Knowing

**What goes wrong:** The AI Scribe accept action fires the audit log write as fire-and-forget with only a `console.error` on failure. There are no Next.js API route handlers for audit log writes — `fetch('/api/encounters/${id}/audit-logs')` hits a 404 in production. HIPAA requires audit trails for all ePHI access and modification. Silent drops mean the audit trail has gaps with no visibility to operators.

**Why it happens:** Audit logging is treated as secondary to the primary write operation. The "don't fail the user action just because audit failed" philosophy is correct in principle but wrong in implementation — it requires a compensating mechanism (retry queue, dead letter log), not silent discard.

**Consequences:** The audit trail viewed in the admin panel is incomplete. If a breach investigation requires reconstruction of access events, the log cannot be trusted. HIPAA 164.312(b) violation.

**Prevention:**
- Audit log writes must be synchronous within the request-response cycle for mutation operations (finalization, AI accept, diagnosis changes). Do not fire-and-forget.
- On the FastAPI backend, audit logging should happen inside the same database transaction as the primary write. If the audit write fails, the primary write rolls back.
- The Next.js audit log fetch calls that target relative `/api/` paths must be replaced with `apiFetch()` calls to the FastAPI backend URL.
- Add an alerting mechanism (even basic Sentry breadcrumbs) so audit write failures surface to operators.

**Detection:** Look for `.catch((e) => console.error("Audit log failed"))` patterns — these indicate silent drop. Look for `fetch('/api/...')` with relative paths that have no corresponding `route.ts` file.

**Phase:** Phase 2 (Backend Deployment) and Phase 3 (Mock-to-API Migration). Fix the 404 paths in Phase 2; make audit synchronous in Phase 3.

---

## Minor Pitfalls

---

### Pitfall 14: Zustand SSR Hydration Mismatch From localStorage Persistence

**What goes wrong:** `encounterStore` uses Zustand `persist` with localStorage. On initial server render, localStorage is unavailable. The server renders with the default store state. The client hydrates with the localStorage data. If these differ (e.g., a tenant customization accent color is in localStorage), React throws a hydration mismatch warning in development and silently renders incorrectly in production.

**Prevention:** Use a hydration guard: a `useState(false)` flag set to `true` in `useEffect`, rendering placeholder content until client-side hydration is complete. Alternatively, migrate tenant customization from localStorage to server-side cookies so SSR can access the same value.

**Detection:** `React Hydration Error` in browser console on first load. Compare server-rendered HTML with the client DOM for any persisted store value.

**Phase:** Phase 3 (Mock-to-API Migration). Address when the persist configuration is updated for real data.

---

### Pitfall 15: camelCase / snake_case API Contract Mismatch Will Fail Silently at Runtime

**What goes wrong:** `VitalsCreate` schema uses `CamelCaseModel` while every other schema uses `AppBaseModel` (snake_case). The `vitalsStore` sends a snake_case payload. `populate_by_name=True` should handle this, but it has never been tested end-to-end. A silent failure means vitals are not saved without any error surfacing to the UI.

**Prevention:** Write a single integration test that sends a vitals payload from the TypeScript store format and asserts a 200 response with the correct saved values. Make `VitalsCreate` consistent with all other schemas (snake_case, `AppBaseModel`) to remove the ambiguity.

**Phase:** Phase 2 (Backend Deployment). Fix the schema inconsistency before wiring the frontend.

---

### Pitfall 16: Duplicate `DiagnosisResponse` Schemas Diverge Without Warning

**What goes wrong:** Two `DiagnosisResponse` classes exist (`diagnosis.py` and `encounter.py`). As the codebase evolves, a field added to one is not added to the other. Encounter-embedded diagnosis data has different fields than the standalone diagnosis endpoint response. Frontend code that uses one format will break on the other.

**Prevention:** Delete the local definition in `encounter.py` and import from `diagnosis.py`. One source of truth.

**Phase:** Phase 2 (Backend Deployment). Fix before both paths are exercised from the real frontend.

---

### Pitfall 17: `next.config.mjs` Has No Security Headers — Required Before Public Deployment

**What goes wrong:** There are no `X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`, or `X-Content-Type-Options` headers. The app is currently deployed on Vercel without these. Clickjacking, content injection, and MIME sniffing attacks are possible. For a HIPAA-regulated product these headers are a minimum expectation in any security review.

**Prevention:**
```javascript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];
```
Add to `next.config.mjs` `headers()` function.

**Phase:** Phase 1 (Security Hardening). Takes 15 minutes and blocks no other work.

---

### Pitfall 18: Zustand DevTools Broadcasts ePHI to Any Browser Extension in Production

**What goes wrong:** All stores are wrapped in `devtools()` unconditionally. Any user who has the Redux DevTools browser extension installed (common for developers, sometimes installed on shared workstations) can see full store state including patient names, AI-generated SOAP notes, session tokens, and encounter data.

**Prevention:**
```typescript
devtools(store, { enabled: process.env.NODE_ENV !== 'production' })
```

**Phase:** Phase 1 (Security Hardening). One-line fix per store.

---

### Pitfall 19: ICD-10 Static List of ~25 Codes Will Break Credibility With Clinicians

**What goes wrong:** The `DiagnosisPicker` has 25 hardcoded optometry ICD-10-CM codes. A clinician who searches for H52.13 (myopia, bilateral) or H40.1130 (primary open-angle glaucoma, right, mild) and finds nothing will distrust the entire product. Optometry requires access to the full ICD-10-CM set (~70,000 codes), filtered to relevant chapters.

**Why it happens:** The static list was sufficient for demo purposes but was never flagged for replacement.

**Prevention:** Integrate an ICD-10-CM API (NLM's Clinical Table Search Service is free and has a FHIR-compatible endpoint) or load the full ICD-10-CM code set as a SQLite/PostgreSQL table and implement server-side search. Filter by chapter range (H00-H59 for optometry-relevant codes as a default).

**Detection:** In `DiagnosisPicker.tsx`, a static array literal rather than an API call for code search.

**Phase:** Phase 3 or 4. Block on completing auth and API integration first; this is a UX credibility issue, not a blocking bug.

---

## Phase-Specific Warning Matrix

| Phase Topic | Most Likely Pitfall | Mitigation |
|-------------|---------------------|------------|
| Security Hardening | Auth bypass survives to production (Pitfall 1) | Remove bypass, fail startup on missing secrets |
| Security Hardening | Mock session pre-seeds production (Pitfall 3) | Replace with `session: null` before any auth code |
| Security Hardening | ePHI in localStorage, no logout clear (Pitfall 4) | Complete `clearSession` implementation first |
| Security Hardening | Security headers absent (Pitfall 17) | `next.config.mjs` headers() — 15 minutes |
| Auth Integration | `getSession()` used in server context (Pitfall 7) | Enforce `getUser()`/`getClaims()` rule |
| Auth Integration | Middleware bypass via CVE-2025-29927 (Pitfall 2) | Middleware for UX only; every server fetch validates independently |
| Auth Integration | Middleware runs on static assets (Pitfall 12) | Add matcher config on day 1 |
| Backend Deployment | No Alembic before real data (Pitfall 6) | Alembic setup is the first task of backend deployment |
| Backend Deployment | Python in `app/` blocks `route.ts` files (Pitfall 5) | Move to `backend/` before writing first route handler |
| Backend Deployment | Tenant isolation relies on Python-only WHERE clauses (Pitfall 10) | Enable RLS before first tenant |
| Backend Deployment | Duplicate schemas diverge (Pitfall 16) | Consolidate before both paths are used |
| Backend Deployment | camelCase/snake_case mismatch (Pitfall 15) | Integration test before frontend wiring |
| Mock-to-API Migration | Mock `init()` guard blocks real data (Pitfall 8) | Remove mock seed before writing API fetch |
| Mock-to-API Migration | Mock vitals ID committed on failure (Pitfall 9) | Remove mock ID fallback in same commit as real API wiring |
| Mock-to-API Migration | Audit log 404s silently (Pitfall 13) | Fix API paths before migration complete |
| Mock-to-API Migration | Zustand SSR hydration mismatch (Pitfall 14) | Add hydration guard when updating persist config |
| FHIR Export | Refraction mapped to VisionPrescription incorrectly (Pitfall 11) | Map refraction to Observation, signed Rx to VisionPrescription |
| Scheduling | No appointment model or API | Appointment model + Alembic migration before UI work |

---

## Sources

- [Supabase Auth: Setting up Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) — Official, HIGH confidence
- [Supabase getSession vs getUser security discussion](https://github.com/supabase/auth-js/issues/898) — Official issue tracker, HIGH confidence
- [CVE-2025-29927: Next.js Middleware Authorization Bypass (OffSec)](https://www.offsec.com/blog/cve-2025-29927/) — HIGH confidence
- [CVE-2025-29927: Datadog Security Labs Analysis](https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/) — HIGH confidence
- [FHIR R4: HL7 Ophthalmology Eye Region Finding IG](https://hl7.org/fhir/uv/eyecare/2021sep/StructureDefinition-observation-eye-region-finding.html) — Official HL7, HIGH confidence
- [FHIR: VisionPrescription Resource (v6 ballot)](https://build.fhir.org/visionprescription.html) — Official HL7, HIGH confidence
- [PostgreSQL RLS Multi-Tenant Pitfalls (AWS)](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) — MEDIUM confidence
- [Postgres RLS Implementation Guide — Permit.io](https://www.permit.io/blog/postgres-rls-implementation-guide) — MEDIUM confidence
- [Alembic with FastAPI: real problems guide](https://medium.com/grid-solutions/alembic-migrations-in-python-a-complete-guide-with-real-problems-you-will-face-c0029093afe4) — MEDIUM confidence
- [Zustand persist + Next.js SSR hydration issues (GitHub)](https://github.com/pmndrs/zustand/discussions/1382) — HIGH confidence (official repo)
- [HIPAA Security Rule Summary (HHS.gov)](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) — Official, HIGH confidence
- CONCERNS.md — ClarityOS EHR codebase audit, 44 identified issues — HIGH confidence (first-party)
