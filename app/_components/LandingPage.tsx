"use client";

import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "2h", label: "Saved per provider daily" },
  { value: "60s", label: "Average SOAP note time" },
  { value: "99%", label: "Billing accuracy rate" },
  { value: "0", label: "Paper forms required" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Patient checks in",
    desc: "Digital intake form sent in advance. Health history lands directly in the chart — no re-entry.",
  },
  {
    step: "02",
    title: "Dictate with AI Scribe",
    desc: "Talk through the exam. Claude generates a complete SOAP note with ICD-10 codes in real time.",
  },
  {
    step: "03",
    title: "Review & submit",
    desc: "Superbill auto-populates with payer-aware fees. One click generates the claim PDF.",
  },
];

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="3" stroke="#2563EB" strokeWidth="1.5" />
        <path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4.4 4.4l1.8 1.8M13.8 13.8l1.8 1.8M4.4 15.6l1.8-1.8M13.8 6.2l1.8-1.8" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "AI Clinical Scribe",
    tag: "AI-powered",
    tagColor: "#2563EB",
    tagBg: "#EFF6FF",
    desc: "Dictate during the exam. Claude writes complete SOAP notes — assessment, plan, and ICD codes — ready to sign, not to edit.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="3.5" width="16" height="14" rx="2" stroke="#2563EB" strokeWidth="1.5" />
        <path d="M2 8.5h16M7 2v3M13 2v3" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "Smart Scheduling",
    tag: "Self-service",
    tagColor: "#0891B2",
    tagBg: "#ECFEFF",
    desc: "Online self-booking with automated confirmations, wait-list management, and real-time check-in status.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="#2563EB" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="3.5" stroke="#2563EB" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="1.2" fill="#2563EB" />
      </svg>
    ),
    title: "Clinical Workflows",
    tag: "Purpose-built",
    tagColor: "#2563EB",
    tagBg: "#EFF6FF",
    desc: "Optometry-specific exam flows — refraction, tonometry, fundus, dilation — every field exactly where it belongs.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 5h14M3 10h9M3 15h7" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="15.5" cy="15" r="2.5" stroke="#059669" strokeWidth="1.5" />
        <path d="M15.5 13.8v1.4l0.7 0.7" stroke="#059669" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
    title: "Integrated Billing",
    tag: "Revenue",
    tagColor: "#059669",
    tagBg: "#ECFDF5",
    desc: "E/M crosswalk, CPT auto-suggestions, and clean claim submission. From encounter to reimbursement in minutes.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="2" width="16" height="16" rx="2" stroke="#2563EB" strokeWidth="1.5" />
        <polyline points="4,14.5 7.5,9.5 10,12 13.5,6.5 16.5,10.5" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Practice Analytics",
    tag: "Insights",
    tagColor: "#D97706",
    tagBg: "#FFFBEB",
    desc: "Revenue trends, encounter volumes, wait times, and billing accuracy — your practice health at a glance.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3.5" y="2" width="13" height="16" rx="2" stroke="#2563EB" strokeWidth="1.5" />
        <path d="M7 7h6M7 10.5h6M7 14h4" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "Digital Patient Intake",
    tag: "Efficiency",
    tagColor: "#7C3AED",
    tagBg: "#F5F3FF",
    desc: "Send a link. Patients fill health history before they arrive. Data lands directly in the chart — zero re-entry.",
  },
];

