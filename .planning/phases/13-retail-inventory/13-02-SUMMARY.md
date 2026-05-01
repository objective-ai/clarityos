---
phase: 13-retail-inventory
plan: 02
subsystem: auth
tags: [rbac, entitlements, permissions, fastapi, typescript, add-on]

# Dependency graph
requires:
  - phase: 13-retail-inventory
    provides: "13-00 Wave 0 stub tests for inventory permissions + retail_pos add-on enforcement"
provides:
  - "5 new ClinicalAction enum values + PERMISSION_MATRIX rows (VIEW_INVENTORY, MANAGE_INVENTORY, CREATE_OPTICAL_ORDER, VIEW_OPTICAL_ORDER, CANCEL_OPTICAL_ORDER)"
  - "Entitlement.RETAIL_POS key on backend (Python StrEnum) and frontend (TS const + EntitlementKey union + ENTITLEMENT_META)"
  - "Verifiable invariant: RETAIL_POS is NOT in PLAN_FEATURES Core/Plus/Premium on either side (purchased separately)"
affects: [13-retail-inventory Wave 2 routes, 13-retail-inventory Wave 3 sidebar/UI, phase 14-optical-orders, phase 15-pos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Add-on entitlement: enum value lives on both sides BUT NOT in any PLAN_FEATURES tier (mirrors no precedent — Phase 12 MESSAGING was Plus+Premium-bundled)"
    - "ENTITLEMENT_META plan: 'Add-on' marker for upsell modal copy"

key-files:
  created: []
  modified:
    - "backend/core/permissions.py - 5 new ClinicalAction values + matrix rows"
    - "backend/core/entitlements.py - RETAIL_POS enum value, PLAN_FEATURES untouched"
    - "lib/entitlements.ts - RETAIL_POS const + ENTITLEMENT_META retail_pos entry, PLAN_FEATURES untouched"
    - "types/session.ts - 'retail_pos' added to EntitlementKey union"

key-decisions:
  - "MANAGE_INVENTORY and CANCEL_OPTICAL_ORDER restricted to OWNER/ADMIN only (no doctor/tech/recep)"
  - "CREATE_OPTICAL_ORDER excludes DOCTOR (per CONTEXT §F — doctors don't write orders)"
  - "VIEW_INVENTORY and VIEW_OPTICAL_ORDER granted to all 5 roles (clinical visibility)"
  - "RETAIL_POS is the first true add-on entitlement: present on both sides BUT absent from every PLAN_FEATURES tier"
  - "Updated EntitlementKey union in types/session.ts to include 'retail_pos' (string-literal union, not derived) — required for satisfies clause to compile"

patterns-established:
  - "Add-on entitlement pattern: Entitlement.X exists in BE+FE, EntitlementKey union includes lowercase wire key, ENTITLEMENT_META uses plan: 'Add-on', PLAN_FEATURES dict/const remains untouched"

requirements-completed: [INV-14, INV-19]

# Metrics
duration: ~2min
completed: 2026-05-01
---

# Phase 13 Plan 02: Permissions & Entitlements Wiring Summary

**Five new ClinicalAction permission values + PERMISSION_MATRIX rows landed alongside the retail_pos add-on entitlement on BOTH Python and TypeScript sides — verifiably absent from every PLAN_FEATURES plan tier (purchased separately).**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-01T19:25:25Z
- **Completed:** 2026-05-01T19:27:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 5 new ClinicalAction enum values + matrix rows (with role assignments verified per CONTEXT §F)
- retail_pos entitlement key on Python (`backend/core/entitlements.py`) and TypeScript (`lib/entitlements.ts`)
- ENTITLEMENT_META entry with `label: "Retail & POS"` and `plan: "Add-on"` for upsell modal
- EntitlementKey union extended to accept `"retail_pos"` (required for `satisfies` clause)
- Critical invariant verified: RETAIL_POS NOT added to PLAN_FEATURES Core/Plus/Premium on either side

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ClinicalAction enum + PERMISSION_MATRIX** - `5d66188` (feat)
2. **Task 2: Wire retail_pos entitlement (Python + TypeScript)** - `f9f4dfc` (feat)

## Files Created/Modified
- `backend/core/permissions.py` - Appended 5 new ClinicalAction enum values and 5 corresponding PERMISSION_MATRIX rows; preserved existing role aliases `_D _T _R _A _O`
- `backend/core/entitlements.py` - Added `RETAIL_POS = "retail_pos"` to Entitlement StrEnum with explanatory comment; PLAN_FEATURES dict deliberately untouched
- `lib/entitlements.ts` - Added `RETAIL_POS: "retail_pos" as const` to Entitlement object and new `retail_pos` entry in ENTITLEMENT_META with `plan: "Add-on"`; PLAN_FEATURES const deliberately untouched
- `types/session.ts` - Appended `| "retail_pos"` to EntitlementKey union (required for the `satisfies` clause on the Entitlement const to compile)

## Decisions Made
- Followed plan's role-assignment matrix exactly (CONTEXT §F): MANAGE_INVENTORY and CANCEL_OPTICAL_ORDER are owner/admin-only; CREATE_OPTICAL_ORDER excludes doctor; VIEW_* actions granted to all five roles
- Updated `types/session.ts` EntitlementKey union (the plan flagged this as a possibility to verify — the type is a string-literal union, not derived from `keyof typeof Entitlement`, so the union edit was required)
- Used `_D _T _R _A _O` shorthands consistent with rest of PERMISSION_MATRIX (these are aliases for `StaffRole.*`, not `Role.*` — adapted the verify command accordingly)

## Deviations from Plan

None of substance — the plan's verify command referenced `Role` but the file imports `StaffRole`; ran the equivalent assertion using the actual symbol. No code change required, just adjusted the verification command.

**Total deviations:** 0 auto-fixed
**Impact on plan:** None — plan executed exactly as written.

## Issues Encountered
- Pre-existing TS errors in `tests/e2e/smoke-*.spec.ts` (unused vars, possibly-null) surfaced when running `npx tsc --noEmit`. These are out of scope (per scope-boundary rule) — not caused by this plan's changes. Logged here for awareness; not deferred to a tracker since they predate Phase 13.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Wave 2 routes (`13-04` onwards) can now call `require_permission(ClinicalAction.MANAGE_INVENTORY)` and `require_entitlement("retail_pos")`
- Wave 3 sidebar/UI can call `has(Entitlement.RETAIL_POS)` against the typed const
- Wave 0 stub test `backend/tests/test_inventory_permissions.py` should now resolve `backend.core.permissions` symbols without `importorskip` skipping
- Billing-layer wiring (subscription_plans add-on purchase flow) remains out of scope for Phase 13 per CONTEXT §H

## Self-Check: PASSED

Verified all claims:
- backend/core/permissions.py contains all 5 new ClinicalAction values + matrix rows (Python assertion exited 0)
- backend/core/entitlements.py contains `RETAIL_POS = "retail_pos"` and PLAN_FEATURES Core/Plus/Premium do NOT contain Entitlement.RETAIL_POS (Python assertion exited 0)
- lib/entitlements.ts contains `RETAIL_POS: "retail_pos"` (line 52) and `retail_pos:` ENTITLEMENT_META entry (line 159); regex check on PLAN_FEATURES block confirms RETAIL_POS/retail_pos absent inside it
- types/session.ts includes `"retail_pos"` in EntitlementKey union
- Commit 5d66188 found in git log (Task 1)
- Commit f9f4dfc found in git log (Task 2)

---
*Phase: 13-retail-inventory*
*Completed: 2026-05-01*
