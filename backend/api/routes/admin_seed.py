"""
api/routes/admin_seed.py

On-demand demo seed endpoint for the Admin panel.

Creates a fully-populated appointment + encounter + optical + billing record
for today's date to demonstrate the full clinical workflow.

Repeated calls replace the previous demo data (tagged internal_notes="DEMO_SEED").
"""

from __future__ import annotations

import datetime
import secrets
import uuid
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
    Diagnosis,
    Encounter,
    ExamFindings,
    EyeAffected,
    Patient,
    Refraction,
    RefractionType,
    Staff,
    Superbill,
    VitalsAndPretest,
)
from backend.db.models.tenant.intake import IntakeToken  # noqa: F401 — needed for mapper
from backend.db.session import get_db

router = APIRouter()

DEMO_MARKER = "DEMO_SEED"
SCHEDULE_MARKER = "SCHEDULE_SEED"

# Realistic schedule: (hour, minute, duration, type, status, chief_complaint)
SCHEDULE_TEMPLATE = [
    (8, 0, 45, AppointmentType.COMPREHENSIVE_EXAM, AppointmentStatus.COMPLETED,
     "Annual comprehensive exam — diabetic patient"),
    (8, 30, 30, AppointmentType.FOLLOW_UP, AppointmentStatus.COMPLETED,
     "Glaucoma follow-up — IOP check"),
    (9, 0, 45, AppointmentType.COMPREHENSIVE_EXAM, AppointmentStatus.ARRIVED,
     "First comprehensive eye exam"),
    (9, 30, 30, AppointmentType.CONTACT_LENS_EXAM, AppointmentStatus.IN_PRETEST,
     "Contact lens refit — progressive astigmatism"),
    (10, 0, 45, AppointmentType.COMPREHENSIVE_EXAM, AppointmentStatus.IN_EXAM,
     "Post-LASIK annual, presbyopia worsening"),
    (10, 30, 30, AppointmentType.FOLLOW_UP, AppointmentStatus.CONFIRMED,
     "Diabetic retinopathy monitoring — annual dilated exam"),
    (11, 0, 45, AppointmentType.COMPREHENSIVE_EXAM, AppointmentStatus.SCHEDULED,
     "Digital eye strain, headaches with screen use"),
    (13, 0, 45, AppointmentType.PEDIATRIC_EXAM, AppointmentStatus.SCHEDULED,
     "Progressive myopia management — 11yo"),
    (13, 30, 30, AppointmentType.FOLLOW_UP, AppointmentStatus.SCHEDULED,
     "Dry eye follow-up — punctal plug eval"),
    (14, 0, 20, AppointmentType.FOLLOW_UP, AppointmentStatus.SCHEDULED,
     "Glasses adjustment, vision check"),
    (14, 30, 45, AppointmentType.COMPREHENSIVE_EXAM, AppointmentStatus.SCHEDULED,
     "New patient — blurry vision at distance"),
    (15, 0, 30, AppointmentType.URGENT_CARE, AppointmentStatus.SCHEDULED,
     "Red eye, foreign body sensation since yesterday"),
]


async def _get_clinic_tz(db: AsyncSession, tenant_id: uuid.UUID) -> ZoneInfo:
    """Resolve the clinic's timezone from the tenant record."""
    result = await db.execute(select(Tenant.timezone).where(Tenant.id == tenant_id))
    tz_str = result.scalar_one_or_none()
    return ZoneInfo(tz_str or "America/Los_Angeles")


async def _cleanup_existing_demo(
    db: AsyncSession, tenant_id: uuid.UUID, today: datetime.date, clinic_tz: ZoneInfo
) -> int:
    """Delete any existing DEMO_SEED appointments for today. Returns count deleted."""
    day_start = datetime.datetime(
        today.year, today.month, today.day, 0, 0, 0, tzinfo=clinic_tz
    ).astimezone(datetime.timezone.utc)
    day_end = (
        datetime.datetime(
            today.year, today.month, today.day, 23, 59, 59, tzinfo=clinic_tz
        )
    ).astimezone(datetime.timezone.utc)

    # Find demo appointments
    stmt = select(Appointment).where(
        Appointment.tenant_id == tenant_id,
        Appointment.internal_notes == DEMO_MARKER,
        Appointment.start_time >= day_start,
        Appointment.start_time <= day_end,
    )
    result = await db.execute(stmt)
    demo_appts = result.scalars().all()

    if not demo_appts:
        return 0

    for appt in demo_appts:
        # Find encounter linked to this appointment
        enc_result = await db.execute(
            select(Encounter).where(
                Encounter.appointment_id == appt.id,
                Encounter.tenant_id == tenant_id,
            )
        )
        enc = enc_result.scalar_one_or_none()

        if enc:
            # Delete superbill (and its line items via cascade)
            await db.execute(
                delete(Superbill).where(
                    Superbill.encounter_id == enc.id,
                    Superbill.tenant_id == tenant_id,
                )
            )
            # Delete encounter (cascades to vitals, refractions, findings, diagnoses)
            await db.execute(
                delete(Encounter).where(
                    Encounter.id == enc.id,
                    Encounter.tenant_id == tenant_id,
                )
            )

        # Delete the appointment
        await db.execute(
            delete(Appointment).where(
                Appointment.id == appt.id,
                Appointment.tenant_id == tenant_id,
            )
        )

    await db.flush()
    return len(demo_appts)


