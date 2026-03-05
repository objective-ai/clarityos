# ClarityOS Phase 1 — California-Compliant Technical Specification

**Version:** 1.0
**Date:** March 2026
**Status:** Phase 1 Complete — Production-Ready for California Optometry Clinics
**Stack:** Next.js 14 (App Router) / FastAPI / PostgreSQL (schema-per-tenant) / Supabase Auth

---

## Table of Contents

1. [Audit Trail & Encounter Finalization](#1-audit-trail--encounter-finalization)
2. [Clinical Data Architecture](#2-clinical-data-architecture)
3. [Master Patient Problem List (MPPL) Continuity](#3-master-patient-problem-list-mppl-continuity)
4. [Security & Row-Level Tenant Isolation](#4-security--row-level-tenant-isolation)
5. [Data Portability & FHIR Readiness](#5-data-portability--fhir-readiness)

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

### 1.3 Finalization Data Model

**Database columns on `encounters` table:**

| Column | Type | Constraint | Description |
|--------|------|-----------|-------------|
| `is_finalized` | `BOOLEAN` | NOT NULL, default `FALSE` | Lock flag — once `TRUE`, no further edits |
| `finalized_at` | `TIMESTAMPTZ` | nullable | UTC timestamp of finalization |
| `signed_by_id` | `UUID` | FK → `staff.id`, ON DELETE RESTRICT | Staff member who e-signed |
| `signed_at` | `TIMESTAMPTZ` | nullable | UTC timestamp of signature |
| `assessment_and_plan` | `TEXT` | nullable (required at finalization) | Doctor's clinical assessment and plan |

**FK constraint:** `ON DELETE RESTRICT` prevents deletion of the signing staff record while signed encounters exist — ensuring audit trail integrity.

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

1. **Staff identity resolution:** Looks up the `Staff` record matching `global_user_id` (from JWT `sub` claim) + `tenant_id` + `is_active = True`
2. **Authorization gate:** Returns `403 Forbidden` if no active staff record exists for the authenticated user
3. **Idempotency guard:** Returns `409 Conflict` if the encounter is already finalized
4. **The Seal:**
   - Sets `assessment_and_plan` from request payload
   - Sets `is_finalized = True`
   - Sets `finalized_at = NOW()` (UTC)
   - Sets `signed_by_id = staff.id`
   - Sets `signed_at = NOW()` (UTC)
5. **Post-finalization sync:** Propagates resolved diagnoses back to the Master Problem List (see Section 3)

### 1.5 Frontend Finalization Flow

1. Doctor clicks **"Finalize"** in the sticky header
2. Dialog opens with **Assessment & Plan** textarea (minimum 10 characters required)
3. **"Sign & Finalize"** button is disabled until threshold is met
4. On confirmation: `finalizeEncounter(id, signedByName, signedAt)` is called in the Zustand store
5. All clinical fields (vitals, refractions, exam findings, diagnoses) become **read-only**
6. Banner displays: **"Signed and finalized by Dr. Sarah Lin, OD on Mar 4, 2026"**
7. Navigation links appear: **"Back to Patient"** and **"Schedule"**

### 1.6 Immutability Guarantees

- **Backend:** Every `PATCH /encounters/{id}` checks `is_finalized` and returns `409 Conflict` if locked
- **Backend:** Every sub-resource mutation (vitals, refractions, diagnoses, exam findings) checks parent encounter finalization
- **Frontend:** All form components accept `isReadOnly` prop, derived from `encounterState.isFinalized`
- **Database:** `SoftDeleteMixin` ensures no clinical record is ever hard-deleted — `is_deleted` flag + `deleted_at` timestamp preserve full history

### 1.7 Timestamp Integrity

All timestamps use PostgreSQL `server_default=func.now()` — the database server clock is the source of truth, not the application layer. This prevents clock-skew attacks or client-side timestamp manipulation.

```python
class TimestampMixin:
    created_at: DateTime(timezone=True), server_default=func.now()  # immutable
    updated_at: DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
```

---

## 2. Clinical Data Architecture

### 2.1 Overview

ClarityOS models optometric clinical data across five core entities, each scoped to a tenant and linked to an encounter:

```
Encounter (master record)
├── VitalsAndPretest (1:1)
├── Refraction[] (1:many, ordered by created_at)
├── ExamFindings[] (1:many, keyed by exam_section)
└── Diagnosis[] (1:many)
```

### 2.2 Vitals & Pre-Testing

**Model:** `VitalsAndPretest` — one record per encounter (UNIQUE constraint on `encounter_id`)

| Domain | Fields | Validation |
|--------|--------|-----------|
| **Intraocular Pressure** | `iop_od`, `iop_os` (Numeric 5,1) | 0–80 mmHg; > 21 mmHg triggers elevated alert |
| **IOP Metadata** | `iop_method` (String 50), `iop_time` (DateTime) | Method normalized to title-case |
| **Distance VA** | `ucva_od`, `ucva_os`, `bcva_od`, `bcva_os` (String 20) | Snellen notation (e.g., "20/20") |
| **Near VA** | `near_va_od`, `near_va_os` (String 20) | Snellen notation |
| **Systemic** | `blood_pressure` (String 20), `pulse` (Integer) | BP: regex `^\d{2,3}/\d{2,3}$`, systolic 60–250, diastolic 30–150; Pulse: 30–250 bpm |
| **Pupils** | `pupils_equal_round_reactive` (Boolean), `relative_afferent_pupillary_defect` (Boolean) | PERRLA + RAPD |
| **Notes** | `cover_test_notes` (Text), `technician_notes` (Text) | Free-text |
| **Audit** | `recorded_by_id` (FK → staff) | Technician who recorded |

**IOP Elevation Alert:**
```typescript
// types/vitals.ts
export function isIopElevated(value: number | null): boolean {
  return value !== null && value > 21;  // Clinical threshold: 21 mmHg
}
```

The `PatientStickyHeader` component derives IOP alerts in real-time from the vitals store — no hardcoded flags. If either eye exceeds 21 mmHg, an `IOP OD` or `IOP OS` warning badge appears in the alert row.

### 2.3 Refraction

**Model:** `Refraction` — multiple per encounter, classified by `refraction_type`

**Types:** `habitual` | `auto` | `manifest` | `cycloplegic` | `final`

| Field Group | OD Fields | OS Fields | Constraints |
|------------|-----------|-----------|-------------|
| **Sphere** | `od_sphere` | `os_sphere` | ±25.00 D, 0.25 D steps |
| **Cylinder** | `od_cylinder` | `os_cylinder` | ±8.00 D, 0.25 D steps |
| **Axis** | `od_axis` | `os_axis` | 1–180 degrees (CHECK constraint) |
| **Add** | `od_add` | `os_add` | +0.75 to +3.50 D |
| **Prism** | `od_prism` / `od_prism_base` | `os_prism` / `os_prism_base` | 0–20 Δ, direction: IN/OUT/UP/DOWN |
| **VA** | `od_visual_acuity` | `os_visual_acuity` | Snellen notation |
| **PD** | Binocular: `pd_distance` (50–80mm), `pd_near` (50–80mm) | Monocular: `pd_od` (25–45mm), `pd_os` (25–45mm) | Cannot mix binocular + monocular |

**Cross-field validators (Pydantic):**
- Cylinder requires axis (and vice versa) — a cylinder without an axis cannot be fabricated
- Prism requires base direction (and vice versa)
- At least one eye must have a sphere value
- `is_final_rx = True` requires PD values (lenses cannot be fabricated without PD)
- Binocular and monocular PD are mutually exclusive

**Database constraints:**
```sql
CHECK (od_axis BETWEEN 1 AND 180)
CHECK (os_axis BETWEEN 1 AND 180)
CHECK (od_sphere BETWEEN -25.00 AND 25.00)
CHECK (os_sphere BETWEEN -25.00 AND 25.00)
```

### 2.4 Exam Findings

**Model:** `ExamFindings` — JSONB-based structured exam notes with OD/OS laterality

| Section Key | Label | Description |
|------------|-------|-------------|
| `anterior_segment` | Anterior Segment (Slit Lamp) | Cornea, conjunctiva, iris, lens, anterior chamber |
| `posterior_segment` | Posterior Segment (Fundus) | Retina, optic nerve, macula, vitreous |

**UNIQUE constraint:** `(encounter_id, exam_section)` — one record per section per encounter

**Key columns:**
- `is_normal_wnl` (Boolean) — "Within Normal Limits" one-click documentation
- `findings_od` (JSONB) — Right eye findings, structured by anatomical structure
- `findings_os` (JSONB) — Left eye findings
- `provider_notes` (Text) — Doctor's interpretation

**WNL workflow:** Doctor clicks "Set WNL" → all structures in that section are marked normal. If abnormalities exist, individual structures are documented with dropdown selections and optional text annotations. The "OD → OS" copy button duplicates right-eye findings to left eye for symmetric conditions.

### 2.5 Diagnosis

**Model:** `Diagnosis` — ICD-10-CM coded conditions attached to an encounter

| Field | Type | Validation |
|-------|------|-----------|
| `icd10_code` | String(20) | Regex: `^[A-Z]\d{2}(\.[A-Z0-9]{1,4})?$` (ICD-10-CM format) |
| `description` | String(500) | Human-readable diagnosis name |
| `eye_affected` | Enum | `OD` / `OS` / `OU` (laterality) |
| `severity` | String(50) | `mild` / `moderate` / `severe` |
| `status` | String(50) | `active` / `resolved` / `chronic` / `suspect` (normalized lowercase) |

**Index:** `(encounter_id, icd10_code)` — optimizes duplicate checks and billing queries.

---

## 3. Master Patient Problem List (MPPL) Continuity

### 3.1 Design Philosophy

The MPPL provides **longitudinal clinical continuity** across encounters. A patient's chronic conditions (e.g., glaucoma, diabetic retinopathy) persist on their problem list and can be "promoted" into any encounter with one click — preserving ICD-10 codes, laterality, and severity without re-entry.

### 3.2 Data Model

**Model:** `PatientProblem` — persistent condition list per patient

| Field | Type | Description |
|-------|------|-------------|
| `patient_id` | UUID FK → patients | The patient this problem belongs to |
| `icd10_code` | String(20) | ICD-10 code |
| `description` | String(500) | Condition name |
| `eye_affected` | Enum(EyeAffected) | OD / OS / OU |
| `severity` | String(50) | Clinical severity |
| `status` | String(50) | `active` / `inactive` / `resolved` |
| `onset_date` | Date | When condition was identified |
| `resolved_date` | Date | When resolved (if applicable) |
| `source_encounter_id` | UUID FK → encounters | Encounter that identified this problem |

**Mixins:** `TimestampMixin` + `SoftDeleteMixin` (problems are never hard-deleted)

### 3.3 Copy-on-Promotion

```
POST /encounters/{encounter_id}/diagnoses/from-problem/{problem_id}
```

**What happens:**
1. Validates the encounter exists and is not finalized (`409 Conflict` if locked)
2. Validates the problem exists and is not soft-deleted
3. **Patient ownership check:** Verifies `problem.patient_id == encounter.patient_id` (`400 Bad Request` if mismatch)
4. Creates a new `Diagnosis` record by copying fields from the `PatientProblem`:
   - `icd10_code`, `description`, `eye_affected`, `severity` — direct copy
   - `status` — unconditionally set to `"active"` (a promoted problem starts active in the new encounter)
   - `notes` — `"Promoted from master problem list (problem_id: {uuid})"`
5. Returns the new `DiagnosisResponse` with `201 Created`

**Frontend deduplication:** The `ContinuitySidebar` component checks existing diagnoses by ICD-10 code before allowing promotion. If a diagnosis with the same code already exists in the encounter, the "Bring Forward" button is replaced with an "Added" label.

### 3.4 Post-Finalization Sync-Back

When an encounter is finalized, the system scans all diagnoses for promoted entries (identified by `problem_id:` in the notes field). If a promoted diagnosis was marked `"resolved"` during the encounter, the corresponding `PatientProblem` is updated:

```python
# app/api/routes/encounter.py — finalize_encounter()
for dx in enc.diagnoses:
    if "problem_id:" not in (dx.notes or ""):
        continue
    # Extract problem_id, look up PatientProblem
    if dx.status.lower() == "resolved":
        problem.status = "resolved"
        problem.resolved_date = enc.encounter_date
```

This creates a **bidirectional link** between encounter-level diagnoses and the master problem list — ensuring that resolving a condition in one encounter updates the patient's longitudinal record.

---

## 4. Security & Row-Level Tenant Isolation

### 4.1 Multi-Tenancy Architecture

ClarityOS uses **schema-per-tenant** isolation in PostgreSQL. Each clinic (tenant) operates in a separate database schema, providing:

- **Data isolation:** No SQL query can accidentally cross tenant boundaries
- **Independent migrations:** Schema changes can be rolled out per-tenant
- **Compliance:** Meets HIPAA requirements for logical separation of PHI

### 4.2 Tenant Context

Every authenticated request carries a `TenantContext` — an immutable, frozen dataclass extracted from the verified JWT:

```python
@dataclass(frozen=True, slots=True)
class TenantContext:
    user_id: UUID      # Supabase auth user ID (JWT sub claim)
    tenant_id: UUID    # Clinic tenant ID (JWT app_metadata.tenant_id)
    role: str          # Staff role: doctor/technician/receptionist/admin/owner
```

### 4.3 JWT Verification

**Provider:** Supabase Auth (HS256)

| JWT Claim | Maps To | Purpose |
|-----------|---------|---------|
| `sub` | `user_id` | Unique user identity |
| `app_metadata.tenant_id` | `tenant_id` | Clinic association (set by DB trigger at signup) |
| `app_metadata.role` | `role` | RBAC role (defaults to `"receptionist"`) |

**Error responses:**
- Missing `sub` → `401 Unauthorized`
- Missing `tenant_id` → `403 Forbidden` ("User not associated with a clinic")
- Invalid JWT signature → `401 Unauthorized`
- No active staff record for user → `403 Forbidden`

### 4.4 Query Scoping

Every database query includes `WHERE tenant_id = ctx.tenant_id`. This is enforced at the application layer via the `TenantBase` mixin — all clinical models inherit `tenant_id` as a required, indexed column.

```python
# Example: encounter retrieval
select(Encounter).where(
    Encounter.id == encounter_id,
    Encounter.tenant_id == ctx.tenant_id,
    Encounter.is_deleted == False,
)
```

### 4.5 Role-Based Access Control (RBAC)

**Staff roles and capabilities:**

| Role | Clinical Access | Administrative Access |
|------|----------------|----------------------|
| `doctor` | Full: vitals, refractions, exam findings, diagnoses, finalization | View reports |
| `technician` | Pre-testing: vitals, autorefraction, scribing | None |
| `receptionist` | View-only: demographics, scheduling | Appointment management |
| `admin` | None | Billing, reporting, user management |
| `owner` | All doctor capabilities | All admin + subscription management |

**Frontend entitlement gating:**

```typescript
const { has } = useEntitlements();
if (has(Entitlement.AI_SCRIBE)) {
  // Show AI Scribe feature
}
```

Entitlements are carried in the JWT payload as an `entitlements[]` array, checked client-side via the `useEntitlements()` hook. Server-side enforcement uses the `TenantContext.role` for authorization.

### 4.6 Soft-Delete & Audit Trail

Clinical records are never hard-deleted. The `SoftDeleteMixin` provides:

```python
is_deleted: Boolean    # default False, set to True on "deletion"
deleted_at: DateTime   # UTC timestamp of soft-deletion
```

Query filters explicitly exclude soft-deleted records:
```python
Encounter.is_deleted == False  # Applied to GET and PATCH queries
PatientProblem.is_deleted == False  # Applied to problem lookups
```

This satisfies HIPAA's requirement that clinical records be retained and accessible for audit purposes (45 CFR 164.530(j) — 6-year retention minimum).

---

## 5. Data Portability & FHIR Readiness

### 5.1 Architecture for Interoperability

ClarityOS stores clinical data in structured, typed fields that map directly to FHIR R4 resources. While Phase 1 does not include a live FHIR endpoint, the data model is designed for straightforward export.

### 5.2 FHIR Resource Mapping

#### Patient → FHIR Patient

| ClarityOS Field | FHIR Path | Type |
|-----------------|-----------|------|
| `first_name` | `Patient.name[0].given` | HumanName |
| `last_name` | `Patient.name[0].family` | HumanName |
| `dob` | `Patient.birthDate` | date |
| `sex` | `Patient.gender` | code |
| `contact_info_jsonb` | `Patient.telecom[]` | ContactPoint[] |

#### VitalsAndPretest → FHIR Observation

| ClarityOS Field | FHIR Observation.code | FHIR value |
|-----------------|----------------------|------------|
| `iop_od` | LOINC 56844-4 (IOP right) | `valueQuantity` (mmHg) |
| `iop_os` | LOINC 56845-1 (IOP left) | `valueQuantity` (mmHg) |
| `ucva_od` | LOINC 79880-1 (VA uncorrected right) | `valueString` (Snellen) |
| `bcva_od` | LOINC 79881-9 (VA corrected right) | `valueString` (Snellen) |
| `blood_pressure` | LOINC 85354-9 (Blood pressure) | `component[]` (systolic/diastolic) |
| `pulse` | LOINC 8867-4 (Heart rate) | `valueQuantity` (bpm) |
| `pupils_equal_round_reactive` | SNOMED 271731001 (Pupil reaction) | `valueBoolean` |

#### Refraction → FHIR DiagnosticReport

| ClarityOS Field | FHIR Component | Type |
|-----------------|---------------|------|
| `od_sphere` | `DiagnosticReport.result[].component[sphere]` | Decimal (diopters) |
| `od_cylinder` | `DiagnosticReport.result[].component[cylinder]` | Decimal (diopters) |
| `od_axis` | `DiagnosticReport.result[].component[axis]` | Integer (degrees) |
| `refraction_type` | `DiagnosticReport.category` | CodeableConcept |
| `is_final_rx` | `DiagnosticReport.conclusion` | boolean flag |

#### ExamFindings → FHIR Observation

| ClarityOS Field | FHIR Path | Notes |
|-----------------|-----------|-------|
| `exam_section` | `Observation.code` | Maps to SNOMED codes (anterior/posterior) |
| `is_normal_wnl` | `Observation.interpretation` | Normal = "N" (HL7 interpretation code) |
| `findings_od` | `Observation.component[].valueString` | Per-structure findings |
| `findings_os` | `Observation.component[].valueString` | Per-structure findings |

#### Diagnosis → FHIR Condition

| ClarityOS Field | FHIR Path | Type |
|-----------------|-----------|------|
| `icd10_code` | `Condition.code.coding[0].code` | ICD-10-CM system |
| `description` | `Condition.code.coding[0].display` | string |
| `eye_affected` | `Condition.bodySite` | SNOMED coded (OD/OS/OU) |
| `status` | `Condition.clinicalStatus` | active/resolved/inactive |
| `severity` | `Condition.severity` | CodeableConcept |

#### PatientProblem → FHIR Condition (longitudinal)

| ClarityOS Field | FHIR Path | Type |
|-----------------|-----------|------|
| `icd10_code` | `Condition.code.coding[0].code` | ICD-10-CM |
| `onset_date` | `Condition.onsetDateTime` | date |
| `resolved_date` | `Condition.abatementDateTime` | date |
| `status` | `Condition.clinicalStatus` | active/resolved |

### 5.3 Export Strategy (Phase 2+)

The FHIR export layer will be implemented as a read-only API surface:

```
GET /fhir/Patient/{id}
GET /fhir/Encounter/{id}/$everything    # Bundle of all clinical data
GET /fhir/Condition?patient={id}        # Problem list
```

JSONB fields (`findings_od`, `findings_os`, `contact_info_jsonb`, `medical_history_jsonb`) are already structured to decompose into FHIR components without lossy transformation.

---

## Appendix A: Database Schema Summary

```
staff                    — clinic staff (doctors, techs, admins)
patients                 — patient demographics + JSONB contact/medical/privacy
appointments             — scheduled visits with status workflow
encounters               — master clinical record (anchors all sub-resources)
vitals_and_pretest       — IOP, VA, pupils, systemic vitals (1:1 with encounter)
refractions              — prescription measurements (1:many, typed)
exam_findings            — structured exam notes with JSONB (1:many, keyed by section)
diagnoses                — ICD-10 coded conditions (1:many per encounter)
patient_problems         — master problem list (longitudinal, per patient)
```

## Appendix B: API Route Summary

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/encounters/` | Create encounter |
| `GET` | `/encounters/{id}` | Get encounter with all sub-resources |
| `PATCH` | `/encounters/{id}` | Update narrative fields (chief complaint, A&P) |
| `POST` | `/encounters/{id}/finalize` | Sign and lock encounter |
| `PUT` | `/encounters/{id}/vitals` | Create/update vitals |
| `POST` | `/encounters/{id}/refractions` | Add refraction measurement |
| `PATCH` | `/encounters/{id}/refractions/{rx_id}` | Update refraction |
| `POST` | `/encounters/{id}/diagnoses` | Add diagnosis |
| `PATCH` | `/encounters/{id}/diagnoses/{dx_id}` | Update diagnosis |
| `DELETE` | `/encounters/{id}/diagnoses/{dx_id}` | Remove diagnosis |
| `POST` | `/encounters/{id}/diagnoses/from-problem/{problem_id}` | Promote MPPL problem |
| `PUT` | `/encounters/{id}/exam-findings/{section}` | Upsert exam findings |
| `GET` | `/patients/{id}/problems` | List patient problems |
| `POST` | `/patients/{id}/problems` | Add problem to MPPL |
| `PATCH` | `/patients/{id}/problems/{problem_id}` | Update problem |
| `DELETE` | `/patients/{id}/problems/{problem_id}` | Soft-delete problem |
