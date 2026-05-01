---
phase: 13-retail-inventory
plan: 06
subsystem: api
tags: [bff, nextjs, fastapi, proxy, inventory, optical-orders]

# Dependency graph
requires:
  - phase: 13-04
    provides: FastAPI inventory product CRUD + receive/adjust action routes
  - phase: 13-05
    provides: FastAPI optical-order CRUD + place/cancel/dispense action routes
provides:
  - 9 BFF passthrough routes mirroring Phase 13 backend endpoints
  - Browser reachability for /api/inventory/products/* and /api/optical-orders/*
  - Auth + token forwarding via existing proxyToFastAPI helper (no hand-rolled fetch)
affects: [13-07, 13-08, 13-09, 13-10, 13-11, 13-12, 13-13, 13-14]  # all Wave-3 frontend stores depend on these BFF paths

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise<{ paramName }> async params shape for Next.js 14 dynamic segments"
    - "Trailing slash on every upstream FastAPI URL (per .claude/rules/bff-api.md)"
    - "One proxyToFastAPI() call per handler — zero business logic in BFF"

key-files:
  created:
    - app/api/inventory/products/route.ts
    - app/api/inventory/products/[productId]/route.ts
    - app/api/inventory/products/[productId]/receive/route.ts
    - app/api/inventory/products/[productId]/adjust/route.ts
    - app/api/optical-orders/route.ts
    - app/api/optical-orders/[orderId]/route.ts
    - app/api/optical-orders/[orderId]/place/route.ts
    - app/api/optical-orders/[orderId]/cancel/route.ts
    - app/api/optical-orders/[orderId]/dispense/route.ts
  modified: []

key-decisions:
  - "Adopted Promise<{ ... }> async params shape across all 9 routes — matches dominant Next.js 14 convention (46 of 54 existing dynamic-segment BFF routes use it; donor app/api/appointments/[appointmentId]/check-in/route.ts confirms)"
  - "Applied trailing slash on every upstream URL including action endpoints (place/cancel/dispense/receive/adjust) per plan must_haves and .claude/rules/bff-api.md — supersedes the no-slash style seen in some legacy action routes (e.g., appointments/cancel)"
  - "Followed donor pattern verbatim — handlers are 1-line proxy delegations; auth, body forwarding, query forwarding, timeout, status codes all owned by proxyToFastAPI"

patterns-established:
  - "BFF wave for new backend endpoints lands as a single thin plan in the same phase (Wave 2 after backend Wave 1)"
  - "Trailing slash on FastAPI upstreams is non-negotiable — without it, FastAPI returns 307 redirect that drops auth headers"

requirements-completed: [INV-01, INV-02, INV-08, INV-10]

# Metrics
duration: 2min
completed: 2026-05-01
---

# Phase 13 Plan 06: BFF Passthrough Routes — Inventory + Optical-Orders Summary

**9 thin BFF route files (≤10 LOC each) wiring browser → FastAPI for inventory product CRUD + receive/adjust and optical-order CRUD + place/cancel/dispense, every upstream URL trailing-slashed and every handler a single `proxyToFastAPI()` call.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-01T19:35:38Z
- **Completed:** 2026-05-01T19:37:13Z
- **Tasks:** 2 (auto)
- **Files created:** 9

## Accomplishments

- 4 inventory BFF routes: list+create, detail+patch+delete, receive (POST), adjust (POST)
- 5 optical-order BFF routes: list+create, detail (GET), place (POST), cancel (POST), dispense (POST)
- Total 13 `proxyToFastAPI()` call sites — exactly matches plan acceptance criteria (4-task: 7; 5-task: 6)
- Zero raw `fetch(` in either subtree (verified via grep)
- `npx tsc --noEmit` clean for both new subtrees

## Task Commits

Each task was committed atomically:

1. **Task 1: Inventory BFF routes (4 files)** — `3d17d18` (feat)
2. **Task 2: Optical-order BFF routes (5 files)** — `e34c673` (feat)

**Plan metadata commit:** (this commit) docs(13-06): complete BFF passthrough routes plan

## Files Created/Modified

### Created (9 files, all new)

**Inventory (4):**
- `app/api/inventory/products/route.ts` — GET list + POST create → `/api/inventory/products/`
- `app/api/inventory/products/[productId]/route.ts` — GET, PATCH, DELETE → `/api/inventory/products/{id}/`
- `app/api/inventory/products/[productId]/receive/route.ts` — POST → `/api/inventory/products/{id}/receive/`
- `app/api/inventory/products/[productId]/adjust/route.ts` — POST → `/api/inventory/products/{id}/adjust/`

**Optical-orders (5):**
- `app/api/optical-orders/route.ts` — GET list + POST create → `/api/optical-orders/`
- `app/api/optical-orders/[orderId]/route.ts` — GET → `/api/optical-orders/{id}/`
- `app/api/optical-orders/[orderId]/place/route.ts` — POST → `/api/optical-orders/{id}/place/`
- `app/api/optical-orders/[orderId]/cancel/route.ts` — POST → `/api/optical-orders/{id}/cancel/`
- `app/api/optical-orders/[orderId]/dispense/route.ts` — POST → `/api/optical-orders/{id}/dispense/`

### Modified

None.

## Decisions Made

- **Async params shape (Promise<{ ... }>):** Greppped existing BFF routes — 46 use Promise shape, 8 use sync. Donor `app/api/appointments/[appointmentId]/check-in/route.ts` (closest analog: action endpoint with single dynamic segment) uses Promise. Adopted Promise shape across all 9 files for consistency with the dominant convention. Plan explicitly delegated this choice to "whichever shape the existing routes use".
- **Trailing slash on action endpoints:** Plan must_haves mandate `/place/`, `/cancel/`, `/dispense/`, `/receive/`, `/adjust/` all end with `/` — applied as written. This differs from some legacy action endpoints in the codebase (e.g., `appointments/.../cancel` has no trailing slash) but matches the backend route definitions landed in 13-04/13-05 and the .claude/rules/bff-api.md project rule.

## Deviations from Plan

None — plan executed exactly as written. The only judgment call (sync vs Promise params shape) was explicitly delegated to the executor by the plan, and was resolved by reading existing routes per the plan's read_first list.

## Issues Encountered

- One transient `git index.lock` collision on Task 2 commit (resolved by removing stale lock and retrying — likely background editor scan). No code impact.

## User Setup Required

None — pure passthrough routes; no env vars, no migrations, no third-party config.

## Next Phase Readiness

- **Wave 3 frontend (plans 13-07 through 13-14)** can now hit `/api/inventory/products/*` and `/api/optical-orders/*` from the browser. Middleware allowlist permits only `/api/public/` and `/api/address/` as auth-free; everything else requires the BFF passthrough that this plan delivers.
- **Manual smoke test (deferred to Wave 3):** A Wave-3 plan should hit one inventory list endpoint and one optical-order action endpoint from the browser to confirm the passthrough lands an authenticated request at FastAPI.
- **No blockers.**

## Self-Check: PASSED

Verified all 9 created files exist on disk:
- app/api/inventory/products/route.ts — FOUND
- app/api/inventory/products/[productId]/route.ts — FOUND
- app/api/inventory/products/[productId]/receive/route.ts — FOUND
- app/api/inventory/products/[productId]/adjust/route.ts — FOUND
- app/api/optical-orders/route.ts — FOUND
- app/api/optical-orders/[orderId]/route.ts — FOUND
- app/api/optical-orders/[orderId]/place/route.ts — FOUND
- app/api/optical-orders/[orderId]/cancel/route.ts — FOUND
- app/api/optical-orders/[orderId]/dispense/route.ts — FOUND

Verified both task commits exist in git history:
- 3d17d18 — FOUND
- e34c673 — FOUND

Verified counts:
- 13 `return proxyToFastAPI` call sites across the 9 files (expected 13)
- 0 raw `fetch(` outside proxyToFastAPI in either subtree (expected 0)
- `npx tsc --noEmit` clean for app/api/inventory/** and app/api/optical-orders/**

---
*Phase: 13-retail-inventory*
*Completed: 2026-05-01*
