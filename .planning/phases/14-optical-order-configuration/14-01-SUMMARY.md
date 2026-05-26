---
phase: 14-optical-order-configuration
plan: 01
subsystem: database
tags: [alembic, sqlalchemy, orm, jsonb, permissions, audit, lens-catalog, schema-foundation]

# Dependency graph
requires:
  - phase: 14-optical-order-configuration
    provides: 14-00 test scaffolding (skip-stubs unblock downstream verify commands)
  - phase: 13-retail-inventory
    provides: optical_orders + optical_order_line_items tables (Phase 14 ADD COLUMN target); 0017 partial-unique-index donor pattern; Product / ClinicalAction / AuditAction precedents
provides:
  - "Alembic migration 0019_optical_order_configuration with 3 new tables (lens_types, lens_materials, lens_coatings) + 6 ADD COLUMN on optical_orders + 1 ADD COLUMN on optical_order_line_items"
  - "LensType, LensMaterial, LensCoating ORM classes inheriting TimestampMixin + SoftDeleteMixin + TenantBase"
  - "OpticalOrder Phase 14 column extensions: vision_plan_jsonb, fitting_jsonb, suggestion_resolutions_jsonb (all JSONB, server_default \"'{}'::jsonb\"), final_refraction_id + habitual_refraction_id (FK to refractions ondelete SET NULL), job_ticket_generated_at"
  - "OpticalOrderLineItem.lens_config_jsonb (nullable; null = frame-only or contact-lens line)"
  - "5 new AuditAction VARCHAR values (OPTICAL_ORDER_CONFIGURE_UPDATE, JOB_TICKET_GENERATE, LENS_TYPE_CREATE, LENS_MATERIAL_CREATE, LENS_COATING_CREATE)"
  - "2 new ClinicalAction values + matching PERMISSION_MATRIX rows (GENERATE_JOB_TICKET {T,R,A,O}, MANAGE_LENS_CATALOG {A,O})"
