"""POS-03 — receipt email delivery via Postmark with PDF attachment (NOT Resend — BAA decision)."""

import pytest

try:
    from backend.services.messaging.templates import receipt_email  # noqa: F401
except ImportError:
    pytest.skip(
        "receipt_email template not yet implemented (Plan 15-06)",
        allow_module_level=True,
    )


def test_receipt_email_module_exports_renderer():
    from backend.services.messaging.templates import receipt_email

    assert hasattr(receipt_email, "render_receipt_email") or hasattr(
        receipt_email, "send_receipt_email"
    )
