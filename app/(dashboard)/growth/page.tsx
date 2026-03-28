"use client";

import { useState } from "react";

// ─── Clarity EHR — Growth Monitor Dashboard ──────────────────────────────────
// Drop-in locations:
//   App Router  →  app/(dashboard)/growth/page.tsx
//   Pages Router → pages/dashboard/growth.tsx
//
// Env vars needed (add to .env.local + Vercel):
//   NEXT_PUBLIC_ANTHROPIC_KEY  — Claude API key for draft generation
//   (Facebook Graph API keys — add when ready to go live)
//
// Currently uses mock data. Wire up real Facebook Graph API + Claude API
// calls by replacing the TODO sections below.
// ─────────────────────────────────────────────────────────────────────────────

interface Alert {
  id: number;
  platform: string;
  group: string;
  keyword: string;
  author: string;
  time: string;
  text: string;
  status: "new" | "drafted" | "sent";
}

const MOCK_ALERTS: Alert[] = [
  {
    id: 1, platform: "Facebook", group: "Optometry Professionals Network",
    keyword: "EHR software", author: "Dr. Priya Nair", time: "12m ago", status: "new",
    text: "Does anyone have recommendations for a good EHR software? We're a 2-doc practice and our current system is painfully slow. Tired of clicking through 10 screens just to write a note.",
  },
  {
    id: 2, platform: "Facebook", group: "Independent ODs — Business Talk",
    keyword: "billing for optometrists", author: "Mark Delgado OD", time: "38m ago", status: "new",
    text: "Our billing is a nightmare. Denied claims are piling up and our front desk spends hours on the phone with insurance. Any software that actually helps with this?",
  },
  {
    id: 3, platform: "Facebook", group: "Eye Care Practice Owners",
    keyword: "patient scheduling", author: "Sandra Wu", time: "1h ago", status: "drafted",
    text: "Looking for a scheduling solution that integrates with our EHR. Currently using two separate systems and it's creating double-entry issues.",
  },
  {
    id: 4, platform: "Facebook", group: "Optometry Professionals Network",
    keyword: "EHR recommendations", author: "James Ortega", time: "2h ago", status: "drafted",
    text: "Switching EHRs feels overwhelming. How do practices handle the transition without losing productivity?",
  },
  {
    id: 5, platform: "Facebook", group: "OD Entrepreneurs",
    keyword: "practice management software", author: "Lisa Fontaine OD", time: "3h ago", status: "sent",
    text: "Anyone using AI tools in their practice management? Curious what's actually useful vs just hype.",
  },
];

const KEYWORDS = [
  { label: "EHR software", count: 18 },
  { label: "optometry practice management", count: 12 },
  { label: "eye care software", count: 7 },
  { label: "billing for optometrists", count: 5 },
  { label: "patient scheduling", count: 3 },
  { label: "EHR recommendations", count: 2 },
];

const NAV = [
  { icon: "◉", label: "Alerts", badge: 7, section: "monitor" },
  { icon: "◎", label: "Keywords", section: "monitor" },
  { icon: "◑", label: "Groups", section: "monitor" },
  { icon: "⊡", label: "Sent Replies", section: "manage" },
  { icon: "◈", label: "Templates", section: "manage" },
  { icon: "⊕", label: "Analytics", section: "manage" },
  { icon: "◇", label: "Platforms", section: "settings" },
  { icon: "◻", label: "Account", section: "settings" },
];

