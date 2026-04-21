import { COLORS, FONT_FAMILIES } from "@/app/(marketing)/_data/marketingTokens";

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  return (
    <div style={{ textAlign: align }}>
      {eyebrow && (
        <span
          style={{
            fontSize: "0.82rem",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: COLORS.primary,
            display: "inline-block",
            marginBottom: "0.75rem",
          }}
        >
          {eyebrow}
        </span>
      )}
      <h2
        style={{
          fontSize: "2.25rem",
          fontWeight: 700,
          color: COLORS.text,
          fontFamily: FONT_FAMILIES.heading,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            fontSize: "1.1rem",
            color: COLORS.textMuted,
            marginTop: "0.85rem",
            maxWidth: "640px",
            marginLeft: align === "center" ? "auto" : "0",
            marginRight: align === "center" ? "auto" : "0",
            lineHeight: 1.6,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
