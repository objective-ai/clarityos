import { COLORS, FONT_FAMILIES, DEMO_CTA_HREF } from "@/app/(marketing)/_data/marketingTokens";

export default function CTABanner({
  title,
  subtitle,
  ctaLabel = "Schedule a Demo",
  ctaHref = DEMO_CTA_HREF,
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <section
      style={{
        background: COLORS.primary,
        color: "#FFFFFF",
        padding: "4rem 2rem",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2
          style={{
            fontSize: "2rem",
            fontFamily: FONT_FAMILIES.heading,
            fontWeight: 700,
            margin: 0,
            color: "#FFFFFF",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: "1.1rem",
            color: "rgba(255,255,255,0.88)",
            marginTop: "0.85rem",
            marginBottom: "1.5rem",
            lineHeight: 1.6,
          }}
        >
          {subtitle}
        </p>
        <a
          href={ctaHref}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            background: COLORS.cta,
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: "1rem",
            padding: "0.75rem 1.6rem",
            borderRadius: "8px",
            textDecoration: "none",
            transition: "background 0.15s",
          }}
        >
          {ctaLabel}
        </a>
      </div>
    </section>
  );
}
