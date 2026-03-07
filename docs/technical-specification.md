# ClarityOS — California-Compliant Technical Specification

**Version:** 2.0
**Date:** March 2026
**Status:** MVP Complete — All 7 Phases Delivered
**Stack:** Next.js 14 (App Router) / FastAPI / PostgreSQL (schema-per-tenant) / Supabase Auth

---

## Table of Contents

1. [Audit Trail & Encounter Finalization](#1-audit-trail--encounter-finalization)
2. [Clinical Data Architecture](#2-clinical-data-architecture)
3. [Master Patient Problem List (MPPL) Continuity](#3-master-patient-problem-list-mppl-continuity)
4. [Security & Row-Level Tenant Isolation](#4-security--row-level-tenant-isolation)
5. [Data Portability & FHIR Readiness](#5-data-portability--fhir-readiness)
6. [Scheduling & Appointment Workflow](#6-scheduling--appointment-workflow)
7. [Billing & Coding](#7-billing--coding)
8. [Patient Profile & Clinical Flowsheets](#8-patient-profile--clinical-flowsheets)
9. [Optical Handoff](#9-optical-handoff)
10. [Patient Intake & AI Triage](#10-patient-intake--ai-triage)

---

## 1. Audit Trail & Encounter Finalization

### 1.1 Design Principles

Every clinical encounter in ClarityOS follows a **one-way seal** pattern: once finalized, the record is permanently locked. This satisfies California Board of Optometry requirements for tamper-proof clinical documentation and aligns with HIPAA audit trail mandates (45 CFR 164.312(b)).

### 1.2 Encounter Lifecycle

```
PRE_TEST → IN_EXAM → FINALIZED (one-way, irreversible)
```

| State | Who | What Happens |
|-------|-----|-------------|
| `pre_test` | Technician | Vitals, IOP, visual acuity, autorefraction recorded |
| `in_exam` | Doctor (OD) | Exam findings, refraction, diagnoses entered |
| `finalized` | Doctor (OD) | Assessment & Plan written, encounter signed and locked |

Note: `status` is computed, not stored as a DB column. Derived from `is_finalized` + `appointment.status`.

### 1.3 Finalization Data Model

**Database columns on `encounters` table:**

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `is_finalized` | `BOOLEAN` | NOT NULL, default `FALSE` | Lock flag — once `TRUE`, no further edits |
| `finalized_at` | `TIMESTAMPTZ` | nullable | UTC timestamp of finalization |
| `signed_by_id` | `UUID` | FK -> `staff.id`, ON DELETE RESTRICT | Staff member who e-signed |
| `signed_at` | `TIMESTAMPTZ` | nullable | UTC timestamp of signature |
| `assessment_and_plan` | `TEXT` | nullable (required at finalization) | Doctor's clinical assessment and plan |
| `appointment_id` | `UUID` | FK -> `appointments.id` | Links encounter to originating appointment |

### 1.4 Finalization Endpoint

```
POST /encounters/{encounter_id}/finalize
```

**Request schema (`EncounterFinalizeRequest`):**
```python
assessment_and_plan: str   # min 10 chars, max 10,000 chars — REQUIRED
additional_notes: str | None  # max 5,000 chars — optional
```

**Server-side flow:**

1. **Staff identity resolution:** Looks up `Staff` record matching `user_id` (from JWT `sub` claim) + `tenant_id` + `is_active = True`
2. **Authorization gate:** Returns `403 Forbidden` if no active staff record exists for the authenticated user
3. **Idempotency guard:** Returns `409 Conflict` if the encounter is already finalized
4. **The Seal:**
   - Sets `assessment_and_plan` from request payload
   - Sets `is_finalized = True`
   - Sets `finalized_at = NOW()` (UTC)
   - Sets `signed_by_id = staff.id`
   - Sets `signed_at = NOW()` (UTC)
5. **Post-finalization sync:** Propagates resolved diagnoses back to the Master Problem List (see Section 3)
6. **Superbill auto-generation:** Creates a Superbill with AI-suggested CPT codes (see Section 7)

### 1.5 Frontend Finalization Flow

1. Doctor clicks **"Finalize"** in the TopNav status area or EncounterBottomTabs
2. Both trigger `useEncounterStore.setFinalizeModalOpen(true)` — a single `<FinalizeModal>` opens
3. Modal displays a **7-section clinical summary**:
   - **Chief Complaint** — read-only
   - **Vitals** — IOP OD/OS with elevation alert if > 21 mmHg, Blood Pressure
   - **Diagnoses** — Active ICD-10 codes with laterality badges (hard block if none)
   - **Final Rx** — OD/OS table (Sph/Cyl/Axis/Add)
   - **Assessment & Plan** — Editable textarea (min 10 characters)
   - **Attestation** — Required checkbox
   - **Sign & Seal Chart** — Disabled until all gates satisfied
4. **Gate logic:**
```typescript
const canSubmit = attested && assessmentPlan.trim().length >= 10
  && activeDiagnoses.length > 0 && !isSubmitting;
```
5. On success: encounter locks, green banner shows signer name + timestamp

### 1.6 Dirty State Guard & Auto-Save

- **Exit Guard (`beforeunload`):** Browser prompts on tab close when unsaved transcript exists
- **localStorage Auto-Save:** Transcript keyed by encounter ID, recovered on mount
- **1.5s Debounced API Save:** All clinical stores auto-save to server after 1.5s of inactivity + flush on blur
- **Finalization-aware:** Exit guard deactivates after signing

### 1.7 Immutability Guarantees

- **Backend:** Every mutation checks `is_finalized` and returns `409 Conflict` if locked
- **Backend:** Sub-resource mutations (vitals, refractions, diagnoses, exam findings) check parent encounter
- **Frontend:** All form components accept `isReadOnly` prop derived from `encounterState.isFinalized`
- **Database:** `SoftDeleteMixin` — no clinical record is ever hard-deleted

### 1.8 Timestamp Integrity

All timestamps use PostgreSQL `server_default=func.now()` — the database server clock is the source of truth, not the application layer.

---

## 2. Clinical Data Architecture

### 2.1 Overview

```
Encounter (master record)
├── VitalsAndPretest (1:1)
├── Refraction[] (1:many, ordered by created_at)
├── ExamFindings[] (1:many, keyed by exam_section)
├── Diagnosis[] (1:many)
├── Superbill (1:1, auto-generated on finalization)
└── Appointment (1:1, bidirectional link)
```

### 2.2 Vitals & Pre-Testing

**Model:** `VitalsAndPretest` — one record per encounter (UNIQUE on `encounter_id`)

| Domain | Fields | Validation |
|--------|--------|-----------|
| **IOP** | `iop_od`, `iop_os` (Numeric 5,1) | 0-80 mmHg; > 21 triggers alert |
| **IOP Metadata** | `iop_method`, `iop_time` | Method normalized to title-case |
| **Distance VA** | `ucva_od`, `ucva_os`, `bcva_od`, `bcva_os` | Snellen notation (e.g., "20/20") |
| **Near VA** | `near_va_od`, `near_va_os` | Snellen notation |
| **Systemic** | `blood_pressure`, `pulse` | BP regex, systolic 60-250, diastolic 30-150, pulse 30-250 |
| **Pupils** | `pupils_equal_round_reactive`, `relative_afferent_pupillary_defect` | PERRLA + RAPD |
| **Notes** | `cover_test_notes`, `technician_notes` | Free-text |
| **Audit** | `recorded_by_id` (FK -> staff) | Technician who recorded |

### 2.3 Refraction

**Model:** `Refraction` — multiple per encounter, classified by `refraction_type`

**Types:** `habitual` | `auto` | `manifest` | `cycloplegic` | `final`

| Field Group | Fields | Constraints |
|------------|--------|-------------|
| **Sphere** | `od_sphere`, `os_sphere` | +/-25.00 D, 0.25 D steps |
| **Cylinder** | `od_cylinder`, `os_cylinder` | +/-8.00 D, 0.25 D steps |
| **Axis** | `od_axis`, `os_axis` | 1-180 degrees (CHECK constraint) |
| **Add** | `od_add`, `os_add` | +0.75 to +3.50 D |
| **Prism** | `od_prism`/`od_prism_base`, `os_prism`/`os_prism_base` | 0-20 delta, IN/OUT/UP/DOWN |
| **VA** | `od_visual_acuity`, `os_visual_acuity` | Snellen notation |
| **PD** | `pd_distance`, `pd_near` (binocular) or `pd_od`, `pd_os` (monocular) | Mutually exclusive |

**Cross-field validators:** Cylinder requires axis, prism requires base direction, `is_final_rx = True` requires PD values.

### 2.4 Exam Findings

**Model:** `ExamFindings` — JSONB-based structured exam notes with OD/OS laterality

| Section Key | Label | Description |
|------------|-------|-------------|
| `anterior_segment` | Anterior Segment (Slit Lamp) | Cornea, conjunctiva, iris, lens, anterior chamber |
| `posterior_segment` | Posterior Segment (Fundus) | Retina, optic nerve, macula, vitreous |

**UNIQUE constraint:** `(encounter_id, exam_section)`

**Key columns:** `is_normal_wnl` (Boolean), `findings_od` (JSONB), `findings_os` (JSONB), `provider_notes` (Text), `patient_id` (FK)

### 2.5 Diagnosis

**Model:** `Diagnosis` — ICD-10-CM coded conditions

| Field | Type | Validation |
|-------|------|-----------|
| `icd10_code` | String(20) | Regex: `^[A-Z]\d{2}(\.[A-Z0-9]{1,4})?$` |
| `description` | String(500) | Human-readable name |
| `eye_affected` | Enum | `OD` / `OS` / `OU` |
| `severity` | String(50) | `mild` / `moderate` / `severe` |
| `status` | String(50) | `active` / `resolved` / `chronic` / `suspect` |

---

## 3. Master Patient Problem List (MPPL) Continuity

### 3.1 Data Model

**Model:** `PatientProblem` — persistent condition list per patient

| Field | Type | Description |
|-------|------|-------------|
| `patient_id` | UUID FK -> patients | Owner patient |
| `icd10_code` | String(20) | ICD-10 code |
| `description` | String(500) | Condition name |
| `eye_affected` | Enum(EyeAffected) | OD / OS / OU |
| `status` | String(50) | `active` / `inactive` / `resolved` |
| `onset_date` | Date | When identified |
| `source_encounter_id` | UUID FK -> encounters | Originating encounter |

### 3.2 Copy-on-Promotion

```
POST /encounters/{encounter_id}/diagnoses/from-problem/{problem_id}
```

Creates a new Diagnosis by copying from PatientProblem. Patient ownership check prevents cross-patient data leaks. Frontend deduplicates by ICD-10 code.

### 3.3 Post-Finalization Sync-Back

When finalized, promoted diagnoses marked "resolved" update the corresponding PatientProblem to "resolved" with `resolved_date = encounter_date`.

---

## 4. Security & Row-Level Tenant Isolation

### 4.1 Authentication

**Provider:** Supabase Auth with custom access token hook (SQL, `SECURITY DEFINER`)

**JWT claims injected via hook:**

| Claim | Purpose |
|-------|---------|
| `sub` | Supabase user ID |
| `app_metadata.tenant_id` | Clinic tenant UUID |
| `app_metadata.tenant_slug` | URL slug (e.g., "sunview") |
| `app_metadata.role` | Staff role |
| `app_metadata.schema_name` | PostgreSQL schema name |
| `app_metadata.staff_id` | Staff record UUID |
| `app_metadata.full_name` | Display name |
| `app_metadata.plan_name` | Subscription tier |
| `app_metadata.clinic_name` | Practice name |

### 4.2 TenantContext

Every authenticated backend request carries an immutable `TenantContext`:

```python
@dataclass(frozen=True, slots=True)
class TenantContext:
    user_id: UUID      # Supabase auth user ID
    tenant_id: UUID    # Clinic tenant ID
    role: str          # Staff role
```

### 4.3 Query Scoping

Every database query includes `WHERE tenant_id = ctx.tenant_id` via `TenantBase` mixin. Schema isolation via `SET search_path TO {schema_name}`.

### 4.4 RBAC

Five roles (doctor, technician, receptionist, admin, owner) with 16-action permission matrix. Enforcement is dual-layered: server rejects unauthorized requests; UI removes controls entirely.

### 4.5 HIPAA Audit Trail

- Append-only `audit_logs` table
- Logs all ePHI access (reads and writes)
- Staff-linked with timestamp and IP address
- CSV export for compliance review
- Soft-delete only — no clinical record ever hard-deleted (6-year retention)

### 4.6 Session Security

- 30-minute inactivity timeout
- Logout clears all clinical Zustand stores + localStorage keys
- `beforeunload` exit guard for unsaved clinical data

---

## 5. Data Portability & FHIR Readiness

### 5.1 FHIR Resource Mapping

| ClarityOS Model | FHIR R4 Resource | Key Mappings |
|-----------------|-----------------|-------------|
| Patient | Patient | name, birthDate, gender, telecom |
| Encounter | Encounter | status, class, type, period, participant |
| VitalsAndPretest | Observation | LOINC codes for IOP, VA, BP |
| Refraction | VisionPrescription | lensSpecification (sphere, cylinder, axis, add) |
| ExamFindings | Observation | SNOMED codes for anterior/posterior sections |
| Diagnosis | Condition | ICD-10-CM code, laterality, clinicalStatus |
| PatientProblem | Condition (longitudinal) | onsetDateTime, abatementDateTime |

### 5.2 Export Strategy

Export-only FHIR endpoints (no full FHIR server). Appropriate for target market — solo practices need referral export, not FHIR server compliance.

---

## 6. Scheduling & Appointment Workflow

### 6.1 Appointment Model

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Tenant isolation |
| `patient_id` | UUID FK -> patients | Patient being seen |
| `provider_id` | UUID FK -> staff | Treating provider |
| `booked_by_id` | UUID FK -> staff | Who created the appointment |
| `start_time` | TIMESTAMPTZ | Appointment start |
| `duration_minutes` | Integer | Default 30 |
| `type` | String | comprehensive, follow_up, emergency, contact_lens, etc. |
| `status` | String | scheduled, confirmed, checked_in, in_exam, completed, cancelled, no_show |
| `chief_complaint` | Text | Reason for visit |
| `cancel_reason` | Text | Required if cancelled (min 3 chars) |

`end_time` is always derived: `start_time + duration_minutes`. Never accepted as input.

### 6.2 Status Transitions

```
scheduled → confirmed → checked_in → in_exam → completed
                ↘ cancelled (with reason)
scheduled → no_show
```

### 6.3 Start Exam Flow

```
POST /appointments/{id}/start-exam
```

1. Validates appointment is `checked_in`
2. Creates linked `Encounter` record (patient_id, provider_id, appointment_id)
3. Sets appointment status to `in_exam`
4. Returns encounter ID
5. **Idempotent:** Returns HTTP 200 + `already_existed=true` if encounter pre-exists

### 6.4 Frontend

- Day view with timeline cards
- Date navigation (prev/next/today/date picker)
- Booking modal (patient, provider, type, date/time, duration, chief complaint)
- Status badges with color coding
- AI triage badges from intake submissions (urgent = red pulse, moderate = amber)

---

## 7. Billing & Coding

### 7.1 Superbill Model

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `encounter_id` | UUID FK (UNIQUE) | 1:1 with encounter |
| `patient_id` | UUID FK | Patient |
| `provider_id` | UUID FK | Treating provider |
| `status` | String | draft, ready_to_bill, submitted, paid, denied |
| `total_amount_cents` | Integer | Sum of line items |
| `claim_json` | JSONB | CMS-1500 format export |

### 7.2 Line Items

| Field | Type | Description |
|-------|------|-------------|
| `cpt_code` | String(10) | CPT procedure code |
| `description` | String(500) | CPT description |
| `units` | Integer | Default 1 |
| `charge_cents` | Integer | Fee |
| `modifier` | String(10) | CPT modifier |
| `diagnosis_pointers` | JSONB | Array of ICD-10 codes linked to this CPT |

### 7.3 AI MDM Calculator

Evaluates Medical Decision Making using 2021 E&M 2-of-3 rule:
- **Problem complexity:** Number and severity of diagnoses
- **Data reviewed:** Labs, imaging, external records referenced
- **Risk:** Morbidity/mortality risk of the management options

Suggests E&M level: 99213 (low), 99214 (moderate), 99215 (high).

### 7.4 CMS-1500 Export

Standard clearinghouse JSON format with: patient demographics, provider NPI/license, diagnosis codes with laterality, CPT codes with modifiers, place of service, date of service.

---

## 8. Patient Profile & Clinical Flowsheets

### 8.1 Patient Model

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Tenant isolation |
| `first_name`, `last_name` | String | Demographics |
| `dob` | Date | Date of birth |
| `sex` | String | male, female, other |
| `contact_info_jsonb` | JSONB | Phone, email, address |
| `medical_history_jsonb` | JSONB | Conditions, medications, allergies |
| `insurance_jsonb` | JSONB | Primary/secondary insurance |
| `emergency_contact_jsonb` | JSONB | Emergency contact info |

### 8.2 Patient Detail Page

- **Demographics tab:** Editable patient information
- **Encounter timeline:** Chronological list with date, provider, chief complaint, diagnoses
- **Clinical flowsheets:** IOP and refraction data across visits in tabular format
- **Active problems:** Master Problem List with status indicators

### 8.3 AI Prep Me

```
POST /patients/{id}/prep-me
```

Sends last 3 finalized SOAP notes to Claude Sonnet with a 300 max_token limit. Returns a 2-sentence clinical summary. Logs `PHI_VIEWED` audit action on access.

Prefers FINAL refraction for flowsheet display, falls back to MANIFEST.

---

## 9. Optical Handoff

### 9.1 Optical Queue

When an encounter is finalized with an `is_final_rx` refraction, the patient automatically appears in the optical dashboard queue.

**Query:** Finalized encounters with `is_final_rx = True` refractions, joined with patient demographics and provider info.

### 9.2 Rx PDF Generation

Uses `window.print()` with a print-optimized div containing:
- Patient name, DOB
- Provider name, license number, NPI
- OD/OS prescription (sphere, cylinder, axis, add, PD)
- Date written, expiration (1 year)
- Provider signature line

Print styles use `dangerouslySetInnerHTML` for cross-browser compatibility.

### 9.3 Rx Change Alert

Spherical Equivalent formula: `SE = sphere + (cylinder / 2)`

If `|SE_current - SE_prior| > 0.50D` for either eye, a bright badge alerts optical staff. Clinically significant changes may require patient counseling about adaptation.

### 9.4 Status Tracking

Optical staff update status: `waiting -> in_progress -> dispensed`.

---

## 10. Patient Intake & AI Triage

### 10.1 IntakeToken Model

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Tenant isolation |
| `appointment_id` | UUID FK -> appointments | Linked appointment |
| `token` | String(64) | 64-char hex (secrets.token_hex(32)), URL-safe |
| `status` | String | pending, submitted, expired, revoked |
| `expires_at` | TIMESTAMPTZ | Token expiration |
| `dob_attempts` | Integer | Failed DOB verification attempts (lock after 3) |
| `dob_verified` | Boolean | Whether patient passed DOB check |
| `intake_data_jsonb` | JSONB | Raw form submission (HIPAA audit) |
| `triage_flags_jsonb` | JSONB | AI triage results: {urgency, flags[], reasoning} |
| `ip_address` | String(45) | Submitter IP for audit |

### 10.2 Intake Flow

```
Staff generates intake link → patient receives URL or scans QR code
  → /intake/[token] → DOB verification (3 attempts max)
  → Multi-step form: demographics, medical history, ROS, chief complaint
  → Submit → AI triage classifies chief complaint
  → intake_data_jsonb + triage_flags_jsonb stored
  → Status → submitted
```

### 10.3 AI Triage

**Model:** Claude Sonnet with structured JSON output

**Classification:**
- **urgent:** sudden vision loss, flashing lights with new floaters, eye trauma, chemical exposure, acute angle closure symptoms
- **moderate:** new-onset double vision, persistent eye pain, significant redness with discharge
- **routine:** blurry vision (gradual), dry eyes, itching, routine exam, glasses update

**Fallback:** Returns `{urgency: "unknown"}` when `ANTHROPIC_API_KEY` not set.

**Schedule integration:** Urgent = red pulsing badge, moderate = amber badge, with hover tooltip showing AI reasoning and flags.

### 10.4 QR Code Sharing

`IntakeLinkModal` provides two sharing modes:
- **Link tab:** Copy-to-clipboard URL
- **QR Code tab:** Rendered via `qrcode.react` (QRCodeSVG), patient scans with phone camera

---

## Appendix A: Database Schema Summary

```
-- Public Schema (SaaS Control Plane)
subscription_plans           — tier definitions (Core, Plus, Premium)
tenants                      — clinic registry with schema_name
tenant_addons                — per-tenant feature toggles
tenant_members               — user-tenant associations

-- Tenant Schema (Per-Clinic, Isolated)
staff                        — clinic staff with role, license, NPI
patients                     — demographics + JSONB (contact, medical, insurance)
appointments                 — scheduled visits with status workflow
encounters                   — master clinical record (anchors all sub-resources)
vitals_and_pretest           — IOP, VA, pupils, systemic vitals (1:1 with encounter)
refractions                  — prescription measurements (1:many, typed)
exam_findings                — structured exam notes with JSONB (1:many, keyed by section)
diagnoses                    — ICD-10 coded conditions (1:many per encounter)
patient_problems             — master problem list (longitudinal, per patient)
superbills                   — billing records (1:1 with encounter)
superbill_line_items         — CPT line items (1:many per superbill)
intake_tokens                — patient intake with DOB verification + AI triage
audit_logs                   — HIPAA audit trail (append-only)
```

## Appendix B: API Route Summary

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/encounters/` | Create encounter |
| `GET` | `/encounters/{id}` | Get encounter with all sub-resources |
| `PATCH` | `/encounters/{id}` | Update narrative fields |
| `POST` | `/encounters/{id}/finalize` | Sign and lock encounter |
| `PUT` | `/encounters/{id}/vitals` | Create/update vitals |
| `POST` | `/encounters/{id}/refractions` | Add refraction |
| `PATCH` | `/encounters/{id}/refractions/{rx_id}` | Update refraction |
| `POST` | `/encounters/{id}/diagnoses` | Add diagnosis |
| `PATCH` | `/encounters/{id}/diagnoses/{dx_id}` | Update diagnosis |
| `DELETE` | `/encounters/{id}/diagnoses/{dx_id}` | Remove diagnosis |
| `POST` | `/encounters/{id}/diagnoses/from-problem/{pid}` | Promote MPPL problem |
| `PUT` | `/encounters/{id}/exam-findings/{section}` | Upsert exam findings |
| `POST` | `/encounters/{id}/ai-scribe` | Stream AI SOAP note (SSE) |
| `POST` | `/encounters/{id}/ai-scribe/accept` | Log AI autofill acceptance |
| `GET` | `/patients/` | Search patients |
| `POST` | `/patients/` | Create patient |
| `GET` | `/patients/{id}` | Patient detail |
| `PATCH` | `/patients/{id}` | Update patient |
| `GET` | `/patients/{id}/problems` | List patient problems |
| `POST` | `/patients/{id}/problems` | Add problem to MPPL |
| `PATCH` | `/patients/{id}/problems/{pid}` | Update problem |
| `DELETE` | `/patients/{id}/problems/{pid}` | Soft-delete problem |
| `POST` | `/patients/{id}/prep-me` | AI clinical summary |
| `GET` | `/appointments/` | List appointments (date/provider filter) |
| `POST` | `/appointments/` | Book appointment |
| `PATCH` | `/appointments/{id}` | Update appointment |
| `POST` | `/appointments/{id}/check-in` | Check in patient |
| `POST` | `/appointments/{id}/start-exam` | Create encounter from appointment |
| `POST` | `/appointments/{id}/cancel` | Cancel with reason |
| `GET` | `/superbills/{id}` | Get superbill |
| `PATCH` | `/superbills/{id}` | Update superbill |
| `GET` | `/superbills/{id}/cms1500` | CMS-1500 JSON export |
| `GET` | `/optical/queue` | Optical dispensing queue |
| `PATCH` | `/optical/{id}/status` | Update optical status |
| `GET` | `/staff/` | List clinic staff |
| `POST` | `/staff/` | Create staff member |
| `PATCH` | `/staff/{id}` | Update staff |
| `GET` | `/audit-logs/` | Tenant-wide audit logs (paginated) |
| `GET` | `/audit-logs/export` | CSV export |
| `GET` | `/encounters/{id}/audit-logs` | Encounter-level audit trail |
| `POST` | `/intake/validate-token` | Validate intake token |
| `POST` | `/intake/verify-dob` | DOB verification |
| `POST` | `/intake/submit` | Submit intake form |
