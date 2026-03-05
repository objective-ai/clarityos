---
phase: 01-security-auth-foundation
plan: 01
subsystem: infra
tags: [fastapi, security, csp, zustand, devtools]

# Dependency graph
requires:
  - phase: none
    provides: none
provides:
  - Python backend relocated to backend/ (no namespace conflict with Next.js App Router)
  - All secrets enforced via Pydantic Field(...) — startup fails if env vars missing
  - Dev auth bypass removed from security.py
  - Security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
  - Zustand devtools conditional on NODE_ENV across all 9 stores
affects: [01-02, 01-03, api-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [pydantic-field-required, conditional-devtools]

key-files:
  created: []
  modified:
    - backend/core/config.py
    - backend/core/security.py
    - next.config.mjs
    - store/sessionStore.ts
    - store/themeStore.ts
    - store/tenantCustomizationStore.ts
    - store/refractionStore.ts
    - store/encounterStore.ts
    - store/vitalsStore.ts
    - store/examFindingsStore.ts
    - store/diagnosisStore.ts
    - store/problemListStore.ts

key-decisions:
  - "Flat mirror relocation: app/ Python → backend/ with same internal structure"
  - "Pydantic Field(...) for all secrets — no defaults, startup crash if missing"
  - "Complete removal of dev bypass in security.py (not behind a flag)"

patterns-established:
  - "const isDev = process.env.NODE_ENV === 'development'; devtools({ enabled: isDev }) on all Zustand stores"
  - "Security headers via next.config.mjs headers() function"

requirements-completed: [SEC-01, SEC-02, SEC-03, SEC-09, SEC-10, INF-01]

# Metrics
duration: ~25min
completed: 2026-03-05
---

# Plan 01-01: Backend Relocation & Security Hardening Summary

**Python backend relocated to backend/, all secrets enforced via Pydantic Field(...), dev auth bypass removed, security headers added, Zustand devtools gated on NODE_ENV**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 14+

## Accomplishments
- All Python files relocated from app/ to backend/ — no namespace conflict with Next.js App Router
- All 5 secrets in config.py use Field(...) with no defaults — app crashes on startup if any env var is missing
- Dev bypass block in security.py completely removed — no fallback TenantContext when JWT secret is empty
- Security headers (CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy) in next.config.mjs
- Zustand devtools conditional (`{ enabled: isDev }`) across all 9 stores

## Task Commits

1. **Task 1: Relocate Python backend + harden secrets** - `a3f7912` (feat)
2. **Task 2: Security headers + conditional devtools** - `a3f7912` (feat)

## Files Created/Modified
- `backend/**` - All Python files relocated from app/
- `backend/core/config.py` - Field(...) for SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, SECRET_KEY
- `backend/core/security.py` - Dev bypass block removed
- `next.config.mjs` - Security headers added
- `store/*.ts` (9 files) - Devtools conditional on isDev

## Decisions Made
- Flat mirror relocation preserving internal structure
- Complete bypass removal (not feature-flagged)
- CSP allows Supabase domains for img-src and connect-src

## Deviations from Plan
None - plan executed as written.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- backend/ directory ready for Alembic setup (Plan 01-02)
- Security hardening unblocks all subsequent plans
- config.py Field(...) pattern ready for new env vars

---
*Phase: 01-security-auth-foundation*
*Completed: 2026-03-05*
