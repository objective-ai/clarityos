# Phase 10: Encounter Workflow Redesign - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Restructure the encounter page into distinct pre-test and doctor exam modes with role-based visibility, relocate AI Scribe to bottom of page, and add a sticky floating mic button with pause capability. Expand preliminary test fields in VitalsForm. No new capabilities (scheduling, new clinical features) — this is a restructuring of existing encounter page components.

</domain>

<decisions>
## Implementation Decisions

### Pre-test mode layout
- Single long form with accordion sections (all expanded by default, collapsible to reduce clutter)
- Categories: "Visual Acuity", "Pupil & Motility", "Instrument Readings" as collapsible groups within VitalsForm
- Bottom tab bar is completely hidden in pre-test mode — single scrollable view with CC/HPI at top, vitals/preliminary fields below
- "Ready for Doctor" button at bottom of the pre-test form (not in EncounterBottomTabs)
- New preliminary fields to add: confrontation, motility, color vision, NPC, pupils (mm), autorefractor, keratometer, entrance Rx

### "All Normal" quick-fill
- Global "All Normal" button at top of the pre-test form — fills ALL preliminary fields with default normal values
- Per-section "Normal" buttons within each accordion section (e.g., "Normal" within Pupil & Motility fills just that group)
- Default normal values: PERRL true, no RAPD, confrontation "Full", motility "Full", color vision "Normal", NPC "Normal", cover test "Ortho"

### Doctor exam mode layout
- Pre-test data is NOT a collapsed summary card at top — doctor accesses pre-test data via the bottom tab bar (Complaint and Vitals tabs scroll to those sections)
- Section order below pre-test: Rx -> Exam -> Dx -> Plan -> AI Scribe (at bottom)
- All 6 bottom tabs visible in doctor mode: Complaint, Vitals, Rx, Exam, Dx, Plan — scroll-spy highlights current section
- Doctor can edit pre-test values with audit trail — edits logged as doctor overrides in existing AuditTrailSidebar

### AI Scribe positioning
- Full AiScribeWidget component relocated to bottom of page (after Plan section) in doctor exam mode
- Not visible in pre-test mode (technicians don't see it)
- Same functionality as current widget — just repositioned

### Sticky floating mic button
- Position: fixed, bottom-right, 80px above bottom tab bar
- Only visible in doctor exam mode (encounter status `in_exam` + user role `doctor` or `owner`)
- Three states: idle, recording (pulse animation), paused
- Tap toggles between recording and paused (privacy pause for private conversations)
- Separate "Done/Stop" action to end recording and submit for AI processing
- Not visible to technicians or in pre-test mode

### Role transitions & permissions
- Tab visibility driven by encounter status + user role (already partially implemented via EncounterStatus)
- Status flow uses existing `pre_test -> in_exam -> finalized` from encounterStore
- Revert-to-pretest already exists in EncounterBottomTabs — keep current behavior

### Claude's Discretion
- Exact accordion animation/transition style
- Mic button pulse animation design
- Pause/resume icon choices
- How "Done" stop action is presented (button in expanded mic area, or icon on the FAB itself)
- Exact positioning offsets for mobile vs desktop
- How doctor override edits are visually indicated in the vitals form

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Encounter page
- `app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx` — Main encounter page, all section rendering, current AiScribeWidget position (L570)
- `components/encounter/EncounterBottomTabs.tsx` — Tab definitions, status step indicator, action buttons, scroll-spy observer
- `store/encounterStore.ts` — EncounterState, EncounterStatus (`pre_test | in_exam | finalized`), advanceStatus, NEXT_STATUS mapping

### Vitals & preliminary
- `components/encounter/VitalsForm.tsx` — Current vitals form (IOP, VA, BP, PERRL, RAPD, cover test, tech notes)
- `types/vitals.ts` — VitalsDraft interface (fields to expand), blankVitalsDraft helper
- `store/vitalsStore.ts` — Vitals state management, setField, save logic

### AI Scribe
- `components/encounter/AiScribeWidget.tsx` — Full scribe widget (SOAP display, accept/reject, streaming)
- `hooks/useAiScribe.ts` — Scribe hook (recording, SSE streaming, JSON parsing)

### Auth & roles
- `types/session.ts` — StaffRole type (`doctor | technician | receptionist | owner`), AppSession
- `hooks/useEntitlements.ts` — Entitlement checks, role-based feature gating
- `components/auth/PermissionGate.tsx` — Role-gated rendering wrapper

### Audit trail
- `components/encounter/AuditTrailSidebar.tsx` — Existing audit trail (will log doctor overrides of pre-test values)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EncounterBottomTabs`: Already has status steps (pre_test, in_exam, finalized) and action buttons — modify tab visibility per mode
- `encounterStore.advanceStatus()`: Handles `pre_test -> in_exam` transition — "Ready for Doctor" calls this
- `VitalsForm`: Existing form to extend with new preliminary fields — uses `setField(encounterId, field, value)` pattern
- `AiScribeWidget`: Full-featured widget that just needs repositioning in the JSX tree
- `useAiScribe` hook: Recording/streaming logic already built — mic button will call into this
- `PermissionGate`: Wrap sections that are role-gated

### Established Patterns
- Dynamic imports with `next/dynamic` for all encounter sub-components (lazy loading)
- Zustand stores with `draft/committed` dual-state pattern for vitals
- 1.5s debounce save + flush on blur for form fields
- `glass-card-accent` CSS class for form cards
- `IntersectionObserver` scroll-spy in EncounterBottomTabs for auto-highlighting active tab

### Integration Points
- `VitalsDraft` type in `types/vitals.ts` — needs new fields added
- Backend vitals schema (`backend/schemas/`) — needs matching fields for new preliminary data
- Backend vitals DB model — needs new columns for confrontation, motility, color_vision, npc, pupils_mm, autorefractor, keratometer, entrance_rx
- `blankVitalsDraft()` — needs updated defaults for new fields
- `vitalsStore.ts` save/load — needs to map new fields to/from API

</code_context>

<specifics>
## Specific Ideas

- Pre-test mode should feel like a focused technician workstation — no distractions from doctor-only sections
- Doctor should be able to quickly glance at pre-test data via tab navigation, not be forced to scroll past it
- Pause on mic button is for private conversations (e.g., patient discussing sensitive topics doctor doesn't want recorded)
- "All Normal" is a huge time-saver for routine visits — most pre-test fields are normal for healthy patients

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-encounter-workflow-redesign*
*Context gathered: 2026-03-27*
