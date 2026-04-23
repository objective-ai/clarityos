"use client";

import Link from "next/link";

const FOOTER_LINKS = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Compare", href: "/compare" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Contact", href: "mailto:hello@clarityos.com" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
    { label: "HIPAA Compliance", href: "#" },
  ],
};

export default function MarketingFooter() {
  return (
    <footer
      style={{
        background: "#F8FAFC",
        borderTop: "1px solid #E2E8F0",
        padding: "3rem 2rem 2rem",
      }}
    >
      <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: "2.5rem",
            marginBottom: "2.5rem",
          }}
        >
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.85rem" }}>
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "5px",
                  background: "#EFF6FF",
                  border: "1px solid #BFDBFE",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="3" stroke="#2563EB" strokeWidth="1.5" />
                  <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <span
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  color: "#1E293B",
                  fontFamily: "var(--font-lexend, system-ui, sans-serif)",
                }}
              >
                ClarityOS
              </span>
            </div>
            <p style={{ fontSize: "1rem", color: "#64748B", lineHeight: 1.7, maxWidth: "260px" }}>
              AI-powered EHR purpose-built for modern optometry practices. Documentation, scheduling, and billing — all in one.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "#94A3B8",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: "0.85rem",
                }}
              >
                {category}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    style={{
                      fontSize: "1rem",
                      color: "#64748B",
                      textDecoration: "none",
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#1E293B"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#64748B"; }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            borderTop: "1px solid #E2E8F0",
            paddingTop: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <span style={{ fontSize: "0.95rem", color: "#94A3B8" }}>
            © 2026 ClarityOS · Built for eye care
          </span>
          <span style={{ fontSize: "0.95rem", color: "#CBD5E1" }}>
            HIPAA Compliant · SOC 2 Ready
          </span>
        </div>
      </div>
    </footer>
  );
}
