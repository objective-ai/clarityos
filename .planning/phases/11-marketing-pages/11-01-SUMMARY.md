---
phase: 11-marketing-pages
plan: 01
subsystem: ui
tags: [next-js, marketing, tailwind, playwright, typescript, lucide-react]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Supabase server client (createServerSupabaseClient) used in auth gate
  - phase: 02-auth-ui
    provides: Root app/page.tsx auth-redirect pattern replicated in marketing layout
provides:
  - Marketing route group app/(marketing)/ with auth-gated shared layout
  - Five reusable marketing primitives (SectionHeader, FeatureCard, CTABanner, PricingCard, CompareTable)
  - Four typed data modules (marketingTokens, features, pricing, compare)
  - Playwright E2E spec scaffold for all marketing routes
affects:
  - 11-02 (features page)
  - 11-03 (pricing page)
  - 11-04 (compare page)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Marketing route group with auth-gate redirect in layout (server component, no page-level auth)
    - Typed static data modules under _data/ — content separated from JSX composition
    - Inline style tokens via COLORS/FONT_FAMILIES constants (no Tailwind, matches LandingPage pattern)
    - E2E spec overrides storageState to empty for unauthenticated marketing route testing

key-files:
  created:
    - app/(marketing)/layout.tsx
    - app/(marketing)/page.tsx
    - app/(marketing)/_data/marketingTokens.ts
    - app/(marketing)/_data/features.ts
    - app/(marketing)/_data/pricing.ts
    - app/(marketing)/_data/compare.ts
    - app/_components/marketing/SectionHeader.tsx
    - app/_components/marketing/FeatureCard.tsx
    - app/_components/marketing/CTABanner.tsx
    - app/_components/marketing/PricingCard.tsx
    - app/_components/marketing/CompareTable.tsx
    - tests/e2e/marketing-pages.spec.ts
  modified:
    - app/page.tsx (deleted — replaced by app/(marketing)/page.tsx to resolve Next.js conflicting routes)

key-decisions:
  - "app/page.tsx deleted (not kept as thin re-export) — Next.js App Router treats (marketing)/page.tsx as / making both routes conflict; deletion resolves build error cleanly"
  - "All five primitives are server components with static inline styles — no use client, no JS hover handlers; transition CSS properties provide smoothness"
  - "10 compare rows authored with // source: unverified comments on rows lacking public vendor docs; Wave 2 polish plan will replace with verified URLs"

patterns-established:
  - "Marketing layout pattern: async server component reads Supabase user, redirects authenticated users to /{tenantSlug}/dashboard, then renders nav + children + footer"
  - "Data module pattern: typed TS const arrays under _data/ consumed by Wave 1 page components via map()"
  - "Token pattern: COLORS/FONT_FAMILIES/DEMO_CTA_HREF imported from marketingTokens.ts across all marketing components"

requirements-completed: [MKT-01, MKT-02, MKT-03, MKT-04, MKT-05]

# Metrics
duration: ~45min
completed: 2026-04-21
---

# Phase 11 Plan 01: Marketing Foundation Summary

**Marketing route group with auth-gated layout, five typed primitives, three content data modules, and Playwright spec scaffold — Wave 1 page plans compose directly on top**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-21
- **Completed:** 2026-04-21
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Auth-gated `app/(marketing)/layout.tsx` server component: redirects signed-in users to `/{tenantSlug}/dashboard`, wraps anonymous visitors with MarketingNav + MarketingFooter
- Five marketing primitives (SectionHeader, FeatureCard, CTABanner, PricingCard, CompareTable) — all server-rendered with inline COLORS tokens, stable prop contracts for Wave 1
- Three typed content modules (`features.ts` with 10 features in 2 groups, `pricing.ts` with 3 tiers, `compare.ts` with 10 competitor rows across 4 vendors) plus `marketingTokens.ts`
- Playwright spec scaffold with 6 tests covering all four marketing routes — currently RED (pages 404 until Wave 1), expected per plan

## Task Commits

1. **Task 1: Route group, shared layout, move landing page** - `238ecb7` (feat)
2. **Task 2: Five marketing primitives** - `5e8f2c6` (feat)
3. **Task 3: Typed data modules + Playwright spec scaffold** - `5e8f2c6` (feat)

## Files Created/Modified

- `app/(marketing)/layout.tsx` — Auth-gate server component + MarketingNav + MarketingFooter wrapper
- `app/(marketing)/page.tsx` — Landing page route (imports LandingPage component)
- `app/(marketing)/_data/marketingTokens.ts` — COLORS, FONT_FAMILIES, DEMO_CTA_HREF constants
- `app/(marketing)/_data/features.ts` — FEATURE_GROUPS (2 groups, 10 features), Feature/FeatureGroup types
- `app/(marketing)/_data/pricing.ts` — PRICING_TIERS (Solo, Practice, Scale), PricingTier type
- `app/(marketing)/_data/compare.ts` — COMPETITORS (4), COMPARE_ROWS (10), COMPARE_FOOTNOTE
- `app/_components/marketing/SectionHeader.tsx` — Eyebrow + H2 + subtitle primitive
- `app/_components/marketing/FeatureCard.tsx` — Icon + tag + title + desc card
- `app/_components/marketing/CTABanner.tsx` — Blue panel with orange Schedule-a-Demo CTA
- `app/_components/marketing/PricingCard.tsx` — Tier card with highlight pill, feature bullets, CTA
- `app/_components/marketing/CompareTable.tsx` — Semantic table with aria-labels and scope attrs
- `tests/e2e/marketing-pages.spec.ts` — 6 Playwright tests (unauthenticated storageState override)
- `app/page.tsx` — DELETED (Next.js conflicting routes resolution)

## Decisions Made

- **app/page.tsx deleted:** Next.js App Router resolves `(marketing)/page.tsx` to `/`, making `app/page.tsx` a conflicting route. Thin re-export approach causes build failure. Deletion is the clean resolution — the plan explicitly anticipated this outcome.
- **All primitives are server components:** No `"use client"` needed. Static inline styles with `transition` CSS properties provide visual smoothness without JS hover handlers. Simpler, faster, SSR-safe.
- **compare.ts unverified rows:** 7 of 10 competitor rows carry `// source: unverified — flagged for manual review before publish`. Rows with public vendor docs (optometry-native, patient-booking, cms1500) are marked with source URLs. Wave 2 polish plan handles remaining verification.

## Deviations from Plan

None — plan executed exactly as written. The `app/page.tsx` deletion was explicitly planned as the preferred resolution (plan text: "a route-group `page.tsx` replaces the root `page.tsx`").

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 1 page executors (plans 02, 03, 04) can import all primitives and data modules directly — no further foundation work required
- E2E spec tests will turn GREEN as each page plan executes
- 7 compare rows flagged for source verification before public launch — tracked with `// source: unverified` comments in `compare.ts`

---
*Phase: 11-marketing-pages*
*Completed: 2026-04-21*
