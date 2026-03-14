"""
api/routes/billing.py

CRUD endpoints for superbills and billing operations.
Business logic (MDM calculation, CPT suggestion, pointer validation)
lives in backend/services/billing_service.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import Response as FastAPIResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.resolvers import resolve_encounter_id
from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.tenant.clinical import (
    AuditAction,
    ClaimStatus,
    Encounter,
    PatientProblem,
    Superbill,
    SuperbillLineItem,
)
from backend.db.session import get_db
from backend.schemas.billing import (
    CptIcdWarning,
    LineItemCreateRequest,
    LineItemResponse,
    LineItemUpdateRequest,
    MdmCalculationResult,
    SuperbillCreateRequest,
    SuperbillResponse,
    SuperbillUpdateRequest,
)
from backend.services.billing_service import (
    calculate_mdm,
    suggest_line_items,
    validate_cpt_icd_pointers,
)
from backend.services.fee_service import resolve_line_item_fee

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_superbill_or_404(
    encounter_id: UUID | str,
    tenant_id: UUID,
    db: AsyncSession,
    *,
    load_line_items: bool = False,
) -> Superbill:
    """Fetch a superbill by encounter ID scoped to tenant, or raise 404."""
    stmt = select(Superbill).where(
        Superbill.encounter_id == encounter_id,
        Superbill.tenant_id == tenant_id,
    )
    if load_line_items:
        stmt = stmt.options(selectinload(Superbill.line_items))

    sb = (await db.execute(stmt)).scalar_one_or_none()
    if not sb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Superbill not found")
    return sb


def _build_superbill_response(
    sb: Superbill,
    warnings: list[CptIcdWarning] | None = None,
) -> SuperbillResponse:
    """Map ORM superbill to response schema."""
    return SuperbillResponse(
        id=sb.id,
        encounter_id=sb.encounter_id,
        patient_id=sb.patient_id,
        provider_id=sb.provider_id,
        claim_status=sb.claim_status.value if isinstance(sb.claim_status, ClaimStatus) else sb.claim_status,
        mdm_level=sb.mdm_level,
        mdm_reasoning=sb.mdm_reasoning,
        suggested_em_code=sb.suggested_em_code,
        total_fee=sb.total_fee,
        notes=sb.notes,
        created_by_id=sb.created_by_id,
        billed_payer_id=sb.billed_payer_id,
        is_self_pay=sb.is_self_pay,
        line_items=[
            LineItemResponse(
                id=li.id,
                superbill_id=li.superbill_id,
                cpt_code=li.cpt_code,
                description=li.description,
                fee=li.fee,
                units=li.units,
                diagnosis_pointers=li.diagnosis_pointers or [],
                modifiers=li.modifiers or [],
                is_fee_overridden=li.is_fee_overridden,
                fee_source=li.fee_source,
                created_at=li.created_at,
                updated_at=li.updated_at,
            )
            for li in (sb.line_items or [])
            if not li.is_deleted
        ],
        warnings=warnings or [],
        created_at=sb.created_at,
        updated_at=sb.updated_at,
    )


# ---------------------------------------------------------------------------
# POST /encounters/{encounter_id}/superbill — create
# ---------------------------------------------------------------------------


@router.post(
    "/{encounter_id}/superbill",
    response_model=SuperbillResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_superbill(
    encounter_id: str,
    payload: SuperbillCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Create a superbill for a finalized encounter.

    Auto-populates with suggested CPT codes if no line items provided.
    Calculates MDM complexity and suggests E&M code.
    """
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    # Verify encounter exists and is finalized
    enc = (
        await db.execute(
            select(Encounter)
            .where(
                Encounter.id == encounter_id,
                Encounter.tenant_id == ctx.tenant_id,
                Encounter.is_deleted == False,  # noqa: E712
            )
            .options(
                selectinload(Encounter.diagnoses),
                selectinload(Encounter.exam_findings),
                selectinload(Encounter.refractions),
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")
    if not enc.is_finalized:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot create superbill for an unfinalized encounter.",
        )

    # Check for existing superbill
    existing = (
        await db.execute(
            select(Superbill).where(
                Superbill.encounter_id == encounter_id,
                Superbill.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A superbill already exists for this encounter.",
        )

    # Resolve staff
    staff = await resolve_staff(ctx, db)

    # Fetch patient problems for MDM calculation
    problems = (
        await db.execute(
            select(PatientProblem).where(
                PatientProblem.patient_id == enc.patient_id,
                PatientProblem.tenant_id == ctx.tenant_id,
                PatientProblem.is_deleted == False,  # noqa: E712
            )
        )
    ).scalars().all()

    # Calculate MDM
    mdm_result = calculate_mdm(
        list(enc.diagnoses),
        list(problems),
        list(enc.exam_findings),
    )

    # Create superbill
    sb = Superbill(
        tenant_id=ctx.tenant_id,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        provider_id=enc.provider_id,
        claim_status=ClaimStatus.DRAFT,
        mdm_level=mdm_result.mdm_level,
        mdm_reasoning=mdm_result.reasoning,
        suggested_em_code=mdm_result.suggested_em_code,
        notes=payload.notes,
        created_by_id=staff.id if staff else None,
        billed_payer_id=payload.billed_payer_id,
        is_self_pay=payload.is_self_pay,
    )
    db.add(sb)
    await db.flush()

    # Add line items — use provided or auto-suggest
    if payload.line_items:
        raw_items = [li.model_dump() for li in payload.line_items]
    else:
        has_refraction = len(enc.refractions) > 0
        raw_items = suggest_line_items(
            list(enc.diagnoses), has_refraction, mdm_result
        )

    total_fee = Decimal("0.00")
    for item_data in raw_items:
        # Resolve fee from payer/base catalog (overwrites suggestion fee)
        resolved_fee, fee_source = await resolve_line_item_fee(
            item_data["cpt_code"], payload.billed_payer_id, ctx.tenant_id, db
        )
        # Use resolved fee if > 0, otherwise keep the suggested fee
        final_fee = resolved_fee if resolved_fee > 0 else Decimal(str(item_data["fee"]))
        li = SuperbillLineItem(
            tenant_id=ctx.tenant_id,
            superbill_id=sb.id,
            cpt_code=item_data["cpt_code"],
            description=item_data["description"],
            fee=final_fee,
            units=item_data["units"],
            diagnosis_pointers=item_data["diagnosis_pointers"],
            modifiers=item_data.get("modifiers", []),
            fee_source=fee_source,
            is_fee_overridden=False,
        )
        db.add(li)
        total_fee += li.fee * li.units

    sb.total_fee = total_fee
    await db.flush()

    # Audit log
    await log_action(
        db, ctx, AuditAction.CREATE_SUPERBILL, "superbill", sb.id,
        staff_id=staff.id if staff else None,
        encounter_id=encounter_id,
        patient_id=enc.patient_id,
        detail=f"Created superbill with {len(raw_items)} line items, MDM: {mdm_result.mdm_level}",
        ip_address=request.client.host if request.client else None,
    )

    # Capture diagnoses before commit expires relationships
    diagnoses_snapshot = list(enc.diagnoses)

    await db.commit()

    # Re-fetch with line items (db.refresh is unsafe in async context — use selectinload)
    sb = (
        await db.execute(
            select(Superbill)
            .where(Superbill.id == sb.id)
            .options(selectinload(Superbill.line_items))
        )
    ).scalar_one()

    # Validate pointers
    active_items = [li for li in sb.line_items if not li.is_deleted]
    warnings = validate_cpt_icd_pointers(active_items, diagnoses_snapshot)

    return _build_superbill_response(sb, warnings)


# ---------------------------------------------------------------------------
# GET /encounters/{encounter_id}/superbill — read
# ---------------------------------------------------------------------------


@router.get("/{encounter_id}/superbill", response_model=SuperbillResponse | None)
async def get_superbill(
    encounter_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the superbill for an encounter."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    sb = (
        await db.execute(
            select(Superbill)
            .where(Superbill.encounter_id == encounter_id, Superbill.tenant_id == ctx.tenant_id)
            .options(selectinload(Superbill.line_items))
        )
    ).scalar_one_or_none()
    if not sb:
        # No PHI accessed — audit log intentionally skipped
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # Fetch encounter diagnoses for validation
    enc = (
        await db.execute(
            select(Encounter)
            .where(Encounter.id == encounter_id, Encounter.tenant_id == ctx.tenant_id)
            .options(selectinload(Encounter.diagnoses))
        )
    ).scalar_one_or_none()

    warnings = []
    if enc:
        active_items = [li for li in sb.line_items if not li.is_deleted]
        warnings = validate_cpt_icd_pointers(active_items, list(enc.diagnoses))

    await log_action(
        db, ctx, AuditAction.READ, "superbill", sb.id,
        encounter_id=encounter_id,
        patient_id=sb.patient_id,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return _build_superbill_response(sb, warnings)


# ---------------------------------------------------------------------------
# PATCH /encounters/{encounter_id}/superbill — update status/notes
# ---------------------------------------------------------------------------


@router.patch("/{encounter_id}/superbill", response_model=SuperbillResponse)
async def update_superbill(
    encounter_id: str,
    payload: SuperbillUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Update superbill status or notes."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    sb = await _get_superbill_or_404(encounter_id, ctx.tenant_id, db, load_line_items=True)

    changes: dict = {}
    if payload.claim_status is not None:
        changes["claim_status"] = {"old": sb.claim_status.value, "new": payload.claim_status}
        sb.claim_status = ClaimStatus(payload.claim_status)
    if payload.notes is not None:
        changes["notes"] = {"old": sb.notes, "new": payload.notes}
        sb.notes = payload.notes

    await log_action(
        db, ctx, AuditAction.UPDATE_SUPERBILL, "superbill", sb.id,
        encounter_id=encounter_id,
        patient_id=sb.patient_id,
        detail=f"Updated superbill: {', '.join(changes.keys())}",
        changes=changes,
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()

    # Re-fetch with line items (db.refresh is unsafe in async context — use selectinload)
    sb = (
        await db.execute(
            select(Superbill)
            .where(Superbill.id == sb.id)
            .options(selectinload(Superbill.line_items))
        )
    ).scalar_one()

    return _build_superbill_response(sb)


# ---------------------------------------------------------------------------
# POST /encounters/{encounter_id}/superbill/line-items — add line item
# ---------------------------------------------------------------------------


@router.post(
    "/{encounter_id}/superbill/line-items",
    response_model=LineItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_line_item(
    encounter_id: str,
    payload: LineItemCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Add a CPT line item to an existing superbill."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    sb = await _get_superbill_or_404(encounter_id, ctx.tenant_id, db)

    li = SuperbillLineItem(
        tenant_id=ctx.tenant_id,
        superbill_id=sb.id,
        cpt_code=payload.cpt_code,
        description=payload.description,
        fee=payload.fee,
        units=payload.units,
        diagnosis_pointers=payload.diagnosis_pointers,
        modifiers=payload.modifiers,
    )
    db.add(li)

    # Update total
    sb.total_fee += li.fee * li.units

    await db.flush()

    await log_action(
        db, ctx, AuditAction.UPDATE_SUPERBILL, "superbill_line_item", li.id,
        encounter_id=encounter_id,
        patient_id=sb.patient_id,
        detail=f"Added CPT {li.cpt_code} to superbill",
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()

    return LineItemResponse(
        id=li.id,
        superbill_id=li.superbill_id,
        cpt_code=li.cpt_code,
        description=li.description,
        fee=li.fee,
        units=li.units,
        diagnosis_pointers=li.diagnosis_pointers or [],
        modifiers=li.modifiers or [],
        created_at=li.created_at,
        updated_at=li.updated_at,
    )


# ---------------------------------------------------------------------------
# DELETE /encounters/{encounter_id}/superbill/line-items/{item_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/{encounter_id}/superbill/line-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_line_item(
    encounter_id: str,
    item_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Remove a CPT line item from a superbill."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    sb = await _get_superbill_or_404(encounter_id, ctx.tenant_id, db)

    li = (
        await db.execute(
            select(SuperbillLineItem).where(
                SuperbillLineItem.id == item_id,
                SuperbillLineItem.superbill_id == sb.id,
                SuperbillLineItem.is_deleted == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if not li:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Line item not found")

    # Update total
    sb.total_fee -= li.fee * li.units
    if sb.total_fee < 0:
        sb.total_fee = Decimal("0.00")

    await log_action(
        db, ctx, AuditAction.UPDATE_SUPERBILL, "superbill_line_item", li.id,
        encounter_id=encounter_id,
        patient_id=sb.patient_id,
        detail=f"Removed CPT {li.cpt_code} from superbill",
        ip_address=request.client.host if request.client else None,
    )

    li.is_deleted = True
    li.deleted_at = datetime.now(timezone.utc)
    await db.commit()


# ---------------------------------------------------------------------------
# GET /encounters/{encounter_id}/superbill/mdm — recalculate MDM
# ---------------------------------------------------------------------------


@router.get("/{encounter_id}/superbill/mdm", response_model=MdmCalculationResult)
async def get_mdm_calculation(
    encounter_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Calculate MDM complexity for an encounter (does not persist)."""
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
                selectinload(Encounter.diagnoses),
                selectinload(Encounter.exam_findings),
            )
        )
    ).scalar_one_or_none()

    if not enc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found")

    problems = (
        await db.execute(
            select(PatientProblem).where(
                PatientProblem.patient_id == enc.patient_id,
                PatientProblem.tenant_id == ctx.tenant_id,
                PatientProblem.is_deleted == False,  # noqa: E712
            )
        )
    ).scalars().all()

    return calculate_mdm(
        list(enc.diagnoses),
        list(problems),
        list(enc.exam_findings),
    )


# ---------------------------------------------------------------------------
# GET /encounters/{encounter_id}/superbill/pdf — generate CMS-1500 PDF
# ---------------------------------------------------------------------------


@router.get("/{encounter_id}/superbill/pdf")
async def generate_superbill_pdf(
    encounter_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Generate a CMS-1500 style PDF for a superbill.

    All statuses allowed. Draft superbills receive a diagonal 'DRAFT' watermark.
    Returns binary application/pdf.
    """
    from backend.db.models.tenant.clinical import Patient

    enc_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)

    # Load superbill with line items and payer
    sb_result = await db.execute(
        select(Superbill)
        .where(Superbill.encounter_id == enc_id, Superbill.tenant_id == ctx.tenant_id)
        .options(
            selectinload(Superbill.line_items),
            selectinload(Superbill.billed_payer),
        )
    )
    superbill = sb_result.scalar_one_or_none()
    if not superbill:
        raise HTTPException(status_code=404, detail="Superbill not found")

    is_draft = superbill.claim_status == ClaimStatus.DRAFT

    # Update PDF generation audit trail
    superbill.last_pdf_generated_at = datetime.now(timezone.utc)
    superbill.pdf_generation_count = (superbill.pdf_generation_count or 0) + 1
    await db.flush()

    # Load patient
    patient = (
        await db.execute(
            select(Patient).where(Patient.id == superbill.patient_id, Patient.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()

    # Load encounter
    encounter = (
        await db.execute(
            select(Encounter).where(Encounter.id == enc_id, Encounter.tenant_id == ctx.tenant_id)
        )
    ).scalar_one_or_none()

    pdf_bytes = _build_cms1500_pdf(superbill, patient, encounter, is_draft=is_draft)
    filename = f"{'DRAFT-' if is_draft else ''}claim-{str(enc_id)[:8]}.pdf"

    # Audit log
    staff = await resolve_staff(ctx, db)
    await log_action(
        db, ctx, AuditAction.READ, "superbill", superbill.id,
        staff_id=staff.id if staff else None,
        encounter_id=enc_id,
        patient_id=superbill.patient_id,
        detail=f"Generated PDF (draft={is_draft}, count={superbill.pdf_generation_count})",
        metadata={"is_draft": is_draft, "generation_count": superbill.pdf_generation_count},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# PDF builder helper (private)
# ---------------------------------------------------------------------------


def _build_cms1500_pdf(superbill, patient, encounter, *, is_draft: bool = False) -> bytes:
    """Build a clean professional CMS-1500 style PDF using reportlab."""

    def to_pdf_currency(val) -> str:
        return f"${float(val):,.2f}"

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Heading1"], fontSize=16, spaceAfter=4)
    normal = styles["Normal"]
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=colors.grey)

    story = []

    # 1. Clinic header
    story.append(Paragraph("ClarityOS Clinic", title_style))
    story.append(Paragraph("INSURANCE CLAIM STATEMENT", styles["Heading2"]))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#2DD4BF")))
    story.append(Spacer(1, 0.15 * inch))

    # 2. Claim info
    encounter_date = encounter.created_at.strftime("%m/%d/%Y") if encounter and encounter.created_at else "—"
    story.append(Paragraph(f"<b>Claim ID:</b> {str(superbill.id)[:8].upper()}", normal))
    story.append(Paragraph(f"<b>Date of Service:</b> {encounter_date}", normal))
    status_label = (
        superbill.claim_status.value.replace("_", " ").title()
        if hasattr(superbill.claim_status, "value")
        else str(superbill.claim_status)
    )
    story.append(Paragraph(f"<b>Status:</b> {status_label}", normal))
    story.append(Spacer(1, 0.15 * inch))

    # 3. Two-column: Patient | Payer
    patient_name = f"{patient.first_name} {patient.last_name}" if patient else "Unknown"
    patient_dob = str(patient.dob) if patient and patient.dob else "—"
    payer_name = (
        superbill.billed_payer.name
        if superbill.billed_payer
        else ("Self-Pay" if superbill.is_self_pay else "—")
    )

    two_col_data = [
        ["PATIENT INFORMATION", "INSURANCE / PAYER"],
        [f"Name: {patient_name}", f"Payer: {payer_name}"],
        [f"DOB: {patient_dob}", f"Type: {'Self-Pay' if superbill.is_self_pay else 'Insurance'}"],
    ]
    two_col_table = Table(two_col_data, colWidths=[3.5 * inch, 3.5 * inch])
    two_col_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2DD4BF")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5FFFE")]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(two_col_table)
    story.append(Spacer(1, 0.2 * inch))

    # 4. Service lines table
    active_items = [li for li in superbill.line_items if not getattr(li, "is_deleted", False)]
    svc_headers = ["CPT Code", "Description", "Units", "Fee"]
    svc_rows = []
    total_fee = 0.0
    for li in active_items:
        fee_val = float(li.fee)
        total_fee += fee_val * li.units
        source_note = " *" if getattr(li, "fee_source", "base_rate") == "base_rate" else ""
        svc_rows.append([li.cpt_code, li.description or "—", str(li.units), f"{to_pdf_currency(li.fee)}{source_note}"])

    if svc_rows:
        svc_data = [svc_headers] + svc_rows
        svc_table = Table(svc_data, colWidths=[1 * inch, 4.5 * inch, 0.75 * inch, 0.75 * inch])
        svc_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2DD4BF")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5FFFE")]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ]))
        story.append(Paragraph("<b>SERVICE LINES</b>", styles["Heading3"]))
        story.append(svc_table)
        if any(getattr(li, "fee_source", "base_rate") == "base_rate" for li in active_items):
            story.append(Paragraph("* Base catalog rate (no payer-specific rate on file)", small))
        story.append(Spacer(1, 0.15 * inch))

    # 5. Total
    story.append(Paragraph(f"<b>TOTAL BILLED: {to_pdf_currency(total_fee)}</b>", styles["Heading3"]))
    story.append(Spacer(1, 0.3 * inch))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))

    # 6. Footer
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph("Generated by ClarityOS EHR — This document is for billing purposes only.", small))

    # Build with optional DRAFT watermark
    buffer = BytesIO()

    def add_draft_watermark(canvas_obj, doc_obj):
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica-Bold", 80)
        canvas_obj.setFillColorRGB(0.8, 0.2, 0.2, alpha=0.15)
        canvas_obj.translate(4.25 * inch, 5.5 * inch)
        canvas_obj.rotate(45)
        canvas_obj.drawCentredString(0, 0, "DRAFT")
        canvas_obj.restoreState()

    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
    )

    if is_draft:
        doc.build(story, onFirstPage=add_draft_watermark, onLaterPages=add_draft_watermark)
    else:
        doc.build(story)

    return buffer.getvalue()
