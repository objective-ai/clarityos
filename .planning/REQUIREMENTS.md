# Requirements: ClarityOS EHR — MVP

**Defined:** 2026-03-05
**Core Value:** Clinicians can complete a full eye exam encounter in a workflow that feels faster than paper, with every action audited and every record tamper-proof.

## v1 Requirements

Requirements for the full MVP. Each maps to roadmap phases.

### Security & Auth

- [x] **SEC-01**: Dev auth bypass removed — backend requires valid JWT at startup, no fallback identity when SUPABASE_JWT_SECRET is empty
- [x] **SEC-02**: Hardcoded SECRET_KEY default removed — startup fails if SECRET_KEY env var is unset
- [x] **SEC-03**: Hardcoded Supabase project reference in config.py replaced with env var
- [x] **SEC-04**: User can log in with email/password via Supabase Auth on a dedicated /login page
- [x] **SEC-05**: User can log out and all ePHI is cleared from localStorage (SOAP notes, encounter data, clinical transcripts)
- [x] **SEC-06**: User session persists across browser refresh via Supabase JWT cookie
- [x] **SEC-07**: Next.js middleware protects all tenant routes — unauthenticated users redirected to /login
- [x] **SEC-08**: sessionStore hydrates from real Supabase JWT claims (role, tenant_id, entitlements) instead of mock session
- [x] **SEC-09**: Security headers added to Next.js config (CSP, X-Frame-Options, X-Content-Type-Options)
- [x] **SEC-10**: Zustand devtools disabled in production builds

### Infrastructure

- [x] **INF-01**: Python backend relocated from app/ to backend/ directory (resolves Next.js namespace conflict)
- [x] **INF-02**: Alembic initialized with async migration environment for existing SQLAlchemy models
- [x] **INF-03**: Initial Alembic migration generated from current model state (baseline migration)
- [x] **INF-04**: Next.js BFF route handler for audit log API (/api/audit-logs proxying to FastAPI)
- [x] **INF-05**: Next.js BFF route handler for AI Scribe accept endpoint (/api/ai-scribe/accept proxying to FastAPI)
- [x] **INF-06**: Supabase Custom Access Token Hook injects tenant_id and role into JWT claims

### API Integration

- [x] **API-01**: encounterStore migrated from mock data to real apiFetch() calls
- [x] **API-02**: vitalsStore migrated from mock data to real apiFetch() calls
- [x] **API-03**: refractionStore migrated from mock data to real apiFetch() calls
- [x] **API-04**: examFindingsStore migrated from mock data to real apiFetch() calls
- [x] **API-05**: diagnosisStore migrated from mock data to real apiFetch() calls
- [x] **API-06**: problemListStore migrated from mock data to real apiFetch() calls
- [x] **API-07**: Mock persona seed imports removed from all 9 production pages
- [x] **API-08**: apiFetch() updated to use Supabase session token for Authorization header

### Scheduling

- [ ] **SCHED-01**: Appointment model and Alembic migration (patient_id, provider_id, datetime, duration, status, type, notes)
- [ ] **SCHED-02**: Appointment CRUD API endpoints on FastAPI (create, read, update, cancel, list by date range)
- [ ] **SCHED-03**: Schedule page wired to real appointment data instead of mock schedule
- [ ] **SCHED-04**: Check-in workflow — appointment status transitions (scheduled -> checked_in -> in_exam -> completed)
- [ ] **SCHED-05**: Encounter creation from appointment (link appointment to new encounter)

### HIPAA Compliance

- [x] **HIPAA-01**: PHI read logging on all GET endpoints that return patient/encounter data
- [x] **HIPAA-02**: Audit trail sidebar in encounter view wired to real audit log API (currently 404s)
- [x] **HIPAA-03**: Automatic session timeout after 30 minutes of inactivity

### Billing & Coding (Revenue Engine)

