# Project Research Summary

**Project:** ClarityOS EHR — Production Readiness Milestone
**Domain:** Multi-tenant optometry EHR/PMS SaaS (California solo/small-group practices)
**Researched:** 2026-03-05
**Confidence:** HIGH (auth/architecture), MEDIUM (FHIR mapping, hosting costs)

## Executive Summary

ClarityOS EHR has a fully built frontend running on mock data with a complete encounter workflow (vitals, refractions, findings, AI Scribe, finalization, RBAC, audit). This production readiness milestone is fundamentally a migration and hardening effort, not a greenfield build. The core challenge is not what to build but in what order: three critical security gaps (auth bypass, mock session seeding, ePHI in localStorage) must be closed before any real patient data can safely touch the system. The architecture is sound — Next.js 14 on Vercel, FastAPI on Render, Supabase for Auth and Postgres — but the Python backend must be relocated from `app/` to `backend/` before any other backend work can proceed. This is the first non-negotiable task.

The recommended approach is a layered migration in 6 phases driven by hard dependencies: security hardening first, then auth wiring, then infrastructure (backend relocation, Alembic, BFF proxies), then store-by-store migration from mock to real API, then the remaining clinical features (scheduling, patient detail, addenda, ICD-10 full search), and finally FHIR R4 export as the interoperability differentiator. Every phase depends cleanly on the previous one completing. Attempting to build scheduling or patient APIs before real auth is wired will result in endpoints with no meaningful access control.

The primary risks are HIPAA compliance gaps that are active today on the deployed Vercel URL: the mock session store seeds premium doctor access unconditionally, encounter data persists in localStorage with no logout clearing, and the FastAPI dev bypass grants unauthenticated clinical access when `SUPABASE_JWT_SECRET` is missing or empty. These are not future risks — they are current violations if any real patient data is ever introduced. All three must be fixed before Phase 2 begins. The FHIR export work carries a specific technical risk: manifest refraction data must map to FHIR `Observation` resources (not `VisionPrescription`), and the relevant LOINC codes need verification against the HL7 Ophthalmology IG before implementation.

---

## Key Findings

### Recommended Stack

The existing stack (Next.js 14, Tailwind 3.4, shadcn/ui, Zustand 4.5, FastAPI, SQLAlchemy 2.0) is locked and appropriate. The additive packages required for this milestone are minimal: `@supabase/ssr` (0.9.0) for SSR-aware auth in Next.js App Router — the deprecated `@supabase/auth-helpers-nextjs` must not be used; `react-big-calendar` (1.19.4) with `date-fns` as its localizer for the calendar UI; `swr` (2.x) for data fetching with stale-while-revalidate semantics; and `fhir.resources[r4b]` (8.2.0) on the Python side for Pydantic-v2-backed FHIR resource construction. The FastAPI backend must be hosted on Render (not Vercel, which cannot run ASGI or SSE streams), with Render's Organization plan providing the HIPAA BAA at $250/month minimum versus Railway's $1,000/month Enterprise minimum.

