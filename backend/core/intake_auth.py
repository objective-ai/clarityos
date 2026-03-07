"""
core/intake_auth.py

Token-based authentication for public intake routes.
Replaces Supabase JWT auth — validates intake tokens from the DB.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.db.models.tenant.intake import IntakeStatus, IntakeToken
from backend.db.session import get_db


MAX_DOB_ATTEMPTS = 3


@dataclass(frozen=True, slots=True)
class IntakeContext:
    """Identity for a public intake request — derived from token, not JWT."""

    token_record: IntakeToken
    tenant_id: UUID
    appointment_id: UUID


async def get_intake_context(
    token: str,
    db: AsyncSession,
) -> IntakeContext:
    """
    Validate an intake token string and return context.

    Checks:
    1. Token exists
    2. Status is PENDING (not submitted/expired/revoked)
    3. Not expired (expires_at > now)

    Raises HTTPException on failure.
    """
    result = await db.execute(
        select(IntakeToken)
        .where(IntakeToken.token == token)
        .options(selectinload(IntakeToken.appointment))
    )
    intake_token = result.scalar_one_or_none()

    if intake_token is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or unknown intake link.",
        )

    if intake_token.status == IntakeStatus.SUBMITTED.value:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This intake form has already been submitted.",
        )

    if intake_token.status in (
        IntakeStatus.EXPIRED.value,
        IntakeStatus.REVOKED.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This intake link has expired. Please contact your clinic for a new link.",
        )

    now = datetime.now(timezone.utc)
    if intake_token.expires_at.replace(tzinfo=timezone.utc) < now:
        intake_token.status = IntakeStatus.EXPIRED.value
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This intake link has expired. Please contact your clinic for a new link.",
        )

    if intake_token.dob_attempts >= MAX_DOB_ATTEMPTS and not intake_token.dob_verified:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Too many failed verification attempts. Please contact your clinic.",
        )

    return IntakeContext(
        token_record=intake_token,
        tenant_id=intake_token.tenant_id,
        appointment_id=intake_token.appointment_id,
    )
