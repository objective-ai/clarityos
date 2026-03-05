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
| GET | `/api/encounters/{id}/audit-logs` | `audit.py` | `get_encounter_audit_logs` | Encounter-scoped audit history |
| GET | `/api/audit-logs` | `audit.py` | `list_audit_logs` | Tenant-wide paginated + filterable log |
| GET | `/api/audit-logs/export` | `audit.py` | `export_audit_logs` | CSV export for compliance review |

**Audit log access:** All three require `VIEW_AUDIT_LOG` permission (`ADMIN`, `OWNER` only).

**Filter parameters** (`GET /api/audit-logs`): `user_id`, `action`, `date_from`, `date_to`, `patient_id`, `page`, `per_page`

**Staff name JOIN:** `AuditLog.user_id` is joined against `Staff` table to resolve human-readable `staff_name` in responses.

**Response schemas** (`app/schemas/audit.py`):

```python
# Single audit log entry
class AuditLogResponse(BaseModel):
    id: UUID
    timestamp: datetime
    user_id: UUID
    staff_name: str | None      # Resolved from Staff table JOIN
    encounter_id: UUID | None
    patient_id: UUID | None
    action_type: str            # AuditAction enum value
    resource_type: str
    detail: str
    changes: dict | None        # Field-level diff payload
    metadata: dict | None       # e.g. model_version for AI actions

# Paginated list
class AuditLogListResponse(BaseModel):
    logs: list[AuditLogResponse]
    total: int
    page: int
    per_page: int
```

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
| Encounter | `encounterStore.ts` | `encounters[id]` (status, patientId, chiefComplaint, signedByName, signedAt, aiSummaryText, aiSummaryGeneratedAt, finalizeModalOpen) | 1.5s debounce (chiefComplaint) | `PATCH .../encounters/{id}` |
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

### Dirty State Guard & Transcript Auto-Save

The AI Scribe transcript is protected against accidental data loss (tab close, refresh, crash) via two mechanisms implemented entirely inside `AiScribeWidget` — no state is lifted to the parent `EncounterPage`, preserving 60fps typing performance.

**Dirty State Detection:**
```typescript
const isDirty = transcript.trim().length > 0 && !isFinalized;
```

**`beforeunload` Guard:** Registered from within the widget (attaches to the global `window` — works from any mounted child component). Fires the browser's native "Leave site?" confirmation dialog when `isDirty` is true.

**localStorage Auto-Save:**
- `localStorage.setItem(storageKey, transcript)` on every keystroke when transcript is non-empty
- `localStorage.removeItem(storageKey)` when transcript is cleared to empty — prevents the "undeleteable draft" bug where stale text reappears after refresh
- Key format: `draft-transcript-${encounterId}`

**Draft Recovery on Mount:** On component mount, checks localStorage for a saved draft. If found and the current transcript is empty, restores it automatically.

**Cleanup Rules:**
- Draft is NOT cleared on "Accept" — allows "Clear & Edit" flow to regenerate notes
- Draft IS cleared when doctor manually empties the textarea (via `removeItem`)
- `isDirty` forced to `false` when `isFinalized` — no guard on sealed encounters

**Performance Note:** All state (`transcript`, `isDirty`, `storageKey`) is scoped to `AiScribeWidget`. The parent `EncounterPage` does not re-render on keystrokes — heavy components (VitalsForm, RefractionGrid, ExamFindings) are unaffected.

**File:** `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx` — `AiScribeWidget` component (lines 130–175)

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

### EncounterStore — Extended State (Phase 2)

These fields were added to `EncounterState` in `store/encounterStore.ts` during Phase 2:

```typescript
interface EncounterState {
  // ... existing fields ...
  aiSummaryText?: string;          // SOAP narrative saved after AI Scribe Accept
  aiSummaryGeneratedAt?: string;   // ISO timestamp of last generation
  signedByName?: string;           // Provider display name (resolved at finalization)
  signedAt?: string;               // UTC timestamp of Sign & Seal (from server)
  finalizeModalOpen: boolean;      // Drives FinalizeModal visibility
}
```

