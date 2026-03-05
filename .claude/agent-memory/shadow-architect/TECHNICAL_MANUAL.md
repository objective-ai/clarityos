# ClarityOS: Clinical Core Technical Manual (Phase 1)

**Last Updated:** March 4, 2026 (Phase 1 Audit Fixes applied)
**Compliance Status:** California HIPAA/CCPA Ready
**Phase:** 1 — Clinical Core (Finalized)

---

## I. System Foundations

### Backend Architecture

**Engine:** FastAPI on Python 3.12+ (`requirements.txt` pins `fastapi>=0.115`, `pydantic>=2.0`)

**Database:** PostgreSQL with async drivers (`asyncpg>=0.30` for SQLAlchemy async, `psycopg2-binary>=2.9` for sync tooling)

**Multi-Tenancy:** Hard-isolation via `tenant_id` column on every model + Python-level query filtering. Every route handler receives `TenantContext` via `Depends(get_current_tenant)`, and every query includes `.where(Model.tenant_id == ctx.tenant_id)`.

**RLS (Planned):** PostgreSQL Row-Level Security as defense-in-depth. Not yet implemented — Python enforcement is primary. FastAPI connects with Supabase service role key (bypasses RLS).

**Connection Pool:** `app/db/session.py` — AsyncSession factory, asyncpg pool (size=20, recycle=1800s).

### Core Mixins (Data Integrity)

Every clinical table inherits from these two guardrails:

**TimestampMixin** (`app/db/mixins.py`) — Tracks `created_at` and `updated_at` with server-side defaults.

**SoftDeleteMixin** (`app/db/mixins.py`) — Implements `is_deleted` (bool) and `deleted_at` (DateTime). **Rule: No hard deletes allowed for clinical data.**

| Mixin | Columns | Server Default | Applied To |
|-------|---------|---------------|-----------|
| `TimestampMixin` | `created_at` DateTime(tz), `updated_at` DateTime(tz) | `func.now()`, onupdate=`func.now()` | ALL clinical models |
| `SoftDeleteMixin` | `is_deleted` Boolean, `deleted_at` DateTime(tz) | `"false"`, nullable | Patient, Encounter, PatientProblem, Diagnosis |

---

## II. Clinical Data Models

### The "Rule of Laterality" (OD/OS Split)

To meet US billing standards (CMS-1500 / ICD-10-CM laterality guidelines), all ocular findings are split at the database level:

- **VitalsAndPretest:** `iop_od`/`iop_os`, `ucva_od`/`ucva_os`, `bcva_od`/`bcva_os`, `near_va_od`/`near_va_os`
- **Refraction:** Full OD/OS column pairs for `sphere`, `cylinder`, `axis`, `add`, `prism`, `prism_base`, `visual_acuity` + monocular PD (`pd_od`/`pd_os`)
- **ExamFindings:** `findings_od` and `findings_os` as JSONB columns (never a single `findings` blob)
- **Diagnosis/PatientProblem:** `eye_affected` enum (OD/OS/OU) — conditions, not measurements

**Validation:** Pydantic schemas (`AnteriorSegmentSchema`, `PosteriorSegmentSchema`) enforce strict structures within JSONB blobs via `SECTION_SCHEMA_MAP` in `app/schemas/exam_findings.py`.

### Master Patient Problem List (MPPL)

The "Medical Memory" that persists across encounters.

**Copy-on-Promotion** (`app/api/routes/promotion.py`): Master problems are "brought forward" into an encounter as a new Diagnosis record. Fields copied: `icd10_code`, `description`, `eye_affected`, `severity`. Notes field contains `"Promoted from master problem list (problem_id: {uuid})"` for back-reference.

**Sync-Back on Finalization** (`app/api/routes/encounter.py:finalize_encounter`): When an encounter is finalized, if a promoted diagnosis has `status="resolved"`, the corresponding PatientProblem is automatically updated with `status="resolved"` and `resolved_date=encounter_date`.

### Enum Reference

| Enum | Values | File |
|------|--------|------|
| `StaffRole` | doctor, technician, receptionist, admin, owner | `clinical.py:41` |
| `Sex` | male, female, other, prefer_not_to_say | `clinical.py:51` |
| `AppointmentStatus` | scheduled → confirmed → arrived → in_pretest → in_exam → completed \| cancelled \| no_show | `clinical.py:58` |
| `AppointmentType` | comprehensive_exam, contact_lens_exam, follow_up, urgent_care, pediatric_exam | `clinical.py:69` |
| `EyeAffected` | OD, OS, OU | `clinical.py:77` |
| `RefractionType` | habitual, auto, manifest, cycloplegic, final | `clinical.py:85` |
| `ExamSection` | anterior_segment, posterior_segment | `clinical.py:98` |
| `AuditAction` | create, read, update, delete, finalize, promote | `clinical.py:107` |

### Entity Relationship Graph

```
Patient ──┬── Appointment ── Encounter ──┬── VitalsAndPretest (1:1, cascade)
          │                              ├── Refraction (1:many by type, cascade, order_by created_at)
          │                              ├── ExamFindings (1:many by section, cascade)
          │                              └── Diagnosis (1:many, cascade)
          │
          └── PatientProblem (1:many) <── copy-on-promote ──> Diagnosis
                                         (back-sync resolved status on finalize)

AuditLog (append-only, no FK cascades — forensic record)
```

### Table Detail

#### Staff (`staff`) — Maps GlobalUser to clinic role
Mixins: TimestampMixin

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL, indexed |
| `global_user_id` | UUID | NOT NULL, unique, indexed |
| `role` | StaffRole enum | NOT NULL |
| `first_name`, `last_name` | String(100) | NOT NULL |
| `license_number` | String(100) | nullable |
| `npi_number` | String(10) | nullable |
| `is_active` | Boolean | default=true |

