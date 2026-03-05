---
phase: 1
slug: security-auth-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (backend) + jest 29.x (frontend) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx jest --testPathPattern=auth --passWithNoTests` |
| **Full suite command** | `npx jest && pytest backend/tests/ -x` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern=auth --passWithNoTests`
- **After every plan wave:** Run `npx jest && pytest backend/tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SEC-01 | integration | `pytest backend/tests/test_security.py::test_missing_jwt_secret -x` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | SEC-02 | unit | `pytest backend/tests/test_config.py::test_required_secret_key -x` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | SEC-03 | unit | `pytest backend/tests/test_config.py::test_required_supabase_url -x` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | SEC-09 | smoke | `curl -I localhost:3000` | N/A | ⬜ pending |
| 01-01-05 | 01 | 1 | SEC-10 | unit | Check bundle for devtools in prod | N/A | ⬜ pending |
| 01-02-01 | 02 | 2 | SEC-04 | smoke | Manual — login page renders | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | SEC-05 | unit | `npx jest logout.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 2 | SEC-06 | smoke | Manual — refresh preserves session | N/A | ⬜ pending |
| 01-02-04 | 02 | 2 | SEC-07 | integration | Manual + middleware unit test | ❌ W0 | ⬜ pending |
| 01-02-05 | 02 | 2 | SEC-08 | unit | `npx jest sessionStore.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 1 | INF-01 | smoke | `cd backend && python -c "from backend.main import app"` | N/A | ⬜ pending |
| 01-03-02 | 03 | 1 | INF-02 | smoke | `cd backend && alembic current` | N/A | ⬜ pending |
| 01-03-03 | 03 | 1 | INF-03 | integration | `cd backend && alembic upgrade head` | N/A | ⬜ pending |
| 01-03-04 | 03 | 2 | INF-04 | unit | `npx jest audit-logs.route.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-05 | 03 | 2 | INF-05 | unit | `npx jest ai-scribe.route.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-06 | 03 | 2 | INF-06 | integration | Manual — JWT decode check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_config.py` — stubs for SEC-02, SEC-03
- [ ] `backend/tests/test_security.py` — stubs for SEC-01
- [ ] `backend/tests/conftest.py` — shared pytest fixtures (test DB, mock JWT)
- [ ] `__tests__/sessionStore.test.ts` — stubs for SEC-08
- [ ] `__tests__/logout.test.ts` — stubs for SEC-05
- [ ] `__tests__/audit-logs.route.test.ts` — stubs for INF-04
- [ ] `__tests__/ai-scribe.route.test.ts` — stubs for INF-05
- [ ] Framework install: `pip install pytest pytest-asyncio httpx` + `npm install --save-dev jest @types/jest ts-jest`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login page renders and accepts credentials | SEC-04 | Full browser auth flow with Supabase | Open /login, enter test credentials, verify redirect |
| Session persists across refresh | SEC-06 | Browser cookie persistence | Log in, refresh page, verify session intact |
| Security headers present | SEC-09 | HTTP response headers | `curl -sI localhost:3000 \| grep -E "X-Frame\|CSP\|X-Content"` |
| Devtools disabled in prod | SEC-10 | Build output inspection | `npm run build && grep -r "devtools" .next/` |
| JWT contains custom claims | INF-06 | Supabase hook execution | Log in, decode JWT at jwt.io, verify tenant_id + role |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
