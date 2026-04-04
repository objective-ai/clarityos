"""
api/routes/appointment.py

CRUD endpoints for appointments with status-workflow transitions.

Every query is scoped to ctx.tenant_id for multi-tenant isolation.

Endpoints:
  POST   /                           -- Create appointment
  GET    /                           -- List by date (+ optional provider filter)
  GET    /{appointment_id}           -- Get single appointment
  PATCH  /{appointment_id}           -- Update (SCHEDULED / CONFIRMED only)
  POST   /{appointment_id}/cancel    -- Cancel with required reason
  POST   /{appointment_id}/check-in  -- Transition SCHEDULED/CONFIRMED -> ARRIVED
  POST   /{appointment_id}/revert-check-in -- Revert ARRIVED -> CONFIRMED
  POST   /{appointment_id}/start-exam -- Transition ARRIVED -> IN_PRETEST + create Encounter (pre-test phase)
  POST   /{appointment_id}/start-exam-phase -- Transition IN_PRETEST -> IN_EXAM (doctor starts)
  POST   /{appointment_id}/revert-to-pretest -- Transition IN_EXAM -> IN_PRETEST (back to tech)
  POST   /{appointment_id}/reschedule -- Move to a new time slot
  POST   /{appointment_id}/no-show   -- Mark as no-show (SCHEDULED/CONFIRMED/ARRIVED -> NO_SHOW)
"""

from datetime import date as _date
from datetime import datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import (
    Appointment,
    AppointmentStatus,
    AuditAction,
    Encounter,
    PatientInsurance,
)
from backend.db.session import get_db
from backend.schemas.appointment import (
    AppointmentCancelRequest,
    AppointmentCreateRequest,
    AppointmentListResponse,
    AppointmentRescheduleRequest,
    AppointmentResponse,
    AppointmentUpdateRequest,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper -- map ORM Appointment to response schema
# ---------------------------------------------------------------------------


def _build_appointment_response(
    appt: Appointment,
    patient_name: str | None = None,
    provider_name: str | None = None,
    ins: PatientInsurance | None = None,
) -> AppointmentResponse:
    """Map an ORM Appointment (with eager-loaded relationships) to the schema."""
    if patient_name is None and appt.patient is not None:
        patient_name = appt.patient.full_name
    if provider_name is None and appt.provider is not None:
        provider_name = appt.provider.full_name

    return AppointmentResponse(
        id=appt.id,
        tenant_id=appt.tenant_id,
        patient_id=appt.patient_id,
        provider_id=appt.provider_id,
        booked_by_id=appt.booked_by_id,
        appointment_type=appt.appointment_type,
        status=appt.status,
        start_time=appt.start_time,
        end_time=appt.end_time,
        duration_minutes=appt.duration_minutes,
        chief_complaint=appt.chief_complaint,
        internal_notes=appt.internal_notes,
        cancellation_reason=appt.cancellation_reason,
        reminder_sent_at=appt.reminder_sent_at,
        patient_name=patient_name,
        patient_chart_number=appt.patient.chart_number if appt.patient else None,
        provider_name=provider_name,
        encounter_id=appt.encounter.id if appt.encounter else None,
        encounter_short_id=appt.encounter.short_id if appt.encounter else None,
        intake_status=appt.intake_status,
        triage_flags_jsonb=appt.triage_flags_jsonb,
        insurance_payer_name=ins.payer.name if ins and ins.payer else None,
        insurance_copay=float(ins.copay_amount) if ins and ins.copay_amount else None,
        insurance_eligibility=ins.eligibility_status if ins else None,
        checked_in_at=appt.checked_in_at,
        created_at=appt.created_at,
        updated_at=appt.updated_at,
    )


async def _get_appointment_or_404(
    appointment_id: UUID,
    ctx: TenantContext,
    db: AsyncSession,
) -> Appointment:
    """Fetch an appointment scoped to the tenant, eager-loading patient and provider."""
    stmt = (
        select(Appointment)
        .where(
            Appointment.id == appointment_id,
            Appointment.tenant_id == ctx.tenant_id,
        )
        .options(
            selectinload(Appointment.patient),
            selectinload(Appointment.provider),
            selectinload(Appointment.encounter),
        )
    )
    appt = (await db.execute(stmt)).scalar_one_or_none()
    if appt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found.",
        )
    return appt