- [ ] **BILL-01**: Superbill modal triggered from Finalize button — displays suggested CPT codes mapped to ICD-10 diagnoses via pointers
- [ ] **BILL-02**: billingStore (store/billingStore.ts) manages lineItems (CPT, fee, units, diagnosis pointers) and claimStatus (draft, ready_to_bill)
- [ ] **BILL-03**: CMS-1500 exporter utility (lib/utils/cms1500.ts) maps billingStore payload to standard clearinghouse JSON schema
- [ ] **BILL-04**: AI MDM Calculator — AI Scribe evaluates Medical Decision Making complexity from exam findings and problem list
- [ ] **BILL-05**: AI suggests correct E&M code (99213/99214/99215) based on MDM complexity level
- [ ] **BILL-06**: CPT-to-ICD pointer validation — system warns if CPT code lacks a supporting diagnosis

### Patient Profile (Longitudinal Record)

- [ ] **PAT-01**: Patient CRUD API endpoints on FastAPI (create, read, update, list with search)
- [ ] **PAT-02**: Patient detail page (/patients/[patientId]) with demographics, alerts, insurance, active MPPL
- [ ] **PAT-03**: Chronological encounter feed — scrolling timeline with date, provider, chief complaint, AI-generated one-paragraph visit summary
- [ ] **PAT-04**: Clinical flowsheets — data table tracking IOP and refractive changes over time
- [ ] **PAT-05**: "Prep Me" button — AI reads last 3 finalized SOAP notes and outputs 2-sentence clinical summary for pre-visit preparation

### Optical Handoff

- [ ] **OPT-01**: Optical dashboard page (/optical) — real-time queue of patients who finished exams and are ready for glasses/contacts
- [ ] **OPT-02**: Rx PDF generator (lib/utils/generateRxPdf.ts) — converts is_final_rx data to printable, legally compliant prescription with doctor signature, license number, expiration date
- [ ] **OPT-03**: opticalStore (store/opticalStore.ts) — listens to encounterStore; when encounter is finalized, pushes patient to optical queue
- [ ] **OPT-04**: Rx Change Alert — compares today's final refraction to previous year's; if spherical equivalent changes >0.50D, adds bright badge to optical queue

### Patient Intake

- [ ] **INTAKE-01**: Public intake route (/intake/[clinicId]/[appointmentToken]) — mobile-first, no auth required, secured by unique expiring token
- [ ] **INTAKE-02**: Intake forms capture demographics, medical history, review of systems (ROS), and chief complaint using shadcn UI
- [ ] **INTAKE-03**: Intake webhook/API receives submission, creates/updates Patient record, pre-seeds encounterStore for that day's appointment
- [ ] **INTAKE-04**: AI Triage — async AI check on "Reason for Visit"; flags urgent conditions (e.g., flashing lights -> "Possible RD") with red badge on Schedule View

### Insurance & Claims

- [ ] **INS-01**: InsurancePayer model with CRUD API — admin can create, read, update, delete insurance payers
- [ ] **INS-02**: FeeScheduleItem model with per-payer fee schedule management (CPT code to fee amount mapping)
- [ ] **INS-03**: Admin Payers tab UI — payer list with CRUD forms and inline fee schedule editor
- [ ] **INS-04**: PatientInsurance model with CRUD API — patient detail Insurance tab showing primary/secondary coverage with subscriber info
- [ ] **INS-05**: Superbill auto-populates line item fees from patient's payer fee schedule via fee_service
- [ ] **INS-06**: CMS-1500 PDF generation — posted superbills generate downloadable PDF forms via reportlab
- [ ] **INS-07**: Patient Billing/Claims tab — list all superbills for patient with status, E&M code, CPT codes, and total

### Schedule & Booking Revamp (Phase 10.2)