**New actions:**
- `setAiSummary(id, text)` — persists SOAP narrative on Accept
- `openFinalizeModal(id)` / `closeFinalizeModal(id)` — dispatched by sticky header, bottom tabs, and FinalizeModal itself
- `setSignatureData(id, signedByName, signedAt)` — called after successful finalize API response

### Sidebar Collapse Propagation

**Pattern:** Prop-drilling (not React Context). `contexts/SidebarContext.tsx` does **not exist**.

The sidebar collapsed state originates in the `Sidebar` component (or the tenant layout) and is passed down as a `sidebarCollapsed: boolean` prop directly to layout-aware children.

**Used by:** `EncounterBottomTabs` — computes fixed `left` offset:
- Expanded sidebar: `left: 240px`
- Collapsed sidebar: `left: 56px`

The prop is passed from the encounter page, which receives it from the tenant layout or from the `Sidebar` component's toggle callback.

### API Client (`lib/api-client.ts`)

The **Supabase JWT → FastAPI Bearer token bridge** that all clinical stores use for real API calls.

**Core function:**
```typescript
async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T>
```

**Behavior:**
1. Reads current session from `supabase.auth.getSession()`
2. Attaches `Authorization: Bearer {access_token}` header
3. Sets `Content-Type: application/json`
4. Throws on non-OK responses — error message from `response.detail` with fallback to `response.statusText`

**Base URL:** `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"`

**Mock fallback pattern:** All stores wrap `apiFetch` calls in try/catch — on failure (network error or missing `NEXT_PUBLIC_API_URL`), they fall back to local Zustand state mutations. This is what allows the full app to demo on Vercel without a live FastAPI server.

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

1. **`ClinicalAction`** (StrEnum) — 17 granular actions representing every protected operation
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
| `GENERATE_AI_SCRIBE` | Y | — | — | — | Y |
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

**Staff Form UI** (planned for `app/(tenant)/[tenantId]/admin/page.tsx` — not yet built as a dedicated route):
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

**Location:** `app/(tenant)/[tenantId]/admin/page.tsx` — **PLANNED, not yet implemented as a dedicated route.**

Staff management functionality is planned for this page. Current implementation status: the PATCH `/api/staff/{id}` endpoint exists and is functional; the frontend UI for managing staff is under development.

**Planned access gate:**
```tsx
const { requireRole } = useEntitlements();
if (!requireRole("admin", "owner")) return <AccessDeniedUI />;
```

**Planned staff management UI features:**
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

---

## X. AI Scribe — Phase 2 (Ambient Data-Entry Scribe)

### A. Feature Overview

The AI Scribe is the **flagship Premium feature**. It is an **Ambient Data-Entry Scribe** — NOT a post-exam summarizer. The doctor dictates during the encounter; Claude converts that raw transcript into:
1. A streaming SOAP narrative (visible, word-by-word)
2. Structured JSON that auto-fills all clinical UI grids (vitals, refraction, exam findings, diagnoses)

**Access Gates:**
- **Entitlement:** `AI_SCRIBE` (Premium tier only) — upsell modal shown to Core/Plus clinics
- **RBAC:** `GENERATE_AI_SCRIBE` → Doctor and Owner only (HTTP 403 for all others)

**Model:** `claude-sonnet-4-6-20250514`

### B. Backend Architecture

**New file:** `app/api/routes/ai_scribe.py`

**Endpoint:** `POST /api/encounters/{encounter_id}/ai-scribe`

