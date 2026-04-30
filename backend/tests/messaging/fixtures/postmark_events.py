"""Captured Postmark webhook event payloads for parsing tests.

Postmark webhooks authenticate via HTTP Basic Auth (no HMAC / no Svix).
The factory in conftest.py (`postmark_webhook_request_factory`) builds the
Authorization header. Event JSON shape is documented at:
https://postmarkapp.com/developer/webhooks

TODO(plan-12-04): consume these in the email webhook router tests.
"""
from __future__ import annotations

# Email accepted by Postmark and queued for delivery
EMAIL_DELIVERED: dict = {
    "RecordType": "Delivery",
    "ServerID": 23,
    "MessageStream": "outbound",
    "MessageID": "11111111-2222-3333-4444-555555555555",
    "Recipient": "patient@example.com",
    "Tag": "appointment-reminder",
    "DeliveredAt": "2026-05-01T15:00:05.000Z",
    "Details": "smtp;250 OK",
}

# Recipient opened the email (only fires if open tracking is enabled per send)
EMAIL_OPENED: dict = {
    "RecordType": "Open",
    "MessageID": "11111111-2222-3333-4444-555555555555",
    "Recipient": "patient@example.com",
    "ReceivedAt": "2026-05-01T15:00:30.000Z",
    "Tag": "appointment-reminder",
    "Client": {"Name": "Chrome", "Company": "Google", "Family": "Chrome"},
    "OS": {"Name": "macOS 14.0", "Company": "Apple", "Family": "macOS"},
    "Platform": "Desktop",
    "FirstOpen": True,
}

# Recipient clicked a link (only fires if link tracking is enabled per send)
EMAIL_LINK_CLICK: dict = {
    "RecordType": "Click",
    "MessageID": "11111111-2222-3333-4444-555555555555",
    "Recipient": "patient@example.com",
    "ReceivedAt": "2026-05-01T15:00:45.000Z",
    "Tag": "appointment-reminder",
    "OriginalLink": "https://clarityos.app/appt/abc",
    "ClickLocation": "HTML",
}

# Hard bounce — recipient unreachable
EMAIL_BOUNCED: dict = {
    "RecordType": "Bounce",
    "ID": 4242424242,
    "Type": "HardBounce",
    "TypeCode": 1,
    "Name": "Hard bounce",
    "Tag": "appointment-reminder",
    "MessageID": "33333333-4444-5555-6666-777777777777",
    "Email": "bad-address@example.com",
    "Description": "The server was unable to deliver your message",
    "BouncedAt": "2026-05-01T15:00:10.000Z",
    "DumpAvailable": False,
    "Inactive": True,
    "CanActivate": False,
}

# Recipient marked the email as spam (rare but must be handled — instant suppression)
EMAIL_SPAM_COMPLAINT: dict = {
    "RecordType": "SpamComplaint",
    "ID": 4242424243,
    "Type": "SpamComplaint",
    "TypeCode": 100513,
    "Tag": "marketing-recall",
    "MessageID": "55555555-6666-7777-8888-999999999999",
    "Email": "annoyed-patient@example.com",
    "BouncedAt": "2026-05-01T15:00:20.000Z",
    "Inactive": True,
    "CanActivate": False,
}

ALL_EVENTS: dict[str, dict] = {
    "Delivery": EMAIL_DELIVERED,
    "Open": EMAIL_OPENED,
    "Click": EMAIL_LINK_CLICK,
    "Bounce": EMAIL_BOUNCED,
    "SpamComplaint": EMAIL_SPAM_COMPLAINT,
}
