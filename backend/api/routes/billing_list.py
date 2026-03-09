"""
api/routes/billing_list.py

List endpoint for the billing dashboard.
Mounted at /api/superbills (separate from per-encounter billing routes).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import (
    Superbill,
)
from backend.db.session import get_db
from backend.schemas.billing import SuperbillListItem

router = APIRouter()


@router.get("/", response_model=list[SuperbillListItem])
async def list_superbills(
    request: Request,
    status: Optional[str] = Query(None, description="Filter by claim_status"),
    date_from: Optional[date] = Query(None, description="Start date (inclusive)"),
    date_to: Optional[date] = Query(None, description="End date (inclusive)"),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """List all superbills for the tenant dashboard."""
    stmt = (
        select(Superbill)
        .where(Superbill.tenant_id == ctx.tenant_id)
        .options(
            selectinload(Superbill.line_items),
            selectinload(Superbill.patient),
            selectinload(Superbill.provider),
        )
        .order_by(Superbill.created_at.desc())
    )

    if status:
        stmt = stmt.where(Superbill.claim_status == status)
    if date_from:
        stmt = stmt.where(
            Superbill.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc)
        )
    if date_to:
        stmt = stmt.where(
            Superbill.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc)
        )

    rows = (await db.execute(stmt)).scalars().all()

    return [
        SuperbillListItem(
            id=sb.id,
            encounter_id=sb.encounter_id,
            patient_id=sb.patient_id,
            patient_name=(
                f"{sb.patient.last_name}, {sb.patient.first_name}"
                if sb.patient else "Unknown"
            ),
            provider_name=sb.provider.full_name if sb.provider else "Unknown",
            claim_status=(
                sb.claim_status.value
                if hasattr(sb.claim_status, "value")
                else sb.claim_status
            ),
            cpt_codes=[
                li.cpt_code for li in (sb.line_items or []) if not li.is_deleted
            ],
            total_fee=float(sb.total_fee or 0),
            created_at=sb.created_at,
        )
        for sb in rows
    ]
