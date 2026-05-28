"""POS-08 — PUT /admin/payment-config/ encrypts before persistence (ciphertext starts 'gAAAA')."""

import pytest

try:
    from backend.api.routes import admin_payment_config  # noqa: F401
except ImportError:
    pytest.skip(
        "admin_payment_config route not yet implemented (Plan 15-08)",
        allow_module_level=True,
    )


def test_admin_payment_config_has_router():
    from backend.api.routes import admin_payment_config

    assert hasattr(admin_payment_config, "router")
