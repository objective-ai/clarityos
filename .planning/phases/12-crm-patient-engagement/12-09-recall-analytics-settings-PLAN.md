---
phase: 12
plan: 09
slug: recall-analytics-settings
type: execute
wave: 5
depends_on: [12-05, 12-07]
files_modified:
  - app/(tenant)/[tenant]/messaging/recall-queue/page.tsx
  - app/(tenant)/[tenant]/messaging/analytics/page.tsx
  - app/(tenant)/[tenant]/settings/messaging/page.tsx
  - components/messaging/TemplatesEditor.tsx
  - components/Sidebar.tsx
  - lib/api/messaging.ts
  - app/api/messaging/templates/[id]/route.ts
  - backend/api/routes/messaging.py
autonomous: true
gap_closure: false
requirements: [CRM-03, CRM-09, CRM-15]

must_haves:
  truths:
    - "/messaging/recall-queue page lists candidates from /api/messaging/recall-queue with filter bar + bulk action toolbar"
    - "Recall queue mandatory preview-confirm Dialog shows recipient count + estimated cost + opt-out exclusions before sending"
    - "/messaging/analytics page shows reminder funnel + recall conversion + opt-out trend + cost & volume — all 4 charts inline (Phase 8 SSR pattern)"
    - "Date range picker (7d/30d/90d/YTD/custom) drives all 4 charts"
    - "/settings/messaging page has Templates and Preferences tabs; Preferences includes daily cost cap slider + CostCapBar visualization"
    - "TemplatesEditor calls messagingApi.updateTemplate(id, body) — added to lib/api/messaging.ts in this plan since Plan 12-08 didn't ship it"
    - "PATCH /api/messaging/templates/[id] BFF route exists in this plan, proxying via proxyToFastAPI to backend's per-template PATCH"
    - "Sidebar navigation includes 'Messaging' section with Inbox + Recall Queue + Analytics + Settings sublinks (gated by useEntitlements().has('messaging'))"
  artifacts:
    - path: "app/(tenant)/[tenant]/messaging/recall-queue/page.tsx"
      provides: "Staff-approved recall candidate review + Send All flow"
    - path: "app/(tenant)/[tenant]/messaging/analytics/page.tsx"
      provides: "4-chart inline Recharts dashboard mirroring Phase 8 pattern"
    - path: "app/(tenant)/[tenant]/settings/messaging/page.tsx"
      provides: "Templates + Preferences tabs"
    - path: "components/messaging/TemplatesEditor.tsx"
      provides: "Per-kind+language template body editor"
    - path: "lib/api/messaging.ts"
      provides: "Extended with updateTemplate(id, body) helper"
      exports: ["messagingApi.updateTemplate"]
    - path: "app/api/messaging/templates/[id]/route.ts"
      provides: "BFF proxy for PATCH /api/messaging/templates/{id}"
  key_links:
    - from: "app/(tenant)/[tenant]/messaging/recall-queue/page.tsx"
      to: "store/recallQueueStore.ts"
      via: "useRecallQueueStore for selection state"
      pattern: "useRecallQueueStore"
    - from: "app/(tenant)/[tenant]/messaging/analytics/page.tsx"
      to: "lib/api/messaging.ts"
      via: "messagingApi.getAnalytics(rangeDays)"
      pattern: "messagingApi.getAnalytics"
    - from: "components/messaging/TemplatesEditor.tsx"
      to: "lib/api/messaging.ts"
      via: "messagingApi.updateTemplate(id, body)"
      pattern: "messagingApi.updateTemplate"
    - from: "app/api/messaging/templates/[id]/route.ts"
      to: "backend/api/routes/messaging.py"
      via: "proxyToFastAPI('/api/messaging/templates/{id}/')"
      pattern: "proxyToFastAPI.*templates"
---

<objective>
Build the 3 standalone messaging pages — Recall Queue, Analytics, Settings — and wire them into the Sidebar navigation. Recharts charts on the analytics page MUST be defined inline (Phase 8 SSR-safety memory note).

