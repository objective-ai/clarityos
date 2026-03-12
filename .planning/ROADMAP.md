# Roadmap: ClarityOS EHR — MVP

## Overview

ClarityOS has a fully built frontend running on mock data and a FastAPI backend with models and routes that nothing calls yet. This roadmap transforms the demo into a production optometry EHR by closing security gaps first, wiring real auth, connecting frontend to backend, then building the remaining clinical capabilities (scheduling, billing, patient profiles, optical handoff, patient intake) on the real data foundation. Every phase depends cleanly on the previous one — no real data flows until auth works, no clinical features until mock data is gone, no billing until encounters are real.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Security & Auth Foundation** - Close security gaps, wire Supabase Auth, relocate backend, set up Alembic
- [x] **Phase 2: API Integration & HIPAA Compliance** - Replace all mock data with real API calls, add PHI access logging (completed 2026-03-05)
- [x] **Phase 3: Scheduling** - Real appointment system with check-in workflow and encounter creation (completed 2026-03-05)
- [x] **Phase 4: Billing & Coding** - Superbill, CPT/ICD mapping, CMS-1500 export, AI MDM calculator (completed 2026-03-06)
- [x] **Phase 5: Patient Profile** - Patient CRUD, detail page, encounter timeline, clinical flowsheets, AI Prep Me (completed 2026-03-06)
- [x] **Phase 6: Optical Handoff** - Optical dashboard, Rx PDF generator, optical queue, Rx change alerts (completed 2026-03-06)
- [x] **Phase 7: Patient Intake** - Public intake forms, QR code sharing, intake token system (completed 2026-03-07)

## Phase Details

### Phase 1: Security & Auth Foundation
**Goal**: The system can legally receive real patient data — all security gaps closed, real authentication works end-to-end, backend namespace conflict resolved, and migration toolchain ready
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09, SEC-10, INF-01, INF-02, INF-03, INF-04, INF-05, INF-06
**Success Criteria** (what must be TRUE):
  1. User can log in with email/password on /login and is redirected to their tenant dashboard
  2. User who is not logged in is redirected to /login when visiting any tenant route
  3. User can log out and all clinical data is cleared from browser storage (localStorage, Zustand state)
  4. FastAPI rejects all requests when Supabase JWT secret is missing — no dev bypass path exists
  5. Python backend files live in backend/ directory with no files in app/ conflicting with Next.js routes
**Plans:** 3/3 plans executed

Plans:
- [x] 01-01-PLAN.md — Backend relocation + security hardening (INF-01, SEC-01-03, SEC-09-10)
- [x] 01-02-PLAN.md — Alembic setup, BFF route handlers, Custom Access Token Hook (INF-02-06)
- [x] 01-03-PLAN.md — Supabase Auth end-to-end (SEC-04-08: login, middleware, session, logout, timeout)

### Phase 2: API Integration & HIPAA Compliance
**Goal**: The application runs entirely on real data from FastAPI — every mock import removed, every clinical GET endpoint logged for HIPAA
**Depends on**: Phase 1
**Requirements**: API-01, API-02, API-03, API-04, API-05, API-06, API-07, API-08, HIPAA-01, HIPAA-02, HIPAA-03
**Success Criteria** (what must be TRUE):
  1. Opening an encounter loads vitals, refractions, exam findings, diagnoses, and problem list from the database (not mock data)
  2. Saving clinical data in any encounter section persists to the database and survives a full page refresh
  3. The audit trail sidebar in the encounter view displays real audit log entries from the API (no 404 errors)
  4. Session automatically times out after 30 minutes of inactivity, clearing ePHI and redirecting to /login
  5. No file in the production bundle imports from any mock data module
**Plans:** 3/3 plans complete

Plans:
- [x] 02-01-PLAN.md — API client upgrade, skeleton/status UI, audit-logs BFF route, PHI logging (API-08, HIPAA-01, HIPAA-02)
- [x] 02-02-PLAN.md — Store migration: all 6 clinical stores from mock to real API (API-01 through API-06)
- [x] 02-03-PLAN.md — Page wiring, mock cleanup, end-to-end verification (API-07, HIPAA-03)

### Phase 3: Scheduling
**Goal**: Clinicians can manage their daily schedule with real appointments — booking, check-in, and seamless encounter creation from the schedule
**Depends on**: Phase 2
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05
**Success Criteria** (what must be TRUE):
  1. Staff can create, view, edit, and cancel appointments on the schedule page with data persisting to the database
  2. Front desk can check in a patient, changing appointment status from scheduled to checked_in, visible to the provider
  3. Provider can start an exam from a checked-in appointment, which creates a linked encounter and transitions status to in_exam
  4. Schedule page displays real appointment data grouped by date, replacing the previous mock timeline cards
**Plans:** 2/2 plans complete

Plans:
- [x] 03-01-PLAN.md — Appointment backend: Alembic migration, Pydantic schemas, CRUD API, status transitions, encounter creation (SCHED-01, SCHED-02, SCHED-04, SCHED-05)
- [x] 03-02-PLAN.md — Schedule frontend: appointmentStore, schedule page UI, booking modal, check-in/start-exam workflow (SCHED-03, SCHED-04, SCHED-05)