**Core technologies:**
- `@supabase/ssr` 0.9.0: SSR-aware auth for App Router — replaces deprecated `auth-helpers-nextjs`; cookie-based sessions; required for `middleware.ts`
- `PyJWT[crypto]` + `PyJWKClient`: Supabase JWT verification in FastAPI — replaces `python-jose`; required for ES256 JWKS support (Supabase default after May 2025)
- `react-big-calendar` 1.19.4: Calendar UI — MIT, full class override compatible with glassmorphism design system, no paid tier required for 1-4 provider target market
- `swr` 2.x: Data fetching — lightweight (8KB vs TanStack's 47KB), covers all needed patterns (fetch, revalidate on focus, optimistic mutation)
- `fhir.resources[r4b]` 8.2.0: FHIR resource construction — Pydantic V2 compatible, export-only facade pattern, no FHIR server required
- Render (Organization plan): FastAPI hosting — HIPAA BAA available at $250/month vs Railway's $1,000/month Enterprise minimum; native Uvicorn support via git push or Dockerfile

### Expected Features

**Must have (table stakes — blocking production use):**
- Security hardening: remove FastAPI dev bypass, remove mock session seed, complete `clearSession` localStorage purge, add Next.js security headers, gate Zustand devtools to development only
- Real auth: login page with Supabase `signInWithPassword`, `middleware.ts` route protection with correct `matcher`, HIPAA-compliant inactivity timeout (15-30 min), `sessionStore` hydration from real JWT claims
- Backend relocation: move all Python files from `app/` to `backend/` (namespace conflict blocks all BFF route handlers)
- Alembic migrations: required before any schema changes; use async-compatible `env.py`, import all models for autogenerate
- Store migration: replace all 9 mock imports (encounterStore, vitalsStore, refractionStore, examFindingsStore, diagnosisStore, patients page, schedule page, dashboard page) with `apiFetch()` calls; invert idempotent init guards so API data wins
- PHI read logging: `log_action("READ", ...)` on all GET ePHI endpoints — HIPAA 164.312(b)
- Fix 404 API routes: audit trail sidebar, AI Scribe accept, admin audit log all call nonexistent Next.js handlers; create BFF `route.ts` proxies

**Should have (core new capabilities):**
- Patient CRUD API + patient detail page with Rx history, encounter timeline, and refraction comparison across visits
- Encounter addenda: append-only `EncounterAddendum` model, immutable after creation, displayed inline below finalized encounter
- Appointment model + scheduling API: full CRUD, status transitions (scheduled → checked_in → in_exam → completed), double-booking prevention via PostgreSQL unique constraint
- Calendar view wired to real data via `react-big-calendar` + Supabase Realtime Postgres Changes
- FHIR R4 export: `GET /api/patients/{id}/fhir-export` returning Bundle with Patient + Encounter + Condition[] + Observation[] (NOT VisionPrescription for refraction measurements)
- ICD-10 full code search: replace 25-code static picker with SQLite/PostgreSQL-backed search endpoint (NLM Clinical Table Search Service or embedded CMS fixture)
- Supabase Custom Access Token Hook: SQL function that injects `tenant_id` + `role` into JWT `app_metadata` claims at token issuance

**Defer (not essential for this milestone):**
- Analytics dashboard with Recharts — data-dependent; meaningful only after real encounter data flows
- MFA/TOTP — HIPAA 2025 rule will mandate for remote access; Supabase TOTP is free; add after core auth is stable
- Appointment reminders (SMS/email) — requires Twilio/SendGrid; defer to scheduling V2
- Bulk FHIR export — per-encounter export covers referral use case; bulk is for ONC certification
- AI patient history synthesis — requires multi-visit real data; milestone after analytics
- Patient portal, billing integration, optical POS, device import (OCT/visual field), SMART on FHIR authorization server — explicitly out of scope

### Architecture Approach

The target architecture is a clean three-tier system: Next.js 14 on Vercel (frontend + BFF layer), FastAPI on Render (clinical API + FHIR export + AI Scribe SSE), and Supabase (Auth + PostgreSQL). Browser clients send JWT Bearer tokens to FastAPI; FastAPI verifies JWTs via JWKS (ES256) from Supabase's published JWKS endpoint and scopes all queries by `tenant_id` extracted from `app_metadata` claims. Sensitive FastAPI origin URL stays server-side only (no `NEXT_PUBLIC_` prefix); Next.js Route Handlers act as a BFF proxy for the two endpoints that currently 404. The Supabase Custom Access Token Hook is the keystone of this architecture: without it, JWTs contain no `tenant_id` and all FastAPI tenant scoping fails. FHIR export uses a facade pattern — SQLAlchemy models mapped to `fhir.resources` Pydantic objects on demand, no persistent FHIR storage.

**Major components:**
1. `middleware.ts` (Next.js, project root) — token refresh, UX redirect gate only; NOT a security boundary (CVE-2025-29927)
2. `app/api/` Route Handlers (Next.js BFF) — proxy to FastAPI keeping origin server-side; token forwarding; no clinical business logic
3. Zustand stores — client state, optimistic UI, debounced saves; must be purged of all mock seeding before API integration
4. FastAPI auth middleware (`backend/core/security.py`) — JWKS-based ES256 JWT verification via `PyJWT[crypto]`; extracts `TenantContext`; dev bypass must be removed
5. FastAPI clinical routes (`backend/api/routes/`) — RBAC enforcement, `tenant_id`-scoped DB queries, synchronous audit log writes
6. Supabase Custom Access Token Hook — SQL function injecting `tenant_id` + `role` into JWTs; must be registered before login page is testable
7. `fhir_export.py` facade — maps SQLAlchemy models to FHIR R4B resources via `fhir.resources`; `Observation` for refraction measurements, `VisionPrescription` only for finalized signed prescriptions

### Critical Pitfalls

1. **Auth bypass reaches production** — The FastAPI `security.py` returns hardcoded doctor context when `SUPABASE_JWT_SECRET` is empty or missing. Deployment platforms silently set missing env vars to empty strings. Prevention: raise `RuntimeError` at app startup if any required secret is empty; remove all bypass logic entirely.

2. **Mock session seeds premium doctor access unconditionally** — `getMockSession("premium_doctor")` runs in production Vercel builds today. Any partial auth migration leaves all visitors with full clinical access under a fake audit identity. Prevention: replace with `session: null` as the very first action of auth integration — before writing a single line of Supabase Auth code.

3. **Next.js middleware is not a security boundary (CVE-2025-29927)** — The `x-middleware-subrequest` header can bypass middleware entirely. Treat middleware as a UX redirect gate only. Every Server Component and Route Handler that touches ePHI must independently call `supabase.auth.getUser()` (not `getSession()`, which does not revalidate against the auth server).

4. **ePHI persists in localStorage with no logout clearing** — `encounterStore` Zustand persist and `draft-transcript-{id}` keys accumulate patient data indefinitely on shared clinical workstations. `clearSession()` currently only resets in-memory Zustand state. Prevention: complete `clearSession` implementation first — `localStorage.removeItem('clarity-encounters')` + iterate and remove all `draft-transcript-*` keys.

5. **Python backend in `app/` blocks all Next.js route handlers** — `app/api/routes/*.py` conflicts with `app/api/[route]/route.ts` namespace. Next.js will process Python files as dead route handlers. Cannot create audit log proxy, AI Scribe accept proxy, or any BFF handler until all Python files are moved to `backend/`. This is the first task of the entire milestone.

6. **Mock `init()` guard silently blocks real API data** — All clinical stores have `if (key already exists) return` guards seeded by mock personas on mount. When real API calls land, stores already have data and `init()` no-ops. Real clinical data is silently dropped. Prevention: remove `getInitialStoreState()` mock seed call before writing any API integration code.

7. **FHIR refraction mapping to wrong resource type** — Manifest refraction measurements must map to FHIR `Observation` resources (with HL7 Ophthalmology IG LOINC codes), not `VisionPrescription`. `VisionPrescription` is for finalized dispensed prescriptions only. Incorrect mapping will fail FHIR validators and corrupt receiving EHR imports.

---

## Implications for Roadmap

Based on the dependency graph in FEATURES.md and the build order in ARCHITECTURE.md, the research strongly supports a 6-phase structure. Every phase is a hard dependency for the next.

### Phase 1: Security Hardening
**Rationale:** Three active HIPAA violations exist on the deployed Vercel URL today. No real patient data can safely touch the system until these are closed. This phase has zero dependencies on other phases and unblocks everything.
**Delivers:** A system that can legally receive real clinical data; all active security gaps closed
**Addresses:** Auth bypass removal, mock session replacement with `session: null`, `clearSession` localStorage purge, Next.js security headers in `next.config.mjs`, Zustand devtools gated to development
**Avoids:** Pitfalls 1, 3, 4, 17, 18 (auth bypass, mock session seed, ePHI in localStorage, missing security headers, devtools exposure)

### Phase 2: Auth Integration
**Rationale:** Real auth must be wired before any real data is stored. The Supabase Custom Access Token Hook is the keystone — without it, JWTs have no `tenant_id` and all FastAPI tenant scoping fails. This phase must complete atomically; partial auth migration with mock session still present is dangerous.
**Delivers:** Working login page, SSR-protected routes, real JWT claims in sessionStore, FastAPI JWKS verification, Supabase Custom Access Token Hook registered
**Addresses:** Login page (`/login`), `middleware.ts` with correct `matcher`, `sessionStore` hydration from real JWT, `PyJWT[crypto]` JWKS verification in FastAPI, inactivity timeout
**Uses:** `@supabase/ssr` 0.9.0, `PyJWT[crypto]`
**Avoids:** Pitfalls 2, 7, 12 (CVE-2025-29927 middleware bypass, getSession in server context, middleware on static assets)

### Phase 3: Backend Infrastructure
**Rationale:** Moving Python to `backend/` must precede all Next.js BFF route handler creation. Alembic must be set up before any schema changes (Appointment model, addenda, recorded_by_id fix). Both are foundational — deferring either blocks all subsequent phases.
**Delivers:** Clean namespace separation, Alembic migration toolchain, BFF proxy route handlers for the two currently-404 endpoints, FastAPI deployable on Render, pinned Python dependencies
**Addresses:** Backend relocation (`app/` → `backend/`), Alembic async setup, `app/api/encounters/[id]/audit-logs/route.ts`, `app/api/encounters/[id]/ai-scribe/accept/route.ts`, duplicate `DiagnosisResponse` schema consolidation, `VitalsCreate` camelCase/snake_case fix
**Avoids:** Pitfalls 5, 6, 13, 15, 16 (Python namespace conflict, no Alembic, audit log 404s, schema mismatch, duplicate schemas)

### Phase 4: Store Migration (Mock to Real API)
**Rationale:** With auth and infrastructure complete, each store can be migrated store-by-store. Order matters: `encounterStore` first (root), then `vitalsStore`, `refractionStore`, `examFindingsStore`, `diagnosisStore`. Dashboard, patients, and schedule pages follow. All mock imports removed. PHI read logging added to all GET endpoints. This phase makes the system functionally real.
**Delivers:** All 9 mock imports replaced with `apiFetch()` calls, PHI read logging on all GET ePHI endpoints, idempotent init guards inverted, `lib/mock-*` files removed from production bundles
**Addresses:** Store-by-store migration, `GET /api/encounters/{id}` loading, PHI read logging (`log_action("READ", ...)`), vitals mock-ID fallback removal, Zustand SSR hydration guard
**Uses:** `swr` 2.x for data fetching
**Avoids:** Pitfalls 8, 9, 13, 14 (init guard blocking real data, mock vitals ID committed on failure, audit 404, SSR hydration mismatch)

### Phase 5: Clinical Features
**Rationale:** With real data flowing, the three missing clinical capabilities can be built on a stable foundation. Patient API enables scheduling (appointments reference patients). Scheduling enables analytics. Addenda are self-contained. ICD-10 full search is a UX credibility fix that becomes urgent once real clinicians use the system.
**Delivers:** Patient CRUD API + patient detail page with Rx history and encounter timeline, encounter addenda (append-only, HIPAA-compliant), Appointment model + scheduling API, calendar view with Supabase Realtime, ICD-10 full search endpoint, create-encounter-from-appointment flow
**Addresses:** `Patient` model routes, `EncounterAddendum` model (Alembic migration), `Appointment` model with unique constraint for double-booking prevention, `react-big-calendar` calendar UI, Supabase Realtime Postgres Changes subscription, ICD-10 SQLite or PostgreSQL-backed search, RLS as defense-in-depth for tenant isolation
**Uses:** `react-big-calendar` 1.19.4 + `date-fns`, Supabase Realtime (already provisioned)
**Avoids:** Pitfall 10 (tenant isolation via Python-only WHERE clauses), Pitfall 19 (25-code ICD-10 picker)

### Phase 6: FHIR R4 Export + Analytics
**Rationale:** FHIR export is a differentiator, not table stakes, and requires real encounter data to be meaningful. Analytics similarly requires real data accumulated over Phase 4-5. Both are deliverable only after the clinical foundation is complete. FHIR export is the more impactful of the two for the referral use case.
**Delivers:** `GET /api/patients/{id}/fhir-export` FHIR Bundle (Patient + Encounter + Condition[] + Observation[]), frontend export button on patient detail page, analytics KPI dashboard with Recharts replacing hardcoded StatCards
**Addresses:** FHIR facade mapper, `fhir.resources[r4b]` 8.2.0 installation, LOINC-coded `Observation` resources for refraction and vitals, `VisionPrescription` for finalized signed Rx only, `Diagnosis.recorded_by_id` Alembic migration (HIPAA attribution gap), analytics aggregation queries on Appointment + Encounter tables
**Uses:** `fhir.resources[r4b]` 8.2.0, Recharts
**Avoids:** Pitfall 11 (refraction mapped to VisionPrescription instead of Observation)

### Phase Ordering Rationale

- **Security before auth:** The mock session seed is an active threat; it must be replaced with `session: null` before the first line of Supabase Auth integration code is written, not after.
- **Auth before backend infrastructure:** The Supabase Custom Access Token Hook must be registered before the login page is testable end-to-end. Backend move can happen in parallel with auth but must complete before BFF route handlers are created.
- **Backend relocation as first task of Phase 3:** It is the single refactor that unblocks all Next.js BFF route handler creation. The longer it is deferred, the harder it becomes.
- **Alembic before any schema changes:** Appointment model, addenda, `recorded_by_id` fix — all require migrations. No real-data schema changes without Alembic.
- **Store migration before clinical features:** Clinical features (patient detail, scheduling) depend on real encounter data flowing. Building them on mock data would require a second migration.
- **FHIR last:** Export is meaningless without real clinical data to export. The facade pattern requires stable SQLAlchemy models that stop changing.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (Auth):** Supabase Custom Access Token Hook SQL syntax should be verified in the Supabase Dashboard before implementation — the hook registration UI has changed across Supabase versions. The `entitlements[]` JWT claim mapping from the current `types/session.ts` type system needs explicit design work.
- **Phase 3 (Backend Infrastructure):** Render deployment configuration (`render.yaml` Web Service spec with `uvicorn` start command) needs a working example verified against current Render docs — platform UIs change frequently.
- **Phase 6 (FHIR):** LOINC codes for optometry-specific observations (sphere, cylinder, axis, add power, IOP) need verification against the HL7 Ophthalmology Eye Region Finding IG before any serialization code is written. The ARCHITECTURE.md research rates these MEDIUM confidence only.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Security Hardening):** All fixes are one-line changes to known files. No research needed.
- **Phase 4 (Store Migration):** The migration pattern is documented in ARCHITECTURE.md with concrete code. Mechanical execution.
- **Phase 5 — Supabase Realtime for scheduling:** Well-documented Postgres Changes pattern; no research needed. Double-booking via unique constraint is standard PostgreSQL.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All additions verified: `@supabase/ssr` 0.9.0 against official Supabase docs and GitHub releases; `fhir.resources` 8.2.0 via PyPI; `react-big-calendar` 1.19.4 via npm. Render HIPAA BAA verified via render.com/docs. SWR version not independently confirmed — run `npm info swr` before installing. |
| Features | HIGH | Feature set derived from CONCERNS.md (first-party codebase audit, 44 identified issues) + HIPAA Security Rule official sources. Feature dependencies accurately reflect code structure. |
| Architecture | HIGH | Supabase SSR middleware pattern, JWKS/ES256 JWT verification, Custom Access Token Hook, and Next.js BFF proxy pattern all verified against official 2025 documentation. FHIR R4B resource structure is MEDIUM — HL7 spec consulted but specific optometry LOINC codes need IG verification. |
| Pitfalls | HIGH | CVE-2025-29927 verified via OffSec and Datadog Security Labs. Supabase `getSession` vs `getUser` security distinction verified via official Supabase issue tracker. All other pitfalls derived from direct code inspection in CONCERNS.md. |

