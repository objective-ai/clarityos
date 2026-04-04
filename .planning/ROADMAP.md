# Roadmap: ClarityOS EHR

## Overview

ClarityOS is a production optometry EHR built on Next.js 14, FastAPI, and PostgreSQL with multi-tenant auth via Supabase. Phases 1-10 delivered the core clinical platform: auth, real API integration, scheduling, billing/claims, patient profiles, optical handoff, patient intake, analytics, and an encounter workflow redesign with pre-test/doctor mode split. Current focus is hardening for pilot launch with a solo optometrist, then expanding with reporting, audio AI scribe, mobile UX, and retail/optical workflows.

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

Build order: 8 → 9 → 9.1 → 9.2 → 10 → 10.1 → 10.2 → 10.5 → 11 → 12 → 13 → 14 → 15 → 16 → 17

### Progress

| # | Phase | Plans | Status | Completed |
|---|-------|-------|--------|-----------|
| 8 | Analytics Dashboard | 3/3 | Complete | 2026-03-12 |
| 9 | Claims Basics | 8/8 | Complete | 2026-03-14 |
| 9.1 | Security & Integration Hardening | 2/2 | Complete | 2026-03-26 |
| 9.2 | Requirements & Traceability Repair | 1/1 | Complete | 2026-03-27 |
| 10 | Encounter Workflow Redesign | 3/3 | Complete | 2026-03-27 |
| 10.1 | 3/3 | Complete   | 2026-04-03 | — |
| 10.2 | Revamp Schedule & Booking Page | 0/6 | In progress | — |
| 10.5 | Error Monitoring & System Status | 0/? | Not started | — |
| 11 | Reporting & Exports | 0/? | Not started | — |
| 12 | AI Scribe Audio | 0/? | Not started | — |
| 13 | Mobile/Tablet UX | 0/? | Not started | — |
| 14 | CRM & Patient Engagement | 0/? | Not started | — |
| 15 | Retail Inventory | 0/? | Not started | — |
| 16 | Optical Order Configuration | 0/? | Not started | — |
| 17 | Point of Sale | 0/? | Not started | — |

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
**Plans:** 6 plans

Plans:
- [ ] 10.2-01-PLAN.md — Foundation: shared types, schedule utilities with tests, WeekStrip, page shell (5-mode toggle, role defaults, drawer state)
- [ ] 10.2-02-PLAN.md — Backend: checked_in_at ORM/schema/auto-set + date range query + store fetchWeekAppointments
- [ ] 10.2-03-PLAN.md — Appointment card redesign (wait time, intake icon, click handler) + AppointmentDetailDrawer
- [ ] 10.2-04-PLAN.md — BookingDrawer with slot picker grid replacing BookAppointmentModal
- [ ] 10.2-05-PLAN.md — FlowBoard (Kanban + 30s polling) + WeekView (7-day grid)
- [ ] 10.2-06-PLAN.md — Public booking page polish: light theme, 5-step wizard

### Phase 10.5: Error Monitoring & System Status (INSERTED)
**Goal:** Sentry integration (FastAPI + Next.js) + admin status page showing server health, recent errors, and uptime
**Depends on:** Phase 10
**Requirements:** TBD
**Plans:** None yet — run `/gsd:plan-phase 10.5` to break down

### Phase 11: Reporting & Exports
**Goal**: Professional PDF/CSV reports for daily operations, monthly revenue, encounter summaries, and batch CMS-1500 export
**Depends on**: Phase 9 (CMS-1500 generation), Phase 8 (aggregate queries)
**Success Criteria:**
  1. Schedule page has "Export Day Summary" button generating PDF/CSV of daily encounters
  2. Billing page has "Monthly Report" button generating revenue-by-payer PDF
  3. Encounter page has "Print Summary" button generating patient-friendly encounter summary
  4. Billing page supports batch CMS-1500 export (select multiple → ZIP download)

### Phase 12: AI Scribe Audio
**Goal**: Clinicians record audio during encounters, transcribed and structured into SOAP notes automatically
**Depends on**: Phase 10 (sticky mic button + AI Scribe repositioning), Phase 2 (existing ai_scribe.py)
**Success Criteria:**
  1. Sticky mic button records audio with waveform visualization
  2. Recorded audio transcribed via Deepgram and displayed as editable transcript
  3. Transcript feeds into existing AI Scribe pipeline → SOAP + structured JSON
  4. User can review and accept auto-populated encounter fields
  5. Audio files stored in Supabase Storage linked to encounter for audit trail

### Phase 13: Mobile/Tablet UX
**Goal**: Key pages are responsive and usable on tablets and phones with touch-friendly interactions
**Depends on**: All prior phases (responsive pass on existing pages)
**Success Criteria:**
  1. Schedule, Optical, Patients, Dashboard, and Encounter pages render correctly on tablet (768px) and phone (375px)
  2. Bottom tab navigation replaces sidebar on mobile screens
  3. All interactive elements have minimum 44px tap targets
  4. No horizontal scrolling on mobile for primary content areas

### Phase 14: CRM & Patient Engagement
**Goal**: Appointment reminders, recall campaigns, and manual messaging from patient/schedule views
**Depends on**: Phase 3 (appointment data), Phase 2 (patient contact info)
**Success Criteria:**
  1. Appointment reminders send automatically 24h before via SMS/email based on patient preference
  2. Staff can manually send a message from patient detail or schedule view
  3. Recall reminders triggered for patients with no appointment in last 12 months
  4. Patients can opt out of SMS; opt-out stored and respected
  5. Message history (sent, delivered, failed) viewable per patient

### Phase 15: Retail Inventory
**Goal**: Product catalog of frames, lenses, and contacts with stock tracking, linked to optical orders
**Depends on**: Phase 6 (Optical Handoff — Rx data and optical queue)
**Success Criteria:**
  1. Admin can add, edit, and deactivate products with brand, model, price, and stock quantity
  2. Optical staff can create an order from a patient's Rx, selecting products
  3. Placing an order decrements stock; low-stock items show warning badge
  4. Inventory page shows stock levels filterable by product type
  5. Patient detail page shows order history with status and delivery date

### Phase 16: Optical Order Configuration
**Goal**: Complete optical order workflow — frame/lens/coating selection, fitting measurements, vision plan entry, lab job ticket PDF, AI Scribe pre-populated suggestions
**Depends on**: Phase 6 (Optical Handoff), Phase 15 (Retail Inventory)
**Success Criteria:**
  1. Optician opens order from queue with Final Rx pre-populated and PD pre-filled
  2. Habitual Rx displayed side-by-side with Final Rx for patient explanation
  3. Frame, lens type/material/coatings selectable from product catalog; order persists to DB
  4. Seg height and vertex distance captured for progressives
  5. Vision plan name, member ID, and group number recordable
  6. "Generate Job Ticket" produces PDF with both Rx columns, frame, lens, coatings, measurements, and vision plan
  7. AI Scribe optical recommendations appear as ghosted suggestions in order form

### Phase 17: Point of Sale
**Goal**: Checkout flow for clinical copays and retail purchases with receipt generation and daily close report
**Depends on**: Phase 16 (optical orders), Phase 9 (fee schedules)
**Success Criteria:**
  1. Front desk can open checkout adding clinical charges and retail/optical items
  2. Payment via cash or card (Stripe)
  3. PDF receipt by email or print
  4. Daily close report with totals by payment method and category
  5. Refunds supported in patient payment history

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
