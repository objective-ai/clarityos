import type { Metadata } from "next";
import { PRICING_TIERS } from "../_data/pricing";
import { COLORS, FONT_FAMILIES } from "../_data/marketingTokens";
import SectionHeader from "@/app/_components/marketing/SectionHeader";
import PricingCard from "@/app/_components/marketing/PricingCard";
import CTABanner from "@/app/_components/marketing/CTABanner";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for solo optometrists to multi-location practices. Schedule a demo for a quote — no hidden fees, no implementation charges.",
  openGraph: {
    title: "ClarityOS Pricing — Simple, Transparent, Optometry-First",
    description:
      "Three tiers. Book a call and we'll quote you before the end of the conversation.",
    type: "website",
  },
};

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section
        style={{
          padding: "7.5rem 2rem 3rem",
          maxWidth: 1160,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <SectionHeader
          eyebrow="Pricing"
          title="Simple, transparent pricing"
          subtitle="Three tiers for every practice size. Book a demo and we'll quote you before the call ends."
        />
      </section>

      {/* Tier grid */}
      <section style={{ padding: "1rem 2rem 4rem" }}>
        <div
          style={{
            maxWidth: 1160,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
            alignItems: "stretch",
          }}
        >
          {PRICING_TIERS.map((tier) => (
            <PricingCard key={tier.id} tier={tier} />
          ))}
        </div>
        <p
          style={{
            maxWidth: 1160,
            margin: "2rem auto 0",
            textAlign: "center",
            fontSize: "0.95rem",
            color: COLORS.textMuted,
          }}
        >
          Pricing finalized Q3 2026 — early adopters lock in launch pricing.
        </p>
      </section>

      {/* Why no prices? explainer */}
      <section
        style={{
          padding: "3rem 2rem 4.5rem",
          background: COLORS.surfaceAlt,
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: "2rem",
          }}
        >
          <h3
            style={{
              fontSize: "1.15rem",
              fontFamily: FONT_FAMILIES.heading,
              fontWeight: 600,
              color: COLORS.text,
              margin: 0,
              marginBottom: "0.75rem",
            }}
          >
            Why no prices?
          </h3>
          <p
            style={{
              fontSize: "1rem",
              color: COLORS.textMuted,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            We&apos;re in pilot. Pricing locks in once we&apos;ve validated with our launch cohort.
            Book a call and we&apos;ll quote you before the end of the conversation — no lead-magnet
            forms, no sales gauntlet.
          </p>
        </div>
      </section>

      {/* Closing CTA */}
      <CTABanner
        title="Ready for a quote?"
        subtitle="20 minutes. We'll show you the product, quote you a price, and answer every question."
      />
    </>
  );
}
