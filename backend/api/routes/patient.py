"""
api/routes/patient.py

CRUD + search + detail + clinical flowsheet + AI Prep Me endpoints for patients.

Every query is scoped to ctx.tenant_id for tenant isolation.
All mutations are audit-logged per HIPAA 164.312(b).
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.resolvers import resolve_patient_id
from backend.core.audit import log_action
from backend.core.config import settings
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import (
    AuditAction,
    Diagnosis,
    Encounter,
    Patient,
    Refraction,
    RefractionType,
    Staff,
    VitalsAndPretest,
)
from backend.db.session import get_db
from backend.schemas.patient import (
    FlowsheetRow,
    PatientCreateRequest,
    PatientEncounterSummary,
    PatientListResponse,
    PatientResponse,
    PatientSummary,
    PatientUpdateRequest,
    PrepMeResponse,
    RxHistoryRow,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_contact(patient: Patient) -> dict:
    """Extract contact fields from JSONB."""
    info = patient.contact_info_jsonb or {}
    return {
        "phone": info.get("phone"),
        "email": info.get("email"),
        "address_line1": info.get("address_line1"),
        "address_line2": info.get("address_line2"),
        "city": info.get("city"),
        "state": info.get("state"),
        "zip_code": info.get("zip_code"),
        "insurance_provider": info.get("insurance_provider"),
        "insurance_member_id": info.get("insurance_member_id"),
        "insurance_group": info.get("insurance_group"),
        "emergency_contact_name": info.get("emergency_contact_name"),
        "emergency_contact_phone": info.get("emergency_contact_phone"),
        "emergency_contact_relation": info.get("emergency_contact_relation"),
    }


def _build_contact_jsonb(payload: dict) -> dict:
    """Build the contact_info JSONB from flat request fields."""
    contact_fields = [
        "phone", "email", "address_line1", "address_line2",
        "city", "state", "zip_code",
        "insurance_provider", "insurance_member_id", "insurance_group",
        "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
    ]
    return {k: v for k, v in payload.items() if k in contact_fields and v is not None}


def _build_patient_response(patient: Patient) -> PatientResponse:
    """Map ORM Patient to response schema."""
    contact = _extract_contact(patient)
    medical = patient.medical_history_jsonb or {}
    alerts = medical.get("alerts", [])

    return PatientResponse(
        id=patient.id,
        chart_number=patient.chart_number,
        first_name=patient.first_name,
        last_name=patient.last_name,
        preferred_name=patient.preferred_name,
        dob=patient.dob,
        sex=patient.sex,
        ssn_last4=patient.ssn_last4,
        notes=medical.get("notes"),
        alerts=alerts,
        is_deleted=patient.is_deleted,
        created_at=patient.created_at,
        updated_at=patient.updated_at,
        **contact,
    )


def _build_patient_summary(patient: Patient, last_visit: date | None = None) -> PatientSummary:
    """Map ORM Patient to list summary."""
    contact = patient.contact_info_jsonb or {}
    return PatientSummary(
        id=patient.id,
        chart_number=patient.chart_number,
        first_name=patient.first_name,
        last_name=patient.last_name,
        preferred_name=patient.preferred_name,
        dob=patient.dob,
        sex=patient.sex,
        phone=contact.get("phone"),
        email=contact.get("email"),
        last_visit=last_visit,
        created_at=patient.created_at,
    )


async def _get_patient_or_404(
    patient_id: UUID, tenant_id: UUID, db: AsyncSession
) -> Patient:
    """Fetch a patient by ID scoped to tenant, or raise 404."""
    patient = (
        await db.execute(
            select(Patient).where(
                Patient.id == patient_id,
                Patient.tenant_id == tenant_id,
                Patient.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    return patient


# ---------------------------------------------------------------------------
# GET /api/patients — list + search
# ---------------------------------------------------------------------------


@router.get("/", response_model=PatientListResponse)
async def list_patients(
    request: Request,
    search: str | None = Query(None, max_length=200, description="Search name, phone, or email"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """List patients with optional search (name, phone, email)."""

    base = select(Patient).where(
        Patient.tenant_id == ctx.tenant_id,
        Patient.is_deleted == False,  # noqa: E712
    )

    if search:
        search_term = f"%{search.strip()}%"
        base = base.where(
            or_(
                Patient.first_name.ilike(search_term),
                Patient.last_name.ilike(search_term),
                Patient.preferred_name.ilike(search_term),
                Patient.contact_info_jsonb["phone"].astext.ilike(search_term),
                Patient.contact_info_jsonb["email"].astext.ilike(search_term),
            )
        )

    # Count total
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Fetch page
    stmt = base.order_by(Patient.last_name, Patient.first_name).offset(offset).limit(limit)
    result = await db.execute(stmt)
    patients = result.scalars().all()

    # Get last visit date per patient (subquery)
    patient_ids = [p.id for p in patients]
    last_visits: dict[UUID, date] = {}
    if patient_ids:
        lv_stmt = (
            select(
                Encounter.patient_id,
                func.max(Encounter.encounter_date).label("last_visit"),
            )
            .where(
                Encounter.patient_id.in_(patient_ids),
                Encounter.tenant_id == ctx.tenant_id,
                Encounter.is_deleted == False,  # noqa: E712
            )
            .group_by(Encounter.patient_id)
        )
        lv_result = await db.execute(lv_stmt)
        for row in lv_result:
            last_visits[row.patient_id] = row.last_visit

    items = [
        _build_patient_summary(p, last_visits.get(p.id))
        for p in patients
    ]

    return PatientListResponse(items=items, total=total, limit=limit, offset=offset)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _next_chart_number(tenant_id: UUID, db: AsyncSession) -> int:
    """Generate next sequential chart number for a tenant (e.g. 1001, 1002, ...)."""
    result = await db.execute(
        select(func.max(Patient.chart_number)).where(Patient.tenant_id == tenant_id)
    )
    current_max = result.scalar_one_or_none()
    return (current_max or 1000) + 1


# ---------------------------------------------------------------------------
# POST /api/patients — create
# ---------------------------------------------------------------------------


@router.post("/", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
async def create_patient(
    payload: PatientCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new patient record."""
    staff = await resolve_staff(ctx, db)

    data = payload.model_dump()
    contact_jsonb = _build_contact_jsonb(data)
    medical_jsonb = {}
    if data.get("notes"):
        medical_jsonb["notes"] = data["notes"]

    chart_number = await _next_chart_number(ctx.tenant_id, db)

    patient = Patient(
        tenant_id=ctx.tenant_id,
        chart_number=chart_number,
        first_name=data["first_name"],
        last_name=data["last_name"],
        preferred_name=data.get("preferred_name"),
        dob=data["dob"],
        sex=data["sex"],
        ssn_last4=data.get("ssn_last4"),
        contact_info_jsonb=contact_jsonb,
        medical_history_jsonb=medical_jsonb,
        privacy_flags_jsonb={},
    )
    db.add(patient)
    await db.flush()

    await log_action(
        db, ctx, AuditAction.CREATE, "patient", patient.id,
        staff_id=staff.id if staff else None,
        patient_id=patient.id,
        detail=f"Created patient {patient.full_name}",
        ip_address=request.client.host if request.client else None,
    )

    await db.refresh(patient)
    return _build_patient_response(patient)


