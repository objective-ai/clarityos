"""POS-08 — PUT /admin/payment-config/ encrypts secrets before persistence.

Asserts the Fernet ciphertext prefix ``gAAAA`` lands in the encrypted column
(not the plaintext), and that an invalid Stripe key format is rejected with a
400 BEFORE any DB write.
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet


@pytest.fixture(autouse=True)
def _set_fernet_key(monkeypatch):
    """Provide a real Fernet key so encrypt_secret/decrypt_secret round-trip works."""
    from backend.core import config

    monkeypatch.setattr(
        config.settings, "PAYMENTS_FERNET_KEY", Fernet.generate_key().decode()
    )
    if hasattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS"):
        monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", "")


def test_router_has_get_and_put():
    """Both GET / and PUT / are registered."""
    from backend.api.routes.admin_payment_config import router

    methods_by_path: dict[str, set[str]] = {}
    for r in router.routes:
        if hasattr(r, "methods") and hasattr(r, "path"):
            methods_by_path.setdefault(r.path, set()).update(r.methods)

    # Path is "/" with prefix "/api/admin/payment-config" applied at include_router time
    root_methods = methods_by_path.get("/api/admin/payment-config/", set())
    assert "GET" in root_methods
    assert "PUT" in root_methods


@pytest.mark.asyncio
async def test_update_encrypts_secret_before_persistence():
    """The plaintext secret key is encrypted (Fernet ciphertext) before being
    written to ``Tenant.stripe_secret_key_encrypted``."""
    from backend.api.routes.admin_payment_config import update_payment_config
    from backend.schemas.sales import PaymentConfigUpdate
    from backend.services.payments.crypto import decrypt_secret

    tenant = MagicMock()
    tenant.id = uuid4()
    tenant.stripe_publishable_key = None
    tenant.stripe_secret_key_encrypted = None
    tenant.stripe_webhook_secret_encrypted = None
    tenant.sales_tax_rate = Decimal("0.0725")

    db = AsyncMock()
    db.get = AsyncMock(return_value=tenant)
    db.commit = AsyncMock()
    ctx = MagicMock(tenant_id=tenant.id)

    body = PaymentConfigUpdate(
        stripePublishableKey="pk_test_abc123XYZ",
        stripeSecretKey="sk_test_xyz789ABC",
        stripeWebhookSecret="whsec_signing456DEF",
    )

    with patch(
        "backend.api.routes.admin_payment_config.resolve_staff",
        new_callable=AsyncMock,
        return_value=None,
    ), patch(
        "backend.api.routes.admin_payment_config.log_action",
        new_callable=AsyncMock,
    ) as la:
        resp = await update_payment_config(body, ctx=ctx, db=db)  # type: ignore[arg-type]

    # Plaintext publishable key stored as-is
    assert tenant.stripe_publishable_key == "pk_test_abc123XYZ"
    # Fernet ciphertext (urlsafe-base64) starts with "gAAAA"
    assert tenant.stripe_secret_key_encrypted is not None
    assert tenant.stripe_secret_key_encrypted.startswith("gAAAA"), (
        "Secret was NOT encrypted before persistence: "
        f"{tenant.stripe_secret_key_encrypted[:30]}"
    )
    assert tenant.stripe_webhook_secret_encrypted is not None
    assert tenant.stripe_webhook_secret_encrypted.startswith("gAAAA")

    # Round-trip decrypt
    assert decrypt_secret(tenant.stripe_secret_key_encrypted) == "sk_test_xyz789ABC"
    assert (
        decrypt_secret(tenant.stripe_webhook_secret_encrypted)
        == "whsec_signing456DEF"
    )

    # Response shape preserves booleans (never leaks ciphertext or plaintext)
    assert resp.has_secret_key is True
    assert resp.has_webhook_secret is True
    assert resp.stripe_publishable_key == "pk_test_abc123XYZ"

    # Audit fired with the right action
    la.assert_awaited_once()
    args, kwargs = la.call_args
    from backend.db.models.tenant.clinical import AuditAction

    assert args[2] is AuditAction.STRIPE_KEYS_UPDATED
    assert sorted(kwargs["metadata"]["updated_fields"]) == [
        "publishable",
        "secret",
        "webhook",
    ]


@pytest.mark.asyncio
async def test_invalid_secret_key_format_rejected_before_encryption():
    """A malformed sk_ key raises 400 BEFORE any encrypt/DB write."""
    from fastapi import HTTPException

    from backend.api.routes.admin_payment_config import update_payment_config
    from backend.schemas.sales import PaymentConfigUpdate

    tenant = MagicMock()
    tenant.id = uuid4()
    tenant.stripe_publishable_key = None
    tenant.stripe_secret_key_encrypted = None
    tenant.stripe_webhook_secret_encrypted = None
    tenant.sales_tax_rate = Decimal("0.0725")

    db = AsyncMock()
    db.get = AsyncMock(return_value=tenant)
    db.commit = AsyncMock()
    ctx = MagicMock(tenant_id=tenant.id)

    body = PaymentConfigUpdate(stripeSecretKey="not_a_real_key")
    with pytest.raises(HTTPException) as ei:
        await update_payment_config(body, ctx=ctx, db=db)  # type: ignore[arg-type]
    assert ei.value.status_code == 400
    # Nothing persisted
    assert tenant.stripe_secret_key_encrypted is None
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_get_returns_boolean_flags_not_secret_material():
    """GET / surfaces hasSecretKey / hasWebhookSecret booleans — never decrypts."""
    from backend.api.routes.admin_payment_config import get_payment_config

    tenant = MagicMock()
    tenant.id = uuid4()
    tenant.stripe_publishable_key = "pk_live_abc"
    tenant.stripe_secret_key_encrypted = "gAAAAciphertext"
    tenant.stripe_webhook_secret_encrypted = None
    tenant.sales_tax_rate = Decimal("0.0825")

    db = AsyncMock()
    db.get = AsyncMock(return_value=tenant)
    ctx = MagicMock(tenant_id=tenant.id)

    resp = await get_payment_config(ctx=ctx, db=db)  # type: ignore[arg-type]
    assert resp.stripe_publishable_key == "pk_live_abc"
    assert resp.has_secret_key is True
    assert resp.has_webhook_secret is False
    assert resp.sales_tax_rate == Decimal("0.0825")
    # The plaintext secret never appears in the response payload (no such field).
    assert not hasattr(resp, "stripe_secret_key")