#### Patient (`patients`) — Core demographics
Mixins: TimestampMixin, SoftDeleteMixin

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL, indexed |
| `first_name`, `last_name` | String(100) | NOT NULL |
| `preferred_name` | String(100) | nullable |
| `dob` | Date | NOT NULL |
| `sex` | Sex enum | NOT NULL |
| `ssn_last4` | String(4) | nullable — ENCRYPTED AT REST |
| `contact_info_jsonb` | JSONB | default={} |
| `medical_history_jsonb` | JSONB | default={} |
| `privacy_flags_jsonb` | JSONB | default={} — HIPAA special access flags |

Indexes: `(last_name, first_name)`, `(dob)`

#### Appointment (`appointments`) — Scheduled slot
Mixins: TimestampMixin

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL, indexed |
| `patient_id` | UUID FK→patients | CASCADE |
| `provider_id` | UUID FK→staff | RESTRICT |
| `booked_by_id` | UUID FK→staff | SET NULL, nullable |
| `appointment_type` | AppointmentType enum | NOT NULL |
| `status` | AppointmentStatus enum | default=SCHEDULED |
| `start_time`, `end_time` | DateTime(tz) | NOT NULL |
| `duration_minutes` | Integer | default=30 |
| `chief_complaint`, `internal_notes`, `cancellation_reason` | Text | nullable |
| `reminder_sent_at` | DateTime(tz) | nullable |

CheckConstraint: `end_time > start_time`. Indexes: `(provider_id, start_time)`, `(start_time)`

#### Encounter (`encounters`) — Master visit record
Mixins: TimestampMixin, SoftDeleteMixin

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL, indexed |
| `patient_id` | UUID FK→patients | CASCADE |
| `provider_id` | UUID FK→staff | RESTRICT |
| `appointment_id` | UUID FK→appointments | SET NULL, unique (1:1) |
| `encounter_date` | Date | NOT NULL |
| `chief_complaint`, `assessment_and_plan` | Text | nullable |
| `ai_summary_text` | Text | nullable — AI Scribe output |
| `ai_summary_generated_at` | DateTime(tz) | nullable |
| `is_finalized` | Boolean | default=false |
| `finalized_at` | DateTime(tz) | nullable |
| `signed_by_id` | UUID FK→staff | RESTRICT, nullable |
| `signed_at` | DateTime(tz) | nullable |

Index: `(patient_id, encounter_date)`

#### VitalsAndPretest (`vitals_and_pretest`) — Technician measurements
Mixins: TimestampMixin. One-to-one with Encounter.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL, indexed |
| `encounter_id` | UUID FK→encounters | CASCADE, unique (1:1) |
| `iop_od`, `iop_os` | Numeric(5,1) | nullable |
| `iop_time` | DateTime(tz) | nullable |
| `iop_method` | String(50) | nullable |
| `ucva_od/os`, `bcva_od/os`, `near_va_od/os` | String(20) | nullable |
| `blood_pressure` | String(20) | nullable |
| `pulse` | Integer | nullable |
| `pupils_equal_round_reactive` | Boolean | nullable (PERRLA) |
| `relative_afferent_pupillary_defect` | Boolean | nullable (RAPD) |
| `cover_test_notes` | Text | nullable |
| `technician_notes` | Text | nullable |
| `recorded_by_id` | UUID FK→staff | SET NULL, nullable |

#### Refraction (`refractions`) — Per-eye Rx measurements
Mixins: TimestampMixin. Multiple per encounter (by type).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL, indexed |
| `encounter_id` | UUID FK→encounters | CASCADE |
| `refraction_type` | RefractionType enum | NOT NULL |
| `od_sphere`, `os_sphere` | Numeric(5,2) | CheckConstraint: -25..+25 |
| `od_cylinder`, `os_cylinder` | Numeric(5,2) | nullable |
| `od_axis`, `os_axis` | Integer | CheckConstraint: 1-180 |
| `od_add`, `os_add` | Numeric(4,2) | nullable |
| `od_prism`, `os_prism` | Numeric(4,2) | nullable |
| `od_prism_base`, `os_prism_base` | String(10) | nullable |
| `od_visual_acuity`, `os_visual_acuity` | String(20) | nullable |
| `pd_distance`, `pd_near` | Numeric(4,1) | nullable |
| `pd_od`, `pd_os` | Numeric(4,1) | nullable (monocular PD) |
| `notes` | Text | nullable |
| `is_final_rx` | Boolean | default=false |
| `recorded_by_id` | UUID FK→staff | SET NULL, nullable |

Index: `(encounter_id, refraction_type)`

#### ExamFindings (`exam_findings`) — Per-eye JSONB findings
Mixins: TimestampMixin.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL, indexed |
| `encounter_id` | UUID FK→encounters | CASCADE |
| `patient_id` | UUID FK→patients | CASCADE |
| `exam_section` | String(50) | NOT NULL |
| `is_normal_wnl` | Boolean | default=false |
| `findings_od` | JSONB | nullable — right eye |
| `findings_os` | JSONB | nullable — left eye |
| `ai_raw_transcript` | Text | nullable |
| `provider_notes` | Text | nullable |
| `recorded_by_id` | UUID FK→staff | SET NULL, nullable |

UniqueConstraint: `(encounter_id, exam_section)`

#### Diagnosis (`diagnoses`) — ICD-10 codes per encounter
Mixins: TimestampMixin, SoftDeleteMixin.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL, indexed |
| `encounter_id` | UUID FK→encounters | CASCADE |
| `icd10_code` | String(20) | NOT NULL |
| `description` | String(500) | NOT NULL |
| `eye_affected` | EyeAffected enum | nullable |
| `severity` | String(50) | nullable |
| `status` | String(50) | default="active" |
| `notes` | Text | nullable |
| `is_deleted` | Boolean | default=false (via SoftDeleteMixin) |
| `deleted_at` | DateTime(tz) | nullable (via SoftDeleteMixin) |

