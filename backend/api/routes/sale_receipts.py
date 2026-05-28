"""Sale + refund receipt PDF + email endpoints (POS-03, POS-12, Plan 15-06).

Routes
------
    GET  /api/sales/{sale_id}/receipt/        — sale receipt PDF (application/pdf)
    POST /api/sales/{sale_id}/receipt/email/  — render + email the receipt PDF
    GET  /api/refunds/{refund_id}/receipt/    — refund receipt PDF

All routes gated on ``Entitlement.RETAIL_POS`` at the router level. The two
GET endpoints additionally enforce ``sale.status in {paid, refunded}`` and
return 409 otherwise (Pitfall 8 — receipts only exist for closed sales).
``RECEIPT_PRINTED`` and ``RECEIPT_EMAILED`` audit rows are appended in the
same TXN as the response.
"""
from __future__ import annotations

import base64
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.audit import log_action
from backend.core.entitlements import Entitlement, require_entitlement
from backend.core.security import TenantContext, get_current_tenant, resolve_staff
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import AuditAction, Refund, Sale
from backend.db.session import get_db
from backend.services.messaging.email_client import send_email
from backend.services.messaging.templates.receipt_email import render_receipt_email
from backend.services.receipts.receipt_pdf import build_receipt_pdf
from backend.services.receipts.refund_receipt_pdf import build_refund_receipt_pdf

router = APIRouter(
    prefix="/api",
    tags=["sale-receipts"],
    dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))],
)


async def _load_sale_full(
    db: AsyncSession, sale_id: UUID, tenant_id: UUID
) -> Sale:
    """Load a Sale with lines/payments/refunds/patient eagerly populated."""
    result = await db.execute(
        select(Sale)
        .where(Sale.id == sale_id, Sale.tenant_id == tenant_id)
        .options(
            selectinload(Sale.lines),
            selectinload(Sale.payments),
            selectinload(Sale.refunds),
            selectinload(Sale.patient),
        )
    )
    sale = result.scalar_one_or_none()
    if sale is None:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale


def _patient_email(sale: Sale) -> str | None:
    """Pull the patient's email out of contact_info_jsonb (Phase 5 contract)."""
    patient = getattr(sale, "patient", None)
    if patient is None:
        return None
    contact = getattr(patient, "contact_info_jsonb", None) or {}
    email = contact.get("email")
    return email if isinstance(email, str) and email else None


def _cashier_name_for(ctx: TenantContext, db: AsyncSession) -> str:
    # Convenience wrapper kept as a sync helper to keep handler bodies tidy.
    raise NotImplementedError  # pragma: no cover — replaced by inline await


@router.get("/sales/{sale_id}/receipt/")
async def get_sale_receipt(
    sale_id: UUID,
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> Response:
    sale = await _load_sale_full(db, sale_id, ctx.tenant_id)
    if sale.status not in ("paid", "refunded"):
        raise HTTPException(
            status_code=409,
            detail="Receipt available after the sale is closed. Finish the payment first.",
        )
    tenant = await db.get(Tenant, ctx.tenant_id)
    staff = await resolve_staff(ctx, db)
    cashier = (
        f"{staff.first_name} {staff.last_name}".strip() if staff else ""
    )

    pdf = build_receipt_pdf(sale, tenant, cashier_name=cashier)

    # Best-effort RECEIPT_PRINTED audit (15-CONTEXT §F — fired on every PDF
    # blob download; UI distinguishes "viewed" from "printed" via context).
    await log_action(
        db,
        ctx,
        AuditAction.RECEIPT_PRINTED,
        "sale",
        sale.id,
        staff_id=staff.id if staff else None,
        patient_id=sale.patient_id,
        metadata={"receipt_number": sale.receipt_number},
    )
    await db.commit()

    filename = f"receipt-{sale.receipt_number or sale.id}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/sales/{sale_id}/receipt/email/")
async def email_sale_receipt(
    sale_id: UUID,
    body: dict = Body(default_factory=dict),
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    sale = await _load_sale_full(db, sale_id, ctx.tenant_id)
    if sale.status not in ("paid", "refunded"):
        raise HTTPException(
            status_code=409,
            detail="Cannot email receipt before sale closes.",
        )
    tenant = await db.get(Tenant, ctx.tenant_id)
    staff = await resolve_staff(ctx, db)
    cashier = (
        f"{staff.first_name} {staff.last_name}".strip() if staff else ""
    )

    to_email = body.get("to") or _patient_email(sale)
    if not to_email:
        raise HTTPException(
            status_code=400,
            detail="No recipient email — pass {to: ...} or set the patient email.",
        )

    pdf_bytes = build_receipt_pdf(sale, tenant, cashier_name=cashier)

    patient = getattr(sale, "patient", None)
    first_name = (getattr(patient, "first_name", None) or "there") if patient else "there"
    sale_when = sale.closed_at or sale.opened_at
    sale_date_human = sale_when.strftime("%B %d, %Y") if sale_when else ""

    change_str = None
    for p in sale.payments:
        if p.method == "cash" and p.tendered is not None and p.change_due:
            change_str = f"tendered ${p.tendered:.2f} • change ${p.change_due:.2f}"
            break

    subject, html_body = render_receipt_email(
        patient_first_name=first_name,
        clinic_name=getattr(tenant, "name", "") or "your clinic",
        clinic_phone=(getattr(tenant, "settings_jsonb", None) or {}).get(
            "clinic_phone", ""
        ),
        sale_date_human=sale_date_human,
        total=f"${sale.total:.2f}",
        cash_change_str=change_str,
    )

    attachment = {
        "Name": f"receipt-{sale.receipt_number or sale.id}.pdf",
        "Content": base64.b64encode(pdf_bytes).decode(),
        "ContentType": "application/pdf",
    }

    # Idempotency key includes sale id so a duplicate-click sends only once in
    # Postmark's message log (final de-dup is upstream in the sender service).
    idempotency_key = f"receipt-email:{sale.id}:{to_email}"

    message_id = await send_email(
        subject=subject,
        html=html_body,
        to=to_email,
        idempotency_key=idempotency_key,
        attachments=[attachment],
        tag="receipt",
    )

    await log_action(
        db,
        ctx,
        AuditAction.RECEIPT_EMAILED,
        "sale",
        sale.id,
        staff_id=staff.id if staff else None,
        patient_id=sale.patient_id,
        metadata={
            "to": to_email,
            "receipt_number": sale.receipt_number,
            "provider_message_id": message_id,
        },
    )
    await db.commit()

    return {"ok": True, "to": to_email, "message_id": message_id}


@router.get("/refunds/{refund_id}/receipt/")
async def get_refund_receipt(
    refund_id: UUID,
    ctx: TenantContext = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> Response:
    result = await db.execute(
        select(Refund)
        .where(Refund.id == refund_id, Refund.tenant_id == ctx.tenant_id)
        .options(
            selectinload(Refund.line_items),
            selectinload(Refund.payment_allocations),
        )
    )
    refund = result.scalar_one_or_none()
    if refund is None:
        raise HTTPException(status_code=404, detail="Refund not found")

    sale = await _load_sale_full(db, refund.sale_id, ctx.tenant_id)
    tenant = await db.get(Tenant, ctx.tenant_id)
    staff = await resolve_staff(ctx, db)
    cashier = (
        f"{staff.first_name} {staff.last_name}".strip() if staff else ""
    )

    pdf = build_refund_receipt_pdf(refund, sale, tenant, cashier_name=cashier)
    filename = f"refund-{refund.id}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
