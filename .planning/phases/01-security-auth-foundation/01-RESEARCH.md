# Phase 1: Security & Auth Foundation - Research

**Researched:** 2026-03-05
**Domain:** Supabase Auth, Next.js middleware, FastAPI security hardening, Alembic async migrations
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Login Experience**
- Login page uses full glassmorphism design — centered glass card on ambient gradient background, consistent with the app's existing aesthetic
- After successful login, redirect to the original URL the user was trying to visit (return-to URL pattern). Falls back to /{tenantId}/dashboard if no return URL
- Login error shown as inline error text below the form field — "Invalid email or password" style, red text, accessible
- Login page is a standalone route at /login — outside the (tenant) layout group

**Session & Logout Behavior**
- 30-minute inactivity timeout shows a warning modal ("Session expiring in 2 minutes") with "Stay logged in" button before redirecting — critical for clinicians mid-charting
- On logout, clear all ePHI from localStorage (transcripts, encounter data, clinical state) but keep non-PHI preferences (theme, branding accent color)
- Use Supabase refresh token for silent token renewal — JWT expiry should never interrupt an active encounter workflow
- Logout confirmation only when unsaved work exists (dirty Zustand stores). Otherwise instant logout
- Zustand devtools disabled in production builds

**Backend Relocation**
- Flat mirror structure: backend/main.py, backend/core/, backend/api/routes/, backend/db/ — same layout, just under backend/ instead of app/
- Alembic migrations directory inside backend/ (backend/alembic/) — keeps all Python together
- BFF route handlers in app/api/ following standard Next.js App Router convention (app/api/audit-logs/route.ts, app/api/ai-scribe/accept/route.ts)

**Supabase Auth Configuration**
- Custom Access Token Hook (Edge Function) to inject tenant_id and role into JWT app_metadata — runs on every token mint, reads tenant_members table
- Admin-created accounts only — no public sign-up. Admin/owner creates staff accounts via admin panel. Staff receives credentials from admin
- No email confirmation required — instant access after admin creates account (small clinics, admin-managed)
- Supabase default password policy (minimum 6 chars) — keep it simple for small clinic staff

**Security Hardening**
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

### Deferred Ideas (OUT OF SCOPE)
- MFA via TOTP — tracked as SEC-V2-01 in requirements (v2)
- OAuth login with Google Workspace — tracked as SEC-V2-02 (v2)
- Supabase RLS policies as defense-in-depth — tracked as DEP-V2-03 (v2)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-01 | Dev auth bypass removed — backend requires valid JWT at startup, no fallback identity when SUPABASE_JWT_SECRET is empty | security.py lines 69-75: conditional bypass block must be replaced with startup guard in config.py |
| SEC-02 | Hardcoded SECRET_KEY default removed — startup fails if SECRET_KEY env var is unset | config.py line 21: `str = "your-super-secret-key-..."` default must become required field |
| SEC-03 | Hardcoded Supabase project reference in config.py replaced with env var | config.py line 12: `str = "https://iedzzcokfwnbyfyevjoz.supabase.co"` must become required env var |
| SEC-04 | User can log in with email/password via Supabase Auth on a dedicated /login page | @supabase/ssr + supabase.auth.signInWithPassword(), new route app/login/page.tsx |
| SEC-05 | User can log out and all ePHI is cleared from localStorage | Explicit localStorage key clearing + Zustand clearSession() + supabase.auth.signOut() |
| SEC-06 | User session persists across browser refresh via Supabase JWT cookie | @supabase/ssr handles cookie storage automatically; onAuthStateChange hydrates sessionStore |
| SEC-07 | Next.js middleware protects all tenant routes — unauthenticated users redirected to /login | middleware.ts at project root using @supabase/ssr createServerClient + getUser() |
| SEC-08 | sessionStore hydrates from real Supabase JWT claims (role, tenant_id, entitlements) instead of mock session | Replace getMockSession() seed with null + onAuthStateChange listener that calls setSession(hydrateFromSupabaseSession()) |
| SEC-09 | Security headers added to Next.js config (CSP, X-Frame-Options, X-Content-Type-Options) | next.config.mjs headers() array |
| SEC-10 | Zustand devtools disabled in production builds | Conditional devtools wrapping via process.env.NODE_ENV check |
| INF-01 | Python backend relocated from app/ to backend/ directory | File move: app/main.py→backend/main.py, app/core/→backend/core/, app/api/→backend/api/, app/db/→backend/db/, app/schemas/→backend/schemas/ |
| INF-02 | Alembic initialized with async migration environment for existing SQLAlchemy models | alembic init -t async backend/alembic; env.py wired to asyncpg DATABASE_URL |
| INF-03 | Initial Alembic migration generated from current model state (baseline migration) | alembic revision --autogenerate -m "baseline" importing both PublicBase and TenantBase models |
| INF-04 | Next.js BFF route handler for audit log API (/api/audit-logs) | app/api/audit-logs/route.ts proxying to FastAPI |
| INF-05 | Next.js BFF route handler for AI Scribe accept endpoint (/api/ai-scribe/accept) | app/api/ai-scribe/accept/route.ts proxying to FastAPI |
| INF-06 | Supabase Custom Access Token Hook injects tenant_id and role into JWT claims | PostgreSQL function + Supabase dashboard hook configuration |
</phase_requirements>

