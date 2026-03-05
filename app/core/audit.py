"""
core/audit.py

HIPAA 164.312(b) — immutable audit logging for all ePHI access.

Every clinical route must call ``log_action`` after a successful operation.
AuditLog records are append-only and never modified or deleted.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TenantContext
from app.db.models.tenant.clinical import AuditAction, AuditLog


async def log_action(
    db: AsyncSession,
    ctx: TenantContext,
    action: AuditAction,
    resource_type: str,
    resource_id: UUID,
    *,
    staff_id: UUID | None = None,
    encounter_id: UUID | None = None,
    patient_id: UUID | None = None,
    detail: str | None = None,
    ip_address: str | None = None,
) -> None:
    """Append an immutable audit log entry.

    Parameters
    ----------
    db : AsyncSession
        Active database session (will be flushed by the caller's commit).
    ctx : TenantContext
        The authenticated user's identity.
    action : AuditAction
        What happened (create, read, update, delete, finalize, promote).
    resource_type : str
        The entity type (e.g., "encounter", "vitals", "diagnosis").
    resource_id : UUID
        Primary key of the affected record.
    staff_id : UUID | None
        Resolved ``staff.id`` (internal), if available.
    encounter_id : UUID | None
        Parent encounter for scoped queries.
    patient_id : UUID | None
        Patient for scoped queries.
    detail : str | None
        Human-readable description (e.g., "Finalized encounter").
    ip_address : str | None
        Client IP from ``request.client.host``.
    """
    entry = AuditLog(
        tenant_id=ctx.tenant_id,
        user_id=ctx.user_id,
        staff_id=staff_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        encounter_id=encounter_id,
        patient_id=patient_id,
        detail=detail,
        ip_address=ip_address,
    )
    db.add(entry)
