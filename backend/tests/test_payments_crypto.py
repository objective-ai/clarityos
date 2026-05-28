"""POS-08 — Fernet encrypt/decrypt round-trip + MultiFernet rotation."""

import pytest
from cryptography.fernet import Fernet


@pytest.fixture(autouse=True)
def _set_fernet_key(monkeypatch):
    from backend.core import config

    monkeypatch.setattr(
        config.settings, "PAYMENTS_FERNET_KEY", Fernet.generate_key().decode()
    )
    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", "")


def test_round_trip():
    from backend.services.payments.crypto import decrypt_secret, encrypt_secret

    ct = encrypt_secret("sk_test_abc123")
    assert ct.startswith("gAAAA")
    assert decrypt_secret(ct) == "sk_test_abc123"


def test_decrypt_mangled_raises_runtime():
    from backend.services.payments.crypto import decrypt_secret

    with pytest.raises(RuntimeError, match="Tenant payment secret unreadable"):
        decrypt_secret("gAAAAtotallyMangled")


def test_empty_key_loud_failure(monkeypatch):
    from backend.core import config
    from backend.services.payments.crypto import encrypt_secret

    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", "")
    with pytest.raises(RuntimeError, match="PAYMENTS_FERNET_KEY must be set"):
        encrypt_secret("anything")


def test_encrypt_empty_string_raises_value_error():
    from backend.services.payments.crypto import encrypt_secret

    with pytest.raises(ValueError, match="empty secret"):
        encrypt_secret("")


def test_multifernet_rotation_decrypts_with_old(monkeypatch):
    from backend.core import config
    from backend.services.payments.crypto import decrypt_secret, encrypt_secret

    # Encrypt with old key
    old_key = Fernet.generate_key().decode()
    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", old_key)
    ct = encrypt_secret("sk_old")
    # Rotate: new is primary, old is fallback
    new_key = Fernet.generate_key().decode()
    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", new_key)
    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", old_key)
    # Decryption still works
    assert decrypt_secret(ct) == "sk_old"


def test_rotate_secret_re_encrypts_with_primary(monkeypatch):
    from backend.core import config
    from backend.services.payments.crypto import (
        decrypt_secret,
        encrypt_secret,
        rotate_secret,
    )

    old_key = Fernet.generate_key().decode()
    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", old_key)
    ct_old = encrypt_secret("sk_rotate_me")
    new_key = Fernet.generate_key().decode()
    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY", new_key)
    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", old_key)
    ct_new = rotate_secret(ct_old)
    # Clear old key — decrypts only with new now
    monkeypatch.setattr(config.settings, "PAYMENTS_FERNET_KEY_PREVIOUS", "")
    assert decrypt_secret(ct_new) == "sk_rotate_me"
