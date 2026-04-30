import type { Metadata } from "next";
import { PRICING_TIERS } from "../_data/pricing";
import { COLORS, FONT_FAMILIES } from "../_data/marketingTokens";
import SectionHeader from "@/app/_components/marketing/SectionHeader";
import PricingCard from "@/app/_components/marketing/PricingCard";
import CTABanner from "@/app/_components/marketing/CTABanner";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for optometry practices. $199/mo Standard, $259/mo Premium with AI. No hidden fees, no implementation charges.",
  openGraph: {
    title: "ClarityOS Pricing — Simple, Transparent, Optometry-First",
    description:
      "Two plans. $199/mo Standard. $259/mo Premium with AI. Discounted pricing for additional practices.",
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
          subtitle="Two plans, flat monthly pricing. Add additional practices at a discount. Cancel anytime."
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
          No setup fees. No per-provider charges. No long-term contracts.
        </p>
      </section>

      {/* What's included explainer */}
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
            What&apos;s included
          </h3>
          <p
            style={{
              fontSize: "1rem",
              color: COLORS.textMuted,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Every plan includes unlimited patients, unlimited encounters, secure HIPAA-compliant
            hosting, and continuous updates. Run a second location? Add it for $149/mo on Standard
            or $209/mo on Premium — same login, same data, separate schedule and billing.
          </p>
        </div>
      </section>

      {/* Closing CTA */}
      <CTABanner
        title="Ready to get started?"
        subtitle="20 minutes. We'll walk you through the product and answer every question."
      />
    </>
  );
}
