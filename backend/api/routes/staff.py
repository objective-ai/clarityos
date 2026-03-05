"""
api/routes/staff.py

Staff management endpoints (admin/owner only).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import Staff
from backend.db.session import get_db
from backend.schemas.staff import StaffDetailResponse, StaffListItem, StaffUpdateRequest

router = APIRouter()


@router.get("/", response_model=list[StaffListItem])
async def list_staff(
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """List all staff members for the current tenant."""
    rows = (
        await db.execute(
            select(Staff)
            .where(Staff.tenant_id == ctx.tenant_id)
            .order_by(Staff.last_name, Staff.first_name)
        )
    ).scalars().all()
    return rows


@router.get("/{staff_id}", response_model=StaffDetailResponse)
async def get_staff(
    staff_id: UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """Get full detail for a staff member."""
    row = (
        await db.execute(
            select(Staff).where(
                Staff.id == staff_id,
                Staff.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")
    return row


@router.patch("/{staff_id}", response_model=StaffDetailResponse)
async def update_staff(
    staff_id: UUID,
    payload: StaffUpdateRequest,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """Update a staff member's role, name, or active status."""
    row = (
        await db.execute(
            select(Staff).where(
                Staff.id == staff_id,
                Staff.tenant_id == ctx.tenant_id,
            )
        )
    ).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)

    await db.flush()
    await db.refresh(row)
    return row