---

## Summary

This phase closes all active security gaps that currently block production readiness. There are three parallel tracks: (1) Python backend hardening and relocation, (2) Supabase Auth integration end-to-end on the frontend, and (3) infrastructure plumbing (Alembic, BFF route handlers, security headers).

The codebase is well-structured for this work. The types are already defined (`types/session.ts` has the full `AppSession` shape), `lib/api-client.ts` already reads from `supabase.auth.getSession()`, and `lib/auth/mock-session.ts` has a `hydrateRealSession()` function. The primary work is replacing mock seeds with real auth flows and hardening the backend startup. The biggest gotcha is that the Python backend currently lives in `app/` which conflicts with Next.js App Router's `app/` directory — this must be resolved before any BFF route handlers can be created.

The most nuanced technical piece is the Supabase Custom Access Token Hook (INF-06): a PostgreSQL function must be written and registered in the Supabase dashboard that reads from the `tenant_members` table on every token mint to inject `tenant_id` and `role` into `app_metadata`. This is what flows the `hydrateRealSession()` mapping through to the frontend `AppSession`.

**Primary recommendation:** Execute the backend relocation (INF-01) first as a pure file-move — nothing else in this phase can be done cleanly until `app/` belongs entirely to Next.js.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | ^2.x (already installed) | Supabase client — auth, storage | Official client; already in package.json |
| @supabase/ssr | ^0.5.x (new install required) | Cookie-based auth for Next.js SSR | Required for server components + middleware cookie refresh |
| alembic | ^1.13+ | Database schema migrations | Official SQLAlchemy migration tool |
| asyncpg | ^0.30 (already in requirements.txt) | Async Postgres driver | Already installed; required for alembic async env |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-idle-timer | ^5.x | 30-min inactivity detection | Track user activity, emit events for warning modal |
| pydantic-settings | ^2.0 (already installed) | Environment variable validation at startup | Already used in config.py; just tighten required fields |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @supabase/ssr | Custom JWT cookie parsing | @supabase/ssr handles PKCE, cookie refresh, SSR/client split automatically; custom is ~300 lines for worse security |
| react-idle-timer | Custom mousemove/keydown listeners | react-idle-timer handles cross-tab sync, page visibility, throttling; custom solutions miss edge cases |
| Alembic async template | Standard sync template | Async template required because SQLAlchemy engine uses asyncpg; mixing sync/async causes event loop errors |

**Installation:**
```bash
npm install @supabase/ssr
pip install alembic  # if not already installed in venv
```

---

## Architecture Patterns

### Recommended Project Structure After This Phase