**Dependency chain:**
1. Verify encounter exists + belongs to tenant
2. Check entitlement: `AI_SCRIBE` in `ctx.entitlements[]`
3. Check RBAC: `require_permission(ClinicalAction.GENERATE_AI_SCRIBE)` → 403 if not doctor/owner
4. Accept `{ "transcript": "string" }` — raw dictation text
5. Stream Claude response via SSE (`text/event-stream`)
6. After stream: save SOAP portion to `encounter.ai_summary_text` + `ai_summary_generated_at`
7. Audit: `log_action(AuditAction.CREATE, "ai_scribe", encounter.id, ...)`

**Dependencies:**
- `requirements.txt`: `anthropic>=0.40`
- `app/core/config.py`: `ANTHROPIC_API_KEY: str = ""`
- `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

**Streaming pattern:**
```python
from anthropic import Anthropic
from fastapi.responses import StreamingResponse

async def stream():
    client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    with client.messages.stream(
        model="claude-sonnet-4-6-20250514",
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": transcript}],
        max_tokens=4096,
    ) as s:
        full_text = ""
        for text in s.text_stream:
            full_text += text
            yield f"data: {json.dumps({'text': text})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    # Save SOAP portion (before delimiter) to DB
    soap_text = full_text.split("___JSON_START___")[0].strip()
    encounter.ai_summary_text = soap_text
    encounter.ai_summary_generated_at = datetime.utcnow()
    await db.commit()

return StreamingResponse(stream(), media_type="text/event-stream")
```

**Route registration** (`app/main.py`): `prefix="/api/encounters"`, tag `"AI Scribe"`

### C. Dual-Output Prompt Architecture

Claude outputs **two parts in a single stream**, separated by a fixed delimiter:

```
[SOAP Narrative — streams word-by-word to UI]

___JSON_START___

