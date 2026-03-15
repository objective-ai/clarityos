# Phase 9 Wave 3 — Backend API: Fee Service, Payer Router, Patient Insurance

## Goal
Build all backend FastAPI endpoints for payer CRUD, patient insurance, fee resolution, and patient superbill listing; extend `create_superbill` to accept a payer and resolve per-payer fees.

**Depends on:** 09-01 (ORM models + migration) complete

## Read These Files First
1. `backend/api/main.py` — **CRITICAL**: find all existing `app.include_router(...)` calls at prefix `/api/patients`. Read this FIRST before touching anything.
2. `backend/api/routes/billing.py` — find `create_superbill` signature + existing imports + how `suggest_line_items()` is called
3. `backend/api/routes/` — list to see what router files already exist
4. `backend/core/permissions.py` — find `ClinicalAction.MANAGE_BILLING` and `VIEW_BILLING`
5. `backend/schemas/billing.py` — find `AppBaseModel`, `SuperbillCreateRequest`, `SuperbillResponse`, `LineItemResponse`

## Context

**Fee resolution pattern (two-query fallback):**
```
1. If payer_id given → query FeeScheduleItem WHERE payer_id=payer AND cpt_code=cpt AND tenant_id=tenant
2. If found → return (fee, "payer_rate")
3. If not found → query FeeScheduleItem WHERE payer_id=NULL AND cpt_code=cpt AND tenant_id=tenant
4. If found → return (fee, "base_rate")
5. If not found → return (Decimal("0.00"), "base_rate")
```

**selectinload re-fetch pattern (MANDATORY after flush):**
```python
refreshed = (
    await db.execute(
        select(SomeModel)
        .where(SomeModel.id == new_obj.id)
        .options(selectinload(SomeModel.relationship))
    )
).scalar_one()
```

**Router prefix registered in main.py:**
```python
app.include_router(payer.router, prefix="/api/payers", tags=["payers"])
app.include_router(billing.router, prefix="/api/encounters", tags=["billing"])
# Patient insurance and superbills endpoints: see conflict rule below
```

## Do NOT / Instead
- Do NOT add a second `app.include_router` at prefix `/api/patients` if one already exists in main.py — FastAPI's catch-all `/{patient_id}` would shadow the new sub-routes. Instead, add new endpoints to the EXISTING patients router file.
- Do NOT register `/{payer_id}` route before `/fee-catalog` in the payer router — `{payer_id}` is a catch-all that would match the literal string "fee-catalog". Register `/fee-catalog` FIRST.
- Do NOT call `db.refresh()` after `db.flush()` — MissingGreenlet crash. Use `selectinload` re-fetch.
- Do NOT pass raw `Decimal` values to float arithmetic — use `float(item.fee)` explicitly.
- Do NOT set `fee_source = "manual"` from `create_superbill` — only backend fee resolution sets `"payer_rate"` or `"base_rate"`. `"manual"` is set by the PATCH endpoint when a user edits a fee.

## Instructions

### Task 1 — Create `backend/services/fee_service.py` + extend `backend/schemas/billing.py`

**Create `backend/services/fee_service.py`:**
```python
"""Fee resolution service — async DB-backed fee lookup with payer-rate/base-rate fallback."""
import uuid
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.models.tenant.clinical import FeeScheduleItem


async def resolve_line_item_fee(
    cpt_code: str,
    payer_id: uuid.UUID | None,
    tenant_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[Decimal, str]:
    """Return (fee, fee_source) for a CPT code given an optional payer.

    fee_source is "payer_rate" when a payer-specific override exists,
    "base_rate" when falling back to the base catalog (payer_id=NULL).
    Returns (Decimal("0.00"), "base_rate") when no catalog entry found.
    """
    if payer_id:
        result = await db.execute(
            select(FeeScheduleItem).where(
                FeeScheduleItem.payer_id == payer_id,
                FeeScheduleItem.cpt_code == cpt_code,
                FeeScheduleItem.tenant_id == tenant_id,
            )
        )
        item = result.scalar_one_or_none()
        if item:
            return item.fee, "payer_rate"

    base_result = await db.execute(
        select(FeeScheduleItem).where(
            FeeScheduleItem.payer_id == None,  # noqa: E711
            FeeScheduleItem.cpt_code == cpt_code,
            FeeScheduleItem.tenant_id == tenant_id,
        )
    )
    base_item = base_result.scalar_one_or_none()
    if base_item:
        return base_item.fee, "base_rate"

    return Decimal("0.00"), "base_rate"
```

