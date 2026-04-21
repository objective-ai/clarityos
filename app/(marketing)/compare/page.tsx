import type { Metadata } from "next";
import { COMPETITORS, COMPARE_ROWS, COMPARE_FOOTNOTE } from "../_data/compare";
import { COLORS } from "../_data/marketingTokens";
import SectionHeader from "@/app/_components/marketing/SectionHeader";
import CompareTable from "@/app/_components/marketing/CompareTable";
import CTABanner from "@/app/_components/marketing/CTABanner";

export const metadata: Metadata = {
  title: "ClarityOS vs RevolutionEHR, Barti, EyeCloudPro | ClarityOS",
  description:
    "How ClarityOS compares to other optometry EHRs. Side-by-side feature comparison with RevolutionEHR, Barti, and EyeCloudPro.",
  openGraph: {
    title: "ClarityOS vs RevolutionEHR, Barti, EyeCloudPro",
    description: "Capability-by-capability comparison of the leading optometry EHR platforms.",
    type: "website",
  },
};

type LegendItem = {
  symbol: string;
  label: string;
  color: string;
};

const LEGEND: LegendItem[] = [
  { symbol: "✓", label: "Yes — feature available",          color: COLORS.success },
  { symbol: "◐", label: "Partial — limited or add-on",       color: COLORS.partial },
  { symbol: "—", label: "Not available or not documented",   color: COLORS.neutral },
];

export default function ComparePage() {
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
          eyebrow="Compare"
          title="ClarityOS vs RevolutionEHR, Barti, EyeCloudPro"
          subtitle="A capability-by-capability look at how ClarityOS stacks up against the leading optometry EHRs."
        />
      </section>

      {/* Legend */}
      <section style={{ padding: "0 2rem 1rem" }}>
        <div
          style={{
            maxWidth: 1160,
            margin: "0 auto",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            justifyContent: "center",
            fontSize: "0.9rem",
            color: COLORS.textMuted,
          }}
        >
          {LEGEND.map((item) => (
            <span
              key={item.label}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <span
                aria-hidden="true"
                style={{
                  color: item.color,
                  fontWeight: 700,
                  fontSize: "1.05rem",
                  minWidth: "1rem",
                  textAlign: "center",
                }}
              >
                {item.symbol}
              </span>
              {item.label}
            </span>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section style={{ padding: "1rem 2rem 4rem" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <CompareTable
            competitors={COMPETITORS}
            rows={COMPARE_ROWS}
            footnote={COMPARE_FOOTNOTE}
          />
        </div>
      </section>

      {/* Closing CTA */}
      <CTABanner
        title="Want a walkthrough on your specific workflows?"
        subtitle="Book a 20-minute demo. We'll run through your real practice scenarios — exam, billing, optical handoff — live."
      />
    </>
  );
}
