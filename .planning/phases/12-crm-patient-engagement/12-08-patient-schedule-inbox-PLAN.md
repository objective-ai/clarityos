---
phase: 12
plan: 08
slug: patient-schedule-inbox
type: execute
wave: 5
depends_on: [12-05, 12-07]
files_modified:
  - app/(tenant)/[tenant]/patients/[patientId]/page.tsx
  - components/patients/MessagesTab.tsx
  - components/schedule/AppointmentDetailDrawer.tsx
  - components/schedule/AppointmentCard.tsx
  - app/(tenant)/[tenant]/messaging/inbox/page.tsx
  - components/TopNav.tsx
  - app/(tenant)/[tenant]/schedule/page.tsx
  - components/schedule/BulkSelectToolbar.tsx
  - lib/api/messaging.ts
autonomous: true
gap_closure: false
requirements: [CRM-02, CRM-05, CRM-11, CRM-18, CRM-19]

must_haves:
  truths:
    - "Patient detail page has a new Messages tab that shows MessageTimeline + Message button + ChannelPreferenceChip on header"
    - "Schedule appointment row has kebab menu with 'Message Patient' that opens MessageComposer"
    - "Schedule supports bulk-select mode with up-to-50 enforcement and a 'Send Selected' toolbar action"
    - "Bulk-select toolbar populates messagingStore.bulkRecipients (defined in Plan 12-07) BEFORE calling openComposer('bulk:<id>', 'bulk') — toolbar consumes the store, does NOT extend it"
    - "Global Inbox page at /messaging/inbox lists InboundMessages with classification filter, opens reply via MessageComposer"
    - "TopNav shows unread inbox badge with accent count (max '99+')"
    - "AppointmentCard shows new 'reminder sent' indicator when appointment.last_reminder_sent_at is set + 'confirmed' green dot when patient_confirmed_at is set"
  artifacts:
    - path: "components/patients/MessagesTab.tsx"
      provides: "Per-patient Messages tab — pulls /api/messaging/history/[patientId]"
    - path: "app/(tenant)/[tenant]/messaging/inbox/page.tsx"
      provides: "Global inbound triage page"
    - path: "components/schedule/BulkSelectToolbar.tsx"
      provides: "Toolbar that appears when ≥1 schedule rows are checked; consumes messagingStore.setBulkRecipients (owned by Plan 12-07)"
    - path: "lib/api/messaging.ts"
      provides: "Client-side fetch helpers for /api/messaging/* endpoints"
  key_links:
    - from: "components/TopNav.tsx"
      to: "store/messagingStore.ts"
      via: "useMessagingStore selector for inboxUnreadCount"
      pattern: "inboxUnreadCount"
    - from: "components/patients/MessagesTab.tsx"
      to: "components/messaging/MessageComposer.tsx"
      via: "openComposer + history fetch"
      pattern: "MessageComposer|MessageTimeline"
    - from: "components/schedule/BulkSelectToolbar.tsx"
      to: "store/messagingStore.ts"
      via: "setBulkRecipients(refs) before openComposer"
      pattern: "setBulkRecipients|BulkRecipientStub"
---

<objective>
Wire up the messaging primitives into the existing patient + schedule + TopNav surfaces. This is the integration plan — composer entry points 1, 2, 3, and 4 (per CONTEXT.md UX section) all attach here.

Output:
- Patient detail page Messages tab (entry point 1)
- Schedule appointment kebab → Message Patient (entry point 2)
- Schedule bulk-select toolbar (entry point 4) — consumes `messagingStore.setBulkRecipients` (defined in Plan 12-07)
- Global Inbox page (entry point 3, plus inbound triage UI)
- TopNav unread badge
- lib/api/messaging.ts client-side fetch helpers
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-UI-SPEC.md
@.planning/phases/12-crm-patient-engagement/12-05-SUMMARY.md
@.planning/phases/12-crm-patient-engagement/12-07-SUMMARY.md
@./CLAUDE.md
@app/(tenant)/[tenant]/patients/[patientId]/page.tsx
@components/TopNav.tsx
@components/schedule/AppointmentDetailDrawer.tsx
@components/schedule/AppointmentCard.tsx
@app/(tenant)/[tenant]/schedule/page.tsx

