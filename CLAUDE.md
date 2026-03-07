# ClarityOS — Claude Code Instructions

## Quick Commands
- `bash scripts/dev.sh restart-api` — kill + restart FastAPI (one command)
- `bash scripts/dev.sh check-api` — health-check both servers
- `bash scripts/dev.sh smoke` — login + hit key pages, report API status
- `bash scripts/dev.sh verify <script.js>` — run Playwright test
- `npm run test` — vitest unit tests
- `npx tsc --noEmit` — type-check

## Architecture
- **Frontend:** Next.js 14 App Router, Tailwind 3.4, shadcn/ui, Zustand 4.5
- **Backend:** Python FastAPI at localhost:8000, PostgreSQL (schema-per-tenant)
- **BFF Proxy:** Next.js `app/api/` routes authenticate via Supabase, forward to FastAPI using `lib/bff.ts`
- **Auth:** Supabase Auth, JWT in cookies, tenant_slug in app_metadata

## Key Conventions
- Tenant slug: `sunview` (Sunview Eye Care)
- Python venv: `venv/Scripts/activate` (Windows)
- All imports use `@/*` path alias
- CSS: glassmorphism design, accent `#2DD4BF`, glass classes in globals.css
- BFF routes use `lib/bff.ts` `proxyToFastAPI()` helper — never copy-paste raw fetch
- Backend enum values stored as VARCHAR (`native_enum=False`) — no DB migrations for new enum values
- After `db.flush()` in async SQLAlchemy, always re-fetch with `selectinload` (never `db.refresh` for relationships — causes MissingGreenlet)

## Testing
- Frontend: `tests/` with vitest + testing-library, fixtures in `tests/helpers/fixtures/`
- E2E: `tests/e2e/` Playwright specs, run via `bash scripts/dev.sh verify`
- Backend: No pytest yet — validate via Playwright E2E or manual curl
- Login creds for dev: duytran@yahoo.com / 123456

## File Layout
- `app/(tenant)/[tenant]/` — tenant pages (schedule, patients, encounter, etc.)
- `app/api/` — BFF proxy routes to FastAPI
- `backend/api/routes/` — FastAPI endpoints
- `backend/schemas/` — Pydantic request/response models
- `backend/db/models/tenant/clinical.py` — SQLAlchemy ORM + enums
- `store/` — Zustand stores
- `types/` — TypeScript type definitions
- `lib/bff.ts` — shared BFF proxy utility
- `scripts/dev.sh` — dev workflow helper (restart-api, check-api, smoke, verify)
