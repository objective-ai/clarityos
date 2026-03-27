---
phase: 10
slug: encounter-workflow-redesign
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + Playwright (E2E) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test:e2e` |
| **Estimated runtime** | ~30 seconds (unit) / ~120 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm run test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | SC-1: Pre-test mode visibility | E2E | `bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.ts` | ✅ | ⬜ pending |
| TBD | TBD | TBD | SC-2: Ready for Doctor transition | E2E | `bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.ts` | ✅ | ⬜ pending |
| TBD | TBD | TBD | SC-3: Doctor exam mode layout | E2E | `bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.ts` | ✅ | ⬜ pending |
| TBD | TBD | TBD | SC-4: Sticky mic button | E2E | `bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.ts` | ✅ | ⬜ pending |
| TBD | TBD | TBD | SC-5: Tab visibility by role | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-6: Expanded preliminary fields | unit+E2E | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-7: All Normal quick-fill | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/smoke-encounter.spec.ts` — update with pre-test/doctor mode selectors
- [ ] Unit test stubs for tab visibility logic and All Normal defaults
- [ ] Verify existing E2E infrastructure covers encounter page navigation

*Existing Playwright infrastructure covers base encounter navigation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sticky mic visible at all scroll positions | SC-4 | Scroll position testing unreliable in headless | Scroll encounter page fully, verify FAB stays fixed bottom-right |
| AI Scribe recording via sticky mic | SC-4 | Requires microphone hardware | Click sticky mic → verify recording indicator → stop → verify transcript passes to AiScribeWidget |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