Also: explicitly extend `lib/api/messaging.ts` with `updateTemplate(id, body)` and ship a per-template BFF PATCH route at `app/api/messaging/templates/[id]/route.ts`. These were originally noted as "add if missing" in this plan's Task 3 but never declared in `files_modified` — now they are first-class outputs (per checker Warning 6 fix). Plan 12-05 may also need a corresponding backend route; we extend `backend/api/routes/messaging.py` if not already present.

Output:
- 3 new page routes under `app/(tenant)/[tenant]/messaging/` and `app/(tenant)/[tenant]/settings/messaging/`
- 1 new component (TemplatesEditor)
- Sidebar navigation update with messaging entitlement gate
- `lib/api/messaging.ts` updateTemplate addition
- `app/api/messaging/templates/[id]/route.ts` BFF PATCH proxy
- `backend/api/routes/messaging.py` PATCH `/templates/{id}` if not present from Plan 12-05
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-UI-SPEC.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@.planning/phases/12-crm-patient-engagement/12-05-SUMMARY.md
@.planning/phases/12-crm-patient-engagement/12-07-SUMMARY.md
@./CLAUDE.md
@.claude/rules/bff-api.md
@app/(tenant)/[tenant]/analytics/page.tsx
@components/Sidebar.tsx
@lib/bff.ts
@backend/api/routes/messaging.py

<interfaces>
From Plan 12-07:
- components/messaging/RecallQueueRow (props: candidate, isSelected, onSelectChange, onSendOne, onRemove)
- components/messaging/CostCapBar (spentCents, capCents)
- store/recallQueueStore (useRecallQueueStore)

From Plan 12-08:
- lib/api/messaging.ts — all 9+ messagingApi.* functions (this plan ADDS updateTemplate)

From Plan 12-01:
- types/messaging.ts — RecallCandidate, MessagingSettings, MessageTemplate, etc.

From Plan 12-05:
- backend/api/routes/messaging.py — has GET /templates and POST /templates. Verify whether PATCH /templates/{id} exists; if not, add it in this plan's Task 3.

From Phase 8 (analytics/page.tsx):
- Recharts inline pattern (no extracted chart components — SSR-safety memory note)
- Date range picker pattern (7d/30d/90d/6m chips)
- Single-aggregate-endpoint fetch pattern

From components/Sidebar.tsx:
- existing nav structure with `useEntitlements().has(...)` gating
- nav-item.active accent left-border pattern (UI-SPEC line 98)

From lib/bff.ts:
- proxyToFastAPI(req, "/api/messaging/...") — trailing slash on upstream URL required
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Recall Queue page + Sidebar messaging section</name>
  <files>
    app/(tenant)/[tenant]/messaging/recall-queue/page.tsx,
    components/Sidebar.tsx
  </files>
  <read_first>
    - components/messaging/RecallQueueRow.tsx (Plan 12-07)
    - store/recallQueueStore.ts (Plan 12-07)
    - lib/api/messaging.ts (Plan 12-08)
    - components/Sidebar.tsx (full file — find existing nav with entitlement gates)
    - lib/entitlements.ts (Plan 12-01 added MESSAGING)
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (lines 142-150 — recall queue layout; lines 207-216 — Recall Queue Actions)
  </read_first>
  <action>
