---
phase: 12
plan: 07
slug: ui-primitives
type: execute
status: completed
completed_at: 2026-04-30
---

# Plan 12-07 — UI Primitives Summary

## Outcome

3 utility libs + 2 Zustand stores + 9 UI components shipped. 23 vitest tests
pass; type-check clean for all new files.

## Test Counts

| File | Tests | Status |
|------|------:|--------|
| `lib/messaging/sms-segments.test.ts` | 8 | ✓ |
| `lib/messaging/phi-scan.test.ts` | 8 | ✓ |
| `lib/messaging/composer-preview.test.ts` | 7 | ✓ |
| **Total** | **23** | **✓** |

## Components Built (9)

| Component | File | Notes |
|-----------|------|-------|
| MessageComposer | `components/messaging/MessageComposer.tsx` | Channel selector + template picker + body + live preview + Draft with AI + bulk confirm Dialog. Reads bulkRecipients via `useMessagingStore` selector. |
| ChannelPreferenceChip | `components/messaging/ChannelPreferenceChip.tsx` | Badge variants per consent state |
| MessageStatusIcon | `components/messaging/MessageStatusIcon.tsx` | 7 states (queued/sent/delivered/read/failed/deferred/cancelled) + inline Resend Message link on failed |
| InboxItem | `components/messaging/InboxItem.tsx` | Unread accent dot + classification badge + relative timestamp |
| RecallQueueRow | `components/messaging/RecallQueueRow.tsx` | Checkbox + per-row Send/Remove with `min-h-[var(--touch-target)]` |
| OptOutWarning | `components/messaging/OptOutWarning.tsx` | `role="alert"`, OPT_OUT/PAUSED/INVALID_INPUT branches |
| WizardStep | `components/messaging/WizardStep.tsx` | Accent left-border when active, `style={{minHeight: "200px"}}` body |
| MessageTimeline | `components/messaging/MessageTimeline.tsx` | Vertical connector line, MessageStatusIcon per row, empty-state copy verbatim from UI-SPEC |
| CostCapBar | `components/messaging/CostCapBar.tsx` | progressbar role, green→amber@80%→red@100% thresholds |

## Stores

`store/messagingStore.ts`:
- Owns composer draft per `patient_id`, `bulkRecipients`, `BulkRecipientStub` type, send transient state, and `inboxUnreadCount`.
- **`bulkRecipients` + `BulkRecipientStub` are exported here so Plan 12-08's BulkSelectToolbar only consumes them — does NOT extend the store.** (Warning 5 fix.)
- Persists drafts only via partialize. Clears `bulkRecipients` on `closeComposer()`.

`store/recallQueueStore.ts`:
- Recall page state — candidates, selectedIds (Set), isLoading/isSending, lastError.
- Actions: setCandidates, toggleSelect, selectAll, clearSelection, setLoading/Sending/Error.

## Utility Libs

- `lib/messaging/sms-segments.ts` — `countSmsSegments` mirrors backend `count_sms_segments` (GSM-7: 160/153, UCS-2: 70/67, unicode-safe via `Array.from`).
- `lib/messaging/phi-scan.ts` — `scanForPhi` mirrors backend `scrub_phi_for_operational_sms` denylist (DIAGNOSIS_TERMS, RX_TERMS, ICD10_RE, RX_VALUE_RE, ACUITY_RE, ADD_POWER_RE).
- `lib/messaging/composer-preview.ts` — `previewMessage` combines token replacement + consent gating + segment count + PHI soft-warn. PHI is soft-warn (NOT block); opt-out is hard block.
- `lib/messaging/index.ts` — barrel export of all symbols.

## UI-SPEC Compliance

- **No raw hex colors** in any of the 9 new components — all colors use CSS vars (`var(--accent)`, `var(--state-critical)`, etc). Pre-existing email templates in `components/messaging/emails/` legitimately use hex (HTML email clients cannot resolve CSS vars — out of scope for this plan).
- **All copy verbatim from UI-SPEC § Copywriting Contract:** opt-out block ("This patient has opted out of [SMS / email]. Message blocked."), PHI soft-warn ("This message may contain clinical details. SMS is not encrypted — review before sending."), Draft with AI button label, Send Message CTA, MessageTimeline empty state strings, "Send to [N] patients?" bulk dialog title.
- **Touch targets ≥ 44px** on Send button + recall queue per-row buttons via `min-h-[var(--touch-target)]`.
- **Accessibility**: `role="alert"` on OptOutWarning, `aria-label` on all icon-only buttons, `aria-pressed` on channel toggle, `aria-current="step"` on active WizardStep, `role="progressbar"` on CostCapBar.

## Deviations

- **MessageComposer**: in v1, "Both" channel option was deferred per UI-SPEC line 183 ("or Both disabled in v1") — rendered as two separate channel toggle buttons (SMS / Email) instead of a tri-state. Either is on at any time.
- **MessageStatusIcon tooltip**: used native `<title>` element inside the icon for screen readers + `aria-label` on the icon. Did NOT introduce a Radix Tooltip dependency — none was already used in the project for icon tooltips.
- **AI draft endpoint**: stubbed call to `/api/messaging/ai-draft` (POST). Plan 12-09 / settings phase will introduce the BFF route + backend handler. Composer correctly handles non-OK responses with inline error.

## Key-Links (acceptance)

- `MessageComposer.tsx` → `lib/messaging/composer-preview.ts` via `useMemo` on body changes — pattern `previewMessage` ✓
- `MessageComposer.tsx` → `store/messagingStore.ts` via `useMessagingStore` selector ✓

## Files Modified

```
lib/messaging/
├── index.ts                            (new)
├── sms-segments.ts                     (new)
├── sms-segments.test.ts                (new)
├── phi-scan.ts                         (new)
├── phi-scan.test.ts                    (new)
├── composer-preview.ts                 (new)
└── composer-preview.test.ts            (new)

store/
├── messagingStore.ts                   (new)
└── recallQueueStore.ts                 (new)

components/messaging/
├── MessageComposer.tsx                 (new)
├── ChannelPreferenceChip.tsx           (new)
├── MessageStatusIcon.tsx               (new)
├── InboxItem.tsx                       (new)
├── RecallQueueRow.tsx                  (new)
├── OptOutWarning.tsx                   (new)
├── WizardStep.tsx                      (new)
├── MessageTimeline.tsx                 (new)
└── CostCapBar.tsx                      (new)
```

## Commits

- `dbc084c` — Task 1: utility libs + tests
- `110aaae` — Task 2: Zustand stores
- _(this plan)_ — Task 3: 9 UI components

## Self-Check

- [x] All tasks executed
- [x] Each task committed individually
- [x] SUMMARY.md created in plan directory
- [x] vitest passes (23/23)
- [x] tsc clean for all new files
- [x] No raw hex in new components
- [x] bulkRecipients owned in messagingStore (6 references)
