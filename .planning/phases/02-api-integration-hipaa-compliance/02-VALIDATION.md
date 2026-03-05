---
phase: 2
slug: api-integration-hipaa-compliance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + @testing-library/react + jsdom |
| **Config file** | vitest.config.ts (Wave 0 creates) |
| **Quick run command** | `npx vitest run tests/lib/api-client.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/lib/api-client.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | API-08 | unit | `npx vitest run tests/lib/api-client.test.ts -t "snakifyKeys"` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | API-01 | unit | `npx vitest run tests/store/encounterStore.test.ts -t "loadEncounter"` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | API-02 | unit | `npx vitest run tests/store/vitalsStore.test.ts -t "no mock fallback"` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | API-03 | unit | `npx vitest run tests/store/refractionStore.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 1 | API-04 | unit | `npx vitest run tests/store/examFindingsStore.test.ts -t "loadFindings"` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 1 | API-05 | unit | `npx vitest run tests/store/diagnosisStore.test.ts -t "no mock fallback"` | ❌ W0 | ⬜ pending |
| 02-01-07 | 01 | 1 | API-06 | unit | `npx vitest run tests/store/problemListStore.test.ts -t "fetchProblems"` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | API-07 | lint | `grep -r "from.*lib/mock" app/ components/ lib/ --include="*.ts" --include="*.tsx"` | N/A | ⬜ pending |
| 02-02-02 | 02 | 2 | HIPAA-01 | integration | Manual — requires running FastAPI locally | N/A | ⬜ pending |
| 02-02-03 | 02 | 2 | HIPAA-02 | smoke | `npx vitest run tests/components/AuditTrailSidebar.test.ts -t "fetches audit logs"` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 2 | HIPAA-03 | — | Already completed in Phase 1 | N/A | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — framework config with jsdom environment
- [ ] Framework install: `npm install -D vitest @vitest/ui jsdom @testing-library/react`
- [ ] `tests/lib/api-client.test.ts` — stubs for API-03, API-08 (snakifyKeys, camelizeKeys, auth header, retry logic)
- [ ] `tests/store/encounterStore.test.ts` — stubs for API-01 (loadEncounter, persist override)
- [ ] `tests/store/vitalsStore.test.ts` — stubs for API-02 (no mock fallback, real error surfaces)
- [ ] `tests/store/examFindingsStore.test.ts` — stubs for API-04
- [ ] `tests/store/diagnosisStore.test.ts` — stubs for API-05
- [ ] `tests/store/problemListStore.test.ts` — stubs for API-06
- [ ] `tests/components/AuditTrailSidebar.test.ts` — stubs for HIPAA-02

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PHI read logging on GET endpoints | HIPAA-01 | Requires running FastAPI with database | Start FastAPI, open encounter, check audit_log table for phi_viewed entry |
| Skeleton screens display during load | User decision | Visual verification | Open encounter page, observe loading states before data arrives |
| Save status indicators per-section | User decision | Visual verification | Edit vitals, observe saving/saved/error indicators |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