affects: [14-02, 14-03, 14-04, 14-05, 14-06, 14-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partial unique index via raw op.execute SQL (mirrors 0017): `CREATE UNIQUE INDEX … ON … (tenant_id, name) WHERE is_active = true`"
    - "JSONB server_default uses string literal `\"'{}'::jsonb\"` (matches existing Patient.medical_history_jsonb pattern at clinical.py:316), NOT `sa.text(...)` — output is identical, avoids adding a new sa import"
    - "Explicit `foreign_keys=[...]` on each refraction relationship — Pitfall 6 prevention (two FKs to the same target table would otherwise raise AmbiguousForeignKeysError)"
    - "Reference table baseline factored into `_baseline_columns()` helper to keep the 3 CREATE TABLE statements lean"

key-files:
  created:
    - backend/alembic/versions/0019_optical_order_configuration.py
    - .planning/phases/14-optical-order-configuration/14-01-SUMMARY.md
  modified:
    - backend/db/models/tenant/clinical.py
    - backend/core/permissions.py

key-decisions:
  - "Used `server_default=\"'{}'::jsonb\"` (string form) in clinical.py rather than `sa.text(\"'{}'::jsonb\")` because the existing Patient model (line 316) uses the same string form and works correctly. The plan's <action> showed `sa.text(...)` but didn't import sa. SQLAlchemy parses both as identical SQL output — the string form requires zero new imports."
  - "Factored a `_baseline_columns()` helper inside the migration so the 3 lens reference tables stay DRY (id, tenant_id, name, display_order, is_active, is_deleted, deleted_at, created_at, updated_at). Each table only declares its specific extra columns (requires_seg_height/vertex for LensType; refractive_index/abbe_value for LensMaterial; category + check constraint for LensCoating)."
  - "Did NOT add `relationship('OpticalOrder', back_populates='final_refraction')` on the Refraction class. The existing Refraction model has no Phase 14 awareness and the configurator only needs to navigate from OpticalOrder → Refraction (one direction). A back_populates would force editing Refraction, expanding scope. Plan 14-03 (configurator PATCH) consumes the one-directional relationship cleanly."

patterns-established:
  - "Phase 14 ADD COLUMN safely backfills existing rows: JSONB columns get '{}' via server_default; FK columns get NULL; timestamp column nullable. No data loss, no manual migration required."
  - "Tenant-scoped admin reference table pattern: TimestampMixin + SoftDeleteMixin + TenantBase + Index(tenant_id) + partial unique on (tenant_id, name) WHERE is_active=true. Reusable for any future admin-managed dropdown source (treatment types, allergy categories, etc)."

requirements-completed: [OPT14-08, OPT14-09, OPT14-10]

# Metrics
duration: ~30min
completed: 2026-05-26
---

# Phase 14 Plan 01: Backend Schema Foundation Summary

**Migration 0019 + 3 new ORM classes + 7 new ORM columns + 7 new audit/permission values land the entire backend schema for Phase 14 in a single forward step. Downstream plans 14-02..14-06 have every column / class / enum value they need.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-26T12:40Z
- **Completed:** 2026-05-26T13:10Z
- **Tasks:** 3
- **Files created:** 1
- **Files modified:** 2

## Accomplishments
- Alembic 0019 generates valid Postgres DDL for 3 CREATE TABLE + 3 CREATE INDEX + 3 partial unique CREATE UNIQUE INDEX + 7 ALTER TABLE ADD COLUMN (verified via `alembic upgrade head --sql` offline)
- All 3 new ORM classes import cleanly; `configure_mappers()` succeeds when intake submodule is pre-loaded (pre-existing IntakeToken issue unrelated to Phase 14)
- 5 new AuditAction VARCHAR values + 2 new ClinicalAction values + 2 PERMISSION_MATRIX rows — all enforce via the `require_permission()` factory at route bind time
- Phase 14 Pitfall 5 (asyncpg JSONB) and Pitfall 6 (explicit foreign_keys) both addressed
- Zero impact on existing data: JSONB columns backfill with '{}'; refraction FK columns nullable so existing rows get NULL; timestamp column nullable

## Task Commits

Each task was committed atomically:

1. **Task 1: Alembic 0019 migration** — `3e3de6d` (feat)
2. **Task 2: ORM — LensType/Material/Coating + extensions** — `bb6e3fc` (feat)
3. **Task 3: ClinicalAction + PERMISSION_MATRIX** — `b192326` (feat)

**Plan metadata:** _committed alongside this SUMMARY_

## Files Created
- `backend/alembic/versions/0019_optical_order_configuration.py` — 255 lines, 3 CREATE TABLE + 6 ALTER TABLE on optical_orders + 1 ALTER TABLE on optical_order_line_items + matching downgrade()

## Files Modified
- `backend/db/models/tenant/clinical.py` — added 3 lens reference classes, 6 new OpticalOrder columns + 2 relationships, 1 new OpticalOrderLineItem column, 5 new AuditAction values
- `backend/core/permissions.py` — added 2 ClinicalAction values + 2 PERMISSION_MATRIX rows

## Decisions Made

1. **Used `server_default=\"'{}'::jsonb\"` string form** in clinical.py instead of `sa.text(\"'{}'::jsonb\")`. The plan's `<action>` showed `sa.text(...)`, but `sa` is not imported in clinical.py — only specific symbols (`Boolean`, `CheckConstraint`, etc.). The existing Patient model uses the string form at line 316. SQLAlchemy parses both identically. Avoiding the new import keeps the diff smaller and matches established convention.
2. **Did NOT add `back_populates='final_refraction'` on the Refraction class.** The configurator only navigates one direction (OpticalOrder → Refraction). Adding back_populates would require editing Refraction (out of scope for this plan) and the Refraction module isn't loaded by any Phase 14 query path yet. Plan 14-03 can elevate to bidirectional if needed.
3. **Factored `_baseline_columns()` helper inside the migration.** Three nearly-identical CREATE TABLE statements would have triplicated the 9 baseline columns (id, tenant_id, name, display_order, is_active, is_deleted, deleted_at, created_at, updated_at). The helper keeps each `op.create_table(...)` block to 4-5 lines, making the diff easier to read.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Cannot Verify] Alembic live DB round-trip skipped — Supabase pooler unreachable**
- **Found during:** Task 1 verification (`alembic upgrade head`)
- **Issue:** The `DATABASE_URL` in `.env` points at Supabase pooler. Connection fails with `asyncpg.exceptions.InternalServerError: (ENOTFOUND) tenant/user postgres.iedzzcokfwnbyfyevjoz not found`. This is a Supabase-side environment / DNS issue, not a migration issue.
- **Fix:** Used `alembic upgrade head --sql` (offline mode — generates DDL without connecting) to verify the migration generates valid Postgres SQL. All 3 CREATE TABLE + 3 CREATE INDEX + 3 partial unique CREATE UNIQUE INDEX + 7 ALTER TABLE statements rendered correctly with JSONB cast `DEFAULT '{}'::jsonb`, FK declarations to `refractions(id) ON DELETE SET NULL`, and CHECK constraint on lens_coatings.category.
- **Recommendation:** Run `alembic upgrade head` against the local dev DB (or restore Supabase access) before Plan 14-02 starts. Then run `/reseed` to repopulate.
- **Committed in:** `3e3de6d` (Task 1 commit), with explanation in the commit body.

