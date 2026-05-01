---
phase: 13-retail-inventory
plan: 08
subsystem: database
tags: [seed, inventory, products, frames, contacts, sqlalchemy, idempotent]

# Dependency graph
requires:
  - phase: 13-retail-inventory
    provides: "Product ORM + migration 0017 partial unique index on (tenant_id, sku) WHERE is_active=true (Plan 13-01)"
provides:
  - "_seed_retail_inventory(session) sync function in backend/seed_db.py"
  - "10 frame Products + 5 contact-lens Products seeded onto TENANT_ID b0000000-0000-0000-0000-000000000001"
  - "Idempotent seed pattern guarded on (tenant_id, sku, is_active=true) — re-runs add zero rows"
  - "Wired into seed_tenant_schema orchestrator after _seed_insurance_payers, before _seed_patient_insurance"
affects: [13-04 Wave 2 inventory tests, 13-09 retail UI dev-mode browsing, 13-13 optical queue, 13-14 E2E specs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent seed: pre-check via session.execute(select(Model).where(...)).first() before session.add()"
    - "Decimal(str(price_float)) avoids float precision drift on currency values"
    - "snake_case JSONB attribute keys (preserved end-to-end per feedback_camelizekeys_nested.md)"

key-files:
  created: []
  modified:
    - "backend/seed_db.py — added _seed_retail_inventory + Product import + orchestrator wire-in (3 edits, 108 insertions)"

key-decisions:
  - "Reorder thresholds: 3 for frames, 5 for contacts — contacts move faster, need earlier reorder warning"
  - "Disney kids frame uses material='other' (not 'plastic') to keep canonical taxonomy tight (only acetate/metal/titanium/other per CONTEXT §A)"
  - "_seed_retail_inventory placed AFTER _seed_insurance_payers, BEFORE _seed_patient_insurance — independent of patient/insurance data, no cross-dependencies"
  - "Local `from sqlalchemy import select as _select` inside function (mirrors _seed_patient_insurance and _seed_insurance_payers pattern) rather than module-level import"
  - "Both no-op (already-seeded) AND new-rows paths logged: ok() on additions, warn() on full skip — matches _seed_insurance_payers UX"

patterns-established:
  - "Phase 13 seed pattern: idempotent SKU-guarded inserts (tenant_id + sku + is_active=true) — reusable for any future Product variants"
  - "FRAMES/CONTACTS authored as list[tuple] with inline comment header documenting tuple positions — readable + diff-friendly"

requirements-completed: [INV-17]

# Metrics
duration: 2min
completed: 2026-05-01
---

# Phase 13 Plan 08: Seed Retail Inventory Summary

**Idempotent seed of 10 frames + 5 contact-lens Products on the dev tenant, wired into seed_tenant_schema, guarded by partial-unique-index-matching SKU+is_active check.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-01T19:35:52Z
- **Completed:** 2026-05-01T19:38:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `_seed_retail_inventory(session)` function added to `backend/seed_db.py` — 10 frames (Ray-Ban, Oakley, Warby Parker, Persol, Lindberg, Mikli, Disney) + 5 contacts (Acuvue, Bausch+Lomb, CooperVision, Air Optix)
- Wired into `seed_tenant_schema` orchestrator alongside `_seed_insurance_payers` — `python backend/seed_db.py` now produces a complete Phase 13 dataset
- Idempotency guard matches migration 0017's partial unique index `(tenant_id, sku) WHERE is_active=true` — re-running the seed is safe (zero new rows)
- Snake_case JSONB attributes preserved (eye_size, bridge_size, base_curve, box_size, etc.) per Pitfall 1 from 13-RESEARCH.md

## Task Commits

Each task was committed atomically:

1. **Task 1: Add _seed_retail_inventory function + wire into orchestrator** — `9fd9415` (feat)

## Files Created/Modified

- `backend/seed_db.py` — Added `Product` to ORM imports (line ~104), added `_seed_retail_inventory(session)` (~108 lines) after `_seed_insurance_payers`, wired call into `seed_tenant_schema` between `_seed_insurance_payers` and `_seed_patient_insurance`

## Decisions Made

See frontmatter `key-decisions`. All decisions follow existing seed conventions in `seed_db.py` (donor: `_seed_insurance_payers`).

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria satisfied on first pass:

- Function `_seed_retail_inventory(session: Session) -> None:` present
- 10 `FR-` SKUs and 5 `CL-` SKUs in respective lists
- `Product.is_active.is_(True)` idempotency guard present in BOTH frame and contact loops
- All 8 frame snake_case attribute keys present (`brand`, `model`, `color`, `eye_size`, `bridge_size`, `temple_size`, `gender`, `material`)
- All 6 contact snake_case attribute keys present (`brand`, `modality`, `base_curve`, `diameter`, `power`, `box_size`)
- Orchestrator call `_seed_retail_inventory(session)` placed after `_seed_insurance_payers(session)` in `seed_tenant_schema`
- `python -c "from backend.seed_db import _seed_retail_inventory; print('importable')"` exits 0
- `pytest tests/test_seed_inventory.py --collect-only` collects 1 test cleanly

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **13-04 (Wave 2 inventory tests):** Ready — Wave 0 stub `tests/test_seed_inventory.py` can now be replaced with a real assertion that runs `_seed_retail_inventory` and checks `len(active products) == 15`
- **13-09 (Retail UI):** Ready — dev-mode browsing has 15 deterministic products to render against
- **13-13 (Optical queue) and 13-14 (E2E specs):** Ready — Playwright specs no longer need to bootstrap inventory via API

**Manual smoke (out-of-scope for this plan, deferred to next manual seed run):**
- `cd backend && python seed_db.py` — first run prints `✓ Retail inventory: 10 new frames, 5 new contacts (10 frames + 5 contacts total).`
- Re-run prints `⚠ Retail inventory already seeded — skipping (10 frames + 5 contacts already present).`

## Self-Check: PASSED

- Found: `c:/Users/duytr/Projects/clarityos/backend/seed_db.py` (modified, contains `def _seed_retail_inventory` and orchestrator call site)
- Found: commit `9fd9415` (`git log --oneline | grep 9fd9415`)
- Found: `c:/Users/duytr/Projects/clarityos/.planning/phases/13-retail-inventory/13-08-SUMMARY.md` (this file)

---
*Phase: 13-retail-inventory*
*Completed: 2026-05-01*
