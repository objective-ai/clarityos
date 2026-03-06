# ClarityOS EHR — Technology Stack

## Languages

| Layer | Language | Version |
|---|---|---|
| Frontend | TypeScript | 5.5.3 |
| Frontend | JSX / TSX | — |
| Backend | Python | 3.12+ (venv detected) |
| Styling | CSS (custom properties) | — |

---

## Frontend Stack

### Runtime & Framework

| Package | Version | Role |
|---|---|---|
| `next` | 14.2.5 | App Router, SSR/SSG, API routes |
| `react` | 18.3.1 | UI rendering |
| `react-dom` | 18.3.1 | DOM renderer |

**Routing pattern:** File-system App Router under `app/(tenant)/[tenantId]/`
**Rendering:** Client-side components (`"use client"`) for interactive pages; server components for layouts.

### UI Component Library

| Package | Version | Role |
|---|---|---|
| `@radix-ui/react-dialog` | 1.1.15 | Headless dialog primitives |
| `@radix-ui/react-dropdown-menu` | 2.1.16 | Headless dropdown primitives |
| `@radix-ui/react-slot` | 1.2.4 | Slot composition for shadcn/ui |
| `lucide-react` | 0.576.0 | Icon set (SVG-based) |

shadcn/ui components are hand-assembled on top of Radix UI in `components/ui/`.

### Styling

| Package | Version | Role |
|---|---|---|
| `tailwindcss` | 3.4.6 | Utility-first CSS framework |
| `tailwindcss-animate` | 1.0.7 | Keyframe animation plugin |
| `autoprefixer` | 10.4.19 | Vendor prefix injection |
| `postcss` | 8.4.39 | CSS transformation pipeline |

**Custom design system:** CSS custom properties (tokens) defined in `app/globals.css`. Glassmorphism system via `.glass-card`, `.glass-card-hover`, `.glass-card-accent`, `.glass-input` utility classes.

**Fonts (Google Fonts via `next/font`):**
- `Plus Jakarta Sans` — primary display/body typeface
- `JetBrains Mono` — monospace for clinical data (Rx grids, IOP values)

### State Management

| Package | Version | Role |
|---|---|---|
| `zustand` | 4.5.4 | Client-side global state |

**Stores:**
- `store/themeStore.ts` — dark/light mode toggle
- `store/tenantCustomizationStore.ts` — logo URL + accent color (tenant-customizable)
- `store/refractionStore.ts` — draft/committed Rx state with 1.5s debounce
- `store/sessionStore.ts` — auth session (mock in dev, Supabase token in production)
- `store/encounterStore.ts` — active encounter state
- `store/diagnosisStore.ts` — ICD-10 diagnosis list
- `store/examFindingsStore.ts` — anterior/posterior findings accordion state
- `store/vitalsStore.ts` — vital signs form state
- `store/problemListStore.ts` — master problem list (MPPL)

### Utility Libraries

| Package | Version | Role |
|---|---|---|
| `class-variance-authority` | 0.7.1 | Variant-driven className generation (CVA) |
| `clsx` | 2.1.1 | Conditional className merging |
| `tailwind-merge` | 3.5.0 | Deduplication of Tailwind utility conflicts |

**Custom utilities:**
- `lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `lib/color-utils.ts` — hex/RGB/HSL conversion, WCAG contrast ratio
- `lib/rx-format.ts` — optometric Rx formatting, parsing, rounding, validation
- `lib/entitlements.ts` — feature-gate key constants

### API Client

- `lib/api-client.ts` — authenticated fetch wrapper; reads Supabase access token and attaches it as `Authorization: Bearer` to every request to the FastAPI backend.
- `lib/supabase.ts` — Supabase JS client initialization (graceful fallback for missing env vars).

---

## Backend Stack

### Runtime & Framework

| Package | Version spec | Role |
|---|---|---|
| Python | 3.12+ | Runtime |
| `fastapi` | >=0.115 (installed: 0.135.1) | Async REST API framework |
| `uvicorn[standard]` | >=0.30 (installed: 0.41.0) | ASGI server (httptools + websockets) |

**Entry point:** `app/main.py`
**CORS:** `fastapi.middleware.cors.CORSMiddleware` — allows `http://localhost:3000` by default.

### Database & ORM

| Package | Version spec | Role |
|---|---|---|
| `sqlalchemy[asyncio]` | >=2.0 (installed: 2.0.48) | Async ORM + Core |
| `asyncpg` | >=0.30 (installed: 0.31.0) | Async PostgreSQL driver (primary) |
| `psycopg2-binary` | >=2.9 (installed: 2.9.11) | Sync PostgreSQL driver (seeding scripts) |

**Engine:** `create_async_engine` with `postgresql+asyncpg://` DSN.
**Session pattern:** `async_sessionmaker[AsyncSession]` per-request dependency via `get_db()`.
**Pool config:** pool_size=20, max_overflow=10, pool_timeout=30s, pool_recycle=1800s.

**ORM Architecture:**
- `app/db/base.py` — two `DeclarativeBase` subclasses:
  - `PublicBase` — tables in the shared `public` schema (SaaS control plane)
  - `TenantBase` — tables in per-tenant schemas (clinical data plane); schema resolved at runtime via `SET search_path`
- `app/db/models/public/saas.py` — SaaS-layer models (tenants, global users, subscription plans)
- `app/db/models/tenant/clinical.py` — clinical models (Staff, Patient, Encounter, Vitals, Refraction, Diagnosis, ExamFindings, AuditLog, etc.)
- `app/db/mixins.py` — `TimestampMixin` (created_at/updated_at) + `SoftDeleteMixin` (is_deleted flag)

