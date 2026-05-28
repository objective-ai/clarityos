"""POS payment routes (Phase 15, Plan 15-04, Task 2).

Routes are attached to the shared `sales_router` from sales.py via decorators
below (single-router pattern, WARNING #6 — no separate router instance here).

Routes:
    POST   /api/sales/{sale_id}/payments/                    — record cash/external_card/write_off, or init stripe PaymentIntent
    POST   /api/sales/{sale_id}/payments/stripe-confirm/     — confirm via server-authoritative retrieve
    DELETE /api/sales/{sale_id}/payments/{payment_id}/       — cancel pending stripe Payment

All gated on Entitlement.RETAIL_POS + ClinicalAction.RECORD_PAYMENT.
Write-off branch additionally gated on ClinicalAction.RECORD_WRITE_OFF.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Union
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.api.routes.sales import _load_sale, _load_tenant
from backend.api.routes.sales import router as sales_router
from backend.core.audit import log_action
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import AuditAction, Payment, Sale
from backend.db.session import get_db
from backend.schemas.sales import (
    PaymentCreate,
    PaymentResponse,
    StripeConfirmRequest,
    StripeIntentResponse,
)
from backend.services.money import quantize_money
from backend.services.payments.base import PaymentProcessorError, get_processor


# ---------------------------------------------------------------------------
# Internal helpers (WARNING #5: enforced names)
# ---------------------------------------------------------------------------


async def _record_cash_payment(
    body: PaymentCreate,
    sale: Sale,
    staff,
    ctx: TenantContext,
    db: AsyncSession,
) -> Payment:
    amount = quantize_money(body.amount)
    tendered = body.tendered
    if tendered is None or tendered < amount:
        raise HTTPException(
            status_code=400,
            detail="tendered must be >= amount for cash payment",
        )
    change_due = quantize_money(tendered - amount)
    payment = Payment(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        sale_id=sale.id,
        method="cash",
        amount=amount,
        tendered=quantize_money(tendered),
        change_due=change_due,
        status="succeeded",
        created_by_id=staff.id if staff else None,
    )
    db.add(payment)
    return payment


async def _record_external_card(
    body: PaymentCreate,
    sale: Sale,
    staff,
    ctx: TenantContext,
    db: AsyncSession,
) -> Payment:
    last4 = (body.last4 or "").strip()
    if last4 and (not last4.isdigit() or len(last4) != 4):
        raise HTTPException(status_code=400, detail="last4 must be 4 digits")
    payment = Payment(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        sale_id=sale.id,
        method="external_card",
        amount=quantize_money(body.amount),
        last4=last4 or None,
        auth_code=body.auth_code,
        status="succeeded",
        created_by_id=staff.id if staff else None,
    )
    db.add(payment)
    return payment


async def _record_writeoff(
    body: PaymentCreate,
    sale: Sale,
    staff,
    ctx: TenantContext,
    db: AsyncSession,
) -> Payment:
    reason = (body.reason_note or "").strip()
    if not reason:
        raise HTTPException(
            status_code=400,
            detail="reason_note required for write_off payments",
        )
    payment = Payment(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        sale_id=sale.id,
        method="write_off",
        amount=quantize_money(body.amount),
        reason_note=reason,
        status="succeeded",
        created_by_id=staff.id if staff else None,
    )
    db.add(payment)
    return payment


async def _initiate_stripe_payment(
    body: PaymentCreate,
    sale: Sale,
    tenant: Tenant,
    staff,
    ctx: TenantContext,
    db: AsyncSession,
) -> tuple[Payment, "object"]:
    processor = get_processor("stripe")
    metadata = {
        "sale_id": str(sale.id),
        "patient_id": str(sale.patient_id) if sale.patient_id else "",
        "attempt": 1,
    }
    try:
        intent = await processor.create_payment_intent(
            tenant, quantize_money(body.amount), "usd", metadata
        )
    except PaymentProcessorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payment = Payment(
        id=uuid.uuid4(),
        tenant_id=ctx.tenant_id,
        sale_id=sale.id,
        method="stripe_card",
        amount=quantize_money(body.amount),
        processor_payment_id=intent.intent_id,
        status="pending",
        created_by_id=staff.id if staff else None,
    )
    db.add(payment)
    return payment, intent


_STRIPE_STATUS_TO_AUDIT = {
    "succeeded": AuditAction.PAYMENT_RECORDED,
    "failed": AuditAction.PAYMENT_FAILED,
    "canceled": AuditAction.PAYMENT_FAILED,
}


# ---------------------------------------------------------------------------
# Routes (mounted on the shared sales_router — WARNING #6)
# ---------------------------------------------------------------------------


@sales_router.post(
    "/{sale_id}/payments/",
    response_model=Union[PaymentResponse, StripeIntentResponse],
)
async def create_payment(
    sale_id: UUID,
    body: PaymentCreate,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.RECORD_PAYMENT)),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx, sale_id, require_open=True)
    staff = await resolve_staff(ctx, db)
    method = body.method

    if method == "cash":
        payment = await _record_cash_payment(body, sale, staff, ctx, db)
        await log_action(
            db, ctx, AuditAction.PAYMENT_RECORDED, "payment", payment.id,
            staff_id=staff.id if staff else None,
            patient_id=sale.patient_id,
            metadata={"sale_id": str(sale.id), "method": "cash"},
            ip_address=request.client.host if request.client else None,
        )

    elif method == "external_card":
        payment = await _record_external_card(body, sale, staff, ctx, db)
        await log_action(
            db, ctx, AuditAction.PAYMENT_RECORDED, "payment", payment.id,
            staff_id=staff.id if staff else None,
            patient_id=sale.patient_id,
            metadata={"sale_id": str(sale.id), "method": "external_card"},
            ip_address=request.client.host if request.client else None,
        )

    elif method == "write_off":
        # Inline OWNER/ADMIN gate (require_permission ran for RECORD_PAYMENT; write_off
        # tightens to RECORD_WRITE_OFF — ClinicalAction restricted to ADMIN/OWNER).
        from backend.core.permissions import PERMISSION_MATRIX, StaffRole

        allowed = PERMISSION_MATRIX.get(ClinicalAction.RECORD_WRITE_OFF, set())
        try:
            caller_role = StaffRole(ctx.role)
        except ValueError:
            raise HTTPException(status_code=403, detail="Unknown role")
        if caller_role not in allowed:
            raise HTTPException(
                status_code=403,
                detail="RECORD_WRITE_OFF not permitted for this role",
            )
        payment = await _record_writeoff(body, sale, staff, ctx, db)
        await log_action(
            db, ctx, AuditAction.WRITE_OFF_RECORDED, "payment", payment.id,
            staff_id=staff.id if staff else None,
            patient_id=sale.patient_id,
            metadata={
                "sale_id": str(sale.id),
                "amount": str(payment.amount),
                "reason_note": payment.reason_note,
            },
            ip_address=request.client.host if request.client else None,
        )

    elif method == "stripe_card":
        tenant = await _load_tenant(db, ctx.tenant_id)
        payment, intent = await _initiate_stripe_payment(
            body, sale, tenant, staff, ctx, db
        )
        await log_action(
            db, ctx, AuditAction.PAYMENT_RECORDED, "payment", payment.id,
            staff_id=staff.id if staff else None,
            patient_id=sale.patient_id,
            metadata={
                "sale_id": str(sale.id),
                "method": "stripe_card",
                "intent_id": intent.intent_id,
                "status": "pending",
            },
            ip_address=request.client.host if request.client else None,
        )
        await db.commit()
        return StripeIntentResponse(
            paymentId=payment.id,
            clientSecret=intent.client_secret,
            publishableKey=tenant.stripe_publishable_key or "",
            intentId=intent.intent_id,
        )

    else:
        raise HTTPException(status_code=400, detail=f"Unknown method: {method}")

    await db.commit()
    payment = (
        await db.execute(
            select(Payment).where(Payment.id == payment.id)
        )
    ).scalar_one()
    return PaymentResponse.model_validate(payment, from_attributes=True)


@sales_router.post(
    "/{sale_id}/payments/stripe-confirm/", response_model=PaymentResponse
)
async def stripe_confirm(
    sale_id: UUID,
    body: StripeConfirmRequest,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.RECORD_PAYMENT)),
    db: AsyncSession = Depends(get_db),
):
    sale = await _load_sale(db, ctx, sale_id)
    staff = await resolve_staff(ctx, db)
    tenant = await _load_tenant(db, ctx.tenant_id)

    payment = (
        await db.execute(
            select(Payment).where(
                Payment.tenant_id == ctx.tenant_id,
                Payment.sale_id == sale_id,
                Payment.processor_payment_id == body.payment_intent_id,
            )
        )
    ).scalar_one_or_none()
    if not payment:
        raise HTTPException(
            status_code=404,
            detail=f"No Payment with intent_id {body.payment_intent_id}",
        )

    processor = get_processor("stripe")
    try:
        confirmed = await processor.confirm_payment(tenant, body.payment_intent_id)
    except PaymentProcessorError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    payment.status = confirmed.status if confirmed.status in {
        "succeeded", "failed", "requires_action", "processing", "canceled",
    } else "failed"
    payment.processor_charge_id = confirmed.charge_id
    payment.last4 = confirmed.last4
    payment.card_brand = confirmed.brand

    audit_action = _STRIPE_STATUS_TO_AUDIT.get(
        payment.status, AuditAction.PAYMENT_RECORDED
    )
    await log_action(
        db, ctx, audit_action, "payment", payment.id,
        staff_id=staff.id if staff else None,
        patient_id=sale.patient_id,
        metadata={
            "sale_id": str(sale.id),
            "intent_id": body.payment_intent_id,
            "status": payment.status,
            "stripe_error": confirmed.failure_reason,
        },
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()
    payment = (
        await db.execute(
            select(Payment).where(Payment.id == payment.id)
        )
    ).scalar_one()
    return PaymentResponse.model_validate(payment, from_attributes=True)


@sales_router.delete(
    "/{sale_id}/payments/{payment_id}/", status_code=204
)
async def cancel_pending_payment(
    sale_id: UUID,
    payment_id: UUID,
    request: Request,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.RECORD_PAYMENT)),
    db: AsyncSession = Depends(get_db),
):
    staff = await resolve_staff(ctx, db)
    payment = (
        await db.execute(
            select(Payment).where(
                Payment.id == payment_id,
                Payment.tenant_id == ctx.tenant_id,
                Payment.sale_id == sale_id,
            )
        )
    ).scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status != "pending" or payment.method != "stripe_card":
        raise HTTPException(
            status_code=409,
            detail="Only pending stripe_card payments can be canceled",
        )
    # Pitfall 7: cancel the orphan PaymentIntent via the processor seam.
    if payment.processor_payment_id:
        tenant = await _load_tenant(db, ctx.tenant_id)
        if tenant.stripe_secret_key_encrypted:
            await get_processor("stripe").cancel_intent(
                tenant, payment.processor_payment_id
            )
    payment.status = "canceled"
    await log_action(
        db, ctx, AuditAction.PAYMENT_FAILED, "payment", payment.id,
        staff_id=staff.id if staff else None,
        metadata={
            "sale_id": str(sale_id),
            "reason": "staff_canceled",
        },
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return None
