# Phase 3: Scheduling - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a real appointment system: backend CRUD, status-driven workflow (scheduled → checked_in → in_exam → completed), and wire the schedule page to live data. Patients book through front desk; providers see their daily schedule and can start exams from checked-in appointments.

</domain>

<decisions>
## Implementation Decisions

### Schedule view layout
- Day view by default — vertical timeline showing time slots with appointment cards
- Cards show: patient name, appointment type, time, duration, status badge (color-coded)
- Status colors: scheduled=blue, checked_in=amber, in_exam=teal/accent, completed=green, cancelled=gray, no_show=red
- Provider filter dropdown at top (for multi-provider clinics)
- Date picker to navigate between days

### Check-in workflow
- Front desk clicks "Check In" on a scheduled appointment → status becomes `checked_in`
- Patient card moves to "Waiting" visual grouping or gets an amber badge
- Provider sees checked-in patients and clicks "Start Exam" → creates linked encounter, status becomes `in_exam`
- When encounter is finalized → appointment status auto-transitions to `completed`

### Appointment booking
- "New Appointment" button opens a modal/drawer
- Required fields: patient (searchable dropdown), provider, date/time, type, duration
- Duration defaults by type: comprehensive=30min, contact_lens=45min, follow_up=20min, urgent=30min, pediatric=45min
- Chief complaint field (optional, pre-seeds encounter)
- Cancel appointment: requires reason text, sets status to `cancelled`

### Encounter creation from appointment
- "Start Exam" on a checked-in appointment creates an Encounter with appointment_id FK set
- Redirects provider to the encounter page
- If encounter already exists for this appointment, navigate to it instead of creating a duplicate

### Claude's Discretion
- Exact card layout and spacing within the timeline
- Loading skeleton design for schedule page
- Empty state illustration when no appointments exist for selected day
- Whether to show a mini week overview or just day navigation arrows
- Appointment conflict detection approach (overlapping times)

</decisions>

<specifics>
## Specific Ideas

- The AppointmentStatus enum already has granular states (scheduled, confirmed, arrived, in_pretest, in_exam, completed, cancelled, no_show) — for MVP, use simplified flow: scheduled → checked_in (maps to "arrived") → in_exam → completed. The confirmed/in_pretest states can be used later.
- Glass card aesthetic consistent with the rest of the app — each appointment is a glass-card with status badge

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Appointment` model (backend/db/models/tenant/clinical.py:226): Fully defined with patient_id, provider_id, booked_by_id, type, status, start/end time, chief_complaint, internal_notes, cancellation_reason
- `AppointmentStatus` enum: scheduled, confirmed, arrived, in_pretest, in_exam, completed, cancelled, no_show
- `AppointmentType` enum: comprehensive_exam, contact_lens_exam, follow_up, urgent_care, pediatric_exam
- `Encounter` model already has `appointment_id` FK (unique=True, nullable, SET NULL on delete)
- `apiFetch()` (lib/api-client.ts): SSR-safe auth, retry, camelCase/snake_case conversion — ready for new endpoints
- `GlassCardSkeleton` component: shimmer loading skeleton
- `SaveStatusDot` component: ambient save indicator
- Glass card system (`.glass-card`, `.glass-card-hover`): consistent card styling
- `Badge` component with 7 variants including success, warning, destructive
- `Button` component with ghost/outline variants for action buttons

### Established Patterns
- Backend routes: FastAPI router with `resolve_staff` dependency, `require_permission` decorator, `log_action` audit
- Store pattern: Zustand with `loadX()` action that calls `apiFetch()`, devtools middleware
- BFF proxy: Next.js route handlers in `app/api/` forward to FastAPI with auth token
- Entitlement gating: `useEntitlements().has(Entitlement.SCHEDULING)` already guards the schedule page

### Integration Points
- Schedule page: `app/(tenant)/[tenantId]/schedule/page.tsx` — currently placeholder, ready to wire
- Sidebar: Already has Schedule nav link
- Encounter page: Already loads from encounter ID — just needs to receive appointments linking
- Dashboard: Could show today's appointment count in stat cards (defer to after core scheduling works)

</code_context>

<deferred>
## Deferred Ideas

- Appointment reminders (SMS/email) — requires vendor decision (Twilio/Resend), out of scope
- Recurring appointment templates — nice-to-have for future
- Multi-day/week calendar view — day view sufficient for MVP
- Drag-and-drop rescheduling — future UX enhancement

</deferred>

---

*Phase: 03-scheduling*
*Context gathered: 2026-03-05*