const STATS = [
  { val: "47", label: "Alerts This Week", delta: "↑ 12 from last week", deltaColor: "#1a6b3a" },
  { val: "23", label: "Drafts Sent", delta: "↑ 8 from last week", deltaColor: "#1a6b3a" },
  { val: "4", label: "Groups Monitored", delta: "Facebook only", deltaColor: "#6b6760" },
  { val: "6", label: "Active Keywords", delta: "+ 2 pending", deltaColor: "#6b6760" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadgeStyle(status: Alert["status"]) {
  if (status === "new") return { background: "#e6f0fa", color: "#1a4f8a" };
  if (status === "drafted") return { background: "#fef3e2", color: "#8a5c0a" };
  return { background: "#e8f5ee", color: "#1a6b3a" };
}

function filterLabel(filter: string) {
  return filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1);
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function GrowthMonitor() {
  const [activeNav, setActiveNav] = useState("Alerts");
  const [filter, setFilter] = useState<"all" | "new" | "drafted" | "sent">("all");
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [alertStatuses, setAlertStatuses] = useState<Record<number, Alert["status"]>>({});
  const [generating, setGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const alerts = MOCK_ALERTS.map((a) => ({
    ...a,
    status: alertStatuses[a.id] ?? a.status,
  }));

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.status === filter);
  const selected = alerts.find((a) => a.id === selectedId) ?? null;
  const currentDraft = selectedId != null ? drafts[selectedId] ?? "" : "";

  // ── Generate draft via Claude API ─────────────────────────────────────────
  async function generateDraft(alert: Alert) {
    setGenerating(true);
    try {
      // TODO: move this to an API route (/api/generate-reply) to keep the key server-side
      const res = await fetch("/api/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postText: alert.text,
          keyword: alert.keyword,
          group: alert.group,
          author: alert.author,
        }),
      });
      const data = await res.json();
      setDrafts((prev) => ({ ...prev, [alert.id]: data.reply ?? "" }));
    } catch {
      setDrafts((prev) => ({
        ...prev,
        [alert.id]:
          `Hi ${alert.author.split(" ")[0]}! Based on your question about ${alert.keyword}, you might want to check out Clarity EHR — it was built specifically for optometry practices and addresses exactly what you're describing.\n\nHappy to share more details. You can also book a quick demo at clarityehr.com.`,
      }));
    } finally {
      setGenerating(false);
    }
  }

  function handleSelect(id: number) {
    setSelectedId(id);
    const alert = alerts.find((a) => a.id === id);
    if (alert && !drafts[id]) generateDraft(alert);
  }

  function markSent(id: number) {
    setAlertStatuses((prev) => ({ ...prev, [id]: "sent" }));
  }

  function copyDraft() {
    navigator.clipboard.writeText(currentDraft).catch(() => {});
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif", background: "#faf9f7", color: "#0f0e0c" }}>

      {/* ── SIDEBAR ── */}
      <aside style={{ width: "220px", flexShrink: 0, background: "#0f0e0c", display: "flex", flexDirection: "column", padding: "1.5rem 0", minHeight: "100vh" }}>
        <div style={{ padding: "0 1.25rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: "1.1rem", fontWeight: 400, color: "#fff", letterSpacing: "0.02em" }}>
          Clarity<span style={{ color: "#b8976a" }}>.</span>{" "}
          <span style={{ fontSize: "0.58rem", color: "rgba(196,191,184,0.35)", letterSpacing: "0.1em" }}>GROWTH</span>
        </div>

        {(["monitor", "manage", "settings"] as const).map((section) => (
          <div key={section}>
            <div style={{ fontSize: "0.58rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(196,191,184,0.35)", padding: "1.25rem 1.25rem 0.5rem" }}>
              {section}
            </div>
            {NAV.filter((n) => n.section === section).map((n) => (
              <div
                key={n.label}
                onClick={() => setActiveNav(n.label)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  padding: "0.6rem 1.25rem", fontSize: "0.78rem", cursor: "pointer",
                  color: activeNav === n.label ? "#fff" : "rgba(196,191,184,0.55)",
                  background: activeNav === n.label ? "rgba(255,255,255,0.06)" : "transparent",
                  borderLeft: `2px solid ${activeNav === n.label ? "#b8976a" : "transparent"}`,
                  transition: "all 0.12s",
                }}
              >
                <span style={{ width: "14px", textAlign: "center", fontSize: "0.72rem", opacity: 0.7 }}>{n.icon}</span>
                {n.label}
                {n.badge && (
                  <span style={{ marginLeft: "auto", background: "#b8976a", color: "#0f0e0c", fontSize: "0.58rem", fontWeight: 500, padding: "1px 5px", borderRadius: "2px" }}>
                    {n.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}

        <div style={{ marginTop: "auto", padding: "1.25rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: "0.62rem", color: "rgba(196,191,184,0.4)" }}>Connected to</div>
          <div style={{ fontSize: "0.7rem", color: "rgba(196,191,184,0.55)", marginTop: "4px" }}>Facebook Groups API</div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "6px" }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#2ecc71" }} />
            <span style={{ fontSize: "0.62rem", color: "rgba(196,191,184,0.4)" }}>Live · 4 groups monitored</span>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* TOPBAR */}
        <div style={{ background: "#fff", borderBottom: "1px solid rgba(196,191,184,0.4)", padding: "0.9rem 1.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>Keyword Alerts</div>
            <div style={{ fontSize: "0.7rem", color: "#6b6760", marginTop: "1px" }}>Draft and review AI-suggested replies for Facebook group posts</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.68rem", color: "#1a6b3a", background: "#e8f5ee", padding: "0.3rem 0.7rem", borderRadius: "3px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2ecc71", animation: "none" }} />
              Monitoring Live
            </div>
            <button style={btnStyle}>Export CSV</button>
            <button style={{ ...btnStyle, background: "#0f0e0c", color: "#faf9f7", border: "1px solid #0f0e0c" }}>+ Add Keyword</button>
          </div>
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, padding: "1.5rem 1.75rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* STATS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
            {STATS.map((s) => (
              <div key={s.label} style={{ background: "#fff", border: "1px solid rgba(196,191,184,0.4)", borderRadius: "6px", padding: "1rem 1.1rem" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 300, lineHeight: 1, marginBottom: "0.3rem" }}>{s.val}</div>
                <div style={{ fontSize: "0.66rem", color: "#6b6760", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</div>
                <div style={{ fontSize: "0.66rem", color: s.deltaColor, marginTop: "0.3rem" }}>{s.delta}</div>
              </div>
            ))}
          </div>

          {/* KEYWORDS */}
          <div>
            <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b6760", marginBottom: "0.75rem" }}>Active Keywords</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              {KEYWORDS.map((k) => (
                <div key={k.label} style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "#fff", border: "1px solid rgba(196,191,184,0.4)", borderRadius: "3px", padding: "0.3rem 0.65rem", fontSize: "0.73rem", cursor: "pointer" }}>
                  <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#b8976a" }} />
                  {k.label}
                  <span style={{ fontSize: "0.62rem", color: "#6b6760", background: "#f3f0eb", padding: "0 4px", borderRadius: "2px" }}>{k.count}</span>
                </div>
              ))}
              <button style={{ background: "transparent", border: "1px dashed rgba(196,191,184,0.6)", borderRadius: "3px", padding: "0.3rem 0.65rem", fontSize: "0.73rem", color: "#c4bfb8", cursor: "pointer", fontFamily: "inherit" }}>
                + Add keyword
              </button>
            </div>
          </div>

          {/* SPLIT PANEL */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "1rem" }}>

            {/* ALERTS */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>
                <div style={{ fontSize: "0.78rem", fontWeight: 500 }}>Recent Alerts</div>
                <div style={{ fontSize: "0.66rem", color: "#6b6760" }}>{alerts.filter(a => a.status === "new").length} unreviewed</div>
              </div>

              {/* filter tabs */}
              <div style={{ display: "flex", gap: "0.5rem", padding: "0.6rem 1.1rem", borderBottom: "1px solid rgba(196,191,184,0.4)" }}>
                {(["all", "new", "drafted", "sent"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "0.25rem 0.6rem", fontSize: "0.66rem", borderRadius: "3px", cursor: "pointer",
                      fontFamily: "inherit", border: "1px solid transparent", transition: "all 0.12s",
                      background: filter === f ? "#f3f0eb" : "transparent",
                      borderColor: filter === f ? "rgba(196,191,184,0.4)" : "transparent",
                      color: filter === f ? "#0f0e0c" : "#6b6760",
                    }}
                  >
                    {filterLabel(f)}
                  </button>
                ))}
              </div>

              <div style={{ overflowY: "auto", maxHeight: "380px" }}>
                {filtered.length === 0 && (
                  <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#c4bfb8", fontSize: "0.8rem" }}>No alerts in this filter.</div>
                )}
                {filtered.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => handleSelect(a.id)}
                    style={{
                      padding: "0.85rem 1.1rem", borderBottom: "1px solid rgba(196,191,184,0.3)", cursor: "pointer",
                      background: selectedId === a.id ? "#fdf7ef" : "transparent",
                      borderLeft: selectedId === a.id ? "2px solid #b8976a" : "2px solid transparent",
                      transition: "background 0.12s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                      <span style={{ fontSize: "0.58rem", padding: "0.15rem 0.45rem", borderRadius: "2px", background: "#e6f0fa", color: "#1a4f8a", fontWeight: 500 }}>{a.platform}</span>
                      <span style={{ fontSize: "0.58rem", padding: "0.15rem 0.45rem", borderRadius: "2px", background: "#fef3e2", color: "#8a5c0a" }}>{a.keyword}</span>
                      <span style={{ fontSize: "0.6rem", color: "#c4bfb8", marginLeft: "auto" }}>{a.time}</span>
                    </div>
                    <div style={{ fontSize: "0.7rem", fontWeight: 500, marginBottom: "0.2rem" }}>{a.group}</div>
                    <div style={{ fontSize: "0.7rem", color: "#6b6760", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.text}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.35rem" }}>
                      <span style={{ fontSize: "0.62rem", color: "#c4bfb8" }}>{a.author}</span>
                      <span style={{ fontSize: "0.6rem", padding: "0.12rem 0.45rem", borderRadius: "2px", ...statusBadgeStyle(a.status) }}>{a.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* DRAFT PANEL */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>
                <div style={{ fontSize: "0.78rem", fontWeight: 500 }}>AI Draft Reply</div>
                <span style={{ fontSize: "0.6rem", background: "#f3f0eb", border: "1px solid rgba(196,191,184,0.4)", color: "#6b6760", padding: "0.15rem 0.5rem", borderRadius: "2px" }}>Claude-powered</span>
              </div>

              <div style={{ flex: 1, padding: "1.1rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {!selected ? (
                  <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "#c4bfb8", fontSize: "0.8rem" }}>Select an alert on the left to generate a reply draft.</div>
                ) : (
                  <>
                    {/* original post */}
                    <div style={{ background: "#f3f0eb", borderRadius: "6px", padding: "0.9rem", borderLeft: "3px solid rgba(196,191,184,0.4)" }}>
                      <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#c4bfb8", marginBottom: "0.4rem" }}>Original Post · {selected.group}</div>
                      <div style={{ fontSize: "0.78rem", color: "#6b6760", lineHeight: 1.55 }}>{selected.text}</div>
                      <div style={{ fontSize: "0.62rem", color: "#c4bfb8", marginTop: "0.4rem" }}>{selected.author} · {selected.time}</div>
                    </div>

                    {/* divider */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b6760" }}>
                      AI Draft
                      <div style={{ flex: 1, height: "1px", background: "rgba(196,191,184,0.4)" }} />
                    </div>

                    {/* textarea */}
                    {generating ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "120px", color: "#b8976a", fontSize: "0.8rem" }}>
                        Generating draft…
                      </div>
                    ) : (
                      <textarea
                        value={currentDraft}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [selected.id]: e.target.value }))}
                        style={{ width: "100%", minHeight: "140px", resize: "vertical", border: "1px solid rgba(196,191,184,0.4)", borderRadius: "4px", padding: "0.75rem 0.9rem", fontFamily: "'DM Sans', sans-serif", fontSize: "0.78rem", lineHeight: 1.65, color: "#0f0e0c", background: "#fff", outline: "none" }}
                      />
                    )}

                    {/* actions */}
                    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => generateDraft(selected)}
                        disabled={generating}
                        style={{ padding: "0.45rem 0.85rem", fontSize: "0.7rem", border: "1px dashed rgba(196,191,184,0.6)", borderRadius: "3px", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "#6b6760", display: "flex", alignItems: "center", gap: "0.35rem" }}
                      >
                        ↺ Regenerate
                      </button>
                      <button onClick={copyDraft} style={btnStyle}>
                        {copySuccess ? "✓ Copied!" : "Copy Draft"}
                      </button>
                      <button
                        onClick={() => markSent(selected.id)}
                        disabled={selected.status === "sent"}
                        style={{ ...btnStyle, background: selected.status === "sent" ? "#1a6b3a" : "#0f0e0c", color: "#fff", border: `1px solid ${selected.status === "sent" ? "#1a6b3a" : "#0f0e0c"}` }}
                      >
                        {selected.status === "sent" ? "Sent ✓" : "Mark as Sent ✓"}
                      </button>
                      <span style={{ fontSize: "0.62rem", color: "#c4bfb8", marginLeft: "auto" }}>You post manually in Facebook</span>
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid rgba(196,191,184,0.4)",
  borderRadius: "6px",
  display: "flex",
  flexDirection: "column",
};

const panelHeaderStyle: React.CSSProperties = {
  padding: "0.9rem 1.1rem",
  borderBottom: "1px solid rgba(196,191,184,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
};

const btnStyle: React.CSSProperties = {
  padding: "0.45rem 0.9rem",
  fontSize: "0.7rem",
  fontWeight: 400,
  border: "1px solid rgba(196,191,184,0.4)",
  borderRadius: "3px",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
  color: "#6b6760",
};
