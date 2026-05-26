# Roadmap: ClarityOS EHR

## Overview

ClarityOS is a production optometry EHR built on Next.js 14, FastAPI, and PostgreSQL with multi-tenant auth via Supabase. Phases 1-10 delivered the core clinical platform: auth, real API integration, scheduling, billing/claims, patient profiles, optical handoff, patient intake, analytics, and an encounter workflow redesign with pre-test/doctor mode split. Current focus is hardening for pilot launch with a solo optometrist, then expanding with the retail/optical revenue chain (CRM → Inventory → Optical Orders → POS), followed by reporting, audio AI scribe, and mobile UX.

---

## V1 Milestone (Complete)

All 7 phases complete. Full details archived in phase directories.

| # | Phase | Completed |
|---|-------|-----------|
| 1 | Security & Auth Foundation | 2026-03-05 |
| 2 | API Integration & HIPAA Compliance | 2026-03-05 |
| 3 | Scheduling | 2026-03-05 |
| 4 | Billing & Coding | 2026-03-06 |
| 5 | Patient Profile | 2026-03-06 |
| 6 | Optical Handoff | 2026-03-06 |
| 7 | Patient Intake | 2026-03-07 |

---

## V2 Milestone (In Progress)

Build order: 8 → 9 → 9.1 → 9.2 → 10 → 10.1 → 10.2 → 10.3 → 10.4 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18

### Progress

| # | Phase | Plans | Status | Completed |
|---|-------|-------|--------|-----------|
| 8 | Analytics Dashboard | 3/3 | Complete | 2026-03-12 |
| 9 | Claims Basics | 8/8 | Complete | 2026-03-14 |
| 9.1 | Security & Integration Hardening | 2/2 | Complete | 2026-03-26 |
| 9.2 | Requirements & Traceability Repair | 1/1 | Complete | 2026-03-27 |
| 10 | Encounter Workflow Redesign | 3/3 | Complete | 2026-03-27 |
| 10.1 | 3/3 | Complete   | 2026-04-03 | — |
| 10.2 | 8/8 | Complete    | 2026-04-04 | — |
| 10.3 | 6/7 | Complete    | 2026-04-29 | — |
| 10.4 | 7/7 | Complete   | 2026-04-21 | — |
| 11 | 4/4 | Complete    | 2026-04-21 | — |
| 12 | 7/11 | In Progress|  | — |
| 13 | 14/16 | In Progress|  | — |
| 14 | 7/12 | In Progress|  | — |
| 15 | Point of Sale | 0/? | Not started | — |
| 16 | Reporting & Exports | 0/? | Not started | — |
| 17 | AI Scribe Audio | 0/? | Not started | — |
| 18 | Mobile/Tablet UX | 0/? | Not started | — |

---

### Phase 10.1: Insurance Revamp (INSERTED)
**Goal:** Enrich patient insurance with missing fields (copay, auth code, eligibility status, position, active flag) to match production EHR standards. No document upload — that moves to Phase 14.1.
**Depends on:** Phase 9 (insurance infrastructure), Phase 10
**Requirements:** [INS-R01, INS-R02, INS-R03, INS-R04, INS-R05, INS-R06, INS-R07, INS-R08, INS-R09]
**Plans:** 3/3 plans complete

Plans:
- [ ] 10.1-01-PLAN.md — Backend: migration + ORM + schemas + TS types (7 new columns, partial unique constraint)
- [ ] 10.1-02-PLAN.md — Frontend: InsuranceTab card redesign + form modal extension + active/inactive separation
- [ ] 10.1-03-PLAN.md — Surface integration: TopNav chips + schedule badges + billing copay

### Phase 10.2: Revamp Schedule & Booking Page (INSERTED)
**Goal:** Modernize schedule UI with week strip navigation, 5 view modes (List/Timeline/Clinic/Flow/Week), appointment detail drawer, booking drawer with slot picker, Flow board Kanban, Week view grid, and public patient booking wizard.
**Depends on:** Phase 10
**Requirements:** [SCH-01, SCH-02, SCH-03, SCH-04, SCH-05, SCH-06, SCH-07, SCH-08, SCH-09, SCH-10, SCH-11, SCH-12, SCH-13, SCH-14, SCH-15, SCH-16]
**Plans:** 8/8 plans complete