```
backend/                     # Python backend (moved from app/)
├── main.py                  # FastAPI application entry point
├── core/
│   ├── config.py            # Pydantic Settings — secrets now REQUIRED (no defaults)
│   ├── security.py          # JWT verification — dev bypass removed
│   ├── audit.py
│   ├── entitlements.py
│   └── permissions.py
├── api/
│   └── routes/              # All existing route files
├── db/
│   ├── base.py
│   ├── session.py
│   ├── mixins.py
│   └── models/
│       ├── public/saas.py
│       └── tenant/clinical.py
├── schemas/
├── alembic/                 # New — Alembic migration environment
│   ├── env.py               # Async-configured migration runner
│   ├── script.py.mako
│   └── versions/
│       └── 0001_baseline.py # Initial migration from current models
└── alembic.ini

app/                         # Next.js — OWNED ENTIRELY by Next.js after relocation
├── login/
│   └── page.tsx             # New — standalone login page (outside tenant layout)
├── page.tsx                 # Changed: redirect to /login (not /sunview/dashboard)
├── api/                     # BFF route handlers
│   ├── audit-logs/
│   │   └── route.ts         # New — proxies to FastAPI /api/audit-logs
│   └── ai-scribe/
│       └── accept/
│           └── route.ts     # New — proxies to FastAPI /api/encounters/*/ai-scribe/accept
├── (tenant)/[tenantId]/     # Unchanged layout, now middleware-protected
│   └── layout.tsx
└── globals.css

middleware.ts                # New — at project root, protects all tenant routes
lib/
├── supabase/
│   ├── client.ts            # Browser Supabase client (replaces lib/supabase.ts)
│   ├── server.ts            # Server component Supabase client
│   └── middleware.ts        # Middleware Supabase client helper
└── auth/
    ├── mock-session.ts      # Unchanged (dev tool, not deleted)
    └── session-hydrator.ts  # New — maps Supabase session → AppSession
components/
└── auth/
    └── SessionTimeoutModal.tsx  # New — inactivity warning modal
```

### Pattern 1: Supabase SSR Middleware Route Protection

**What:** middleware.ts at project root intercepts every request, checks Supabase session via cookie, redirects to /login if unauthenticated.

**When to use:** All routes under `/(tenant)/[tenantId]/` require authentication.

**Critical detail:** Use `supabase.auth.getUser()` NOT `getSession()` in server code. The Supabase team is explicit: getSession() does not revalidate the token server-side — getUser() makes a round-trip to Supabase Auth to verify.

**Example:**
```typescript
// middleware.ts — Source: https://supabase.com/docs/guides/auth/server-side/nextjs
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // CRITICAL: Use getUser() not getSession() — getUser() validates with Supabase Auth server
  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')
  const isTenantRoute = /^\/[^/]+\//.test(request.nextUrl.pathname)

  // Redirect unauthenticated users to /login with return URL
  if (!user && isTenantRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from /login
  if (user && isAuthRoute) {
    // Extract tenantId from JWT custom claims
    const tenantId = user.app_metadata?.tenant_id ?? 'sunview'
    return NextResponse.redirect(new URL(`/${tenantId}/dashboard`, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
```

### Pattern 2: Supabase Custom Access Token Hook

**What:** PostgreSQL function registered in Supabase dashboard that runs before every JWT is minted. Reads `tenant_members` table to inject `tenant_id` and `role` into `app_metadata`.

**When to use:** Every login, token refresh. This is what makes `user.app_metadata.tenant_id` available in the JWT that middleware and the backend both read.

**Example:**
```sql
-- backend/db/sql/custom_access_token_hook.sql
-- Register in Supabase: Authentication > Hooks > Custom Access Token
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_tenant_id uuid;
  v_role text;
BEGIN
  claims := event -> 'claims';

  -- Look up tenant membership for this user
  SELECT tm.tenant_id, tm.role
  INTO v_tenant_id, v_role
  FROM public.tenant_members tm
  WHERE tm.global_user_id = (event->>'user_id')::uuid
    AND tm.is_active = true
  LIMIT 1;

  -- Inject into app_metadata if tenant found
  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata}',
      COALESCE(claims->'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', v_tenant_id::text,
        'role', v_role
      )
    );
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

-- Grant execution to supabase_auth_admin
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
```

**Dashboard steps:** Authentication > Hooks > Custom Access Token > select `public.custom_access_token_hook`

### Pattern 3: sessionStore Hydration from Real Supabase Session

**What:** Replace the `getMockSession("premium_doctor")` seed in `sessionStore.ts` with null initial state + `onAuthStateChange` listener that maps Supabase's `Session` object to `AppSession`.

**Key mapping challenge:** Supabase's `Session` object exposes `session.user.app_metadata` (from the JWT custom claims). The existing `hydrateRealSession()` function in `lib/auth/mock-session.ts` already decodes a raw JWT string — but it doesn't have access to fields like `email` and `fullName` that aren't in the JWT payload. Those must come from `session.user.email` and `session.user.user_metadata.full_name`.

