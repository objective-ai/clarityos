---
phase: 8
slug: analytics-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + @testing-library/react; Playwright E2E |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds (unit); ~60 seconds (E2E smoke) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite + `bash scripts/dev.sh verify tests/e2e/smoke-analytics.spec.js` must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-00-01 | 00 | 0 | ANAL-V2-01 | setup | `npm install recharts@^2.12 && npx tsc --noEmit` | ✅ | ⬜ pending |
| 8-00-02 | 00 | 0 | ANAL-V2-01 | stub | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 8-01-01 | 01 | 1 | ANAL-V2-01 | unit | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 8-01-02 | 01 | 1 | ANAL-V2-02 | unit | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 8-02-01 | 02 | 2 | ANAL-V2-01 | E2E smoke | `bash scripts/dev.sh verify tests/e2e/smoke-analytics.spec.js` | ❌ W0 | ⬜ pending |
| 8-02-02 | 02 | 2 | ANAL-V2-02 | E2E smoke | `bash scripts/dev.sh verify tests/e2e/smoke-analytics.spec.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/smoke-analytics.spec.js` — stubs for ANAL-V2-01, ANAL-V2-02 (model: existing smoke-billing.spec.js)
- [ ] `backend/schemas/analytics.py` — Pydantic response schemas for aggregate endpoint
- [ ] `store/analyticsStore.ts` — Zustand store (model: billingDashboardStore.ts)
- [ ] `npm install recharts@^2.12` — runtime UI library (not in devDependencies)

*Wave 0 creates the scaffolding that Wave 1 (backend) and Wave 2 (frontend) fill in.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Glass-style tooltips render correctly on dark bg | ANAL-V2-01 | Visual/aesthetic | Load analytics page, hover over chart bar/point, verify tooltip has glass-card styling |
| Empty-state banner shows for new clinics | ANAL-V2-01 | Requires zero-data tenant | Log in as new tenant with no encounters, verify "Analytics will populate..." banner |
| Trend arrows green/red direction is correct | ANAL-V2-01 | Requires period-over-period data | Create encounters in two periods, verify arrow direction matches increase/decrease |
| Responsive single-column on mobile | ANAL-V2-01 | Viewport testing | Resize browser to 375px width, verify charts collapse to single column |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
