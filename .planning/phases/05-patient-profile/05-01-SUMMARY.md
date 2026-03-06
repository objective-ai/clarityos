---
phase: "05"
plan: "01"
subsystem: patient-profile
tags: [patient, crud, timeline, flowsheet, ai-prep-me, fullstack]
dependency-graph:
  requires: [clinical-models, encounter-api, ai-scribe-api, supabase-auth]
  provides: [patient-api, patient-crud, encounter-timeline, clinical-flowsheet, prep-me]
  affects: [patients-page, patient-detail-page, permissions]
tech-stack:
  added: []
  patterns: [bff-proxy, zustand-store, glass-ui, jsonb-contact-storage]
key-files:
  created:
    - backend/schemas/patient.py
    - backend/api/routes/patient.py
    - store/patientStore.ts
    - app/api/patients/route.ts
    - app/api/patients/[patientId]/route.ts
    - app/api/patients/[patientId]/prep-me/route.ts
    - components/patient/EncounterTimeline.tsx
    - components/patient/ClinicalFlowsheet.tsx
    - components/patient/PrepMeButton.tsx
  modified:
    - backend/main.py
    - backend/core/permissions.py
    - types/patient.ts
    - app/(tenant)/[tenantId]/patients/page.tsx
    - app/(tenant)/[tenantId]/patients/[patientId]/page.tsx
decisions:
  - Contact/insurance/emergency data stored in JSONB fields (contact_info_jsonb, medical_history_jsonb) since Patient model already uses this pattern
  - BFF routes proxy directly to FastAPI with server-side Supabase auth (cookie-based sessions)
  - Flowsheet prefers FINAL refraction type, falls back to MANIFEST
  - Prep Me uses Claude claude-sonnet-4-6-20250514 with 300 max_tokens for concise 2-sentence output
  - PHI_VIEWED audit action logged on patient detail access
metrics:
  duration: "~11 minutes"
  completed: "2026-03-06"
  tasks: 6
  files-created: 9
  files-modified: 5
---

# Phase 5 Plan 1: Patient Profile Summary

Full-stack patient profile with CRUD API, encounter timeline, clinical flowsheets, and AI pre-visit preparation.

## One-liner

Patient CRUD with search, tabbed detail page (demographics/encounters/flowsheets), IOP+Rx trend table, and AI Prep Me clinical summary from last 3 SOAP notes.

## Task Completion

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Backend Patient CRUD API (schemas, routes, permissions, search, detail, flowsheet, prep-me) | c840c81 | Done |
| 2 | Frontend types + Zustand patientStore | 23f3e66 | Done |
| 3 | BFF proxy routes for patient API | 4e57555 | Done |
| 4 | Patient UI components (EncounterTimeline, ClinicalFlowsheet, PrepMeButton) | d92c59e | Done |
| 5 | Patient list page wired to real API | 08b5543 | Done |
| 6 | Patient detail page with tabs | 08b5543 | Done |

## What Was Built

### Backend (PAT-01, PAT-05)

**Patient CRUD API** (`backend/api/routes/patient.py`):
- `GET /api/patients` - List with name search, pagination, last-visit dates
- `POST /api/patients` - Create with demographics, contact, insurance, emergency contact
- `GET /api/patients/{id}` - Full detail with PHI_VIEWED audit logging
- `PATCH /api/patients/{id}` - Partial update with field-level change tracking
- `DELETE /api/patients/{id}` - Soft delete with audit trail

**Encounter Timeline** (`GET /api/patients/{id}/encounters`):
- Reverse chronological encounter list
- Eager-loads provider name, diagnosis count, AI summary text

**Clinical Flowsheet** (`GET /api/patients/{id}/flowsheet`):
- IOP OD/OS from VitalsAndPretest per encounter
- Rx data (sphere, cylinder, add) from final/manifest Refraction per encounter

**AI Prep Me** (`POST /api/patients/{id}/prep-me`):
- Reads last 3 finalized SOAP notes (ai_summary_text or assessment_and_plan)
- Calls Claude claude-sonnet-4-6-20250514 for 2-sentence clinical summary
- Audit-logged with AI model metadata

**RBAC** (`backend/core/permissions.py`):
- Added VIEW_PATIENT and MANAGE_PATIENT to ClinicalAction enum
- All roles can view/manage patients (front desk, tech, doctor, admin, owner)

### Frontend (PAT-02, PAT-03, PAT-04, PAT-05)

**Patient List Page** (`app/(tenant)/[tenantId]/patients/page.tsx`):
- Glass table with avatar initials, name, DOB/age, sex badge, phone, last visit
- Debounced search input (300ms)
- Linked rows navigate to patient detail

**Patient Detail Page** (`app/(tenant)/[tenantId]/patients/[patientId]/page.tsx`):
- Header: avatar, name, DOB/age, sex, phone, email, insurance summary
- Alert badges from medical_history_jsonb
- Prep Me button in header area
- Tab navigation: Demographics, Encounters, Flowsheets

**EncounterTimeline** (`components/patient/EncounterTimeline.tsx`):
- Vertical timeline with finalized/in-progress dots
- Shows date, provider, chief complaint, AI summary or assessment & plan
- Diagnosis count badge per encounter

**ClinicalFlowsheet** (`components/patient/ClinicalFlowsheet.tsx`):
- Data table: Date, IOP OD, IOP OS, Sph OD/OS, Cyl OD/OS, Add OD/OS
- Elevated IOP (>21 mmHg) highlighted in red, borderline (>18) in amber
- Alternating row colors with hover state

**PrepMeButton** (`components/patient/PrepMeButton.tsx`):
- Popover card with loading spinner and AI summary text
- Click-outside dismiss behavior
- Toggle on/off behavior

### Infrastructure

**BFF Proxy Routes**:
- `app/api/patients/route.ts` - GET list + POST create
- `app/api/patients/[patientId]/route.ts` - GET detail + PATCH update + DELETE
- `app/api/patients/[patientId]/prep-me/route.ts` - POST AI Prep Me (30s timeout)

**Zustand Store** (`store/patientStore.ts`):
- Full CRUD state management with loading/error states
- Encounter list, flowsheet data, prep-me summary state
- Selector hooks: usePatients, useActivePatient, usePatientEncounters, usePatientFlowsheet

## Deviations from Plan

None - plan executed exactly as written.

## Requirements Coverage

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| PAT-01: Patient CRUD API | Complete | Full REST API with search, audit logging, RBAC |
| PAT-02: Patient detail page | Complete | Tabbed UI with demographics, alerts, insurance |
| PAT-03: Encounter timeline | Complete | Chronological feed with provider, CC, AI summary |
| PAT-04: Clinical flowsheets | Complete | IOP + Rx data table across visits |
| PAT-05: Prep Me button | Complete | AI 2-sentence summary from last 3 SOAP notes |

## Self-Check: PASSED

All 9 created files exist. All 5 commits verified in git log.
