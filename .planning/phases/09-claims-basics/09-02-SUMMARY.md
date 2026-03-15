# 09-02 Summary — Backend API Routes

## Commit
`ccb7078` — feat(claims): payer CRUD, patient insurance, fee service, fee resolution in create_superbill (09-02)

## What Was Built

### 1. Fee Service (`backend/services/fee_service.py`)
- `resolve_line_item_fee(cpt_code, payer_id, tenant_id, db)` → `(Decimal, str)`
- Returns payer-specific fee with `"payer_rate"` when override exists
- Falls back to base catalog (payer_id=NULL) with `"base_rate"`
- Returns `(Decimal("0.00"), "base_rate")` when no entry found

### 2. Payer Router (`backend/api/routes/payer.py`) — 9 endpoints at `/api/payers`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/fee-catalog` | Base fee catalog (payer_id IS NULL) |
| PUT | `/fee-catalog` | Bulk upsert base fees |
| GET | `/` | List all payers |
| POST | `/` | Create payer |
| GET | `/{payer_id}` | Get single payer |
| PATCH | `/{payer_id}` | Update payer |
| DELETE | `/{payer_id}` | Soft-delete (is_active=False, 409 if referenced) |
| GET | `/{payer_id}/fee-schedule` | Payer fee overrides |
| PUT | `/{payer_id}/fee-schedule` | Bulk replace payer fee overrides |

### 3. Patient Insurance Router (`backend/api/routes/patient_insurance.py`) — 5 endpoints at `/api/patients`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/{patient_id}/insurance` | List insurance records |
| POST | `/{patient_id}/insurance` | Create (409 if duplicate priority) |
| PATCH | `/{patient_id}/insurance/{id}` | Update |
| DELETE | `/{patient_id}/insurance/{id}` | Hard delete |
| GET | `/{patient_id}/superbills` | Patient superbill summary list |

### 4. Billing Schemas Extended (`backend/schemas/billing.py`)
- `PayerCreate`, `PayerUpdate`, `PayerResponse`
- `FeeScheduleItemResponse`, `FeeScheduleItemUpdate`
- `PatientInsuranceCreate`, `PatientInsuranceUpdate`, `PatientInsuranceResponse`
- `PatientSuperbillSummary`
- `SuperbillCreateRequest` extended with `billed_payer_id`, `is_self_pay`
- `SuperbillResponse` extended with `billed_payer_id`, `is_self_pay`
- `LineItemResponse` extended with `is_fee_overridden`, `fee_source`

### 5. Billing Route Extended (`backend/api/routes/billing.py`)
- `create_superbill` now accepts `billed_payer_id` and `is_self_pay`
- Each line item fee is resolved via `resolve_line_item_fee()` with payer fallback
- `_build_superbill_response` includes `billed_payer_id`, `is_self_pay`, `is_fee_overridden`, `fee_source`

### 6. Router Registration (`backend/main.py`)
- `patient_insurance.router` at `/api/patients` (after patient_problem)
- `payer.router` at `/api/payers`

## Conflict Resolution
- `/api/patients` already had `patient.router` and `patient_problem.router`
- `patient_insurance.router` registered alongside them — no conflicts since all new paths are sub-paths (`/{patient_id}/insurance`, `/{patient_id}/superbills`)
- `/fee-catalog` routes registered BEFORE `/{payer_id}` in payer router to avoid shadowing

## Verification
- All Python imports clean
- Payer router: 9 routes confirmed
- Patient insurance router: 5 routes confirmed
- Vitest stubs: 5 skipped, 0 failed
- TypeScript: compiles clean