const TESTIMONIALS = [
  {
    quote: "We cut our end-of-day charting from 90 minutes to under 15. The AI Scribe actually codes correctly — it knows the difference between a bilateral refraction and a standard exam.",
    name: "Dr. Sarah Chen",
    role: "OD, Solo Practice",
    practice: "Clear Vision Optometry",
  },
  {
    quote: "Switching from our old EHR took less than a week. The billing integration alone paid for itself — we went from 18% claim denials to under 2% in the first month.",
    name: "Dr. Marcus Webb",
    role: "Practice Owner",
    practice: "Webb Eye Care (3 locations)",
  },
  {
    quote: "My staff stopped complaining about the EHR. That alone was worth it. Now they're asking when we're getting more features. That's never happened before.",
    name: "Dr. Priya Nair",
    role: "OD, Multi-provider Clinic",
    practice: "Nair Eye Associates",
  },
];

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div
      style={{
        background: "#F8FAFC",
        color: "#1E293B",
        minHeight: "100vh",
        fontFamily: "var(--font-source-sans, 'Source Sans 3', system-ui, sans-serif)",
      }}
    >
      {/* ── Hero ── */}
      <section
        style={{
          paddingTop: "120px",
          paddingBottom: "80px",
          padding: "120px 2rem 80px",
          maxWidth: "1160px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        {/* Credential badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
            marginBottom: "2rem",
          }}
        >
          {["AI-Powered", "HIPAA Compliant", "Purpose-built for Optometry"].map((badge) => (
            <span
              key={badge}
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#2563EB",
                background: "#EFF6FF",
                border: "1px solid #BFDBFE",
                borderRadius: "100px",
                padding: "0.3rem 0.85rem",
                letterSpacing: "0.02em",
              }}
            >
              {badge}
            </span>
          ))}
        </div>

        {/* H1 */}
        <h1
          style={{
            fontFamily: "var(--font-lexend, system-ui, sans-serif)",
            fontSize: "clamp(2.4rem, 4.5vw, 3.8rem)",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            color: "#0F172A",
            marginBottom: "1.5rem",
          }}
        >
          The EHR Built for{" "}
          <span style={{ color: "#2563EB" }}>Modern Optometry</span>
        </h1>

        {/* Subhead */}
        <p
          style={{
            fontSize: "1.3rem",
            color: "#475569",
            lineHeight: 1.75,
            maxWidth: "560px",
            margin: "0 auto 2.5rem",
          }}
        >
          AI-powered clinical documentation, integrated scheduling, and smart billing — purpose-built for how eye care practitioners actually work.
        </p>

        {/* CTAs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <a
            href="mailto:hello@clarityos.com?subject=Demo Request"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "#F97316",
              color: "#FFFFFF",
              fontWeight: 600,
              fontSize: "0.95rem",
              padding: "0.75rem 1.75rem",
              borderRadius: "8px",
              textDecoration: "none",
              transition: "background 0.15s, transform 0.15s",
              boxShadow: "0 1px 3px rgba(249,115,22,0.3)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.background = "#EA6C00";
              el.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.background = "#F97316";
              el.style.transform = "translateY(0)";
            }}
          >
            Schedule a Demo
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "#475569",
              fontWeight: 500,
              fontSize: "0.95rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              textDecoration: "none",
              border: "1px solid #CBD5E1",
              background: "#FFFFFF",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = "#94A3B8";
              el.style.color = "#1E293B";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = "#CBD5E1";
              el.style.color = "#475569";
            }}
          >
            Sign In to Your Practice
          </Link>
        </div>

        {/* Inline proof */}
        <p style={{ fontSize: "1rem", color: "#94A3B8", marginTop: "1.5rem" }}>
          No implementation fee · No IT setup · Start seeing patients in days
        </p>
      </section>

      {/* ── Stats strip ── */}
      <section
        style={{
          background: "#FFFFFF",
          borderTop: "1px solid #E2E8F0",
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        <div
          style={{
            maxWidth: "1160px",
            margin: "0 auto",
            padding: "2.5rem 2rem",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "2rem",
          }}
        >
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "var(--font-lexend, system-ui, sans-serif)",
                  fontSize: "2.5rem",
                  fontWeight: 700,
                  color: "#2563EB",
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: "1rem",
                  color: "#94A3B8",
                  marginTop: "0.5rem",
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  fontWeight: 500,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ padding: "6rem 2rem" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#2563EB",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "0.75rem",
              }}
            >
              How it works
            </div>
            <h2
              style={{
                fontFamily: "var(--font-lexend, system-ui, sans-serif)",
                fontSize: "clamp(1.7rem, 2.8vw, 2.4rem)",
                fontWeight: 700,
                letterSpacing: "-0.025em",
                color: "#0F172A",
                marginBottom: "0.75rem",
              }}
            >
              From check-in to clean claim
            </h2>
            <p style={{ fontSize: "1.15rem", color: "#64748B", maxWidth: "440px", margin: "0 auto", lineHeight: 1.75 }}>
              Every step connected. No re-entry. No reconciliation.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "2rem",
              position: "relative",
            }}
          >
            {HOW_IT_WORKS.map((step, i) => (
              <div
                key={i}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "2rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    background: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    marginBottom: "1.25rem",
                    fontFamily: "var(--font-lexend, system-ui, sans-serif)",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: "#2563EB",
                  }}
                >
                  {step.step}
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-lexend, system-ui, sans-serif)",
                    fontSize: "1.4rem",
                    fontWeight: 600,
                    color: "#0F172A",
                    marginBottom: "0.6rem",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {step.title}
                </h3>
                <p style={{ fontSize: "1.1rem", color: "#64748B", lineHeight: 1.7 }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section style={{ padding: "0 2rem 6rem", background: "#F1F5F9" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto", paddingTop: "5rem" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#2563EB",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "0.75rem",
              }}
            >
              Everything in one system
            </div>
            <h2
              style={{
                fontFamily: "var(--font-lexend, system-ui, sans-serif)",
                fontSize: "clamp(1.7rem, 2.8vw, 2.4rem)",
                fontWeight: 700,
                letterSpacing: "-0.025em",
                color: "#0F172A",
              }}
            >
              Built for the full practice workflow
            </h2>
            <p style={{ fontSize: "1.15rem", color: "#64748B", marginTop: "0.75rem", maxWidth: "460px", margin: "0.75rem auto 0", lineHeight: 1.75 }}>
              From patient intake to claim submission — every step connected, every transition seamless.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1.25rem",
            }}
          >
            {FEATURES.map((f, i) => (
              <div
                key={i}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "1.75rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  transition: "box-shadow 0.2s, transform 0.2s, border-color 0.2s",
                  cursor: "default",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  el.style.boxShadow = "0 4px 16px rgba(37,99,235,0.08)";
                  el.style.transform = "translateY(-2px)";
                  el.style.borderColor = "#BFDBFE";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                  el.style.transform = "translateY(0)";
                  el.style.borderColor = "#E2E8F0";
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    background: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "1.1rem",
                  }}
                >
                  {f.icon}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.65rem", flexWrap: "wrap" }}>
                  <h3
                    style={{
                      fontFamily: "var(--font-lexend, system-ui, sans-serif)",
                      fontSize: "1.3rem",
                      fontWeight: 600,
                      color: "#0F172A",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {f.title}
                  </h3>
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: f.tagColor,
                      background: f.tagBg,
                      border: `1px solid ${f.tagColor}33`,
                      padding: "0.1rem 0.45rem",
                      borderRadius: "100px",
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.tag}
                  </span>
                </div>
                <p style={{ fontSize: "1.1rem", color: "#64748B", lineHeight: 1.72 }}>{f.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: "2.5rem" }}>
            <Link
              href="/features"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#2563EB",
                textDecoration: "none",
                padding: "0.6rem 1.25rem",
                border: "1px solid #BFDBFE",
                borderRadius: "8px",
                background: "#EFF6FF",
                transition: "background 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = "#DBEAFE";
                el.style.borderColor = "#93C5FD";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = "#EFF6FF";
                el.style.borderColor = "#BFDBFE";
              }}
            >
              See all features
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section style={{ padding: "6rem 2rem", background: "#FFFFFF" }}>
        <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#2563EB",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: "0.75rem",
              }}
            >
              What practices are saying
            </div>
            <h2
              style={{
                fontFamily: "var(--font-lexend, system-ui, sans-serif)",
                fontSize: "clamp(1.7rem, 2.8vw, 2.4rem)",
                fontWeight: 700,
                letterSpacing: "-0.025em",
                color: "#0F172A",
              }}
            >
              The love is real
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                style={{
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: "12px",
                  padding: "1.75rem",
                }}
              >
                {/* Stars */}
                <div style={{ display: "flex", gap: "3px", marginBottom: "1.1rem" }}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <svg key={j} width="14" height="14" viewBox="0 0 14 14" fill="#F59E0B">
                      <path d="M7 1l1.75 3.55L13 5.24l-3 2.92.71 4.14L7 10.27l-3.71 2.03.71-4.14L1 5.24l4.25-.69L7 1z" />
                    </svg>
                  ))}
                </div>
                <p
                  style={{
                    fontSize: "1.1rem",
                    color: "#334155",
                    lineHeight: 1.75,
                    fontStyle: "italic",
                    marginBottom: "1.25rem",
                  }}
                >
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 600, color: "#0F172A" }}>{t.name}</div>
                  <div style={{ fontSize: "0.95rem", color: "#64748B", marginTop: "0.2rem" }}>
                    {t.role} · {t.practice}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section style={{ padding: "5rem 2rem" }}>
        <div
          style={{
            maxWidth: "1160px",
            margin: "0 auto",
            background: "#2563EB",
            borderRadius: "16px",
            padding: "4rem 3rem",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-60px",
              right: "-60px",
              width: "280px",
              height: "280px",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.05)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "-40px",
              left: "-40px",
              width: "200px",
              height: "200px",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.04)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2
              style={{
                fontFamily: "var(--font-lexend, system-ui, sans-serif)",
                fontSize: "clamp(1.8rem, 3vw, 2.6rem)",
                fontWeight: 700,
                color: "#FFFFFF",
                letterSpacing: "-0.025em",
                marginBottom: "1rem",
              }}
            >
              Ready to see it in action?
            </h2>
            <p style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.75)", marginBottom: "2.25rem", maxWidth: "420px", margin: "0 auto 2.25rem", lineHeight: 1.75 }}>
              Book a 20-minute live demo. See the AI Scribe generate a SOAP note, the superbill auto-populate, and the claim PDF generate — in one encounter.
            </p>
            <a
              href="mailto:hello@clarityos.com?subject=Demo Request"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "#F97316",
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: "0.95rem",
                padding: "0.82rem 2rem",
                borderRadius: "8px",
                textDecoration: "none",
                transition: "background 0.15s, transform 0.15s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = "#EA6C00";
                el.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = "#F97316";
                el.style.transform = "translateY(0)";
              }}
            >
              Schedule a Demo
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </div>
      </section>

    </div>
  );
}
