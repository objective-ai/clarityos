import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./store/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        jakarta: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        accent:    "var(--accent)",
        base:      "var(--bg-base)",
        surface:   "var(--bg-surface)",
        elevated:  "var(--bg-elevated)",
        overlay:   "var(--bg-overlay)",
        glass:     "var(--bg-glass)",
        primary:   "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted:     "var(--text-muted)",
        normal:    "var(--state-normal)",
        warning:   "var(--state-warning)",
        critical:  "var(--state-critical)",
        info:      "var(--state-info)",
      },
      borderColor: {
        subtle:  "var(--border-subtle)",
        default: "var(--border-default)",
        strong:  "var(--border-strong)",
        glow:    "var(--border-glow)",
        mono:    "var(--mono-border)",
      },
      boxShadow: {
        "card-sm": "var(--shadow-sm)",
        "card-md": "var(--shadow-md)",
        "card-lg": "var(--shadow-lg)",
        "card-glow": "var(--shadow-glow)",
      },
      borderRadius: {
        card: "16px",
      },
      minHeight: {
        touch: "var(--touch-target)",
      },
      backdropBlur: {
        glass: "var(--glass-blur)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(45, 212, 191, 0.4)" },
          "50%": { boxShadow: "0 0 0 6px rgba(45, 212, 191, 0)" },
        },
        "fade-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.98)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in-up": "fade-in-up 500ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-out": "fade-out 200ms ease both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