**Multi-tenancy pattern:** Schema-per-tenant. Each clinic gets its own PostgreSQL schema (e.g., `clinic_sunview1`). The `TenantContext` from the JWT determines which schema is active via `SET search_path`.

### Data Validation

| Package | Version spec | Role |
|---|---|---|
| `pydantic` | >=2.0 | Request/response schema validation |
| `pydantic-settings` | >=2.0 | Settings management from `.env` |

**Settings class:** `app/core/config.py` — `BaseSettings` subclass; reads from `.env` file.

### Authentication & Security

| Package | Version spec | Role |
|---|---|---|
| `python-jose[cryptography]` | >=3.3 (installed: 3.5.0) | JWT decoding (HS256, `audience="authenticated"`) |

**Auth flow:** Supabase JWTs are verified against `SUPABASE_JWT_SECRET`. Claims extracted: `sub` (user UUID), `app_metadata.tenant_id`, `app_metadata.role`. Implemented in `app/core/security.py`.

**RBAC:** `app/core/permissions.py` — `ClinicalAction` enum + `PERMISSION_MATRIX` dict (16 actions × 5 roles). `require_permission()` FastAPI dependency factory enforces access per route.

**Roles:** `doctor`, `technician`, `receptionist`, `admin`, `owner`

### HTTP Client (backend)

| Package | Version spec | Role |
|---|---|---|
| `httpx` | >=0.27 (installed: 0.28.1) | Async HTTP client (used for outbound requests) |

### Environment

| Package | Version spec | Role |
|---|---|---|
| `python-dotenv` | >=1.0 (installed: 1.2.2) | Loads `.env` into environment |

### API Routes

| Router prefix | Module | Actions |
|---|---|---|
| `/api/encounters` | `encounter`, `refraction`, `vitals`, `exam_findings`, `diagnosis`, `ai_scribe` | Full CRUD + streaming AI |
| `/api/encounters/{id}/ai-scribe` | `ai_scribe` | POST (stream), POST /accept |
| `/api/patients` | `patient_problem` | Problem list CRUD |
| `/api/encounters/{id}/promote-problem` | `promotion` | Promote diagnosis to MPPL |
| `/api/staff` | `staff` | Staff management |
| `/api/audit-log` | `audit` | Read-only HIPAA audit trail |

---

## Dev Tools

| Tool | Version | Config file |
|---|---|---|
| TypeScript | 5.5.3 | `tsconfig.json` |
| ESLint | 8.57.0 | `eslint.config.mjs` |
| eslint-config-next | 14.2.5 | (referenced in eslint.config.mjs) |
| PostCSS | 8.4.39 | `postcss.config.mjs` |
| Tailwind CLI | 3.4.6 | `tailwind.config.ts` |

### TypeScript Configuration (`tsconfig.json`)

- **Target:** ES2017
- **Module:** ESNext + Bundler resolution
- **Strict:** `true` (all strict checks enabled)
- **noEmit:** `true` (Next.js owns compilation)
- **JSX:** `preserve`
- **Path alias:** `@/*` maps to project root
- **incremental:** `true`
- **Plugin:** `next` (for App Router type augmentation)

### ESLint (`eslint.config.mjs`)

Uses flat config format. Extends:
- `eslint-config-next/core-web-vitals`
- `eslint-config-next/typescript`

Ignores: `.next/`, `out/`, `build/`, `next-env.d.ts`

### PostCSS (`postcss.config.mjs`)

Plugins: `tailwindcss` (v3 API) + `autoprefixer`. PostCSS v4's `@tailwindcss/postcss` is explicitly NOT used.

### npm Scripts

```
dev         → next dev
build       → next build
start       → next start
lint        → next lint
type-check  → tsc --noEmit
```

---

## Deployment

### Vercel (Frontend)

- **Config file:** `.vercel/project.json`
- **Project ID:** `prj_017WRw9NTLEw6Nc83EUrhbCgbrCE`
- **Org ID:** `team_O2syFAgQmdi7lscNfYMrcPOi`
- **Project name:** `clarityos`
- **Framework:** Next.js (auto-detected by Vercel)
- `next.config.mjs` is a minimal empty config (`const nextConfig = {}`).

### Backend (FastAPI)

No production deployment config is present in the repository. The backend is currently run locally with:
```
uvicorn app.main:app --reload
```
Expected production deployment: a Python ASGI host (e.g., Railway, Render, or custom VPS) behind Supabase Postgres.

---

## Tailwind Design System

The `tailwind.config.ts` extends the default theme with:

- **Custom font families:** `jakarta` (Plus Jakarta Sans), `mono` (JetBrains Mono)
- **CSS-var-driven colors:** `accent`, `base`, `surface`, `elevated`, `overlay`, `glass`
- **Semantic text colors:** `primary`, `secondary`, `muted`
- **Clinical state colors:** `normal`, `warning`, `critical`, `info`
- **Border tokens:** `subtle`, `default`, `strong`, `glow`, `mono`
- **Box shadows:** `card-sm`, `card-md`, `card-lg`, `card-glow`
- **Border radius:** `card` (16px)
- **Backdrop blur:** `glass`
- **Keyframes:** `accordion-down/up`, `fade-in-up`, `pulse-glow`
- **Plugin:** `tailwindcss-animate`
