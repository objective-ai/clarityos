# ClarityOS EHR

## What This Is

A multi-tenant optometry EHR/PMS SaaS application targeting California solo and small-group practices. ClarityOS encodes structured optometric exam workflows — vitals, refractions, anterior/posterior findings, ICD-10 diagnoses with laterality, and finalization with attestation — into a glassmorphism-designed interface that prioritizes clinical speed and HIPAA compliance.

## Core Value

Clinicians can complete a full eye exam encounter — from vitals through finalization — in a workflow that feels faster than paper, with every action audited and every record tamper-proof.

## Requirements

### Validated

- ✓ Encounter workflow (vitals, refractions, exam findings, diagnoses, MPPL, finalization) — Phase 1-3
- ✓ AI Scribe with streaming SOAP narrative + structured JSON autofill — Phase 2
- ✓ Clinical Diff Viewer with field-level revert — Phase 2
- ✓ Finalize & Sign modal with diagnosis guardrail and attestation — Phase 2
- ✓ RBAC with 16-action permission matrix across 5 roles — Phase 2
- ✓ HIPAA-compliant audit trail (append-only, timestamped, staff-linked) — Phase 2
- ✓ Multi-tenant routing with tenant-level branding customization — Phase 1-2
- ✓ Glassmorphism design system with light/dark theme and accent color picker — UI
- ✓ Admin panel (staff management, branding, compliance/audit log viewer) — Admin
- ✓ Patient list with search and patient chart modal — Phase 2
- ✓ Schedule page with timeline glass cards — Phase 2
- ✓ Dashboard command center with stat cards and quick actions — Phase 2

### Active

- [ ] Real authentication (Supabase Auth) replacing mock sessions
- [ ] Connect frontend to FastAPI backend (replace all mock data with real API calls)
- [ ] Patient detail page with Rx history and encounter timeline
- [ ] Encounter addenda (timestamped amendments without reopening finalized encounters)
- [ ] Real-time scheduling with appointment booking and calendar workflow
- [ ] FHIR R4 export endpoints (Patient, Encounter, Condition, Observation)
- [ ] Analytics dashboard pulling from real encounter/patient data

### Out of Scope

- Patient portal (online booking, Rx access, secure messaging) — deferred to future milestone
- Billing & insurance integration (claim submission, ERA processing) — deferred to future milestone
- Optical POS & inventory (frame/lens matrix) — deferred to future milestone
- OCT & visual field device import — deferred to future milestone
- Mobile native app — web-first approach, responsive design covers mobile
- Real-time collaboration (multi-provider editing same encounter) — unnecessary complexity for target market

## Context

### Current State
The frontend is fully built with rich clinical UI but runs entirely on **mock data**. Nine Zustand stores seed from `lib/mock/personas.ts` on encounter mount. The FastAPI backend exists with SQLAlchemy models, Pydantic schemas, and route handlers for encounters, vitals, refractions, diagnoses, exam findings, and MPPL — but the frontend doesn't call it yet.

### Technical Debt (from codebase audit)
- **5 critical security issues**: dev auth bypass, hardcoded SECRET_KEY, no Next.js route middleware, unconditional mock session, hardcoded Supabase ref in config
- **2 critical HIPAA gaps**: no PHI access logging on GET endpoints, audit trail sidebar calls nonexistent API route
- **Python/Next.js namespace conflict**: FastAPI files co-located in `app/` alongside App Router pages
- **Zero test coverage**: no unit tests, no integration tests, no E2E tests
- **Mock data entanglement**: 9 production pages import directly from mock modules

### Deployment
- Frontend: Vercel (already deployed at clarityos-erp.vercel.app)
- Backend: Undecided — likely Railway, Fly.io, or Render for FastAPI
- Database: Supabase PostgreSQL (already provisioned)
- Auth: Supabase Auth (to be integrated)

### Target Market
California solo and small-group optometry practices (1-4 providers). The product is positioned as a modern alternative to legacy EHR systems, emphasizing clinical workflow speed and audit-proof documentation.

## Constraints

- **Stack**: Next.js 14 (App Router) + Tailwind 3.4 + shadcn/ui + Zustand — established, not changing
- **Backend**: FastAPI + PostgreSQL via SQLAlchemy — established, not changing
- **Auth**: Supabase Auth — decided, needs integration
- **Compliance**: HIPAA-compliant audit logging required for all ePHI access
- **Design**: Glassmorphism aesthetic per BRAND_GUIDELINES.md — must maintain consistency
- **California law**: Civil Code § 1633.7 (e-signatures), B&P 3041 (license/NPI on records)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase Auth over custom JWT | Managed auth reduces security surface, built-in RLS | — Pending |
| FastAPI on separate host (not Vercel) | Python runtime needs persistent process, Vercel is serverless | — Pending |
| Replace mock data incrementally (store by store) | Avoids big-bang migration, each store can be tested independently | — Pending |
| FHIR R4 as export-only (not full FHIR server) | Interoperability requirement met without FHIR server complexity | — Pending |
| Move Python backend out of `app/` directory | Resolves Next.js App Router namespace conflict | — Pending |

---
*Last updated: 2026-03-05 after initialization*
