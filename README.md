# ClarityOS EHR

A modern, cloud-native optometry EHR/PMS built for California solo and small-group practices. ClarityOS encodes structured optometric exam workflows into a glassmorphism-designed interface that prioritizes clinical speed, HIPAA compliance, and audit-proof documentation.

**Stack:** Next.js 14 (App Router) + Tailwind 3.4 + shadcn/ui + Zustand | FastAPI + PostgreSQL + Supabase Auth

---

## Features

### Clinical Workflow
- **Full encounter lifecycle** — vitals, refractions, exam findings, ICD-10 diagnoses, assessment & plan, finalization with e-signature
- **Keyboard-first refraction grid** — tab through SPH/CYL/AXIS/ADD per eye, arrow keys adjust in standard optometric steps (0.25D, 1 degree)
- **One-click WNL documentation** — mark entire anterior/posterior segments as "within normal limits" in one action
- **OD to OS copy** — duplicate symmetric findings from right to left eye instantly
- **Master Patient Problem List (MPPL)** — persistent longitudinal conditions with one-click promotion into encounters, bidirectional sync on finalization
- **ICD-10 diagnosis picker** — search + laterality (OD/OS/OU) + severity built in

### AI-Powered
- **AI Scribe** — ambient dictation streams a SOAP note in real time while simultaneously autofilling structured data across all 5 clinical grids (vitals, refractions, exam findings, diagnoses, chief complaint)
- **Clinical Diff Viewer** — field-by-field comparison of AI suggestions with per-field accept/revert before committing
- **AI Prep Me** — generates a 2-sentence clinical summary from the patient's last 3 finalized encounters before a visit
- **AI Triage** — intake chief complaints are classified as routine/moderate/urgent with clinical flags (e.g., "flashing lights" flagged as possible retinal detachment)
- **AI MDM Calculator** — evaluates Medical Decision Making complexity from encounter data, suggests correct E&M level (99213/99214/99215)

### Scheduling
- **Day view with date navigation** — prev/next/today/date picker
- **Appointment booking modal** — patient, provider, type, date/time, duration, chief complaint
- **Check-in workflow** — scheduled -> checked_in -> in_exam -> completed status transitions
- **Start Exam from schedule** — creates linked encounter and navigates to encounter view (idempotent)
- **Cancel with reason** — minimum 3 chars, audit logged

### Billing & Coding
- **Superbill auto-generation** — AI-suggested CPT codes mapped to encounter ICD-10 diagnoses
- **MDM scoring** — 2021 E&M 2-of-3 rule (problem complexity, data reviewed, risk)
- **Diagnosis pointer validation** — warns when CPT codes lack supporting diagnoses
- **CMS-1500 JSON export** — standard clearinghouse format for claim submission

### Patient Management
- **Patient CRUD** — demographics, contact info, insurance, emergency contacts, medical history (all JSONB)
- **Patient detail page** — encounter timeline, clinical flowsheets (IOP + refraction trends across visits)
- **Patient search** — name, DOB, MRN with real-time filtering

### Optical Handoff
- **Optical dashboard** — finalized encounters with final Rx automatically queue for optical
- **Rx PDF generator** — printable prescription with provider signature, license, NPI, expiration
- **Rx Change Alert** — SE formula (sphere + cylinder/2) flags changes > 0.50D from prior year
- **Optical status tracking** — waiting -> in_progress -> dispensed

### Patient Intake
- **Public intake forms** — mobile-first multi-step form (demographics, medical history, ROS, chief complaint) accessible without login via time-limited token
- **QR code sharing** — staff generate QR codes for patients to scan and access their intake form
- **DOB verification** — patients verify identity via date of birth (3 attempt lockout)
- **AI triage badges** — urgent/moderate flags appear on the schedule view with clinical reasoning

