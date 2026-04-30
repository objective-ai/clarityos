"""Captured Twilio webhook payloads for signature/parsing tests.

Each entry is the raw application/x-www-form-urlencoded params dict that
Twilio sends to a webhook endpoint. Signature generation lives in
`signed_twilio_webhook_factory` (conftest.py) which uses a deterministic
auth_token and the real twilio.request_validator.RequestValidator.

TODO(plan-12-04): consume these in the webhook router tests.
"""
from __future__ import annotations

# Outbound message status callback (delivery receipt)
STATUS_CALLBACK_DELIVERED: dict[str, str] = {
    "MessageSid": "SM_test_status_delivered_001",
    "MessageStatus": "delivered",
    "From": "+15555550100",
    "To": "+14155551234",
    "AccountSid": "AC_test_account_sid",
    "ApiVersion": "2010-04-01",
}

# Inbound SMS reply from patient
INBOUND_SMS_REPLY: dict[str, str] = {
    "MessageSid": "SM_test_inbound_001",
    "From": "+14155551234",
    "To": "+15555550100",
    "Body": "Can we reschedule for next week?",
    "NumSegments": "1",
    "AccountSid": "AC_test_account_sid",
}

# Opt-out STOP keyword
INBOUND_STOP_KEYWORD: dict[str, str] = {
    "MessageSid": "SM_test_stop_001",
    "From": "+14155551234",
    "To": "+15555550100",
    "Body": "STOP",
    "NumSegments": "1",
    "AccountSid": "AC_test_account_sid",
}

# Corrupted variant - wrong AccountSid (must fail signature even with valid sig calc)
CORRUPTED_TAMPERED: dict[str, str] = {
    "MessageSid": "SM_test_status_delivered_001",
    "MessageStatus": "delivered",
    "From": "+15555550100",
    "To": "+14155551234",
    "AccountSid": "AC_attacker_account_sid",
    "ApiVersion": "2010-04-01",
}

ALL_PAYLOADS: dict[str, dict[str, str]] = {
    "status_callback_delivered": STATUS_CALLBACK_DELIVERED,
    "inbound_sms_reply": INBOUND_SMS_REPLY,
    "inbound_stop_keyword": INBOUND_STOP_KEYWORD,
    "corrupted_tampered": CORRUPTED_TAMPERED,
}