**Step 1.** Create `app/(tenant)/[tenant]/messaging/recall-queue/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RecallQueueRow } from "@/components/messaging/RecallQueueRow";
import { useRecallQueueStore } from "@/store/recallQueueStore";
import { messagingApi } from "@/lib/api/messaging";
import type { MessageTemplate } from "@/types/messaging";

export default function RecallQueuePage() {
  const {
    candidates, selectedIds, isLoading, isSending, lastError,
    setCandidates, toggleSelect, selectAll, clearSelection, setLoading, setSending, setError,
  } = useRecallQueueStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channel, setChannel] = useState<"sms" | "email">("sms");

  useEffect(() => {
    setLoading(true);
    Promise.all([messagingApi.getRecallQueue(), messagingApi.getTemplates()])
      .then(([r, t]) => {
        setCandidates(r.candidates);
        setTemplates(t.filter((x) => x.kind === "recall_m12" || x.kind === "recall_m14"));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [setCandidates, setLoading, setError]);

  const selected = candidates.filter((c) => selectedIds.has(c.patientId));
  const excludedCount = candidates.filter((c) => !c.hasMarketingConsentSms && !c.hasMarketingConsentEmail).length;

  async function handleSendAll() {
    setSending(true);
    setShowConfirm(false);
    try {
      const template = templates.find((t) => t.kind === "recall_m12" && t.channel === channel);
      if (!template) { setError("No recall template found for chosen channel"); return; }
      await messagingApi.sendRecallBatch({
        candidate_patient_ids: [...selectedIds],
        template_id: template.id,
        channel,
      });
      const r = await messagingApi.getRecallQueue();
      setCandidates(r.candidates);
      clearSelection();
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  if (isLoading) return <div className="p-6">Loading recall queue…</div>;

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-heading">Recall Queue</h1>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={clearSelection}>Clear ({selectedIds.size})</Button>
            <Button onClick={() => setShowConfirm(true)} disabled={isSending}>
              Send All Recalls ({selectedIds.size})
            </Button>
          </div>
        )}
      </header>

      {lastError && (
        <div role="alert" className="text-[var(--state-critical)] text-body">{lastError}</div>
      )}

      {candidates.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <p className="text-subhead mb-2">No patients due for recall</p>
            <p className="text-body text-[var(--text-secondary)]">
              Patients with no visit in the last 12 months and no upcoming appointment will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <CardContent className="p-0">
            {excludedCount > 0 && (
              <div className="p-3 text-caption text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                {excludedCount} excluded — opted out of marketing or no valid contact
              </div>
            )}
            <div className="flex items-center gap-2 p-3 border-b border-[var(--glass-border)]">
              <Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button>
              <span className="text-caption text-[var(--text-muted)]">·</span>
              <span className="text-caption">Channel:</span>
              <button
                onClick={() => setChannel("sms")}
                aria-pressed={channel === "sms"}
                className={`px-2 py-1 text-caption rounded ${channel === "sms" ? "bg-[var(--accent)] text-[var(--bg-base)]" : ""}`}
              >SMS</button>
              <button
                onClick={() => setChannel("email")}
                aria-pressed={channel === "email"}
                className={`px-2 py-1 text-caption rounded ${channel === "email" ? "bg-[var(--accent)] text-[var(--bg-base)]" : ""}`}
              >Email</button>
            </div>
            <table className="w-full">
              <caption className="sr-only">Recall candidates</caption>
              <thead>
                <tr className="text-caption uppercase tracking-widest text-[var(--text-muted)]">
                  <th></th><th>Patient</th><th>Last visit</th><th>Channels</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <RecallQueueRow
                    key={c.patientId}
                    candidate={c}
                    isSelected={selectedIds.has(c.patientId)}
                    onSelectChange={() => toggleSelect(c.patientId)}
                    onSendOne={() => { /* defer to Plan 12-10 enhancement; for v1, single-row send via setShowConfirm with single id */ }}
                    onRemove={() => { /* removes from local view; the candidate stays in DB */ toggleSelect(c.patientId); }}
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send recall messages to {selectedIds.size} patients?</DialogTitle>
          </DialogHeader>
          <p className="text-body">
            This will send {channel === "sms" ? "SMS" : "email"} recall messages to {selectedIds.size} patients.
            Patients without marketing consent will be skipped automatically.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleSendAll} disabled={isSending}>
              {isSending ? "Sending…" : "Send All Recalls"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

**Step 2.** Edit `components/Sidebar.tsx`:
- Find the existing nav structure
- Add a "Messaging" group/section gated by `useEntitlements().has('messaging')`. Sub-items:
  - Inbox → `/${tenant}/messaging/inbox`
  - Recall Queue → `/${tenant}/messaging/recall-queue`
  - Analytics → `/${tenant}/messaging/analytics`
  - Settings → `/${tenant}/settings/messaging`
- Use lucide icons: Inbox, Users (recall), BarChart3 (analytics), Settings
- Each link: when active, accent left-border (use existing nav-item.active pattern)
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export default function RecallQueuePage" "app/(tenant)/[tenant]/messaging/recall-queue/page.tsx"` returns 1
    - `grep -c "useRecallQueueStore" "app/(tenant)/[tenant]/messaging/recall-queue/page.tsx"` returns at least 1
    - `grep -c "messagingApi.getRecallQueue\\|messagingApi.sendRecallBatch" "app/(tenant)/[tenant]/messaging/recall-queue/page.tsx"` returns at least 2
    - `grep -c "Send All Recalls\\|No patients due for recall\\|Patients with no visit in the last 12 months" "app/(tenant)/[tenant]/messaging/recall-queue/page.tsx"` returns at least 3 (UI-SPEC copy verbatim)
    - `grep -c "Send recall messages to" "app/(tenant)/[tenant]/messaging/recall-queue/page.tsx"` returns at least 1 (Dialog confirm copy)
    - `grep -c "messaging" components/Sidebar.tsx` returns at least 4 (4 sub-items)
    - `grep -c "useEntitlements\\|Entitlement.MESSAGING\\|has(.messaging" components/Sidebar.tsx` returns at least 1
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Recall queue page operational with selection + Send All + confirm dialog. Sidebar messaging section gated by entitlement.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Messaging Analytics page (Recharts inline, mirrors Phase 8)</name>
  <files>
    app/(tenant)/[tenant]/messaging/analytics/page.tsx
  </files>
  <read_first>
    - app/(tenant)/[tenant]/analytics/page.tsx (full file — Phase 8 single-aggregate-endpoint + inline Recharts pattern; MUST mirror exactly per memory note: "do NOT move to separate component files for SSR safety")
    - lib/api/messaging.ts (messagingApi.getAnalytics)
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (lines 152-160 — Analytics page layout contract)
    - types/messaging.ts (no analytics-specific type yet — define inline or extend types/messaging.ts here)
  </read_first>
  <action>
