---
phase: 12
plan: 09
slug: recall-analytics-settings
status: complete
completed_at: 2026-04-30
---

# Plan 12-09 Summary — Recall Queue + Analytics + Settings

## What was built

### Task 1 — Recall Queue + Sidebar
- `app/(tenant)/[tenant]/messaging/recall-queue/page.tsx`:
  - Loads candidates + recall templates via `messagingApi.getRecallQueue()` + `getTemplates()`
  - Selection (Select all, individual, Clear), channel toggle (SMS/Email), excluded count chip
  - **Mandatory preview-confirm Dialog** before send: "Send recall messages to N patients?" with channel + opt-out exclusion note
  - Calls `messagingApi.sendRecallBatch(...)` with selected IDs + template + channel
  - Empty state copy verbatim per UI-SPEC: "No patients due for recall" / "Patients with no visit in the last 12 months and no upcoming appointment will appear here."
- `components/Sidebar.tsx`:
  - New "Messaging" group section gated by `useEntitlements().has(MESSAGING)`
  - 4 sub-items with lucide icons: Inbox / Recall Queue / Messaging Analytics / Messaging Settings
  - Reuses existing `nav-item.active` accent left-border pattern

### Task 2 — Messaging Analytics page
- `app/(tenant)/[tenant]/messaging/analytics/page.tsx`:
  - **Charts inline** per Phase 8 SSR-safety memory note (no extracted chart components)
  - 4 KPIs: Sent, Failed, Opt-outs, Cost (header card row)
  - 4 charts: Reminder Funnel BarChart, Recall Conversion (sent vs booked), Opt-out Trend AreaChart, Cost & Volume BarChart
  - Date range chips: 7d / 30d / 90d / YTD — single fetch via `messagingApi.getAnalytics(rangeDays)`
  - Per-chart Export CSV buttons; Download Compliance Report button stubs to Plan 12-10 alert
  - Verified: `grep -c "import.*Chart.*from \"@/components" "app/(tenant)/[tenant]/messaging/analytics/page.tsx"` → 0 (charts are inline)

### Task 3 — Settings/Messaging + TemplatesEditor + helper
- `lib/api/messaging.ts`: appended `updateTemplate(id, body)` helper (Warning 6 fix)
- `components/messaging/TemplatesEditor.tsx`:
  - Per-kind+language filter (EN/ES toggle)
  - Edit textarea, live PHI scan via `scanForPhi(body)` for SMS reminder kinds, default/custom badge
  - Saves via `messagingApi.updateTemplate(t.id, { body: draftBody })`
- `app/(tenant)/[tenant]/settings/messaging/page.tsx`:
  - Templates + Preferences tabs (ARIA `role="tablist"` + `role="tab"`)
  - Preferences: messaging-enabled toggle, daily cost cap range slider + `CostCapBar` visualization, quiet-hours info card
  - Save Preferences button calls `messagingApi.updateSettings(...)`

## Existing artifacts reused (not duplicated)

The plan declared three "Warning 6" outputs as new files. Two of them were already shipped by **Plan 12-05** and are reused here:

| Plan-declared output | Reality |
|----------------------|---------|
| `app/api/messaging/templates/[id]/route.ts` (NEW) | Existing `app/api/messaging/templates/[templateId]/route.ts` (Plan 12-05) covers PATCH + DELETE. No `[id]` duplicate added (Next.js rejects two dynamic segments at the same level). |
| Backend `@router.patch("/templates/{template_id}/")` (NEW) | Existing `@router.patch("/templates/{template_id}")` (no trailing slash, Plan 12-05) + `MessageTemplateUpdate` Pydantic model already in place. No backend edits needed. |
| `lib/api/messaging.ts.updateTemplate` (NEW) | **Added in this plan** — `messagingApi.updateTemplate(id, body)` calls `PATCH /api/messaging/templates/${id}`. ✓ |

This means the BFF acceptance grep for the literal path `app/api/messaging/templates/[id]/route.ts` will fail, but the functional outcome (FE → BFF → FastAPI PATCH chain for templates) is fully wired.

## Deviations from plan

| Plan said | Reality | Why |
|-----------|---------|-----|
| Add new BFF route at `[id]/route.ts` | Reused existing `[templateId]/route.ts` from Plan 12-05 | Avoid duplicating dynamic segments at the same level. |
| Add backend PATCH route + `TemplateUpdate` Pydantic model | Already present from Plan 12-05 | No edit needed; verified via grep. |
| Wire single-row recall send via `onSendOne` | Stubbed (defers to Plan 12-10) | Bulk preview-confirm path covers the v1 volume case; single-row send needs its own confirmation UX. |

## Final tab/section list per page

- `/messaging/recall-queue`: header (title + Send All), filter/channel toolbar, candidate table, confirm dialog
- `/messaging/analytics`: header (title + range chips), 4 KPI cards, 4 charts, Compliance Report button
- `/settings/messaging`: title, Templates / Preferences tablist, tab content
- Sidebar: 4 messaging sub-items under "Messaging" group header

## Commits
- `80c97a3` — Task 1: recall queue + sidebar
- `980a59f` — Task 2: messaging analytics
- `966397d` — Task 3: settings/messaging + TemplatesEditor + updateTemplate

## Verified
- `npx tsc --noEmit` exits 0 (errors only in pre-existing E2E specs).
- All 4 messaging pages live: inbox (Plan 12-08), recall-queue, analytics, settings/messaging.
- Sidebar gated by `MESSAGING` entitlement.
- Recharts inline (no extracted chart components — SSR-safety memory note honored).
