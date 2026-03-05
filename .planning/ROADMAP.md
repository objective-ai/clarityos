# Roadmap: ClarityOS EHR — MVP

## Overview

ClarityOS has a fully built frontend running on mock data and a FastAPI backend with models and routes that nothing calls yet. This roadmap transforms the demo into a production optometry EHR by closing security gaps first, wiring real auth, connecting frontend to backend, then building the remaining clinical capabilities (scheduling, billing, patient profiles, optical handoff, patient intake) on the real data foundation. Every phase depends cleanly on the previous one — no real data flows until auth works, no clinical features until mock data is gone, no billing until encounters are real.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Security & Auth Foundation** - Close security gaps, wire Supabase Auth, relocate backend, set up Alembic
- [ ] **Phase 2: API Integration & HIPAA Compliance** - Replace all mock data with real API calls, add PHI access logging
- [ ] **Phase 3: Scheduling** - Real appointment system with check-in workflow and encounter creation
- [ ] **Phase 4: Billing & Coding** - Superbill, CPT/ICD mapping, CMS-1500 export, AI MDM calculator
- [ ] **Phase 5: Patient Profile** - Patient CRUD, detail page, encounter timeline, clinical flowsheets, AI Prep Me
- [ ] **Phase 6: Optical Handoff** - Optical dashboard, Rx PDF generator, optical queue, Rx change alerts
- [ ] **Phase 7: Patient Intake** - Public intake forms, AI triage, intake webhook

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
**Plans:** 2/3 plans executed

Plans:
- [x] 01-01-PLAN.md — Backend relocation + security hardening (INF-01, SEC-01-03, SEC-09-10)
- [ ] 01-02-PLAN.md — Alembic setup, BFF route handlers, Custom Access Token Hook (INF-02-06)
- [ ] 01-03-PLAN.md — Supabase Auth end-to-end (SEC-04-08: login, middleware, session, logout, timeout)

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
**Plans**: TBD

Plans:
- [ ] 02-01: Store migration (encounterStore, vitalsStore, refractionStore, examFindingsStore, diagnosisStore, problemListStore)
- [ ] 02-02: Page migration and HIPAA compliance (mock imports removed from pages, PHI read logging, audit sidebar wired)

### Phase 3: Scheduling
**Goal**: Clinicians can manage their daily schedule with real appointments — booking, check-in, and seamless encounter creation from the schedule
**Depends on**: Phase 2
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05
**Success Criteria** (what must be TRUE):
  1. Staff can create, view, edit, and cancel appointments on the schedule page with data persisting to the database
  2. Front desk can check in a patient, changing appointment status from scheduled to checked_in, visible to the provider
  3. Provider can start an exam from a checked-in appointment, which creates a linked encounter and transitions status to in_exam
  4. Schedule page displays real appointment data grouped by date, replacing the previous mock timeline cards
**Plans**: TBD

Plans:
- [ ] 03-01: Appointment backend (model, migration, CRUD API, status transitions)
- [ ] 03-02: Schedule frontend (wire schedule page to real data, check-in workflow, encounter creation)

### Phase 4: Billing & Coding
**Goal**: After finalizing an encounter, the provider can review and approve a superbill with AI-suggested coding, ready for clearinghouse export
**Depends on**: Phase 2 (requires real encounter/diagnosis data)
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06
**Success Criteria** (what must be TRUE):
  1. After clicking Finalize, provider sees a superbill modal with CPT codes mapped to the encounter's ICD-10 diagnoses
  2. AI evaluates MDM complexity from exam findings and suggests the correct E&M level (99213/99214/99215)
  3. System warns when a CPT code lacks a supporting diagnosis pointer
  4. Billing data can be exported in CMS-1500 standard JSON format for clearinghouse submission
**Plans**: TBD

Plans:
- [ ] 04-01: Billing backend and store (billingStore, CPT-ICD mapping, superbill data model)
- [ ] 04-02: Billing UI and AI coding (superbill modal, AI MDM calculator, E&M suggestion, CMS-1500 export)

### Phase 5: Patient Profile
**Goal**: Clinicians can view a complete longitudinal patient record — demographics, encounter history, clinical trends, and AI-generated visit prep
**Depends on**: Phase 2 (requires real patient/encounter data)
**Requirements**: PAT-01, PAT-02, PAT-03, PAT-04, PAT-05
**Success Criteria** (what must be TRUE):
  1. Staff can create, search, and edit patient records with demographics, alerts, insurance, and active problem list
  2. Patient detail page shows a chronological encounter timeline with date, provider, chief complaint, and AI-generated visit summary
  3. Clinical flowsheets display IOP and refractive data tracked across visits in a data table
  4. Pressing "Prep Me" generates a 2-sentence AI clinical summary from the patient's last 3 finalized SOAP notes
**Plans**: TBD

Plans:
- [ ] 05-01: Patient backend (CRUD API, search, detail page data)
- [ ] 05-02: Patient frontend (detail page, encounter timeline, flowsheets, AI Prep Me)

### Phase 6: Optical Handoff
**Goal**: After an exam is finalized, the optical team sees the patient in their queue with a printable prescription and change alerts
**Depends on**: Phase 2 (requires real encounter/refraction data)
**Requirements**: OPT-01, OPT-02, OPT-03, OPT-04
**Success Criteria** (what must be TRUE):
  1. When an encounter is finalized, the patient automatically appears in the optical dashboard queue
  2. Optical staff can generate a printable Rx PDF with doctor signature, license number, and expiration date
  3. If today's refraction changed more than 0.50D spherical equivalent from last year, a bright badge alerts optical staff
**Plans**: TBD

Plans:
- [ ] 06-01: Optical system (opticalStore, optical dashboard, Rx PDF generator, Rx change alerts)

### Phase 7: Patient Intake
**Goal**: Patients can complete intake forms on their phone before arriving, with AI flagging urgent conditions for the clinical team
**Depends on**: Phase 3 (requires real appointment data for token-based form access)
**Requirements**: INTAKE-01, INTAKE-02, INTAKE-03, INTAKE-04
**Success Criteria** (what must be TRUE):
  1. Patient receives a link and can fill out demographics, medical history, ROS, and chief complaint on a mobile-friendly form without logging in
  2. Submitted intake data creates or updates the patient record and pre-seeds the encounter for that appointment
  3. AI triage flags urgent chief complaints (e.g., "flashing lights" flagged as possible retinal detachment) with a red badge on the schedule view
**Plans**: TBD

Plans:
- [ ] 07-01: Intake backend (public route, token auth, intake API, patient record creation)
- [ ] 07-02: Intake frontend (mobile-first forms, AI triage, schedule integration)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7
Note: Phases 3-7 all depend on Phase 2. Phases 3, 4, 5, 6 can execute in parallel after Phase 2. Phase 7 depends on Phase 3.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security & Auth Foundation | 2/3 | In Progress|  |
| 2. API Integration & HIPAA Compliance | 0/2 | Not started | - |
| 3. Scheduling | 0/2 | Not started | - |
| 4. Billing & Coding | 0/2 | Not started | - |
| 5. Patient Profile | 0/2 | Not started | - |
| 6. Optical Handoff | 0/1 | Not started | - |
| 7. Patient Intake | 0/2 | Not started | - |
