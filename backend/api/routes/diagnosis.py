"""
api/routes/diagnosis.py

CRUD endpoints for encounter-level diagnoses.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditAction, Diagnosis, Encounter
from backend.db.session import get_db
from backend.schemas.diagnosis import (
    DiagnosisCreateRequest,
    DiagnosisResponse,
    DiagnosisUpdateRequest,
)

router = APIRouter()


@router.post(
    "/{encounter_id}/diagnoses",
    response_model=DiagnosisResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_diagnosis(
    encounter_id: UUID,
    payload: DiagnosisCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CREATE_DIAGNOSIS)),
    db: AsyncSession = Depends(get_db),
):
    """Add a diagnosis to an encounter."""
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

    dx = Diagnosis(
        tenant_id=ctx.tenant_id,
        encounter_id=encounter_id,
        icd10_code=payload.icd10_code,
        description=payload.description,
        eye_affected=payload.eye_affected,
        severity=payload.severity,
        status=payload.status,
        notes=payload.notes,
    )
    db.add(dx)
    await db.flush()
    await log_action(
        db, ctx, AuditAction.CREATE, "diagnosis", dx.id,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        detail=f"Added diagnosis {payload.icd10_code}",
        ip_address=request.client.host if request.client else None,
    )
    await db.refresh(dx)
    return dx


@router.patch(
    "/{encounter_id}/diagnoses/{diagnosis_id}",
    response_model=DiagnosisResponse,
)
async def update_diagnosis(
    encounter_id: UUID,
    diagnosis_id: UUID,
    payload: DiagnosisUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CREATE_DIAGNOSIS)),
    db: AsyncSession = Depends(get_db),
):
    """Update a diagnosis on an encounter."""
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

    dx = (
        await db.execute(
            select(Diagnosis).where(
                Diagnosis.id == diagnosis_id,
                Diagnosis.encounter_id == encounter_id,
                Diagnosis.tenant_id == ctx.tenant_id,
                Diagnosis.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not dx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnosis not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(dx, field, value)

    await db.flush()
    await log_action(
        db, ctx, AuditAction.UPDATE, "diagnosis", dx.id,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        detail=f"Updated diagnosis {dx.icd10_code}",
        ip_address=request.client.host if request.client else None,
    )
    await db.refresh(dx)
    return dx


@router.delete(
    "/{encounter_id}/diagnoses/{diagnosis_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_diagnosis(
    encounter_id: UUID,
    diagnosis_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.DELETE_DIAGNOSIS)),
    db: AsyncSession = Depends(get_db),
):
    """Remove a diagnosis from an encounter."""
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

    dx = (
        await db.execute(
            select(Diagnosis).where(
                Diagnosis.id == diagnosis_id,
                Diagnosis.encounter_id == encounter_id,
                Diagnosis.tenant_id == ctx.tenant_id,
                Diagnosis.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not dx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnosis not found")

    dx.is_deleted = True
    dx.deleted_at = datetime.now(timezone.utc)
    await log_action(
        db, ctx, AuditAction.DELETE, "diagnosis", dx.id,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        detail=f"Soft-deleted diagnosis {dx.icd10_code}",
        ip_address=request.client.host if request.client else None,
    )
    await db.flush()
