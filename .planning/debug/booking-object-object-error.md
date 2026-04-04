---
status: diagnosed
trigger: "Public Booking Page Shows [object Object] Error on Confirm"
created: 2026-04-03T00:00:00Z
updated: 2026-04-03T00:00:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: FastAPI 422 returns detail as array of objects; frontend assumes detail is a string
test: confirmed by reading schema + error handler code
expecting: N/A — diagnosis only
next_action: return diagnosis

## Symptoms

expected: Public booking wizard submits successfully and shows confirmation
actual: Error banner shows "[object Object],[object Object]"
errors: "[object Object],[object Object]" in confirm step error banner
reproduction: Complete booking wizard on /book/sunview, leave dob/sex empty or fill them, click confirm
started: Since Phase 10.2 Plan 06 built the public booking wizard

## Eliminated

(none — root cause found on first hypothesis)

## Evidence

- timestamp: 2026-04-03
  checked: PublicBookingRequest Pydantic schema (backend/schemas/public_booking.py lines 72-96)
  found: dob (date) and sex (str) are REQUIRED fields with no defaults
  implication: Omitting them triggers FastAPI 422 validation error

- timestamp: 2026-04-03
  checked: Frontend payload construction (app/book/[slug]/page.tsx lines 515-526)
  found: dob and sex use `|| undefined` which strips them from JSON when empty strings
  implication: Required fields are missing from the POST body

- timestamp: 2026-04-03
  checked: Frontend error handler (app/book/[slug]/page.tsx lines 529-541)
  found: `data?.detail` is used directly in `throw new Error(data?.detail ?? ...)` — but FastAPI 422 detail is an ARRAY of objects, not a string
  implication: Error.toString() on array of objects produces "[object Object],[object Object]"

- timestamp: 2026-04-03
  checked: BFF route (app/api/public/booking/[slug]/book/route.ts)
  found: BFF passes through response status and body without transformation
  implication: 422 status + array detail reaches frontend unchanged

## Resolution

root_cause: |
  Two bugs combine to produce the [object Object] error:
  
  Bug A (payload): `dob` and `sex` are required in the Pydantic schema but the frontend
  sends `dob: dob || undefined` and `sex: sex || undefined`. When these are empty strings
  (their initial state), they become undefined and are stripped by JSON.stringify.
  FastAPI returns 422 with detail as an array of validation error objects.
  
  Bug B (error handling): The catch block does `throw new Error(data?.detail ?? fallback)`.
  For 422 responses, `data.detail` is an array like:
  [{"loc":["body","dob"],"msg":"Field required","type":"missing"}, ...]
  Passing an array to `new Error()` calls .toString(), producing "[object Object],[object Object]".

fix: |
  1. Fix error handling (line 537-538): Extract message strings from detail when it's an array:
     ```
     const detail = data?.detail;
     const message = Array.isArray(detail)
       ? detail.map((e: any) => e.msg ?? e.message ?? String(e)).join("; ")
       : typeof detail === "string" ? detail : "Something went wrong...";
     throw new Error(message);
     ```
  
  2. Fix payload: Either make dob/sex optional in the schema, OR add UI validation
     requiring them before submit (add to validationErrors useMemo).

verification: N/A — diagnosis only
files_changed: []