Index: `(encounter_id, icd10_code)`

#### PatientProblem (`patient_problems`) — Master problem list
Mixins: TimestampMixin, SoftDeleteMixin.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL, indexed |
| `patient_id` | UUID FK→patients | CASCADE |
| `icd10_code` | String(20) | NOT NULL |
| `description` | String(500) | NOT NULL |
| `eye_affected` | EyeAffected enum | nullable |
| `severity` | String(50) | nullable |
| `status` | String(50) | default="active" |
| `onset_date`, `resolved_date` | Date | nullable |
| `source_encounter_id` | UUID FK→encounters | SET NULL, nullable |
| `notes` | Text | nullable |

---

## III. The Finalization & Audit Engine

### Electronic Signature

California law (Civil Code 1633) requires a verifiable signer for every medical record.

**Finalization Hook:** `POST /api/encounters/{id}/finalize` (`encounter.py:finalize_encounter`)

**Requirements:**
- Must include Assessment & Plan (`min_length=10`, `max_length=10000`)
- Signer resolved from `Staff.global_user_id == ctx.user_id` (NOT raw ctx.user_id)
- Active staff record required (403 if not found)

**Audit Trail:** Records `signed_by_id` (FK to Staff.id), `signed_at` (UTC timestamp), `finalized_at` (UTC timestamp)

**Seal Steps:**
1. Resolve staff via `resolve_staff(ctx, db)` (403 if not found)
2. Load encounter with all sub-resources (selectinload)
3. Guard: `is_finalized == True` → HTTP 409 Conflict
4. Atomic seal: set `assessment_and_plan`, `is_finalized=True`, `finalized_at=now(UTC)`, `signed_by_id=staff.id`, `signed_at=now(UTC)`
5. `log_action(AuditAction.FINALIZE)` — forensic record of who signed
6. Post-finalization sync: for each diagnosis with `problem_id:` in notes → if status="resolved", update PatientProblem
7. Flush + refresh

### Immutability Rule

Once `is_finalized == True`:

- **Backend:** All PUT/PATCH/DELETE requests to clinical routes for that encounter return **HTTP 409 Conflict**
- **Frontend:** All Zustand stores enter `isReadOnly` mode; input fields are disabled

### Finalization Guard Matrix

| Route | Checks `is_finalized`? | Returns 409? | Status |
|-------|----------------------|-------------|--------|
| PATCH /encounters/{id} | YES (`encounter.py:228`) | YES | OK |
| PUT /encounters/{id}/vitals | YES (`vitals.py:35-36`) | YES | OK |
| PUT /encounters/{id}/exam-findings/{section} | YES (`exam_findings.py:63-65`) | YES | OK |
| POST /encounters/{id}/diagnoses | YES (`diagnosis.py:48-49`) | YES | OK |
| PATCH /encounters/{id}/diagnoses/{dx_id} | YES (`diagnosis.py:90-91`) | YES | OK |
| DELETE /encounters/{id}/diagnoses/{dx_id} | YES (`diagnosis.py:136-137`) | YES | OK |
| POST /encounters/{id}/diagnoses/from-problem/{id} | YES (`promotion.py:45-46`) | YES | OK |
| PATCH /encounters/{id}/column/{col_index} | NEEDS VERIFICATION | — | UNVERIFIED |

---

## IV. API Layer

### Route Map

| Method | Path | File | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/api/encounters/` | `encounter.py` | `create_encounter` | Create encounter |
| GET | `/api/encounters/{id}` | `encounter.py` | `get_encounter` | Full detail (eager-loads all) |
| PATCH | `/api/encounters/{id}` | `encounter.py` | `update_encounter` | Update narrative fields |
| POST | `/api/encounters/{id}/finalize` | `encounter.py` | `finalize_encounter` | Lock + sign |
| PUT | `/api/encounters/{id}/vitals` | `vitals.py` | `update_vitals` | Upsert vitals |
| PATCH | `/api/encounters/{id}/column/{col}` | `refraction.py` | — | Upsert refraction |
| PUT | `/api/encounters/{id}/exam-findings/{section}` | `exam_findings.py` | `upsert_exam_findings` | Upsert findings |
| GET | `/api/encounters/{id}/exam-findings/{section}` | `exam_findings.py` | `get_exam_findings` | Get findings |
| POST | `/api/encounters/{id}/diagnoses` | `diagnosis.py` | `create_diagnosis` | Add diagnosis |
| PATCH | `/api/encounters/{id}/diagnoses/{dx_id}` | `diagnosis.py` | `update_diagnosis` | Update diagnosis |
| DELETE | `/api/encounters/{id}/diagnoses/{dx_id}` | `diagnosis.py` | `delete_diagnosis` | **Soft delete** (sets `is_deleted=True`, `deleted_at=now()`) |
| POST | `/api/encounters/{id}/diagnoses/from-problem/{id}` | `promotion.py` | `promote_problem_to_diagnosis` | Promotion |
| GET | `/api/patients/{id}/problems` | `patient_problem.py` | `list_problems` | List problems |
| POST | `/api/patients/{id}/problems` | `patient_problem.py` | `create_problem` | Add problem |
| PATCH | `/api/patients/{id}/problems/{id}` | `patient_problem.py` | `update_problem` | Update problem |
| DELETE | `/api/patients/{id}/problems/{id}` | `patient_problem.py` | `delete_problem` | **Soft delete** |

### Pydantic Validation Ranges (Clinical Rulebook)

| Field | Range/Pattern | Schema File | Rationale |
|-------|--------------|-------------|-----------|
| IOP (od/os) | 0.0 - 80.0 mmHg | `schemas/encounter.py` | >80 impossible; >21 elevated |
| Blood Pressure | `^\d{2,3}/\d{2,3}$`, sys 60-250, dia 30-150, dia < sys | `schemas/encounter.py` | Clinical plausibility |
| Pulse | 30-250 bpm | `schemas/encounter.py` | Clinical plausibility |
| Sphere | -25.00 to +25.00 D | DB CheckConstraint | Optical limits |
| Axis | 1-180 degrees | DB CheckConstraint | Angular definition |
| ICD-10 | `^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$` | `schemas/diagnosis.py` | Format only |
| Encounter Date | <= today | `schemas/encounter.py` | No future records |
| Assessment | min=10, max=10000 | `schemas/encounter.py` | Must document plan |

---

## V. Frontend State & UX Logic

### Zustand Store Pattern

**Auto-Save:** 1.5s debounce on all clinical inputs (timers stored OUTSIDE Zustand to prevent re-renders)

**Dual-State:** Tracks `draft` (local/DOM changes) vs `committed` (server-verified data)

**Lifecycle:**
```
idle → user types → dirty → 1.5s no input → saving → API response → saved → 2s → idle
                                                                   → error (committed unchanged, draft preserved)
