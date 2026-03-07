"""
api/resolvers.py

Resolve short IDs (chart_number, short_id) or UUIDs to ORM objects.

Detection logic:
  - Numeric string → patient chart_number
  - Valid UUID (36 chars with dashes) → primary key lookup
  - Otherwise → encounter short_id
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models.tenant.clinical import Encounter, Patient


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


async def resolve_patient(
    identifier: str,
    tenant_id: uuid.UUID,
    db: AsyncSession,
) -> Patient:
    """Resolve a patient by UUID or chart_number."""
    base = select(Patient).where(
        Patient.tenant_id == tenant_id,
        Patient.is_deleted == False,  # noqa: E712
    )

    if _is_uuid(identifier):
        stmt = base.where(Patient.id == uuid.UUID(identifier))
    elif identifier.isdigit():
        stmt = base.where(Patient.chart_number == int(identifier))
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid patient identifier: {identifier}",
        )

    result = await db.execute(stmt)
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found.",
        )
    return patient


async def resolve_patient_id(
    identifier: str,
    tenant_id: uuid.UUID,
    db: AsyncSession,
) -> uuid.UUID:
    """Resolve a patient identifier to its UUID."""
    if _is_uuid(identifier):
        return uuid.UUID(identifier)
    if identifier.isdigit():
        result = await db.execute(
            select(Patient.id).where(
                Patient.tenant_id == tenant_id,
                Patient.chart_number == int(identifier),
                Patient.is_deleted == False,  # noqa: E712
            )
        )
        pid = result.scalar_one_or_none()
        if not pid:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
        return pid
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid patient identifier: {identifier}")


async def resolve_encounter_id(
    identifier: str,
    tenant_id: uuid.UUID,
    db: AsyncSession,
) -> uuid.UUID:
    """Resolve an encounter identifier to its UUID."""
    if _is_uuid(identifier):
        return uuid.UUID(identifier)
    result = await db.execute(
        select(Encounter.id).where(
            Encounter.tenant_id == tenant_id,
            Encounter.short_id == identifier,
            Encounter.is_deleted == False,  # noqa: E712
        )
    )
    eid = result.scalar_one_or_none()
    if not eid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found.")
    return eid


async def resolve_encounter(
    identifier: str,
    tenant_id: uuid.UUID,
    db: AsyncSession,
) -> Encounter:
    """Resolve an encounter by UUID or short_id."""
    base = select(Encounter).where(
        Encounter.tenant_id == tenant_id,
        Encounter.is_deleted == False,  # noqa: E712
    )

    if _is_uuid(identifier):
        stmt = base.where(Encounter.id == uuid.UUID(identifier))
    else:
        stmt = base.where(Encounter.short_id == identifier)

    result = await db.execute(stmt)
    encounter = result.scalar_one_or_none()
    if not encounter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Encounter not found.",
        )
    return encounter