[Structured JSON — buffered silently, never shown raw]
```

**SOAP Narrative:** Clinical third-person prose, SOAP sections (Subjective, Objective, Assessment, Plan)

**Structured JSON schema:**
```json
{
  "chief_complaint": "string",
  "vitals": {
    "iop_od": "number | null", "iop_os": "number | null",
    "va_od_distance": "string | null", "va_os_distance": "string | null",
    "va_od_near": "string | null", "va_os_near": "string | null",
    "bp_systolic": "number | null", "bp_diastolic": "number | null",
    "pupils_od": "string | null", "pupils_os": "string | null"
  },
  "exam_findings": {
    "anterior": {
      "OD": { "<structure>": { "status": "normal|abnormal", "notes": "" } },
      "OS": { "<structure>": { "status": "normal|abnormal", "notes": "" } }
    },
    "posterior": { "OD": { ... }, "OS": { ... } }
  },
  "diagnoses": [
    { "icdCode": "H52.13", "description": "Myopia, bilateral", "laterality": "OU" }
  ],
  "refraction": {
    "OD": { "sphere": "-2.00", "cylinder": "-0.75", "axis": "180", "add": "+2.00" },
    "OS": { "sphere": "-1.75", "cylinder": "-0.50", "axis": "175", "add": "+2.00" }
  }
}
```

**Valid structures:**
- Anterior: `lids_lashes`, `conjunctiva_sclera`, `cornea`, `anterior_chamber`, `iris`, `lens`, `tear_film`, `angles`
- Posterior: `cup_to_disc_ratio`, `optic_nerve`, `macula`, `vitreous`, `vessels`, `periphery`

**Omission rule:** Only fields explicitly mentioned in the transcript are included. All others are omitted (not set to null).

### D. Frontend — SSE Hook (`useAiScribe`)

**New file:** `hooks/useAiScribe.ts`

**Return shape:**
```typescript
interface UseAiScribeReturn {
  generate: (transcript: string) => void;
  soapText: string;            // Visible SOAP narrative (streams to UI)
  structuredData: object | null; // Hidden JSON (parsed after delimiter)
  isStreaming: boolean;
  isDone: boolean;
  error: string | null;
}
```

**Dual-stream splitting logic:**
- Opens `fetch POST /api/encounters/{id}/ai-scribe` with `{ transcript }` body
- Reads SSE chunks, appending to internal buffer
- **Before** `___JSON_START___`: chunks appended to `soapText` state (visible, streaming)
- **After** `___JSON_START___`: chunks accumulated in `jsonBuffer` (hidden from user)
- On `done` event: `JSON.parse(jsonBuffer)` → stored in `structuredData`

**`AiScribeWidget` UI** (`encounter/page.tsx`):
- Textarea for transcript / "Paste transcript" area
- "Generate Note" button → `generate(transcript)`
- SOAP text streams word-by-word in real-time (cursor blink at end)
- "Accept" button appears when `isDone` — dispatches `structuredData` to stores
- "Regenerate" clears state and re-triggers
- Loading: pulsing icon + "Listening to transcript…"
- Error: retry button with message

### E. Accept → Auto-Fill Zustand Stores

When user clicks "Accept", `structuredData` is dispatched to all 5 clinical stores:

| Store | Action | File | Data Source |
|-------|--------|------|-------------|
| `encounterStore` | `setChiefComplaint(id, text)` | `store/encounterStore.ts` | `data.chief_complaint` |
| `vitalsStore` | `setField(id, field, value)` | `store/vitalsStore.ts` | `data.vitals` (per non-null field) |
| `examFindingsStore` | `setStructureField(id, section, eye, structure, field, value)` | `store/examFindingsStore.ts` | `data.exam_findings` (nested) |
| `diagnosisStore` | `addDiagnosis(id, payload)` | `store/diagnosisStore.ts` | `data.diagnoses[]` |
| `refractionStore` | `setCellValue(colIndex, rowKey, value)` | `store/refractionStore.ts` | `data.refraction` |

**Critical implementation rules:**

**Refraction column index mapping:**
```typescript
const col = eye === "OD" ? 0 : 1;
refractionStore.setCellValue(col, rowKey, value);
// ⚠️ setCellValue() takes numeric colIndex — passing "OD" string crashes the store
```

**Null guard for vitals:**
```typescript
for (const [field, value] of Object.entries(data.vitals)) {
  if (value != null) vitalsStore.setField(encounterId, field, value);
  // ⚠️ Skip nulls — scribe ADDS data only, never erases existing draft values
}
```

### F. EncounterStore Additions

New fields and action added to `store/encounterStore.ts`:

```typescript
// In EncounterState:
aiSummaryText?: string;
aiSummaryGeneratedAt?: string;

// New action:
setAiSummary: (id: string, text: string) => void;
```

After Accept: SOAP narrative saved to `encounterStore.setAiSummary(id, soapText)`.

Post-accept UI: AI Scribe card shows saved SOAP narrative (read-only), generation timestamp, badge indicating stores were auto-filled, "Regenerate" option.

### G. Mock Fallback (Vercel / No Backend)

Triggered automatically on first `fetch` failure.

**Behavior:**
- Detects connection failure on initial request
- Streams a realistic template-based SOAP note word-by-word
- Generates `___JSON_START___` + structured JSON using current encounter state from Zustand
- Accept auto-fill works **identically** to the real flow

**Purpose:** Enables full AI Scribe demo on Vercel without a running FastAPI backend.

### H. Existing Backend Fields (Pre-Phase 2)

These fields existed before Phase 2 and are now fully utilized:

| Location | Field | Type | Purpose |
|----------|-------|------|---------|
| `Encounter` model | `ai_summary_text` | Text | Stores SOAP narrative after generation |
| `Encounter` model | `ai_summary_generated_at` | DateTime(tz) | Timestamp of last generation |
| `entitlements.py` | `AI_SCRIBE` | Entitlement | Premium feature gate |

### I. ClinicalDiffViewer — Transparent AI Change Review

**Component:** `components/encounter/ClinicalDiffViewer.tsx`

**Purpose:** Before the doctor accepts any AI Scribe autofill, they see a field-by-field comparison of every change the scribe proposes. This is the primary trust mechanism — AI suggestions are never locked in without explicit physician review.

**Props:**
```typescript
interface ClinicalDiffViewerProps {
  diffs: Record<string, DiffEntry>;       // Field name → before/after values
  diagnoses?: DiagnosisChange[];          // Separate diagnoses diff section
  onRevert?: (fieldName: string) => void; // Per-field rollback callback
}

