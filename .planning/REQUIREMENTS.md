# Requirements: ClarityOS EHR — MVP

**Defined:** 2026-03-05
**Core Value:** Clinicians can complete a full eye exam encounter in a workflow that feels faster than paper, with every action audited and every record tamper-proof.

## v1 Requirements

Requirements for the full MVP. Each maps to roadmap phases.

### Security & Auth

- [ ] **SEC-01**: Dev auth bypass removed — backend requires valid JWT at startup, no fallback identity when SUPABASE_JWT_SECRET is empty
- [ ] **SEC-02**: Hardcoded SECRET_KEY default removed — startup fails if SECRET_KEY env var is unset
- [ ] **SEC-03**: Hardcoded Supabase project reference in config.py replaced with env var
- [ ] **SEC-04**: User can log in with email/password via Supabase Auth on a dedicated /login page
- [ ] **SEC-05**: User can log out and all ePHI is cleared from localStorage (SOAP notes, encounter data, clinical transcripts)
- [ ] **SEC-06**: User session persists across browser refresh via Supabase JWT cookie
- [ ] **SEC-07**: Next.js middleware protects all tenant routes — unauthenticated users redirected to /login
- [ ] **SEC-08**: sessionStore hydrates from real Supabase JWT claims (role, tenant_id, entitlements) instead of mock session
- [ ] **SEC-09**: Security headers added to Next.js config (CSP, X-Frame-Options, X-Content-Type-Options)
- [ ] **SEC-10**: Zustand devtools disabled in production builds

### Infrastructure

- [ ] **INF-01**: Python backend relocated from app/ to backend/ directory (resolves Next.js namespace conflict)
- [ ] **INF-02**: Alembic initialized with async migration environment for existing SQLAlchemy models
- [ ] **INF-03**: Initial Alembic migration generated from current model state (baseline migration)
- [ ] **INF-04**: Next.js BFF route handler for audit log API (/api/audit-logs proxying to FastAPI)
- [ ] **INF-05**: Next.js BFF route handler for AI Scribe accept endpoint (/api/ai-scribe/accept proxying to FastAPI)
- [ ] **INF-06**: Supabase Custom Access Token Hook injects tenant_id and role into JWT claims

### API Integration

- [ ] **API-01**: encounterStore migrated from mock data to real apiFetch() calls
- [ ] **API-02**: vitalsStore migrated from mock data to real apiFetch() calls
- [ ] **API-03**: refractionStore migrated from mock data to real apiFetch() calls
- [ ] **API-04**: examFindingsStore migrated from mock data to real apiFetch() calls
- [ ] **API-05**: diagnosisStore migrated from mock data to real apiFetch() calls
- [ ] **API-06**: problemListStore migrated from mock data to real apiFetch() calls
- [ ] **API-07**: Mock persona seed imports removed from all 9 production pages
- [ ] **API-08**: apiFetch() updated to use Supabase session token for Authorization header

### Scheduling

- [ ] **SCHED-01**: Appointment model and Alembic migration (patient_id, provider_id, datetime, duration, status, type, notes)
- [ ] **SCHED-02**: Appointment CRUD API endpoints on FastAPI (create, read, update, cancel, list by date range)
- [ ] **SCHED-03**: Schedule page wired to real appointment data instead of mock schedule
- [ ] **SCHED-04**: Check-in workflow — appointment status transitions (scheduled → checked_in → in_exam → completed)
- [ ] **SCHED-05**: Encounter creation from appointment (link appointment to new encounter)

### HIPAA Compliance

- [ ] **HIPAA-01**: PHI read logging on all GET endpoints that return patient/encounter data
- [ ] **HIPAA-02**: Audit trail sidebar in encounter view wired to real audit log API (currently 404s)
- [ ] **HIPAA-03**: Automatic session timeout after 30 minutes of inactivity

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
- [ ] **INTAKE-04**: AI Triage — async AI check on "Reason for Visit"; flags urgent conditions (e.g., flashing lights → "Possible RD") with red badge on Schedule View

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
- **DEP-V2-02**: CI/CD pipeline (GitHub Actions → Vercel + Render)
- **DEP-V2-03**: Supabase RLS policies as defense-in-depth

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
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 1 | Pending |
| SEC-05 | Phase 1 | Pending |
| SEC-06 | Phase 1 | Pending |
| SEC-07 | Phase 1 | Pending |
| SEC-08 | Phase 1 | Pending |
| SEC-09 | Phase 1 | Pending |
| SEC-10 | Phase 1 | Pending |
| INF-01 | Phase 1 | Pending |
| INF-02 | Phase 1 | Pending |
| INF-03 | Phase 1 | Pending |
| INF-04 | Phase 1 | Pending |
| INF-05 | Phase 1 | Pending |
| INF-06 | Phase 1 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 2 | Pending |
| API-03 | Phase 2 | Pending |
| API-04 | Phase 2 | Pending |
| API-05 | Phase 2 | Pending |
| API-06 | Phase 2 | Pending |
| API-07 | Phase 2 | Pending |
| API-08 | Phase 2 | Pending |
| HIPAA-01 | Phase 2 | Pending |
| HIPAA-02 | Phase 2 | Pending |
| HIPAA-03 | Phase 2 | Pending |
| SCHED-01 | Phase 3 | Pending |
| SCHED-02 | Phase 3 | Pending |
| SCHED-03 | Phase 3 | Pending |
| SCHED-04 | Phase 3 | Pending |
| SCHED-05 | Phase 3 | Pending |
| BILL-01 | Phase 4 | Pending |
| BILL-02 | Phase 4 | Pending |
| BILL-03 | Phase 4 | Pending |
| BILL-04 | Phase 4 | Pending |
| BILL-05 | Phase 4 | Pending |
| BILL-06 | Phase 4 | Pending |
| PAT-01 | Phase 5 | Pending |
| PAT-02 | Phase 5 | Pending |
| PAT-03 | Phase 5 | Pending |
| PAT-04 | Phase 5 | Pending |
| PAT-05 | Phase 5 | Pending |
| OPT-01 | Phase 6 | Pending |
| OPT-02 | Phase 6 | Pending |
| OPT-03 | Phase 6 | Pending |
| OPT-04 | Phase 6 | Pending |
| INTAKE-01 | Phase 7 | Pending |
| INTAKE-02 | Phase 7 | Pending |
| INTAKE-03 | Phase 7 | Pending |
| INTAKE-04 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 51 total
- Mapped to phases: 51
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after roadmap creation (7 phases, 51 requirements mapped)*