def _dt(
    date: datetime.date, hour: int, minute: int, tz: ZoneInfo
) -> datetime.datetime:
    """Build UTC datetime from local clinic time."""
    local = datetime.datetime(date.year, date.month, date.day, hour, minute, 0, tzinfo=tz)
    return local.astimezone(datetime.timezone.utc)


@router.post("/seed-schedule/")
async def seed_schedule(
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """Seed a realistic day's schedule with 12 appointments across multiple patients.

    Replaces any existing schedule seed data tagged with SCHEDULE_SEED.
    Distributes appointments across available providers and patients.
    """
    staff = await resolve_staff(ctx, db)
    if not staff:
        raise HTTPException(status_code=403, detail="No active staff record found.")

    clinic_tz = await _get_clinic_tz(db, ctx.tenant_id)
    today = datetime.datetime.now(clinic_tz).date()

    # Get all patients
    patient_result = await db.execute(
        select(Patient)
        .where(Patient.tenant_id == ctx.tenant_id)
        .order_by(Patient.last_name)
    )
    patients = patient_result.scalars().all()
    if len(patients) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 patients to seed a schedule.")

    # Get all providers (doctors)
    provider_result = await db.execute(
        select(Staff).where(
            Staff.tenant_id == ctx.tenant_id,
            Staff.role.in_(["doctor", "owner"]),
            Staff.is_active == True,  # noqa: E712
        )
    )
    providers = provider_result.scalars().all()
    if not providers:
        providers = [staff]  # Fallback to current staff

    # Clean up previous schedule seed
    day_start = datetime.datetime(
        today.year, today.month, today.day, 0, 0, 0, tzinfo=clinic_tz
    ).astimezone(datetime.timezone.utc)
    day_end = datetime.datetime(
        today.year, today.month, today.day, 23, 59, 59, tzinfo=clinic_tz
    ).astimezone(datetime.timezone.utc)

    old_result = await db.execute(
        select(Appointment).where(
            Appointment.tenant_id == ctx.tenant_id,
            Appointment.internal_notes == SCHEDULE_MARKER,
            Appointment.start_time >= day_start,
            Appointment.start_time <= day_end,
        )
    )
    old_appts = old_result.scalars().all()
    for appt in old_appts:
        await db.execute(
            delete(Appointment).where(
                Appointment.id == appt.id,
                Appointment.tenant_id == ctx.tenant_id,
            )
        )
    await db.flush()

    # Create appointments from template
    created = 0
    for i, (hour, minute, duration, appt_type, status, complaint) in enumerate(SCHEDULE_TEMPLATE):
        patient = patients[i % len(patients)]
        provider = providers[i % len(providers)]

        appt = Appointment(
            id=uuid.uuid4(),
            tenant_id=ctx.tenant_id,
            patient_id=patient.id,
            provider_id=provider.id,
            booked_by_id=staff.id,
            appointment_type=appt_type,
            status=status,
            start_time=_dt(today, hour, minute, clinic_tz),
            end_time=_dt(today, hour, minute, clinic_tz) + datetime.timedelta(minutes=duration),
            duration_minutes=duration,
            chief_complaint=complaint,
            internal_notes=SCHEDULE_MARKER,
            intake_status="submitted" if status in (
                AppointmentStatus.COMPLETED, AppointmentStatus.ARRIVED,
                AppointmentStatus.IN_PRETEST, AppointmentStatus.IN_EXAM,
            ) else "pending",
        )
        db.add(appt)
        created += 1

    await db.flush()

    return {
        "status": "ok",
        "message": f"Schedule seeded for {today.isoformat()} — {created} appointments",
        "replaced": len(old_appts),
        "created": created,
    }


@router.post("/seed-demo/")
async def seed_demo(
    patient_id: uuid.UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """Create a fully-populated demo appointment for today.

    Accepts patient_id as a query parameter.
    Replaces any existing demo data tagged with DEMO_SEED.
    Creates: appointment, encounter (open/unfinalized), vitals, 4 refractions,
    2 exam findings, 3 diagnoses. No superbill — created on finalize.
    """
    # Resolve staff identity
    staff = await resolve_staff(ctx, db)
    if not staff:
        raise HTTPException(status_code=403, detail="No active staff record found.")

    clinic_tz = await _get_clinic_tz(db, ctx.tenant_id)
    today = datetime.datetime.now(clinic_tz).date()

    # Verify the selected patient belongs to this tenant
    patient = await db.get(Patient, patient_id)
    if not patient or patient.tenant_id != ctx.tenant_id:
        raise HTTPException(
            status_code=404,
            detail="Selected patient not found in this clinic.",
        )

    # Clean up previous demo data
    deleted_count = await _cleanup_existing_demo(db, ctx.tenant_id, today, clinic_tz)

    # --- Create appointment ---
    appt_id = uuid.uuid4()
    appt = Appointment(
        id=appt_id,
        tenant_id=ctx.tenant_id,
        patient_id=patient.id,
        provider_id=staff.id,
        appointment_type=AppointmentType.COMPREHENSIVE_EXAM,
        status=AppointmentStatus.IN_EXAM,
        start_time=_dt(today, 10, 0, clinic_tz),
        end_time=_dt(today, 10, 30, clinic_tz),
        duration_minutes=30,
        chief_complaint="Blurry vision at near, updated Rx needed",
        internal_notes=DEMO_MARKER,
    )
    db.add(appt)
    await db.flush()

    # --- Create encounter (open — user finalizes to demo AI Scribe → Optical → Billing) ---
    enc_id = uuid.uuid4()
    enc = Encounter(
        id=enc_id,
        short_id=secrets.token_urlsafe(6),
        tenant_id=ctx.tenant_id,
        patient_id=patient.id,
        provider_id=staff.id,
        appointment_id=appt_id,
        encounter_date=today,
        chief_complaint="Blurry vision at near, updated Rx needed",
        # assessment_and_plan left blank — AI Scribe will generate it during demo
        is_finalized=False,
    )
    db.add(enc)
    await db.flush()

    # --- Vitals ---
    db.add(VitalsAndPretest(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        encounter_id=enc_id,
        iop_od=Decimal("16.0"),
        iop_os=Decimal("15.0"),
        iop_time=_dt(today, 10, 5, clinic_tz),
        iop_method="icare",
        ucva_od="20/80",
        ucva_os="20/60",
        bcva_od="20/40",
        bcva_os="20/30",
        near_va_od="20/40",
        near_va_os="20/30",
        blood_pressure="122/78",
        pulse=68,
        pupils_equal_round_reactive=True,
        relative_afferent_pupillary_defect=False,
        technician_notes="Patient reports increased screen time. Occasional afternoon dryness.",
        recorded_by_id=staff.id,
    ))

    # --- Refractions (4 types) ---
    refraction_data = [
        (RefractionType.HABITUAL, "-1.75", "-0.50", 178, "-1.50", "-0.25", 170,
         "20/40", "20/30", None, None, False,
         "Lensometry of current glasses. Approximately 2 years old."),
        (RefractionType.AUTO, "-2.50", "-1.00", 2, "-2.25", "-0.75", 177,
         None, None, None, None, False,
         "Topcon KR-800 autorefractor."),
        (RefractionType.MANIFEST, "-2.25", "-0.75", 180, "-2.00", "-0.50", 175,
         "20/20", "20/20", "20/20", "20/20", False,
         "Patient preferred +0.25 more plus OD. Add +1.50 OU comfortable."),
        (RefractionType.FINAL, "-2.25", "-0.75", 180, "-2.00", "-0.50", 175,
         "20/20", "20/20", "20/20", "20/20", True,
         "Final Rx dispensed. Add +1.50 OU for progressive lenses."),
    ]
    for (rt, sph_od, cyl_od, ax_od, sph_os, cyl_os, ax_os,
         va_od, va_os, nva_od, nva_os, final, notes) in refraction_data:
        db.add(Refraction(
            id=uuid.uuid4(),
            tenant_id=ctx.tenant_id,
            encounter_id=enc_id,
            refraction_type=rt,
            od_sphere=Decimal(sph_od),
            od_cylinder=Decimal(cyl_od),
            od_axis=ax_od,
            od_visual_acuity=va_od,
            od_add=Decimal("1.50") if rt in (RefractionType.MANIFEST, RefractionType.FINAL) else None,
            os_sphere=Decimal(sph_os),
            os_cylinder=Decimal(cyl_os),
            os_axis=ax_os,
            os_visual_acuity=va_os,
            os_add=Decimal("1.50") if rt in (RefractionType.MANIFEST, RefractionType.FINAL) else None,
            pd_distance=Decimal("62.0"),
            is_final_rx=final,
            rx_modality="glasses",
            notes=notes,
            recorded_by_id=staff.id,
        ))

    # --- Exam Findings ---
    db.add(ExamFindings(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        encounter_id=enc_id,
        patient_id=patient.id,
        exam_section="anterior_segment",
        is_normal_wnl=False,
        findings_od={
            "lids_lashes": {"status": "Normal", "severity": None, "finding": ""},
            "conjunctiva_sclera": {"status": "White & quiet", "severity": None, "finding": ""},
            "cornea": {"status": "SPK inferior", "severity": "mild", "finding": "Punctate staining inferiorly on NaFl"},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "Grade 1 nuclear sclerosis", "severity": "mild", "finding": "1+ NS"},
            "tear_film": {"status": "Reduced TBUT", "severity": "mild", "finding": "TBUT ~6s OD"},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        findings_os={
            "lids_lashes": {"status": "Normal", "severity": None, "finding": ""},
            "conjunctiva_sclera": {"status": "White & quiet", "severity": None, "finding": ""},
            "cornea": {"status": "SPK inferior", "severity": "mild", "finding": "Punctate staining inferiorly on NaFl"},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "Grade 1 nuclear sclerosis", "severity": "mild", "finding": "1+ NS"},
            "tear_film": {"status": "Reduced TBUT", "severity": "mild", "finding": "TBUT ~6s OS"},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        provider_notes="Dry eye signs consistent with aqueous deficiency. Recommend artificial tears QID.",
        recorded_by_id=staff.id,
    ))
    db.add(ExamFindings(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        encounter_id=enc_id,
        patient_id=patient.id,
        exam_section="posterior_segment",
        is_normal_wnl=True,
        findings_od={
            "cup_to_disc_ratio": {"status": "0.35", "severity": None, "finding": "Sharp margins, healthy rim tissue"},
            "optic_nerve": {"status": "Healthy, pink", "severity": None, "finding": ""},
            "macula": {"status": "Flat & intact", "severity": None, "finding": "No drusen"},
            "vitreous": {"status": "Clear", "severity": None, "finding": ""},
            "vessels": {"status": "Normal A/V ratio", "severity": None, "finding": ""},
            "periphery": {"status": "Flat & intact", "severity": None, "finding": "No breaks or detachment"},
        },
        findings_os={
            "cup_to_disc_ratio": {"status": "0.35", "severity": None, "finding": "Sharp margins, healthy rim tissue"},
            "optic_nerve": {"status": "Healthy, pink", "severity": None, "finding": ""},
            "macula": {"status": "Flat & intact", "severity": None, "finding": "No exudates"},
            "vitreous": {"status": "Clear", "severity": None, "finding": ""},
            "vessels": {"status": "Normal A/V ratio", "severity": None, "finding": ""},
            "periphery": {"status": "Flat & intact", "severity": None, "finding": "No breaks or detachment"},
        },
        provider_notes="Posterior segment healthy. No diabetic or hypertensive retinopathy.",
        recorded_by_id=staff.id,
    ))

    # --- Diagnoses ---
    dx_data = [
        ("H52.11", "Myopia with astigmatism, bilateral", EyeAffected.OU, "moderate"),
        ("H04.123", "Dry eye syndrome, bilateral", EyeAffected.OU, "mild"),
        ("H25.09", "Age-related incipient cataract, bilateral", EyeAffected.OU, "mild"),
    ]
    for code, desc, eye, sev in dx_data:
        db.add(Diagnosis(
            id=uuid.uuid4(),
            tenant_id=ctx.tenant_id,
            encounter_id=enc_id,
            icd10_code=code,
            description=desc,
            eye_affected=eye,
            severity=sev,
            status="active",
        ))

    await db.flush()

    return {
        "status": "ok",
        "message": f"Demo appointment seeded for {today.isoformat()} — open for AI Scribe demo",
        "replaced": deleted_count,
        "appointment_id": str(appt_id),
        "encounter_id": str(enc_id),
        "encounter_short_id": enc.short_id,
        "patient_name": f"{patient.first_name} {patient.last_name}",
    }
