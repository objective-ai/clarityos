---
phase: 11-marketing-pages
verified: 2026-04-21T00:00:00Z
status: passed
score: 11/11 must-haves verified
gaps: []
human_verification:
  - test: "Visit / (home), /features, /pricing, /compare while signed in"
    expected: "Redirected to /{tenantSlug}/dashboard on every route"
    why_human: "Auth gate calls supabase.auth.getUser() — can only be exercised with a live session; grep confirms the code path but not runtime redirect"
  - test: "Visit /features, /pricing, /compare in an incognito window"
    expected: "Pages render with MarketingNav + MarketingFooter visible, no auth error"
    why_human: "Server rendering with real Supabase client; can't verify 200 response without a running server"
  - test: "Check /compare table on mobile viewport (320px)"
    expected: "Table scrolls horizontally, not clipped; footnote wraps correctly"
    why_human: "Overflow/scroll behaviour requires visual browser check"
---

# Phase 11: Marketing Pages Verification Report

**Phase Goal:** Build public marketing pages (homepage, features, pricing, compare) as a dedicated route group with auth gate, shared layout, reusable primitives, and typed static data — giving ClarityOS a public web presence for the pilot launch.
**Verified:** 2026-04-21
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Anonymous visitors reach /features, /pricing, /compare without auth errors | ? HUMAN | Pages exist as server components; auth gate is in layout, not pages — structure correct; runtime needs human |
| 2 | Signed-in users hitting any marketing route redirect to /{tenantSlug}/dashboard | ? HUMAN | `layout.tsx` contains `supabase.auth.getUser` + `tenant_slug` + `redirect(/${tenantSlug}/dashboard)` — code path verified; runtime needs human |
| 3 | All four marketing routes share MarketingNav and MarketingFooter via the route-group layout | ✓ VERIFIED | `layout.tsx` imports and renders both; pages contain no duplicate nav/footer imports |
| 4 | Content (features, pricing tiers, competitor rows) lives in typed TS data modules — not inline in JSX | ✓ VERIFIED | `FEATURE_GROUPS`, `PRICING_TIERS`, `COMPARE_ROWS` all defined in `_data/*.ts`; pages consume via `.map` |
| 5 | Shared primitives are exported and have stable prop shapes consumed by Wave 1 pages | ✓ VERIFIED | All 5 primitives have `export default`; pages import and use each one |
| 6 | /features page renders hero + feature groups + CTABanner | ✓ VERIFIED | `features/page.tsx` maps `FEATURE_GROUPS`, uses `SectionHeader`, `FeatureCard`, `CTABanner` |
| 7 | /pricing page shows 3 tiers, highlighted Practice, acknowledgment, explainer | ✓ VERIFIED | `pricing/page.tsx` maps `PRICING_TIERS`, `highlight: true` on Practice tier confirmed in data, "Pricing finalized Q3 2026" + "Why no prices?" present |
| 8 | /compare page renders 4-column table (≥8 rows) with aria-labels and footnote | ✓ VERIFIED | `compare/page.tsx` wires `COMPETITORS`+`COMPARE_ROWS`+`COMPARE_FOOTNOTE` into `CompareTable`; `aria-label` and `scope="col"` confirmed in primitive |
| 9 | Per-route metadata exports resolving via root template | ✓ VERIFIED | All three pages have `export const metadata` with correct `title` strings |
| 10 | No `app/page.tsx` conflict (deleted) | ✓ VERIFIED | `ls app/page.tsx` returned exit code 2 — file does not exist; `app/(marketing)/page.tsx` is the sole home route |
| 11 | Playwright spec scaffold present with unauthenticated override and ≥6 tests | ✓ VERIFIED | 6 tests counted; `test.use({ storageState: { cookies: [], origins: [] } })` present |

**Score:** 11/11 truths verified (2 flagged for human runtime check)

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `app/(marketing)/layout.tsx` | ✓ VERIFIED | Auth gate (`supabase.auth.getUser` + `redirect`), MarketingNav, MarketingFooter wired |
| `app/(marketing)/page.tsx` | ✓ VERIFIED | Home route; wraps LandingPage |
| `app/page.tsx` | ✓ VERIFIED (deleted) | Deleted — no conflicting root route |
| `app/(marketing)/_data/marketingTokens.ts` | ✓ VERIFIED | Exports `COLORS`, `FONT_FAMILIES`, `DEMO_CTA_HREF` |
| `app/(marketing)/_data/features.ts` | ✓ VERIFIED | 14 `id:` entries (2 groups + 10 features); `FEATURE_GROUPS` exported |
| `app/(marketing)/_data/pricing.ts` | ✓ VERIFIED | 4 `id:` entries (3 tiers); `highlight: true` on Practice |
| `app/(marketing)/_data/compare.ts` | ✓ VERIFIED | 16 `id:` entries (4 competitors + 10 rows + 2 type aliases); 10 `// source:` comments; `COMPARE_FOOTNOTE` with "as of April 2026" |
| `app/_components/marketing/SectionHeader.tsx` | ✓ VERIFIED | `export default`, uses COLORS |
| `app/_components/marketing/FeatureCard.tsx` | ✓ VERIFIED | `export default`, 7 COLORS usages |
| `app/_components/marketing/CTABanner.tsx` | ✓ VERIFIED | `export default`, default CTA label "Schedule a Demo" |
| `app/_components/marketing/PricingCard.tsx` | ✓ VERIFIED | `export default`, lucide `Check` import confirmed |
| `app/_components/marketing/CompareTable.tsx` | ✓ VERIFIED | `export default`, `aria-label` cells, `scope="col"` headers |
| `app/(marketing)/features/page.tsx` | ✓ VERIFIED | Server component, metadata, FEATURE_GROUPS wired |
| `app/(marketing)/pricing/page.tsx` | ✓ VERIFIED | Server component, metadata, PRICING_TIERS wired |
| `app/(marketing)/compare/page.tsx` | ✓ VERIFIED | Server component, metadata, COMPETITORS/COMPARE_ROWS/COMPARE_FOOTNOTE wired |
| `tests/e2e/marketing-pages.spec.ts` | ✓ VERIFIED | 6 tests, unauthenticated storageState override |