```

**Network Resilience:** On API failure, draft survives in Zustand. Committed unchanged. Next keystroke restarts debounce.

**Middleware:** All stores use `zustand` + `devtools` + `subscribeWithSelector`. Selector hooks prevent unnecessary re-renders.

### The "WNL" Macro

ExamFindings store: `setWNL()` populates all 16 anatomical structures with "Normal" defaults across both eyes (`findings_od` + `findings_os`), sets `is_normal_wnl = true`, triggers save.

**Safety switch:** `setStructureField()` auto-sets `is_normal_wnl = false` if any field deviates from default. Prevents accidentally leaving WNL=true when findings are abnormal.

### Store Inventory

| Store | File | Shape | Save Pattern | API Endpoint |
|-------|------|-------|-------------|-------------|
| Refraction | `refractionStore.ts` | `columns[4]` | 1.5s debounce/column | `PATCH .../column/{col}` |
| Vitals | `vitalsStore.ts` | `encounters[id]` | 1.5s debounce/encounter | `PUT .../vitals` |
| ExamFindings | `examFindingsStore.ts` | `findings[id:section]` | 1.5s debounce/section | `PUT .../exam-findings/{s}` |
| Diagnosis | `diagnosisStore.ts` | `encounters[id]` | Explicit (immediate) | `POST/PATCH/DELETE .../diagnoses` |
| ProblemList | `problemListStore.ts` | `patients[id]` | Explicit (immediate) | `CRUD .../problems` |
| Encounter | `encounterStore.ts` | `encounters[id]` (status, patientId, chiefComplaint, finalization) | 1.5s debounce (chiefComplaint) | `PATCH .../encounters/{id}` |
| Session | `sessionStore.ts` | `AppSession \| null` | — | Mock in dev |
| Theme | `themeStore.ts` | `"dark" \| "light"` | localStorage | — |
| Customization | `tenantCustomizationStore.ts` | `logo, accent` | localStorage | — |

### Client-Side Validation

| Store | Validation | Notes |
|-------|-----------|----|
| Refraction | Axis required when cylinder set (per eye) | Prevents invalid Rx |
| Vitals | IOP 0-80, pulse 30-250, BP regex | Mirrors Pydantic |
| ExamFindings | None | Server-side JSONB validation |
| Diagnosis | None | Server-side validation |

### Chief Complaint Save Pattern

The `chiefComplaint` field on `EncounterState` follows the standard dual-save strategy used across all clinical stores.

**Store Shape** (`store/encounterStore.ts`):
```typescript
interface EncounterState {
  status: EncounterStatus;
  isFinalized: boolean;
  encounterDate: string;
  providerName: string;
  patientId?: string;
  chiefComplaint?: string;       // Patient's reason for visit
  signedByName?: string;
  signedAt?: string;
}
```

**Action:** `setChiefComplaint(id: string, text: string)` — updates `encounters[id].chiefComplaint`

**Save Strategy** (component-level in `EncounterWorkflowHeader`):
1. **Debounced:** 1.5s `setTimeout` after last keystroke — standard clinical debounce
2. **Flush on blur:** `onBlur` calls `setChiefComplaint()` immediately — ensures save before navigation
3. **Read-only guard:** No timer created when `isReadOnly` (finalized encounter)

**Backend Alignment:** `chief_complaint` TEXT column on `Encounter` model, max 2000 chars on update (`EncounterUpdateRequest`), max 1000 chars on create (`EncounterCreateRequest`).

### Patient Context Fallback (Layout Pre-Initialization)

**Problem:** When navigating directly to an encounter URL, the Zustand store may not yet have `patientId` loaded — causing the `PatientStickyHeader` to flicker or show empty.

**Solution:** A 3-tier fallback hierarchy in the tenant layout (`app/(tenant)/[tenantId]/layout.tsx`) resolves patient context synchronously before the encounter data loads from the API.

**Fallback Tiers:**
```
Tier 1: Store        → encounters[encounterId]?.patientId     (fastest — already in Zustand)
Tier 2: Mapping Lib  → getPatientIdForEncounter(encounterId)  (reverse lookup from mock data)
Tier 3: Patient Hydration → getPatientById(patientId)         (full PatientHeaderData)
```

**Implementation:**
```typescript
const patientHeader = useMemo<PatientHeaderData | null>(() => {
  if (!encounterId) return null;
  const enc = encounters[encounterId];
  const patientId = enc?.patientId ?? getPatientIdForEncounter(encounterId);  // Tier 1 → Tier 2
  if (!patientId) return null;
  const patient = getPatientById(patientId);                                  // Tier 3
  if (!patient) return null;
  return { id, firstName, lastName, preferredName, dob, sex, alerts };
}, [encounterId, encounters]);
```

**Anti-Flicker Guarantees:**
- `useMemo` with `[encounterId, encounters]` — recomputes only on store changes
- Conditional render: `{isEncounterRoute && patientHeader && <PatientStickyHeader />}` — nothing renders until data is ready
- `initEncounter()` on mount sets `patientId` in store immediately, so subsequent renders use Tier 1

**Mapping Library:** `getPatientIdForEncounter()` in `lib/mock-patient-data.ts` — iterates `ENCOUNTERS` record, returns `patientId` for a given encounter ID. Will be replaced with API call in production, but the fallback pattern remains the same.

---

## VI. HIPAA Compliance & Forensic Logging

### A. AuditLog Table (Forensic Record)

**Location:** `app/db/models/tenant/clinical.py` (class `AuditLog`)

**Design Principle:** Append-only. No `SoftDeleteMixin`, no `updated_at` column. Records are **never modified or deleted** — they form the immutable forensic trail required by HIPAA 164.312(b).

**Helper:** `app/core/audit.py` → `log_action()` async function. Must be called on every clinical write operation.

```python
async def log_action(
    db: AsyncSession, ctx: TenantContext, action: AuditAction,
    resource_type: str, resource_id: UUID, *,
    staff_id: UUID | None = None, encounter_id: UUID | None = None,
    patient_id: UUID | None = None, detail: str | None = None,
    ip_address: str | None = None,
) -> None
```

**AuditAction Enum** (`clinical.py:107`): `create`, `read`, `update`, `delete`, `finalize`, `promote`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID PK | default=uuid4 |
| `tenant_id` | UUID | NOT NULL |
| `user_id` | UUID | NOT NULL — global Supabase user ID |
| `staff_id` | UUID FK→staff | nullable — internal clinic staff ID |
| `action` | AuditAction enum | NOT NULL |
| `resource_type` | String(50) | NOT NULL (e.g. "encounter", "diagnosis", "vitals") |
| `resource_id` | UUID | NOT NULL |
| `encounter_id` | UUID | nullable |
| `patient_id` | UUID | nullable |
| `detail` | Text | nullable — human-readable description |
| `ip_address` | String(45) | nullable — IPv4/IPv6 |
| `created_at` | DateTime(tz) | server_default=func.now() — **IMMUTABLE** |

**Indexes (3):**
1. `(tenant_id, resource_type, resource_id)` — lookup by resource
2. `(tenant_id, patient_id, created_at)` — patient timeline
3. `(tenant_id, user_id, created_at)` — user activity

**Append-Only Rules:**
- No `updated_at` column (unlike all other clinical models)
- No `SoftDeleteMixin` — rows are permanent
- `created_at` uses `server_default=func.now()` only (no `onupdate`)
- No DELETE endpoint exposed for this table

### B. `resolve_staff` — Mandatory User Attribution

**Location:** `app/core/security.py:128-146`

**Purpose:** Maps `ctx.user_id` (global Supabase UUID from JWT) → `staff.id` (internal clinic-scoped UUID). This ensures all clinical records reference the correct internal staff identity.

**Signature:** `async def resolve_staff(ctx: TenantContext, db: AsyncSession) -> Staff | None`

**Query:** `Staff.global_user_id == ctx.user_id AND tenant_id == ctx.tenant_id AND is_active == True`

**Usage Pattern — Mandatory for all clinical write routes:**

| Route File | Uses `resolve_staff`? | Sets `recorded_by_id`/`signed_by_id`? |
|------------|----------------------|--------------------------------------|
| `encounter.py` | YES (finalize) | `signed_by_id = staff.id` |
| `vitals.py` | YES | `recorded_by_id = staff.id` |
| `exam_findings.py` | YES | `recorded_by_id = staff.id` |
| `diagnosis.py` | No (not needed — no recorded_by_id column) | N/A |
| `promotion.py` | No (not needed — no recorded_by_id column) | N/A |
| `patient_problem.py` | **NO — GAP** | **NO — GAP** |

### C. Soft-Delete Coverage (US Record Retention)

**Principle:** All clinical records that could contain PHI must use soft-delete to comply with California B&P 3007 (adult: 7 years, minor: until age 21 + 7 years) and HIPAA record retention guidelines.

**Implementation:** `SoftDeleteMixin` from `app/db/mixins.py` adds `is_deleted` (Boolean, default=false) and `deleted_at` (DateTime, nullable).

| Model | Has SoftDeleteMixin? | DELETE Endpoint Behavior |
|-------|---------------------|--------------------------|
| Patient | YES | Soft delete |
| Encounter | YES | Soft delete |
| PatientProblem | YES | Soft delete |
| Diagnosis | YES | Soft delete (sets `is_deleted=True`, `deleted_at=now()`) |
| VitalsAndPretest | No (1:1 with Encounter, uses upsert) | No delete endpoint |
| ExamFindings | No (uses upsert, no delete) | No delete endpoint |
| Refraction | No | **Consider adding** |
| AuditLog | **Explicitly NO** — append-only forensic record | No delete endpoint |

### D. Audit Logging Coverage Matrix

Every clinical write operation must call `log_action()`. Current coverage:

| Route File | Action | `log_action` Called? | AuditAction Used |
|------------|--------|---------------------|------------------|
| `encounter.py` | CREATE | YES | `CREATE` |
| `encounter.py` | READ (get) | YES | `READ` |
| `encounter.py` | UPDATE (patch) | YES | `UPDATE` |
| `encounter.py` | FINALIZE | YES | `FINALIZE` |
| `vitals.py` | UPSERT | YES | `UPDATE` |
| `exam_findings.py` | UPSERT | YES | `UPDATE` |
| `diagnosis.py` | CREATE | YES | `CREATE` |
| `diagnosis.py` | UPDATE | YES | `UPDATE` |
| `diagnosis.py` | DELETE (soft) | YES | `DELETE` |
| `promotion.py` | PROMOTE | YES | `PROMOTE` |
| `patient_problem.py` | CREATE | **NO — GAP** | — |
| `patient_problem.py` | UPDATE | **NO — GAP** | — |
| `patient_problem.py` | DELETE | **NO — GAP** | — |

### E. HIPAA Technical Safeguards

| Requirement | CFR | Implementation | Status |
|------------|-----|----------------|--------|
| Access Control | 164.312(a) | JWT + TenantContext + StaffRole | IMPLEMENTED (roles not enforced) |
| Audit Controls | 164.312(b) | `AuditLog` table + `log_action()` on all clinical writes | **IMPLEMENTED** |
| Integrity | 164.312(c) | Finalization lock, SoftDelete, CheckConstraints | IMPLEMENTED |
| Transmission Security | 164.312(e) | HTTPS, JWT bearer | INFRASTRUCTURE |
| Encryption at Rest | — | Supabase/RDS, ssn_last4 isolated | INFRASTRUCTURE |
| User Authentication | 164.312(d) | `resolve_staff()` → `recorded_by_id` / `signed_by_id` | **IMPLEMENTED** |
| Automatic Logoff | 164.312(a)(2)(iii) | Not implemented | PLANNED |
| Amendment Rights | 164.526 | No addendum model | PLANNED |

### F. California Requirements

| Requirement | Regulation | Implementation | Status |
|------------|-----------|----------------|--------|
| Retention (Adult) | B&P 3007 | SoftDelete on all clinical models, no purge | COMPLIANT |
| Retention (Minor) | B&P 3007 | SoftDelete, no dob purge | NEEDS PURGE GUARD |
| E-Signatures | Civil Code 1633 | `signed_by_id` + `signed_at` via `resolve_staff` | IMPLEMENTED |
| License Display | B&P 3041 | `license_number` on Staff | DATA MODEL READY |
| Patient Access | CMIA | Not implemented | PLANNED |

### G. Known Gaps (as of 2026-03-04)

**Resolved in Phase 1 Audit Fixes:**
- ~~[CRITICAL] No AuditLog table~~ → `AuditLog` model + `log_action()` implemented
- ~~[CRITICAL] Diagnosis hard-deletes~~ → SoftDeleteMixin added, DELETE endpoint is now soft-delete
- ~~[WARNING] ExamFindings recorded_by_id FK mismatch~~ → Uses `resolve_staff()` for correct staff.id
- ~~[WARNING] Vitals never sets recorded_by_id~~ → Uses `resolve_staff()` for correct staff.id
- ~~[WARNING] No RBAC on routes~~ → `require_permission()` + `PERMISSION_MATRIX` implemented (see Section VIII)

**Open Gaps:**

1. **[WARNING] patient_problem.py missing audit logging** — CREATE/UPDATE/DELETE operations do not call `log_action()`. **Fix:** Add `log_action()` calls matching the pattern in `diagnosis.py`.

2. **[WARNING] Dev auth bypass unguarded** — `security.py`: empty `SUPABASE_JWT_SECRET` grants full access. **Fix:** Add environment guard.

3. **[INFO] RLS not implemented** — Python isolation is primary. Add as defense-in-depth.

4. **[INFO] No ICD-10 lookup** — Format regex only. Phase 2.

5. **[INFO] Refraction lacks SoftDeleteMixin** — Consider adding for independent audit trail.

6. **[INFO] No amendment workflow** — HIPAA 164.526 requires addenda mechanism for finalized records.

---

## VIII. Role-Based Access Control (RBAC)

### A. The 5 Core Roles

**HIPAA "Minimum Necessary" Rule** (45 CFR 164.502(b)): A covered entity must make reasonable efforts to limit access to ePHI to the minimum necessary to accomplish the intended purpose. ClarityOS enforces this via five role-scoped access tiers.

| Role | Enum Value | Clinical Scope | HIPAA Justification |
|------|------------|---------------|---------------------|
| **Doctor** | `doctor` | Full clinical access: vitals, refraction, exam findings, diagnoses, finalization/signing | Primary care provider — requires complete patient record |
| **Technician** | `technician` | Pre-test data entry: vitals, refraction. Can view (not edit) exam findings, diagnoses. Cannot finalize. | Assists provider — needs measurement entry, not diagnostic authority |
| **Receptionist** | `receptionist` | Scheduling & demographics only. Can view encounters (read-only). No clinical data writes. | Front desk — minimum necessary is appointment and contact info |
| **Admin** | `admin` | Billing, reporting, staff management, audit log access. Can view clinical data but not edit exam findings or diagnoses. | Practice management — needs oversight without clinical write access |
| **Owner** | `owner` | Superset of all roles + subscription management. Equivalent to Doctor + Admin. Optionally carries a `clinical_role` (doctor or technician) for dual-role practitioners. | Practice owner — full authority over all operations |

**Dual-Role Note:** An Owner who also practices clinically (e.g., an optometrist who owns the clinic) carries an optional `clinical_role` in their JWT. See Section VIII.E for full details.

**Enum Location:** `app/db/models/tenant/clinical.py:43-50` (`StaffRole`)

### B. Permission Engine

**Location:** `app/core/permissions.py`

**Architecture:** Three components work together:

1. **`ClinicalAction`** (StrEnum) — 16 granular actions representing every protected operation
2. **`PERMISSION_MATRIX`** (dict) — maps each action to the set of `StaffRole`s allowed to perform it
3. **`require_permission(action)`** — FastAPI dependency factory that wraps `get_current_tenant` + role check

**Usage Pattern:**
```python
from app.core.permissions import ClinicalAction, require_permission

