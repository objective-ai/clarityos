---
phase: 14-optical-order-configuration
plan: 06
subsystem: api
tags: [optical-queue, seed-data, draft-indicator, lens-catalog]
requires:
  - phase: 14-optical-order-configuration
    provides: 14-01 LensType/Material/Coating ORM; 14-02 lens-catalog routes (consume seed rows)
provides:
  - "OpticalQueueItem.draft_order_count field (default 0) + rollup logic in get_optical_queue"
  - "_seed_lens_reference() seeds 4 lens types + 6 materials + 7 coatings idempotently; wired into seed_tenant_schema"
  - "Archived todo 2026-05-08-optical-queue-draft-order-indicator.md → .planning/todos/done/ with resolution note"
affects: [14-08, 14-10]
tech-stack:
  added: []
  patterns:
    - "Idempotent seed pre-check pattern: `select(M.id).where(tenant_id, name, is_active=true)` returns None → insert; else skip"
    - "Read-side draft rollup: count from already-eager-loaded enc.optical_orders, no N+1, no DB column mutation (Pitfall 4 preserved)"
key-files:
  created:
    - .planning/phases/14-optical-order-configuration/14-06-SUMMARY.md
  modified:
    - backend/schemas/optical.py
    - backend/api/routes/optical.py
    - backend/seed_db.py
    - .planning/todos/done/2026-05-08-optical-queue-draft-order-indicator.md (moved from pending)
requirements-completed: [OPT14-11, OPT14-14]
duration: ~15min
completed: 2026-05-26
---

# Phase 14 Plan 06: Queue Rollup + Lens Seed Summary

**OpticalQueueItem now ships draft_order_count + dev DB now has 4+6+7 lens reference rows. Phase 14 FE plans (14-09 / 14-10) can read from real seed data.**

## Performance
- **Duration:** ~15 min
- **Tasks:** 3 (schema + rollup, seed function, todo archive)

## Accomplishments
- OpticalQueueItem.draft_order_count field added; populated from `sum(1 for o in enc.optical_orders if o.status == 'draft')` in get_optical_queue
- `_seed_lens_reference()` seeds canonical reference catalog (Single Vision / Bifocal / Progressive / Reading + 6 materials + 7 coatings) with idempotency
- Live DB row counts verified: `SELECT COUNT(*) WHERE is_active=true` → lens_types=4, lens_materials=6, lens_coatings=7
- Phase 13 INV-16 status semantics preserved — drafts neither promote nor suppress queue card status (only `placed` / `dispensed` change rollup); the new `draft_order_count` is a *secondary* indicator on top of `status`
- Pitfall 4 preserved — `Encounter.optical_status` column never mutated; rollup remains pure read-side

## Task Commit
1. **Plan 14-06 (all tasks)** — `fb864a1` (feat)

## Files Modified
- `backend/schemas/optical.py` — +1 field on OpticalQueueItem
- `backend/api/routes/optical.py` — draft_count computation + pass to OpticalQueueItem constructor
- `backend/seed_db.py` — +120-line _seed_lens_reference() function + orchestrator wire-in
- `.planning/todos/done/2026-05-08-optical-queue-draft-order-indicator.md` (moved + resolution note)

## Decisions
1. **OpticalQueueItem inherits AppBaseModel (snake_case wire), not CamelCaseModel.** The new field will serialize as `draft_order_count` on the wire — matching the existing optical queue payload convention. Plan 14-10 frontend pill consumer will access `draftOrderCount` after `camelizeKeys` runs in `apiFetch`. (The plan text suggested CamelCaseModel auto-serializing as `draftOrderCount`; in practice the existing schema has stayed on AppBaseModel since Phase 6, so I followed established convention rather than migrate the whole module.)
2. **Plain `mv` not `git mv` for the todo archive.** The pending todo file was untracked (visible in initial `git status` as `??`); regular mv + commit captures it as a new file in the done folder. No history loss since there was no committed prior state.
3. **Added display_order to seeded LensMaterials and LensCoatings.** The plan's seed examples omitted display_order on materials and coatings; ORM has the column on all 3 reference tables, so explicit ordering ensures stable FE rendering (otherwise iteration order would depend on insertion timing).

## Deviations
None substantive. The plan's wire-format claim about CamelCaseModel was inaccurate (schema is AppBaseModel) — documented under Decisions #1.

## Self-Check: PASSED
- `python -c "from backend.schemas.optical import OpticalQueueItem; assert 'draft_order_count' in OpticalQueueItem.model_fields"` → exits 0
- `python -c "import ast; ... assert '_seed_lens_reference' in fn_names"` → exits 0
- Live DB query → 4 lens types + 6 materials + 7 coatings active
- Re-running seed: zero new rows added; "Lens catalog already seeded — skipping" log emits
- `git log` shows `fb864a1` includes 4 files changed including the archived todo

## Next Phase Readiness
- **14-08** (FE stores) `lensCatalogStore` reads the now-populated `/api/lens-catalog/types/`, `/materials/`, `/coatings/` endpoints
- **14-09** (configurator UX) frame picker + lens type/material/coating dropdowns render with real seed data
- **14-10** (entry points) OpticalQueueCard.tsx renders the "Draft pending" pill when `queueItem.draftOrderCount > 0`

---
*Phase: 14-optical-order-configuration*
*Completed: 2026-05-26*
