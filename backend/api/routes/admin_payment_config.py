"""Admin POS payment-config endpoint — OWNER-only (POS-08, POS-11).

GET returns metadata only (publishable key + booleans for secrets). The
plaintext Stripe secret + webhook secret are NEVER decrypted to the FE; the
hasSecretKey / hasWebhookSecret flags let the UI signal "configured" without
exposing ciphertext or plaintext (Pitfall 11).

PUT encrypts via :func:`encrypt_secret` before persistence (RESEARCH Pitfall 11).
Each field is independently optional — sending only ``stripePublishableKey``
leaves the encrypted columns untouched. Sending an empty string for any
field clears it.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.audit import log_action
from backend.core.entitlements import Entitlement, require_entitlement
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext, resolve_staff
from backend.db.models.public.saas import Tenant
from backend.db.models.tenant.clinical import AuditAction
from backend.db.session import get_db
from backend.schemas.sales import PaymentConfigResponse, PaymentConfigUpdate
from backend.services.payments.crypto import encrypt_secret

router = APIRouter(
    prefix="/api/admin/payment-config",
    tags=["admin-payment-config"],
    dependencies=[Depends(require_entitlement(Entitlement.RETAIL_POS))],
)

# Stripe key prefixes — UI-friendly client-side validation before encryption.
PUBLISHABLE_RE = re.compile(r"^pk_(test|live)_[A-Za-z0-9]+$")
SECRET_RE = re.compile(r"^sk_(test|live)_[A-Za-z0-9]+$")
WHSEC_RE = re.compile(r"^whsec_[A-Za-z0-9]+$")


def _response(tenant: Tenant) -> PaymentConfigResponse:
    return PaymentConfigResponse(
        stripe_publishable_key=tenant.stripe_publishable_key,
        has_secret_key=bool(tenant.stripe_secret_key_encrypted),
        has_webhook_secret=bool(tenant.stripe_webhook_secret_encrypted),
        sales_tax_rate=tenant.sales_tax_rate,
    )


@router.get("/", response_model=PaymentConfigResponse)
async def get_payment_config(
    ctx: TenantContext = Depends(
        require_permission(ClinicalAction.MANAGE_PAYMENT_CONFIG)
    ),
    db: AsyncSession = Depends(get_db),
) -> PaymentConfigResponse:
    tenant = await db.get(Tenant, ctx.tenant_id)
    if tenant is None:
        raise HTTPException(404, "Tenant not found")
    return _response(tenant)


@router.put("/", response_model=PaymentConfigResponse)
async def update_payment_config(
    body: PaymentConfigUpdate,
    ctx: TenantContext = Depends(
        require_permission(ClinicalAction.MANAGE_PAYMENT_CONFIG)
    ),
    db: AsyncSession = Depends(get_db),
) -> PaymentConfigResponse:
    tenant = await db.get(Tenant, ctx.tenant_id)
    if tenant is None:
        raise HTTPException(404, "Tenant not found")

    updated_fields: list[str] = []

    if body.stripe_publishable_key is not None:
        val = body.stripe_publishable_key
        if val and not PUBLISHABLE_RE.match(val):
            raise HTTPException(
                400,
                "That doesn't look like a Stripe publishable key. They start with "
                "pk_test_ or pk_live_.",
            )
        tenant.stripe_publishable_key = val or None
        updated_fields.append("publishable")

    if body.stripe_secret_key is not None:
        val = body.stripe_secret_key
        if val and not SECRET_RE.match(val):
            raise HTTPException(
                400,
                "That doesn't look like a Stripe secret key. They start with "
                "sk_test_ or sk_live_.",
            )
        tenant.stripe_secret_key_encrypted = encrypt_secret(val) if val else None
        updated_fields.append("secret")

    if body.stripe_webhook_secret is not None:
        val = body.stripe_webhook_secret
        if val and not WHSEC_RE.match(val):
            raise HTTPException(
                400, "Webhook signing secrets start with whsec_."
            )
        tenant.stripe_webhook_secret_encrypted = encrypt_secret(val) if val else None
        updated_fields.append("webhook")

    staff = await resolve_staff(ctx, db)
    await log_action(
        db,
        ctx,
        AuditAction.STRIPE_KEYS_UPDATED,
        "tenant",
        tenant.id,
        staff_id=staff.id if staff else None,
        metadata={"updated_fields": updated_fields},
    )
    await db.commit()
    return _response(tenant)