**Extend `backend/schemas/billing.py`** — add after existing schemas:
```python
import uuid as _uuid

class PayerCreate(AppBaseModel):
    name: str
    payer_id: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool = True

class PayerUpdate(AppBaseModel):
    name: str | None = None
    payer_id: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool | None = None

class PayerResponse(AppBaseModel):
    id: _uuid.UUID
    name: str
    payer_id: str | None
    phone: str | None
    address: str | None
    is_active: bool

class FeeScheduleItemResponse(AppBaseModel):
    id: _uuid.UUID
    payer_id: _uuid.UUID | None
    cpt_code: str
    description: str
    fee: float

class FeeScheduleItemUpdate(AppBaseModel):
    cpt_code: str
    fee: float

class PatientInsuranceCreate(AppBaseModel):
    payer_id: _uuid.UUID
    priority: str  # "primary" | "secondary"
    plan_type: str  # "medical" | "vision" | "other"
    subscriber_id: str | None = None
    group_number: str | None = None
    plan_name: str | None = None
    relationship_to_subscriber: str = "self"
    subscriber_name: str | None = None
    subscriber_dob: str | None = None  # ISO date string

class PatientInsuranceUpdate(AppBaseModel):
    payer_id: _uuid.UUID | None = None
    plan_type: str | None = None
    subscriber_id: str | None = None
    group_number: str | None = None
    plan_name: str | None = None
    relationship_to_subscriber: str | None = None
    subscriber_name: str | None = None
    subscriber_dob: str | None = None

class PatientInsuranceResponse(AppBaseModel):
    id: _uuid.UUID
    patient_id: _uuid.UUID
    payer_id: _uuid.UUID
    payer_name: str  # denormalized for display
    priority: str
    plan_type: str
    subscriber_id: str | None
    group_number: str | None
    plan_name: str | None
    relationship_to_subscriber: str
    subscriber_name: str | None
    subscriber_dob: str | None

class PatientSuperbillSummary(AppBaseModel):
    id: _uuid.UUID
    encounter_id: _uuid.UUID
    encounter_date: str
    claim_status: str
    total_fee: float
    mdm_level: str | None = None
    suggested_em_code: str | None = None
    cpt_codes: list[str]
```

Also extend the existing `SuperbillCreateRequest` to add:
```python
billed_payer_id: _uuid.UUID | None = None
is_self_pay: bool = False
```

And update `SuperbillResponse` / `LineItemResponse` to include:
- `SuperbillResponse`: add `billed_payer_id: _uuid.UUID | None`, `is_self_pay: bool`
- `LineItemResponse`: add `is_fee_overridden: bool`, `fee_source: str`

### Task 2a — Create `backend/api/routes/payer.py` + register in `backend/api/main.py`

**Step 0:** Read `backend/api/main.py` first. Check for existing `/api/patients` `include_router`. Record which file those patient routes live in — needed for Task 2b.

**Create `backend/api/routes/payer.py`** with these 9 endpoints. **Register `/fee-catalog` routes BEFORE `/{payer_id}`:**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from backend.db.models.tenant.clinical import InsurancePayer, FeeScheduleItem
from backend.schemas.billing import PayerCreate, PayerUpdate, PayerResponse, FeeScheduleItemResponse, FeeScheduleItemUpdate
from backend.core.auth import TenantContext, require_permission
from backend.core.permissions import ClinicalAction
from backend.db.session import get_db
import uuid

router = APIRouter()

# IMPORTANT: /fee-catalog MUST come before /{payer_id} to avoid shadowing
@router.get("/fee-catalog", response_model=list[FeeScheduleItemResponse])
async def get_fee_catalog(ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FeeScheduleItem).where(FeeScheduleItem.payer_id == None, FeeScheduleItem.tenant_id == ctx.tenant_id))  # noqa
    return result.scalars().all()

@router.put("/fee-catalog", response_model=list[FeeScheduleItemResponse])
async def update_fee_catalog(items: list[FeeScheduleItemUpdate], ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)), db: AsyncSession = Depends(get_db)):
    # Upsert base fee rows by (tenant_id, cpt_code) where payer_id=None
    for item in items:
        existing = (await db.execute(select(FeeScheduleItem).where(FeeScheduleItem.payer_id == None, FeeScheduleItem.cpt_code == item.cpt_code, FeeScheduleItem.tenant_id == ctx.tenant_id))).scalar_one_or_none()  # noqa
        if existing:
            existing.fee = item.fee
        else:
            db.add(FeeScheduleItem(id=uuid.uuid4(), tenant_id=ctx.tenant_id, payer_id=None, cpt_code=item.cpt_code, description=item.cpt_code, fee=item.fee))
    await db.commit()
    result = await db.execute(select(FeeScheduleItem).where(FeeScheduleItem.payer_id == None, FeeScheduleItem.tenant_id == ctx.tenant_id))  # noqa
    return result.scalars().all()