**2. [Rule 1 — Pre-existing] Pre-existing IntakeToken mapper config issue surfaces during ORM smoke test**
- **Found during:** Task 2 verification
- **Issue:** `python -c "from backend.db.models.tenant.clinical import OpticalOrder; print(OpticalOrder.final_refraction.property.local_columns)"` triggers full `configure_mappers()` which fails with `InvalidRequestError: When initializing mapper Mapper[Appointment(appointments)], expression 'IntakeToken' failed to locate a name`. The IntakeToken class lives in a sibling module (`backend.db.models.tenant.intake`) and isn't pre-loaded by importing clinical alone.
- **Fix:** Verified the issue is pre-existing by importing the intake submodule first — `from backend.db.models.tenant import clinical, messaging, intake; orm.configure_mappers()` succeeds. The Phase 14 lens classes import cleanly at table level; relationship configuration works correctly once intake is loaded. This is a pre-existing project ergonomic, not a Phase 14 regression.
- **Recommendation:** A future infra plan could add `from backend.db.models.tenant import intake` to a central tenant `__init__.py` so any clinical import auto-loads intake. Out of scope here.
- **Committed in:** `bb6e3fc` (Task 2 commit), with explanation in the commit body.

---

**Total deviations:** 2 auto-fixed (1 environment, 1 pre-existing)
**Impact on plan:** Task 1 cannot be 100% verified against a live DB until Supabase connectivity is restored. Task 2 surfaced a pre-existing project issue but Phase 14 code itself is correct. No scope creep — only migration / ORM / permissions edits touched.

## Issues Encountered
- See deviations above. No Phase 14 implementation issues.

## User Setup Required
Before Plan 14-02 begins:
1. Restore Supabase connectivity (or switch to local dev DB) so `alembic upgrade head` actually applies 0019
2. Run `/reseed` skill to repopulate the dev DB (Phase 14-02 lens-catalog routes need the new tables to exist)

## Self-Check: PASSED (with environment caveat on DB round-trip)

- Files: all 3 modified/created files exist on disk with expected counts
- Commits: `3e3de6d`, `bb6e3fc`, `b192326` all exist in `git log`
- Verify commands:
  - `alembic upgrade head --sql` → generates valid Postgres DDL for migration 0019
  - `python -c "from backend.db.models.tenant.clinical import LensType, LensMaterial, LensCoating, OpticalOrder, OpticalOrderLineItem, AuditAction; print(AuditAction.JOB_TICKET_GENERATE.value)"` → prints `job_ticket_generate`
  - `python -c "... orm.configure_mappers() ..."` with intake submodule pre-imported → succeeds; both refraction relationships expose `local_columns = ['final_refraction_id'] / ['habitual_refraction_id']`
  - Permission assertion → `permissions OK` printed
  - Grep counts: 3 lens classes, 5 new AuditActions, 8 new OpticalOrder cols, 1 each foreign_keys=[final/habitual_refraction_id], 1 lens_config_jsonb, 2 ClinicalAction enum lines, 1 each PERMISSION_MATRIX row — all match plan acceptance criteria

## Next Phase Readiness
- **14-02** (lens catalog routes + tests) can target the LensType/LensMaterial/LensCoating ORM classes directly. The conftest fixtures will resolve their imports cleanly once 14-02 lands the Pydantic schemas and FastAPI routes.
- **14-03** (configurator PATCH + extended place handler) has all 6 new OpticalOrder columns to read/write plus the explicit refraction relationships for prefill.
- **14-04** (AI suggestion extractor) uses `suggestion_resolutions_jsonb` to persist accept/dismiss state.
- **14-05** (job ticket PDF) uses `job_ticket_generated_at` for status-gate + audit row.
- **14-06** (queue rollup + lens seed) writes into all 3 lens reference tables via `_seed_lens_reference()`.

---
*Phase: 14-optical-order-configuration*
*Completed: 2026-05-26*