**Overall confidence:** HIGH

### Gaps to Address

- **LOINC codes for optometry observations:** The specific LOINC codes for sphere (79882-2), cylinder (79883-0), axis (79885-5), add power (79884-8), visual acuity (79880-6), and IOP (11399-0) are cited in the research but rated MEDIUM confidence. These must be cross-referenced against the HL7 Ophthalmology IG (`https://hl7.org/fhir/uv/eyecare/`) before Phase 6 FHIR mapping is written. Incorrect LOINC codes produce semantically invalid exports that fail at receiving systems.
- **`entitlements[]` claim mapping from JWT:** The existing `types/session.ts` defines `entitlements` as a typed array, but the Supabase Custom Access Token Hook SQL in ARCHITECTURE.md only injects `tenant_id` and `role`. The hook SQL must be extended to also inject `entitlements` from the `tenant_plans` or role configuration table, or the `useEntitlements` hook must derive entitlements from `role` + a static role-to-feature map. This design decision must be made in Phase 2.
- **Render `render.yaml` configuration:** Backend import paths change when moving from `app.main:app` to `backend.main:app`. The exact Render Web Service YAML spec and uvicorn start command (`uvicorn backend.main:app --host 0.0.0.0 --port $PORT --workers 4`) should be tested in a staging environment before the main branch deployment.
- **SWR version:** The SWR 2.x recommendation was not independently version-confirmed in this research session. Run `npm info swr version` to confirm latest stable before installing.

