# Specification: Sprint 4.2 — Encounter Finalization & Addenda

**Status:** ✅ COMPLETED
**Objective:** Implement a legally compliant clinical finalization workflow that locks encounter data, initiates billing, and allows for timestamped amendments (Addenda).

## Part 1: Backend — Immutability, MPPL Sync, & Addenda Schema ✅

1. **Global Lock Check:**
   - All PUT/PATCH/DELETE routes check `Encounter.is_finalized` — 10 route files, 21 guard checks.
   - Returns `409 Conflict: Encounter is finalized` when locked.

2. **Finalization Endpoint (`POST /encounters/{id}/finalize`):**
   - File: `backend/api/routes/encounter.py:300`
   - Permission: `ClinicalAction.FINALIZE_ENCOUNTER` (doctors & owners only)
   - Atomic: sets `is_finalized=true`, `finalized_at`, `signed_by_id`, `signed_at`
   - MPPL Sync: syncs resolved diagnoses back to `PatientProblem`
   - Transitions appointment status to `FINALIZED`
   - Audit: `AuditAction.FINALIZE`

3. **Addenda Table & Model:**
   - Model: `EncounterAddendum` in `backend/db/models/tenant/clinical.py`
   - Columns: `id` (UUID), `tenant_id`, `encounter_id` (FK), `content` (Text), `created_by_id` (FK→Staff), `created_at`
   - Immutable by design — no PUT/PATCH/DELETE endpoints
   - Migration: `backend/alembic/versions/0004_encounter_addenda.py`

4. **Addenda Endpoints:**
   - `GET /encounters/{id}/addenda` — list all, permission: `VIEW_ENCOUNTER`
   - `POST /encounters/{id}/addenda` — create (finalized encounters only), permission: `FINALIZE_ENCOUNTER`
   - Guard: returns 409 if encounter is NOT finalized
   - Audit: `AuditAction.CREATE_ADDENDUM`

## Part 2: Frontend — Finalize Modal & Global Read-Only State ✅

1. **Finalize Modal (`components/encounter/FinalizeModal.tsx`):**
   - Read-only summary: chief complaint, vitals (IOP, BP), diagnoses (ICD-10), final refraction
   - Validation: attestation checkbox + assessment_and_plan >= 10 chars + >= 1 diagnosis
   - Calls `POST /api/encounters/{id}/finalize` via BFF
   - Dev fallback: local finalization when backend unreachable

2. **Read-Only Workspace:**
   - `clinicalReadOnly = isFinalized || !canEditClinical` in `page.tsx`
   - All forms receive `isReadOnly` prop
   - AI Scribe hidden when finalized; shows summary text instead
   - Finalized banner with lock icon, signed-by name, signature timestamp
   - Post-finalization actions: Superbill, Schedule Follow-Up, Back to Patient/Schedule

3. **Superbill Modal (`components/encounter/SuperbillModal.tsx`):**
   - MDM level display, CPT code management, total fee calculation
   - Mark Ready to Bill, Export CMS-1500 (JSON)

## Part 3: Addenda UI & Logic ✅

1. **AddendumSection Component (`components/encounter/AddendumSection.tsx`):**
   - Only renders when `isFinalized === true`, gated to doctor/owner roles
   - Chronological list of existing addenda (staff name + timestamp + content)
   - "Add Addendum" button → expandable textarea
   - **Confirmation dialog:** "Once submitted, addenda are permanent and cannot be deleted or edited. Continue?" — prevents accidental submission of incomplete legal amendments
   - Self-contained data fetching via `apiFetch` (no store needed)
   - Glass-card styling consistent with encounter page

2. **BFF Route:** `app/api/encounters/[encounterId]/addenda/route.ts` — GET + POST proxy
