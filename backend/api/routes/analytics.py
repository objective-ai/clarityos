"""
backend/api/routes/analytics.py

Single aggregate GET endpoint that returns all 7 chart datasets and 4 KPI cards
in one network round-trip. Scoped to tenant. Role-gated to VIEW_ANALYTICS
(doctor, admin, owner).
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy import cast, func, select, case
from sqlalchemy import Date as SADate
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext
from backend.db.session import get_db
from backend.db.models.tenant.clinical import (
    Encounter, Patient, Appointment, Diagnosis, Superbill, Refraction
)
from backend.schemas.analytics import (
    AnalyticsDashboardResponse, KpiCard,
    EncounterVolumePoint, RevenueTrendPoint, TopDiagnosisItem,
    ClaimsPipelineItem, AppointmentUtilizationData, PatientGrowthPoint,
    RxOpticalItem,
)

router = APIRouter()


def _pct_change(current: float | Decimal | int, previous: float | Decimal | int | None) -> float | None:
    """Compute percent change from previous to current. Returns None if not computable."""
    if previous is None:
        return None
    try:
        prev = float(previous)
        cur = float(current)
        if prev == 0:
            return None
        return round((cur - prev) / prev * 100, 1)
    except (TypeError, ZeroDivisionError):
        return None


@router.get("/", response_model=AnalyticsDashboardResponse)
async def get_analytics_dashboard(
    date_from: date = Query(...),
    date_to: date = Query(...),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_ANALYTICS)),
    db: AsyncSession = Depends(get_db),
):
    """Return full analytics dashboard data for the requested date range."""

    period_days = (date_to - date_from).days + 1
    prev_date_to = date_from - timedelta(days=1)
    prev_date_from = prev_date_to - timedelta(days=period_days - 1)

    # ── 1. Encounter volume time series ───────────────────────────────────
    enc_vol = (await db.execute(
        select(Encounter.encounter_date.label("date"), func.count(Encounter.id).label("count"))
        .where(
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_deleted == False,
            Encounter.encounter_date >= date_from,
            Encounter.encounter_date <= date_to,
        )
        .group_by(Encounter.encounter_date)
        .order_by(Encounter.encounter_date)
    )).all()

    # ── 2. Revenue trend (Superbill.created_at is DateTime) ───────────────
    rev_trend = (await db.execute(
        select(
            cast(Superbill.created_at, SADate).label("date"),
            func.sum(Superbill.total_fee).label("revenue"),
        )
        .where(
            Superbill.tenant_id == ctx.tenant_id,
            cast(Superbill.created_at, SADate) >= date_from,
            cast(Superbill.created_at, SADate) <= date_to,
        )
        .group_by(cast(Superbill.created_at, SADate))
        .order_by(cast(Superbill.created_at, SADate))
    )).all()

    # ── 3. Top diagnoses ──────────────────────────────────────────────────
    top_dx = (await db.execute(
        select(
            Diagnosis.icd10_code,
            Diagnosis.description,
            func.count(Diagnosis.id).label("count"),
        )
        .join(Encounter, Diagnosis.encounter_id == Encounter.id)
        .where(
            Diagnosis.tenant_id == ctx.tenant_id,
            Diagnosis.is_deleted == False,
            Encounter.encounter_date >= date_from,
            Encounter.encounter_date <= date_to,
        )
        .group_by(Diagnosis.icd10_code, Diagnosis.description)
        .order_by(func.count(Diagnosis.id).desc())
        .limit(10)
    )).all()

    # ── 4. Claims pipeline ────────────────────────────────────────────────
    claims = (await db.execute(
        select(Superbill.claim_status, func.count(Superbill.id).label("count"))
        .where(
            Superbill.tenant_id == ctx.tenant_id,
            cast(Superbill.created_at, SADate) >= date_from,
            cast(Superbill.created_at, SADate) <= date_to,
        )
        .group_by(Superbill.claim_status)
    )).all()

    # ── 5. Appointment utilization ────────────────────────────────────────
    appt_util = (await db.execute(
        select(
            func.count(Appointment.id).label("total"),
            func.sum(case((Appointment.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case((Appointment.status == "no_show", 1), else_=0)).label("no_show"),
            func.sum(case((Appointment.status == "cancelled", 1), else_=0)).label("cancelled"),
        )
        .where(
            Appointment.tenant_id == ctx.tenant_id,
            cast(Appointment.start_time, SADate) >= date_from,
            cast(Appointment.start_time, SADate) <= date_to,
        )
    )).one()

    # ── 6. Patient growth ─────────────────────────────────────────────────
    pat_growth = (await db.execute(
        select(
            cast(Patient.created_at, SADate).label("date"),
            func.count(Patient.id).label("new_patients"),
        )
        .where(
            Patient.tenant_id == ctx.tenant_id,
            Patient.is_deleted == False,
            cast(Patient.created_at, SADate) >= date_from,
            cast(Patient.created_at, SADate) <= date_to,
        )
        .group_by(cast(Patient.created_at, SADate))
        .order_by(cast(Patient.created_at, SADate))
    )).all()

    # ── 7. Rx/optical metrics ─────────────────────────────────────────────
    rx_opt = (await db.execute(
        select(Refraction.rx_modality, func.count(Refraction.id).label("count"))
        .join(Encounter, Refraction.encounter_id == Encounter.id)
        .where(
            Refraction.tenant_id == ctx.tenant_id,
            Refraction.is_final_rx == True,
            Encounter.encounter_date >= date_from,
            Encounter.encounter_date <= date_to,
            Encounter.is_deleted == False,
        )
        .group_by(Refraction.rx_modality)
    )).all()

    # ── KPI: Total Patients ───────────────────────────────────────────────
    current_patients_row = (await db.execute(
        select(func.count(Patient.id))
        .where(Patient.tenant_id == ctx.tenant_id, Patient.is_deleted == False)
    )).scalar() or 0

    prev_patients_row = (await db.execute(
        select(func.count(Patient.id))
        .where(
            Patient.tenant_id == ctx.tenant_id,
            Patient.is_deleted == False,
            cast(Patient.created_at, SADate) <= prev_date_to,
        )
    )).scalar() or 0

    # ── KPI: Exams (encounters in period) ─────────────────────────────────
    current_exams = (await db.execute(
        select(func.count(Encounter.id))
        .where(
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_deleted == False,
            Encounter.encounter_date >= date_from,
            Encounter.encounter_date <= date_to,
        )
    )).scalar() or 0

    prev_exams = (await db.execute(
        select(func.count(Encounter.id))
        .where(
            Encounter.tenant_id == ctx.tenant_id,
            Encounter.is_deleted == False,
            Encounter.encounter_date >= prev_date_from,
            Encounter.encounter_date <= prev_date_to,
        )
    )).scalar() or 0

    # ── KPI: Avg Exam Duration ────────────────────────────────────────────
    current_avg_dur = (await db.execute(
        select(func.avg(Appointment.duration_minutes))
        .where(
            Appointment.tenant_id == ctx.tenant_id,
            Appointment.status == "completed",
            cast(Appointment.start_time, SADate) >= date_from,
            cast(Appointment.start_time, SADate) <= date_to,
        )
    )).scalar()
    current_avg_dur_int = round(float(current_avg_dur)) if current_avg_dur else 0

    prev_avg_dur = (await db.execute(
        select(func.avg(Appointment.duration_minutes))
        .where(
            Appointment.tenant_id == ctx.tenant_id,
            Appointment.status == "completed",
            cast(Appointment.start_time, SADate) >= prev_date_from,
            cast(Appointment.start_time, SADate) <= prev_date_to,
        )
    )).scalar()
    prev_avg_dur_int = round(float(prev_avg_dur)) if prev_avg_dur else None

    # ── KPI: Revenue ──────────────────────────────────────────────────────
    current_revenue = (await db.execute(
        select(func.sum(Superbill.total_fee))
        .where(
            Superbill.tenant_id == ctx.tenant_id,
            cast(Superbill.created_at, SADate) >= date_from,
            cast(Superbill.created_at, SADate) <= date_to,
        )
    )).scalar() or Decimal(0)

    prev_revenue = (await db.execute(
        select(func.sum(Superbill.total_fee))
        .where(
            Superbill.tenant_id == ctx.tenant_id,
            cast(Superbill.created_at, SADate) >= prev_date_from,
            cast(Superbill.created_at, SADate) <= prev_date_to,
        )
    )).scalar()

    # ── Build response ────────────────────────────────────────────────────
    return AnalyticsDashboardResponse(
        kpi_total_patients=KpiCard(
            value=current_patients_row,
            previous_value=prev_patients_row,
            pct_change=_pct_change(current_patients_row, prev_patients_row),
        ),
        kpi_exams=KpiCard(
            value=current_exams,
            previous_value=prev_exams,
            pct_change=_pct_change(current_exams, prev_exams),
        ),
        kpi_avg_exam_duration=KpiCard(
            value=current_avg_dur_int,
            previous_value=prev_avg_dur_int,
            pct_change=_pct_change(current_avg_dur_int, prev_avg_dur_int),
        ),
        kpi_revenue=KpiCard(
            value=current_revenue,
            previous_value=prev_revenue,
            pct_change=_pct_change(current_revenue, prev_revenue),
        ),
        encounter_volume=[
            EncounterVolumePoint(date=r.date, count=r.count) for r in enc_vol
        ],
        revenue_trend=[
            RevenueTrendPoint(date=r.date, revenue=r.revenue or Decimal(0)) for r in rev_trend
        ],
        top_diagnoses=[
            TopDiagnosisItem(icd10_code=r.icd10_code, description=r.description, count=r.count)
            for r in top_dx
        ],
        claims_pipeline=[
            ClaimsPipelineItem(claim_status=r.claim_status, count=r.count) for r in claims
        ],
        appointment_utilization=AppointmentUtilizationData(
            total=appt_util.total or 0,
            completed=appt_util.completed or 0,
            no_show=appt_util.no_show or 0,
            cancelled=appt_util.cancelled or 0,
        ),
        patient_growth=[
            PatientGrowthPoint(date=r.date, new_patients=r.new_patients) for r in pat_growth
        ],
        rx_optical_metrics=[
            RxOpticalItem(rx_modality=r.rx_modality, count=r.count) for r in rx_opt
        ],
        actual_days=len(
            {r.date for r in enc_vol}
            | {r.date for r in rev_trend}
            | {r.date for r in pat_growth}
        ),
        requested_days=period_days,
    )
