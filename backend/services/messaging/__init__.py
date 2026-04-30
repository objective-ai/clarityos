"""Messaging service layer (Phase 12 — CRM & Patient Engagement).

Vendor adapters for Twilio (SMS) + Postmark (email) live here. Higher-level
choke-point dispatch (opt-out, quiet hours, cost cap, audit) is in `sender.py`
(Plan 12-03).

Filename note: `email_client.py` houses Postmark per the BAA decision recorded
in .planning/compliance/RESEND-BAA-CHECKPOINT.md (2026-04-29). Resend was
rejected; SendGrid Pro tier exceeded pilot budget.
"""
