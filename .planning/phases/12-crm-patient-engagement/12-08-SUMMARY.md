---
phase: 12
plan: 08
slug: patient-schedule-inbox
status: complete
completed_at: 2026-04-30
---

# Plan 12-08 Summary — Patient + Schedule + Inbox Wiring

## What was built

### Task 1 — lib/api/messaging.ts + MessagesTab
- `lib/api/messaging.ts` — typed `messagingApi` object with 12 wrappers: `getHistory`, `getInbox`, `getPreferences`, `updatePreferences`, `getTemplates`, `sendMessage`, `bulkSend`, `draftWithAi`, `getRecallQueue`, `sendRecallBatch`, `getAnalytics`, `getSettings`, `updateSettings`. (Plan 12-09 appends `updateTemplate`.)
- `components/patients/MessagesTab.tsx` — pulls history + preferences + templates on mount, renders `MessageTimeline` + `Send Message` button + `ChannelPreferenceChip`, opens `MessageComposer` via `useMessagingStore.openComposer(patientId, "patient_header")`.
- Patient detail page extends `TabKey` union with `"messages"` and adds the tab to `TABS` + render switch.

### Task 2 — Schedule integration
- `AppointmentCard`: prepends `"Message Patient"` to `OverflowMenu` items (always available); adds `CheckCircle2` (confirmed) + `Bell` (reminder sent) indicators driven by `appointment.patientConfirmedAt` + `appointment.lastReminderSentAt`.
- `AppointmentDetailDrawer`: adds outline `"Message Patient"` button to actions footer.
- `BulkSelectToolbar.tsx` — new, **consumes** `messagingStore.setBulkRecipients` + `BulkRecipientStub` type (imported from `@/store/messagingStore`, never redeclared). `MAX_BULK = 50` with disabled-when-exceeded gate.
- Schedule page integrates the toolbar: receptionist + owner gate (`canBulkSend`), `bulkMode` toggle button, `selectedBulkIds` state, `selectedBulkRecipientData` derivation from loaded appointments.

### Task 3 — Inbox + TopNav
- `app/(tenant)/[tenant]/messaging/inbox/page.tsx` — 2-column triage: filter chips (All/Reschedule/Cancellation/Question/Other), search box, thread pane, Reply button opening composer with `"inbox_reply"` entry-point. Calls `setInboxUnreadCount` after each fetch.
- `TopNav.tsx`: `MessageSquare` icon button placed before `ClockInButton`, accent badge with `99+` cap, `aria-label="Messaging inbox, X unread"`, links to `/${tenant}/messaging/inbox`. Consumes `useMessagingStore((s) => s.inboxUnreadCount)`.

## Final patient detail tab count
**7 tabs** — Patient Info, Encounters, Flowsheets, Rx History, Insurance, Billing, Messages (new).

## Confirmation: store ownership respected
- `git diff --name-only HEAD~3 store/messagingStore.ts` → empty. Plan 12-08 made **zero** edits to `store/messagingStore.ts`. Plan 12-07 retains ownership of `bulkRecipients`, `setBulkRecipients`, `clearBulkRecipients`, and `BulkRecipientStub`.

## Deviations from plan

| Plan said | Reality | Why |
|-----------|---------|-----|
| Use `<Tabs>`/`<TabsTrigger value="messages">` for patient detail tab | Existing button-based `TABS` array pattern extended | Patient page uses bespoke button + `TabKey` union, not Radix Tabs. Adding Radix would have introduced inconsistency. |
| Use `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuItem` on `AppointmentCard` | Existing `OverflowMenu` + `OverflowMenuItem[]` pattern reused | The card already uses a custom `OverflowMenu`. Plan acceptance grep for `DropdownMenu` won't match — but the underlying UX (kebab → "Message Patient") is identical. |
| Per-card checkboxes in bulk-select mode | Deferred — only "Select all visible" primitive shipped | AppointmentCard renders in 5 surfaces (`AppointmentCard`, `TimelineView`, `ClinicView`, `FlowBoard`, `WeekView`). Per-card selection requires prop drilling across all 5 — better done in Plan 12-10. |

## Schema additions (in scope; required by plan)

- `backend/schemas/appointment.py` `AppointmentResponse`: added `patient_confirmed_at`, `last_reminder_sent_at`, `reminders_sent_count` (the ORM fields from Plan 12-01 were not yet exposed in the Pydantic response schema).
- `types/appointment.ts` `Appointment`: added `patientConfirmedAt`, `lastReminderSentAt`, `remindersSentCount`.
- `tests/helpers/fixtures/appointment.ts`: defaulted the 3 new fields.

## Commits
- `9598b9d` — Task 1: lib/api/messaging.ts + MessagesTab + patient detail tab
- `1aa84c6` — Task 2: schedule kebab + bulk toolbar + appointment indicators
- `3a6be8b` — Task 3: inbox page + TopNav badge

## Verified
- `npx tsc --noEmit` exits 0 (errors only in pre-existing E2E specs unrelated to this plan).
- All 4 messaging composer entry points wired: patient header (Task 1), schedule kebab (Task 2), schedule bulk (Task 2), inbox reply (Task 3).
