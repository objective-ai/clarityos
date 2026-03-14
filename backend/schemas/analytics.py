"""
backend/schemas/analytics.py

Pydantic v2 response types for the analytics aggregate endpoint.
These define the contract between the FastAPI backend and the frontend store.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from pydantic import BaseModel


class EncounterVolumePoint(BaseModel):
    date: date
    count: int


class RevenueTrendPoint(BaseModel):
    date: date
    revenue: Decimal


class TopDiagnosisItem(BaseModel):
    icd10_code: str
    description: str
    count: int


class ClaimsPipelineItem(BaseModel):
    claim_status: str
    count: int


class AppointmentUtilizationData(BaseModel):
    total: int
    completed: int
    no_show: int
    cancelled: int


class PatientGrowthPoint(BaseModel):
    date: date
    new_patients: int


class RxOpticalItem(BaseModel):
    rx_modality: str
    count: int


class KpiCard(BaseModel):
    value: Decimal | int | str
    previous_value: Decimal | int | str | None = None
    pct_change: float | None = None


class AnalyticsDashboardResponse(BaseModel):
    # KPI cards
    kpi_total_patients: KpiCard
    kpi_exams: KpiCard
    kpi_avg_exam_duration: KpiCard
    kpi_revenue: KpiCard
    # Chart data
    encounter_volume: list[EncounterVolumePoint]
    revenue_trend: list[RevenueTrendPoint]
    top_diagnoses: list[TopDiagnosisItem]
    claims_pipeline: list[ClaimsPipelineItem]
    appointment_utilization: AppointmentUtilizationData
    patient_growth: list[PatientGrowthPoint]
    rx_optical_metrics: list[RxOpticalItem]
    # Metadata
    actual_days: int
    requested_days: int
