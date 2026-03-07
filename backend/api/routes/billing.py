"""
api/routes/billing.py

CRUD endpoints for superbills and billing operations.
Includes MDM complexity calculation and CPT-ICD pointer validation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
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
    Diagnosis,
    Encounter,
    ExamFindings,
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

router = APIRouter()


# ---------------------------------------------------------------------------
# Common optometry CPT codes with default fees
# ---------------------------------------------------------------------------

CPT_CATALOG: dict[str, dict] = {
    "92004": {"description": "Comprehensive new patient eye exam", "fee": Decimal("250.00")},
    "92014": {"description": "Comprehensive established patient eye exam", "fee": Decimal("175.00")},
    "92002": {"description": "Intermediate new patient eye exam", "fee": Decimal("150.00")},
    "92012": {"description": "Intermediate established patient eye exam", "fee": Decimal("100.00")},
    "99213": {"description": "Office visit E&M Level 3 (straightforward MDM)", "fee": Decimal("110.00")},
    "99214": {"description": "Office visit E&M Level 4 (moderate MDM)", "fee": Decimal("165.00")},
    "99215": {"description": "Office visit E&M Level 5 (high MDM)", "fee": Decimal("225.00")},
    "92015": {"description": "Refraction", "fee": Decimal("45.00")},
    "92083": {"description": "Visual field test", "fee": Decimal("85.00")},
    "92250": {"description": "Fundus photography", "fee": Decimal("65.00")},
    "92134": {"description": "OCT retina scan", "fee": Decimal("75.00")},
}


# ---------------------------------------------------------------------------
# MDM Complexity Calculator
# ---------------------------------------------------------------------------


def calculate_mdm(
    diagnoses: list[Diagnosis],
    problems: list[PatientProblem],
    exam_findings: list[ExamFindings],
) -> MdmCalculationResult:
    """Calculate Medical Decision Making complexity from clinical data.

    Uses the 2021 E&M guidelines framework:
    1. Number and Complexity of Problems Addressed
    2. Amount and/or Complexity of Data Reviewed
    3. Risk of Complications and/or Morbidity
    """
    # --- 1. Problem complexity ---
    problem_points = 0
    active_dx = [dx for dx in diagnoses if not dx.is_deleted and dx.status == "active"]
    chronic_dx = [dx for dx in diagnoses if not dx.is_deleted and dx.status == "chronic"]
    active_problems = [p for p in problems if p.status == "active" and not p.is_deleted]

    # Self-limited problems: 1 point each
    # Stable chronic: 2 points each
    # Chronic with exacerbation: 3 points each
    # New problem needing workup: 3 points
    # Acute life-threatening: 4 points

    for dx in active_dx:
        severity = (dx.severity or "").lower()
        if severity in ("severe", "acute"):
            problem_points += 3
        elif severity in ("moderate",):
            problem_points += 2
        else:
            problem_points += 1

    for dx in chronic_dx:
        severity = (dx.severity or "").lower()
        if severity in ("severe", "exacerbation", "worsening"):
            problem_points += 3
        else:
            problem_points += 2

    for p in active_problems:
        severity = (p.severity or "").lower()
        if severity in ("severe", "exacerbation"):
            problem_points += 3
        else:
            problem_points += 1

    # --- 2. Data complexity ---
    data_points = 0
    # Each exam section reviewed = 1 point
    data_points += len(exam_findings)
    # Each diagnosis with notes = additional data reviewed
    data_points += sum(1 for dx in active_dx if dx.notes)

    # --- 3. Risk assessment ---
    risk_keywords_high = {"glaucoma", "retinal detachment", "macular degeneration",
                          "diabetic retinopathy", "papilledema", "optic neuritis"}
    risk_keywords_moderate = {"cataract", "dry eye", "blepharitis", "conjunctivitis",
                              "keratoconus", "uveitis", "iritis"}

    all_descriptions = " ".join(
        (dx.description or "").lower() for dx in active_dx + chronic_dx
    )
    all_problem_desc = " ".join(
        (p.description or "").lower() for p in active_problems
    )
    combined_text = all_descriptions + " " + all_problem_desc

    risk_level = "minimal"
    if any(kw in combined_text for kw in risk_keywords_high):
        risk_level = "high"
    elif any(kw in combined_text for kw in risk_keywords_moderate):
        risk_level = "moderate"
    elif problem_points >= 2:
        risk_level = "low"

    # --- Determine MDM level ---
    # Using the "two of three" rule:
    # Must meet at least 2 of 3 criteria for a given level

    scores = {"problems": 0, "data": 0, "risk": 0}

    # Problem scoring
    if problem_points >= 4:
        scores["problems"] = 4  # High
    elif problem_points >= 3:
        scores["problems"] = 3  # Moderate
    elif problem_points >= 2:
        scores["problems"] = 2  # Low
    else:
        scores["problems"] = 1  # Straightforward

    # Data scoring
    if data_points >= 4:
        scores["data"] = 4
    elif data_points >= 3:
        scores["data"] = 3
    elif data_points >= 2:
        scores["data"] = 2
    else:
        scores["data"] = 1

    # Risk scoring
    risk_map = {"high": 4, "moderate": 3, "low": 2, "minimal": 1}
    scores["risk"] = risk_map.get(risk_level, 1)

    # Two of three rule — take the second-highest score
    sorted_scores = sorted(scores.values(), reverse=True)
    mdm_score = sorted_scores[1]  # Second highest determines level

    if mdm_score >= 4:
        mdm_level = "high"
        em_code = "99215"
    elif mdm_score >= 3:
        mdm_level = "moderate"
        em_code = "99214"
    else:
        mdm_level = "straightforward"
        em_code = "99213"

    # Build reasoning
    parts = []
    parts.append(
        f"Problems addressed: {len(active_dx)} active diagnoses, "
        f"{len(chronic_dx)} chronic conditions, "
        f"{len(active_problems)} active problems ({problem_points} complexity points)."
    )
    parts.append(
        f"Data reviewed: {len(exam_findings)} exam sections, "
        f"{data_points} total data points."
    )
    parts.append(f"Risk level: {risk_level}.")
    parts.append(
        f"MDM level: {mdm_level} (2-of-3 rule: "
        f"problems={scores['problems']}, data={scores['data']}, risk={scores['risk']})."
    )

    return MdmCalculationResult(
        mdm_level=mdm_level,
        suggested_em_code=em_code,
        reasoning=" ".join(parts),
        problem_points=problem_points,
        data_points=data_points,
        risk_level=risk_level,
    )


# ---------------------------------------------------------------------------
# CPT-ICD Pointer Validation
# ---------------------------------------------------------------------------


def validate_cpt_icd_pointers(
    line_items: list[SuperbillLineItem],
    diagnoses: list[Diagnosis],
) -> list[CptIcdWarning]:
    """Check that every CPT code has at least one supporting diagnosis pointer."""
    warnings: list[CptIcdWarning] = []
    active_icd_codes = {
        dx.icd10_code for dx in diagnoses if not dx.is_deleted
    }

    for item in line_items:
        if not item.diagnosis_pointers:
            warnings.append(CptIcdWarning(
                cpt_code=item.cpt_code,
                description=item.description,
                warning=f"CPT {item.cpt_code} has no diagnosis pointer. "
                        "A supporting ICD-10 code is required for claim submission.",
            ))
        else:
            # Check that referenced ICD codes actually exist on the encounter
            missing = [
                code for code in item.diagnosis_pointers
                if code not in active_icd_codes
            ]
            if missing:
                warnings.append(CptIcdWarning(
                    cpt_code=item.cpt_code,
                    description=item.description,
                    warning=f"CPT {item.cpt_code} references ICD-10 codes not on this encounter: "
                            f"{', '.join(missing)}.",
                ))

    return warnings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _suggest_line_items(
    diagnoses: list[Diagnosis],
    has_refraction: bool,
    mdm_result: MdmCalculationResult,
) -> list[dict]:
    """Auto-suggest CPT line items based on encounter data."""
    items: list[dict] = []
    active_dx = [dx for dx in diagnoses if not dx.is_deleted]
    icd_codes = [dx.icd10_code for dx in active_dx]

    # Add suggested E&M code from MDM calculation
    em_code = mdm_result.suggested_em_code
    if em_code in CPT_CATALOG:
        items.append({
            "cpt_code": em_code,
            "description": CPT_CATALOG[em_code]["description"],
            "fee": CPT_CATALOG[em_code]["fee"],
            "units": 1,
            "diagnosis_pointers": icd_codes[:4],  # CMS allows max 4 pointers per line
            "modifiers": [],
        })

    # Add comprehensive exam code if multiple diagnoses
    if len(active_dx) >= 2:
        exam_code = "92014"  # Established patient comprehensive
        if exam_code in CPT_CATALOG and not any(i["cpt_code"] == exam_code for i in items):
            items.append({
                "cpt_code": exam_code,
                "description": CPT_CATALOG[exam_code]["description"],
                "fee": CPT_CATALOG[exam_code]["fee"],
                "units": 1,
                "diagnosis_pointers": icd_codes[:4],
                "modifiers": [],
            })

    # Add refraction if performed
    if has_refraction:
        items.append({
            "cpt_code": "92015",
            "description": CPT_CATALOG["92015"]["description"],
            "fee": CPT_CATALOG["92015"]["fee"],
            "units": 1,
            "diagnosis_pointers": icd_codes[:4],
            "modifiers": [],
        })

    return items


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
    )
    db.add(sb)
    await db.flush()

    # Add line items — use provided or auto-suggest
    if payload.line_items:
        raw_items = [li.model_dump() for li in payload.line_items]
    else:
        has_refraction = len(enc.refractions) > 0
        raw_items = _suggest_line_items(
            list(enc.diagnoses), has_refraction, mdm_result
        )

    total_fee = Decimal("0.00")
    for item_data in raw_items:
        li = SuperbillLineItem(
            tenant_id=ctx.tenant_id,
            superbill_id=sb.id,
            cpt_code=item_data["cpt_code"],
            description=item_data["description"],
            fee=Decimal(str(item_data["fee"])),
            units=item_data["units"],
            diagnosis_pointers=item_data["diagnosis_pointers"],
            modifiers=item_data.get("modifiers", []),
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

    # Reload with line items
    await db.refresh(sb, attribute_names=["line_items"])

    # Validate pointers
    active_items = [li for li in sb.line_items if not li.is_deleted]
    warnings = validate_cpt_icd_pointers(active_items, diagnoses_snapshot)

    return _build_superbill_response(sb, warnings)


# ---------------------------------------------------------------------------
# GET /encounters/{encounter_id}/superbill — read
# ---------------------------------------------------------------------------


@router.get("/{encounter_id}/superbill", response_model=SuperbillResponse)
async def get_superbill(
    encounter_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the superbill for an encounter."""
    encounter_id = await resolve_encounter_id(encounter_id, ctx.tenant_id, db)
    stmt = (
        select(Superbill)
        .where(
            Superbill.encounter_id == encounter_id,
            Superbill.tenant_id == ctx.tenant_id,
        )
        .options(selectinload(Superbill.line_items))
    )
    sb = (await db.execute(stmt)).scalar_one_or_none()

    if not sb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Superbill not found")

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
    sb = (
        await db.execute(
            select(Superbill)
            .where(
                Superbill.encounter_id == encounter_id,
                Superbill.tenant_id == ctx.tenant_id,
            )
            .options(selectinload(Superbill.line_items))
        )
    ).scalar_one_or_none()

    if not sb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Superbill not found")

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
    await db.refresh(sb, attribute_names=["line_items"])

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
    sb = (
        await db.execute(
            select(Superbill).where(
                Superbill.encounter_id == encounter_id,
                Superbill.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not sb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Superbill not found")

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
    sb = (
        await db.execute(
            select(Superbill).where(
                Superbill.encounter_id == encounter_id,
                Superbill.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not sb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Superbill not found")

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