@router.post("/{encounter_id}/finalize")
async def finalize_encounter(
    ...,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.FINALIZE_ENCOUNTER)),
):
    # Only DOCTOR or OWNER roles reach this code
    # All others get HTTP 403: "Role 'technician' cannot perform 'finalize_encounter'."
```

**Full Permission Matrix:**

| Action | Doctor | Tech | Reception | Admin | Owner |
|--------|:------:|:----:|:---------:|:-----:|:-----:|
| `VIEW_ENCOUNTER` | Y | Y | Y | Y | Y |
| `CREATE_ENCOUNTER` | Y | Y | — | Y | Y |
| `UPDATE_ENCOUNTER` | Y | Y | — | Y | Y |
| `FINALIZE_ENCOUNTER` | Y | — | — | — | Y |
| `VIEW_VITALS` | Y | Y | — | Y | Y |
| `EDIT_VITALS` | Y | Y | — | — | Y |
| `VIEW_REFRACTION` | Y | Y | — | Y | Y |
| `EDIT_REFRACTION` | Y | Y | — | — | Y |
| `VIEW_EXAM_FINDINGS` | Y | Y | — | Y | Y |
| `EDIT_EXAM_FINDINGS` | Y | — | — | — | Y |
| `VIEW_DIAGNOSIS` | Y | Y | — | Y | Y |
| `CREATE_DIAGNOSIS` | Y | — | — | — | Y |
| `DELETE_DIAGNOSIS` | Y | — | — | — | Y |
| `PROMOTE_PROBLEM` | Y | — | — | — | Y |
| `VIEW_AUDIT_LOG` | — | — | — | Y | Y |
| `MANAGE_STAFF` | — | — | — | Y | Y |

### C. Dual-Layer Access Model

ClarityOS uses two independent access layers that **both must pass** for any action:

```
Request → JWT Verification → Layer 1: Entitlements → Layer 2: RBAC → Handler
                              (clinic can access?)    (user can do?)