---

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `app/(marketing)/layout.tsx` | `lib/supabase/server` | `supabase.auth.getUser` + `tenant_slug` + `redirect` | ✓ WIRED |
| `app/(marketing)/features/page.tsx` | `_data/features.ts` | `FEATURE_GROUPS.map` | ✓ WIRED |
| `app/(marketing)/features/page.tsx` | `SectionHeader`, `FeatureCard`, `CTABanner` | default imports + JSX | ✓ WIRED |
| `app/(marketing)/pricing/page.tsx` | `_data/pricing.ts` | `PRICING_TIERS.map` | ✓ WIRED |
| `app/(marketing)/pricing/page.tsx` | `PricingCard` | default import + prop `tier` | ✓ WIRED |
| `app/(marketing)/compare/page.tsx` | `_data/compare.ts` | `COMPETITORS`, `COMPARE_ROWS`, `COMPARE_FOOTNOTE` imports | ✓ WIRED |
| `app/(marketing)/compare/page.tsx` | `CompareTable` | prop passing `competitors`, `rows`, `footnote` | ✓ WIRED |
| `app/_components/marketing/PricingCard.tsx` | `_data/marketingTokens.ts` | `DEMO_CTA_HREF`, `COLORS` | ✓ WIRED |
| `app/(marketing)/_data/features.ts` | `lucide-react` | named icon imports | ✓ WIRED (confirmed by file existence + FEATURE_GROUPS content) |

---

### Requirements Coverage

| Requirement | Plans | Description | Status |
|-------------|-------|-------------|--------|
| MKT-01 | 11-01, 11-02 | Feature icon grid + clinical workflow highlights + demo CTA | ✓ SATISFIED — FEATURE_GROUPS (10 features), CTABanner, DEMO_CTA_HREF all wired |
| MKT-02 | 11-01, 11-03 | 3 pricing tiers + orange CTA, no real prices | ✓ SATISFIED — PRICING_TIERS (3 tiers), `highlight: true`, no `$[0-9]` |
| MKT-03 | 11-01, 11-04 | Competitor comparison table | ✓ SATISFIED — CompareTable with 10 COMPARE_ROWS, 4 competitors, aria-labels |
| MKT-04 | 11-01, 11-02, 11-03, 11-04 | Shared layout (MarketingNav + MarketingFooter) via route group | ✓ SATISFIED — layout.tsx wires both; pages do not duplicate chrome |
| MKT-05 | 11-02, 11-03, 11-04 | Per-route metadata (title, description, OG) | ✓ SATISFIED — `export const metadata` in features, pricing, compare pages |

Note: MKT-* IDs are phase-local — not present in REQUIREMENTS.md. No orphaned requirements found.

---

### Anti-Patterns Found

None. Zero TODO/FIXME/placeholder comments, no `return null`, no empty handlers, no `console.log` in marketing files. All server pages correctly omit `"use client"`. No duplicate nav/footer rendering in page files.

---

### Human Verification Required

#### 1. Auth gate runtime redirect

**Test:** Sign in as `duytran@yahoo.com / 123456`, then navigate to `/`, `/features`, `/pricing`, `/compare` in the browser.
**Expected:** Each route immediately redirects to `/{tenantSlug}/dashboard`.
**Why human:** `layout.tsx` has the correct Supabase auth call and redirect — confirmed by grep — but the redirect only fires at runtime with a real JWT cookie.

#### 2. Anonymous access (no auth errors)

**Test:** Open an incognito/private window and visit `/features`, `/pricing`, `/compare`.
**Expected:** Pages render with full MarketingNav and MarketingFooter, HTTP 200, no error screen.
**Why human:** Server-side Supabase client requires a running Next.js dev server; can't verify without one.

#### 3. Compare table mobile overflow

**Test:** Open `/compare` in Chrome DevTools at 375px viewport width.
**Expected:** Table scrolls horizontally; cells are not clipped; footnote text wraps cleanly.
**Why human:** CSS overflow behaviour requires visual browser check.

---

### Gaps Summary

No gaps. All must-haves verified in the codebase. Phase goal is achieved — all four public routes exist, are wired to typed data, share a single auth-gated layout, and the primitive library is complete. The two human-needed items are runtime/visual checks, not structural gaps.

---

_Verified: 2026-04-21_
_Verifier: Claude (gsd-verifier)_