# ---------------------------------------------------------------------------
# POST / -- Create appointment
# ---------------------------------------------------------------------------


@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    payload: AppointmentCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_APPOINTMENT)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new appointment. Status defaults to SCHEDULED."""
    staff = await resolve_staff(ctx, db)

    appt = Appointment(
        tenant_id=ctx.tenant_id,
        patient_id=payload.patient_id,
        provider_id=payload.provider_id,
        booked_by_id=staff.id if staff else None,
        appointment_type=payload.appointment_type,
        status=AppointmentStatus.SCHEDULED,
        start_time=payload.start_time,
        end_time=payload.end_time,
        duration_minutes=payload.duration_minutes,
        chief_complaint=payload.chief_complaint,
        internal_notes=payload.internal_notes,
    )
    db.add(appt)
    await db.flush()

    await log_action(
        db,
        ctx,
        AuditAction.CREATE,
        "appointment",
        appt.id,
        staff_id=staff.id if staff else None,
        patient_id=appt.patient_id,
        detail="Created appointment",
        ip_address=request.client.host if request.client else None,
    )

    appt = await _get_appointment_or_404(appt.id, ctx, db)
    return _build_appointment_response(appt)


# ---------------------------------------------------------------------------
# GET / -- List appointments by date (+ optional provider filter)
# ---------------------------------------------------------------------------


@router.get("/", response_model=AppointmentListResponse)
async def list_appointments(
    date: str,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_SCHEDULE)),
    db: AsyncSession = Depends(get_db),
    provider_id: UUID | None = None,
):
    """
    Return all appointments for a given calendar date.

    Query parameters:
      - date (required): ISO date string, e.g. "2026-03-10"
      - provider_id (optional): filter to a single provider schedule

    Results are ordered by start_time ascending.
    """
    try:
        target_date = _date.fromisoformat(date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format. Expected YYYY-MM-DD.",
        )

    # Fetch tenant timezone for proper day boundary calculation
    tenant = (
        await db.execute(select(Tenant).where(Tenant.id == ctx.tenant_id))
    ).scalar_one_or_none()
    tz = ZoneInfo(tenant.timezone) if tenant and tenant.timezone else ZoneInfo("America/Los_Angeles")

    # Calculate day boundaries in clinic-local time, then convert to UTC
    local_start = datetime(target_date.year, target_date.month, target_date.day, 0, 0, 0, tzinfo=tz)
    local_end = local_start + timedelta(days=1)
    day_start = local_start.astimezone(timezone.utc)
    day_end = local_end.astimezone(timezone.utc) - timedelta(seconds=1)

    stmt = (
        select(Appointment)
        .where(
            Appointment.tenant_id == ctx.tenant_id,
            Appointment.start_time >= day_start,
            Appointment.start_time <= day_end,
        )
        .options(
            selectinload(Appointment.patient),
            selectinload(Appointment.provider),
            selectinload(Appointment.encounter),
        )
        .order_by(Appointment.start_time)
    )

    if provider_id is not None:
        stmt = stmt.where(Appointment.provider_id == provider_id)

    result = await db.execute(stmt)
    appointments = result.scalars().all()

    # Batch-fetch primary active insurance for all patients in result (avoids N+1)
    patient_ids = list({a.patient_id for a in appointments})
    if patient_ids:
        ins_stmt = (
            select(PatientInsurance)
            .where(
                PatientInsurance.patient_id.in_(patient_ids),
                PatientInsurance.priority == "primary",
                PatientInsurance.is_active == True,  # noqa: E712
                PatientInsurance.tenant_id == ctx.tenant_id,
            )
            .options(selectinload(PatientInsurance.payer))
        )
        ins_result = await db.execute(ins_stmt)
        ins_by_patient = {ins.patient_id: ins for ins in ins_result.scalars().all()}
    else:
        ins_by_patient = {}

    items = [_build_appointment_response(a, ins=ins_by_patient.get(a.patient_id)) for a in appointments]
    return AppointmentListResponse(
        items=items,
        total=len(items),
        timezone=str(tz),
    )


# ---------------------------------------------------------------------------
# GET /{appointment_id} -- Get single appointment
# ---------------------------------------------------------------------------


@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment(
    appointment_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_SCHEDULE)),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a single appointment by ID, scoped to the tenant."""
    appt = await _get_appointment_or_404(appointment_id, ctx, db)
    await log_action(
        db,
        ctx,
        AuditAction.READ,
        "appointment",
        appt.id,
        patient_id=appt.patient_id,
        ip_address=request.client.host if request.client else None,
    )
    return _build_appointment_response(appt)