- [ ] **SCH-01**: Horizontal Mon-Sun week strip with count badges replaces prev/next arrows at top of schedule page
- [ ] **SCH-02**: 5 view mode tabs (List, Timeline, Clinic, Flow, Week) with active tab accent indicator
- [ ] **SCH-03**: Role-based default view (receptionist/technician -> Flow, doctor -> Clinic, owner -> List)
- [ ] **SCH-04**: View mode persists to localStorage, role default applies only on first visit
- [ ] **SCH-05**: Appointment model has checked_in_at timestamp, auto-set when status transitions to arrived
- [ ] **SCH-06**: Backend appointment list endpoint supports date_from/date_to range query (max 31 days)
- [ ] **SCH-07**: Appointment cards show color-coded left border by status, wait time badge (amber >15min, red >30min), and intake status icon
- [ ] **SCH-08**: Clicking an appointment card opens a right-side detail drawer with full info, patient summary, and all actions
- [ ] **SCH-09**: Detail drawer closes via ESC, backdrop click, or Close button; 480px width with slide animation
- [ ] **SCH-10**: Booking flow uses right-side drawer with visual 30-min slot picker grid instead of modal dialog
- [ ] **SCH-11**: Slot picker shows available/occupied/selected states; overbooking shows warning but does not block staff
- [ ] **SCH-12**: Flow board view with 4 Kanban columns (Waiting, Pre-Test, In Exam, Done) and upcoming appointments strip
- [ ] **SCH-13**: Flow board auto-refreshes via 30-second polling; wait time displayed on each card
- [ ] **SCH-14**: Week view shows 7-day time-aligned grid with appointment blocks positioned by time (Google Calendar style)
- [ ] **SCH-15**: Public booking page at /book/[slug] uses light/white theme with 5-step wizard (Type, Provider, Date+Time, Info, Confirm)
- [ ] **SCH-16**: Public booking wizard validates patient info, shows slot availability from backend, and displays success state on confirm

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Auth Enhancements

- **SEC-V2-01**: MFA via TOTP (HIPAA 2025 mandates for remote ePHI access)
- **SEC-V2-02**: OAuth login (Google Workspace for clinic staff)

### Interoperability

- **FHIR-V2-01**: FHIR R4 per-encounter export (Patient, Observation, Condition Bundle)
- **FHIR-V2-02**: FHIR VisionPrescription resource for dispensed Rx

### Analytics

- **ANAL-V2-01**: Analytics dashboard with real KPI data (Recharts)
- **ANAL-V2-02**: Revenue and utilization dashboards

### Deployment

- **DEP-V2-01**: Deploy FastAPI to Render with HIPAA BAA
- **DEP-V2-02**: CI/CD pipeline (GitHub Actions -> Vercel + Render)
- **DEP-V2-03**: Supabase RLS policies as defense-in-depth

### Encounter Workflow Redesign