```

**Layer 1 — Entitlements** (subscription plan features): Controls what the *clinic* has access to based on their subscription tier (Core / Plus / Premium). Example: `AI_SCRIBE` is Premium-only.

**Layer 2 — Roles** (RBAC): Controls what the *individual user* can do within those features. Example: even on a Premium plan, a Receptionist cannot finalize an encounter.

**Superuser Bypass:** `is_superuser: true` in JWT skips both layers (internal support use only).

**Entitlement → Feature Mapping** (`lib/entitlements.ts`, `app/core/entitlements.py`):

| Tier | Features |
|------|----------|
| Core | `SCHEDULING`, `PATIENT_DEMOGRAPHICS`, `BASIC_EXAM`, `ICD10_DIAGNOSES` |
| Plus | Core + `BILLING_EXPORT`, `MULTI_PROVIDER` |
| Premium | Plus + `AI_SCRIBE`, `ADVANCED_ANALYTICS`, `EQUIPMENT_IMPORT` |

### D. Frontend Enforcement

**1. `PermissionGate` Component** (`components/auth/PermissionGate.tsx`)

Declarative role gate for clinical UI elements.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `roles` | `StaffRole[]` | required | Roles allowed to see/interact |
| `children` | `ReactNode` | required | Protected content |
| `fallback` | `ReactNode` | `null` | Shown when access denied |
| `mode` | `"hide" \| "disable"` | `"hide"` | `"hide"` removes from DOM; `"disable"` renders with `opacity-50 pointer-events-none` |

**Usage Examples:**
```tsx
{/* Only doctor/owner can see the finalize button */}
<PermissionGate roles={["doctor", "owner"]}>
  <button onClick={finalize}>Sign & Finalize</button>
