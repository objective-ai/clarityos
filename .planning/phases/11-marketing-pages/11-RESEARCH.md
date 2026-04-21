# Phase 11: Marketing Pages - Research

**Researched:** 2026-04-21
**Domain:** Next.js 14 App Router marketing site (static, light-mode Trust & Authority design system)
**Confidence:** HIGH

## Summary

Phase 11 builds three public marketing pages (`/features`, `/pricing`, `/compare`) using the design system already established in `LandingPage.tsx`, `MarketingNav.tsx`, and `MarketingFooter.tsx`. The existing homepage is a self-contained, inline-styled React client component — no shared "Section" primitives exist yet. The foundational opportunity for this phase is extracting reusable marketing primitives (Hero, SectionHeader, FeatureCard, CTABanner) while creating the three new route pages.

Routing-wise, Next.js 14 App Router supports a `(marketing)` route group that groups marketing pages under a shared layout without affecting URLs. Because `app/page.tsx` already serves the marketing landing page at `/` (with an auth-gated redirect to dashboard), moving it into `app/(marketing)/page.tsx` alongside the new pages is the cleanest structure — it keeps marketing concerns co-located and lets us centralize metadata/OG defaults in a group layout.

Content should be expressed as TypeScript data modules (`app/(marketing)/_data/*.ts`) — not MDX or CMS. This matches the existing pattern in `LandingPage.tsx` where `STATS`, `HOW_IT_WORKS`, `FEATURES`, and `TESTIMONIALS` are inlined arrays. For a three-page static marketing site pre-launch, TS modules give type safety, zero runtime cost, and easy i18n later.

**Primary recommendation:** Extract 3-5 reusable primitives from `LandingPage.tsx` into `app/_components/marketing/` (MarketingHero, SectionHeader, FeatureCard, CTABanner, PricingCard, CompareTable). Create a `(marketing)` route group with shared layout. Build `/features`, `/pricing`, `/compare` as server components consuming TS data modules. Use `lucide-react` (already installed at `^0.576.0`) for feature icons going forward — but keep existing inline SVGs on LandingPage to avoid churn in this phase.

---

## User Constraints

No CONTEXT.md exists for Phase 11 yet. Constraints derived from ROADMAP.md Phase 11 goal and `<additional_context>` in the research brief:

### Locked Decisions
- **Design system:** Trust & Authority — light mode, `#2563EB` primary, `#F97316` CTA (orange), `#F8FAFC` page bg, `#FFFFFF` surface, Lexend (headlines) + Source Sans 3 (body).
- **Scope:** Three pages only — `/features`, `/pricing`, `/compare`.
- **Shared chrome:** All pages use existing `MarketingNav` and `MarketingFooter`.
- **Competitors:** RevolutionEHR, Barti, EyeCloudPro.
- **Pricing:** Three tier placeholder structure — pricing not finalized; CTAs route to "Schedule a Demo".
- **Primary CTA (all pages):** Orange "Schedule a Demo" button (`mailto:hello@clarityos.com?subject=Demo Request`, matches LandingPage).

### Claude's Discretion
- Route structure: `app/(marketing)/` group vs flat `app/features/page.tsx`.
- Component extraction granularity (how many primitives to break out).
- Icon strategy: keep inline SVGs vs migrate to `lucide-react`.
- Competitor comparison dimensions (must be factual).
- Pricing tier names and feature bullets (placeholders).
- Per-page metadata copy and OG image strategy.

### Deferred Ideas (OUT OF SCOPE)
- Real blog / case studies / testimonials with live data.
- CMS integration (MDX, Contentful, Sanity) — not needed pre-launch.
- Real pricing page with payment integration (Stripe checkout).
- Live demo request form or Calendly embed — stay on `mailto:` for Phase 11.
- About/Contact/Privacy/Terms pages (currently `#` placeholders in footer).
- Localization / i18n.
- A/B testing or analytics beacons.
- Dynamic OG image generation (stick to static `og.png` for this phase).

---

## Phase Requirements

No formal requirement IDs mapped. From ROADMAP.md Phase 11 success criteria:

| ID (proposed) | Description | Research Support |
|---|---|---|
| MKT-01 | `/features` page with icon grid, clinical workflow highlights, demo CTA | Reuse `FEATURES` array shape from `LandingPage.tsx`; extract `FeatureCard`; add secondary clinical-workflow sections |
| MKT-02 | `/pricing` page with 3 placeholder tiers + "Schedule a Demo" orange CTA | New `PricingCard` primitive with tier data in `app/(marketing)/_data/pricing.ts` |
| MKT-03 | `/compare` page with comparison table vs RevolutionEHR, Barti, EyeCloudPro | New `CompareTable` primitive; comparison-dimensions data module |
| MKT-04 | All pages use shared `MarketingNav` and `MarketingFooter` | Existing components — reuse verbatim |
| MKT-05 | Per-route SEO metadata (title, description, OG) | Next.js `export const metadata` per page; root `metadata.template` already handles `%s | ClarityOS` suffix |

