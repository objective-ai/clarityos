---
created: 2026-05-01T23:51:44.276Z
title: Enforce VIEW_SYSTEM_STATUS on system health and uptime routes
area: api
files:
  - backend/core/permissions.py:81
  - backend/core/permissions.py:157
  - backend/api/routes/system.py:101-102
  - backend/api/routes/uptime.py:94-97
  - app/(tenant)/[tenant]/admin/page.tsx:2505
---

## Problem

`ClinicalAction.VIEW_SYSTEM_STATUS` is defined in
`backend/core/permissions.py:81` ("OWNER-only: system health, errors, uptime")
and mapped to `{OWNER}` in `PERMISSION_MATRIX` (line 157). The frontend
admin page (`app/(tenant)/[tenant]/admin/page.tsx:2505`) gates the system
panel UI on `has("view_system_status")`.

But **no FastAPI route uses `require_permission(VIEW_SYSTEM_STATUS)`**.
The two relevant endpoints have no auth dependency at all:

  - `GET /api/system/health/` (`backend/api/routes/system.py:101`) —
    no `get_current_tenant`, no `require_permission`. Anyone can curl it.
  - `GET /api/uptime/` (`backend/api/routes/uptime.py:94`) — same.

Surfaced during the 2026-05-01 test-coverage audit (gap #2 / #4) when
the matrix-completeness test passed but no route-level enforcement test
could be written for this action.

This is a low-severity HIPAA concern: the endpoints expose pg/auth/api
status booleans, not PHI, but they DO leak DB-up/down signals that an
attacker could use for timing attacks or to confirm the deployment
exists. The FE-side check is security theater while the backend is open.

## Solution

Decide between two paths and apply consistently:

**Path A — enforce at backend:**
1. Add `ctx: TenantContext = Depends(require_permission(VIEW_SYSTEM_STATUS))`
   to both routes.
2. Note: `system.py` is currently called by some uptime probe / monitor —
   check `app/api/system/` BFF + any external uptime monitor before
   gating; may need a separate unauthenticated `/healthz` for k8s/probes
   that returns just `{"status":"ok"}` with no detail.
3. Add route-level RBAC tests in
   `backend/tests/test_permissions.py::TestRouteLevelEnforcement` —
   doctor → 403, owner → 200.

**Path B — accept it's a public endpoint:**
1. Remove `VIEW_SYSTEM_STATUS` from `ClinicalAction` and `PERMISSION_MATRIX`.
2. Remove the FE entitlement check in `admin/page.tsx:2505` — replace
   with a role check (`session.role === 'owner'`) that just hides the
   panel since the data is public anyway.
3. Update `test_view_system_status_is_owner_only` accordingly.

Path A is the safer call given the OWNER-only intent; Path B is honest
about current behavior. Either way the matrix and the routes must agree.
