"""
api/routes/patient_problem.py

CRUD endpoints for the master patient problem list.
Promotion endpoint copies a problem into an encounter's diagnoses.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.security import TenantContext, get_current_tenant
from backend.db.models.tenant.clinical import (
    Diagnosis,
    Encounter,
    Patient,
    PatientProblem,
)
from backend.db.session import get_db
from backend.schemas.patient_problem import (
    PatientProblemCreate,
    PatientProblemResponse,
    PatientProblemUpdate,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /patients/{patient_id}/problems — list active problems
# ---------------------------------------------------------------------------


@router.get(
    "/{patient_id}/problems",
    response_model=list[PatientProblemResponse],
)
async def list_problems(
    patient_id: UUID,
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List active (non-deleted) problems for a patient."""
    stmt = (
        select(PatientProblem)
        .where(
            PatientProblem.patient_id == patient_id,
            PatientProblem.tenant_id == ctx.tenant_id,
            PatientProblem.is_deleted == False,  # noqa: E712
        )
        .order_by(PatientProblem.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# ---------------------------------------------------------------------------
# POST /patients/{patient_id}/problems — create
# ---------------------------------------------------------------------------


@router.post(
    "/{patient_id}/problems",
    response_model=PatientProblemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_problem(
    patient_id: UUID,
    payload: PatientProblemCreate,
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Add a problem to the master problem list."""
    # Verify patient belongs to tenant
    patient = (
        await db.execute(
            select(Patient).where(
                Patient.id == patient_id,
                Patient.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    problem = PatientProblem(
        tenant_id=ctx.tenant_id,
        patient_id=patient_id,
        icd10_code=payload.icd10_code,
        description=payload.description,
        eye_affected=payload.eye_affected,
        severity=payload.severity,
        status=payload.status,
        onset_date=payload.onset_date,
        source_encounter_id=payload.source_encounter_id,
        notes=payload.notes,
    )
    db.add(problem)
    await db.flush()
    await db.refresh(problem)
    return problem


# ---------------------------------------------------------------------------
# PATCH /patients/{patient_id}/problems/{problem_id} — update
# ---------------------------------------------------------------------------


@router.patch(
    "/{patient_id}/problems/{problem_id}",
    response_model=PatientProblemResponse,
)
async def update_problem(
    patient_id: UUID,
    problem_id: UUID,
    payload: PatientProblemUpdate,
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Update a problem (status, severity, notes, resolved_date, etc.)."""
    problem = (
        await db.execute(
            select(PatientProblem).where(
                PatientProblem.id == problem_id,
                PatientProblem.patient_id == patient_id,
                PatientProblem.tenant_id == ctx.tenant_id,
                PatientProblem.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(problem, field, value)

    await db.flush()
    await db.refresh(problem)
    return problem


# ---------------------------------------------------------------------------
# DELETE /patients/{patient_id}/problems/{problem_id} — soft delete
# ---------------------------------------------------------------------------


@router.delete(
    "/{patient_id}/problems/{problem_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_problem(
    patient_id: UUID,
    problem_id: UUID,
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a problem from the master list."""
    problem = (
        await db.execute(
            select(PatientProblem).where(
                PatientProblem.id == problem_id,
                PatientProblem.patient_id == patient_id,
                PatientProblem.tenant_id == ctx.tenant_id,
                PatientProblem.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    problem.is_deleted = True
    problem.deleted_at = datetime.now(timezone.utc)
    await db.flush()
