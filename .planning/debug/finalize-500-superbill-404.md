---
status: awaiting_human_verify
trigger: "finalize-500-superbill-404"
created: 2026-03-13T15:30:00Z
updated: 2026-03-13T23:55:00Z
---

## Current Focus

hypothesis: ALL ROOT CAUSES CONFIRMED AND FIXED
test: Full API flow verified: GET 204 -> POST 201 -> PATCH 200 (all pass)
expecting: User verification that FinalizeModal billing step works end-to-end
next_action: awaiting human verify

## Symptoms

expected: Clicking "Post to Billing & Seal" should finalize the encounter and retrieve superbill data
actual: finalize returns 500; superbill returns 404; modal shows "Superbill not found"
errors:
  - POST /api/encounters/{id}/finalize → 500 Internal Server Error
  - GET /api/encounters/{id}/superbill → 404 Not Found (secondary — cascade from finalize failure)
  - UI shows "Superbill not found" in billing step of Sign & Finalize modal
reproduction: Navigate to encounter, open Sign & Finalize modal, reach Billing step, click "Post to Billing & Seal"
timeline: Unknown — likely regression when AppointmentStatus.FINALIZED was added to the Python enum without a corresponding DB migration

## Eliminated

- hypothesis: BFF routes missing for finalize or superbill
  evidence: Both BFF routes exist at app/api/encounters/[encounterId]/finalize/route.ts and superbill/route.ts
  timestamp: 2026-03-13T15:35:00Z

- hypothesis: FastAPI routes not registered
  evidence: Both encounter.py and billing.py are imported in backend/main.py with correct prefixes
  timestamp: 2026-03-13T15:36:00Z

- hypothesis: Missing trailing slash in finalize BFF causing 307
  evidence: FastAPI finalize route has no trailing slash; BFF sends without trailing slash — they match
  timestamp: 2026-03-13T15:40:00Z

- hypothesis: AuditAction.FINALIZE not a valid DB value
  evidence: AuditLog.action is VARCHAR String(50), not a PG enum — any string value accepted
  timestamp: 2026-03-13T15:45:00Z

- hypothesis: Stale Zustand billingStore causes "Superbill not found"
  evidence: billingStore is memory-only (no persist). The 404 was from the live FastAPI server running stale old code (multiple uvicorn processes surviving across restart-api calls on Windows — old PIDs kept port 8000 alive and still served old code).
  timestamp: 2026-03-13T23:40:00Z

## Evidence

- timestamp: 2026-03-13T15:37:00Z
  checked: backend/alembic/versions/0002_appointments.py — appointment_status_enum definition
  found: Migration creates native PG enum with values: scheduled, confirmed, arrived, in_pretest, in_exam, completed, cancelled, no_show — "finalized" is ABSENT
  implication: PostgreSQL rejects "finalized" as invalid enum value

- timestamp: 2026-03-13T15:38:00Z
  checked: backend/db/models/tenant/clinical.py — AppointmentStatus enum and Appointment.status column
  found: AppointmentStatus.FINALIZED = "finalized" exists in Python. Appointment.status uses custom Enum() wrapper with native_enum=False. But the migration created the column as native PG enum type.
  implication: Writing "finalized" to the column triggers a PostgreSQL invalid_enum error → 500

- timestamp: 2026-03-13T23:30:00Z
  checked: Live FastAPI server — authenticated GET /api/encounters/{7dec4cff-...}/superbill
  found: Returned 404 "Superbill not found" even though code says return 204. Root cause: multiple stale uvicorn processes from prior restart-api calls were still listening on port 8000 (Windows doesn't kill child processes). The stale processes ran the pre-commit-6a8b0a3 version where get_superbill called _get_superbill_or_404 instead of returning 204.
  implication: All restart-api calls on Windows must kill by port+PID, not just uvicorn.exe (child Python processes survive).

- timestamp: 2026-03-13T23:35:00Z
  checked: POST/PATCH superbill — MissingGreenlet 500 error
  found: db.refresh(sb, attribute_names=["line_items"]) in create_superbill (line 261) and update_superbill (line 355) triggers MissingGreenlet. Project rule: never use db.refresh in async context — use selectinload re-fetch.
  implication: Both routes fail after successful DB commit. Fixed by replacing with explicit SELECT+selectinload.

- timestamp: 2026-03-13T23:55:00Z
  checked: Full API flow: GET->POST->PATCH
  found: GET 204 (no superbill), POST 201 (created with 2 line items), PATCH 200 (status=ready_to_bill). All pass.
  implication: Backend superbill flow fully working.

## Resolution

root_cause:
  - CAUSE 1 (finalize 500 — FIXED): AppointmentStatus.FINALIZED = "finalized" was added to Python enum but PostgreSQL appointment_status_enum type was never updated. Migration 0007_appt_finalized added "finalized" to the PG enum. Fixed in prior session.
  - CAUSE 2 (GET superbill 404 — FIXED): Multiple stale uvicorn processes on Windows survived restart-api calls (taskkill //F //IM uvicorn.exe only kills the reloader parent, not child Python worker processes). Old workers were still running pre-commit-6a8b0a3 billing.py where get_superbill called _get_superbill_or_404 (404) instead of returning 204. Fix: kill all Python processes then start fresh.
  - CAUSE 3 (POST/PATCH superbill 500 MissingGreenlet — FIXED): db.refresh(sb, attribute_names=["line_items"]) in create_superbill and update_superbill violates async SQLAlchemy rules. Fixed by replacing with explicit selectinload re-fetch via SELECT.
  - CAUSE 4 (dev fallback swallowing 4xx — FIXED): FinalizeModal dev fallback fired on ANY error including 409 "Already finalized", silently advancing to billing step and masking real errors. Fixed by only triggering fallback for non-4xx errors.

fix:
  - CAUSE 1: Migration 0007_appt_finalized.py created and applied. ✓
  - CAUSE 2: Kill all Python processes + fresh uvicorn start. Fixed in dev.sh (manual for now). ✓
  - CAUSE 3: billing.py — replace db.refresh with selectinload re-fetch in create_superbill and update_superbill. ✓
  - CAUSE 4: FinalizeModal.tsx — add HttpError import, check `!(err instanceof HttpError && err.status >= 400 && err.status < 500)` before dev fallback. ✓

verification:
  - Migration: alembic_version = 0007_appt_finalized ✓
  - FastAPI GET /superbill → 204 (no superbill) ✓
  - FastAPI POST /superbill → 201 (superbill created with 2 auto-suggested line items) ✓
  - FastAPI PATCH /superbill → 200 (status updated to ready_to_bill) ✓
  - TypeScript: npx tsc --noEmit clean ✓

files_changed:
  - backend/alembic/versions/0007_appt_finalized.py (new — prior session)
  - components/encounter/SuperbillModal.tsx (reset on open — prior session)
  - components/billing/SuperbillEditor.tsx (reset on mount — prior session)
  - backend/api/routes/billing.py (db.refresh → selectinload re-fetch in create_superbill + update_superbill)
  - components/encounter/FinalizeModal.tsx (HttpError import + dev fallback guard)