# ---------------------------------------------------------------------------
# PATCH /{appointment_id} -- Partial update (pre-check-in only)
# ---------------------------------------------------------------------------


@router.patch("/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(
    appointment_id: UUID,
    payload: AppointmentUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_APPOINTMENT)),
    db: AsyncSession = Depends(get_db),
):
    """
    Update scheduling details of an appointment.

    Only permitted when status is SCHEDULED or CONFIRMED. After check-in
    (ARRIVED and beyond), the appointment is locked for edits.
    """
    appt = await _get_appointment_or_404(appointment_id, ctx, db)

    editable_statuses = {AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED}
    if appt.status not in editable_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot update appointment with status '{appt.status.value}'. "
                "Updates are only allowed for SCHEDULED or CONFIRMED appointments."
            ),
        )

    updates = payload.model_dump(exclude_unset=True, exclude={"end_time"})

    new_start = updates.get("start_time", appt.start_time)
    new_duration = updates.get("duration_minutes", appt.duration_minutes)
    if "start_time" in updates or "duration_minutes" in updates:
        if new_start.tzinfo is None:
            new_start = new_start.replace(tzinfo=timezone.utc)
        updates["end_time"] = new_start + timedelta(minutes=new_duration)

    for key, value in updates.items():
        setattr(appt, key, value)

    await log_action(
        db,
        ctx,
        AuditAction.UPDATE,
        "appointment",
        appt.id,
        patient_id=appt.patient_id,
        detail=f"Updated fields: {', '.join(updates.keys())}",
        ip_address=request.client.host if request.client else None,
    )

    await db.flush()
    appt = await _get_appointment_or_404(appt.id, ctx, db)
    return _build_appointment_response(appt)


# ---------------------------------------------------------------------------
# POST /{appointment_id}/cancel -- Cancel with required reason
# ---------------------------------------------------------------------------


