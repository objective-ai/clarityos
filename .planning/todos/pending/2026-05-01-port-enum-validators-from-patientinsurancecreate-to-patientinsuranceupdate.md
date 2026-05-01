---
created: 2026-05-01T23:51:44.276Z
title: Port enum validators from PatientInsuranceCreate to PatientInsuranceUpdate
area: api
files:
  - backend/schemas/billing.py:337-377
  - backend/api/routes/patient_insurance.py:252-354
  - backend/tests/test_patient_insurance.py
---

## Problem

`PatientInsuranceCreate` (backend/schemas/billing.py:337-357) has three
`@field_validator` blocks:

  - `priority` ∈ {"primary", "secondary"}
  - `plan_type` ∈ {"medical", "vision", "other"}
  - `eligibility_status` ∈ {"active", "inactive", "pending_verification", "expired", "unknown"}

`PatientInsuranceUpdate` (lines 360-377) has **none** of them. The PATCH
route (`backend/api/routes/patient_insurance.py:252`) does not add a
runtime guard either, so:

```http
PATCH /api/patients/{id}/insurance/{ins_id}
{ "priority": "tertiary", "plan_type": "dental", "eligibility_status": "bogus" }
```

succeeds at the schema layer, writes garbage values to the DB, and the
patient Billing tab now displays unparseable rows. Surfaced during the
2026-05-01 test-coverage audit (gap #3).

The asymmetry is pinned with explicit tests in
`backend/tests/test_patient_insurance.py::TestPatientInsuranceUpdateValidation`
(`test_update_does_not_validate_priority_enum` etc.) — these document
the **current** behavior so this fix can flip them deliberately.

## Solution

1. Copy the three `field_validator` blocks from `PatientInsuranceCreate`
   to `PatientInsuranceUpdate`. They need to be guarded against `None`
   (Update fields are optional) — early-return when value is None.
2. Flip the corresponding tests in `test_patient_insurance.py` from
   `test_update_does_not_validate_*` to `test_update_rejects_invalid_*`.
3. Verify no existing PATCH callers depend on the lax behavior — grep
   `app/api/patient*` and `store/` for insurance update calls; the FE
   should already be sending only valid enum values from the form.
