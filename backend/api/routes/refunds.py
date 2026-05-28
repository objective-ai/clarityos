"""Refund routes (Phase 15, Plan 15-05 — POS-05, POS-09).

Routes:
    POST /api/refunds/?sale_id=...   — issue a refund against a closed sale
    GET  /api/refunds/{refund_id}/   — fetch a single refund + line/payment allocs

All routes gated on ``Entitlement.RETAIL_POS`` + ``ClinicalAction.ISSUE_REFUND``
(OWNER+ADMIN only per POS-11). Primary-TXN audit per
``.claude/rules/clinical-safety.md`` — issue_refund flushes side-effects, this
route owns ``db.commit()``.

Nested ``GET /api/sales/{sale_id}/refunds/`` lives on the sales router (single-
router pattern, WARNING #6). See ``sales.py``.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.entitlements import require_entitlement
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext
from backend.db.models.tenant.clinical import Refund, Sale
from backend.db.session import get_db
from backend.schemas.sales import (
    RefundCreate,
    RefundLineItemResponse,
    RefundPaymentResponse,
    RefundResponse,
)
from backend.services.payments.base import get_processor
from backend.services.sale_lifecycle import (
    RefundLineSpec,
    RefundPaymentSpec,
    issue_refund,
)

router = APIRouter(
    prefix="/api/refunds",
    tags=["refunds"],
    dependencies=[Depends(require_entitlement("retail_pos"))],
)


def _refund_response(refund: Refund) -> RefundResponse:
    """Build the wire payload manually — the ORM relationship is named
    ``payment_allocations`` but the Pydantic schema exposes ``payment_refunds``
    so a straight ``model_validate`` doesn't bridge the rename.
    """
    return RefundResponse.model_validate(
        {
            "id": refund.id,
            "sale_id": refund.sale_id,
            "total_amount": refund.total_amount,
            "reason": refund.reason,
            "processor_refund_id": refund.processor_refund_id,
            "refunded_by_id": refund.refunded_by_id,
            "created_at": refund.created_at,
            "line_items": [
                RefundLineItemResponse.model_validate(li) for li in refund.line_items
            ],
            "payment_refunds": [
                RefundPaymentResponse.model_validate(pa)
                for pa in refund.payment_allocations
            ],
        }
    )


@router.post("/", response_model=RefundResponse, status_code=201)
async def create_refund(
    body: RefundCreate,
    request: Request,
    sale_id: UUID = Query(..., alias="saleId"),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.ISSUE_REFUND)),
    db: AsyncSession = Depends(get_db),
):
    sale = (
        await db.execute(
            select(Sale)
            .where(Sale.id == sale_id, Sale.tenant_id == ctx.tenant_id)
            .options(
                selectinload(Sale.lines),
                selectinload(Sale.payments),
                selectinload(Sale.refunds),
            )
        )
    ).scalar_one_or_none()
    if sale is None:
        raise HTTPException(status_code=404, detail="Sale not found")
    if sale.status not in ("paid", "refunded"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot refund sale in status {sale.status}",
        )

    line_specs = [
        RefundLineSpec(lr.sale_line_item_id, lr.qty, lr.amount)
        for lr in body.line_refunds
    ]
    payment_specs = [
        RefundPaymentSpec(pr.payment_id, pr.amount) for pr in body.payment_refunds
    ]
    processor = get_processor("stripe")
    refund = await issue_refund(
        db, ctx, sale, line_specs, payment_specs, body.reason, processor
    )
    await db.commit()

    refund = (
        await db.execute(
            select(Refund)
            .where(Refund.id == refund.id)
            .options(
                selectinload(Refund.line_items),
                selectinload(Refund.payment_allocations),
            )
        )
    ).scalar_one()
    return _refund_response(refund)


@router.get("/{refund_id}/", response_model=RefundResponse)
async def get_refund(
    refund_id: UUID,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.ISSUE_REFUND)),
    db: AsyncSession = Depends(get_db),
):
    refund = (
        await db.execute(
            select(Refund)
            .where(Refund.id == refund_id, Refund.tenant_id == ctx.tenant_id)
            .options(
                selectinload(Refund.line_items),
                selectinload(Refund.payment_allocations),
            )
        )
    ).scalar_one_or_none()
    if refund is None:
        raise HTTPException(status_code=404, detail="Refund not found")
    return _refund_response(refund)
