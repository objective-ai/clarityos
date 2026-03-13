# ClarityOS — Project Instructions

## Stack
- **Frontend:** Next.js 14 App Router, Tailwind 3.4, shadcn/ui, Zustand 4.5, TypeScript 5.5
- **Backend:** Python FastAPI :8000, PostgreSQL (schema-per-tenant)
- **Auth:** Supabase Auth, JWT in cookies, tenant_slug in app_metadata
- **Design:** Glassmorphism, accent `#2DD4BF`, glass classes in globals.css
- **Deploy:** Vercel — always check `NEXT_PUBLIC_` prefix for client env vars

## File Layout
- `app/(tenant)/[tenant]/` — tenant pages | `app/api/` — BFF proxy routes (no business logic)
- `backend/api/routes/` — FastAPI endpoints | `backend/schemas/` — Pydantic models
- `backend/db/models/tenant/clinical.py` — ORM + enums | `store/` — Zustand stores
- `lib/` — all business logic + DB access | `lib/bff.ts` — BFF proxy helper
- `components/` — presentational only, no DB or fetch calls
- `types/` — shared TS types | `tests/e2e/` — Playwright specs

## Quick Commands
- `bash scripts/dev.sh ensure-api` — start FastAPI if not running
- `bash scripts/dev.sh check-api` — health-check both servers
- `bash scripts/dev.sh pre-test` — gate: verify servers up before tests
- `bash scripts/dev.sh verify <script.js>` — run Playwright E2E test
- `npm run test` — vitest | `npx tsc --noEmit` — type-check

## Project Rules
- **Servers:** User manages servers. Don't restart unless connection error. FastAPI `--reload` handles changes.
- **BFF:** Always use `lib/bff.ts` `proxyToFastAPI()`. Upstream FastAPI URLs need trailing slashes.
- **SQLAlchemy:** After `db.flush()`, re-fetch with `selectinload` (never `db.refresh` — MissingGreenlet). Enums as VARCHAR (`native_enum=False`).
- **DB:** Seed into `public` schema only. `clinic_sunview` unused (future v2/v3).
- **APIs:** Check `backend/api/routes/` AND `app/api/` before calling endpoints.
- **DB columns:** Check ORM model in `clinical.py` before queries.
- **Clinical data writes:** Always in the primary DB transaction — never fire-and-forget fetch calls.

## Clinical Data Rules (non-negotiable)
- Any patient/clinical data change requires audit-clinical check
- Never log patient data — not even in dev/debug
- Auth middleware must be present on every clinical route

## Testing
- Dev creds: duytran@yahoo.com / 123456
- E2E: use `playwright-cli` skill — never standalone node scripts
- E2E helpers: `tests/e2e/helpers/test-utils.js` — use `loginOrRestore()` over `login()`
- Run `bash scripts/dev.sh pre-test` before any E2E test
- New features need at least one unit test in `lib/` before PR
- `npm run lint` does NOT support `--cache` flags (next lint strips them)
- `npx vitest run <file>` — vitest uses `--reporter` not `--testPathPattern`

## Requires My Approval
- New database schema changes
- New npm dependencies
- Any change to auth or clinical data flow
- Deleting or renaming existing files
