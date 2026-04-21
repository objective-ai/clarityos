---
phase: 11
slug: marketing-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> This phase is frontend-only (marketing pages, no DB/API). Primary validation is static-analysis + Playwright smoke.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Frameworks** | TypeScript 5.5, ESLint (next lint), @playwright/test, vitest 3.x |
| **Config files** | `playwright.config.ts`, `vitest.config.ts`, `tsconfig.json` |
| **Quick run command** | `npx tsc --noEmit && npm run lint` |
| **Full suite command** | `npx tsc --noEmit && npm run lint && npx playwright test tests/e2e/marketing-pages.spec.ts` |
| **Build gate** | `npm run build` (catches route group misconfiguration, missing metadata types) |
| **Estimated runtime** | ~45s quick, ~90s full (headless), ~3min including build |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit` (fast type-check)
- **After each wave:** Run quick command (tsc + lint)
- **Before `/gsd:verify-work`:** Full suite green + `npm run build` succeeds + manual browser walk
- **Max feedback latency:** 45s for quick, 90s for full

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Scope | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | Route group + shared layout | build | `npm run build` passes; grep `app/(marketing)/layout.tsx` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 0 | Shared marketing primitives (MarketingHero, MarketingSection, CTABanner, FeatureIcon, PricingCard, ComparisonTable) | type-check | `npx tsc --noEmit`; grep exports in `app/_components/marketing/` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 0 | Static data modules (features, pricing, competitors) | type-check | `npx tsc --noEmit`; each file exports typed const array | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | `/features` page renders icon grid | E2E smoke | `playwright test` — page loads, ≥6 feature cards visible | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 1 | `/features` demo CTA → mailto/book | E2E smoke | Playwright asserts CTA link href | ❌ W0 | ⬜ pending |
| 11-03-01 | 03 | 1 | `/pricing` renders 3 tiers | E2E smoke | Playwright counts 3 tier cards, asserts "Schedule a Demo" CTA | ❌ W0 | ⬜ pending |
| 11-04-01 | 04 | 1 | `/compare` renders table | E2E smoke | Playwright asserts table headers: ClarityOS, RevolutionEHR, Barti, EyeCloudPro | ❌ W0 | ⬜ pending |
| 11-04-02 | 04 | 1 | Comparison legal footnote | grep | `grep "as of April 2026" app/(marketing)/compare/page.tsx` | ❌ W0 | ⬜ pending |
| 11-05-01 | 05 | 2 | Per-route metadata | grep | `grep "export const metadata" app/(marketing)/{features,pricing,compare}/page.tsx` | ❌ W0 | ⬜ pending |
| 11-05-02 | 05 | 2 | MarketingNav + MarketingFooter reused on all 3 pages | E2E | Playwright asserts nav brand link + footer copyright present on each route | ❌ W0 | ⬜ pending |
| 11-05-03 | 05 | 2 | Reserved tenant-slug blocklist includes features/pricing/compare | unit/grep | `grep -E "features\|pricing\|compare" backend/` for reserved slug list | ✅ verify | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/marketing-pages.spec.ts` — Playwright smoke tests for /features, /pricing, /compare (unauthenticated, tag `@auth`)
- [ ] Route group `app/(marketing)/` directory with shared `layout.tsx`
- [ ] Move `app/page.tsx` → `app/(marketing)/page.tsx` (or confirm not needed)
- [ ] Verify reserved tenant-slug blocklist in backend includes: `features`, `pricing`, `compare`, `book`, `intake`, `login`, `api`, `admin`

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Visual polish — typography rhythm, color contrast, spacing | Subjective design quality | Open each page at 1920/1366/375 widths, compare against LandingPage.tsx aesthetic |
| Mobile responsive layout | Playwright default viewport insufficient | DevTools responsive mode: iPhone 14, iPad, desktop |
| Competitor comparison claim accuracy | Legal/ethical — must be verifiable against public vendor sources | Spot-check each ◐/✓/— cell against vendor website; cite URL in code comment |
| Copy voice — "Trust & Authority" | Tone cannot be automated | Read every heading/paragraph aloud; flag marketing-ese |
| OG image renders correctly on LinkedIn/Twitter | Requires social platform cache | Paste URL into LinkedIn Post Inspector + Twitter Card Validator |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags in plan commands
- [ ] Feedback latency < 90s full / 45s quick
- [ ] `npm run build` passes before `/gsd:verify-work`
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills task IDs

**Approval:** pending
