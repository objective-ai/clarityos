import { Check } from "lucide-react";
import type { PricingTier } from "@/app/(marketing)/_data/pricing";
import { COLORS, FONT_FAMILIES } from "@/app/(marketing)/_data/marketingTokens";

export default function PricingCard({ tier }: { tier: PricingTier }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${tier.highlight ? COLORS.primary : COLORS.border}`,
        borderRadius: "14px",
        padding: "1.75rem",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        height: "100%",
      }}
    >
      {tier.highlight && (
        <span
          style={{
            position: "absolute",
            background: COLORS.primary,
            color: "#FFFFFF",
            fontSize: "0.72rem",
            fontWeight: 600,
            padding: "0.25rem 0.65rem",
            borderRadius: "999px",
            top: "-10px",
            right: "16px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Most popular
        </span>
      )}

      {/* Icon */}
      <div
        style={{
          width: "44px",
          height: "44px",
          background: COLORS.primaryTint,
          border: `1px solid ${COLORS.primarySoft}`,
          borderRadius: "10px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <tier.icon size={22} strokeWidth={1.75} color={COLORS.primary} />
      </div>

      <h3
        style={{
          fontSize: "1.35rem",
          fontFamily: FONT_FAMILIES.heading,
          fontWeight: 700,
          color: COLORS.text,
          margin: 0,
        }}
      >
        {tier.name}
      </h3>

      <p
        style={{
          fontSize: "0.95rem",
          color: COLORS.textMuted,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {tier.tagline}
      </p>

      <div style={{ height: 1, background: COLORS.border }} />

      <div>
        <span
          style={{
            fontSize: "1.85rem",
            fontWeight: 700,
            color: COLORS.text,
            fontFamily: FONT_FAMILIES.heading,
            display: "block",
          }}
        >
          {tier.priceLabel}
        </span>
        <span
          style={{
            fontSize: "0.9rem",
            color: COLORS.textMuted,
          }}
        >
          {tier.priceHint}
        </span>
      </div>

      <ul style={{ padding: 0, margin: 0, listStyle: "none" }}>
        {tier.features.map((feature: string) => (
          <li
            key={feature}
            style={{
              display: "inline-flex",
              gap: "0.5rem",
              fontSize: "0.97rem",
              color: COLORS.text,
              lineHeight: 1.45,
              marginBottom: "0.5rem",
              width: "100%",
            }}
          >
            <Check size={16} color={COLORS.success} strokeWidth={2.5} />
            {feature}
          </li>
        ))}
      </ul>

      <a
        href={tier.ctaHref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
          background: COLORS.cta,
          color: "#FFFFFF",
          fontWeight: 600,
          fontSize: "1rem",
          padding: "0.75rem 1.6rem",
          borderRadius: "8px",
          textDecoration: "none",
          transition: "background 0.15s",
          marginTop: "auto",
          width: "100%",
        }}
      >
        {tier.ctaLabel}
      </a>
    </div>
  );
}