</PermissionGate>

{/* Tech can see but not interact with vitals form */}
<PermissionGate roles={["doctor", "technician", "owner"]} mode="disable">
  <VitalsForm />
</PermissionGate>
```

**2. Programmatic Checks** (`hooks/useEntitlements.ts`):
```tsx
const { requireRole, has, isSuperuser } = useEntitlements();

// Role check
if (!requireRole("admin", "owner")) return <AccessDeniedUI />;

// Entitlement check
if (!has(Entitlement.AI_SCRIBE)) return <UpsellModal />;
```

**3. Sidebar Navigation Filtering** (`components/Sidebar.tsx`):
Nav items with `requiredRoles` are hidden when the user's role doesn't match. Admin-only items (Staff, Settings) are invisible to clinical staff.

### E. Dual Owner/Practician Pattern

**Business Case:** In many optometry practices, the clinic owner is also a practicing doctor (OD/MD). The dual-role pattern allows one person to hold administrative authority (owner) AND clinical privileges (doctor or technician) simultaneously.

**JWT Payload Extension** (`types/session.ts`):
```typescript
interface JwtPayload {
  role: StaffRole;                // Primary role: "owner"
  clinical_role?: StaffRole;      // Optional: "doctor" | "technician"
  // ... other fields
}

interface UserSession {
  role: StaffRole;
  clinicalRole?: StaffRole;       // Hydrated from JWT clinical_role
}
```

**RBAC Resolution** (`hooks/useEntitlements.ts`):
```typescript
// requireRole() checks BOTH roles — owner-doctor passes "doctor" gates
return roles.includes(user.role) || (!!user.clinicalRole && roles.includes(user.clinicalRole));
```

**How It Works:**

| Scenario | `role` | `clinicalRole` | Passes `requireRole("doctor")`? | Passes `requireRole("admin")`? |
|----------|--------|---------------|--------------------------------|-------------------------------|
| Pure admin | `admin` | — | No | Yes |
| Pure owner | `owner` | — | No (but Owner in PERMISSION_MATRIX covers it) | Yes |
| Owner-doctor | `owner` | `doctor` | **Yes** (via clinicalRole match) | Yes |
| Owner-technician | `owner` | `technician` | No | Yes |

**Backend Note:** The `PERMISSION_MATRIX` in `permissions.py` already grants Owner access to all Doctor-level actions (FINALIZE_ENCOUNTER, CREATE_DIAGNOSIS, etc.). The `clinical_role` field primarily extends **frontend** gating — allowing `PermissionGate roles={["doctor"]}` to pass for owner-doctors without needing to list "owner" in every gate.

**Staff Form UI** (`app/(tenant)/[tenantId]/admin/page.tsx`):
- Clinical role picker **only appears** when primary role is "owner"
- Options: None (admin-only), Doctor (OD/MD), Technician
- Effective clinical role: `role === "owner" && clinicalRole ? clinicalRole : undefined`

**Display:** Role badge shows primary role + sub-text `"+ Doctor"` or `"+ Technician"` for dual-role staff.

---

## IX. Staff Management & Administrative Oversight

### A. Staff Model Reference

**Table:** `staff` (see Section II for full column detail)

**Key Columns for Access Control:**

| Column | Type | Role in RBAC |
|--------|------|-------------|
| `global_user_id` | UUID (unique) | Links Supabase auth user → internal staff record |
| `role` | StaffRole enum | Determines PERMISSION_MATRIX access |
| `is_active` | Boolean (default=true) | **Kill switch** — deactivated staff cannot perform any clinical action |
| `license_number` | String(100) | California B&P 3041 compliance (provider display) |
| `npi_number` | String(10) | National Provider Identifier for billing/CMS |

**The `is_active` Flag — HIPAA-Compliant Termination:**

When a staff member leaves the practice or must be locked out:
1. Admin sets `is_active = false` via PATCH `/api/staff/{id}`
2. `resolve_staff(ctx, db)` query filters `is_active == True` → returns `None` for deactivated staff
3. All clinical write routes that call `resolve_staff()` will fail (staff not found → 403)
4. The Staff record is **never hard-deleted** — preserves `AuditLog` FK integrity and historical attribution

This satisfies **HIPAA 164.308(a)(3)(ii)(C) — Termination Procedures**: "Implement procedures for terminating access to ePHI when the employment of, or other arrangement with, a workforce member ends."

### B. Staff Management Endpoints

**Location:** `app/api/routes/staff.py`

**All endpoints gated by:** `require_permission(ClinicalAction.MANAGE_STAFF)` → **Admin and Owner only**

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/staff/` | `list_staff` | List all staff for tenant (ordered by last_name, first_name) |
| GET | `/api/staff/{staff_id}` | `get_staff` | Get full staff detail |
| PATCH | `/api/staff/{staff_id}` | `update_staff` | Update role, name, or `is_active` status |