@router.post("/{appointment_id}/cancel", response_model=AppointmentResponse)
async def cancel_appointment(
    appointment_id: UUID,
    payload: AppointmentCancelRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_APPOINTMENT)),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an appointment. A cancellation_reason is required (min 3 chars)."""
    appt = await _get_appointment_or_404(appointment_id, ctx, db)

    terminal_statuses = {AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED}
    if appt.status in terminal_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Appointment is already {appt.status.value} and cannot be cancelled.",
        )

    appt.status = AppointmentStatus.CANCELLED
    appt.cancellation_reason = payload.cancellation_reason

    await log_action(
        db,
        ctx,
        AuditAction.CANCEL_APPOINTMENT,
        "appointment",
        appt.id,
        patient_id=appt.patient_id,
        detail=f"Cancelled: {payload.cancellation_reason}",
        ip_address=request.client.host if request.client else None,
    )

    await db.flush()
    appt = await _get_appointment_or_404(appt.id, ctx, db)
    return _build_appointment_response(appt)


# ---------------------------------------------------------------------------
# POST /{appointment_id}/check-in -- SCHEDULED/CONFIRMED -> ARRIVED
# ---------------------------------------------------------------------------


@router.post("/{appointment_id}/check-in", response_model=AppointmentResponse)
async def check_in_patient(
    appointment_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CHECK_IN_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """
    Check in a patient at the front desk.

    Transitions status: SCHEDULED or CONFIRMED -> ARRIVED.
    Returns 409 if the appointment is not in a check-in-eligible state.
    """
    appt = await _get_appointment_or_404(appointment_id, ctx, db)

    check_in_eligible = {AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED}
    if appt.status not in check_in_eligible:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot check in appointment with status '{appt.status.value}'. "
                "Check-in is only available for SCHEDULED or CONFIRMED appointments."
            ),
        )

    appt.status = AppointmentStatus.ARRIVED
    if appt.checked_in_at is None:
        appt.checked_in_at = datetime.now(timezone.utc)

    await log_action(
        db,
        ctx,
        AuditAction.CHECK_IN,
        "appointment",
        appt.id,
        patient_id=appt.patient_id,
        detail="Patient checked in at front desk",
        ip_address=request.client.host if request.client else None,
    )

    await db.flush()
    appt = await _get_appointment_or_404(appt.id, ctx, db)
    return _build_appointment_response(appt)


# ---------------------------------------------------------------------------
# POST /{appointment_id}/start-exam -- ARRIVED -> IN_PRETEST + create Encounter
# ---------------------------------------------------------------------------


@router.post("/{appointment_id}/start-exam", status_code=status.HTTP_201_CREATED)
async def start_exam(
    appointment_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.START_EXAM)),
    db: AsyncSession = Depends(get_db),
):
    """
    Start the pre-test phase for a checked-in patient.

    - Validates the appointment is in ARRIVED status (else 409 Conflict).
    - If an Encounter already exists for this appointment, returns it
      with already_existed=True (idempotent -- HTTP 200).
    - Otherwise creates a new Encounter linked via appointment_id FK,
      transitions appointment to IN_PRETEST (technician phase), returns encounter_id (HTTP 201).
    - Doctor transitions to IN_EXAM via the separate /start-exam-phase endpoint.

    Response: { "encounter_id": "<uuid>", "already_existed": <bool> }
    """
    appt = await _get_appointment_or_404(appointment_id, ctx, db)

    if appt.status != AppointmentStatus.ARRIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Patient must be checked in first. "
                f"Current status: '{appt.status.value}'. "
                "Expected: 'arrived'."
            ),
        )

    # Idempotency guard -- check for pre-existing encounter.
    existing_enc = (
        await db.execute(
            select(Encounter).where(
                Encounter.appointment_id == appt.id,
                Encounter.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if existing_enc is not None:
        # Ensure consistent state: appointment must be IN_PRETEST when encounter exists.
        # If it's still ARRIVED (e.g. idempotent re-call or legacy data), transition it.
        if appt.status == AppointmentStatus.ARRIVED:
            appt.status = AppointmentStatus.IN_PRETEST
            await db.flush()

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "encounter_id": str(existing_enc.id),
                "encounter_short_id": existing_enc.short_id,
                "already_existed": True,
            },
        )

    staff = await resolve_staff(ctx, db)

    enc = Encounter(
        tenant_id=ctx.tenant_id,
        patient_id=appt.patient_id,
        provider_id=appt.provider_id,
        appointment_id=appt.id,
        encounter_date=datetime.now(timezone.utc).date(),
        chief_complaint=appt.chief_complaint,
    )
    db.add(enc)

    appt.status = AppointmentStatus.IN_PRETEST

    await db.flush()

    await log_action(
        db,
        ctx,
        AuditAction.START_EXAM,
        "appointment",
        appt.id,
        staff_id=staff.id if staff else None,
        encounter_id=enc.id,
        patient_id=appt.patient_id,
        detail=f"Pre-test started -- encounter {enc.id} created",
        changes={"encounter_id": str(enc.id)},
        ip_address=request.client.host if request.client else None,
    )

    return {"encounter_id": str(enc.id), "encounter_short_id": enc.short_id, "already_existed": False}


# ---------------------------------------------------------------------------
# POST /{appointment_id}/start-exam-phase -- IN_PRETEST -> IN_EXAM
# ---------------------------------------------------------------------------


@router.post("/{appointment_id}/start-exam-phase", response_model=AppointmentResponse)
async def start_exam_phase(
    appointment_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.START_EXAM)),
    db: AsyncSession = Depends(get_db),
):
    """
    Transition from technician pre-test phase to active doctor exam.

    Transitions status: IN_PRETEST -> IN_EXAM.
    Called when the doctor clicks "Start Exam →" in the encounter page bottom bar.
    Returns 409 if the appointment is not in IN_PRETEST status.
    """
    appt = await _get_appointment_or_404(appointment_id, ctx, db)

    if appt.status != AppointmentStatus.IN_PRETEST:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Expected in_pretest status. "
                f"Current status: '{appt.status.value}'."
            ),
        )

    appt.status = AppointmentStatus.IN_EXAM

    await log_action(
        db,
        ctx,
        AuditAction.START_EXAM_PHASE,
        "appointment",
        appt.id,
        patient_id=appt.patient_id,
        detail="Doctor started exam phase",
        ip_address=request.client.host if request.client else None,
    )

    await db.flush()
    appt = await _get_appointment_or_404(appt.id, ctx, db)
    return _build_appointment_response(appt)


# ---------------------------------------------------------------------------
# POST /{appointment_id}/revert-to-pretest -- IN_EXAM -> IN_PRETEST
# ---------------------------------------------------------------------------


@router.post("/{appointment_id}/revert-to-pretest", response_model=AppointmentResponse)
async def revert_to_pretest(
    appointment_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.START_EXAM)),
    db: AsyncSession = Depends(get_db),
):
    """
    Revert an active exam back to the pre-test phase.

    Transitions status: IN_EXAM -> IN_PRETEST.
    Called when the doctor clicks the "Pre-Test" step in the encounter bottom bar.
    Returns 409 if the appointment is not in IN_EXAM status.
    """
    appt = await _get_appointment_or_404(appointment_id, ctx, db)

    if appt.status != AppointmentStatus.IN_EXAM:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Expected in_exam status. "
                f"Current status: '{appt.status.value}'."
            ),
        )

    appt.status = AppointmentStatus.IN_PRETEST

    await log_action(
        db,
        ctx,
        AuditAction.REVERT_TO_PRETEST,
        "appointment",
        appt.id,
        patient_id=appt.patient_id,
        detail="Reverted from exam to pre-test",
        ip_address=request.client.host if request.client else None,
    )

    await db.flush()
    appt = await _get_appointment_or_404(appt.id, ctx, db)
    return _build_appointment_response(appt)


# ---------------------------------------------------------------------------
# POST /{appointment_id}/revert-check-in -- ARRIVED -> CONFIRMED
# ---------------------------------------------------------------------------


@router.post("/{appointment_id}/revert-check-in", response_model=AppointmentResponse)
async def revert_check_in(
    appointment_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.CHECK_IN_PATIENT)),
    db: AsyncSession = Depends(get_db),
):
    """
    Undo an accidental check-in.

    Transitions status: ARRIVED -> CONFIRMED.
    Returns 409 if the appointment is not in ARRIVED status.
    """
    appt = await _get_appointment_or_404(appointment_id, ctx, db)

    if appt.status != AppointmentStatus.ARRIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot revert check-in for appointment with status '{appt.status.value}'. "
                "Only ARRIVED appointments can be reverted."
            ),
        )

    appt.status = AppointmentStatus.CONFIRMED

    await log_action(
        db,
        ctx,
        AuditAction.REVERT_CHECK_IN,
        "appointment",
        appt.id,
        patient_id=appt.patient_id,
        detail="Reverted check-in — patient returned to confirmed",
        ip_address=request.client.host if request.client else None,
    )

    await db.flush()
    appt = await _get_appointment_or_404(appt.id, ctx, db)
    return _build_appointment_response(appt)


# ---------------------------------------------------------------------------
# POST /{appointment_id}/no-show -- SCHEDULED/CONFIRMED/ARRIVED -> NO_SHOW
# ---------------------------------------------------------------------------


@router.post("/{appointment_id}/no-show", response_model=AppointmentResponse)
async def mark_no_show(
    appointment_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_APPOINTMENT)),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark a patient as a no-show.

    Transitions status: SCHEDULED, CONFIRMED, or ARRIVED -> NO_SHOW.
    Returns 409 if the appointment is not in a no-show-eligible state.
    """
    appt = await _get_appointment_or_404(appointment_id, ctx, db)

    no_show_eligible = {
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.ARRIVED,
    }
    if appt.status not in no_show_eligible:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot mark no-show for appointment with status '{appt.status.value}'. "
                "Only SCHEDULED, CONFIRMED, or ARRIVED appointments can be marked as no-show."
            ),
        )

    appt.status = AppointmentStatus.NO_SHOW

    await log_action(
        db,
        ctx,
        AuditAction.NO_SHOW,
        "appointment",
        appt.id,
        patient_id=appt.patient_id,
        detail="Patient marked as no-show",
        ip_address=request.client.host if request.client else None,
    )

    await db.flush()
    appt = await _get_appointment_or_404(appt.id, ctx, db)
    return _build_appointment_response(appt)


