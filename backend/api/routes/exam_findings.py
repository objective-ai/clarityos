"""
api/routes/exam_findings.py

CRUD endpoints for ocular health exam findings (anterior / posterior segment).
Uses JSONB + Pydantic validation per section.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import AuditAction, Encounter, ExamFindings
from backend.db.session import get_db
from backend.schemas.exam_findings import (
    SECTION_SCHEMA_MAP,
    ExamFindingsDetailResponse,
    ExamFindingsUpdateRequest,
)

router = APIRouter()


@router.put(
    "/{encounter_id}/exam-findings/{exam_section}",
    response_model=ExamFindingsDetailResponse,
)
async def upsert_exam_findings(
    encounter_id: UUID,
    exam_section: str,
    payload: ExamFindingsUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.EDIT_EXAM_FINDINGS)),
    db: AsyncSession = Depends(get_db),
):
    """Upsert structured exam findings for a given encounter + section."""

    # 1. Validate section name
    schema_cls = SECTION_SCHEMA_MAP.get(exam_section)
    if not schema_cls:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown exam section: '{exam_section}'. "
            f"Valid: {list(SECTION_SCHEMA_MAP.keys())}",
        )

    # 2. Verify encounter belongs to tenant
    enc = (
        await db.execute(
            select(Encounter).where(
                Encounter.id == encounter_id,
                Encounter.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found"
        )
    if enc.is_finalized:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Encounter is finalized"
        )

    # 3. Validate JSONB payloads against section-specific Pydantic model
    validated_od = None
    validated_os = None

    if payload.findings_od is not None:
        try:
            validated_od = schema_cls.model_validate(payload.findings_od).model_dump()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid findings_od: {e}",
            )

    if payload.findings_os is not None:
        try:
            validated_os = schema_cls.model_validate(payload.findings_os).model_dump()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid findings_os: {e}",
            )

    # 4. Resolve staff identity for attribution
    staff = await resolve_staff(ctx, db)

    # 5. Find or create
    existing = (
        await db.execute(
            select(ExamFindings).where(
                ExamFindings.encounter_id == encounter_id,
                ExamFindings.exam_section == exam_section,
                ExamFindings.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not existing:
        existing = ExamFindings(
            encounter_id=encounter_id,
            tenant_id=ctx.tenant_id,
            patient_id=enc.patient_id,
            exam_section=exam_section,
            recorded_by_id=staff.id if staff else None,
        )
        db.add(existing)

    existing.is_normal_wnl = payload.is_normal_wnl
    existing.findings_od = validated_od
    existing.findings_os = validated_os
    existing.provider_notes = payload.provider_notes

    await db.flush()
    await log_action(
        db, ctx, AuditAction.UPDATE, "exam_findings", existing.id,
        staff_id=staff.id if staff else None,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        detail=f"Upserted {exam_section} findings",
        ip_address=request.client.host if request.client else None,
    )
    await db.refresh(existing)
    return existing


@router.get(
    "/{encounter_id}/exam-findings/{exam_section}",
    response_model=ExamFindingsDetailResponse,
)
async def get_exam_findings(
    encounter_id: UUID,
    exam_section: str,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_EXAM_FINDINGS)),
    db: AsyncSession = Depends(get_db),
):
    """Get exam findings for a specific encounter + section."""

    row = (
        await db.execute(
            select(ExamFindings).where(
                ExamFindings.encounter_id == encounter_id,
                ExamFindings.exam_section == exam_section,
                ExamFindings.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Findings not found"
        )
    return row
