"""
api/routes/promotion.py

Promotion: copy a master problem into an encounter's diagnoses.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction, Diagnosis, Encounter, PatientProblem
from backend.db.session import get_db
from backend.schemas.diagnosis import DiagnosisResponse

router = APIRouter()


@router.post(
    "/{encounter_id}/diagnoses/from-problem/{problem_id}",
    response_model=DiagnosisResponse,
    status_code=status.HTTP_201_CREATED,
)
async def promote_problem_to_diagnosis(
    encounter_id: UUID,
    problem_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.PROMOTE_PROBLEM)),
    db: AsyncSession = Depends(get_db),
):
    """Copy a master problem into an encounter as a diagnosis (copy-on-promotion)."""
    # Verify encounter
    enc = (
        await db.execute(
            select(Encounter).where(
                Encounter.id == encounter_id,
                Encounter.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")
    if enc.is_finalized:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Encounter is finalized")

    # Verify problem
    problem = (
        await db.execute(
            select(PatientProblem).where(
                PatientProblem.id == problem_id,
                PatientProblem.tenant_id == ctx.tenant_id,
                PatientProblem.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not problem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    if problem.patient_id != enc.patient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Problem does not belong to this encounter's patient.",
        )

    # Copy-on-promotion: direct field copy
    dx = Diagnosis(
        tenant_id=ctx.tenant_id,
        encounter_id=encounter_id,
        icd10_code=problem.icd10_code,
        description=problem.description,
        eye_affected=problem.eye_affected,
        severity=problem.severity,
        status="active",
        notes=f"Promoted from master problem list (problem_id: {problem.id})",
    )
    db.add(dx)
    await db.flush()
    await log_action(
        db, ctx, AuditAction.PROMOTE, "diagnosis", dx.id,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        detail=f"Promoted problem {problem.icd10_code} (problem_id: {problem.id})",
        ip_address=request.client.host if request.client else None,
    )
    await db.refresh(dx)
    return dx
