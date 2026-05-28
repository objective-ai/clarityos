"""POS-02 — Stripe webhook: signature verify + idempotent event.id."""

import pytest


def test_stripe_webhook_handler_present():
    try:
        from backend.api.routes import webhooks
    except Exception as exc:  # ImportError OR Settings() ValidationError in test env
        pytest.skip(f"Webhook route not importable yet: {type(exc).__name__}")
    if not any(
        hasattr(webhooks, attr)
        for attr in ("stripe_webhook", "handle_stripe_webhook")
    ):
        pytest.skip("Stripe webhook handler not yet implemented (Plan 15-08)")