Plans:
- [ ] 10.2-01-PLAN.md — Foundation: shared types, schedule utilities with tests, WeekStrip, page shell (5-mode toggle, role defaults, drawer state)
- [ ] 10.2-02-PLAN.md — Backend: checked_in_at ORM/schema/auto-set + date range query + store fetchWeekAppointments
- [ ] 10.2-03-PLAN.md — Appointment card redesign (wait time, intake icon, click handler) + AppointmentDetailDrawer
- [ ] 10.2-04-PLAN.md — BookingDrawer with slot picker grid replacing BookAppointmentModal
- [ ] 10.2-05-PLAN.md — FlowBoard (Kanban + 30s polling) + WeekView (7-day grid)
- [ ] 10.2-06-PLAN.md — Public booking page polish: light theme, 5-step wizard
- [ ] 10.2-07-PLAN.md — Gap closure: fix tab visibility, drawer render gate, drawer close controls
- [ ] 10.2-08-PLAN.md — Gap closure: fix public booking schema + error display

### Phase 10.3: Error Monitoring & System Status (INSERTED)
**Goal:** Sentry integration (FastAPI + Next.js) with HIPAA-safe PHI scrubber + OWNER-only Admin System Status page (service health, recent errors, 7-day uptime) + TopNav health dot
**Depends on:** Phase 10
**Requirements:** [PHASE-10.3-CONTEXT]
**Plans:** 7/7 plans complete

Plans:
- [ ] 10.3-01-PLAN.md — PHI scrubber (JS + Python) with TDD: deny-list, URL query scrub, clinical body-drop, ignore rules
- [ ] 10.3-02-PLAN.md — Sentry Next.js 14 wiring: client/server/edge configs, instrumentation hook, withSentryConfig
- [ ] 10.3-03-PLAN.md — FastAPI sentry_sdk.init with composed before_send; init in main.py before middleware
- [ ] 10.3-04-PLAN.md — SystemHealthSample ORM + Alembic 0015 + /api/system/health endpoint + 60s self-pinger + BFF proxy
- [ ] 10.3-05-PLAN.md — /api/system/uptime (7-day rolling SQL) + /api/system/errors BFF proxy to Sentry REST (20s cache, OWNER gate)
- [ ] 10.3-06-PLAN.md — VIEW_SYSTEM_STATUS permission + Admin System section with three panels + TopNav HealthDot
- [ ] 10.3-07-PLAN.md — Playwright e2e + runbook docs + human HIPAA verification checkpoint

### Phase 10.4: Staff Scheduling (INSERTED)
**Goal:** Full provider availability management — weekly hours per staff, blocked time (holidays/lunch), shift overview grid, clock-in/clock-out with attendance log and CSV payroll export. Admin "Schedule" tab + persistent clock-in button in TopNav.
**Depends on:** Phase 10.3
**Requirements:** TBD (to be mapped during /gsd:verify-work — new STAFF-SCHED-* IDs)
**Plans:** 7/7 plans complete

Plans:
- [ ] 10.4-01-PLAN.md — Backend foundation: ORM models (StaffWeeklySchedule, StaffBlockedTime, StaffAttendance) + BlockType enum + permissions + Pydantic schemas + Alembic 0014
- [ ] 10.4-02-PLAN.md — FastAPI routes: schedule CRUD, blocked-time CRUD, availability grid, clock-in/out, clock-status, attendance list, CSV export (+ register in main.py)
- [ ] 10.4-03-PLAN.md — Public booking integration: source availability from DB schedule + filter blocked times
- [ ] 10.4-04-PLAN.md — BFF proxy subtree under app/api/staff-schedule/ + types/staffSchedule.ts with camelize transforms
- [ ] 10.4-05-PLAN.md — Admin Schedule tab: provider selector, weekly editor, blocked-times panel, shift overview, attendance log, CSV export button
- [ ] 10.4-06-PLAN.md — TopNav ClockInButton component: clock-in/out pill with elapsed timer and 409 re-sync
- [ ] 10.4-07-PLAN.md — Verification: Playwright e2e (admin schedule + clock flow), pytest timezone helper, tsc clean