# ---------------------------------------------------------------------------
# GET /api/patients/{id} — detail
# ---------------------------------------------------------------------------


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """Get full patient detail (demographics, contact, insurance, alerts)."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    patient = await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    await log_action(
        db, ctx, AuditAction.PHI_VIEWED, "patient", patient.id,
        patient_id=patient.id,
        detail="Viewed patient detail",
        ip_address=request.client.host if request.client else None,
    )

    return _build_patient_response(patient)


# ---------------------------------------------------------------------------
# PATCH /api/patients/{id} — update
# ---------------------------------------------------------------------------


@router.patch("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: str,
    payload: PatientUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """Update patient demographics, contact, or insurance info."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    staff = await resolve_staff(ctx, db)
    patient = await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    updates = payload.model_dump(exclude_unset=True)
    changes: dict = {}

    # Direct model fields
    direct_fields = ["first_name", "last_name", "preferred_name", "dob", "sex", "ssn_last4"]
    for field in direct_fields:
        if field in updates:
            old_val = getattr(patient, field)
            new_val = updates[field]
            if old_val != new_val:
                changes[field] = {"old": str(old_val), "new": str(new_val)}
                setattr(patient, field, new_val)

    # Contact JSONB fields
    contact_updates = _build_contact_jsonb(updates)
    if contact_updates:
        current_contact = dict(patient.contact_info_jsonb or {})
        for k, v in contact_updates.items():
            if current_contact.get(k) != v:
                changes[k] = {"old": current_contact.get(k), "new": v}
            current_contact[k] = v
        patient.contact_info_jsonb = current_contact

    # Notes go into medical_history_jsonb
    if "notes" in updates:
        medical = dict(patient.medical_history_jsonb or {})
        medical["notes"] = updates["notes"]
        patient.medical_history_jsonb = medical

    if changes:
        await log_action(
            db, ctx, AuditAction.UPDATE, "patient", patient.id,
            staff_id=staff.id if staff else None,
            patient_id=patient.id,
            detail=f"Updated fields: {', '.join(changes.keys())}",
            changes=changes,
            ip_address=request.client.host if request.client else None,
        )

    await db.flush()
    await db.refresh(patient)
    return _build_patient_response(patient)


