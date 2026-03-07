# Phase 1: Security & Auth Foundation - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Close all security gaps (dev bypass, hardcoded secrets, missing middleware), implement real Supabase Auth end-to-end (login page, JWT session, route protection, logout with ePHI cleanup), relocate Python backend from app/ to backend/ to resolve namespace conflict, and set up Alembic migration toolchain. After this phase, the system can legally receive real patient data.

</domain>

<decisions>
## Implementation Decisions

### Login Experience
- Login page uses full glassmorphism design — centered glass card on ambient gradient background, consistent with the app's existing aesthetic
- After successful login, redirect to the original URL the user was trying to visit (return-to URL pattern). Falls back to /{tenantId}/dashboard if no return URL
- Login error shown as inline error text below the form field — "Invalid email or password" style, red text, accessible
- Login page is a standalone route at /login — outside the (tenant) layout group

### Session & Logout Behavior
- 30-minute inactivity timeout shows a warning modal ("Session expiring in 2 minutes") with "Stay logged in" button before redirecting — critical for clinicians mid-charting
- On logout, clear all ePHI from localStorage (transcripts, encounter data, clinical state) but keep non-PHI preferences (theme, branding accent color)
- Use Supabase refresh token for silent token renewal — JWT expiry should never interrupt an active encounter workflow
- Logout confirmation only when unsaved work exists (dirty Zustand stores). Otherwise instant logout
- Zustand devtools disabled in production builds

### Backend Relocation
- Flat mirror structure: backend/main.py, backend/core/, backend/api/routes/, backend/db/ — same layout, just under backend/ instead of app/
- Alembic migrations directory inside backend/ (backend/alembic/) — keeps all Python together
- BFF route handlers in app/api/ following standard Next.js App Router convention (app/api/audit-logs/route.ts, app/api/ai-scribe/accept/route.ts)

### Supabase Auth Configuration
- Custom Access Token Hook (Edge Function) to inject tenant_id and role into JWT app_metadata — runs on every token mint, reads tenant_members table
- Admin-created accounts only — no public sign-up. Admin/owner creates staff accounts via admin panel. Staff receives credentials from admin
- No email confirmation required — instant access after admin creates account (small clinics, admin-managed)
- Supabase default password policy (minimum 6 chars) — keep it simple for small clinic staff

### Security Hardening
- Remove dev auth bypass in security.py — FastAPI must fail startup if SUPABASE_JWT_SECRET is unset
- Remove hardcoded SECRET_KEY default — startup fails if SECRET_KEY env var is missing
- Replace hardcoded Supabase URL with env var
- Add security headers to next.config.mjs: CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff
- Next.js middleware.ts protects all (tenant) routes — redirects to /login if no valid session

### Claude's Discretion
- Exact Alembic configuration (async driver setup, env.py configuration)
- Initial baseline migration content
- Security header CSP policy details (which domains to whitelist)
- How sessionStore hydrates from Supabase JWT claims (mapping logic from JWT payload to AppSession)
- BFF proxy implementation details (error handling, timeout, headers forwarding)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `types/session.ts`: Full JWT payload types (JwtPayload, AppSession, UserSession, TenantSession) — already defined, just needs real hydration instead of mock
- `lib/api-client.ts`: Already uses `supabase.auth.getSession()` for Bearer token — partially ready for real auth
- `lib/supabase.ts`: Supabase client exists with placeholder fallback — needs real env vars on Vercel
- `store/sessionStore.ts`: Session store shape is correct, just needs mock seed replaced with null initial + setSession() from real auth
- `lib/color-utils.ts`: Accent color derivation — non-PHI, safe to keep across logout
- `components/ThemeProvider.tsx`: Already has hydration guard — non-PHI, survives logout
- `app/core/security.py`: JWT verification logic exists — just needs dev bypass removed and startup guard added
- `app/core/config.py`: Pydantic Settings class — needs defaults removed for secrets

### Established Patterns
- Zustand stores with devtools middleware — all stores follow this pattern
- `@/*` path alias for all imports
- Glass card styling via `.glass-card` CSS class
- Entitlement-based feature gating via `useEntitlements().has()`

### Integration Points
- `app/page.tsx` currently redirects to /sunview/dashboard — needs to redirect to /login or check auth
- `app/(tenant)/[tenantId]/layout.tsx` — middleware must protect this entire route group
- `store/sessionStore.ts` line 61 — mock session seed point that needs to become null
- `lib/auth/mock-session.ts` — 4 mock scenarios, referenced by sessionStore and possibly other files
- `app/core/security.py` lines 68-75 — dev bypass that must be removed
- `app/core/config.py` lines 12, 21 — hardcoded secrets that must become required env vars

</code_context>

<specifics>
## Specific Ideas

- The login page glassmorphism should match the ambient gradient background used in the tenant layout (the animated gradient with teal/purple)
- Warning modal for session timeout should feel urgent but not alarming — glass card with a countdown timer, "Stay logged in" as primary action
- The logout ePHI cleanup should explicitly clear: draft-transcript-* keys, encounter-* keys, and any Zustand persisted stores that contain clinical data

</specifics>

<deferred>
## Deferred Ideas

- MFA via TOTP — tracked as SEC-V2-01 in requirements (v2)
- OAuth login with Google Workspace — tracked as SEC-V2-02 (v2)
- Supabase RLS policies as defense-in-depth — tracked as DEP-V2-03 (v2)

</deferred>

---

*Phase: 01-security-auth-foundation*
*Context gathered: 2026-03-05*
