import type { Metadata } from "next";
import { FEATURE_GROUPS } from "../_data/features";
import { COLORS, DEMO_CTA_HREF } from "../_data/marketingTokens";
import SectionHeader from "@/app/_components/marketing/SectionHeader";
import FeatureCard from "@/app/_components/marketing/FeatureCard";
import CTABanner from "@/app/_components/marketing/CTABanner";

export const metadata: Metadata = {
  title: "Features",
  description:
    "AI Clinical Scribe, smart scheduling, integrated billing, and optometry-specific workflows — every feature your practice needs, in one EHR.",
  openGraph: {
    title: "ClarityOS Features — AI Scribe, Scheduling, Billing for Optometry",
    description: "See every clinical workflow built for eye care.",
    type: "website",
  },
};

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section
        style={{
          padding: "7.5rem 2rem 3.75rem",
          maxWidth: 1160,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <SectionHeader
          eyebrow="Features"
          title="Everything your practice needs"
          subtitle="Purpose-built for optometry — not retrofitted from general-purpose EHRs."
        />
        <a
          href={DEMO_CTA_HREF}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            marginTop: "1.75rem",
            background: COLORS.cta,
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: "1rem",
            padding: "0.75rem 1.6rem",
            borderRadius: "8px",
            textDecoration: "none",
          }}
        >
          Schedule a Demo
        </a>
      </section>

      {/* Feature groups */}
      {FEATURE_GROUPS.map((group) => (
        <section
          key={group.id}
          style={{
            padding: "4rem 2rem",
            background: group.bg ?? COLORS.surface,
          }}
        >
          <div style={{ maxWidth: 1160, margin: "0 auto" }}>
            <SectionHeader
              eyebrow={group.eyebrow}
              title={group.title}
              subtitle={group.subtitle}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.25rem",
                marginTop: "2.5rem",
              }}
            >
              {group.features.map((f) => (
                <FeatureCard key={f.id} {...f} />
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Closing CTA */}
      <CTABanner
        title="Ready to see it in action?"
        subtitle="Book a 20-minute live demo. See AI Scribe, superbill, and claim PDF generate — all in one encounter."
      />
    </>
  );
}