# ---------------------------------------------------------------------------
# DELETE /api/patients/{id} — soft delete
# ---------------------------------------------------------------------------


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(
    patient_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a patient record."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    staff = await resolve_staff(ctx, db)
    patient = await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    patient.is_deleted = True
    patient.deleted_at = datetime.now(timezone.utc)

    await log_action(
        db, ctx, AuditAction.DELETE, "patient", patient.id,
        staff_id=staff.id if staff else None,
        patient_id=patient.id,
        detail=f"Soft-deleted patient {patient.full_name}",
        ip_address=request.client.host if request.client else None,
    )
    await db.flush()


# ---------------------------------------------------------------------------
# GET /api/patients/{id}/encounters — encounter timeline
# ---------------------------------------------------------------------------


@router.get("/{patient_id}/encounters", response_model=list[PatientEncounterSummary])
async def list_patient_encounters(
    patient_id: str,
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """List encounters for a patient in reverse chronological order."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    patient = await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    stmt = (
        select(Encounter)
        .where(
            Encounter.patient_id == patient_id,
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_deleted == False,  # noqa: E712
        )
        .options(
            selectinload(Encounter.provider),
            selectinload(Encounter.diagnoses),
        )
        .order_by(Encounter.encounter_date.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(stmt)
    encounters = result.scalars().all()

    return [
        PatientEncounterSummary(
            id=enc.id,
            short_id=enc.short_id,
            encounter_date=enc.encounter_date,
            provider_id=enc.provider_id,
            provider_name=enc.provider.full_name if enc.provider else None,
            chief_complaint=enc.chief_complaint,
            assessment_and_plan=enc.assessment_and_plan,
            ai_summary_text=enc.ai_summary_text,
            is_finalized=enc.is_finalized,
            diagnosis_count=len([d for d in enc.diagnoses if not d.is_deleted]),
            created_at=enc.created_at,
        )
        for enc in encounters
    ]


# ---------------------------------------------------------------------------
# GET /api/patients/{id}/flowsheet — clinical flowsheet data
# ---------------------------------------------------------------------------


@router.get("/{patient_id}/flowsheet", response_model=list[FlowsheetRow])
async def get_patient_flowsheet(
    patient_id: str,
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """Get IOP and refraction data across visits for clinical flowsheets."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    # Get encounters with vitals and refractions
    stmt = (
        select(Encounter)
        .where(
            Encounter.patient_id == patient_id,
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_deleted == False,  # noqa: E712
        )
        .options(
            selectinload(Encounter.vitals),
            selectinload(Encounter.refractions),
        )
        .order_by(Encounter.encounter_date.desc())
        .limit(limit)
    )

    result = await db.execute(stmt)
    encounters = result.scalars().all()

    rows: list[FlowsheetRow] = []
    for enc in encounters:
        vitals = enc.vitals
        # Get the final or manifest refraction (prefer final)
        rx = None
        for r in enc.refractions:
            if r.refraction_type == RefractionType.FINAL:
                rx = r
                break
        if rx is None:
            for r in enc.refractions:
                if r.refraction_type == RefractionType.MANIFEST:
                    rx = r
                    break

        rows.append(FlowsheetRow(
            encounter_id=enc.id,
            encounter_date=enc.encounter_date,
            iop_od=vitals.iop_od if vitals else None,
            iop_os=vitals.iop_os if vitals else None,
            sphere_od=rx.od_sphere if rx else None,
            sphere_os=rx.os_sphere if rx else None,
            cylinder_od=rx.od_cylinder if rx else None,
            cylinder_os=rx.os_cylinder if rx else None,
            add_od=rx.od_add if rx else None,
            add_os=rx.os_add if rx else None,
        ))

    return rows


# ---------------------------------------------------------------------------
# GET /api/patients/{id}/rx-history — finalized prescription history
# ---------------------------------------------------------------------------


@router.get("/{patient_id}/rx-history", response_model=list[RxHistoryRow])
async def get_rx_history(
    patient_id: str,
    request: Request,
    modality: str | None = Query(None, description="Filter: glasses or contact_lens"),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """Get finalized prescription history across encounters."""
    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)
    patient = await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    # Validate modality filter
    if modality and modality not in ("glasses", "contact_lens"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="modality must be 'glasses' or 'contact_lens'",
        )

    await log_action(
        db, ctx, AuditAction.PHI_VIEWED, "patient", patient.id,
        patient_id=patient.id,
        detail="Viewed Rx history",
        ip_address=request.client.host if request.client else None,
    )

    # Get finalized encounters with final Rx
    stmt = (
        select(Refraction)
        .join(Encounter, Refraction.encounter_id == Encounter.id)
        .where(
            Encounter.patient_id == patient_id,
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_deleted == False,  # noqa: E712
            Encounter.is_finalized == True,  # noqa: E712
            Refraction.is_final_rx == True,  # noqa: E712
        )
        .options(
            selectinload(Refraction.encounter).selectinload(Encounter.provider),
        )
        .order_by(Encounter.encounter_date.desc())
        .limit(limit)
    )

    if modality:
        stmt = stmt.where(Refraction.rx_modality == modality)

    result = await db.execute(stmt)
    refractions = result.scalars().all()

    rows: list[RxHistoryRow] = []
    for rx in refractions:
        enc = rx.encounter
        rows.append(RxHistoryRow(
            encounter_id=enc.id,
            encounter_date=enc.encounter_date,
            provider_name=enc.provider.full_name if enc.provider else None,
            rx_modality=rx.rx_modality,
            rx_type=rx.refraction_type.value if hasattr(rx.refraction_type, "value") else str(rx.refraction_type),
            od_sphere=rx.od_sphere,
            od_cylinder=rx.od_cylinder,
            od_axis=rx.od_axis,
            od_add=rx.od_add,
            os_sphere=rx.os_sphere,
            os_cylinder=rx.os_cylinder,
            os_axis=rx.os_axis,
            os_add=rx.os_add,
        ))

    return rows


# ---------------------------------------------------------------------------
# POST /api/patients/{id}/prep-me — AI pre-visit summary
# ---------------------------------------------------------------------------


@router.post("/{patient_id}/prep-me", response_model=PrepMeResponse)
async def prep_me(
    patient_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """AI clinical summary from last 3 finalized SOAP notes, cached per day."""
    from datetime import date as date_type, datetime, timezone

    patient_id = await resolve_patient_id(patient_id, ctx.tenant_id, db)

    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI Prep Me is not configured. Set ANTHROPIC_API_KEY in .env.",
        )

    patient = await _get_patient_or_404(patient_id, ctx.tenant_id, db)

    # --- Lightweight encounter metadata (needed for both cache hit & miss) ---
    from sqlalchemy import func as sa_func

    meta_stmt = (
        select(
            sa_func.count(Encounter.id),
            sa_func.max(Encounter.encounter_date),
        )
        .where(
            Encounter.patient_id == patient_id,
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_deleted == False,  # noqa: E712
            Encounter.is_finalized == True,  # noqa: E712
            Encounter.assessment_and_plan.isnot(None),
        )
    )
    meta_result = await db.execute(meta_stmt)
    enc_count, last_enc_date = meta_result.one()

    if enc_count == 0:
        return PrepMeResponse(
            summary="No finalized encounters found for this patient.",
            encounter_count=0,
        )

    # --- Check DB cache: if generated today, return cached summary ---
    if (
        patient.prep_me_summary
        and patient.prep_me_generated_at
        and patient.prep_me_generated_at.date() == date_type.today()
    ):
        staff = await resolve_staff(ctx, db)
        await log_action(
            db, ctx, AuditAction.PHI_VIEWED, "patient", patient.id,
            staff_id=staff.id if staff else None,
            patient_id=patient.id,
            detail="AI Prep Me summary viewed (cached)",
            metadata={"cached": True, "encounter_count": enc_count},
            ip_address=request.client.host if request.client else None,
        )
        return PrepMeResponse(
            summary=patient.prep_me_summary,
            encounter_count=enc_count,
            last_encounter_date=last_enc_date,
            cached=True,
        )

    # --- Cache miss: generate via LLM ---
    stmt = (
        select(Encounter)
        .where(
            Encounter.patient_id == patient_id,
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_deleted == False,  # noqa: E712
            Encounter.is_finalized == True,  # noqa: E712
            Encounter.assessment_and_plan.isnot(None),
        )
        .order_by(Encounter.encounter_date.desc())
        .limit(3)
    )
    result = await db.execute(stmt)
    encounters = result.scalars().all()

    # Build context from SOAP notes
    notes_context = []
    for enc in encounters:
        parts = [f"Date: {enc.encounter_date}"]
        if enc.chief_complaint:
            parts.append(f"Chief Complaint: {enc.chief_complaint}")
        if enc.ai_summary_text:
            parts.append(f"SOAP Note:\n{enc.ai_summary_text}")
        elif enc.assessment_and_plan:
            parts.append(f"Assessment & Plan:\n{enc.assessment_and_plan}")
        notes_context.append("\n".join(parts))

    combined_notes = "\n\n---\n\n".join(notes_context)

    # Call Claude
    from anthropic import Anthropic
    from backend.core.ai_models import get_tenant_ai_model

    ai_model = await get_tenant_ai_model(ctx.tenant_id, db)
    client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    try:
        message = client.messages.create(
            model=ai_model,
            max_tokens=400,
            system=(
                "You are a clinical decision support assistant for optometry. "
                "Given the patient's recent SOAP notes, produce 3-5 bullet points "
                "of the key clinical facts a doctor needs before seeing this patient. "
                "Each bullet must be one short line (under 15 words). "
                "Focus on: active diagnoses, trending measurements (IOP, VA, Rx changes), "
                "medications, and pending follow-ups. "
                "Use a dash (- ) to start each bullet. No headers, no paragraphs."
            ),
            messages=[{
                "role": "user",
                "content": f"Patient chart notes:\n\n{combined_notes}",
            }],
        )
        summary_text = message.content[0].text.strip()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI service error: {e}",
        )

    # Save to DB cache
    patient.prep_me_summary = summary_text
    patient.prep_me_generated_at = datetime.now(timezone.utc)
    await db.commit()

    # Audit log
    staff = await resolve_staff(ctx, db)
    await log_action(
        db, ctx, AuditAction.PHI_VIEWED, "patient", patient.id,
        staff_id=staff.id if staff else None,
        patient_id=patient.id,
        detail="AI Prep Me summary generated",
        metadata={"ai_model": ai_model, "encounter_count": len(encounters), "cached": False},
        ip_address=request.client.host if request.client else None,
    )

    return PrepMeResponse(
        summary=summary_text,
        encounter_count=enc_count,
        last_encounter_date=last_enc_date,
    )