<interfaces>
From Plan 12-07:
- components/messaging/MessageComposer (props with patientId, consents, templates, onSend, onClose)
- components/messaging/MessageTimeline (props: messages: MessageLog[])
- components/messaging/ChannelPreferenceChip
- components/messaging/InboxItem
- store/messagingStore (useMessagingStore with openComposer, closeComposer, inboxUnreadCount, bulkRecipients, setBulkRecipients, clearBulkRecipients)
- store/messagingStore exports `BulkRecipientStub` type — import from there, do NOT redeclare locally

From Plan 12-05 (BFF endpoints):
- GET /api/messaging/history/[patientId] → MessageLog[]
- GET /api/messaging/inbox → InboundMessage[]
- GET /api/messaging/preferences/[patientId] → ChannelPreference
- POST /api/messaging/send → MessageLog
- POST /api/messaging/bulk-send → BulkSendResponse
- GET /api/messaging/templates → MessageTemplate[]

From existing project:
- patient detail page uses tab pattern (e.g. existing tabs: Demographics, Insurance, Billing/Claims)
- TopNav.tsx — right-side action cluster (clock-in, theme-toggle, avatar)
- AppointmentCard renders in 3 view modes (List/Timeline/Clinic) — patient_confirmed_at + last_reminder_sent_at fields exist on appointment now (Plan 12-01)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: lib/api/messaging.ts client + Patient detail Messages tab + ChannelPreferenceChip on header</name>
  <files>
    lib/api/messaging.ts,
    components/patients/MessagesTab.tsx,
    app/(tenant)/[tenant]/patients/[patientId]/page.tsx
  </files>
  <read_first>
    - app/(tenant)/[tenant]/patients/[patientId]/page.tsx (full file — find existing tabs structure)
    - components/patients/* (existing tab components for pattern reference: DemographicsTab, InsuranceTab, BillingTab)
    - components/messaging/MessageTimeline.tsx + ChannelPreferenceChip.tsx + MessageComposer.tsx (Plan 12-07)
    - lib/bff.ts (NOT used here — these are client-side fetches; use plain `fetch()` since browser can hit /api/* directly)
    - types/messaging.ts (Plan 12-01)
  </read_first>
  <action>
**Step 1.** Create `lib/api/messaging.ts` — client-side fetch helpers (TS-typed wrappers around /api/messaging/*):

```typescript
import type {
  MessageLog, MessageTemplate, InboundMessage, ChannelPreference,
  BulkSendRequest, RecallCandidate, MessagingSettings,
} from "@/types/messaging";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail));
  }
  return res.json() as Promise<T>;
}

export const messagingApi = {
  getHistory: (patientId: string) => jsonFetch<MessageLog[]>(`/api/messaging/history/${patientId}`),
  getInbox: (filter?: string) =>
    jsonFetch<InboundMessage[]>(`/api/messaging/inbox${filter ? `?filter_classification=${filter}` : ""}`),
  getPreferences: (patientId: string) =>
    jsonFetch<ChannelPreference>(`/api/messaging/preferences/${patientId}`),
  updatePreferences: (patientId: string, body: Partial<ChannelPreference>) =>
    jsonFetch<ChannelPreference>(`/api/messaging/preferences/${patientId}`, {
      method: "PATCH", body: JSON.stringify(body),
    }),
  getTemplates: () => jsonFetch<MessageTemplate[]>(`/api/messaging/templates`),
  sendMessage: (body: { patient_id: string; channel: string; purpose?: string; body?: string;
                         template_id?: string; tokens?: Record<string, string>; appointment_id?: string;
                         force_outside_quiet_hours?: boolean; language?: string; }) =>
    jsonFetch<MessageLog>(`/api/messaging/send`, { method: "POST", body: JSON.stringify(body) }),
  bulkSend: (body: BulkSendRequest) =>
    jsonFetch<{ batchId: string; sentCount: number; failedCount: number; excludedCount: number; errors: any[] }>(
      `/api/messaging/bulk-send`, { method: "POST", body: JSON.stringify(body) }
    ),
  draftWithAi: (body: { patient_id: string; intent: string; channel: string; purpose?: string }) =>
    jsonFetch<{ body: string }>(`/api/messaging/ai-draft`, { method: "POST", body: JSON.stringify(body) }),
  getRecallQueue: () => jsonFetch<{ candidates: RecallCandidate[] }>(`/api/messaging/recall-queue`),
  sendRecallBatch: (body: { candidate_patient_ids: string[]; template_id: string; channel: string }) =>
    jsonFetch<{ runId: string; sent: number; failed: number; excluded: number }>(
      `/api/messaging/recall-queue/send-all`, { method: "POST", body: JSON.stringify(body) }
    ),
  getAnalytics: (rangeDays = 30) =>
    jsonFetch<any>(`/api/messaging/analytics?range_days=${rangeDays}`),
  getSettings: () => jsonFetch<MessagingSettings>(`/api/messaging/settings`),
  updateSettings: (body: Partial<MessagingSettings>) =>
    jsonFetch<MessagingSettings>(`/api/messaging/settings`, { method: "PATCH", body: JSON.stringify(body) }),
};
```

**Step 2.** Create `components/patients/MessagesTab.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { MessageTimeline } from "@/components/messaging/MessageTimeline";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { ChannelPreferenceChip } from "@/components/messaging/ChannelPreferenceChip";
import { useMessagingStore } from "@/store/messagingStore";
import { messagingApi } from "@/lib/api/messaging";
import type { MessageLog, ChannelPreference, MessageTemplate } from "@/types/messaging";

interface Props { patientId: string; patientFirstName: string; }

export function MessagesTab({ patientId, patientFirstName }: Props) {
  const [history, setHistory] = useState<MessageLog[]>([]);
  const [prefs, setPrefs] = useState<ChannelPreference | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { isComposerOpen, composerPatientId, openComposer, closeComposer } = useMessagingStore();

  useEffect(() => {
    let alive = true;
    Promise.all([
      messagingApi.getHistory(patientId),
      messagingApi.getPreferences(patientId),
      messagingApi.getTemplates(),
    ]).then(([h, p, t]) => {
      if (!alive) return;
      setHistory(h);
      setPrefs(p);
      setTemplates(t);
    }).catch(console.error).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [patientId]);

  const isComposerForThisPatient = isComposerOpen && composerPatientId === patientId;

  async function handleSend(payload: any) {
    await messagingApi.sendMessage({ patient_id: patientId, ...payload });
    const h = await messagingApi.getHistory(patientId);
    setHistory(h);
  }

  if (loading) return <Card className="glass-card"><CardContent className="p-6">Loading messages…</CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-subhead">Messages</h2>
            {prefs && <ChannelPreferenceChip consents={prefs.consents} preferredChannel={prefs.preferredChannel} />}
          </div>
          <Button
            onClick={() => openComposer(patientId, "patient_header")}
            className="min-h-[var(--touch-target)]"
          >
            <MessageSquare className="w-4 h-4 mr-2" aria-hidden />
            Send Message
          </Button>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-subhead mb-2">No messages sent to this patient yet</p>
              <p className="text-body text-[var(--text-secondary)]">
                Use the Message button above to send an appointment reminder or note.
              </p>
            </div>
          ) : (
            <MessageTimeline messages={history} />
          )}
        </CardContent>
      </Card>

      {isComposerForThisPatient && prefs && (
        <MessageComposer
          patientId={patientId}
          patientFirstName={patientFirstName}
          consents={prefs.consents}
          templates={templates}
          onSend={handleSend}
          onClose={closeComposer}
        />
      )}
    </div>
  );
}
```

**Step 3.** Edit `app/(tenant)/[tenant]/patients/[patientId]/page.tsx`:
- Find existing tab structure (likely a TabsList with existing tabs)
- Add new `<TabsTrigger value="messages">Messages</TabsTrigger>`
- Add corresponding `<TabsContent value="messages"><MessagesTab patientId={...} patientFirstName={...} /></TabsContent>`
- In the patient header area (next to or above existing demographics), if a header info row exists, add ChannelPreferenceChip there as well (small chip showing preference state) — optional if header already has many chips, place inside MessagesTab only.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "MessagesTab" app/\(tenant\)/\[tenant\]/patients/\[patientId\]/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export const messagingApi" lib/api/messaging.ts` returns 1
    - `grep -c "getHistory\\|getInbox\\|getPreferences\\|sendMessage\\|bulkSend\\|draftWithAi\\|getRecallQueue\\|sendRecallBatch\\|getAnalytics" lib/api/messaging.ts` returns at least 9
    - `grep -c "export function MessagesTab" components/patients/MessagesTab.tsx` returns 1
    - `grep -c "MessageTimeline\\|MessageComposer\\|ChannelPreferenceChip" components/patients/MessagesTab.tsx` returns at least 3
    - `grep -c "messagingApi.getHistory" components/patients/MessagesTab.tsx` returns at least 1
    - `grep -c "MessagesTab" "app/(tenant)/[tenant]/patients/[patientId]/page.tsx"` returns at least 1
    - `grep -c "TabsTrigger value=\"messages\"" "app/(tenant)/[tenant]/patients/[patientId]/page.tsx"` returns 1
    - `grep -c "No messages sent to this patient yet" components/patients/MessagesTab.tsx` returns 1 (UI-SPEC copy verbatim)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>API client, MessagesTab, and patient page tab integration complete.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Schedule kebab + bulk-select toolbar (CONSUMES messagingStore.setBulkRecipients) + AppointmentCard reminder/confirmed indicators + AppointmentDetailDrawer Message button</name>
  <files>
    components/schedule/AppointmentCard.tsx,
    components/schedule/AppointmentDetailDrawer.tsx,
    components/schedule/BulkSelectToolbar.tsx,
    app/(tenant)/[tenant]/schedule/page.tsx
  </files>
  <read_first>
    - components/schedule/AppointmentCard.tsx (full file — extend, do not rewrite; existing reminders for status colors + intake icon)
    - components/schedule/AppointmentDetailDrawer.tsx (full file — has existing actions section)
    - app/(tenant)/[tenant]/schedule/page.tsx (full file — view-mode tabs + render loop)
    - store/messagingStore.ts (Plan 12-07 — confirm bulkRecipients + setBulkRecipients + BulkRecipientStub are exported here; we ONLY consume, do NOT extend)
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (line 56 — bulk select max 50)
    - .planning/phases/12-crm-patient-engagement/12-CONTEXT.md (lines 58-65 — entry points + bulk safeguards)
  </read_first>
  <action>
**Step 1.** Edit `components/schedule/AppointmentCard.tsx`:
- Read the appointment object — note the new fields `patient_confirmed_at`, `last_reminder_sent_at`, `reminders_sent_count` (Plan 12-01).
- Add visual indicators (small icons next to existing intake icon):
  - When `appointment.patient_confirmed_at` set: green dot + `aria-label="Confirmed"` (use lucide `CheckCircle2`, color `var(--state-normal)`)
  - When `appointment.last_reminder_sent_at` set AND not confirmed: subtle bell icon (lucide `Bell`, color `var(--text-muted)`) + `aria-label="Reminder sent {count}"`.
- Add a kebab menu button (DropdownMenu trigger, Radix-backed via existing `components/ui/dropdown-menu.tsx`). Items:
  - "Message Patient" → calls `useMessagingStore().openComposer(patient_id, "schedule_kebab")`
  - "View Details" → existing onCardClick behavior
  - Existing actions (Cancel, Reschedule) if present

**Step 2.** Edit `components/schedule/AppointmentDetailDrawer.tsx`:
- Add a "Message Patient" Button (outline, default size) in the actions row at the bottom of the drawer.
- onClick: calls `openComposer(patient_id, "schedule_kebab")` and closes the drawer.
- Place between existing actions (after "Start Exam" / "Cancel" buttons).

**Step 3.** Create `components/schedule/BulkSelectToolbar.tsx` (CONSUMES bulkRecipients ownership from Plan 12-07's messagingStore — does NOT extend the store):

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { MessageSquare, X } from "lucide-react";
import { useMessagingStore, type BulkRecipientStub } from "@/store/messagingStore";

interface Props {
  selectedAppointmentIds: string[];
  selectedPatientData: BulkRecipientStub[];   // imported type from messagingStore (Plan 12-07)
  onClearSelection: () => void;
}

const MAX_BULK = 50;

export function BulkSelectToolbar({ selectedAppointmentIds, selectedPatientData, onClearSelection }: Props) {
  const { openComposer, setBulkRecipients } = useMessagingStore();
  const count = selectedAppointmentIds.length;
  if (count === 0) return null;
  const exceeds = count > MAX_BULK;

  function handleOpenBulkComposer() {
    // Populate the store BEFORE opening the composer.
    // bulkRecipients is owned by Plan 12-07's messagingStore — we only consume.
    setBulkRecipients(selectedPatientData);
    openComposer(`bulk:${Date.now()}`, "bulk");
  }

  return (
    <div role="toolbar" className="glass-card flex items-center justify-between p-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <span className="text-subhead">{count} selected</span>
        {exceeds && (
          <span className="text-caption text-[var(--state-critical)]">
            Max {MAX_BULK} per send — please reduce selection
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          disabled={exceeds || count === 0}
          onClick={handleOpenBulkComposer}
          className="min-h-[var(--touch-target)]"
        >
          <MessageSquare className="w-4 h-4 mr-2" aria-hidden />
          Send Message ({count})
        </Button>
        <Button variant="ghost" onClick={onClearSelection} aria-label="Clear selection">
          <X className="w-4 h-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
```

**Step 4.** Edit `app/(tenant)/[tenant]/schedule/page.tsx`:
- Add bulk-select state: `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`
- Add bulk-select toggle button in the header (visible to receptionist + owner roles)
- When bulk mode active, show checkboxes on each AppointmentCard (pass `bulkMode` + `onSelectChange` props down)
- Build `selectedPatientData: BulkRecipientStub[]` from the schedule's loaded appointments by filtering on selectedIds
- Render `<BulkSelectToolbar selectedAppointmentIds={[...selectedIds]} selectedPatientData={selectedPatientData} onClearSelection={() => setSelectedIds(new Set())} />` above the schedule view list
- The composer reads `useMessagingStore((s) => s.bulkRecipients)` to render the recipient list — already populated by the toolbar.

NOTE: This task does NOT modify `store/messagingStore.ts`. Plan 12-07 owns the store and exports `bulkRecipients`, `setBulkRecipients`, `clearBulkRecipients`, and the `BulkRecipientStub` type. If any of those are missing when this plan is executed, that is a Plan 12-07 bug — file a gap closure on 12-07, do not edit the store from this plan.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Message Patient" components/schedule/AppointmentCard.tsx` returns at least 1 (kebab menu)
    - `grep -c "DropdownMenu\\|DropdownMenuTrigger\\|DropdownMenuItem" components/schedule/AppointmentCard.tsx` returns at least 3
    - `grep -c "patient_confirmed_at\\|last_reminder_sent_at" components/schedule/AppointmentCard.tsx` returns at least 2
    - `grep -c "openComposer.*schedule_kebab" components/schedule/AppointmentCard.tsx` returns at least 1
    - `grep -c "Message Patient" components/schedule/AppointmentDetailDrawer.tsx` returns at least 1
    - `grep -c "openComposer" components/schedule/AppointmentDetailDrawer.tsx` returns at least 1
    - `grep -c "export function BulkSelectToolbar" components/schedule/BulkSelectToolbar.tsx` returns 1
    - `grep -c "MAX_BULK = 50" components/schedule/BulkSelectToolbar.tsx` returns 1
    - `grep -c "setBulkRecipients" components/schedule/BulkSelectToolbar.tsx` returns at least 1
    - `grep -c "BulkRecipientStub" components/schedule/BulkSelectToolbar.tsx` returns at least 1 (imported, not redeclared)
    - `grep -c "from \"@/store/messagingStore\"" components/schedule/BulkSelectToolbar.tsx` returns 1
    - `grep -c "BulkSelectToolbar" "app/(tenant)/[tenant]/schedule/page.tsx"` returns at least 1
    - `git diff --name-only HEAD store/messagingStore.ts | wc -l` returns 0 (Plan 12-08 MUST NOT modify the store — Plan 12-07 owns it)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Schedule integrates kebab + bulk + reminder indicators + drawer Message button. BulkSelectToolbar consumes messagingStore (Plan 12-07 ownership respected) — no store edits in this plan. tsc clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Global Inbox page + TopNav unread badge + InboxItem wiring + reply composer</name>
  <files>
    app/(tenant)/[tenant]/messaging/inbox/page.tsx,
    components/TopNav.tsx
  </files>
  <read_first>
    - components/TopNav.tsx (full file — find right-hand action cluster; Phase 10.4 inserted ClockInButton before theme-toggle)
    - components/messaging/InboxItem.tsx + MessageComposer.tsx (Plan 12-07)
    - lib/api/messaging.ts (Task 1)
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (lines 130-141 — Inbox page layout contract)
    - app/(tenant)/[tenant]/optical/page.tsx OR similar tenant page (file structure reference)
  </read_first>
  <action>
**Step 1.** Create `app/(tenant)/[tenant]/messaging/inbox/page.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { InboxItem } from "@/components/messaging/InboxItem";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { useMessagingStore } from "@/store/messagingStore";
import { messagingApi } from "@/lib/api/messaging";
import type { InboundMessage, ChannelPreference, MessageTemplate } from "@/types/messaging";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "reschedule_request", label: "Reschedule" },
  { id: "cancellation", label: "Cancellation" },
  { id: "question_clinical", label: "Question" },
  { id: "thank_you", label: "Other" },  // grouping bucket
] as const;

export default function InboxPage() {
  const [items, setItems] = useState<InboundMessage[]>([]);
  const [filter, setFilter] = useState<typeof FILTERS[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<ChannelPreference | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { isComposerOpen, composerPatientId, openComposer, closeComposer, setInboxUnreadCount } = useMessagingStore();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const f = filter === "all" ? undefined : filter;
    Promise.all([
      messagingApi.getInbox(f),
      messagingApi.getTemplates(),
    ]).then(([m, t]) => {
      if (!alive) return;
      setItems(m);
      setTemplates(t);
      setInboxUnreadCount(m.filter((x) => !x.isRead).length);
    }).catch(console.error).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filter, setInboxUnreadCount]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const lower = search.toLowerCase();
    return items.filter((m) => m.body.toLowerCase().includes(lower) || m.fromE164.includes(search));
  }, [items, search]);

  const selected = items.find((x) => x.id === selectedId) ?? null;

  useEffect(() => {
    if (selected?.patientId) {
      messagingApi.getPreferences(selected.patientId).then(setPrefs).catch(() => setPrefs(null));
    } else {
      setPrefs(null);
    }
  }, [selected?.patientId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-4 h-[calc(100vh-120px)]">
      <Card className="glass-card flex flex-col">
        <div className="p-4 border-b border-[var(--glass-border)]">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages…"
              aria-label="Search messages"
              className="glass-input w-full pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                role="tab"
                aria-selected={filter === f.id}
                className={`px-3 py-1 text-caption uppercase tracking-widest rounded-full
                  ${filter === f.id ? "bg-[var(--accent)] text-[var(--bg-base)]" : "text-[var(--text-secondary)]"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {loading ? (
            <div className="p-4">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-subhead mb-2">No messages yet</p>
              <p className="text-body text-[var(--text-secondary)]">
                Patient replies and inbound messages will appear here. Send a message to get started.
              </p>
            </div>
          ) : (
            filtered.map((m) => (
              <InboxItem
                key={m.id}
                inbound={m}
                patientName={null}
                isSelected={m.id === selectedId}
                onClick={() => setSelectedId(m.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="glass-card flex flex-col">
        {selected ? (
          <>
            <div className="p-4 border-b border-[var(--glass-border)]">
              <h2 className="text-subhead">{selected.fromE164}</h2>
              {selected.classification && (
                <span className="text-caption text-[var(--state-info)]">{selected.classification}</span>
              )}
            </div>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="bg-[var(--bg-overlay)] rounded p-3 max-w-[80%]">
                <p className="text-body">{selected.body}</p>
                <p className="text-caption text-[var(--text-muted)] mt-2">
                  {new Date(selected.receivedAt).toLocaleString()}
                </p>
              </div>
            </CardContent>
            {selected.patientId && (
              <div className="p-4 border-t border-[var(--glass-border)]">
                <Button
                  onClick={() => openComposer(selected.patientId!, "inbox_reply")}
                  className="w-full min-h-[var(--touch-target)]"
                >
                  Reply
                </Button>
              </div>
            )}
          </>
        ) : (
          <CardContent className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
            <p className="text-body">Select a message to view the thread</p>
          </CardContent>
        )}
      </Card>

      {isComposerOpen && composerPatientId && prefs && (
        <MessageComposer
          patientId={composerPatientId}
          patientFirstName=""
          consents={prefs.consents}
          templates={templates}
          onSend={async (payload) => {
            await messagingApi.sendMessage({ patient_id: composerPatientId, ...payload });
            const inbox = await messagingApi.getInbox(filter === "all" ? undefined : filter);
            setItems(inbox);
          }}
          onClose={closeComposer}
        />
      )}
    </div>
  );
}
```

**Step 2.** Edit `components/TopNav.tsx`:
- Find the right-side action cluster (Phase 10.4 placed ClockInButton before theme-toggle)
- Add a new icon button (Mail or MessageSquare from lucide-react) that:
  - Links to `/${tenant}/messaging/inbox`
  - Shows an absolute-positioned accent badge with the unread count from `useMessagingStore().inboxUnreadCount`
  - Shows "99+" when count > 99
  - aria-label: "Messaging inbox, X unread"
  - Place BEFORE ClockInButton in the cluster

```tsx
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useMessagingStore } from "@/store/messagingStore";

const inboxUnreadCount = useMessagingStore((s) => s.inboxUnreadCount);
<Link
  href={`/${tenant}/messaging/inbox`}
  className="relative inline-flex items-center justify-center w-10 h-10 rounded hover:bg-[var(--bg-overlay)]"
  aria-label={`Messaging inbox, ${inboxUnreadCount} unread`}
>
  <MessageSquare className="w-5 h-5" aria-hidden />
  {inboxUnreadCount > 0 && (
    <span
      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[var(--accent)] text-[var(--bg-base)] text-[10px] font-semibold flex items-center justify-center px-1"
      aria-hidden
    >
      {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
    </span>
  )}
</Link>
```
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export default function InboxPage" "app/(tenant)/[tenant]/messaging/inbox/page.tsx"` returns 1
    - `grep -c "InboxItem" "app/(tenant)/[tenant]/messaging/inbox/page.tsx"` returns at least 1
    - `grep -c "messagingApi.getInbox" "app/(tenant)/[tenant]/messaging/inbox/page.tsx"` returns at least 1
    - `grep -c "No messages yet" "app/(tenant)/[tenant]/messaging/inbox/page.tsx"` returns 1 (UI-SPEC copy)
    - `grep -c "Patient replies and inbound messages will appear here" "app/(tenant)/[tenant]/messaging/inbox/page.tsx"` returns 1
    - `grep -c "useMessagingStore" components/TopNav.tsx` returns at least 1
    - `grep -c "inboxUnreadCount\\|99+" components/TopNav.tsx` returns at least 2
    - `grep -c "/messaging/inbox" components/TopNav.tsx` returns at least 1
    - `grep -c "aria-label" components/TopNav.tsx` returns at least 1
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Inbox page works with filter tabs + thread + reply. TopNav unread badge wired with useMessagingStore.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` → exits 0
2. `find app/\(tenant\)/\[tenant\]/messaging -name "*.tsx" | wc -l` → at least 1 (inbox page; recall + analytics in Plan 12-09)
3. `grep -c "MessagesTab" "app/(tenant)/[tenant]/patients/[patientId]/page.tsx"` → ≥1
4. `grep -c "BulkSelectToolbar" "app/(tenant)/[tenant]/schedule/page.tsx"` → ≥1
5. `grep -c "setBulkRecipients" components/schedule/BulkSelectToolbar.tsx` → ≥1 (consumes Plan 12-07's store)
6. `git diff --name-only HEAD store/messagingStore.ts` → empty (Plan 12-08 does NOT modify the store)
7. Manual visual smoke (deferred to Plan 12-10): open a patient, click Messages tab, see empty state; open schedule, open kebab on a card, see "Message Patient" item.
</verification>

<success_criteria>
- 4 entry points wired (patient header, schedule kebab, schedule bulk, inbox reply)
- AppointmentCard shows confirmed + reminder-sent indicators
- TopNav unread badge with 99+ cap
- Inbox page with filter tabs + thread + reply composer
- lib/api/messaging.ts has typed wrappers for all 9+ /api/messaging/* endpoints
- BulkSelectToolbar consumes (does not extend) Plan 12-07's messagingStore — store ownership stays in Plan 12-07
- All UI-SPEC copy verbatim
- tsc clean
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-08-SUMMARY.md` documenting:
- Final tab count on patient detail page
- Confirmation that Plan 12-08 did NOT modify store/messagingStore.ts (ownership stays in Plan 12-07 per checker fix)
- Any kebab/bulk integration deviations
</output>
</output>