@router.get("/", response_model=list[PayerResponse])
async def list_payers(ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InsurancePayer).where(InsurancePayer.tenant_id == ctx.tenant_id).order_by(InsurancePayer.name))
    return result.scalars().all()

@router.post("/", response_model=PayerResponse, status_code=201)
async def create_payer(payload: PayerCreate, ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)), db: AsyncSession = Depends(get_db)):
    payer = InsurancePayer(id=uuid.uuid4(), tenant_id=ctx.tenant_id, **payload.model_dump())
    db.add(payer)
    await db.flush()
    payer_id = payer.id
    await db.commit()
    result = await db.execute(select(InsurancePayer).where(InsurancePayer.id == payer_id))
    return result.scalar_one()

@router.get("/{payer_id}", response_model=PayerResponse)
async def get_payer(payer_id: uuid.UUID, ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InsurancePayer).where(InsurancePayer.id == payer_id, InsurancePayer.tenant_id == ctx.tenant_id))
    payer = result.scalar_one_or_none()
    if not payer:
        raise HTTPException(status_code=404, detail="Payer not found")
    return payer

@router.patch("/{payer_id}", response_model=PayerResponse)
async def update_payer(payer_id: uuid.UUID, payload: PayerUpdate, ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InsurancePayer).where(InsurancePayer.id == payer_id, InsurancePayer.tenant_id == ctx.tenant_id))
    payer = result.scalar_one_or_none()
    if not payer:
        raise HTTPException(status_code=404, detail="Payer not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(payer, field, value)
    await db.commit()
    result2 = await db.execute(select(InsurancePayer).where(InsurancePayer.id == payer_id))
    return result2.scalar_one()

@router.delete("/{payer_id}", status_code=204)
async def delete_payer(payer_id: uuid.UUID, ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)), db: AsyncSession = Depends(get_db)):
    # Soft delete (set is_active=False); return 409 if PatientInsurance references this payer
    from backend.db.models.tenant.clinical import PatientInsurance
    refs = (await db.execute(select(PatientInsurance).where(PatientInsurance.payer_id == payer_id))).first()
    if refs:
        raise HTTPException(status_code=409, detail="Payer is referenced by patient insurance records")
    result = await db.execute(select(InsurancePayer).where(InsurancePayer.id == payer_id, InsurancePayer.tenant_id == ctx.tenant_id))
    payer = result.scalar_one_or_none()
    if not payer:
        raise HTTPException(status_code=404, detail="Payer not found")
    payer.is_active = False
    await db.commit()

@router.get("/{payer_id}/fee-schedule", response_model=list[FeeScheduleItemResponse])
async def get_payer_fee_schedule(payer_id: uuid.UUID, ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FeeScheduleItem).where(FeeScheduleItem.payer_id == payer_id, FeeScheduleItem.tenant_id == ctx.tenant_id))
    return result.scalars().all()

@router.put("/{payer_id}/fee-schedule", response_model=list[FeeScheduleItemResponse])
async def update_payer_fee_schedule(payer_id: uuid.UUID, items: list[FeeScheduleItemUpdate], ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)), db: AsyncSession = Depends(get_db)):
    # Bulk replace: delete existing payer rows, insert new list
    await db.execute(delete(FeeScheduleItem).where(FeeScheduleItem.payer_id == payer_id, FeeScheduleItem.tenant_id == ctx.tenant_id))
    # Get descriptions from base catalog for each CPT
    for item in items:
        base = (await db.execute(select(FeeScheduleItem).where(FeeScheduleItem.payer_id == None, FeeScheduleItem.cpt_code == item.cpt_code, FeeScheduleItem.tenant_id == ctx.tenant_id))).scalar_one_or_none()  # noqa
        desc = base.description if base else item.cpt_code
        db.add(FeeScheduleItem(id=uuid.uuid4(), tenant_id=ctx.tenant_id, payer_id=payer_id, cpt_code=item.cpt_code, description=desc, fee=item.fee))
    await db.commit()
    result = await db.execute(select(FeeScheduleItem).where(FeeScheduleItem.payer_id == payer_id, FeeScheduleItem.tenant_id == ctx.tenant_id))
    return result.scalars().all()