### Phase 4: Billing & Coding
**Goal**: After finalizing an encounter, the provider can review and approve a superbill with AI-suggested coding, ready for clearinghouse export
**Depends on**: Phase 2 (requires real encounter/diagnosis data)
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06
**Success Criteria** (what must be TRUE):
  1. After clicking Finalize, provider sees a superbill modal with CPT codes mapped to the encounter's ICD-10 diagnoses
  2. AI evaluates MDM complexity from exam findings and suggests the correct E&M level (99213/99214/99215)
  3. System warns when a CPT code lacks a supporting diagnosis pointer
  4. Billing data can be exported in CMS-1500 standard JSON format for clearinghouse submission
**Plans:** 1/1 plan complete

Plans:
- [x] 04-01-SUMMARY.md — Billing backend, store, SuperbillModal, CMS-1500 export, MDM calculator (BILL-01 through BILL-06)

### Phase 5: Patient Profile
**Goal**: Clinicians can view a complete longitudinal patient record — demographics, encounter history, clinical trends, and AI-generated visit prep
**Depends on**: Phase 2 (requires real patient/encounter data)
**Requirements**: PAT-01, PAT-02, PAT-03, PAT-04, PAT-05
**Success Criteria** (what must be TRUE):
  1. Staff can create, search, and edit patient records with demographics, alerts, insurance, and active problem list
  2. Patient detail page shows a chronological encounter timeline with date, provider, chief complaint, and AI-generated visit summary
  3. Clinical flowsheets display IOP and refractive data tracked across visits in a data table
  4. Pressing "Prep Me" generates a 2-sentence AI clinical summary from the patient's last 3 finalized SOAP notes
**Plans:** 1/1 plan complete

Plans:
- [x] 05-01-SUMMARY.md — Patient CRUD API, detail page, encounter timeline, flowsheets, AI Prep Me (PAT-01 through PAT-05)

### Phase 6: Optical Handoff
**Goal**: After an exam is finalized, the optical team sees the patient in their queue with a printable prescription and change alerts
**Depends on**: Phase 2 (requires real encounter/refraction data)
**Requirements**: OPT-01, OPT-02, OPT-03, OPT-04
**Success Criteria** (what must be TRUE):
  1. When an encounter is finalized, the patient automatically appears in the optical dashboard queue
  2. Optical staff can generate a printable Rx PDF with doctor signature, license number, and expiration date
  3. If today's refraction changed more than 0.50D spherical equivalent from last year, a bright badge alerts optical staff
**Plans:** 1/1 plan complete

Plans:
- [x] 06-01-SUMMARY.md — Optical queue, Rx print view, SE change alerts, sidebar nav (OPT-01 through OPT-04)

### Phase 7: Patient Intake
**Goal**: Patients can complete intake forms on their phone before arriving, with AI flagging urgent conditions for the clinical team
**Depends on**: Phase 3 (requires real appointment data for token-based form access)
**Requirements**: INTAKE-01, INTAKE-02, INTAKE-03, INTAKE-04
**Success Criteria** (what must be TRUE):
  1. Patient receives a link and can fill out demographics, medical history, ROS, and chief complaint on a mobile-friendly form without logging in
  2. Submitted intake data creates or updates the patient record and pre-seeds the encounter for that appointment
  3. AI triage flags urgent chief complaints (e.g., "flashing lights" flagged as possible retinal detachment) with a red badge on the schedule view
**Plans**: 2/2 plans complete

Plans:
- [x] 07-01: Intake backend — IntakeToken model, seed data, token-based form access
- [x] 07-02: Intake frontend — multi-step mobile form, IntakeLinkModal with QR code, sidebar/dashboard integration

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7
Note: Phases 3-7 all depend on Phase 2. Phases 3, 4, 5, 6 can execute in parallel after Phase 2. Phase 7 depends on Phase 3.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security & Auth Foundation | 3/3 | Complete | 2026-03-05 |
| 2. API Integration & HIPAA Compliance | 3/3 | Complete   | 2026-03-05 |
| 3. Scheduling | 2/2 | Complete | 2026-03-05 |
| 4. Billing & Coding | 1/1 | Complete | 2026-03-06 |
| 5. Patient Profile | 1/1 | Complete | 2026-03-06 |
| 6. Optical Handoff | 1/1 | Complete | 2026-03-06 |
| 7. Patient Intake | 2/2 | Complete | 2026-03-07 |

---

## V2 Milestone (Post-MVP)

Build order: Phase 8 → 9 → 10 → 11 → 12