# ---------------------------------------------------------------------------
# POST /{appointment_id}/reschedule -- Move to a new time slot
# ---------------------------------------------------------------------------


@router.post("/{appointment_id}/reschedule", response_model=AppointmentResponse)
async def reschedule_appointment(
    appointment_id: UUID,
    payload: AppointmentRescheduleRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_APPOINTMENT)),
    db: AsyncSession = Depends(get_db),
):
    """
    Reschedule an appointment to a new time slot.

    Allowed from: SCHEDULED, CONFIRMED, ARRIVED.
    If the patient was already checked in (ARRIVED), status reverts to CONFIRMED.
    """
    appt = await _get_appointment_or_404(appointment_id, ctx, db)

    reschedulable = {
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.ARRIVED,
    }
    if appt.status not in reschedulable:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot reschedule appointment with status '{appt.status.value}'. "
                "Only scheduled, confirmed, or arrived appointments can be rescheduled."
            ),
        )

    old_start = appt.start_time
    new_start = payload.new_start_time
    if new_start.tzinfo is None:
        new_start = new_start.replace(tzinfo=timezone.utc)

    new_duration = payload.new_duration_minutes or appt.duration_minutes

    appt.start_time = new_start
    appt.end_time = new_start + timedelta(minutes=new_duration)
    appt.duration_minutes = new_duration

    # If patient was checked in, revert to confirmed
    if appt.status == AppointmentStatus.ARRIVED:
        appt.status = AppointmentStatus.CONFIRMED

    await log_action(
        db,
        ctx,
        AuditAction.RESCHEDULE,
        "appointment",
        appt.id,
        patient_id=appt.patient_id,
        detail=f"Rescheduled from {old_start.isoformat()} to {new_start.isoformat()}",
        ip_address=request.client.host if request.client else None,
    )

    await db.flush()
    appt = await _get_appointment_or_404(appt.id, ctx, db)
    return _build_appointment_response(appt)
