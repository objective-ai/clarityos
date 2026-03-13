"""
api/routes/encounter.py

CRUD endpoints for encounters.  Every query is scoped to ctx.tenant_id.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from backend.api.resolvers import resolve_encounter_id
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import (
    AppointmentStatus,
    AuditAction,
    Diagnosis,
    Encounter,
    EncounterAddendum,
    ExamFindings,
    PatientProblem,
    Refraction,
    Staff,
    VitalsAndPretest,
)
from backend.db.session import get_db
from backend.schemas.encounter import (
    AddendumCreate,
    AddendumResponse,
    DiagnosisResponse,
    EncounterCreateRequest,
    EncounterFinalizeRequest,
    EncounterResponse,
    EncounterUpdateRequest,
    ExamFindingsResponse,
    VitalsResponse,
)
from backend.schemas.refraction import RefractionResponse

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _refetch_encounter(db: AsyncSession, encounter_id) -> Encounter:
    """Re-fetch an encounter with all relationships via selectinload.

    Use this instead of db.refresh() after db.flush() to avoid
    MissingGreenlet errors in async SQLAlchemy.
    """
    return (
        await db.execute(
            select(Encounter)
            .where(Encounter.id == encounter_id)
            .options(
                selectinload(Encounter.vitals),
                selectinload(Encounter.refractions),
                selectinload(Encounter.diagnoses),
                selectinload(Encounter.exam_findings),
                selectinload(Encounter.addenda).selectinload(EncounterAddendum.created_by),
                selectinload(Encounter.signed_by),
                selectinload(Encounter.patient),
                selectinload(Encounter.provider),
                selectinload(Encounter.appointment),
            )
        )
    ).scalar_one()


def _build_encounter_response(enc: Encounter) -> EncounterResponse:
    """Map ORM encounter (with eager-loaded relations) to response schema."""
    vitals_resp = None
    if enc.vitals:
        v = enc.vitals
        vitals_resp = VitalsResponse(
            id=v.id,
            encounter_id=v.encounter_id,
            iop_od=v.iop_od,
            iop_os=v.iop_os,
            iop_method=v.iop_method,
            ucva_od=v.ucva_od,
            ucva_os=v.ucva_os,
            bcva_od=v.bcva_od,
            bcva_os=v.bcva_os,
            near_va_od=v.near_va_od,
            near_va_os=v.near_va_os,
            blood_pressure=v.blood_pressure,
            pulse=v.pulse,
            pupils_equal_round_reactive=v.pupils_equal_round_reactive,
            relative_afferent_pupillary_defect=v.relative_afferent_pupillary_defect,
            cover_test_notes=v.cover_test_notes,
            technician_notes=v.technician_notes,
            recorded_by_id=v.recorded_by_id,
            created_at=v.created_at,
            updated_at=v.updated_at,
        )

    # Derive status from finalization state + linked appointment
    if enc.is_finalized:
        derived_status = "finalized"
    elif enc.appointment and enc.appointment.status == AppointmentStatus.IN_EXAM:
        derived_status = "in_exam"
    else:
        derived_status = "pre_test"

    return EncounterResponse(
        id=enc.id,
        short_id=enc.short_id,
        patient_id=enc.patient_id,
        provider_id=enc.provider_id,
        patient_name=enc.patient.full_name if enc.patient else None,
        patient_chart_number=enc.patient.chart_number if enc.patient else None,
        patient_preferred_name=enc.patient.preferred_name if enc.patient else None,
        patient_dob=enc.patient.dob if enc.patient else None,
        patient_sex=enc.patient.sex.value if enc.patient and enc.patient.sex else None,
        provider_name=enc.provider.full_name if enc.provider else None,
        appointment_id=enc.appointment_id,
        encounter_date=enc.encounter_date,
        status=derived_status,
        chief_complaint=enc.chief_complaint,
        assessment_and_plan=enc.assessment_and_plan,
        ai_summary_text=enc.ai_summary_text,
        ai_summary_generated_at=enc.ai_summary_generated_at,
        is_finalized=enc.is_finalized,
        finalized_at=enc.finalized_at,
        signed_by_id=enc.signed_by_id,
        signed_at=enc.signed_at,
        signed_by_name=enc.signed_by.full_name if enc.signed_by else None,
        is_deleted=enc.is_deleted,
        vitals=vitals_resp,
        refractions=[
            RefractionResponse.from_orm_model(rx)
            for rx in enc.refractions
        ],
        diagnoses=[
            DiagnosisResponse(
                id=dx.id,
                icd10_code=dx.icd10_code,
                description=dx.description,
                eye_affected=dx.eye_affected,
                severity=dx.severity,
                status=dx.status,
                notes=dx.notes,
                created_at=dx.created_at,
            )
            for dx in enc.diagnoses
            if not dx.is_deleted
        ],
        exam_findings=[
            ExamFindingsResponse(
                id=ef.id,
                encounter_id=ef.encounter_id,
                patient_id=ef.patient_id,
                exam_section=ef.exam_section,
                is_normal_wnl=ef.is_normal_wnl,
                findings_od=ef.findings_od,
                findings_os=ef.findings_os,
                provider_notes=ef.provider_notes,
                recorded_by_id=ef.recorded_by_id,
                created_at=ef.created_at,
                updated_at=ef.updated_at,
            )
            for ef in enc.exam_findings
        ],
        addenda=[
            AddendumResponse(
                id=a.id,
                encounter_id=a.encounter_id,
                content=a.content,
                created_by_id=a.created_by_id,
                created_by_name=a.created_by.full_name if a.created_by else "Unknown",
                created_at=a.created_at,
            )
            for a in enc.addenda
        ],
        created_at=enc.created_at,
        updated_at=enc.updated_at,
    )


# ---------------------------------------------------------------------------
# POST /encounters — create
# ---------------------------------------------------------------------------


@router.post("/", response_model=EncounterResponse, status_code=status.HTTP_201_CREATED)
async def create_encounter(
    payload: EncounterCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CREATE_ENCOUNTER)),
    db: AsyncSession = Depends(get_db),
):
    staff = await resolve_staff(ctx, db)
    enc = Encounter(
        tenant_id=ctx.tenant_id,
        patient_id=payload.patient_id,
        provider_id=payload.provider_id,
        appointment_id=payload.appointment_id,
        encounter_date=payload.encounter_date,
        chief_complaint=payload.chief_complaint,
    )
    db.add(enc)
    await db.flush()
    await log_action(
        db, ctx, AuditAction.CREATE, "encounter", enc.id,
        staff_id=staff.id if staff else None,
        encounter_id=enc.id,
        patient_id=enc.patient_id,
        detail="Created encounter",
        ip_address=request.client.host if request.client else None,
    )
    enc = await _refetch_encounter(db, enc.id)
    return _build_encounter_response(enc)


# ---------------------------------------------------------------------------
# GET /encounters/{id} — detail
# ---------------------------------------------------------------------------


@router.get("/{encounter_id}", response_model=EncounterResponse)
async def get_encounter(
    encounter_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_ENCOUNTER)),
    db: AsyncSession = Depends(get_db),
):
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    stmt = (
        select(Encounter)
        .where(
            Encounter.id == encounter_id,
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_deleted == False,  # noqa: E712
        )
        .options(
            selectinload(Encounter.vitals),
            selectinload(Encounter.refractions),
            selectinload(Encounter.diagnoses),
            selectinload(Encounter.exam_findings),
            selectinload(Encounter.addenda).selectinload(EncounterAddendum.created_by),
            selectinload(Encounter.signed_by),
            selectinload(Encounter.patient),
            selectinload(Encounter.provider),
            selectinload(Encounter.appointment),
        )
    )
    enc = (await db.execute(stmt)).scalar_one_or_none()
    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")
    await log_action(
        db, ctx, AuditAction.READ, "encounter", enc.id,
        encounter_id=enc.id,
        patient_id=enc.patient_id,
        ip_address=request.client.host if request.client else None,
    )
    return _build_encounter_response(enc)


# ---------------------------------------------------------------------------
# PATCH /encounters/{id} — partial update
# ---------------------------------------------------------------------------


@router.patch("/{encounter_id}", response_model=EncounterResponse)
async def update_encounter(
    encounter_id: str,
    payload: EncounterUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.UPDATE_ENCOUNTER)),
    db: AsyncSession = Depends(get_db),
):
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    enc = (
        await db.execute(
            select(Encounter)
            .where(
                Encounter.id == encounter_id,
                Encounter.tenant_id == ctx.tenant_id,
                Encounter.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(Encounter.vitals),
                selectinload(Encounter.refractions),
                selectinload(Encounter.diagnoses),
                selectinload(Encounter.exam_findings),
                selectinload(Encounter.signed_by),
                selectinload(Encounter.patient),
                selectinload(Encounter.provider),
                selectinload(Encounter.appointment),
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")
    if enc.is_finalized:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Encounter is finalized")

    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(enc, key, value)

    await log_action(
        db, ctx, AuditAction.UPDATE, "encounter", enc.id,
        encounter_id=enc.id,
        patient_id=enc.patient_id,
        detail=f"Updated fields: {', '.join(updates.keys())}",
        ip_address=request.client.host if request.client else None,
    )
    await db.flush()
    enc = await _refetch_encounter(db, enc.id)
    return _build_encounter_response(enc)


# ---------------------------------------------------------------------------
# POST /encounters/{id}/finalize — lock
# ---------------------------------------------------------------------------


@router.post("/{encounter_id}/finalize", response_model=EncounterResponse)
async def finalize_encounter(
    encounter_id: str,
    payload: EncounterFinalizeRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.FINALIZE_ENCOUNTER)),
    db: AsyncSession = Depends(get_db),
):
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    # ── Resolve staff record for the signing provider ──
    staff = await resolve_staff(ctx, db)
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active staff record found for the current user.",
        )

    enc = (
        await db.execute(
            select(Encounter)
            .where(Encounter.id == encounter_id, Encounter.tenant_id == ctx.tenant_id)
            .options(
                selectinload(Encounter.vitals),
                selectinload(Encounter.refractions),
                selectinload(Encounter.diagnoses),
                selectinload(Encounter.exam_findings),
                selectinload(Encounter.signed_by),
                selectinload(Encounter.patient),
                selectinload(Encounter.provider),
                selectinload(Encounter.appointment),
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")
    if enc.is_finalized:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already finalized")

    # ── The Seal ──
    enc.assessment_and_plan = payload.assessment_and_plan
    enc.is_finalized = True
    enc.finalized_at = datetime.now(timezone.utc)
    enc.signed_by_id = staff.id
    enc.signed_at = datetime.now(timezone.utc)

    # Transition appointment status to finalized
    if enc.appointment:
        enc.appointment.status = AppointmentStatus.FINALIZED.value

    await log_action(
        db, ctx, AuditAction.FINALIZE, "encounter", enc.id,
        staff_id=staff.id,
        encounter_id=enc.id,
        patient_id=enc.patient_id,
        detail=f"Signed and finalized by {staff.full_name}",
        ip_address=request.client.host if request.client else None,
    )

    # ── Post-finalization: sync diagnoses back to master problem list ──
    # If a diagnosis linked to a PatientProblem is marked "Resolved" in the encounter,
    # update the corresponding PatientProblem status.
    for dx in enc.diagnoses:
        if dx.is_deleted or not dx.problem_id:
            continue

        problem = (
            await db.execute(
                select(PatientProblem).where(
                    PatientProblem.id == dx.problem_id,
                    PatientProblem.tenant_id == ctx.tenant_id,
                    PatientProblem.is_deleted == False,  # noqa: E712
                )
            )
        ).scalar_one_or_none()

        if not problem:
            continue

        if dx.status and dx.status.lower() == "resolved":
            problem.status = "resolved"
            problem.resolved_date = enc.encounter_date

    await db.flush()
    enc = await _refetch_encounter(db, enc.id)
    return _build_encounter_response(enc)


# ---------------------------------------------------------------------------
# GET /encounters/{id}/addenda — list addenda
# ---------------------------------------------------------------------------


@router.get("/{encounter_id}/addenda", response_model=list[AddendumResponse])
async def list_addenda(
    encounter_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_ENCOUNTER)),
    db: AsyncSession = Depends(get_db),
):
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)

    enc = (
        await db.execute(
            select(Encounter)
            .where(Encounter.id == encounter_id, Encounter.tenant_id == ctx.tenant_id, Encounter.is_deleted == False)  # noqa: E712
        )
    ).scalar_one_or_none()
    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")

    rows = (
        await db.execute(
            select(EncounterAddendum)
            .where(
                EncounterAddendum.encounter_id == encounter_id,
                EncounterAddendum.tenant_id == ctx.tenant_id,
            )
            .options(selectinload(EncounterAddendum.created_by))
            .order_by(EncounterAddendum.created_at.asc())
        )
    ).scalars().all()

    return [
        AddendumResponse(
            id=a.id,
            encounter_id=a.encounter_id,
            content=a.content,
            created_by_id=a.created_by_id,
            created_by_name=a.created_by.full_name if a.created_by else "Unknown",
            created_at=a.created_at,
        )
        for a in rows
    ]


# ---------------------------------------------------------------------------
# POST /encounters/{id}/addenda — create addendum (finalized only)
# ---------------------------------------------------------------------------


@router.post("/{encounter_id}/addenda", response_model=AddendumResponse, status_code=status.HTTP_201_CREATED)
async def create_addendum(
    encounter_id: str,
    payload: AddendumCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.FINALIZE_ENCOUNTER)),
    db: AsyncSession = Depends(get_db),
):
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)

    staff = await resolve_staff(ctx, db)
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active staff record found for the current user.",
        )

    enc = (
        await db.execute(
            select(Encounter)
            .where(Encounter.id == encounter_id, Encounter.tenant_id == ctx.tenant_id, Encounter.is_deleted == False)  # noqa: E712
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")
    if not enc.is_finalized:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Addenda can only be added to finalized encounters.",
        )

    addendum = EncounterAddendum(
        tenant_id=ctx.tenant_id,
        encounter_id=enc.id,
        content=payload.content,
        created_by_id=staff.id,
    )
    db.add(addendum)

    await log_action(
        db, ctx, AuditAction.CREATE_ADDENDUM, "encounter_addendum", addendum.id,
        encounter_id=enc.id,
        patient_id=enc.patient_id,
        staff_id=staff.id,
        detail=f"Addendum added by {staff.full_name}",
        ip_address=request.client.host if request.client else None,
    )

    await db.flush()

    # Re-fetch with selectinload (never db.refresh — MissingGreenlet)
    addendum = (
        await db.execute(
            select(EncounterAddendum)
            .where(EncounterAddendum.id == addendum.id)
            .options(selectinload(EncounterAddendum.created_by))
        )
    ).scalar_one()

    return AddendumResponse(
        id=addendum.id,
        encounter_id=addendum.encounter_id,
        content=addendum.content,
        created_by_id=addendum.created_by_id,
        created_by_name=addendum.created_by.full_name if addendum.created_by else "Unknown",
        created_at=addendum.created_at,
    )
