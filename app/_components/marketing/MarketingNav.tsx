"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/compare", label: "Compare" },
];

export default function MarketingNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "rgba(248,250,252,0.92)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid #E2E8F0",
      }}
    >
      <div
        style={{
          maxWidth: "1160px",
          margin: "0 auto",
          padding: "0 2rem",
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="#2563EB" strokeWidth="1.5" />
              <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span
            style={{
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "#1E293B",
              fontFamily: "var(--font-lexend, system-ui, sans-serif)",
              letterSpacing: "-0.01em",
            }}
          >
            ClarityOS
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  fontSize: "1rem",
                  fontWeight: active ? 600 : 500,
                  color: active ? "#1E293B" : "#64748B",
                  padding: "0.375rem 0.75rem",
                  borderRadius: "6px",
                  textDecoration: "none",
                  transition: "color 0.15s, background 0.15s",
                  background: active ? "#F1F5F9" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.target as HTMLElement).style.color = "#1E293B";
                    (e.target as HTMLElement).style.background = "#F8FAFC";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.target as HTMLElement).style.color = "#64748B";
                    (e.target as HTMLElement).style.background = "transparent";
                  }
                }}
              >
                {link.label}
              </Link>
            );
          })}

          <div style={{ width: "1px", height: "20px", background: "#E2E8F0", margin: "0 0.5rem" }} />

          <Link
            href="/login"
            style={{
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#475569",
              padding: "0.375rem 0.75rem",
              borderRadius: "6px",
              textDecoration: "none",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#1E293B"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#475569"; }}
          >
            Sign In
          </Link>

          <a
            href="mailto:hello@clarityos.com?subject=Demo Request"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#FFFFFF",
              background: "#F97316",
              padding: "0.45rem 1.1rem",
              borderRadius: "7px",
              textDecoration: "none",
              transition: "background 0.15s, transform 0.15s",
              marginLeft: "0.25rem",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = "#EA6C00";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = "#F97316";
            }}
          >
            Schedule a Demo
          </a>
        </div>
      </div>
    </nav>
  );
}