### Security & Compliance
- **Supabase Auth** — JWT with custom access token hook injecting tenant_slug, role, staff_id, plan_name
- **Schema-per-tenant isolation** — each clinic operates in a separate PostgreSQL schema
- **RBAC with 5 roles** — doctor, technician, receptionist, admin, owner (16-action permission matrix)
- **HIPAA audit trail** — append-only, timestamped, staff-linked logging of all ePHI access (reads + writes)
- **Finalize & Sign** — guided 7-step review with diagnosis guardrail, attestation, and one-way seal
- **Session timeout** — 30-minute inactivity auto-logout with ePHI cleanup from browser storage
- **Soft-delete only** — clinical records are never hard-deleted (6-year HIPAA retention)

### Design & UX
- **Glassmorphism design system** — glass cards, ambient gradients, light/dark theme
- **Tenant-customizable accent color** — 8 presets + custom hex with WCAG AA contrast indicator
- **Responsive layout** — collapsible sidebar, mobile-friendly intake forms
- **Auto-save** — 1.5s debounce + flush on blur, localStorage backup for crash recovery
- **Exit guards** — unsaved clinical data triggers browser confirmation on navigation

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+ (via Supabase)

### Development

```bash
# Frontend
npm install
npm run dev          # http://localhost:3000

# Backend
cd backend
python -m venv venv
venv/Scripts/activate   # Windows
pip install -r requirements.txt
uvicorn backend.main:app --reload   # http://localhost:8000

# Seed demo data
cd backend && RESEED=true python seed_db.py
```

### Dev Credentials
- Email: duytran@yahoo.com
- Password: 123456
- Tenant: Sunview Eye Care (slug: sunview)

### Commands
```bash
bash scripts/dev.sh restart-api    # Kill + restart FastAPI
bash scripts/dev.sh check-api      # Health-check both servers
bash scripts/dev.sh smoke          # Login + hit key pages
bash scripts/dev.sh verify         # Run Playwright E2E tests
npm run test                       # Vitest unit tests
npx tsc --noEmit                   # Type-check
```

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript 5.5 strict |
| Styling | Tailwind CSS 3.4, shadcn/ui, CSS custom properties |
| State | Zustand 4.5 with devtools + persist |
| Backend | Python FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| Database | PostgreSQL (schema-per-tenant) via Supabase |
| Auth | Supabase Auth (JWT HS256) with custom access token hook |
| AI | Anthropic Claude API (Sonnet for scribe/triage/prep, structured JSON output) |

### File Layout
```
app/(tenant)/[tenant]/     Tenant pages (dashboard, schedule, patients, encounter, admin, optical)
app/api/                   BFF proxy routes to FastAPI
app/intake/                Public patient intake form (no auth required)
backend/api/routes/        FastAPI endpoints
backend/db/models/         SQLAlchemy ORM (public/ + tenant/)
backend/schemas/           Pydantic request/response models
backend/core/              Auth, config, triage, entitlements
components/                React components (encounter/, schedule/, ui/)
store/                     Zustand stores
types/                     TypeScript type definitions
lib/                       Utilities (bff.ts, auth/, color-utils, rx-format)
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/pitch-california.md](docs/pitch-california.md) | Market positioning & feature pitch for CA optometrists |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture reference |
| [docs/technical-specification.md](docs/technical-specification.md) | California-compliant technical spec |
| [docs/BRAND_GUIDELINES.md](docs/BRAND_GUIDELINES.md) | Design system (colors, typography, components, motion) |
| [CLAUDE.md](CLAUDE.md) | Claude Code development instructions |

---

## Roadmap

### MVP (v1.0) — Complete

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Security & Auth Foundation | Done |
| 2 | API Integration & HIPAA Compliance | Done |
| 3 | Scheduling | Done |
| 4 | Billing & Coding | Done |
| 5 | Patient Profile | Done |
| 6 | Optical Handoff | Done |
| 7 | Patient Intake | Done |

### V2 (Post-MVP)
- Fee Schedule Management — admin UI for clinic-specific CPT fee schedules
- AI Scribe E2E — audio transcript to SOAP note generation
- Encounter Addenda — timestamped amendments without reopening
- Patient Rx History — longitudinal refraction history
- Multi-payer Billing — per-payer fee schedules, ERA/EOB import

---

## License

Proprietary. All rights reserved.
