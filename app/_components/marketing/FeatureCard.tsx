import type { Feature } from "@/app/(marketing)/_data/features";
import { COLORS, FONT_FAMILIES } from "@/app/(marketing)/_data/marketingTokens";

export default function FeatureCard({ icon: Icon, title, tag, tagColor, tagBg, desc }: Feature) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "12px",
        padding: "1.5rem",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
    >
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
          marginBottom: "1rem",
        }}
      >
        <Icon size={20} strokeWidth={1.75} color={COLORS.primary} />
      </div>

      <div>
        <span
          style={{
            background: tagBg,
            color: tagColor,
            fontSize: "0.72rem",
            fontWeight: 600,
            padding: "0.2rem 0.6rem",
            borderRadius: "999px",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {tag}
        </span>
      </div>

      <h3
        style={{
          fontSize: "1.15rem",
          fontWeight: 600,
          color: COLORS.text,
          fontFamily: FONT_FAMILIES.heading,
          margin: "0.75rem 0 0.5rem",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: "0.97rem",
          color: COLORS.textMuted,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {desc}
      </p>
    </div>
  );
}
