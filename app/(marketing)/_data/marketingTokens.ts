export const COLORS = {
  pageBg:      "#F8FAFC",
  surface:     "#FFFFFF",
  surfaceAlt:  "#F1F5F9",
  border:      "#E2E8F0",
  primary:     "#2563EB",   // Trust & Authority blue
  primaryTint: "#EFF6FF",
  primarySoft: "#BFDBFE",
  cta:         "#F97316",   // Orange Schedule-a-Demo
  ctaHover:    "#EA6C00",
  text:        "#1E293B",
  textMuted:   "#64748B",
  textSubtle:  "#94A3B8",
  success:     "#059669",
  partial:     "#D97706",
  neutral:     "#CBD5E1",
} as const;

export const FONT_FAMILIES = {
  heading: "var(--font-lexend, system-ui, sans-serif)",
  body:    "var(--font-source-sans, 'Source Sans 3', system-ui, sans-serif)",
} as const;

export const DEMO_CTA_HREF = "mailto:hello@clarityos.com?subject=Demo%20Request";
