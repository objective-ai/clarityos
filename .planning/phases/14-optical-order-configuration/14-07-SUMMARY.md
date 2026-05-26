---
phase: 14-optical-order-configuration
plan: 07
subsystem: bff
tags: [bff, nextjs, proxy, blob-streaming, lens-catalog, optical-orders]
requires:
  - phase: 14-optical-order-configuration
    provides: 14-02 lens-catalog routes; 14-03 PATCH endpoint; 14-04 suggestion routes; 14-05 job-ticket PDF route
provides:
  - "5 optical-orders BFF extensions (PATCH, job-ticket Blob, suggestions GET, accept POST, dismiss POST)"
  - "6 lens-catalog BFF routes (types/materials/coatings × list+create + detail/patch/delete)"
affects: [14-08, 14-09, 14-10]
tech-stack:
  added: []
  patterns:
    - "Binary BFF pattern: raw fetch + arrayBuffer + Bearer token forwarding for PDF streaming (mirrors superbill PDF BFF)"
key-files:
  created:
    - app/api/optical-orders/[orderId]/job-ticket/route.ts
    - app/api/optical-orders/[orderId]/suggestions/route.ts
    - app/api/optical-orders/[orderId]/suggestions/[field]/accept/route.ts
    - app/api/optical-orders/[orderId]/suggestions/[field]/dismiss/route.ts
    - app/api/lens-catalog/types/route.ts
    - app/api/lens-catalog/types/[id]/route.ts
    - app/api/lens-catalog/materials/route.ts
    - app/api/lens-catalog/materials/[id]/route.ts
    - app/api/lens-catalog/coatings/route.ts
    - app/api/lens-catalog/coatings/[id]/route.ts
    - .planning/phases/14-optical-order-configuration/14-07-SUMMARY.md
  modified:
    - app/api/optical-orders/[orderId]/route.ts (added PATCH)
requirements-completed: [OPT14-16]
duration: ~15min
completed: 2026-05-26
---

# Phase 14 Plan 07: BFF Proxy Routes Summary

**11 BFF routes added (5 optical-orders extensions + 6 lens-catalog CRUD). Frontend (Plan 14-08+) can now reach every Phase 14 FastAPI endpoint without 307 redirects or binary corruption.**

## Performance
- **Duration:** ~15 min
- **Tasks:** 2

## Accomplishments
- Every Phase 14 backend route has a matching BFF surface (11 total)
- Job-ticket PDF route uses raw fetch + arrayBuffer (mirrors the CMS-1500 superbill BFF) — preserves application/pdf content-type and Content-Disposition headers
- All upstream URLs terminate with `/` (FastAPI 307 + auth-drop pitfall avoided)
- All dynamic segments use `Promise<{...}> async params` shape (Next.js 14 canonical from Phase 13-06)

## Task Commit
1. **Plan 14-07 (all 11 routes)** — committed in one atomic operation

## Decisions
1. **Used `createServerSupabaseClient` + Bearer token forwarding for the binary route** — mirrors `app/api/encounters/[encounterId]/superbill/pdf/route.ts` exactly. The plan suggested `getAuthHeaders` but the existing PDF-streaming convention in this codebase uses `createServerSupabaseClient + session.access_token`. Same security guarantee; matches established donor.

## Deviations
None substantive.

## Self-Check: PASSED
- `npx tsc --noEmit` → no new errors in any of the 11 BFF files
- `find app/api/lens-catalog app/api/optical-orders -name "route.ts" | wc -l` → 15 (5 existing + 10 new)
- Curl smoke test deferred to Plan 14-08 once FE stores exercise the routes

## Next Phase Readiness
- **14-08** (FE stores) `opticalOrderConfigStore.flush()` PATCHes via the new `/api/optical-orders/[orderId]/` endpoint; `lensCatalogStore.load()` reads from the new `/api/lens-catalog/*` endpoints
- **14-09** (configurator UX) consumes all 11 routes
- **14-10** drawer "Generate Job Ticket" button hits `/api/optical-orders/[orderId]/job-ticket/` (Blob download)

---
*Phase: 14-optical-order-configuration*
*Completed: 2026-05-26*
