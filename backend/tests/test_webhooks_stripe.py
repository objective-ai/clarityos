"""POS-02 — Stripe webhook signature + idempotency + monotonic priority.

These are unit tests over the pure helpers + handler — we mock the DB and
StripeProcessor so we don't need real Stripe keys or a live database.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


def test_can_advance_monotonic_priority() -> None:
    """``_can_advance`` enforces the priority table from Plan 15-08."""
    from backend.api.routes.webhooks import _can_advance

    # Upgrades allowed
    assert _can_advance("pending", "succeeded") is True
    assert _can_advance("pending", "processing") is True
    assert _can_advance("processing", "succeeded") is True
    # Refund + failure can supersede success (visibility wins)
    assert _can_advance("succeeded", "refunded") is True
    assert _can_advance("succeeded", "failed") is True
    # Downgrades blocked
    assert _can_advance("succeeded", "processing") is False
    assert _can_advance("succeeded", "pending") is False
    assert _can_advance("refunded", "pending") is False
    # Equal priority allowed (idempotent re-application)
    assert _can_advance("succeeded", "succeeded") is True


def test_stripe_event_to_payment_status_map_covers_core_events() -> None:
    from backend.api.routes.webhooks import _STRIPE_EVENT_TO_PAYMENT_STATUS

    assert _STRIPE_EVENT_TO_PAYMENT_STATUS["payment_intent.succeeded"] == "succeeded"
    assert _STRIPE_EVENT_TO_PAYMENT_STATUS["payment_intent.payment_failed"] == "failed"
    assert _STRIPE_EVENT_TO_PAYMENT_STATUS["payment_intent.canceled"] == "canceled"
    assert _STRIPE_EVENT_TO_PAYMENT_STATUS["charge.refunded"] == "refunded"


def test_stripe_handler_present() -> None:
    """The async handler exists on the router."""
    from backend.api.routes import webhooks

    assert hasattr(webhooks, "stripe_webhook")
    # And the router has at least one /stripe route
    paths = [r.path for r in webhooks.router.routes if hasattr(r, "path")]
    assert any("/stripe" in p for p in paths), paths


@pytest.mark.asyncio
async def test_idempotent_duplicate_event_short_circuits() -> None:
    """Second delivery of same Stripe event.id returns ignored=duplicate.

    The idempotency table (StripeWebhookEvent.event_id UNIQUE) is queried
    BEFORE any Payment mutation; on duplicate we early-return and never touch
    Payment rows (Pitfall 6).
    """
    from backend.api.routes import webhooks
    from backend.services.payments.base import WebhookEvent

    tenant_id = uuid4()
    tenant = MagicMock()
    tenant.id = tenant_id
    tenant.stripe_webhook_secret_encrypted = "encrypted-secret"

    # First execute() call = SELECT for idempotency check; return an existing row
    existing_event = MagicMock()
    existing_result = MagicMock()
    existing_result.scalar_one_or_none = MagicMock(return_value=existing_event)

    db = AsyncMock()
    db.get = AsyncMock(return_value=tenant)
    db.execute = AsyncMock(return_value=existing_result)
    db.add = MagicMock()
    db.commit = AsyncMock()

    request = MagicMock()
    request.headers = {
        "X-Webhook-Internal": "valid-seal",
        "Stripe-Signature": "t=1,v1=abc",
    }
    raw_body = (
        b'{"id":"evt_dup1","type":"payment_intent.succeeded",'
        b'"data":{"object":{"id":"pi_1","metadata":{"tenant_id":"'
        + str(tenant_id).encode()
        + b'"}}}}'
    )
    request.body = AsyncMock(return_value=raw_body)

    fake_event = WebhookEvent(
        event_id="evt_dup1",
        event_type="payment_intent.succeeded",
        payment_intent_id="pi_1",
        charge_id=None,
        raw_payload={},
    )

    with patch.object(
        webhooks, "_check_internal_seal", lambda r: None
    ), patch(
        "backend.services.payments.stripe_processor.StripeProcessor.verify_webhook_signature",
        return_value=fake_event,
    ):
        result = await webhooks.stripe_webhook(request, db)  # type: ignore[arg-type]

    assert result == {
        "ok": True,
        "ignored": "duplicate",
        "event_id": "evt_dup1",
    }
    # NO Payment row inserted, NO new StripeWebhookEvent inserted, NO commit.
    db.add.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_invalid_signature_rejected_no_state_change() -> None:
    """Mangled signature → 403; never reaches idempotency / Payment update."""
    from fastapi import HTTPException

    from backend.api.routes import webhooks

    tenant_id = uuid4()
    tenant = MagicMock()
    tenant.id = tenant_id
    tenant.stripe_webhook_secret_encrypted = "encrypted-secret"

    db = AsyncMock()
    db.get = AsyncMock(return_value=tenant)
    db.add = MagicMock()
    db.commit = AsyncMock()

    request = MagicMock()
    request.headers = {
        "X-Webhook-Internal": "valid-seal",
        "Stripe-Signature": "t=1,v1=tampered",
    }
    body = (
        b'{"id":"evt_x","type":"payment_intent.succeeded",'
        b'"data":{"object":{"id":"pi_1","metadata":{"tenant_id":"'
        + str(tenant_id).encode()
        + b'"}}}}'
    )
    request.body = AsyncMock(return_value=body)

    with patch.object(
        webhooks, "_check_internal_seal", lambda r: None
    ), patch(
        "backend.services.payments.stripe_processor.StripeProcessor.verify_webhook_signature",
        side_effect=ValueError("invalid signature"),
    ):
        with pytest.raises(HTTPException) as ei:
            await webhooks.stripe_webhook(request, db)  # type: ignore[arg-type]
    assert ei.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_missing_tenant_id_metadata_rejected() -> None:
    """Stripe event payload without metadata.tenant_id → 400 (cannot resolve tenant)."""
    from fastapi import HTTPException

    from backend.api.routes import webhooks

    db = AsyncMock()
    db.get = AsyncMock()

    request = MagicMock()
    request.headers = {
        "X-Webhook-Internal": "valid-seal",
        "Stripe-Signature": "t=1,v1=abc",
    }
    request.body = AsyncMock(
        return_value=b'{"id":"evt_x","type":"foo","data":{"object":{"metadata":{}}}}'
    )

    with patch.object(webhooks, "_check_internal_seal", lambda r: None):
        with pytest.raises(HTTPException) as ei:
            await webhooks.stripe_webhook(request, db)  # type: ignore[arg-type]
    assert ei.value.status_code == 400
    db.get.assert_not_called()