interface DiffEntry {
  old?: unknown;  // Previous value (undefined = field was empty)
  new?: unknown;  // Proposed value (undefined = field being cleared)
}
```

**Visual conventions:**

| State | Rendering |
|-------|-----------|
| Old value | Red text, strikethrough decoration |
| New value | Green text, bold weight |
| Field name | Monospace label above the diff pair |
| Revert button | Ghost button per field row; calls `onRevert(fieldName)` |

**Diagnoses section:** Rendered separately below the field diffs. Each proposed diagnosis is shown as an ICD-10 `<Badge>` chip with code + description. Revert removes the diagnosis from the pending accept payload.

**Integration point:** `AuditTrailSidebar` embeds `ClinicalDiffViewer` inline for any `AI_SCRIBE_AUTOFILL` audit entry, so past autofills are reviewable from the audit timeline (read-only, no revert).

---

### J. FinalizeModal — Sign & Seal Workflow

**Component:** `components/encounter/FinalizeModal.tsx`

**Endpoint:** `POST /api/encounters/{encounter_id}/finalize`

**Purpose:** Guided 5-section clinical summary review that forces the doctor to actively confirm key clinical data before signing. Prevents "click to sign" shortcuts that create audit liability.

**Modal trigger architecture:** `encounterStore.finalizeModalOpen` (boolean, not persisted to localStorage via `partialize`). Both PatientStickyHeader and EncounterBottomTabs call `setFinalizeModalOpen(true)`. The modal is rendered exactly once at the encounter page level — no dual-modal anti-pattern.

**Store reads (selectors):**
- `useEncounterStore` → `chiefComplaint`
- `useVitalsDraft(encounterId)` → IOP OD/OS, blood_pressure
- `useDiagnoses(encounterId)` → active ICD-10 codes
- `useRefractionStore` → `columns[3]?.draft` (Final Rx OD/OS)

**Section flow (in order):**

| # | Section | Source Store | Gate |
|---|---------|-------------|------|
| 1 | Chief complaint (read-only review) | `encounterStore` | No gate — informational |
| 2 | Vitals summary (IOP OD/OS, BP) | `vitalsStore` | "Not Recorded" warning badge if empty |
| 3 | Diagnoses list (ICD-10 + laterality) | `diagnosisStore` | **Hard block** — submit disabled if empty |
| 4 | Final Rx table (OD/OS: Sph/Cyl/Axis/Add) | `refractionStore` | "Not Recorded" warning if empty |
| 5 | Assessment & Plan textarea | User input | Min 10 characters required |

**Footer:**
- Attestation checkbox: "I attest that I have reviewed this encounter and the clinical data is accurate."
- "Sign & Seal Chart" button (disabled until all gates satisfied)

**Gate logic (actual implementation):**
```typescript
const canSubmit =
  attested &&
  assessmentPlan.trim().length >= 10 &&
  activeDiagnoses.length > 0 &&  // Diagnosis guardrail — cannot bill without ICD-10
  !isSubmitting;