- [x] **EWR-01**: Encounter page splits into pre-test and doctor exam modes based on encounter status
- [x] **EWR-02**: Pre-test mode shows only CC/HPI + vitals form — no doctor sections, no tab bar
- [x] **EWR-03**: AI Scribe widget renders after Plan/Addendum section in doctor exam mode
- [x] **EWR-04**: Sticky floating mic button visible for doctor/owner roles during in_exam status
- [x] **EWR-05**: Tab bar removed from DOM (not hidden via CSS) in pre-test mode
- [x] **EWR-06**: 9 preliminary test fields (confrontation, motility, color vision, NPC, pupils mm, autorefractor, keratometer, entrance Rx) in full data chain
- [x] **EWR-07**: "All Normal" quick-fill and "Ready for Doctor" transition button in pre-test view

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full clearinghouse integration (ERA processing) | Requires vendor contract, deferred beyond MVP |
| Patient portal (secure messaging) | Requires separate frontend app |
| OCT & visual field device import | Requires hardware integration research |
| Mobile native app | Web-first, responsive design covers mobile |
| Real-time multi-provider collaboration | Unnecessary for solo/small practice market |
| FHIR server (full read/write) | Export-only sufficient; full server is $50K-$500K |
| SMS/email appointment reminders | Requires vendor decision (Twilio/Resend) |
| Encounter addenda | Architectural decision needed on locking model |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |
| SEC-05 | Phase 1 | Complete |
| SEC-06 | Phase 1 | Complete |
| SEC-07 | Phase 1 | Complete |
| SEC-08 | Phase 1 | Complete |
| SEC-09 | Phase 1 | Complete |
| SEC-10 | Phase 1 | Complete |
| INF-01 | Phase 1 | Complete |
| INF-02 | Phase 1 | Complete |
| INF-03 | Phase 1 | Complete |
| INF-04 | Phase 1 | Complete |
| INF-05 | Phase 1 | Complete |
| INF-06 | Phase 1 | Complete |
| API-01 | Phase 2 | Complete |
| API-02 | Phase 2 | Complete |
| API-03 | Phase 2 | Complete |
| API-04 | Phase 2 | Complete |
| API-05 | Phase 2 | Complete |
| API-06 | Phase 2 | Complete |
| API-07 | Phase 9.1 | Complete |
| API-08 | Phase 2 | Complete |
| HIPAA-01 | Phase 2 | Complete |
| HIPAA-02 | Phase 2 | Complete |
| HIPAA-03 | Phase 2 | Complete |
| SCHED-01 | Phase 3 | Complete |
| SCHED-02 | Phase 3 | Complete |
| SCHED-03 | Phase 3 | Complete |
| SCHED-04 | Phase 3 | Complete |
| SCHED-05 | Phase 3 | Complete |
| BILL-01 | Phase 4 | Complete |
| BILL-02 | Phase 4 | Complete |
| BILL-03 | Phase 4 | Complete |
| BILL-04 | Phase 4 | Complete |
| BILL-05 | Phase 4 | Complete |
| BILL-06 | Phase 4 | Complete |
| PAT-01 | Phase 5 | Complete |
| PAT-02 | Phase 5 | Complete |
| PAT-03 | Phase 5 | Complete |
| PAT-04 | Phase 5 | Complete |
| PAT-05 | Phase 5 | Complete |
| OPT-01 | Phase 6 | Complete |
| OPT-02 | Phase 6 | Complete |
| OPT-03 | Phase 6 | Complete |
| OPT-04 | Phase 6 | Complete |
| INTAKE-01 | Phase 7 | Complete |
| INTAKE-02 | Phase 7 | Complete |
| INTAKE-03 | Phase 7 | Complete |
| INTAKE-04 | Phase 7 | Complete |
| INS-01 | Phase 9 | Complete |
| INS-02 | Phase 9 | Complete |
| INS-03 | Phase 9 | Complete |
| INS-04 | Phase 9 | Complete |
| INS-05 | Phase 9 | Complete |
| INS-06 | Phase 9 | Complete |
| INS-07 | Phase 9 | Complete |
| ANAL-V2-01 | Phase 8 | Complete |
| ANAL-V2-02 | Phase 8 | Complete |
| EWR-01 | Phase 10 | Complete |
| EWR-02 | Phase 10 | Complete |
| EWR-03 | Phase 10 | Complete |
| EWR-04 | Phase 10 | Complete |
| EWR-05 | Phase 10 | Complete |
| EWR-06 | Phase 10 | Complete |
| EWR-07 | Phase 10 | Complete |
| SCH-01 | Phase 10.2 | Pending |
| SCH-02 | Phase 10.2 | Pending |
| SCH-03 | Phase 10.2 | Pending |
| SCH-04 | Phase 10.2 | Pending |
| SCH-05 | Phase 10.2 | Pending |
| SCH-06 | Phase 10.2 | Pending |
| SCH-07 | Phase 10.2 | Pending |
| SCH-08 | Phase 10.2 | Pending |
| SCH-09 | Phase 10.2 | Pending |
| SCH-10 | Phase 10.2 | Pending |
| SCH-11 | Phase 10.2 | Pending |
| SCH-12 | Phase 10.2 | Pending |
| SCH-13 | Phase 10.2 | Pending |
| SCH-14 | Phase 10.2 | Pending |
| SCH-15 | Phase 10.2 | Pending |
| SCH-16 | Phase 10.2 | Pending |

**Coverage:**
- Total requirements: 83
- Complete: 67
- Pending: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-04-03 — Phase 10.2 schedule & booking revamp (16 SCH requirements added)*
