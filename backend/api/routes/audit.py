"""
api/routes/audit.py

Audit log retrieval endpoints for encounter-level and tenant-wide logs.
Restricted to admin/owner roles (VIEW_AUDIT_LOG permission).
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import AuditLog, Encounter, Staff
from backend.db.session import get_db
from backend.schemas.audit import AuditLogListResponse, AuditLogResponse

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_response(row: AuditLog, staff_name: str | None = None) -> AuditLogResponse:
    return AuditLogResponse(
        id=row.id,
        timestamp=row.created_at,
        user_id=row.user_id,
        staff_name=staff_name,
        encounter_id=row.encounter_id,
        patient_id=row.patient_id,
        action_type=row.action.value,
        resource_type=row.resource_type,
        detail=row.detail,
        changes=row.changes,
        metadata=row.metadata_,
    )


# ---------------------------------------------------------------------------
# GET /encounters/{encounter_id}/audit-logs
# ---------------------------------------------------------------------------


@router.get(
    "/encounters/{encounter_id}/audit-logs",
    response_model=list[AuditLogResponse],
)
async def get_encounter_audit_logs(
    encounter_id: UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_AUDIT_LOG)),
    db: AsyncSession = Depends(get_db),
):
    """Return all audit log entries for a specific encounter."""

    # Verify encounter belongs to tenant
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

    stmt = (
        select(AuditLog, Staff.first_name, Staff.last_name)
        .outerjoin(Staff, AuditLog.staff_id == Staff.id)
        .where(
            AuditLog.tenant_id == ctx.tenant_id,
            AuditLog.encounter_id == encounter_id,
        )
        .order_by(AuditLog.created_at.asc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        _row_to_response(
            row[0],
            f"{row[1]} {row[2]}" if row[1] else None,
        )
        for row in rows
    ]


# ---------------------------------------------------------------------------
# GET /audit-logs  (tenant-wide, paginated, filterable)
# ---------------------------------------------------------------------------


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def get_tenant_audit_logs(
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_AUDIT_LOG)),
    db: AsyncSession = Depends(get_db),
    user_id: UUID | None = Query(None),
    action: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    patient_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Return paginated audit logs for the entire tenant with optional filters."""

    base = select(AuditLog).where(AuditLog.tenant_id == ctx.tenant_id)

    if user_id:
        base = base.where(AuditLog.user_id == user_id)
    if action:
        base = base.where(AuditLog.action == action)
    if date_from:
        base = base.where(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        base = base.where(AuditLog.created_at <= datetime.combine(date_to, datetime.max.time()))
    if patient_id:
        base = base.where(AuditLog.patient_id == patient_id)

    # Total count
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Paginated data with staff JOIN
    data_stmt = (
        select(AuditLog, Staff.first_name, Staff.last_name)
        .outerjoin(Staff, AuditLog.staff_id == Staff.id)
        .where(
            AuditLog.tenant_id == ctx.tenant_id,
        )
    )

    # Re-apply filters to data query
    if user_id:
        data_stmt = data_stmt.where(AuditLog.user_id == user_id)
    if action:
        data_stmt = data_stmt.where(AuditLog.action == action)
    if date_from:
        data_stmt = data_stmt.where(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        data_stmt = data_stmt.where(AuditLog.created_at <= datetime.combine(date_to, datetime.max.time()))
    if patient_id:
        data_stmt = data_stmt.where(AuditLog.patient_id == patient_id)

    data_stmt = (
        data_stmt
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )

    result = await db.execute(data_stmt)
    rows = result.all()

    logs = [
        _row_to_response(
            row[0],
            f"{row[1]} {row[2]}" if row[1] else None,
        )
        for row in rows
    ]

    return AuditLogListResponse(logs=logs, total=total, page=page, per_page=per_page)


# ---------------------------------------------------------------------------
# GET /audit-logs/export  (CSV download)
# ---------------------------------------------------------------------------


@router.get("/audit-logs/export")
async def export_audit_logs(
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_AUDIT_LOG)),
    db: AsyncSession = Depends(get_db),
    user_id: UUID | None = Query(None),
    action: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    patient_id: UUID | None = Query(None),
):
    """Export audit logs as CSV for compliance reporting."""

    stmt = (
        select(AuditLog, Staff.first_name, Staff.last_name)
        .outerjoin(Staff, AuditLog.staff_id == Staff.id)
        .where(AuditLog.tenant_id == ctx.tenant_id)
    )

    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= datetime.combine(date_to, datetime.max.time()))
    if patient_id:
        stmt = stmt.where(AuditLog.patient_id == patient_id)

    stmt = stmt.order_by(AuditLog.created_at.desc())

    result = await db.execute(stmt)
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Timestamp", "User", "Action", "Resource Type",
        "Encounter ID", "Patient ID", "Detail", "IP Address",
    ])

    for log, first_name, last_name in rows:
        staff_name = f"{first_name} {last_name}" if first_name else str(log.user_id)
        writer.writerow([
            log.created_at.isoformat(),
            staff_name,
            log.action.value,
            log.resource_type,
            str(log.encounter_id) if log.encounter_id else "",
            str(log.patient_id) if log.patient_id else "",
            log.detail or "",
            log.ip_address or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-logs.csv"},
    )
