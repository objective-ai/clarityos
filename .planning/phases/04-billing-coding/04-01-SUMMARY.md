---
phase: "04"
plan: "01"
subsystem: billing
tags: [billing, superbill, cpt, icd10, cms1500, mdm, e-m-coding]
dependency_graph:
  requires: [encounters, diagnoses, exam-findings, refractions, patient-problems]
  provides: [superbill-crud, mdm-calculation, cms1500-export, cpt-icd-validation]
  affects: [encounter-page, permissions, audit-log]
tech_stack:
  added: []
  patterns: [superbill-per-encounter, mdm-2of3-rule, cpt-icd-pointer-validation, cms1500-json-export]
key_files:
  created:
    - backend/alembic/versions/0003_billing.py
    - backend/schemas/billing.py
    - backend/api/routes/billing.py
    - types/billing.ts
    - store/billingStore.ts
    - lib/utils/cms1500.ts
    - components/encounter/SuperbillModal.tsx
  modified:
    - backend/db/models/tenant/clinical.py
    - backend/core/permissions.py
    - backend/main.py
    - app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx
decisions:
  - Superbill auto-creates on modal open with AI-suggested CPT codes based on encounter data
  - MDM uses 2021 E&M guideline 2-of-3 rule (problem complexity, data reviewed, risk)
  - CMS-1500 export produces standard clearinghouse JSON (not PDF) for electronic submission
  - Billing permissions granted to doctor, admin, owner roles (not technician or receptionist)
  - Superbill is 1:1 with encounter (unique constraint on encounter_id)
metrics:
  duration: "~9 minutes"
  completed: "2026-03-06T05:40:00Z"
---

# Phase 4 Plan 1: Billing & Coding Summary

Full-stack billing system with superbill CRUD, MDM complexity calculator, CPT-ICD pointer validation, and CMS-1500 clearinghouse export.

## What Was Built

### Backend (Python FastAPI)

**Models** (clinical.py):
- `Superbill` — billing record linked to finalized encounter with MDM level, suggested E&M code, total fee
- `SuperbillLineItem` — CPT line item with fee, units, diagnosis pointers (JSONB), modifiers
- `ClaimStatus` enum — draft, ready_to_bill, submitted, accepted, rejected
- `AuditAction` additions — create_superbill, update_superbill, submit_superbill

**Schemas** (billing.py):
- Request/response schemas for superbill CRUD and line items
- MDM calculation result schema with reasoning breakdown
- CPT-ICD warning schema for pointer validation
- ICD-10 format validation on diagnosis pointers

**Routes** (billing.py):
- `POST /encounters/{id}/superbill` — create with auto-suggested CPT codes and MDM calculation
- `GET /encounters/{id}/superbill` — read with pointer validation warnings
- `PATCH /encounters/{id}/superbill` — update status/notes
- `POST /encounters/{id}/superbill/line-items` — add CPT line item
- `DELETE /encounters/{id}/superbill/line-items/{id}` — remove line item
- `GET /encounters/{id}/superbill/mdm` — recalculate MDM (stateless)

**MDM Calculator**:
- Evaluates 3 components: problem complexity, data reviewed, risk level
- Problem points: self-limited (1pt), stable chronic (2pt), exacerbation (3pt), acute (3pt)
- Data points: exam sections + diagnosis notes reviewed
- Risk: keyword matching against known high-risk (glaucoma, retinal detachment) and moderate-risk conditions
- Applies 2-of-3 rule: second-highest score determines MDM level
- Maps to E&M: straightforward/low -> 99213, moderate -> 99214, high -> 99215

**Permissions**: VIEW_BILLING and MANAGE_BILLING for doctor, admin, owner

**Migration**: 0003_billing creates superbills + superbill_line_items tables, claim_status_enum, audit action values

### Frontend (Next.js 14)

**Types** (billing.ts):
- Full TypeScript types mirroring backend schemas
- CPT_CATALOG with 11 common optometry codes and default fees

**Store** (billingStore.ts):
- Zustand store keyed by encounterId
- Actions: loadSuperbill, createSuperbill, updateStatus, addLineItem, removeLineItem, calculateMdm
- Selector hooks: useSuperbill, useBillingWarnings, useMdmResult

**CMS-1500 Export** (cms1500.ts):
- Maps superbill to standard CMS-1500 form fields (Boxes 1-33)
- ICD-10 diagnosis pointer letter assignment (A-L, max 12)
- Service lines with CPT codes, modifiers, charges in cents
- Validation function checks required fields
- JSON download function for clearinghouse submission

**SuperbillModal** (SuperbillModal.tsx):
- Glass UI dialog matching existing design system
- MDM complexity badge with color-coded severity
- CPT line items table with inline diagnosis pointer badges
- Add CPT dropdown from catalog (filters already-added codes)
- Remove line item with trash button
- CPT-ICD validation warnings displayed prominently
- Mark Ready to Bill button (disabled if warnings exist)
- CMS-1500 JSON export download
- Auto-creates superbill on first open

**Encounter Page Integration**:
- Superbill button added to finalized encounter banner
- SuperbillModal wired with open/close state

## Requirements Coverage

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| BILL-01: Superbill modal from finalize | Done | SuperbillModal triggered from finalized banner |
| BILL-02: billingStore | Done | Zustand store with full CRUD actions |
| BILL-03: CMS-1500 exporter | Done | lib/utils/cms1500.ts with standard JSON schema |
| BILL-04: AI MDM Calculator | Done | 2-of-3 rule algorithm in billing routes |
| BILL-05: E&M code suggestion | Done | MDM maps to 99213/99214/99215 |
| BILL-06: CPT-ICD pointer validation | Done | Warnings when CPT lacks supporting diagnosis |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Backend | 6a2c63a | Models, schemas, routes, migration, permissions |
| Types + Store | 112a4c4 | TypeScript types and Zustand store |
| CMS-1500 | 8a418f9 | CMS-1500 clearinghouse export utility |
| UI + Integration | 20f81f4 | SuperbillModal and encounter page integration |