---

## Standard Stack

### Core (already installed — verified in package.json)
| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| next | 14.x (App Router) | Routing, metadata API, static generation | Project baseline |
| react | 18.x | Component model | Project baseline |
| typescript | 5.5 | Type-safe content modules | Project baseline |
| tailwindcss | 3.4 | Utility styling (where `style={}` isn't used) | Project baseline |
| lucide-react | `^0.576.0` | Icon set | Already installed; modern, tree-shakeable, matches shadcn ecosystem |

### Supporting — nothing new to install
| Library | Version | Purpose | When to Use |
|---|---|---|---|
| next/link | built-in | Client-side navigation between marketing pages | All internal links |
| next/font/google | built-in (already wired in `layout.tsx`) | Lexend + Source Sans 3 loading via CSS vars `--font-lexend`, `--font-source-sans` | Already set — no change needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| Inline `style={}` (LandingPage pattern) | Tailwind utility classes | LandingPage already uses inline styles — keeping the pattern avoids design-system bifurcation. Mixing can cause maintenance drag. **Recommend: match LandingPage's inline-style approach for visual consistency**, but extract repeated tokens (colors, spacing) into a local `marketingTokens.ts`. |
| TS data modules | MDX, Sanity, Contentful | MDX/CMS is premature for 3 static pages. TS modules compile to zero runtime cost and give full type safety. |
| Static TSX tables | react-table / data-grid lib | 3-competitor comparison is a handful of rows — no lib justified. |
| `lucide-react` icons | Inline SVG (current pattern) | Current FEATURES array embeds SVG JSX in data — works but bloats data modules. `lucide-react` gives named, tree-shakeable icons. **Recommend `lucide-react` for the NEW features/compare pages; leave LandingPage inline SVGs alone this phase**. |

**Installation:** None required — all dependencies already present.

**Version verification (as of 2026-04-21):**
- `lucide-react ^0.576.0` — verified in `package.json`. Current on npm as of research date.
- No new packages require approval.

---

## Architecture Patterns

### Recommended Project Structure

```
app/
├── (marketing)/                      # NEW route group — shared marketing layout
│   ├── layout.tsx                    # Wraps with MarketingNav + MarketingFooter; auth-gate redirect
│   ├── page.tsx                      # MOVED from app/page.tsx — the landing page
│   ├── features/
│   │   └── page.tsx                  # NEW — /features
│   ├── pricing/
│   │   └── page.tsx                  # NEW — /pricing
│   ├── compare/
│   │   └── page.tsx                  # NEW — /compare
│   └── _data/                        # Co-located TS content modules
│       ├── features.ts               # Feature grid data (icon key, title, tag, desc)
│       ├── pricing.ts                # Tier data (name, price placeholder, bullets, cta)
│       ├── compare.ts                # Competitor dimensions and rows
│       └── marketingTokens.ts        # Shared color/spacing constants
│
├── _components/
│   ├── LandingPage.tsx               # EXISTS — may be refactored to consume primitives
│   └── marketing/                    # Shared marketing primitives
│       ├── MarketingNav.tsx          # EXISTS — reuse
│       ├── MarketingFooter.tsx       # EXISTS — reuse
│       ├── MarketingHero.tsx         # NEW — extract from LandingPage hero
│       ├── SectionHeader.tsx         # NEW — eyebrow + h2 + subhead pattern (used 4x on landing)
│       ├── FeatureCard.tsx           # NEW — icon + tag chip + title + desc
│       ├── CTABanner.tsx             # NEW — blue panel w/ orange CTA (reused on all pages)
│       ├── PricingCard.tsx           # NEW — tier card
│       └── CompareTable.tsx          # NEW — competitor comparison table
│
└── page.tsx                          # DECISION POINT: delete after moving to (marketing)/page.tsx
                                      # OR keep as thin server component that imports from (marketing)
```

### Pattern 1: Route Group for Marketing Pages
**What:** Next.js 14 App Router `(marketing)` folder wraps a subtree with a shared layout without affecting URLs. `/features` etc. resolve normally.
**When to use:** Any time multiple sibling routes share a layout/wrapper and you want colocated data/components.
**Example:**
```tsx
// app/(marketing)/layout.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import MarketingNav from "@/app/_components/marketing/MarketingNav";
import MarketingFooter from "@/app/_components/marketing/MarketingFooter";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Same auth gate as current app/page.tsx — signed-in users shouldn't see marketing.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const tenantSlug = user.app_metadata?.tenant_slug ?? "clinic";
    redirect(`/${tenantSlug}/dashboard`);
  }

  return (
    <div style={{ background: "#F8FAFC", color: "#1E293B", minHeight: "100vh",
      fontFamily: "var(--font-source-sans, 'Source Sans 3', system-ui, sans-serif)" }}>
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
```
**Benefit:** Every marketing page automatically gets nav + footer + auth redirect; individual pages only render their unique sections. Source: Next.js App Router route groups (official docs).

### Pattern 2: Per-Page Metadata
**What:** Each marketing page exports a `metadata` object to set per-route title, description, and OG info.
**Example:**
```tsx
// app/(marketing)/features/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",  // Resolves to "Features | ClarityOS" via root layout template.
  description: "AI Scribe, smart scheduling, integrated billing, optometry-specific workflows — every feature in one EHR.",
  openGraph: {
    title: "ClarityOS Features — AI Scribe, Scheduling, Billing for Optometry",
    description: "See every clinical workflow built for eye care.",
    type: "website",
    // images: ["/og-features.png"],  // Add static OG images in /public if desired.
  },
};

export default function FeaturesPage() { /* ... */ }
```
The root `app/layout.tsx` already defines `title.template = "%s | ClarityOS"`, so pages need only a short title.

### Pattern 3: Static TS Data Modules
**What:** Express page content as typed arrays imported by the page component.
**Example:**
```ts
// app/(marketing)/_data/pricing.ts
import type { LucideIcon } from "lucide-react";
import { Sparkles, Building2, Rocket } from "lucide-react";

export type PricingTier = {
  id: "starter" | "growth" | "scale";
  name: string;
  tagline: string;
  icon: LucideIcon;
  priceLabel: string;       // "Contact us" / "Custom" — no real prices yet
  priceHint: string;        // "per provider / month" etc.
  features: string[];
  ctaLabel: string;
  ctaHref: string;          // mailto for now
  highlight?: boolean;      // visually emphasize one tier
};

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "starter",
    name: "Solo",
    tagline: "For independent optometrists",
    icon: Sparkles,
    priceLabel: "Contact us",
    priceHint: "1 provider",
    features: [
      "AI Clinical Scribe",
      "Integrated scheduling & intake",
      "Superbill + claim PDF generation",
      "Email support",
    ],
    ctaLabel: "Schedule a Demo",
    ctaHref: "mailto:hello@clarityos.com?subject=Pricing%20-%20Solo",
  },
  // ... Growth, Scale tiers
];
```

### Pattern 4: Server Components by Default
**What:** All three marketing pages should be server components (no `"use client"`) since they have no interactivity beyond links and hover styles. Hover effects driven by inline `onMouseEnter`/`onMouseLeave` (LandingPage pattern) force client components.
**Tradeoff:** LandingPage is marked `"use client"` because of hover handlers. For consistency and simplicity, it's OK to mirror that — but new pages without complex hover states should default to server. **Recommend: `FeatureCard`, `PricingCard`, `CompareTable` primitives use CSS `:hover` via a small `<style jsx>` block OR plain Tailwind `hover:` classes — keeps pages server-rendered and improves SEO/FCP.**

### Anti-Patterns to Avoid
- **Duplicating chrome per page:** Do NOT render `<MarketingNav />` + `<MarketingFooter />` in each page. Use the route-group layout.
- **Mixing inline styles and Tailwind mid-component:** Pick one per component. LandingPage is inline-style only — new primitives should match that pattern for visual parity (or fully migrate both).
- **Client components for static content:** Don't add `"use client"` just because it's convenient. Marketing pages benefit from server rendering for SEO.
- **Hardcoding tier/feature data inside JSX:** Keeps pages >500 lines and impossible to update copy without React diffing. Always externalize to `_data/`.
- **Using `<a href="/features">`:** Always use `next/link` `<Link>` for internal routes (client-side nav, prefetch).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Page head tags (title, OG, description) | Custom `<Head>` component or `next/head` | Route `export const metadata` (App Router) | App Router auto-merges metadata from layouts + pages. Root `title.template` already handles suffix. |
| Font loading | Manual `<link rel="preload">` tags | `next/font/google` (already wired in `layout.tsx`) | Auto self-hosted, auto preload, zero layout shift. |
| Icon SVG boilerplate | Inline `<svg>` JSX for every icon | `lucide-react` named imports | Tree-shakeable, named, consistent stroke widths. |
| OG image dynamic rendering | Custom HTML-to-image service | Static PNGs in `/public/og-*.png` for Phase 11; `next/og` (ImageResponse) only if Phase 12+ needs dynamic | Dynamic OG is overkill for 3 static pages. |
| Route group layouts | Manually wrapping every page | `(marketing)/layout.tsx` | Next.js built-in. One source of truth. |
| Comparison table a11y | Custom aria attributes | Semantic `<table>` with `<thead>`, `<tbody>`, `<th scope>` | Built-in screen-reader semantics. |

**Key insight:** Everything this phase needs is already in Next.js, React, lucide-react, or inherited from the existing `LandingPage.tsx` patterns. The phase is almost purely compositional — zero infra, zero deps.

---

## Common Pitfalls

### Pitfall 1: Breaking the root auth redirect
**What goes wrong:** Current `app/page.tsx` redirects signed-in users to `/${tenant_slug}/dashboard`. If we move landing to `(marketing)/page.tsx` without also moving that check, signed-in users will see the marketing site.
**Why it happens:** Route group layouts apply to all children, including `(marketing)/page.tsx` (which becomes `/`).
**How to avoid:** Port the auth check to `(marketing)/layout.tsx` (see Pattern 1 above). Then the layout gates ALL four pages — landing, features, pricing, compare — which is actually what we want (signed-in users shouldn't see marketing at all).
**Warning signs:** Logged-in user visits `/features` and doesn't redirect → layout auth check missing.

### Pitfall 2: Tenant slug collision
**What goes wrong:** `/features`, `/pricing`, `/compare` could collide with `app/(tenant)/[tenant]/...` catch-all if the tenant slug happens to equal one of those strings.
**Why it happens:** Next.js App Router static routes take precedence over dynamic routes, but if someone signs up with tenant slug `features`, their dashboard URL `/features/dashboard` still works — but `/features` alone will always resolve to the marketing page.
**How to avoid:** Add `features`, `pricing`, `compare`, `book`, `intake`, `login`, `api` to a reserved tenant-slug blocklist at signup time (if not already present). Check `backend/api/routes/` tenant registration flow.
**Warning signs:** Signup succeeds for slug `features`, and their top-nav links break.

### Pitfall 3: Hover effects in server components
**What goes wrong:** Copying LandingPage's `onMouseEnter={...}` inline handlers into a server component triggers a build error: "Event handlers cannot be passed to Client Component props."
**Why it happens:** Inline event handlers require `"use client"`.
**How to avoid:** Either (a) mark the card/button primitive with `"use client"` and keep the page itself server-rendered (best — hydration is tiny), or (b) use CSS `:hover` via Tailwind `hover:` classes or a `<style>` block.
**Warning signs:** Build error mentioning "Event handlers cannot be passed to Client Component props."

### Pitfall 4: Font CSS variable not applied on new pages
**What goes wrong:** New pages render with system font instead of Lexend/Source Sans 3.
**Why it happens:** Font CSS variables are applied at `<html>` level in `app/layout.tsx` — but only take effect if `font-family: var(--font-lexend)` is declared somewhere in the component tree.
**How to avoid:** The route-group layout already sets `fontFamily: "var(--font-source-sans, ...)"` on its outer `<div>` (mirrors LandingPage). Headings explicitly use `"var(--font-lexend, ...)"`. Verify by opening DevTools → Computed → font-family.
**Warning signs:** Text on `/features` looks heavier/different than `/`.

### Pitfall 5: Competitor claims creating legal risk
**What goes wrong:** `/compare` page makes unverifiable or false claims about competitor features → defamation, trade libel, or FTC complaint.
**Why it happens:** Easy to overclaim or misrepresent competitor pricing/features when copying from their marketing.
**How to avoid:** For each row in the compare table, use three states only: ✓ (confirmed on competitor's public site), ✗ (confirmed absent on public site), or "—" (unknown / not publicly documented). **Add a footnote: "Based on publicly documented features as of [DATE]. Please verify with each vendor."** Don't make pricing claims — all competitors use "contact for pricing" / custom quotes; say the same on our table.
**Warning signs:** Compare table has specific dollar amounts or "better than" superlatives.

### Pitfall 6: Mailto CTAs being stripped by email filters
**What goes wrong:** `mailto:hello@clarityos.com?subject=Demo Request` opens empty email in Outlook web / Gmail tab poorly.
**Why it happens:** Web email clients don't always honor mailto by default.
**How to avoid:** Acceptable for Phase 11 — already the pattern on LandingPage. Phase 12+ can upgrade to a real form or Calendly embed. Track clicks with a server route `/api/demo-request-click` as a follow-up.
**Warning signs:** Near-zero demo requests relative to traffic.

---

## Code Examples

### Example 1: Marketing Route Layout (the linchpin)
```tsx
// app/(marketing)/layout.tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import MarketingNav from "@/app/_components/marketing/MarketingNav";
import MarketingFooter from "@/app/_components/marketing/MarketingFooter";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const tenantSlug = user.app_metadata?.tenant_slug ?? "clinic";
    redirect(`/${tenantSlug}/dashboard`);
  }

  return (
    <div
      style={{
        background: "#F8FAFC",
        color: "#1E293B",
        minHeight: "100vh",
        fontFamily: "var(--font-source-sans, 'Source Sans 3', system-ui, sans-serif)",
      }}
    >
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
```

### Example 2: Features Page (server component, consumes `_data/features.ts`)
```tsx
// app/(marketing)/features/page.tsx
import type { Metadata } from "next";
import { FEATURE_GROUPS } from "../_data/features";
import SectionHeader from "@/app/_components/marketing/SectionHeader";
import FeatureCard from "@/app/_components/marketing/FeatureCard";
import CTABanner from "@/app/_components/marketing/CTABanner";

export const metadata: Metadata = {
  title: "Features",
  description: "AI Clinical Scribe, smart scheduling, integrated billing, optometry-specific workflows — every feature in one EHR.",
};

export default function FeaturesPage() {
  return (
    <>
      <section style={{ padding: "120px 2rem 60px", maxWidth: 1160, margin: "0 auto", textAlign: "center" }}>
        <SectionHeader
          eyebrow="Features"
          title="Everything your practice needs"
          subtitle="Purpose-built for optometry — not retrofitted from general-purpose EHRs."
        />
      </section>

      {FEATURE_GROUPS.map((group) => (
        <section key={group.id} style={{ padding: "4rem 2rem", background: group.bg ?? "#FFFFFF" }}>
          <div style={{ maxWidth: 1160, margin: "0 auto" }}>
            <SectionHeader eyebrow={group.eyebrow} title={group.title} subtitle={group.subtitle} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem", marginTop: "2.5rem" }}>
              {group.features.map((f) => <FeatureCard key={f.id} {...f} />)}
            </div>
          </div>
        </section>
      ))}

      <CTABanner
        title="Ready to see it in action?"
        subtitle="Book a 20-minute live demo. See AI Scribe, superbill, and claim PDF generate — all in one encounter."
        ctaLabel="Schedule a Demo"
        ctaHref="mailto:hello@clarityos.com?subject=Demo%20Request"
      />
    </>
  );
}
```

### Example 3: Compare Table (static, accessible)
```tsx
// app/_components/marketing/CompareTable.tsx
import type { CompareRow, Competitor } from "@/app/(marketing)/_data/compare";

const CELL_BASE: React.CSSProperties = {
  padding: "0.85rem 1rem",
  borderBottom: "1px solid #E2E8F0",
  fontSize: "0.95rem",
  color: "#334155",
};

export default function CompareTable({
  competitors,
  rows,
}: {
  competitors: Competitor[];
  rows: CompareRow[];
}) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #E2E8F0", borderRadius: 12, background: "#FFFFFF" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr style={{ background: "#F8FAFC" }}>
            <th scope="col" style={{ ...CELL_BASE, textAlign: "left", fontWeight: 600, color: "#0F172A" }}>
              Capability
            </th>
            {competitors.map((c) => (
              <th key={c.id} scope="col" style={{ ...CELL_BASE, textAlign: "center", fontWeight: 600, color: c.id === "clarity" ? "#2563EB" : "#0F172A" }}>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row" style={{ ...CELL_BASE, textAlign: "left", fontWeight: 500, color: "#1E293B" }}>
                {row.label}
              </th>
              {competitors.map((c) => (
                <td key={c.id} style={{ ...CELL_BASE, textAlign: "center" }}>
                  {renderCell(row.support[c.id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: "0.85rem", color: "#94A3B8", padding: "0.75rem 1rem" }}>
        Based on publicly documented features as of April 2026. Please verify with each vendor for current offerings.
      </p>
    </div>
  );
}

function renderCell(v: "yes" | "no" | "partial" | "unknown") {
  if (v === "yes") return <span style={{ color: "#059669" }} aria-label="Yes">✓</span>;
  if (v === "no") return <span style={{ color: "#CBD5E1" }} aria-label="No">—</span>;
  if (v === "partial") return <span style={{ color: "#D97706" }} aria-label="Partial">◐</span>;
  return <span style={{ color: "#CBD5E1" }} aria-label="Unknown">—</span>;
}
```

### Example 4: Icon migration to lucide-react
```tsx
// Instead of the inline SVG in LandingPage's FEATURES array:
import { Sparkles, Calendar, Eye, Receipt, BarChart3, ClipboardList } from "lucide-react";

export const FEATURES = [
  {
    id: "ai-scribe",
    icon: Sparkles,  // Component reference — <f.icon size={20} stroke="#2563EB" />
    title: "AI Clinical Scribe",
    tag: "AI-powered",
    tagColor: "#2563EB",
    tagBg: "#EFF6FF",
    desc: "Dictate during the exam. Claude writes complete SOAP notes.",
  },
  // ... Calendar, Eye, Receipt, BarChart3, ClipboardList for the other 5
];
```

---

## Competitor Comparison Research

**Confidence: MEDIUM** — based on public marketing sites as of April 2026. Actual features may change. Treat all cells as starting points; verify each vendor's current site before publishing.

### Candidate Comparison Dimensions (pick 8-12)

Safe, factual, optometry-specific:

| Dimension | Rationale |
|---|---|
| Purpose-built for optometry | vs. general-purpose EHRs |
| AI clinical scribe (integrated) | Our flagship differentiator |
| Integrated billing & CMS-1500 | Phase 9 capability |
| Online patient self-booking | Phase 10.2 capability |
| Digital patient intake (pre-visit) | Phase 7 capability |
| Per-payer fee schedules | Phase 9 capability |
| Optical handoff workflow | Phase 6 capability |
| Flow board (Kanban practice view) | Phase 10.2 capability |
| Transparent pricing | Most competitors hide pricing |
| Modern UI (post-2020 design) | Legacy EHR pain point |
| Cloud-native (no install) | Legacy EHR pain point |
| HIPAA compliance | Table stakes — all should be ✓ |

### Competitor Snapshot (use as starting hypothesis, verify before publish)

- **RevolutionEHR** (revolutionehr.com) — established optometry EHR (since ~2007). Strong in optometry-specific workflows and billing. Traditional UI. No public pricing. AI features emerging but not a primary pitch. Cloud-based.
- **Barti** (barti-emr.com / or similar) — newer optometry EHR positioning as modern. Public site pitches online scheduling, patient engagement. Pricing not published. AI scribe status uncertain — verify on their features page before checking ✓.
- **EyeCloudPro** (eyecloudpro.com) — cloud optometry EHR, 12-tab workflow. Referenced already in project memory `gap_analysis_eyecloudpro.md`. Good inspiration but competitor. Strong on retail/optical integration.

**Recommendation for PLAN.md:** Spend ~30 min during `/gsd:plan-phase 11` or execution fetching each vendor's features page once to confirm yes/no/partial on every row. Cite the URL in the data module as a code comment next to each row so future updates are traceable.

### Anti-pattern to avoid
Do NOT claim "better UX" or "faster" or "cheaper" as comparison rows. These are subjective and invite legal pushback. Stick to capability presence/absence.

---

## Pricing Placeholder Strategy

**Confidence: HIGH** (no real prices = no risk of misrepresentation).

### Recommended 3 tiers

| Tier | Target | Price label | Seats hint | Flagship features |
|---|---|---|---|---|
| **Solo** | Independent optometrist, 1 provider | "Contact us" | "1 provider" | AI Scribe, scheduling, billing basics, email support |
| **Practice** (highlighted) | Small group, 2-5 providers | "Contact us" | "Up to 5 providers" | Everything in Solo + analytics, multi-provider scheduling, priority support, onboarding assistance |
| **Scale** | Multi-location, 6+ providers | "Custom" | "Unlimited providers" | Everything in Practice + dedicated CSM, SLA, custom integrations, SSO |

All three tier CTAs: orange "Schedule a Demo" → `mailto:hello@clarityos.com?subject=Pricing%20-%20<tier>`.

### Visual treatment
- Highlight Practice tier with blue border + "Most popular" pill.
- Each tier: icon (lucide `Sparkles` / `Building2` / `Rocket`), name, tagline, "Contact us" price, seats hint, feature bullet list with lucide `Check` icons, orange CTA.
- Below grid: FAQ-style expandable section: "Why no prices?" → "We're in pilot. Pricing locks in once we've validated with our launch cohort. Book a call and we'll quote you before the end of the conversation."

### Acknowledgment in copy
One line under the tier grid: "Pricing finalized Q3 2026 — early adopters lock in launch pricing."

---

## SEO & Metadata

### Current state (verified in `app/layout.tsx`)
```ts
export const metadata: Metadata = {
  title: { template: "%s | ClarityOS", default: "ClarityOS — Optometry EHR & Practice Management" },
  description: "AI-powered clinical documentation, scheduling, and billing — purpose-built for modern optometry practices.",
  keywords: ["optometry EHR", "eye care practice management", "AI clinical scribe", "optometry billing software"],
  openGraph: { title: "...", description: "...", type: "website" },
};
```
Root template means each page only needs a short `title` — e.g., `title: "Features"` renders as `"Features | ClarityOS"`.

### Per-page metadata to add (draft)
| Route | title | description (~155 chars) |
|---|---|---|
| `/features` | "Features" | "AI Clinical Scribe, smart scheduling, integrated billing, and optometry-specific workflows — every feature your practice needs, in one EHR." |
| `/pricing` | "Pricing" | "Simple, transparent pricing for solo optometrists to multi-location practices. Schedule a demo for a quote — no hidden fees, no implementation charges." |
| `/compare` | "ClarityOS vs RevolutionEHR, Barti, EyeCloudPro" | "How ClarityOS compares to other optometry EHRs. Side-by-side feature comparison with RevolutionEHR, Barti, and EyeCloudPro." |

### OG images
Static PNGs in `/public/og-features.png`, `/public/og-pricing.png`, `/public/og-compare.png` (1200x630). Reference via `metadata.openGraph.images`. If time-boxed, acceptable to skip per-page OG and rely on root default for Phase 11.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `next/head` component | `export const metadata` in route files | Next 13 App Router | Per-page SEO is now declarative and server-rendered |
| Manual `<link rel="preload">` fonts | `next/font/google` with CSS var | Next 13+ | Zero layout shift, self-hosted fonts with CWV improvements |
| Separate layout per page | Route group layouts | Next 13 App Router | DRY chrome, per-group logic (auth, tracking) |
| Page-level `"use client"` for hover | Primitive-level `"use client"` | Current best practice | Server-rendered pages, client-hydrated leaves only |
| MDX / Contentful for marketing | TypeScript data modules for small static sites | Contextual | Zero runtime, full type safety, git-tracked content |

**Deprecated/outdated:**
- `next/head` (still works but superseded by metadata API in App Router).
- Pages Router `_app.tsx` / `_document.tsx` (n/a — project is App Router).

---

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Playwright `@playwright/test` (E2E) + Vitest (unit) |
| Config file | `playwright.config.ts`, `vitest.config.ts` |
| Quick run command | `npx tsc --noEmit && npm run lint` |
| Full suite command | `bash scripts/dev.sh pre-test && npx playwright test tests/e2e/marketing-pages.spec.ts` |
| Phase gate | Type-check clean, lint clean, all marketing routes render, screenshots visually reviewed |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| MKT-01 | `/features` renders with feature grid + demo CTA | e2e (smoke) | `npx playwright test tests/e2e/marketing-pages.spec.ts -g "features"` | ❌ Wave 0 |
| MKT-02 | `/pricing` renders 3 tier cards + Schedule a Demo CTA on each | e2e (smoke) | `npx playwright test tests/e2e/marketing-pages.spec.ts -g "pricing"` | ❌ Wave 0 |
| MKT-03 | `/compare` renders table with 4 columns (ClarityOS + 3 competitors) | e2e (smoke) | `npx playwright test tests/e2e/marketing-pages.spec.ts -g "compare"` | ❌ Wave 0 |
| MKT-04 | Shared nav (Home/Features/Pricing/Compare) visible on all 4 marketing pages | e2e (smoke) | Same spec, loop over routes | ❌ Wave 0 |
| MKT-04 | Shared footer (Product/Company/Legal columns) visible on all 4 pages | e2e (smoke) | Same spec | ❌ Wave 0 |
| MKT-05 | Per-page `<title>` contains expected string | e2e (smoke) | Same spec, `expect(page).toHaveTitle(/Features \| ClarityOS/)` | ❌ Wave 0 |
| Auth gate | Signed-in user hitting `/features` redirects to `/${tenant}/dashboard` | e2e (authenticated) | `npx playwright test tests/e2e/marketing-pages.spec.ts -g "auth redirect"` | ❌ Wave 0 |
| Type safety | No TS errors after phase | typecheck | `npx tsc --noEmit` | ✅ (standard) |
| Lint cleanliness | No lint errors | lint | `npm run lint` | ✅ (standard) |
| Visual review | Pages match Trust & Authority design system | manual + playwright-cli screenshot | `bash scripts/dev.sh verify <screenshot.js>` | Manual only |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit && npm run lint`
- **Per wave merge:** Full Playwright suite for marketing pages + manual screenshot review
- **Phase gate:** Full suite green + manual visual walkthrough all 4 routes in browser (logged-out) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e/marketing-pages.spec.ts` — covers MKT-01 through MKT-05 + auth-gate redirect. Must be tagged `@auth` on the auth-gated test; the no-auth tests use default `storageState: undefined` via `test.use({ storageState: { cookies: [], origins: [] } })` or a no-auth project.
- [ ] `tests/e2e/fixtures/` already exists (per CLAUDE.md) — no new fixture needed; reuse `{ test, expect }` from `./fixtures`.
- [ ] No framework install needed (Playwright already in project per `playwright.config.ts`).

Manual validation steps (cannot be fully automated):
1. Load each of `/`, `/features`, `/pricing`, `/compare` in a fresh incognito tab.
2. Visually verify Trust & Authority design: `#F8FAFC` page bg, `#2563EB` primary accents, `#F97316` CTA buttons, Lexend headlines, Source Sans 3 body.
3. Click every nav link and every CTA — confirm they go to expected destinations.
4. Lighthouse check on `/features` for SEO + performance ≥ 90.
5. Test at 375px (mobile), 768px (tablet), 1440px (desktop) viewports.

---

## Open Questions

1. **Should `app/page.tsx` move into `(marketing)/page.tsx` or stay?**
   - What we know: moving unifies the auth gate in one layout and co-locates marketing routes; staying avoids touching a working file.
   - What's unclear: whether PatientBookingPage (`app/book/[slug]`) or intake should share marketing chrome.
   - Recommendation: **Move `page.tsx` into `(marketing)/`** — cleaner and enables the shared auth gate. `book/` and `intake/` have different chromes (their own headers) and stay outside the group.

2. **Pricing CTA label — "Schedule a Demo" or "Get a Quote"?**
   - What we know: ROADMAP spec says "Schedule a Demo"; consistency with hero CTA is valuable.
   - Recommendation: stick to "Schedule a Demo" across all pages per ROADMAP.

3. **Should we extract `LandingPage.tsx` into the same primitives (refactor) during Phase 11, or leave it alone?**
   - What we know: Extracting risks visual drift during this phase. Leaving it means temporary duplication of hero/section patterns.
   - Recommendation: **Leave LandingPage alone in Phase 11.** Extract primitives greenfield for the 3 new pages. File a follow-up todo to migrate LandingPage to primitives in a later phase (cosmetic refactor only).

4. **Do we need a reserved-slug blocklist for tenant signups (features/pricing/compare)?**
   - What we know: Unknown if tenant signup currently allows these slugs.
   - Recommendation: Planner or a Wave 0 task should `grep -n "reserved" backend/api/routes/tenant_*.py` to confirm blocklist coverage. If missing, add one.

5. **Static OG images — ship or defer?**
   - What we know: Adding 3 PNGs is trivial; skipping means all pages share the default OG.
   - Recommendation: Ship placeholder OG images (simple branded 1200x630 with page title + logo). Can iterate later.

---

## Sources

### Primary (HIGH confidence — local codebase)
- `app/page.tsx` — current homepage routing + auth gate
- `app/_components/LandingPage.tsx` — design system reference (colors, fonts, section patterns)
- `app/_components/marketing/MarketingNav.tsx` — shared nav (reusable verbatim)
- `app/_components/marketing/MarketingFooter.tsx` — shared footer (reusable verbatim)
- `app/layout.tsx` — root metadata template + font wiring (`--font-lexend`, `--font-source-sans`)
- `tailwind.config.ts` — theme tokens (note: marketing pages use `#2563EB` / `#F97316` directly, not the dark-mode `--accent` tokens)
- `.planning/ROADMAP.md` Phase 11 entry — success criteria
- `package.json` — `lucide-react ^0.576.0`, Next 14, React 18, Tailwind 3.4
- `.planning/config.json` — `nyquist_validation: true`, `commit_docs: true`

### Secondary (MEDIUM confidence)
- Next.js App Router documentation (route groups, metadata API, `next/font`) — industry-standard patterns
- Public marketing sites for RevolutionEHR, Barti, EyeCloudPro — use as starting hypothesis for compare table, verify each row before publish
- CLAUDE.md + `.claude/rules/testing.md` — Playwright fixture patterns + storageState conventions

### Tertiary (LOW confidence — needs validation)
- Specific feature-parity claims about competitors' AI scribe support: verify each vendor's current features page during execution.
- Tenant slug collision risk: verify `backend/api/routes/` has a reserved-slug blocklist or add one during execution.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — all deps present and verified in `package.json`
- Architecture: **HIGH** — Next.js App Router route groups are a documented, stable feature
- Pitfalls: **HIGH** — verified against codebase patterns (auth gate in `app/page.tsx`, font var wiring in `layout.tsx`)
- Competitor data: **MEDIUM** — needs per-row verification against vendor sites before publish
- Pricing strategy: **HIGH** — placeholder-only, no risk

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days — Next.js releases and competitor sites change; refresh before final polish)
