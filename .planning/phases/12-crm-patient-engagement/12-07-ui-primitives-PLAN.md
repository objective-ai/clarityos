---
phase: 12
plan: 07
slug: ui-primitives
type: execute
wave: 4
depends_on: [12-01, 12-05]
files_modified:
  - components/messaging/MessageComposer.tsx
  - components/messaging/ChannelPreferenceChip.tsx
  - components/messaging/MessageStatusIcon.tsx
  - components/messaging/InboxItem.tsx
  - components/messaging/RecallQueueRow.tsx
  - components/messaging/OptOutWarning.tsx
  - components/messaging/WizardStep.tsx
  - components/messaging/MessageTimeline.tsx
  - components/messaging/CostCapBar.tsx
  - store/messagingStore.ts
  - store/recallQueueStore.ts
  - lib/messaging/index.ts
  - lib/messaging/sms-segments.ts
  - lib/messaging/phi-scan.ts
  - lib/messaging/composer-preview.ts
  - lib/messaging/sms-segments.test.ts
  - lib/messaging/phi-scan.test.ts
  - lib/messaging/composer-preview.test.ts
autonomous: true
gap_closure: false
requirements: [CRM-02, CRM-04, CRM-05, CRM-12]

must_haves:
  truths:
    - "9 messaging UI primitives implemented per UI-SPEC component inventory"
    - "MessageComposer supports channel selector, template picker, free-form body, live preview, SMS segment count, PHI scan soft-warn, Draft with AI button"
    - "MessageComposer blocks send (disabled state) when patient has opted out of selected channel/purpose"
    - "MessageStatusIcon renders 5 states (queued/sent/delivered/read/failed) with correct lucide icons + color tokens"
    - "Zustand stores manage composer draft + inbox unread count + recall selection state + bulkRecipients (used by schedule bulk-send entry point in Plan 12-08)"
    - "lib/messaging/sms-segments.ts mirrors backend count_sms_segments logic (TS port)"
    - "lib/messaging/phi-scan.ts mirrors backend scrub denylist (client-side soft-warn — server still re-validates)"
  artifacts:
    - path: "components/messaging/MessageComposer.tsx"
      provides: "Single composer used at all 4 entry points"
    - path: "store/messagingStore.ts"
      provides: "useMessagingStore — composer draft + send state + inbox unread count + bulkRecipients"
    - path: "lib/messaging/sms-segments.ts"
      exports: ["countSmsSegments"]
    - path: "lib/messaging/phi-scan.ts"
      exports: ["scanForPhi", "PhiScanResult"]
    - path: "lib/messaging/composer-preview.ts"
      exports: ["previewMessage", "PreviewResult"]
  key_links:
    - from: "components/messaging/MessageComposer.tsx"
      to: "lib/messaging/composer-preview.ts"
      via: "useMemo on body changes"
      pattern: "previewMessage"
    - from: "components/messaging/MessageComposer.tsx"
      to: "store/messagingStore.ts"
      via: "useMessagingStore selector"
      pattern: "useMessagingStore"
---

<objective>
Build the shared messaging UI primitives + utility libs + Zustand stores. All four composer entry points (Plan 12-08 surfaces) reuse these. Centralizing here means design changes happen in one place.

Output:
- 9 components in `components/messaging/` matching UI-SPEC component inventory
- 2 Zustand stores (composer state + recall selection). messagingStore is THE owner of all composer-adjacent state — including the `bulkRecipients` field consumed by Plan 12-08's schedule bulk-send entry point. We declare it here so Plan 12-08 doesn't silently extend the store.
- 3 utility libs in `lib/messaging/` (TS ports of backend logic — sms-segments, phi-scan, composer-preview)
- 3 vitest unit test files
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-UI-SPEC.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@.planning/phases/12-crm-patient-engagement/12-VALIDATION.md
@./CLAUDE.md
@components/ui/card.tsx
@components/ui/button.tsx
@components/ui/badge.tsx
@components/ui/dialog.tsx
@store/encounterStore.ts
@types/messaging.ts

