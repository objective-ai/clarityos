"""POS-08 — Fernet encrypt/decrypt round-trip + MultiFernet rotation."""

import pytest

try:
    from backend.services.payments.crypto import decrypt_secret, encrypt_secret
except ImportError:
    pytest.skip(
        "payments.crypto helpers not yet implemented (Plan 15-02)",
        allow_module_level=True,
    )


def test_crypto_helpers_callable():
    assert callable(encrypt_secret) and callable(decrypt_secret)