**Example:**
```typescript
// lib/auth/session-hydrator.ts
import type { Session } from '@supabase/supabase-js'
import type { AppSession, EntitlementKey, StaffRole } from '@/types/session'

export function hydrateFromSupabaseSession(session: Session): AppSession {
  const user = session.user
  const meta = user.app_metadata ?? {}
  const entitlements = (meta.entitlements ?? []) as EntitlementKey[]

  return {
    user: {
      userId: user.id,
      staffId: meta.staff_id ?? '',
      email: user.email ?? '',
      fullName: user.user_metadata?.full_name ?? user.email ?? 'Unknown',
      role: (meta.role ?? 'receptionist') as StaffRole,
      clinicalRole: meta.clinical_role as StaffRole | undefined,
      isSuperuser: meta.is_superuser === true,
      avatarInitials: buildInitials(user.user_metadata?.full_name ?? user.email ?? '?'),
    },
    tenant: {
      tenantId: meta.tenant_id ?? '',
      schemaName: meta.schema_name ?? '',
      clinicName: meta.clinic_name ?? 'Clinic',
      planName: meta.plan_name ?? 'Core',
      entitlements: new Set(entitlements),
    },
    accessToken: session.access_token,
    expiresAt: new Date(session.expires_at! * 1000),
  }
}

function buildInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
```

```typescript
// In a root layout or auth provider component:
import { createClient } from '@/lib/supabase/client'
import { useSessionStore } from '@/store/sessionStore'
import { hydrateFromSupabaseSession } from '@/lib/auth/session-hydrator'

// Called once in app/(tenant)/[tenantId]/layout.tsx or a dedicated AuthProvider
useEffect(() => {
  const supabase = createClient()
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (session) {
        useSessionStore.getState().setSession(hydrateFromSupabaseSession(session))
      } else {
        useSessionStore.getState().clearSession()
      }
    }
  )
  return () => subscription.unsubscribe()
}, [])
```

### Pattern 4: FastAPI Startup Guard (Fail-Secure)

**What:** Pydantic Settings fields without defaults cause startup failure if env var is missing. This is the correct fail-secure pattern.

**Example:**
```python
# backend/core/config.py
from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "Clarity Optometry EHR"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/clarity_db"
    DB_ECHO_SQL: bool = False

    # REQUIRED — no defaults. FastAPI startup fails if these are unset.
    SUPABASE_URL: str = Field(..., description="Supabase project URL — required")
    SUPABASE_ANON_KEY: str = Field(..., description="Supabase anon key — required")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(..., description="Supabase service role key — required")
    SUPABASE_JWT_SECRET: str = Field(..., description="Supabase JWT secret — required")
    SECRET_KEY: str = Field(..., description="App secret key — required")

    ANTHROPIC_API_KEY: str = ""  # Optional — only needed when AI Scribe routes are called
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

settings = Settings()
```

```python
# backend/core/security.py — dev bypass removed
async def get_current_tenant(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> TenantContext:
    # No bypass block — if SUPABASE_JWT_SECRET was empty, startup already failed
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {exc}",
                           headers={"WWW-Authenticate": "Bearer"})
    # ... rest of extraction unchanged
```

### Pattern 5: Alembic Async Environment

**What:** Alembic initialized with the async template, configured to use the same asyncpg DATABASE_URL as the running app.

**Example:**
```bash
# Run from backend/ directory
alembic init -t async alembic
```

```python
# backend/alembic/env.py
import asyncio
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

# Import BOTH bases and ALL model modules so autogenerate sees every table
from backend.db.base import PublicBase, TenantBase
from backend.db.models.public import saas       # noqa: F401
from backend.db.models.tenant import clinical   # noqa: F401
from backend.core.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Combine metadata from both bases for autogenerate
target_metadata = [PublicBase.metadata, TenantBase.metadata]

def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### Pattern 6: Security Headers in next.config.mjs

**What:** Static headers applied to all routes via the `headers()` function. No nonces needed because the app uses Tailwind CSS classes (no inline styles), shadcn components (no eval), and all scripts are bundled by Next.js.

**CSP whitelist domains for this project:**
- `*.supabase.co` — Supabase Auth, storage
- `*.anthropic.com` — AI Scribe streaming (via BFF, so may not need client-side)
- `vercel.app` — Deployment domain

**Example:**
```javascript
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js requires 'unsafe-inline' for dev HMR; 'unsafe-eval' only in dev
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https://*.supabase.co",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
```

### Pattern 7: Zustand Devtools — Production Disable

**What:** Conditionally skip `devtools()` wrapper in production. This removes devtools code from the production bundle entirely.

**Example:**
```typescript
// store/sessionStore.ts — updated pattern
import { create } from "zustand"
import { devtools } from "zustand/middleware"