```

**Register in `backend/api/main.py`:**
```python
from backend.api.routes import payer
app.include_router(payer.router, prefix="/api/payers", tags=["payers"])
```

### Task 2b — Patient insurance endpoints + extend billing.py + register

**Step 0:** Apply the conflict rule from Task 2a:
- If `/api/patients` already has a router in main.py → add patient insurance endpoints to THAT existing file
- If no `/api/patients` router exists → create `backend/api/routes/patient_insurance.py`

**Patient insurance endpoints (4 endpoints in the appropriate router file):**
```python
# GET /{patient_id}/insurance
# POST /{patient_id}/insurance  — enforce uniqueness: 409 if same priority exists
# PATCH /{patient_id}/insurance/{insurance_id}
# DELETE /{patient_id}/insurance/{insurance_id}
```
- All read from `PatientInsurance` ORM with `selectinload(PatientInsurance.payer)` for `payer_name`
- POST returns 409 with `"Patient already has a {priority} insurance on file."` if priority conflict
- After flush: re-fetch with selectinload (NEVER db.refresh)

**Extend `backend/api/routes/billing.py`:**

1. Add import: `from backend.services.fee_service import resolve_line_item_fee`
2. In `create_superbill`, extend the line items loop to call fee resolution after `suggest_line_items()`:
```python
superbill.billed_payer_id = payload.billed_payer_id
superbill.is_self_pay = payload.is_self_pay
# After suggest_line_items(), for each line item:
for item_data in suggested_items:
    fee, fee_source = await resolve_line_item_fee(
        item_data["cpt_code"], payload.billed_payer_id, ctx.tenant_id, db
    )
    # Set fee and fee_source on the SuperbillLineItem (overwrites suggestion fee)
    item_data["fee"] = fee
    item_data["fee_source"] = fee_source
```

3. Add `patient_billing_router` after the existing endpoints:
```python
patient_billing_router = APIRouter()

@patient_billing_router.get("/{patient_id}/superbills", response_model=list[PatientSuperbillSummary])
async def list_patient_superbills(
    patient_id: str,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """List all superbills for a patient — powers the patient Billing tab."""
    from sqlalchemy.orm import selectinload as sl
    result = await db.execute(
        select(Superbill)
        .where(Superbill.patient_id == patient_id, Superbill.tenant_id == ctx.tenant_id)
        .options(sl(Superbill.line_items))
        .order_by(Superbill.created_at.desc())
    )
    superbills = result.scalars().all()
    summaries = []
    for sb in superbills:
        active_items = [li for li in sb.line_items if not getattr(li, "is_deleted", False)]
        total = sum(float(li.fee) * li.units for li in active_items)
        summaries.append(PatientSuperbillSummary(
            id=sb.id,
            encounter_id=sb.encounter_id,
            encounter_date=sb.created_at.strftime("%Y-%m-%d") if sb.created_at else "",
            claim_status=sb.claim_status.value if hasattr(sb.claim_status, "value") else str(sb.claim_status),
            total_fee=total,
            cpt_codes=[li.cpt_code for li in active_items],
        ))
    return summaries
```

**Register `patient_billing_router` in `backend/api/main.py`:**
```python
app.include_router(billing.patient_billing_router, prefix="/api/patients", tags=["patient-billing"])
# Only add a new patient_insurance include_router if NO existing /api/patients router was found in Task 2a
```

## Verify
```bash
cd C:/Users/duytr/Projects/clarityos && python -c "from backend.services.fee_service import resolve_line_item_fee; from backend.schemas.billing import PayerCreate, PatientInsuranceCreate, PatientSuperbillSummary; print('schemas OK')"
```
```bash
python -c "from backend.api.routes.payer import router; print('payer router OK, routes:', [r.path for r in router.routes])"
```
```bash
python -c "from backend.api.routes.billing import patient_billing_router; print('patient_billing_router OK')"
```
```bash
bash scripts/dev.sh check-api 2>&1 | head -5
```

## Done When
- `fee_service.py` importable, all new Pydantic schemas importable
- `payer.router` has 9 routes, `/fee-catalog` appears before `/{payer_id}` in output
- `patient_billing_router` importable from billing.py
- `create_superbill` calls `resolve_line_item_fee` for each line item
- Server health check passes (both FastAPI :8000 and Next.js :3000)

## Commit
```
feat(claims-api): add payer CRUD, patient insurance, and fee resolution endpoints
```