Create `app/(tenant)/[tenant]/messaging/analytics/page.tsx`. **Mirror analytics/page.tsx pattern EXACTLY** — single fetch, inline Recharts components, Date range chips:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { messagingApi } from "@/lib/api/messaging";

const RANGES = [
  { id: 7, label: "7d" },
  { id: 30, label: "30d" },
  { id: 90, label: "90d" },
  { id: 365, label: "YTD" },
] as const;

interface AnalyticsResponse {
  kpis: { sentTotal: number; failedTotal: number; optoutsTotal: number; costTotalCents: number };
  reminderFunnel: Array<{ status: string; count: number }>;
  recallConversion: { sent: number; booked: number };
  optoutTrend: Array<{ week: string; count: number }>;
  costVolume: Array<{ day: string; channel: string; count: number; costCents: number }>;
}

export default function MessagingAnalyticsPage() {
  const [range, setRange] = useState<number>(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    messagingApi.getAnalytics(range)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [range]);

  function exportCsv(label: string, rows: any[]) {
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `messaging-${label}-${range}d.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !data) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-heading">Messaging Analytics</h1>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`px-3 py-1 text-caption rounded ${range === r.id ? "bg-[var(--accent)] text-[var(--bg-base)]" : ""}`}
            >{r.label}</button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">Sent</p>
          <p className="text-heading">{data.kpis.sentTotal}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">Failed</p>
          <p className="text-heading text-[var(--state-critical)]">{data.kpis.failedTotal}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">Opt-outs</p>
          <p className="text-heading">{data.kpis.optoutsTotal}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">Cost</p>
          <p className="text-heading">${(data.kpis.costTotalCents / 100).toFixed(2)}</p>
        </CardContent></Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-subhead">Reminder Funnel</h2>
          <Button variant="ghost" size="sm" onClick={() => exportCsv("funnel", data.reminderFunnel)}>
            <Download className="w-4 h-4 mr-1" aria-hidden /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.reminderFunnel}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="status" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip contentStyle={{ background: "var(--bg-overlay)", border: "1px solid var(--glass-border)" }} />
              <Bar dataKey="count" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><h2 className="text-subhead">Recall Conversion</h2></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div><p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">Sent</p><p className="text-heading">{data.recallConversion.sent}</p></div>
            <div><p className="text-caption uppercase tracking-widest text-[var(--text-muted)]">Booked within 90d</p><p className="text-heading text-[var(--state-normal)]">{data.recallConversion.booked}</p></div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-subhead">Opt-out Trend</h2>
          <Button variant="ghost" size="sm" onClick={() => exportCsv("optout", data.optoutTrend)}>
            <Download className="w-4 h-4 mr-1" aria-hidden /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.optoutTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="week" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip contentStyle={{ background: "var(--bg-overlay)", border: "1px solid var(--glass-border)" }} />
              <Area dataKey="count" stroke="var(--state-warning)" fill="var(--state-warning)" fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-subhead">Cost & Volume</h2>
          <Button variant="ghost" size="sm" onClick={() => exportCsv("cost", data.costVolume)}>
            <Download className="w-4 h-4 mr-1" aria-hidden /> Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.costVolume}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="day" stroke="var(--text-muted)" />
              <YAxis stroke="var(--text-muted)" />
              <Tooltip contentStyle={{ background: "var(--bg-overlay)", border: "1px solid var(--glass-border)" }} />
              <Legend />
              <Bar dataKey="count" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => alert("Compliance Report PDF generation lands in Plan 12-10")}>
          Download Compliance Report
        </Button>
      </div>
    </div>
  );
}
```

**Note on memory:** `analytics/page.tsx` charts MUST be inline (not extracted to separate component files) per the SSR-safety memory note. Do NOT factor out chart components.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export default function MessagingAnalyticsPage" "app/(tenant)/[tenant]/messaging/analytics/page.tsx"` returns 1
    - `grep -c "BarChart\\|LineChart\\|AreaChart\\|ResponsiveContainer" "app/(tenant)/[tenant]/messaging/analytics/page.tsx"` returns at least 4 (inline charts)
    - `grep -c "messagingApi.getAnalytics" "app/(tenant)/[tenant]/messaging/analytics/page.tsx"` returns at least 1
    - `grep -c "Reminder Funnel\\|Recall Conversion\\|Opt-out Trend\\|Cost & Volume" "app/(tenant)/[tenant]/messaging/analytics/page.tsx"` returns at least 4
    - `grep -c "Export CSV\\|Download Compliance Report\\|Messaging Analytics" "app/(tenant)/[tenant]/messaging/analytics/page.tsx"` returns at least 3 (UI-SPEC copy)
    - `grep -c "var(--accent)\\|var(--state-warning)\\|var(--state-critical)" "app/(tenant)/[tenant]/messaging/analytics/page.tsx"` returns at least 3 (CSS vars only)
    - The file does NOT import any chart from `@/components/messaging` (charts are inline): `grep -c "import.*Chart.*from \"@/components" "app/(tenant)/[tenant]/messaging/analytics/page.tsx"` returns 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Analytics page with 4 inline Recharts + 4 KPIs + date range + CSV exports. Mirrors Phase 8 SSR-safe pattern.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Settings/Messaging page (Templates + Preferences tabs) + TemplatesEditor + lib/api/messaging.ts updateTemplate + BFF /templates/[id] PATCH route + backend per-template PATCH if missing</name>
  <files>
    app/(tenant)/[tenant]/settings/messaging/page.tsx,
    components/messaging/TemplatesEditor.tsx,
    lib/api/messaging.ts,
    app/api/messaging/templates/[id]/route.ts,
    backend/api/routes/messaging.py
  </files>
  <read_first>
    - app/(tenant)/[tenant]/settings/page.tsx (existing settings page pattern; check if Tabs component is in use)
    - components/messaging/CostCapBar.tsx (Plan 12-07)
    - lib/api/messaging.ts (Plan 12-08 — full file; we APPEND updateTemplate)
    - lib/bff.ts (proxyToFastAPI helper — used by the new BFF route)
    - backend/api/routes/messaging.py (Plan 12-05 — verify whether `PATCH /templates/{id}` already exists; if not, add)
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (lines 168-175 — Settings tab layout)
    - lib/messaging/phi-scan.ts (Plan 12-07 — for client-side template body warn)
  </read_first>
  <action>
**Step 0 (NEW per checker Warning 6).** Extend `lib/api/messaging.ts`. After the existing `getTemplates` line in the `messagingApi` object literal, add:

```typescript
  updateTemplate: (id: string, body: Partial<MessageTemplate>) =>
    jsonFetch<MessageTemplate>(`/api/messaging/templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
```

Use Edit (not Write) to keep all other helpers from Plan 12-08 intact. Confirm: `messagingApi.updateTemplate` is callable from TS at compile time after this edit.

**Step 0a (NEW per checker Warning 6).** Create `app/api/messaging/templates/[id]/route.ts`:

```typescript
/**
 * BFF proxy for per-template PATCH (and DELETE if needed by the editor in v1).
 * Trailing slash on upstream URL is required (CLAUDE.md project rule + bff-api.md).
 */
import { NextRequest } from "next/server";
import { proxyToFastAPI } from "@/lib/bff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return proxyToFastAPI(request, `/api/messaging/templates/${params.id}/`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return proxyToFastAPI(request, `/api/messaging/templates/${params.id}/`);
}
```

**Step 0b (NEW per checker Warning 6).** In `backend/api/routes/messaging.py`, verify whether a per-template PATCH route exists. If `PATCH /templates/{template_id}` is NOT present, add it:

```python
@router.patch("/templates/{template_id}/")
async def update_template(
    template_id: UUID,
    payload: TemplateUpdate,                                                 # Pydantic model from Plan 12-05's schemas/messaging.py — extend if missing
    ctx: Annotated[TenantContext, Depends(get_tenant_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if ctx.role not in ("owner", "admin"):
        raise HTTPException(403, "OWNER or ADMIN role required to edit templates")
    from sqlalchemy import select
    from backend.db.models.tenant.messaging import MessageTemplate
    t = (await db.execute(
        select(MessageTemplate).where(
            MessageTemplate.id == template_id,
            MessageTemplate.tenant_id == ctx.tenant_id,
            MessageTemplate.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")

    update_dict = payload.model_dump(exclude_unset=True, by_alias=False)
    for k, v in update_dict.items():
        setattr(t, k, v)
    await log_action(db, ctx, AuditAction.MESSAGE_TEMPLATE_UPDATED,
                     resource_type="message_template", resource_id=t.id,
                     metadata={"fields_changed": list(update_dict.keys())})
    await db.flush()
    await db.refresh(t)
    return TemplateRead.model_validate(t, from_attributes=True)
```

If `TemplateUpdate` Pydantic model doesn't exist in `backend/schemas/messaging.py`, add it as a `MessageTemplateBase` partial (all fields Optional). If `AuditAction.MESSAGE_TEMPLATE_UPDATED` enum value is missing, add it in `backend/db/models/tenant/clinical.py` (Phase 9 added similar enum entries — follow that migration pattern).

**Step 1.** Create `components/messaging/TemplatesEditor.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { scanForPhi } from "@/lib/messaging";
import { messagingApi } from "@/lib/api/messaging";
import type { MessageTemplate } from "@/types/messaging";

interface Props { templates: MessageTemplate[]; onChange: (next: MessageTemplate[]) => void; }

export function TemplatesEditor({ templates, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [filterLang, setFilterLang] = useState<"en" | "es">("en");

  const filtered = templates.filter((t) => t.language === filterLang);

  async function handleSave(t: MessageTemplate) {
    const next = await messagingApi.updateTemplate(t.id, { body: draftBody });
    onChange(templates.map((x) => (x.id === t.id ? next : x)));
    setEditingId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["en", "es"] as const).map((l) => (
          <button
            key={l} onClick={() => setFilterLang(l)} aria-pressed={filterLang === l}
            className={`px-3 py-1 text-caption rounded ${filterLang === l ? "bg-[var(--accent)] text-[var(--bg-base)]" : ""}`}
          >{l.toUpperCase()}</button>
        ))}
      </div>
      {filtered.map((t) => {
        const isEditing = editingId === t.id;
        const body = isEditing ? draftBody : t.body;
        const phi = t.channel === "sms" && (t.kind.startsWith("reminder_")) ? scanForPhi(body) : null;
        return (
          <Card key={t.id} className="glass-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-subhead">{t.kind} — {t.channel.toUpperCase()}</h3>
                <Badge variant={t.isDefault ? "secondary" : "outline"}>
                  {t.isDefault ? "default" : "custom"}
                </Badge>
              </div>
              {isEditing ? (
                <textarea
                  className="glass-input w-full min-h-[100px]"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  aria-label={`${t.kind} body`}
                />
              ) : (
                <pre className="text-body whitespace-pre-wrap p-2 bg-[var(--bg-overlay)] rounded">{t.body}</pre>
              )}
              {phi?.hasPhi && (
                <p role="alert" className="text-caption text-[var(--state-warning)]">
                  Detected: {phi.matches.join(", ")} — operational SMS will be blocked at send time.
                </p>
              )}
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button size="sm" onClick={() => handleSave(t)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(t.id); setDraftBody(t.body); }}>
                    Edit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

**Step 2.** Create `app/(tenant)/[tenant]/settings/messaging/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CostCapBar } from "@/components/messaging/CostCapBar";
import { TemplatesEditor } from "@/components/messaging/TemplatesEditor";
import { messagingApi } from "@/lib/api/messaging";
import type { MessageTemplate, MessagingSettings } from "@/types/messaging";

export default function MessagingSettingsPage() {
  const [tab, setTab] = useState<"templates" | "preferences">("templates");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [capDraft, setCapDraft] = useState(2500);
  const [enabledDraft, setEnabledDraft] = useState(false);

  useEffect(() => {
    Promise.all([messagingApi.getTemplates(), messagingApi.getSettings()])
      .then(([t, s]) => {
        setTemplates(t);
        setSettings(s);
        setCapDraft(s.dailySmsCapCents ?? 2500);
        setEnabledDraft(s.messagingEnabled);
      });
  }, []);

  async function handleSaveSettings() {
    const next = await messagingApi.updateSettings({
      messagingEnabled: enabledDraft,
      dailySmsCapCents: capDraft,
    });
    setSettings(next);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-heading">Messaging Settings</h1>
      <div className="flex gap-2 border-b border-[var(--glass-border)]" role="tablist">
        {(["templates", "preferences"] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-subhead ${tab === id ? "border-b-2 border-[var(--accent)]" : ""}`}
          >
            {id === "templates" ? "Templates" : "Preferences"}
          </button>
        ))}
      </div>
      {tab === "templates" && <TemplatesEditor templates={templates} onChange={setTemplates} />}
      {tab === "preferences" && settings && (
        <div className="space-y-4">
          <Card className="glass-card">
            <CardHeader><h2 className="text-subhead">Messaging Enabled</h2></CardHeader>
            <CardContent>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={enabledDraft} onChange={(e) => setEnabledDraft(e.target.checked)} />
                <span className="text-body">Enable automated reminders + recall + manual messaging</span>
              </label>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader><h2 className="text-subhead">Daily Cost Cap</h2></CardHeader>
            <CardContent className="space-y-3">
              <CostCapBar spentCents={0} capCents={capDraft} />
              <input
                type="range" min={500} max={10000} step={500}
                value={capDraft} onChange={(e) => setCapDraft(Number(e.target.value))}
                className="w-full" aria-label="Daily cost cap dollars"
              />
              <p className="text-caption">${(capDraft / 100).toFixed(2)} per day</p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader><h2 className="text-subhead">Quiet Hours</h2></CardHeader>
            <CardContent>
              <p className="text-body text-[var(--text-secondary)]">
                Messages are sent only between 8:00 AM and 9:00 PM patient-local time. (Per-clinic override coming soon.)
              </p>
            </CardContent>
          </Card>
          <Button onClick={handleSaveSettings}>Save Preferences</Button>
        </div>
      )}
    </div>
  );
}
```
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function TemplatesEditor" components/messaging/TemplatesEditor.tsx` returns 1
    - `grep -c "scanForPhi" components/messaging/TemplatesEditor.tsx` returns at least 1 (live PHI warn)
    - `grep -c "messagingApi.updateTemplate" components/messaging/TemplatesEditor.tsx` returns at least 1
    - `grep -c "updateTemplate" lib/api/messaging.ts` returns at least 1 — **Warning 6 fix: helper added**
    - `test -f app/api/messaging/templates/\[id\]/route.ts && echo OK` → "OK" — **Warning 6 fix: BFF PATCH route exists**
    - `grep -c "proxyToFastAPI" "app/api/messaging/templates/[id]/route.ts"` returns at least 1
    - `grep -cE "/api/messaging/templates/.*params.id.*/" "app/api/messaging/templates/[id]/route.ts"` returns at least 1 (trailing slash on upstream — bff-api.md rule)
    - `grep -c "export async function PATCH" "app/api/messaging/templates/[id]/route.ts"` returns 1
    - `grep -c "@router.patch(\"/templates/{template_id}/\"" backend/api/routes/messaging.py` returns at least 1 (added if missing)
    - `grep -c "export default function MessagingSettingsPage" "app/(tenant)/[tenant]/settings/messaging/page.tsx"` returns 1
    - `grep -c "Templates\\|Preferences" "app/(tenant)/[tenant]/settings/messaging/page.tsx"` returns at least 2
    - `grep -c "CostCapBar\\|TemplatesEditor" "app/(tenant)/[tenant]/settings/messaging/page.tsx"` returns at least 2
    - `grep -c "messagingApi.getSettings\\|messagingApi.updateSettings" "app/(tenant)/[tenant]/settings/messaging/page.tsx"` returns at least 2
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Settings page with Templates + Preferences tabs; cost cap slider + cost cap bar; live PHI warn in template editor. lib/api/messaging.ts updateTemplate added. BFF templates/[id] PATCH route declared in this plan. Backend PATCH /templates/{id} present (added if missing).</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` → exits 0
2. `find app/\(tenant\)/\[tenant\]/messaging app/\(tenant\)/\[tenant\]/settings/messaging -name "*.tsx" | wc -l` → at least 4 (inbox + recall-queue + analytics + settings)
3. `grep -rE "import.*from \"@/components/.*Chart" "app/(tenant)/[tenant]/messaging/analytics/page.tsx"` → empty (charts inline, SSR-safety)
4. `test -f app/api/messaging/templates/\[id\]/route.ts` → succeeds (Warning 6 fix)
5. `grep -c "updateTemplate" lib/api/messaging.ts` → ≥1 (Warning 6 fix)
6. `grep -c "@router.patch(\"/templates/{template_id}/\"" backend/api/routes/messaging.py` → ≥1
7. Manual smoke (deferred to Plan 12-10): visit each new page, confirm renders without errors.
</verification>

<success_criteria>
- 3 new pages live: recall-queue, analytics, settings/messaging
- Sidebar gated by messaging entitlement with 4 sub-items
- Recharts inline in analytics page (mirrors Phase 8 SSR pattern)
- Templates editor with live PHI scan
- Cost cap slider + visualization
- `lib/api/messaging.ts` extended with updateTemplate helper (Warning 6 fix)
- `app/api/messaging/templates/[id]/route.ts` BFF PATCH route shipped (Warning 6 fix)
- Backend PATCH `/templates/{id}` present (added in this plan if Plan 12-05 didn't ship it)
- All UI-SPEC copy verbatim
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-09-SUMMARY.md` documenting:
- Final tab/section list per page
- Confirmation that lib/api/messaging.ts.updateTemplate was added in this plan (per checker Warning 6)
- Confirmation that app/api/messaging/templates/[id]/route.ts BFF PATCH route shipped here
- Whether backend/api/routes/messaging.py needed PATCH /templates/{id} (and whether TemplateUpdate / AuditAction.MESSAGE_TEMPLATE_UPDATED were already in place)
</output>
</output>
