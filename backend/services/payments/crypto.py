"""Per-tenant secret encryption via Fernet (AES-128-CBC + HMAC-SHA256).

POS-08: Stripe secret keys MUST never hit disk in plaintext. Master key lives in
`settings.PAYMENTS_FERNET_KEY` env var; generate once per environment via
`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.

ROTATION (per RESEARCH Pitfall 5): never rotate without MultiFernet transition window.
Set PAYMENTS_FERNET_KEY = new key and PAYMENTS_FERNET_KEY_PREVIOUS = old key during
transition; existing ciphertexts decrypt with old, new writes use new. After re-encryption
pass via `rotate_secret()` on every Tenant, clear PAYMENTS_FERNET_KEY_PREVIOUS.
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from backend.core.config import settings


def _build_fernet() -> MultiFernet:
    if not settings.PAYMENTS_FERNET_KEY:
        raise RuntimeError(
            "PAYMENTS_FERNET_KEY must be set — generate via "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    keys = [Fernet(settings.PAYMENTS_FERNET_KEY.encode())]
    if settings.PAYMENTS_FERNET_KEY_PREVIOUS:
        for prev in settings.PAYMENTS_FERNET_KEY_PREVIOUS.split(","):
            prev = prev.strip()
            if prev:
                keys.append(Fernet(prev.encode()))
    return MultiFernet(keys)


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        raise ValueError("Cannot encrypt empty secret")
    return _build_fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _build_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as e:
        raise RuntimeError(
            "Tenant payment secret unreadable — re-enter in Admin > POS Payments"
        ) from e


def rotate_secret(ciphertext: str) -> str:
    """Decrypt with current MultiFernet, re-encrypt with primary key only."""
    return encrypt_secret(decrypt_secret(ciphertext))