```

**Submit flow:**
1. `POST /api/encounters/${encounterId}/finalize` via `apiFetch` with `{ assessment_and_plan }`
2. On success: `finalizeEncounter(id, response.signed_by_name, response.signed_at)` updates Zustand
3. `setFinalizeModalOpen(false)` closes modal

**Dev fallback:** When backend is unreachable in development, catches the API error and calls `finalizeEncounter()` locally — matching the mock pattern used by vitals and refraction stores.

**Post-finalization state:**
- All clinical fields become read-only (guarded by `clinicalReadOnly = isFinalized || !canEditClinical`)
- AI Scribe widget replaced with read-only saved summary (`<p>` with sans-serif prose styling, not `<pre>` monospace)
- Green confirmation banner: "Signed by [Provider Name] · [UTC timestamp]"
- Encounter status badge updates to "Finalized" with lock icon in `PatientStickyHeader`

**State reset:** All internal state (assessmentPlan, attested, errorMessage, isSubmitting) resets via `useEffect` when `open` changes to `false`.

**California compliance note:** Attestation checkbox satisfies California Civil Code § 1633.7 (electronic signatures) + B&P 3041 (provider identity linked to record). Diagnosis guardrail prevents charts without ICD-10 codes from being sealed — structurally preventing unbillable encounters.

---

### K. AuditTrailSidebar — AI Action Timeline

**Component:** `components/encounter/AuditTrailSidebar.tsx`

**Purpose:** Chronological timeline of all encounter modifications — human and AI — accessible from the encounter page without leaving the clinical workflow.

**Timeline entry anatomy:**
- Timestamp (UTC, rendered in local timezone)
- Actor: Staff name (human) or "AI Scribe" with Bot icon (AI)
- Action label (e.g., "Exam findings updated", "AI autofill applied")
- Expandable diff section for AI entries

**Visual distinction for AI actions:**
- Bot icon replaces the user avatar
- Entry uses accent color border (teal `--color-accent`) instead of neutral
- Badge: "AI Scribe" pill, amber or accent-colored

**Embedded ClinicalDiffViewer:**
For `AI_SCRIBE_AUTOFILL` entries, the sidebar embeds `<ClinicalDiffViewer>` in read-only mode (no `onRevert` — the action is already committed). This allows the doctor to review exactly what the AI changed during any past encounter session.

**New AuditAction enum values** (in `app/db/models/tenant/clinical.py`):

```python
class AuditAction(StrEnum):
    # ... existing values ...
    AI_SCRIBE_GENERATED = "ai_scribe_generated"  # Logged when SOAP stream completes
    AI_SCRIBE_AUTOFILL  = "ai_scribe_autofill"   # Logged when doctor clicks Accept
```

**`AI_SCRIBE_AUTOFILL` metadata payload** (stored in `AuditLog.metadata` JSONB):
```json
{
  "model_version": "claude-sonnet-4-6-20250514",
  "diffs": { "<field_name>": { "old": ..., "new": ... } },
  "diagnoses_added": ["H40.001 OD", "Z01.01"]
}
```

---

### L. Accept Endpoint — Persist AI Autofill

**Route:** `POST /api/encounters/{encounter_id}/ai-scribe/accept`

**Permission:** `require_permission(ClinicalAction.GENERATE_AI_SCRIBE)` → Doctor + Owner only

**Request body:**
```json
{
  "structured_data": { /* Full JSON from useAiScribe structuredData */ },
  "soap_text": "string"
}
```

**Server actions (in order):**
1. Validate encounter belongs to tenant (tenant isolation check)
2. Check `encounter.is_finalized == False` — reject 409 if already sealed
3. Apply structured data to relevant tables (vitals, exam findings, diagnoses, refraction)
4. Save SOAP narrative to `encounter.ai_summary_text` + `encounter.ai_summary_generated_at`
5. Compute diff between pre-accept and post-accept state
6. Log `AuditAction.AI_SCRIBE_AUTOFILL` via `log_action()` with full diff + model version metadata
7. Return updated encounter summary

**Idempotency:** Multiple accept calls on the same encounter append new audit log entries — they do not overwrite previous autofill records. Each accept call is a distinct, timestamped clinical event.
| `permissions.py` | `GENERATE_AI_SCRIBE` | ClinicalAction | RBAC: Doctor + Owner only |