---

## Sources

### Primary (HIGH confidence)
- `CONCERNS.md` — ClarityOS EHR codebase audit, 44 identified issues (first-party)
- https://supabase.com/docs/guides/auth/server-side/nextjs — Supabase SSR Next.js guide
- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook — Custom Access Token Hook
- https://supabase.com/docs/guides/auth/signing-keys — ES256 JWKS key documentation
- https://www.offsec.com/blog/cve-2025-29927/ — CVE-2025-29927 Next.js middleware bypass
- https://securitylabs.datadoghq.com/articles/nextjs-middleware-auth-bypass/ — CVE-2025-29927 analysis
- https://pypi.org/project/fhir.resources/ — fhir.resources 8.2.0, February 2026
- https://github.com/supabase/ssr/releases — @supabase/ssr v0.9.0, March 2026
- https://render.com/docs/hipaa-compliance — Render HIPAA BAA documentation
- https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html — HIPAA Security Rule

### Secondary (MEDIUM confidence)
- https://objectgraph.com/blog/migrating-supabase-jwt-jwks/ — PyJWT JWKS migration guide
- https://bytegoblin.io/blog/implementing-supabase-authentication-with-next-js-and-fastapi.mdx — Supabase + FastAPI integration pattern
- https://railway.com/pricing — Railway HIPAA Enterprise pricing
- https://www.npmjs.com/package/react-big-calendar — react-big-calendar 1.19.4
- https://hl7.org/fhir/R4/visionprescription.html — FHIR R4 VisionPrescription resource
- https://hl7.org/fhir/uv/eyecare/2021sep/StructureDefinition-observation-eye-region-finding.html — HL7 Ophthalmology IG (2021 ballot — verify against current published version)
- https://berkkaraal.com/blog/2024/09/19/setup-fastapi-project-with-async-sqlalchemy-2-alembic-postgresql-and-docker/ — Alembic async setup

### Tertiary (LOW confidence — verify before use)
- LOINC codes for optometry observations (79882-2, 79883-0, 79885-5, 79884-8, 79880-6, 11399-0) — cited from general LOINC knowledge; must be verified against LOINC database and HL7 Ophthalmology IG before Phase 6
- SWR 2.x version — not independently confirmed in this research session

---
*Research completed: 2026-03-05*
*Ready for roadmap: yes*
