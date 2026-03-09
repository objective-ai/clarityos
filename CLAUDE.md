# ClarityOS — Claude Code Instructions

## Session Start
Before starting work, run `git log --oneline -5` to see recent changes. Don't trust plan files or memory without verifying against git history.

## Quick Commands
- `bash scripts/dev.sh ensure-api` — start FastAPI only if not running (prefer over restart-api)
- `bash scripts/dev.sh check-api` — health-check both servers
- `bash scripts/dev.sh pre-test` — gate: verify both servers up before tests
- `bash scripts/dev.sh verify <script.js>` — run Playwright E2E test
- `npm run test` — vitest unit tests
- `npx tsc --noEmit` — type-check

## Workflow Rules
- **Servers:** User manages servers. Don't restart unless connection error. FastAPI `--reload` handles code changes. If restart fails twice, ask user.
- **Efficiency:** Use `Explore` subagent (not general-purpose) for research. Read files directly when path is known. Write all files, commit once.
- **BFF:** Always use `lib/bff.ts` `proxyToFastAPI()`. Upstream FastAPI URLs need trailing slashes.
- **SQLAlchemy:** After `db.flush()`, re-fetch with `selectinload` (never `db.refresh` — MissingGreenlet). Enums stored as VARCHAR (`native_enum=False`).
- **DB:** Seed into `public` schema only. `clinic_sunview` schema is unused (future v2/v3).

## Anti-Hallucination Rules
- **Read before writing:** Always read a file before editing it. Never assume file contents from memory.
- **Verify selectors:** Read the actual component TSX before writing Playwright selectors — button text, IDs, and class names change.
- **Check imports exist:** Before using a function/component, verify it's exported from the file you think it's in.
- **Don't invent APIs:** Before calling a backend endpoint, check it exists in `backend/api/routes/` AND has a BFF route in `app/api/`.
- **Don't assume DB columns:** Check the ORM model in `clinical.py` before writing queries. Missing columns = runtime crash.
- **Test your assumptions:** If something "should" work based on memory, run `npx tsc --noEmit` or a quick test to confirm before moving on.
- **Check git before claiming work is pending:** Run `git log --oneline -10` before presenting old plan items as "not done yet". Plan files persist across sessions and go stale.

## Stack
- **Frontend:** Next.js 14 App Router, Tailwind 3.4, shadcn/ui, Zustand 4.5, TypeScript 5.5
- **Backend:** Python FastAPI :8000, PostgreSQL (schema-per-tenant)
- **Auth:** Supabase Auth, JWT in cookies, tenant_slug in app_metadata
- **Design:** Glassmorphism, accent `#2DD4BF`, glass classes in globals.css

## File Layout
- `app/(tenant)/[tenant]/` — tenant pages | `app/api/` — BFF proxy routes
- `backend/api/routes/` — FastAPI endpoints | `backend/schemas/` — Pydantic models
- `backend/db/models/tenant/clinical.py` — ORM + enums | `store/` — Zustand stores
- `types/` — TypeScript types | `tests/e2e/` — Playwright E2E specs
- `lib/bff.ts` — BFF proxy | `scripts/dev.sh` — dev workflow helper

## Testing
- Dev creds: duytran@yahoo.com / 123456
- E2E: `tests/e2e/` with shared helpers in `tests/e2e/helpers/test-utils.js`
- `loginOrRestore()` caches sessions — use instead of `login()` for speed