- [x] **Phase 8: Analytics Dashboard** - 7 real charts (Recharts): encounter volume, revenue trend, top diagnoses, claims pipeline, appointment utilization, patient growth, Rx/optical metrics (completed 2026-03-12)
- [ ] **Phase 9: Claims Basics** - Payer management, patient insurance, fee schedules, CMS-1500 PDF generation, claim tracking
- [ ] **Phase 10: Reporting & Exports** - Daily encounter summary, monthly revenue report, encounter printout, CMS-1500 batch export
- [ ] **Phase 11: AI Scribe Audio** - Browser mic → Deepgram transcription → existing SOAP pipeline → auto-fill encounter fields
- [ ] **Phase 12: Mobile/Tablet UX** - Responsive pass on Schedule, Optical, Patients, Dashboard, Encounter; bottom nav on mobile

### Phase 8: Analytics Dashboard
**Goal**: Replace placeholder analytics charts with 7 real data visualizations covering clinical and financial metrics
**Depends on**: Phase 2 (requires real encounter, billing, patient, appointment data)
**Requirements**: ANAL-V2-01, ANAL-V2-02
**Success Criteria** (what must be TRUE):
  1. Analytics page displays 7 real charts with data from the database (no "Chart coming soon" placeholders)
  2. Date range picker (7d/30d/90d/6mo) filters all chart data
  3. Charts show encounter volume, revenue trend, top diagnoses, claims pipeline, appointment utilization, patient growth, and Rx/optical metrics
  4. Page remains gated behind ADVANCED_ANALYTICS entitlement
**Plans:** 3/3 plans complete

Plans:
- [ ] 08-00-PLAN.md — Scaffold: recharts install, Pydantic schemas, Zustand store stub, VIEW_ANALYTICS permission, E2E test stub (ANAL-V2-01, ANAL-V2-02)
- [ ] 08-01-PLAN.md — Backend: FastAPI analytics aggregate endpoint (7 queries + 4 KPIs), router registration, BFF proxy (ANAL-V2-01, ANAL-V2-02)
- [ ] 08-02-PLAN.md — Frontend: analytics page rewrite with 7 Recharts charts, KPI cards, date range picker, loading/error/empty states (ANAL-V2-01, ANAL-V2-02)

### Phase 9: Claims Basics
**Goal**: Enable real insurance billing with payer management, patient insurance records, fee schedules, and CMS-1500 PDF generation
**Depends on**: Phase 4 (requires superbill system)
**Requirements**: New DB models (InsurancePayer, FeeSchedule, PatientInsurance). Extend Superbill with claim fields.
**Success Criteria** (what must be TRUE):
  1. Admin can CRUD insurance payers and manage per-payer fee schedules
  2. Patient detail shows primary/secondary insurance with subscriber info
  3. Superbill auto-populates line item fees from patient's payer fee schedule
  4. Posted superbills can generate downloadable CMS-1500 PDF forms
  5. Claims track status: Draft → Posted → Submitted → Accepted/Rejected

### Phase 10: Reporting & Exports
**Goal**: Professional PDF/CSV reports for daily operations, monthly revenue, encounter summaries, and batch CMS-1500 export
**Depends on**: Phase 9 (CMS-1500 generation), Phase 8 (aggregate queries)
**Requirements**: reportlab for PDF generation. Existing CSV pattern from audit logs.
**Success Criteria** (what must be TRUE):
  1. Schedule page has "Export Day Summary" button generating PDF/CSV of daily encounters
  2. Billing page has "Monthly Report" button generating revenue-by-payer PDF
  3. Encounter page has "Print Summary" button generating patient-friendly encounter summary
  4. Billing page supports batch CMS-1500 export (select multiple → ZIP download)

### Phase 11: AI Scribe Audio
**Goal**: Clinicians record audio during encounters, which is transcribed and structured into SOAP notes automatically
**Depends on**: Phase 2 (existing ai_scribe.py text→SOAP endpoint)
**Requirements**: Deepgram API key. Supabase Storage bucket for audio. Web Audio API / MediaRecorder.
**Success Criteria** (what must be TRUE):
  1. Encounter page has mic button that records audio with waveform visualization
  2. Recorded audio is transcribed via Deepgram and displayed as editable transcript
  3. Transcript feeds into existing AI Scribe pipeline → SOAP + structured JSON
  4. User can review and accept auto-populated encounter fields
  5. Audio files stored in Supabase Storage linked to encounter for audit trail

### Phase 12: Mobile/Tablet UX
**Goal**: Key pages are responsive and usable on tablets and phones with touch-friendly interactions
**Depends on**: All prior phases (responsive pass on existing pages)
**Requirements**: Tailwind responsive utilities only — no new framework.
**Success Criteria** (what must be TRUE):
  1. Schedule, Optical, Patients, Dashboard, and Encounter pages render correctly on tablet (768px) and phone (375px)
  2. Bottom tab navigation replaces sidebar on mobile screens
  3. All interactive elements have minimum 44px tap targets
  4. No horizontal scrolling on mobile for primary content areas

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Analytics Dashboard | 3/3 | Complete   | 2026-03-12 |
| 9. Claims Basics | 0/? | Not started | — |
| 10. Reporting & Exports | 0/? | Not started | — |
| 11. AI Scribe Audio | 0/? | Not started | — |
| 12. Mobile/Tablet UX | 0/? | Not started | — |

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
