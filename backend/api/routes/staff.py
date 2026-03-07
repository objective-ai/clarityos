"""
api/routes/staff.py

Staff management endpoints (admin/owner only).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.core.supabase_admin import get_auth_user, list_auth_users
from backend.db.models.public.saas import TenantMember
from backend.db.models.tenant.clinical import AuditAction, Staff
from backend.db.session import get_db
from backend.schemas.staff import (
    StaffCreateRequest,
    StaffDetailResponse,
    StaffListItem,
    StaffUpdateRequest,
)

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


@router.post("/", response_model=StaffListItem, status_code=status.HTTP_201_CREATED)
async def create_staff(
    payload: StaffCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """Create a new staff member for the current tenant."""
    row = Staff(
        tenant_id=ctx.tenant_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        role=payload.role,
        license_number=payload.license_number,
        npi_number=payload.npi_number,
        is_active=True,
    )
    db.add(row)
    await db.flush()
    caller = await resolve_staff(ctx, db)
    await log_action(
        db, ctx, AuditAction.CREATE, "staff", row.id,
        staff_id=caller.id if caller else None,
        detail=f"Created staff: {row.first_name} {row.last_name} ({row.role})",
        ip_address=request.client.host if request.client else None,
    )
    await db.refresh(row)
    return row


@router.get("/auth-users")
async def search_auth_users(
    email: str = Query(..., min_length=1, description="Email substring to search"),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
):
    """Search Supabase Auth users by email. Returns matching users."""
    users = await list_auth_users(email_filter=email)
    return users


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
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.MANAGE_STAFF)),
    db: AsyncSession = Depends(get_db),
):
    """Update a staff member's role, name, or active status.

    When user_id is provided, links the staff record to a Supabase Auth user
    and creates/updates the tenant_members entry so the JWT hook works.
    """
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

    updates = payload.model_dump(exclude_unset=True)

    # Handle user_id linking
    link_user_id = updates.pop("user_id", None)
    if link_user_id is not None:
        if link_user_id == "":
            # Unlink
            row.user_id = None
        else:
            uid = UUID(str(link_user_id))
            # Verify user exists in Supabase Auth
            auth_user = await get_auth_user(str(uid))
            if not auth_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Auth user not found in Supabase",
                )
            # Check not already linked to another staff in this tenant
            existing = (
                await db.execute(
                    select(Staff).where(
                        Staff.user_id == uid,
                        Staff.tenant_id == ctx.tenant_id,
                        Staff.id != staff_id,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Auth user already linked to staff: {existing.first_name} {existing.last_name}",
                )
            row.user_id = uid

            # Upsert tenant_members so JWT hook picks up this user
            tm = (
                await db.execute(
                    select(TenantMember).where(
                        TenantMember.user_id == uid,
                        TenantMember.tenant_id == ctx.tenant_id,
                    )
                )
            ).scalar_one_or_none()
            if tm:
                tm.role = row.role
                tm.is_active = True
            else:
                db.add(TenantMember(
                    user_id=uid,
                    tenant_id=ctx.tenant_id,
                    role=row.role,
                    is_active=True,
                ))

    # Apply remaining field updates
    for field, value in updates.items():
        setattr(row, field, value)

    await db.flush()
    caller = await resolve_staff(ctx, db)
    await log_action(
        db, ctx, AuditAction.UPDATE, "staff", row.id,
        staff_id=caller.id if caller else None,
        detail=f"Updated staff: {row.first_name} {row.last_name}",
        changes=payload.model_dump(exclude_unset=True),
        ip_address=request.client.host if request.client else None,
    )
    await db.refresh(row)
    return row
