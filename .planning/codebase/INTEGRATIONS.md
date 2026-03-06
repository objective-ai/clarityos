# ClarityOS EHR — External Integrations

## Overview

ClarityOS integrates with three external services: Supabase (auth + database hosting), Anthropic Claude API (AI Scribe), and Google Fonts (typography). All service credentials are managed via environment variables loaded from `.env` by `pydantic-settings` on the backend and Next.js env injection on the frontend.

---

## 1. Supabase

**Role:** Auth provider + managed PostgreSQL database host.

### 1a. Supabase Auth

**Used by:** Both frontend (`lib/supabase.ts`, `lib/api-client.ts`) and backend (`app/core/security.py`).

**Frontend client:** `@supabase/supabase-js` v2.98.0

```ts
// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = supabaseUrl
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient("https://placeholder.supabase.co", "placeholder");
```

**API client auth flow (`lib/api-client.ts`):**
1. Calls `supabase.auth.getSession()` to retrieve the active Supabase session.
2. Extracts `session.access_token` (a signed JWT).
3. Attaches it as `Authorization: Bearer <token>` to every request to the FastAPI backend.

**Backend JWT verification (`app/core/security.py`):**
- Uses `python-jose` to decode and verify the Supabase JWT with HS256 algorithm.
- Audience claim validated as `"authenticated"`.
- Claims extracted:
  - `sub` → `user_id` (UUID)
  - `app_metadata.tenant_id` → `tenant_id` (UUID, injected by a DB trigger on `tenant_members`)
  - `app_metadata.role` → staff role string
- Returns a frozen `TenantContext` dataclass used for all downstream RBAC and query filtering.
- Development bypass: if `SUPABASE_JWT_SECRET` is not set, a hardcoded demo `TenantContext` is returned (for local dev without Supabase credentials).

### 1b. Supabase PostgreSQL

**Role:** Primary database — hosts both the shared SaaS `public` schema and all per-tenant clinical schemas.

**Connection:** `postgresql+asyncpg://` DSN passed via `DATABASE_URL` env var. The backend connects using the Supabase **service role key** (bypasses RLS), so tenant isolation is enforced at the Python query level (`WHERE tenant_id = ctx.tenant_id`).

**Multi-tenant architecture:**
- `public` schema — SaaS control plane (tenants, global users, subscription plans, addons)
- `clinic_<slug>` schemas — one per clinic; created via `CREATE SCHEMA` + `SET search_path`
- Schema routing: each authenticated request runs `SET search_path TO <tenant_schema>` on the connection before any query executes.