**Mutable Fields via PATCH:** `role`, `clinical_role` (owner only), `first_name`, `last_name`, `is_active`, `license_number`, `npi_number`

**Tenant Isolation:** All queries include `.where(Staff.tenant_id == ctx.tenant_id)` — admins can only manage staff within their own clinic.

### C. HIPAA Workforce Security (164.308(a)(3))

| HIPAA Requirement | CFR | Implementation | Status |
|-------------------|-----|----------------|--------|
| Authorization & Supervision | 164.308(a)(3)(ii)(A) | `StaffRole` enum + `PERMISSION_MATRIX` | IMPLEMENTED |
| Workforce Clearance | 164.308(a)(3)(ii)(B) | `is_active` flag, admin-managed | IMPLEMENTED |
| Termination Procedures | 164.308(a)(3)(ii)(C) | `is_active = false` → `resolve_staff()` blocks access | IMPLEMENTED |

**Deactivation Cascade:**
```
Admin sets is_active = false
  → resolve_staff() returns None
    → Finalization: 403 "Active staff record required"
    → Vitals/ExamFindings: recorded_by_id = None (staff not resolved)
    → AuditLog entries: staff_id preserved from prior actions (immutable)
```

### D. Frontend Admin Panel

**Location:** `app/(tenant)/[tenantId]/admin/page.tsx`

**Access Gate:**
```tsx
const { requireRole } = useEntitlements();
if (!requireRole("admin", "owner")) return <AccessDeniedUI />;
```

**Staff Management UI Features:**
- **Staff list** with role badges (5 distinct colors) + dual-role sub-text ("+ Doctor" for owner-practitioners)
- **Staff form dialog** with conditional clinical role picker (shown only when role="owner")
- **Role color system:**

| Role | Color | Hex |
|------|-------|-----|
| Doctor | Blue | `#60A5FA` |
| Technician | Green | `#34D399` |
| Receptionist | Amber | `#FBBF24` |
| Admin | Purple | `#A78BFA` |
| Owner | Pink | `#FB7185` |

- **Dual-role form logic:** `effectiveClinicalRole = form.role === "owner" && form.clinicalRole ? form.clinicalRole : undefined`
- **NPI display:** Shown only for staff with clinical role (doctor/technician)

**`PermissionGate` in the Minimum Necessary Standard:**

The `PermissionGate` component is the frontend enforcement of HIPAA's "Minimum Necessary" rule. By wrapping clinical UI elements with role-appropriate gates, the system ensures:

- **Receptionists** see scheduling and demographics — never exam findings or diagnoses
- **Technicians** can enter pre-test data — but finalize buttons and diagnosis pickers are hidden
- **Doctors** have full clinical access — administrative panels (staff management, audit logs) are hidden
- **Admins** can manage staff and view reports — clinical write controls are disabled
- **Owner-practitioners** access both admin and clinical workflows via dual-role resolution

This creates a **defense-in-depth** model where both frontend (`PermissionGate`) and backend (`require_permission`) independently enforce the same access rules. Even if the frontend gate is bypassed (e.g., direct API call), the backend rejects unauthorized requests with HTTP 403.
