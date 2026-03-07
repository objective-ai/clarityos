# E2E Tests (Playwright)

Browser-based smoke tests for ClarityOS. These run via the Playwright skill executor.

## Prerequisites

1. Install Playwright (one-time):
   ```bash
   cd ~/.claude/skills/playwright-skill && npm run setup
   ```

2. Start dev servers:
   - Next.js: `npm run dev` (port 3000)
   - FastAPI: `uvicorn backend.main:app --reload` (port 8000)

## Running Tests

Single test:
```bash
cd ~/.claude/skills/playwright-skill && node run.js ../../Projects/clarityos/tests/e2e/smoke-login.spec.js
```

All smoke tests:
```bash
cd ~/.claude/skills/playwright-skill
for f in ../../Projects/clarityos/tests/e2e/smoke-*.spec.js; do
  echo "--- Running $f ---"
  node run.js "$f"
done
```

## Test Files

| File | Purpose |
|------|---------|
| `smoke-login.spec.js` | Login flow, slug-based redirect, no UUIDs in URL |
| `smoke-pages.spec.js` | Schedule + Patients pages load without "Locked" messages |
| `debug-auth.spec.js` | Auth diagnostic — full network capture (not pass/fail) |

## Test Credentials

- Email: `duytran@yahoo.com`
- Password: `123456`
- Expected slug: `sunview`

## Screenshots

Tests save screenshots to `/tmp/pw-e2e-*.png`.

## Key Patterns

- Login form uses `#email` / `#password` selectors (by id, not name)
- Login redirect uses `window.location.href` — requires `Promise.all([waitForNavigation, click])`
- All URLs parameterized via `TARGET_URL` constant at top of each file