**Environment variables (backend `app/core/config.py`):**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | asyncpg DSN for the Supabase Postgres cluster |
| `SUPABASE_URL` | Project base URL (e.g., `https://iedzzcokfwnbyfyevjoz.supabase.co`) |
| `SUPABASE_ANON_KEY` | Public anon key (used by frontend JS client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for backend privileged DB access |
| `SUPABASE_JWT_SECRET` | HS256 secret for JWT verification |

**Environment variables (frontend Next.js):**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (exposed to browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key for Supabase JS client (exposed to browser) |
| `NEXT_PUBLIC_API_URL` | Base URL for FastAPI backend (defaults to `http://localhost:8000`) |

**Supabase project reference:** `iedzzcokfwnbyfyevjoz` (visible in `app/core/config.py` default value).

---

## 2. Anthropic Claude API (AI Scribe)

**Role:** Streaming SOAP note generation and structured clinical data extraction from raw exam transcripts.

**SDK:** `anthropic` Python SDK, version >=0.40 (installed: referenced in `requirements.txt`).

**Used by:** `app/api/routes/ai_scribe.py`

**Model in use:** `claude-sonnet-4-6-20250514`

**Integration pattern:** Server-Sent Events (SSE) streaming via FastAPI `StreamingResponse`.

### How it works

1. **Endpoint:** `POST /api/encounters/{encounter_id}/ai-scribe`
2. **Auth guard:** `require_permission(ClinicalAction.GENERATE_AI_SCRIBE)` — restricted to `doctor` and `owner` roles.
3. **Guard rails:** Encounter must exist, belong to the authenticated tenant, and not be finalized.
4. **Streaming call:**
   ```python
   from anthropic import Anthropic
   client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
   with client.messages.stream(
       model="claude-sonnet-4-6-20250514",
       system=SYSTEM_PROMPT,
       messages=[{"role": "user", "content": payload.transcript}],
       max_tokens=4096,
   ) as s:
       for text in s.text_stream:
           yield f"data: {json.dumps({'text': text})}\n\n"
   ```
5. **Dual-output protocol:** Claude returns a SOAP narrative followed by a `___JSON_START___` delimiter and a structured JSON object. The frontend renders the SOAP text as it streams and silently buffers the JSON for autofill.
6. **Post-stream persistence:** The SOAP text is saved to `encounter.ai_summary_text` in the database.
7. **Audit logging:** An `AI_SCRIBE_GENERATED` event is written to the append-only audit log with staff ID, encounter ID, patient ID, and IP address.

**Accept endpoint:** `POST /api/encounters/{encounter_id}/ai-scribe/accept`
- Logs an `AI_SCRIBE_AUTOFILL` audit event when the provider accepts the AI-generated autofill.
- Records `{"ai_model": "claude-sonnet-4-6-20250514"}` in the audit metadata.

**System prompt:** Instructs Claude to act as a professional optometrist, produce a third-person SOAP note with HPI, and output a structured JSON conforming to a defined schema covering vitals, exam findings, diagnoses, and refraction values.

**Environment variable:**

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | API key for Anthropic Claude; set in backend `.env` |

**Entitlement gating (frontend):** AI Scribe features are additionally gated on the `ai_scribe` entitlement in the JWT payload, checked via `useEntitlements().has("ai_scribe")` (premium add-on, not available on Core plan).

---

## 3. Google Fonts (via next/font)

**Role:** Typography delivery — eliminates external network requests at runtime by inlining font CSS at build time.

**Implementation:** `next/font/google` in `app/layout.tsx`

```ts
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
```

**Fonts loaded:**
- `Plus_Jakarta_Sans` — weights 300, 400, 500, 600, 700; assigned to CSS var `--font-jakarta`
- `JetBrains_Mono` — weights 400, 500; assigned to CSS var `--font-mono`

**Network behavior:** Fonts are fetched from Google Fonts **at build time** and self-hosted by Next.js. No runtime dependency on Google's CDN. No API key required.

---

## 4. Vercel (Deployment Platform)

**Role:** Frontend hosting and CI/CD for the Next.js application.

**Config:** `.vercel/project.json`

```json
{
  "projectId": "prj_017WRw9NTLEw6Nc83EUrhbCgbrCE",
  "orgId": "team_O2syFAgQmdi7lscNfYMrcPOi",
  "projectName": "clarityos"
}
```

**Integration type:** Vercel CLI / Git integration. Deploys are triggered on push to the linked branch. Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`) must be configured in the Vercel project dashboard.

---

## Integration Dependency Map

```
Browser (Next.js frontend)
  │
  ├── Supabase JS Client (@supabase/supabase-js)
  │     └── Supabase Auth (email/OAuth sessions, JWT issuance)
  │
  ├── apiFetch() → FastAPI Backend (http://localhost:8000 or prod URL)
  │     │  [Bearer: Supabase JWT]
  │     │
  │     ├── Supabase Postgres (asyncpg → postgresql+asyncpg://)
  │     │     ├── public schema   (tenants, users, plans)
  │     │     └── clinic_* schema (encounters, patients, vitals, ...)
  │     │
  │     └── Anthropic Claude API (AI Scribe route only)
  │           └── claude-sonnet-4-6-20250514 (SSE streaming)
  │
  └── Google Fonts (build-time only, self-hosted at runtime)

Vercel (frontend hosting)
  └── Next.js build → CDN edge
```

---

## Environment Variable Summary

### Frontend (`.env.local` / Vercel Dashboard)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/publishable key |
| `NEXT_PUBLIC_API_URL` | Yes (prod) | FastAPI backend base URL |

### Backend (`.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | `postgresql+asyncpg://` DSN to Supabase Postgres |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (privileged DB access) |
| `SUPABASE_JWT_SECRET` | Yes (prod) | JWT HS256 secret for token verification |
| `ANTHROPIC_API_KEY` | Yes (AI Scribe) | Anthropic API key |
| `SECRET_KEY` | Yes | App-level secret key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Token lifetime (default: 10080 = 7 days) |
| `CORS_ORIGINS` | No | Allowed origins (default: `["http://localhost:3000"]`) |
| `DB_ECHO_SQL` | No | Log SQL to stdout (default: false) |