### Phase 11: Marketing Pages (/features, /pricing, /compare)
**Goal:** Build the public marketing site pages — feature highlights, pricing tiers, and competitor comparison (vs RevolutionEHR, Barti, EyeCloudPro) — using the Trust & Authority design system (light mode, #2563EB primary, #F97316 CTA, Lexend/Source Sans 3).
**Depends on:** Phase 10.x (LandingPage + MarketingNav + MarketingFooter already built)
**Success Criteria:**
  1. /features page with icon grid, clinical workflow highlights, and demo CTA
  2. /pricing page with 3 placeholder tiers and "Schedule a Demo" orange CTA
  3. /compare page with comparison table vs RevolutionEHR, Barti, and EyeCloudPro
  4. All pages use shared MarketingNav and MarketingFooter
**Plans:** 4/4 plans complete

### Phase 12: CRM & Patient Engagement
**Goal**: Multi-channel patient communications — automated SMS+email appointment reminders (3-touch cadence at 7d/72h/24h), staff-approved 12-month recall queue, manual messaging at 4 entry points (patient header, schedule kebab, inbox reply, bulk-select), inbound triage with AI classification, HIPAA/TCPA compliance audit trail, OWNER-gated compliance PDF, and 7-step onboarding wizard.
**Depends on**: Phase 3 (appointment data), Phase 2 (patient contact info)
**Requirements:** [CRM-01, CRM-02, CRM-03, CRM-04, CRM-05, CRM-06, CRM-07, CRM-08, CRM-09, CRM-10, CRM-11, CRM-12, CRM-13, CRM-14, CRM-15, CRM-16, CRM-17, CRM-18, CRM-19, CRM-20]
**Success Criteria:**
  1. Appointment reminders send automatically 24h before via SMS/email based on patient preference
  2. Staff can manually send a message from patient detail or schedule view
  3. Recall reminders triggered for patients with no appointment in last 12 months
  4. Patients can opt out of SMS; opt-out stored and respected
  5. Message history (sent, delivered, failed) viewable per patient
**Plans:** 7/11 plans executed

Plans:
- [ ] 12-00-wave0-foundation-PLAN.md — Install Twilio/Resend/Svix/freezegun deps; create messaging test scaffold (conftest, fixtures, PHI corpus, Playwright stubs); Resend BAA HIPAA checkpoint
- [ ] 12-01-schema-orm-PLAN.md — Alembic 0016: 4 new tables (message_log, message_template, recall_queue_run, inbound_message), AuditAction enum +18 values, appointment columns, recall query indexes; Pydantic + TS types; messaging entitlement; CRM-01..CRM-20 in REQUIREMENTS.md
- [ ] 12-02-provider-clients-PLAN.md — Twilio + Resend SDK adapters with lazy init; signature validators (Twilio + Svix); React Email templates (Reminder/Recall/Manual); BFF render-template endpoint; PHI scrubber + segment counter
- [ ] 12-03-sender-service-PLAN.md — Single-choke-point dispatch() service with 8-step guard chain (recipient resolver, opt-out, quiet hours DST-safe, PHI scrub, cost cap, MessageLog + audit in primary TXN); minor → guardian routing; household bundling
- [ ] 12-04-webhooks-PLAN.md — Twilio + Resend webhook handlers with signature verification, internal HMAC seal, idempotent monotonic-status updates, STOP keyword DB sync, asyncio.create_task non-blocking classifier; middleware /api/webhooks/ allowlist
- [ ] 12-05-routes-bff-PLAN.md — 13+ FastAPI endpoints + 10 BFF proxies (send, bulk-send, recall-queue, recall send-all, history, inbox, analytics aggregate, ai-draft, templates CRUD, settings, preferences); bulk_send service with 50-cap + 1msg/sec throttle; bounce-fallback hook
- [ ] 12-06-scheduler-classifier-PLAN.md — Reminder cadence (7d/72h/24h) with idempotency counter; asyncio scheduler loop with pg_advisory_lock + env gate (mirrors Phase 10.3 self-pinger); Claude Haiku inbound classifier (6 labels, exception-safe)
- [ ] 12-07-ui-primitives-PLAN.md — 9 messaging UI components (MessageComposer, ChannelPreferenceChip, MessageStatusIcon, InboxItem, RecallQueueRow, OptOutWarning, WizardStep, MessageTimeline, CostCapBar); 2 Zustand stores; 3 vitest-tested utility libs (sms-segments, phi-scan, composer-preview)
- [ ] 12-08-patient-schedule-inbox-PLAN.md — Patient detail Messages tab; schedule kebab + bulk-select toolbar (50-cap); AppointmentCard reminder/confirmed indicators; AppointmentDetailDrawer Message button; global Inbox page; TopNav unread badge; lib/api/messaging.ts client
- [ ] 12-09-recall-analytics-settings-PLAN.md — Recall queue page with mandatory preview-confirm Dialog; analytics page with 4 inline Recharts (mirrors Phase 8 SSR pattern); Settings/Messaging page (Templates + Preferences tabs); Sidebar messaging entitlement gate
- [ ] 12-10-onboarding-compliance-e2e-PLAN.md — 7-step Onboarding Wizard with localStorage persistence; 4 onboarding endpoints (provision-number, seed-templates, test-send, activate); Compliance Report PDF (reportlab); 4 Playwright @messaging E2E specs; 12-VERIFICATION.md; HIPAA-critical phase closure checkpoint

### Phase 13: Retail Inventory
**Goal**: Product catalog of frames, lenses, and contacts with stock tracking, linked to optical orders
**Depends on**: Phase 6 (Optical Handoff — Rx data and optical queue)
**Success Criteria:**
  1. Admin can add, edit, and deactivate products with brand, model, price, and stock quantity
  2. Optical staff can create an order from a patient's Rx, selecting products
  3. Placing an order decrements stock; low-stock items show warning badge
  4. Inventory page shows stock levels filterable by product type
  5. Patient detail page shows order history with status and delivery date
**Plans:** 14/16 plans executed (15 = gap closure for retail_pos add-on wiring)

Plans:
- [ ] 13-00-PLAN.md — Wave 0 test foundation: pytest stubs (atomicity, lifecycle, rollup, permissions, contract, seed) + conftest factories + vitest stubs + Playwright spec skeleton (covers INV-13)
- [ ] 13-01-PLAN.md — Alembic 0017 + 4 ORM classes (Product, OpticalOrder, OpticalOrderLineItem, InventoryTransaction) + 9 AuditAction values + Encounter.optical_orders back-rel (INV-06, INV-07, INV-09, INV-18)
- [ ] 13-02-PLAN.md — 5 ClinicalAction values + PERMISSION_MATRIX rows + retail_pos entitlement (BE+FE) explicitly NOT in PLAN_FEATURES (INV-14, INV-19)
- [ ] 13-03-PLAN.md — Pydantic schemas (ProductCreate/Update/Response, ReceiveStockRequest, AdjustStockRequest, OpticalOrderCreate/Response/PlaceResponse) + TS types (Product, OpticalOrder + payloads); 15-key + 13-key by_alias contract (INV-13)
- [ ] 13-04-PLAN.md — BE inventory routes: list+CRUD+receive+adjust with primary-TXN audit + InventoryTransaction in same db.commit() (INV-01, INV-08, INV-18)
- [ ] 13-05-PLAN.md — BE optical-order routes: create/list/detail/place/cancel/dispense; with_for_update() row-lock on Product; zero-stock soft-block returns 200+warnings; primary-TXN atomicity (INV-02, INV-03, INV-10, INV-11, INV-12, INV-18)
- [ ] 13-06-PLAN.md — 9 BFF proxy routes (4 inventory, 5 optical-orders) via proxyToFastAPI with trailing-slash upstream URLs (INV-01, INV-02, INV-08, INV-10)
- [ ] 13-07-PLAN.md — Encounter optical-queue rollup: extend optical.py queue loop with selectinload(Encounter.optical_orders) + computed_status (any-placed → in_progress, all-dispensed → dispensed, else fallback) (INV-16)
- [ ] 13-08-PLAN.md — backend/seed_db.py extended with _seed_retail_inventory: 10 frames + 5 contacts, idempotent guard on (tenant_id, sku, is_active=true) (INV-17)
- [ ] 13-09-PLAN.md — inventoryStore (raw fetch + getAuthHeaders to opt out of camelizeKeys for Product.attributes JSONB per Pitfall 1) + Inventory admin page (Frames|Contacts tabs, filter row, low-stock badge) + Sidebar nav gated on RETAIL_POS (INV-04, INV-20)
- [ ] 13-10-PLAN.md — ProductFormModal (create+edit, type-aware attribute fields with snake_case JSONB keys) + ReceiveStockModal + AdjustStockModal + page wire-in (INV-01, INV-08)
- [ ] 13-11-PLAN.md — opticalOrderStore (apiFetch — top-level fields camelize-clean; placeOrder returns warnings) + OrderDetailDrawer 480px slide (mirrors AppointmentDetailDrawer: ESC + backdrop + hydration-safe; cancel CTA gated on owner/admin AND non-terminal status) (INV-15)
- [ ] 13-12-PLAN.md — OrdersTab + CreateWalkInOrderModal (auto-place option surfaces zero-stock warnings) + register Orders tab on patient detail page gated on RETAIL_POS (INV-05)
- [ ] 13-13-PLAN.md — Wire OpticalQueueCard with Create Order CTA gated on RETAIL_POS + role; opens CreateWalkInOrderModal with encounterId pre-filled; queue refresh on close picks up 13-07 rollup (INV-02)
- [ ] 13-14-PLAN.md — Implement 6 Playwright scenarios (admin CRUD, place flow, filters, patient orders+drawer+cancel, entitlement gate, zero-stock soft-block) covering 5 ROADMAP success criteria + INV-12 + INV-14

### Phase 14: Optical Order Configuration
**Goal**: Complete optical order workflow — frame/lens/coating selection, fitting measurements, vision plan entry, lab job ticket PDF, AI Scribe pre-populated suggestions
**Depends on**: Phase 6 (Optical Handoff), Phase 13 (Retail Inventory)
**Success Criteria:**
  1. Optician opens order from queue with Final Rx pre-populated and PD pre-filled
  2. Habitual Rx displayed side-by-side with Final Rx for patient explanation
  3. Frame, lens type/material/coatings selectable from product catalog; order persists to DB
  4. Seg height and vertex distance captured for progressives
  5. Vision plan name, member ID, and group number recordable
  6. "Generate Job Ticket" produces PDF with both Rx columns, frame, lens, coatings, measurements, and vision plan
  7. AI Scribe optical recommendations appear as ghosted suggestions in order form

**Requirements:** [OPT14-01, OPT14-02, OPT14-03, OPT14-04, OPT14-05, OPT14-06, OPT14-07, OPT14-08, OPT14-09, OPT14-10, OPT14-11, OPT14-12, OPT14-13, OPT14-14, OPT14-15, OPT14-16, OPT14-17, OPT14-18]
**Plans:** 7/12 plans executed

Plans:
- [ ] 14-00-PLAN.md — Wave 0 test scaffold (pytest stubs + vitest stubs + Playwright skeleton) + append OPT14-01..18 to REQUIREMENTS.md
- [ ] 14-01-PLAN.md — Alembic 0019 migration + ORM extensions + ClinicalAction GENERATE_JOB_TICKET/MANAGE_LENS_CATALOG + 5 new AuditAction values
- [ ] 14-02-PLAN.md — Lens catalog backend: Pydantic schemas + 9 FastAPI CRUD routes + test assertions
- [ ] 14-03-PLAN.md — OpticalOrder configurator routes: PATCH autosave + extended POST + place-handler lens-config validation gate
- [ ] 14-04-PLAN.md — AI suggestion extractor (deterministic keyword scan) + GET /suggestions + POST accept/dismiss
- [ ] 14-05-PLAN.md — Job ticket reportlab PDF service + POST /optical-orders/{id}/job-ticket/
- [ ] 14-06-PLAN.md — Optical queue draft_order_count rollup + _seed_lens_reference (absorbs 2026-05-08 todo backend half)
- [ ] 14-07-PLAN.md — 11 BFF proxy routes (PATCH order, job-ticket Blob stream, suggestions, lens-catalog CRUD)
- [ ] 14-08-PLAN.md — Frontend stores: opticalOrderConfigStore (1.5s debounce + flush-on-blur) + lensCatalogStore + TS types
- [ ] 14-09-PLAN.md — Configurator page route + 7 components (RxSideBySide, FramePicker, LensConfig, Measurements, VisionPlan, SuggestionChip, Footer)
- [ ] 14-10-PLAN.md — Entry-point wiring: queue CTA + Draft pending pill + walk-in redirect + OrdersTab routing + OrderDetailDrawer Phase 14 sections (absorbs INV-15) + todo archive
- [ ] 14-11-PLAN.md — Playwright E2E spec + seed Phase 14 fixture + finalize 14-VALIDATION.md + manual HIPAA checkpoint

### Phase 15: Point of Sale
**Goal**: Checkout flow for clinical copays and retail purchases with receipt generation and daily close report
**Depends on**: Phase 13 (Retail Inventory), Phase 9 (fee schedules)
**Success Criteria:**
  1. Front desk can open checkout adding clinical charges and retail/optical items
  2. Payment via cash or card (Stripe)
  3. PDF receipt by email or print
  4. Daily close report with totals by payment method and category
  5. Refunds supported in patient payment history

### Phase 16: Reporting & Exports
**Goal**: Professional PDF/CSV reports for daily operations, monthly revenue, encounter summaries, and batch CMS-1500 export
**Depends on**: Phase 9 (CMS-1500 generation), Phase 8 (aggregate queries)
**Success Criteria:**
  1. Schedule page has "Export Day Summary" button generating PDF/CSV of daily encounters
  2. Billing page has "Monthly Report" button generating revenue-by-payer PDF
  3. Encounter page has "Print Summary" button generating patient-friendly encounter summary
  4. Billing page supports batch CMS-1500 export (select multiple → ZIP download)

### Phase 17: AI Scribe Audio
**Goal**: Clinicians record audio during encounters, transcribed and structured into SOAP notes automatically
**Depends on**: Phase 10 (sticky mic button + AI Scribe repositioning), Phase 2 (existing ai_scribe.py)
**Success Criteria:**
  1. Sticky mic button records audio with waveform visualization
  2. Recorded audio transcribed via Deepgram and displayed as editable transcript
  3. Transcript feeds into existing AI Scribe pipeline → SOAP + structured JSON
  4. User can review and accept auto-populated encounter fields
  5. Audio files stored in Supabase Storage linked to encounter for audit trail

### Phase 18: Mobile/Tablet UX
**Goal**: Key pages are responsive and usable on tablets and phones with touch-friendly interactions
**Depends on**: All prior phases (responsive pass on existing pages)
**Success Criteria:**
  1. Schedule, Optical, Patients, Dashboard, and Encounter pages render correctly on tablet (768px) and phone (375px)
  2. Bottom tab navigation replaces sidebar on mobile screens
  3. All interactive elements have minimum 44px tap targets
  4. No horizontal scrolling on mobile for primary content areas

---

## V3 Roadmap (Future)

| # | Feature | Notes |
|---|---------|-------|
| V3-01 | Clearinghouse Integration | Electronic claim submission via Availity/Change Healthcare, ERA/EOB |
| V3-02 | Full Revenue Cycle | Payment posting, aging reports, denial management, patient statements |
| V3-03 | Patient Portal | Separate frontend: Rx view, appointments, intake, secure messaging |
| V3-04 | Smart Scheduling | Appointment type durations, availability rules, waitlist, auto-fill cancellations |
| V3-05 | Real-time Ambient AI Scribe | WebSocket streaming, speaker diarization, live transcription during encounter |
| V3-06 | Multi-location Support | Tenant/location hierarchy, cross-location scheduling |
| V3-07 | Lab Integration | HL7/FHIR interface engine for lab orders and results |
| V3-08 | Patient Document Management | Generic drag-drop upload (PDF/images), Supabase Storage, taggable by category (insurance eligibility, imaging, referrals, prior auth). See memory: `research_document_management.md` |
