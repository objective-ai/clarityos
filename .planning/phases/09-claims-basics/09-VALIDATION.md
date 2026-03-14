---
phase: 9
slug: claims-basics
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend unit) + pytest (backend unit) |
| **Config file** | `vitest.config.ts` (project root) / `backend/pytest.ini` or `pyproject.toml` |
| **Quick run command** | `npx vitest run tests/unit/lib/feeService.test.ts tests/unit/store/payerStore.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/lib/ tests/unit/store/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | INS-01 | Integration (Alembic) | `python -m alembic upgrade head` | ❌ Wave 0 | ⬜ pending |
| 9-01-02 | 01 | 1 | INS-02 | Unit (Python) | `pytest backend/tests/test_fee_service.py -x` | ❌ Wave 0 | ⬜ pending |
| 9-01-03 | 01 | 1 | INS-02 | Unit (TS) | `npx vitest run tests/unit/lib/feeService.test.ts` | ❌ Wave 0 | ⬜ pending |
| 9-02-01 | 02 | 1 | INS-03 | Manual smoke | `bash scripts/dev.sh verify tests/e2e/verify-payers-admin.js` | ❌ Wave 0 | ⬜ pending |
| 9-02-02 | 02 | 1 | INS-04 | Manual smoke | `bash scripts/dev.sh verify tests/e2e/verify-patient-insurance.js` | ❌ Wave 0 | ⬜ pending |
| 9-03-01 | 03 | 2 | INS-05 | Unit (TS) | `npx vitest run tests/unit/store/payerStore.test.ts` | ❌ Wave 0 | ⬜ pending |
| 9-03-02 | 03 | 2 | INS-05 | Unit (Python) | `pytest backend/tests/test_fee_service.py::test_resolve_fee_fallback -x` | ❌ Wave 0 | ⬜ pending |
| 9-04-01 | 04 | 2 | INS-06 | Integration (manual) | `bash scripts/dev.sh check-api` | ✅ exists | ⬜ pending |
| 9-05-01 | 05 | 3 | INS-07 | Manual smoke | `bash scripts/dev.sh verify tests/e2e/verify-patient-billing.js` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/lib/feeService.test.ts` — stubs for INS-02 (TS fee resolution)
- [ ] `tests/unit/store/payerStore.test.ts` — stubs for INS-05 (payer list + insurance state)
- [ ] `backend/tests/test_fee_service.py` — stubs for INS-05 (Python: payer rate resolution + fallback)
- [ ] `backend/alembic/versions/0008_claims_basics.py` — covers INS-01 (migration file)
- [ ] `tests/e2e/verify-payers-admin.js` — smoke test stub for INS-03
- [ ] `tests/e2e/verify-patient-insurance.js` — smoke test stub for INS-04
- [ ] `tests/e2e/verify-patient-billing.js` — smoke test stub for INS-07

*No new test framework install needed — vitest + pytest both already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Alembic migration applies cleanly | INS-01 | DB migration requires live Postgres | `cd backend && python -m alembic upgrade head` — verify 0 errors |
| PDF BFF returns binary application/pdf | INS-06 | Binary response hard to assert in unit tests | Download PDF from superbill, verify opens in browser with correct content |
| Payer selection modal pre-fills fees | INS-05 | State orchestration across modal + store | Create superbill, select payer, verify line item fees update with fee_source indicator |
| Fee source indicator appears | INS-05 | Visual indicator (asterisk/highlight) for base_rate | After payer selection, verify line items show indicator when using base fee fallback |
| CMS-1500 PDF content is correct | INS-06 | Visual PDF layout verification | Download PDF, check patient info, payer info, service lines, total, clinic header |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
