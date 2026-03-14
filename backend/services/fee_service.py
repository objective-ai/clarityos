"""Fee resolution service — async DB-backed fee lookup with payer-rate/base-rate fallback."""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models.tenant.clinical import FeeScheduleItem


async def resolve_line_item_fee(
    cpt_code: str,
    payer_id: uuid.UUID | None,
    tenant_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[Decimal, str]:
    """Return (fee, fee_source) for a CPT code given an optional payer.

    fee_source is "payer_rate" when a payer-specific override exists,
    "base_rate" when falling back to the base catalog (payer_id=NULL).
    Returns (Decimal("0.00"), "base_rate") when no catalog entry found.
    """
    if payer_id:
        result = await db.execute(
            select(FeeScheduleItem).where(
                FeeScheduleItem.payer_id == payer_id,
                FeeScheduleItem.cpt_code == cpt_code,
                FeeScheduleItem.tenant_id == tenant_id,
            )
        )
        item = result.scalar_one_or_none()
        if item:
            return item.fee, "payer_rate"

    # Fallback to base catalog (payer_id IS NULL)
    base_result = await db.execute(
        select(FeeScheduleItem).where(
            FeeScheduleItem.payer_id == None,  # noqa: E711
            FeeScheduleItem.cpt_code == cpt_code,
            FeeScheduleItem.tenant_id == tenant_id,
        )
    )
    base_item = base_result.scalar_one_or_none()
    if base_item:
        return base_item.fee, "base_rate"

    return Decimal("0.00"), "base_rate"
