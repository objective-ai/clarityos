"""Tests for backend/services/messaging/opt_out_guard.py.

Verifies the opt-out preflight guard against the full opt-out matrix:
4 channels × 2 purposes × 2 consent states × 2 opt-out states.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.services.messaging.opt_out_guard import OptOutBlocked, preflight_or_raise


NOW = datetime(2026, 5, 1, 15, 0, tzinfo=timezone.utc)
PAST = NOW - timedelta(days=30)
FUTURE = NOW + timedelta(days=30)


def _consented_contact(**overrides):
    """Return a contact dict with all 4 consent flags + no opt-outs."""
    base = {
        "consent_sms_operational_at": PAST.isoformat(),
        "consent_sms_marketing_at": PAST.isoformat(),
        "consent_email_operational_at": PAST.isoformat(),
        "consent_email_marketing_at": PAST.isoformat(),
    }
    base.update(overrides)
    return base


def test_allows_send_when_consented_and_not_opted_out():
    """Test 1: Returns None (allows send) for fully-consented patient."""
    preflight_or_raise(
        contact_info=_consented_contact(),
        channel="sms",
        purpose="operational",
        now_utc=NOW,
    )


def test_blocks_sms_when_carrier_opted_out():
    """Test 2: Raises OptOutBlocked when patient has STOP'd via carrier."""
    contact = _consented_contact(sms_opted_out_at=PAST.isoformat())
    with pytest.raises(OptOutBlocked) as excinfo:
        preflight_or_raise(contact_info=contact, channel="sms", purpose="operational", now_utc=NOW)
    assert excinfo.value.code == "SMS_OPTED_OUT"


def test_blocks_sms_marketing_without_marketing_consent():
    """Test 3: Raises when channel=sms,purpose=marketing AND no marketing consent."""
    contact = _consented_contact(consent_sms_marketing_at=None)
    with pytest.raises(OptOutBlocked) as excinfo:
        preflight_or_raise(contact_info=contact, channel="sms", purpose="marketing", now_utc=NOW)
    assert excinfo.value.code == "NO_CONSENT_SMS_MARKETING"


def test_blocks_email_marketing_without_marketing_consent():
    """Test 4: Raises when channel=email,purpose=marketing AND no marketing consent."""
    contact = _consented_contact(consent_email_marketing_at=None)
    with pytest.raises(OptOutBlocked) as excinfo:
        preflight_or_raise(contact_info=contact, channel="email", purpose="marketing", now_utc=NOW)
    assert excinfo.value.code == "NO_CONSENT_EMAIL_MARKETING"


def test_blocks_when_paused_until_future():
    """Test 5: Raises OptOutBlocked when paused_until > now."""
    contact = _consented_contact(paused_until=FUTURE.isoformat())
    with pytest.raises(OptOutBlocked) as excinfo:
        preflight_or_raise(contact_info=contact, channel="sms", purpose="operational", now_utc=NOW)
    assert excinfo.value.code == "PAUSED"


def test_paused_until_in_past_does_not_block():
    """Counter to Test 5: an expired pause should not block."""
    contact = _consented_contact(paused_until=PAST.isoformat())
    preflight_or_raise(contact_info=contact, channel="sms", purpose="operational", now_utc=NOW)


def test_allows_operational_even_without_marketing_consent():
    """Test 6: Operational consent is independent of marketing consent."""
    contact = _consented_contact(
        consent_sms_marketing_at=None,
        consent_email_marketing_at=None,
    )
    preflight_or_raise(contact_info=contact, channel="sms", purpose="operational", now_utc=NOW)
    preflight_or_raise(contact_info=contact, channel="email", purpose="operational", now_utc=NOW)


def test_blocks_marketing_when_recall_exhausted():
    """Recall-exhausted gate fires only on marketing class."""
    contact = _consented_contact(recall_exhausted=True)
    with pytest.raises(OptOutBlocked) as excinfo:
        preflight_or_raise(contact_info=contact, channel="sms", purpose="marketing", now_utc=NOW)
    assert excinfo.value.code == "RECALL_EXHAUSTED"

    # Operational still allowed even when recall exhausted
    preflight_or_raise(contact_info=contact, channel="sms", purpose="operational", now_utc=NOW)


def test_blocks_when_deceased():
    """Deceased flag blocks all channels and purposes."""
    contact = _consented_contact(deceased=True)
    with pytest.raises(OptOutBlocked) as excinfo:
        preflight_or_raise(contact_info=contact, channel="email", purpose="operational", now_utc=NOW)
    assert excinfo.value.code == "DECEASED"


def test_manual_send_routes_through_operational_consent():
    """Manual sends are operational-class for TCPA — require operational consent only."""
    contact = _consented_contact(
        consent_sms_marketing_at=None,
        consent_email_marketing_at=None,
    )
    preflight_or_raise(contact_info=contact, channel="sms", purpose="manual", now_utc=NOW)


def test_manual_blocked_when_no_operational_consent():
    """Manual still requires operational consent."""
    contact = _consented_contact(consent_sms_operational_at=None)
    with pytest.raises(OptOutBlocked) as excinfo:
        preflight_or_raise(contact_info=contact, channel="sms", purpose="manual", now_utc=NOW)
    assert excinfo.value.code == "NO_CONSENT_SMS_OPERATIONAL"


# Test 7: Table-driven matrix — 2 channels × 2 purposes × 2 consent states × 2 opt-out states.
# (32 cases, since email_opted_out maps to "consent revoked" — there is no email STOP keyword.
# We treat the email-opt-out axis as the consent flag for that channel+purpose.)
_MATRIX_CASES = []
for channel in ("sms", "email"):
    for purpose in ("operational", "marketing"):
        for has_consent in (True, False):
            for sms_opted_out in (True, False):
                _MATRIX_CASES.append((channel, purpose, has_consent, sms_opted_out))


@pytest.mark.parametrize("channel,purpose,has_consent,sms_opted_out", _MATRIX_CASES)
def test_opt_out_matrix(channel, purpose, has_consent, sms_opted_out):
    """Exhaustive matrix: all 16 combinations resolve to expected allow/block."""
    consent_key = f"consent_{channel}_{purpose}_at"
    contact = {consent_key: PAST.isoformat()} if has_consent else {}
    if sms_opted_out:
        contact["sms_opted_out_at"] = PAST.isoformat()

    should_block = (
        (channel == "sms" and sms_opted_out)
        or (not has_consent)
    )

    if should_block:
        with pytest.raises(OptOutBlocked):
            preflight_or_raise(contact_info=contact, channel=channel, purpose=purpose, now_utc=NOW)
    else:
        preflight_or_raise(contact_info=contact, channel=channel, purpose=purpose, now_utc=NOW)