const isDev = process.env.NODE_ENV === 'development'

// Apply devtools middleware only in development
const withDevtools = isDev
  ? (fn: Parameters<typeof devtools>[0]) => devtools(fn, { name: 'ClarityOS/Session' })
  : (fn: Parameters<typeof devtools>[0]) => fn  // no-op in production

export const useSessionStore = create<SessionState>()(
  withDevtools((set, get) => ({
    session: null, // null in production — hydrated via onAuthStateChange
    isLoading: true,
    // ... rest of store
  }))
)
```

### Pattern 8: BFF Route Handler

**What:** Next.js API route that proxies requests to FastAPI, attaching the Supabase session token.

**Example:**
```typescript
// app/api/audit-logs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000'

export async function GET(request: NextRequest) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const upstreamUrl = `${FASTAPI_URL}/api/audit-logs?${searchParams.toString()}`

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000), // 10s timeout
    })

    if (!upstream.ok) {
      const error = await upstream.json().catch(() => ({ detail: 'Upstream error' }))
      return NextResponse.json(error, { status: upstream.status })
    }

    const data = await upstream.json()
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Gateway timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

### Pattern 9: 30-Minute Inactivity Timeout

**What:** Track user activity via mouse/keyboard events (use `react-idle-timer`), show warning modal at 28 minutes, auto-logout at 30 minutes.

**Example:**
```typescript
// components/auth/SessionTimeoutModal.tsx
'use client'
import { useIdleTimer } from 'react-idle-timer'
import { useState } from 'react'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000        // 30 minutes
const WARNING_BEFORE_MS = 2 * 60 * 1000       // warn 2 min before

export function SessionTimeoutModal({ onLogout, onStayLoggedIn }) {
  const [showWarning, setShowWarning] = useState(false)

  useIdleTimer({
    timeout: IDLE_TIMEOUT_MS - WARNING_BEFORE_MS,
    onIdle: () => setShowWarning(true),
    debounce: 500,
  })

  useIdleTimer({
    timeout: IDLE_TIMEOUT_MS,
    onIdle: () => onLogout(),
    debounce: 500,
  })

  if (!showWarning) return null
  // Render glass card warning modal with countdown
}
```

### Anti-Patterns to Avoid

- **`supabase.auth.getSession()` in server code:** Does NOT revalidate the token. Always use `getUser()` in middleware and server components.
- **Keeping `getMockSession()` as the store initializer:** Must become `null` with real hydration via `onAuthStateChange`.
- **`alembic init alembic` without `-t async`:** Creates a sync env.py that conflicts with asyncpg and causes event loop errors.
- **Moving files individually from `app/` to `backend/`:** Move the entire directory at once, then update all import paths (`from app.core...` → `from backend.core...`).
- **Forgetting `__init__.py` files in `backend/`:** Python package discovery requires them in every subdirectory.
- **CSP with `script-src: 'unsafe-eval'` in production:** Next.js does not need `unsafe-eval` in production builds — only in dev mode for HMR.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie-based SSR auth | Custom JWT cookie parsing | `@supabase/ssr` createServerClient + createBrowserClient | PKCE, refresh, SameSite, HttpOnly — dozens of edge cases |
| Token refresh on expiry | setInterval polling | `@supabase/ssr` handles refresh automatically via cookie storage + `onAuthStateChange` | Race conditions, tab sync, background refresh all handled |
| Activity detection | Manual `mousemove`/`keydown` listeners | `react-idle-timer` | Handles page visibility, cross-tab, throttling, debounce |
| Import path rewriting after relocation | sed/manual find-replace | Python's own import system — update `from app.X` to `from backend.X` systematically | One file at a time per module is error-prone at scale |

**Key insight:** Authentication in an SSR Next.js app has many edge cases around cookie SameSite attributes, CSRF, token refresh races between tabs, and server component rendering. `@supabase/ssr` exists precisely because these are solved problems — do not reimplement.

---

## Common Pitfalls

### Pitfall 1: Import Path Conflict During Backend Relocation

**What goes wrong:** After moving files to `backend/`, the `from app.core.config import settings` imports in all route files still reference the old location. Python finds the Next.js `app/` directory first (it has `__init__.py`) and crashes with `ImportError`.

**Why it happens:** Python's module system uses `sys.path`. The project root is on `sys.path`, and both `app/` and `backend/` live at the root. After the move, `app/` still exists as a Next.js directory — Python may still find it.