<interfaces>
From types/messaging.ts (Plan 12-01):
- MessageStatus, MessageChannel, MessagePurpose, TemplateKind types
- MessageLog, MessageTemplate, ChannelPreference, ConsentFlags interfaces

From backend/services/messaging/templates.py (Plan 12-02):
- _GSM7_CHARS set + segment-counting logic — must port to TS
- DIAGNOSIS_TERMS, RX_TERMS, _ICD10_RE, _RX_VALUE_RE, _ACUITY_RE — must port to TS

From components/ui (existing):
- Button (default | outline | ghost | destructive variants)
- Card, CardHeader, CardContent, CardFooter (.glass-card)
- Badge (default | secondary | destructive | outline | success | warning)
- Dialog (focus-trap, ESC + backdrop close)
- DropdownMenu (Radix-backed)

From globals.css (CSS vars):
- --accent (#2DD4BF), --bg-elevated, --bg-overlay
- --state-critical (#F87171), --state-warning (#FBBF24), --state-normal (#34D399), --state-info (#60A5FA)
- --text-secondary, --text-muted, --touch-target (44px)
- .glass-card, .glass-input, .hover-row, .font-mono-data, .text-heading, .text-subhead, .text-body, .text-caption

From store/encounterStore.ts (Zustand pattern reference):
- create<...>()(devtools(persist(...))) with selector pattern + shallow

From lib/utils.ts:
- cn() className merger
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Utility libs (sms-segments + phi-scan + composer-preview) + vitest tests</name>
  <files>
    lib/messaging/index.ts,
    lib/messaging/sms-segments.ts,
    lib/messaging/phi-scan.ts,
    lib/messaging/composer-preview.ts,
    lib/messaging/sms-segments.test.ts,
    lib/messaging/phi-scan.test.ts,
    lib/messaging/composer-preview.test.ts
  </files>
  <read_first>
    - backend/services/messaging/templates.py (Plan 12-02 — _GSM7_CHARS, DIAGNOSIS_TERMS, regex patterns; mirror these exactly in TS)
    - types/messaging.ts (Plan 12-01)
    - backend/tests/messaging/fixtures/phi_scrub_corpus.py (PHI corpus — mirror as TS test data)
    - vitest.config.ts (existing test config)
  </read_first>
  <behavior>
    sms-segments:
    - countSmsSegments("Hello") → { count: 1, encoding: "GSM-7", remainingChars: 155 }
    - countSmsSegments(160-char ASCII) → count: 1
    - countSmsSegments(161-char ASCII) → count: 2, encoding: "GSM-7"
    - countSmsSegments("Hi 👋") → encoding: "UCS-2"
    - countSmsSegments(70-char emoji string) → count: 1, encoding: "UCS-2"
    - countSmsSegments(71-char emoji string) → count: 2

    phi-scan:
    - scanForPhi("Reminder for tomorrow") → { hasPhi: false }
    - scanForPhi("Your glaucoma checkup") → { hasPhi: true }
    - scanForPhi("ICD-10: H40.10") → matches contains "H40.10"
    - scanForPhi("OD -2.50 -1.00 x 180") → hasPhi: true
    - 20/40, +2.00 add, latanoprost — all hasPhi: true

    composer-preview:
    - previewMessage({ body: "Hi {{patient_first_name}}", tokens: { patient_first_name: "Jane" }, channel: "sms", purpose: "operational", consents: full-consent }) → { rendered: "Hi Jane", segments.count: 1, blocked: false }
    - previewMessage with smsOptedOutAt set → blocked: true, blockReason: "OPT_OUT"
    - previewMessage with PHI in operational SMS → softWarn: true (NOT blocked)
    - previewMessage with marketing purpose + smsMarketing=false → blocked: true
  </behavior>
  <action>
**Step 1.** Create `lib/messaging/sms-segments.ts` (TS port of backend count_sms_segments):

```typescript
const GSM7_CHARS = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ " +
  "!\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà"
);

export interface SmsSegmentResult {
  count: number;
  encoding: "GSM-7" | "UCS-2";
  totalChars: number;
  remainingChars: number;
  perSegmentLimit: number;
}

export function countSmsSegments(body: string): SmsSegmentResult {
  const chars = Array.from(body); // unicode-safe
  const totalChars = chars.length;
  const isGsm = chars.every((c) => GSM7_CHARS.has(c));

  if (isGsm) {
    if (totalChars <= 160) {
      return { count: 1, encoding: "GSM-7", totalChars, remainingChars: 160 - totalChars, perSegmentLimit: 160 };
    }
    return { count: Math.ceil(totalChars / 153), encoding: "GSM-7", totalChars,
             remainingChars: 153 - (totalChars % 153), perSegmentLimit: 153 };
  }
  if (totalChars <= 70) {
    return { count: 1, encoding: "UCS-2", totalChars, remainingChars: 70 - totalChars, perSegmentLimit: 70 };
  }
  return { count: Math.ceil(totalChars / 67), encoding: "UCS-2", totalChars,
           remainingChars: 67 - (totalChars % 67), perSegmentLimit: 67 };
}
```

**Step 2.** Create `lib/messaging/phi-scan.ts`:

```typescript
const DIAGNOSIS_TERMS = ["glaucoma", "diabetic retinopathy", "macular degeneration", "cataract",
  "amblyopia", "strabismus", "keratoconus", "retinal detachment", "uveitis", "conjunctivitis",
  "iritis", "papilledema", "diabetic", "macular"];
const RX_TERMS = ["latanoprost", "timolol", "brimonidine", "dorzolamide", "bimatoprost"];
const ICD10_RE = /\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b/;
const RX_VALUE_RE = /\b(?:OD|OS|OU)\s*[+-]?\d+\.\d{2}/i;
const ACUITY_RE = /\b20\/\d{2,4}\b/;
const ADD_POWER_RE = /[+-]\d+\.\d{2}\s*add/i;

export interface PhiScanResult { hasPhi: boolean; matches: string[]; }

export function scanForPhi(body: string): PhiScanResult {
  const lower = body.toLowerCase();
  const matches: string[] = [];
  for (const term of [...DIAGNOSIS_TERMS, ...RX_TERMS]) {
    if (lower.includes(term)) matches.push(term);
  }
  const checks: [RegExp, string?][] = [[ICD10_RE], [RX_VALUE_RE], [ACUITY_RE], [ADD_POWER_RE]];
  for (const [re] of checks) {
    const m = body.match(re);
    if (m) matches.push(m[0]);
  }
  return { hasPhi: matches.length > 0, matches };
}
```

**Step 3.** Create `lib/messaging/composer-preview.ts`:

```typescript
import type { ConsentFlags, MessageChannel, MessagePurpose } from "@/types/messaging";
import { countSmsSegments, type SmsSegmentResult } from "./sms-segments";
import { scanForPhi, type PhiScanResult } from "./phi-scan";

export interface PreviewInput {
  body: string;
  tokens: Record<string, string>;
  channel: MessageChannel;
  purpose: MessagePurpose;
  consents: ConsentFlags;
}

export interface PreviewResult {
  rendered: string;
  segments: SmsSegmentResult | null;
  phiResult: PhiScanResult | null;
  blocked: boolean;
  blockReason?: "OPT_OUT" | "PAUSED" | "INVALID_INPUT";
  softWarn: boolean;
}

const TOKEN_RE = /\{\{([a-z_]+)\}\}/g;

export function previewMessage(input: PreviewInput): PreviewResult {
  const rendered = input.body.replace(TOKEN_RE, (_m, k) => input.tokens[k] ?? `{{${k}}}`);
  const isOp = input.purpose === "operational" || input.purpose === "manual";
  const isMkt = input.purpose === "marketing";
  const c = input.consents;

  const block = (reason: PreviewResult["blockReason"]): PreviewResult => ({
    rendered, segments: null, phiResult: null, blocked: true, blockReason: reason, softWarn: false,
  });

  if (input.channel === "sms" && c.smsOptedOutAt) return block("OPT_OUT");
  if (c.pausedUntil) return block("PAUSED");
  if (input.channel === "sms") {
    if (isMkt && !c.smsMarketing) return block("OPT_OUT");
    if (isOp && !c.smsOperational) return block("OPT_OUT");
  } else {
    if (isMkt && !c.emailMarketing) return block("OPT_OUT");
    if (isOp && !c.emailOperational) return block("OPT_OUT");
  }

  const segments = input.channel === "sms" ? countSmsSegments(rendered) : null;
  const phiResult = (input.channel === "sms" && isOp) ? scanForPhi(rendered) : null;
  return { rendered, segments, phiResult, blocked: false, softWarn: !!phiResult?.hasPhi };
}
```

**Step 4.** Create `lib/messaging/index.ts` exporting all symbols above.

**Step 5.** Create the 3 vitest test files covering all listed behaviors. Use the PHI corpus values from Plan 12-00 fixtures (mirror in TS).
  </action>
  <verify>
    <automated>npx vitest run lib/messaging/</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function countSmsSegments" lib/messaging/sms-segments.ts` returns 1
    - `grep -c "export function scanForPhi" lib/messaging/phi-scan.ts` returns 1
    - `grep -c "export function previewMessage" lib/messaging/composer-preview.ts` returns 1
    - `grep -c "GSM7_CHARS" lib/messaging/sms-segments.ts` returns at least 1
    - `grep -c "DIAGNOSIS_TERMS" lib/messaging/phi-scan.ts` returns at least 1
    - `grep -c "ICD10_RE\\|RX_VALUE_RE" lib/messaging/phi-scan.ts` returns at least 2
    - `npx vitest run lib/messaging/sms-segments.test.ts --reporter=verbose 2>&1 | grep -c "✓"` returns at least 6
    - `npx vitest run lib/messaging/phi-scan.test.ts --reporter=verbose 2>&1 | grep -c "✓"` returns at least 5
    - `npx vitest run lib/messaging/composer-preview.test.ts --reporter=verbose 2>&1 | grep -c "✓"` returns at least 4
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>3 utility libs + 3 vitest tests; ≥15 total tests pass.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Zustand stores (messagingStore + recallQueueStore) — messagingStore OWNS bulkRecipients (consumed by Plan 12-08 schedule bulk entry)</name>
  <files>
    store/messagingStore.ts,
    store/recallQueueStore.ts
  </files>
  <read_first>
    - store/encounterStore.ts (existing Zustand devtools + persist + selectors pattern)
    - types/messaging.ts (Plan 12-01)
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (lines 130-176 — page-level layouts where stores are consumed)
    - .planning/phases/12-crm-patient-engagement/12-CONTEXT.md (lines 58-65 — bulk send is composer entry point #4; needs a recipient list living in store so the toolbar can populate it before opening composer)
  </read_first>
  <action>
**Step 1.** Create `store/messagingStore.ts`:

`messagingStore` owns ALL composer-adjacent state — including `bulkRecipients` which Plan 12-08's `BulkSelectToolbar` populates before calling `openComposer(...)`. We declare it here (not in 12-08) so store ownership is in one plan and Plan 12-08 only consumes it.

```typescript
/**
 * Messaging store: composer draft state, send state, inbox unread count, bulk recipients.
 *
 * Composer draft is per-patient — keyed by patient_id so navigation away
 * preserves what staff was typing.
 *
 * bulkRecipients is set by the schedule bulk-select toolbar (Plan 12-08) BEFORE calling
 * openComposer(`bulk:<id>`, "bulk"). The composer reads this list when in bulk mode.
 * It is NOT persisted (clears on page reload — bulk sends should not survive a refresh).
 */
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { MessageChannel, MessagePurpose } from "@/types/messaging";

export interface BulkRecipientStub {
  patientId: string;
  appointmentId?: string;
  firstName: string;
  lastName?: string;
  preferredChannel: MessageChannel;
}

interface ComposerDraft {
  body: string;
  channel: MessageChannel;
  purpose: MessagePurpose;
  templateId: string | null;
  appointmentId: string | null;
}

interface MessagingState {
  // Composer
  isComposerOpen: boolean;
  composerPatientId: string | null;
  composerEntryPoint: "patient_header" | "schedule_kebab" | "inbox_reply" | "bulk" | null;
  drafts: Record<string, ComposerDraft>; // keyed by patient_id (or "bulk:<batch_uuid>")

  // Bulk recipients (populated by Plan 12-08's BulkSelectToolbar before openComposer)
  bulkRecipients: BulkRecipientStub[];

  // Send state (transient)
  isSending: boolean;
  lastError: string | null;

  // Inbox unread count (TopNav badge)
  inboxUnreadCount: number;

  openComposer(patientId: string | null, entryPoint: MessagingState["composerEntryPoint"]): void;
  closeComposer(): void;
  setDraft(patientId: string, partial: Partial<ComposerDraft>): void;
  clearDraft(patientId: string): void;
  setBulkRecipients(refs: BulkRecipientStub[]): void;
  clearBulkRecipients(): void;
  setSending(value: boolean): void;
  setError(error: string | null): void;
  setInboxUnreadCount(count: number): void;
}

const DEFAULT_DRAFT: ComposerDraft = {
  body: "",
  channel: "sms",
  purpose: "manual",
  templateId: null,
  appointmentId: null,
};

export const useMessagingStore = create<MessagingState>()(
  devtools(
    persist(
      (set) => ({
        isComposerOpen: false,
        composerPatientId: null,
        composerEntryPoint: null,
        drafts: {},
        bulkRecipients: [],
        isSending: false,
        lastError: null,
        inboxUnreadCount: 0,

        openComposer: (patientId, entryPoint) =>
          set({ isComposerOpen: true, composerPatientId: patientId, composerEntryPoint: entryPoint }),
        closeComposer: () =>
          set({ isComposerOpen: false, composerPatientId: null, composerEntryPoint: null,
                lastError: null, bulkRecipients: [] }),
        setDraft: (patientId, partial) =>
          set((s) => ({
            drafts: { ...s.drafts, [patientId]: { ...DEFAULT_DRAFT, ...s.drafts[patientId], ...partial } },
          })),
        clearDraft: (patientId) =>
          set((s) => {
            const next = { ...s.drafts };
            delete next[patientId];
            return { drafts: next };
          }),
        setBulkRecipients: (refs) => set({ bulkRecipients: refs }),
        clearBulkRecipients: () => set({ bulkRecipients: [] }),
        setSending: (value) => set({ isSending: value }),
        setError: (error) => set({ lastError: error }),
        setInboxUnreadCount: (count) => set({ inboxUnreadCount: count }),
      }),
      {
        name: "messaging-store",
        // Only persist drafts. Transient flags + bulkRecipients reset on reload.
        partialize: (s) => ({ drafts: s.drafts }),
      }
    ),
    { name: "messagingStore", enabled: process.env.NODE_ENV !== "production" }
  )
);
```

**Step 2.** Create `store/recallQueueStore.ts`:

```typescript
/**
 * Recall queue page state: candidate selections, last fetch result.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { RecallCandidate } from "@/types/messaging";

interface RecallQueueState {
  candidates: RecallCandidate[];
  selectedIds: Set<string>;
  isLoading: boolean;
  isSending: boolean;
  lastError: string | null;

  setCandidates(candidates: RecallCandidate[]): void;
  toggleSelect(patientId: string): void;
  selectAll(): void;
  clearSelection(): void;
  setLoading(value: boolean): void;
  setSending(value: boolean): void;
  setError(error: string | null): void;
}

export const useRecallQueueStore = create<RecallQueueState>()(
  devtools(
    (set, get) => ({
      candidates: [],
      selectedIds: new Set(),
      isLoading: false,
      isSending: false,
      lastError: null,

      setCandidates: (candidates) => set({ candidates }),
      toggleSelect: (patientId) =>
        set((s) => {
          const next = new Set(s.selectedIds);
          if (next.has(patientId)) next.delete(patientId);
          else next.add(patientId);
          return { selectedIds: next };
        }),
      selectAll: () => set((s) => ({ selectedIds: new Set(s.candidates.map((c) => c.patientId)) })),
      clearSelection: () => set({ selectedIds: new Set() }),
      setLoading: (value) => set({ isLoading: value }),
      setSending: (value) => set({ isSending: value }),
      setError: (error) => set({ lastError: error }),
    }),
    { name: "recallQueueStore", enabled: process.env.NODE_ENV !== "production" }
  )
);
```
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export const useMessagingStore" store/messagingStore.ts` returns 1
    - `grep -c "export const useRecallQueueStore" store/recallQueueStore.ts` returns 1
    - `grep -c "openComposer\\|closeComposer\\|setDraft\\|clearDraft" store/messagingStore.ts` returns at least 4
    - `grep -c "bulkRecipients" store/messagingStore.ts` returns at least 4 (interface field, state init, setBulkRecipients action, clear on closeComposer) — owned here per Warning 5 fix
    - `grep -c "setBulkRecipients\\|clearBulkRecipients" store/messagingStore.ts` returns at least 2
    - `grep -c "BulkRecipientStub" store/messagingStore.ts` returns at least 2 (type export + usage)
    - `grep -c "toggleSelect\\|selectAll\\|clearSelection" store/recallQueueStore.ts` returns at least 3
    - `grep -c "devtools" store/messagingStore.ts` returns at least 1
    - `grep -c "persist" store/messagingStore.ts` returns at least 1
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>2 Zustand stores with full action API. messagingStore owns bulkRecipients + BulkRecipientStub type (Plan 12-08 only consumes). messagingStore persists drafts only; both have devtools.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: 9 messaging UI components per UI-SPEC inventory</name>
  <files>
    components/messaging/MessageComposer.tsx,
    components/messaging/ChannelPreferenceChip.tsx,
    components/messaging/MessageStatusIcon.tsx,
    components/messaging/InboxItem.tsx,
    components/messaging/RecallQueueRow.tsx,
    components/messaging/OptOutWarning.tsx,
    components/messaging/WizardStep.tsx,
    components/messaging/MessageTimeline.tsx,
    components/messaging/CostCapBar.tsx
  </files>
  <read_first>
    - .planning/phases/12-crm-patient-engagement/12-UI-SPEC.md (lines 105-128 — full Component Inventory; lines 178-219 — interaction contracts; lines 220-251 — copywriting)
    - components/ui/button.tsx (variants reference)
    - components/ui/badge.tsx (variants — destructive, success, warning, info, secondary)
    - components/ui/dialog.tsx (Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter)
    - lib/messaging/composer-preview.ts (Task 1 — previewMessage)
    - store/messagingStore.ts (Task 2 — bulkRecipients now lives here)
    - types/messaging.ts (Plan 12-01)
  </read_first>
  <action>
**MessageComposer.tsx** — biggest component. Implements UI-SPEC § Interaction Contracts § MessageComposer (lines 178-191):

Props:
```ts
interface MessageComposerProps {
  patientId: string;
  patientFirstName: string;
  consents: ConsentFlags;
  templates: MessageTemplate[];          // pre-fetched
  defaultChannel?: MessageChannel;
  defaultPurpose?: MessagePurpose;
  appointmentId?: string;
  bulkRecipientCount?: number;           // > 0 => bulk mode (read from store via useMessagingStore in caller)
  onSend: (payload: { body: string; subject?: string; channel: MessageChannel;
                       templateId?: string; }) => Promise<void>;
  onClose: () => void;
}
```

Layout per UI-SPEC:
- Glass-card container, channel selector (SMS / Email / Both — or Both disabled in v1), template picker dropdown, editable body textarea (`.glass-input`), live preview row with token-replaced body, segment count in `.font-mono-data`, PHI soft-warn banner (when softWarn true), Send button (default variant, accent color), "Draft with AI" outline button below body.

Wiring:
- On every body keystroke, call `previewMessage` (memoized).
- Disable Send when `preview.blocked === true`. Show `OptOutWarning` instead of Send button.
- On Send click: spinner state, call `onSend()`, on success `onClose()`, on error show inline error message under composer (no close).
- Bulk mode (`bulkRecipientCount > 0`): show "Sending to X patients" header, mandatory preview Dialog before final send. Caller reads recipients via `useMessagingStore((s) => s.bulkRecipients)`.
- Draft with AI: opens an intent input + "Generate" button. Submits to `/api/messaging/ai-draft` via fetch; streams response into body field.

**ChannelPreferenceChip.tsx**:
```tsx
interface Props { consents: ConsentFlags; preferredChannel: "sms" | "email" | "both"; }
```
Renders a Badge (success when both enabled, warning when one disabled, destructive when fully opted out). Inline label "SMS+Email" / "SMS only" / "No SMS (opted out)".

**MessageStatusIcon.tsx** — table per UI-SPEC § lines 192-201:
```tsx
import { Clock, Check, CheckCheck, Eye, XCircle } from "lucide-react";
const ICON_MAP: Record<MessageStatus, { Icon: any; color: string; tooltip: (ts?: string, reason?: string) => string }> = {
  queued: { Icon: Clock, color: "var(--text-muted)", tooltip: () => "Queued — scheduled to send" },
  sent: { Icon: Check, color: "var(--text-secondary)", tooltip: (ts) => `Sent ${ts ?? ""}` },
  delivered: { Icon: CheckCheck, color: "var(--accent)", tooltip: (ts) => `Delivered ${ts ?? ""}` },
  read: { Icon: Eye, color: "var(--state-info)", tooltip: (ts) => `Opened ${ts ?? ""}` },
  failed: { Icon: XCircle, color: "var(--state-critical)", tooltip: (_, r) => `${r ?? "Failed"} — Resend Message?` },
  deferred: { Icon: Clock, color: "var(--state-warning)", tooltip: () => "Deferred to next allowed window" },
  cancelled: { Icon: XCircle, color: "var(--text-muted)", tooltip: () => "Cancelled" },
};
```
Renders icon + tooltip via title attribute (or Radix Tooltip if used elsewhere — check first). Failed state includes inline "Resend Message" link button (accent color).

**InboxItem.tsx**:
```tsx
interface Props {
  inbound: InboundMessage;
  patientName: string | null;
  isSelected: boolean;
  onClick: () => void;
}
```
Uses `.hover-row`. Layout: 8px accent unread dot (when `!isRead`), patient name in weight 600, body snippet (truncated 80 chars), classification badge (info variant, color-coded by class), timestamp in `.text-caption`.

**RecallQueueRow.tsx**:
```tsx
interface Props {
  candidate: RecallCandidate;
  isSelected: boolean;
  onSelectChange: (selected: boolean) => void;
  onSendOne: () => void;
  onRemove: () => void;
}
```
Table row with checkbox, patient name + last visit date, preferred channel chip, consent status (badge), per-row Send (outline sm) + Remove (ghost sm destructive).

**OptOutWarning.tsx**:
```tsx
interface Props { channel: MessageChannel; reason?: "OPT_OUT" | "PAUSED" | "INVALID_INPUT"; pausedUntil?: string; }
```
Inline `role="alert"` Badge (destructive variant) with copy from UI-SPEC line 233: `"This patient has opted out of [SMS / email]. Message blocked."`.

**WizardStep.tsx**:
```tsx
interface Props {
  stepNumber: number;
  totalSteps: number;
  title: string;
  active: boolean;
  completed: boolean;
  children: React.ReactNode;
  onContinue?: () => void;
  onBack?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  isContinueLoading?: boolean;
}
```
Glass-card with step number caption (`.text-caption uppercase tracking-widest`), title (`.text-subhead`), body content area `min-height: 200px`, footer with Back (ghost) + Continue (default). Active step: accent left-border. Completed: green checkmark on progress dot.

**MessageTimeline.tsx**:
```tsx
interface Props { messages: MessageLog[]; }
```
Vertical list with connector line between items. Each row uses `MessageStatusIcon` + body preview + timestamp + channel chip.

**CostCapBar.tsx**:
```tsx
interface Props { spentCents: number; capCents: number; }
```
Native `<progress>` element styled — green when < 80%, amber 80-99%, red 100%. Caption row: "$X used of $Y today".

**General rules:**
- All icon-only buttons MUST have `aria-label` (UI-SPEC § Accessibility line 277).
- All copy strings come verbatim from UI-SPEC § Copywriting Contract (lines 220-251).
- No raw hex colors — only CSS vars (UI-SPEC § Color line 81).
- Primary CTAs only use accent color (UI-SPEC § Color line 92 — reserved-for list).
- Use `cn()` from `@/lib/utils` for conditional classes.
- Touch targets ≥ 44px on Send button + recall queue per-row buttons (`min-h-[var(--touch-target)]`).
- Use existing `Card`, `Button`, `Badge`, `Dialog`, `DropdownMenu` — do NOT re-implement.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - 9 component files exist: `ls components/messaging/{MessageComposer,ChannelPreferenceChip,MessageStatusIcon,InboxItem,RecallQueueRow,OptOutWarning,WizardStep,MessageTimeline,CostCapBar}.tsx | wc -l` returns 9
    - `grep -c "export function MessageComposer\\|export const MessageComposer\\|export default" components/messaging/MessageComposer.tsx` returns at least 1
    - `grep -c "previewMessage" components/messaging/MessageComposer.tsx` returns at least 1
    - `grep -c "Draft with AI" components/messaging/MessageComposer.tsx` returns at least 1 (UI-SPEC copy)
    - `grep -c "useMessagingStore" components/messaging/MessageComposer.tsx` returns at least 1
    - `grep -c "Clock\\|Check\\|CheckCheck\\|Eye\\|XCircle" components/messaging/MessageStatusIcon.tsx` returns at least 5
    - `grep -c "var(--accent)\\|var(--state-critical)\\|var(--state-warning)\\|var(--state-info)" components/messaging/MessageStatusIcon.tsx` returns at least 4
    - `grep -c "role=\"alert\"" components/messaging/OptOutWarning.tsx` returns 1
    - `grep -c "min-height\\|min-h-\\[200px\\]" components/messaging/WizardStep.tsx` returns at least 1
    - `grep -c "aria-label" components/messaging/MessageComposer.tsx` returns at least 1
    - `grep -rE "#[0-9a-fA-F]{6}" components/messaging/ | wc -l` returns 0 (no raw hex colors)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>9 components match UI-SPEC inventory + interaction contracts. No raw hex colors. All copy verbatim from UI-SPEC. tsc clean.</done>
</task>

</tasks>

<verification>
1. `npx vitest run lib/messaging/` → exits 0; ≥15 tests pass
2. `npx tsc --noEmit` → exits 0
3. `find components/messaging -name "*.tsx" | wc -l` → 9 (no emails subdirectory components yet — those came in Plan 12-02 emails/)
4. `grep -rE "#[0-9a-fA-F]{6}" components/messaging/ --include='*.tsx'` → empty (CSS vars only)
5. `grep -c "bulkRecipients" store/messagingStore.ts` → ≥4 (store ownership confirmed; Plan 12-08 will not silently extend the store)
</verification>

<success_criteria>
- 3 utility libs covering segment count + PHI scan + composer preview, ≥15 vitest tests pass
- 2 Zustand stores with devtools (and persist on messagingStore drafts). messagingStore owns `bulkRecipients` + `BulkRecipientStub` type — declared once here so Plan 12-08 only consumes.
- 9 UI components matching UI-SPEC component inventory + interaction contracts
- All copy verbatim from UI-SPEC Copywriting Contract
- No raw hex colors anywhere
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-07-SUMMARY.md` documenting:
- Vitest test count by file
- Final list of UI components built
- Confirmation that bulkRecipients + BulkRecipientStub are exported from messagingStore (so Plan 12-08 can import directly)
- Any deviations from UI-SPEC interaction contracts (and why)
</output>
</output>