**How to avoid:** After moving all files to `backend/`, do a project-wide search-and-replace: `from app.` → `from backend.`. Also update `main.py` router imports. Remove `app/__init__.py` immediately after the move.

**Warning signs:** `ModuleNotFoundError: No module named 'app.core'` after relocation.

### Pitfall 2: Alembic Autogenerate Misses Tables

**What goes wrong:** Running `alembic revision --autogenerate` generates an empty migration, or only generates some tables.

**Why it happens:** Alembic's autogenerate only sees models whose modules have been imported before the migration runs. If `env.py` doesn't explicitly import model files, metadata is empty.

**How to avoid:** `env.py` must explicitly import every model module: `from backend.db.models.public import saas` and `from backend.db.models.tenant import clinical`. These imports are side-effect-only (populate `Base.metadata`).

**Warning signs:** Generated migration file has empty `upgrade()` and `downgrade()` functions.

### Pitfall 3: Alembic with Two Bases (PublicBase + TenantBase)

**What goes wrong:** Alembic doesn't know which schema to migrate — it generates table names without schema prefixes, or tries to migrate TenantBase tables into the wrong schema.

**Why it happens:** `PublicBase` has `schema='public'` in `__table_args__`. `TenantBase` has no hardcoded schema (it's set dynamically at runtime). Alembic's autogenerate sees the schema conflict.

**How to avoid:** Pass `target_metadata = [PublicBase.metadata, TenantBase.metadata]` as a list. The baseline migration should target `schema='public'` explicitly for PublicBase tables. TenantBase tables represent the tenant schema template — document that they need a separate migration strategy when per-tenant schemas are provisioned.

**Warning signs:** Migration fails with `schema "clinic_xyz" does not exist` or duplicate table errors.

### Pitfall 4: Next.js BFF + FastAPI Both on localhost:8000 in Dev

**What goes wrong:** When running `next dev` and `uvicorn` simultaneously, the BFF route handler at `app/api/audit-logs/route.ts` tries to fetch `http://localhost:8000/api/audit-logs`. If the FastAPI server isn't running, the BFF returns 500 with no useful error message.

**Why it happens:** `fetch()` in Next.js API routes is server-side — network failures throw rather than returning error responses.

**How to avoid:** Wrap FastAPI calls in try/catch with meaningful error messages. Add `FASTAPI_URL` env var to `.env.local` with the correct value. In the BFF, return `503 Service Unavailable` when the backend is unreachable.

### Pitfall 5: Supabase Custom Access Token Hook Latency

**What goes wrong:** The hook runs a SQL query on every token mint. If the query is slow (e.g., missing index on `tenant_members.global_user_id`), Supabase may time out the hook (2-second limit) and the token is minted without custom claims.

**Why it happens:** Supabase enforces a 2-second execution limit on auth hooks.

**How to avoid:** Ensure `tenant_members` has an index on `global_user_id`. The hook SQL should be a single fast lookup, not a JOIN chain.

**Warning signs:** User logs in but `user.app_metadata.tenant_id` is undefined — the hook timed out silently.

### Pitfall 6: Zustand `devtools` TypeScript Typing Breaks on Conditional Wrap

**What goes wrong:** Conditionally wrapping with devtools changes the type signature, causing TypeScript errors on the `create<SessionState>()()` call.

**How to avoid:** Use the `enabled: false` option (ships the code but disables at runtime) OR use a typed helper function for the conditional. The simplest correct pattern:

```typescript
const storeCreator = devtools(
  (set, get) => ({ /* ... */ }),
  { name: 'ClarityOS/Session', enabled: process.env.NODE_ENV === 'development' }
)
```

The `enabled: false` approach is simpler than conditional wrapping, and Vercel's tree-shaking removes unused devtools code in production anyway.

### Pitfall 7: ePHI localStorage Cleanup — Wrong Key Names

**What goes wrong:** Logout cleanup misses keys because the exact localStorage key strings aren't known.

**How to avoid:** Search the codebase for all `localStorage.setItem(` calls to enumerate all keys before writing the cleanup function. Based on the CONTEXT.md, the known keys are: `draft-transcript-*` (pattern), `encounter-*` (pattern). Need to verify by searching the codebase — this is a non-trivial enumeration step.

---

## Code Examples

Verified patterns from official sources:

### Login Flow with Supabase Auth
```typescript
// app/login/page.tsx — client component
'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  async function handleLogin(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Show inline error: "Invalid email or password"
      return
    }
    const returnTo = searchParams.get('returnTo')
    router.push(returnTo ?? '/sunview/dashboard') // fallback
  }
  // Render glass card form
}
```

### Logout with ePHI Cleanup
```typescript
async function handleLogout(isDirty: boolean) {
  if (isDirty) {
    // Show confirmation modal
    const confirmed = await confirmDialog()
    if (!confirmed) return
  }

  // 1. Clear all ePHI from localStorage
  const phiKeyPatterns = ['draft-transcript-', 'encounter-']
  Object.keys(localStorage).forEach(key => {
    if (phiKeyPatterns.some(pattern => key.startsWith(pattern))) {
      localStorage.removeItem(key)
    }
  })

  // 2. Clear Zustand stores that contain clinical data
  useSessionStore.getState().clearSession()
  useEncounterStore.getState().reset()  // if reset() exists
  // ... other clinical stores

  // 3. Sign out from Supabase (clears cookie)
  await supabase.auth.signOut()

  // 4. Redirect to login
  router.push('/login')
}
```

### Pydantic Settings Startup Guard
```python
# Source: Pydantic-settings docs — Field(...) with no default = required
from pydantic import Field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Field(...) means REQUIRED — startup fails if env var is absent
    SUPABASE_JWT_SECRET: str = Field(...)
    SECRET_KEY: str = Field(...)
    SUPABASE_URL: str = Field(...)
```

### Alembic Async Init and First Migration
```bash
cd backend
alembic init -t async alembic
# Edit alembic/env.py to import models and settings (see Pattern 5 above)
alembic revision --autogenerate -m "baseline_schema"
alembic upgrade head
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2023-2024 | SSR-first; unified browser/server/middleware client API |
| `getSession()` in server code | `getUser()` in server code | 2024 | `getUser()` validates with Supabase Auth server; `getSession()` does not |
| Inline `devtools()` always | Conditional `enabled: process.env.NODE_ENV !== 'production'` | Zustand v4+ | Stops leaking store names and state shape to production clients |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Superseded by `@supabase/ssr`. Do not install.
- `alembic init alembic` (without `-t async`): Generates a sync env.py incompatible with asyncpg.

---

## Open Questions

1. **tenant_members table shape in Supabase**
   - What we know: `security.py` reads `app_metadata.tenant_id` and `app_metadata.role` from the JWT. The hook must populate these from `tenant_members`.
   - What's unclear: Whether `tenant_members` is in the `public` Postgres schema and what exact columns it has. The existing models (`app/db/models/public/saas.py`) likely define this — confirm before writing the hook SQL.
   - Recommendation: Read `saas.py` when implementing INF-06 to get exact column names.

2. **Inactivity timer placement**
   - What we know: The 30-minute timeout must track user activity across all tenant pages.
   - What's unclear: Whether `SessionTimeoutModal` should live in the tenant layout or in a root layout wrapping all authenticated routes.
   - Recommendation: Place it in `app/(tenant)/[tenantId]/layout.tsx` — this is the authenticated shell. It will unmount (and not run) on the login page.

3. **Zustand store dirty state detection on logout**
   - What we know: Logout should show confirmation modal "only when unsaved work exists (dirty Zustand stores)."
   - What's unclear: Not all stores expose a "dirty" flag. `refractionStore` has draft/committed dual-state, but `encounterStore` may not.
   - Recommendation: For this phase, check `refractionStore` only (it's the most critical mid-charting store). Extend to other stores in Phase 2.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently installed — see Wave 0 |
| Config file | None — needs creation |
| Quick run command | `npx jest --testPathPattern=auth --passWithNoTests` (after setup) |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | FastAPI rejects requests when SUPABASE_JWT_SECRET is empty | integration | `pytest backend/tests/test_security.py::test_missing_jwt_secret -x` | ❌ Wave 0 |
| SEC-02 | FastAPI startup fails if SECRET_KEY env var is unset | unit | `pytest backend/tests/test_config.py::test_required_secret_key -x` | ❌ Wave 0 |
| SEC-03 | FastAPI startup fails if SUPABASE_URL env var is unset | unit | `pytest backend/tests/test_config.py::test_required_supabase_url -x` | ❌ Wave 0 |
| SEC-04 | Login page renders and submits email/password | smoke | `npx playwright test login.spec.ts` or manual | ❌ Wave 0 |
| SEC-05 | Logout clears localStorage PHI keys | unit | `npx jest logout.test.ts` | ❌ Wave 0 |
| SEC-06 | Session persists across browser refresh | smoke | Manual verification | N/A — manual |
| SEC-07 | Unauthenticated request to /[tenantId]/dashboard redirects to /login | integration | Manual + middleware unit test | ❌ Wave 0 |
| SEC-08 | sessionStore.session is null before login, hydrated after | unit | `npx jest sessionStore.test.ts` | ❌ Wave 0 |
| SEC-09 | Security headers present on all responses | smoke | `curl -I localhost:3000` check | N/A — manual/curl |
| SEC-10 | devtools not active in production build | unit | Check bundle for devtools in prod | N/A — manual |
| INF-01 | Backend runs from backend/ directory | smoke | `uvicorn backend.main:app --reload` succeeds | N/A — smoke |
| INF-02 | Alembic env created | smoke | `alembic current` runs without error | N/A — smoke |
| INF-03 | Baseline migration succeeds | integration | `alembic upgrade head` on clean DB | N/A — smoke |
| INF-04 | /api/audit-logs returns 401 without session | unit | `npx jest audit-logs.route.test.ts` | ❌ Wave 0 |
| INF-05 | /api/ai-scribe/accept returns 401 without session | unit | `npx jest ai-scribe.route.test.ts` | ❌ Wave 0 |
| INF-06 | JWT contains tenant_id and role after login | integration | Manual Supabase JWT decode check | N/A — manual |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=auth --passWithNoTests`
- **Per wave merge:** `npx jest && pytest backend/tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_config.py` — covers SEC-02, SEC-03: validates pydantic startup failures
- [ ] `backend/tests/test_security.py` — covers SEC-01: validates JWT guard with missing secret
- [ ] `backend/tests/conftest.py` — shared pytest fixtures (test DB, mock JWT)
- [ ] `__tests__/sessionStore.test.ts` — covers SEC-08: hydration from Supabase session
- [ ] `__tests__/logout.test.ts` — covers SEC-05: localStorage cleanup on logout
- [ ] `__tests__/audit-logs.route.test.ts` — covers INF-04: BFF 401 behavior
- [ ] `__tests__/ai-scribe.route.test.ts` — covers INF-05: BFF 401 behavior
- [ ] Framework install: `pip install pytest pytest-asyncio httpx` (backend) and `npm install --save-dev jest @types/jest ts-jest` (frontend) if none detected

---

## Sources

### Primary (HIGH confidence)
- [Supabase SSR Next.js Guide](https://supabase.com/docs/guides/auth/server-side/nextjs) — middleware pattern, getUser() vs getSession() guidance
- [Supabase Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) — hook structure, SQL function signature, 2-second limit
- [Next.js CSP Documentation v14](https://nextjs.org/docs/14/app/building-your-application/configuring/content-security-policy) — exact headers() configuration code
- [Alembic Async Template](https://github.com/sqlalchemy/alembic/blob/main/alembic/templates/async/env.py) — official async env.py pattern
- Codebase direct inspection: `app/core/security.py`, `app/core/config.py`, `store/sessionStore.ts`, `types/session.ts`, `lib/auth/mock-session.ts`, `lib/supabase.ts`, `lib/api-client.ts`

### Secondary (MEDIUM confidence)
- [Supabase RBAC Custom Claims Guide](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) — custom claims pattern
- [Zustand devtools production discussion](https://github.com/pmndrs/zustand/discussions/842) — `enabled` flag pattern
- [FastAPI setup with async Alembic](https://berkkaraal.com/blog/2024/09/19/setup-fastapi-project-with-async-sqlalchemy-2-alembic-postgresql-and-docker/) — env.py configuration walkthrough

### Tertiary (LOW confidence)
- [react-idle-timer usage pattern](https://supalaunch.com/blog/nextjs-middleware-supabase-auth) — inactivity timeout implementation concept (verify library API before implementation)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed packages and official Supabase docs
- Architecture: HIGH — derived directly from existing codebase structure + official patterns
- Pitfalls: HIGH — identified from existing code (hardcoded secrets, missing imports pattern) + official security guidance (getSession vs getUser)
- Alembic async: HIGH — official template exists and is well-documented

**Research date:** 2026-03-05
**Valid until:** 2026-06-05 (stable — Supabase SSR and Alembic APIs are stable; re-verify if major Supabase release drops)
