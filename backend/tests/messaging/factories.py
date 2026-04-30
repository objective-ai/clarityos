"""Factory helpers for messaging models. Filled in after Plan 12-01 lands the ORM."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone


def make_message_log_kwargs(**overrides) -> dict:
    """Stub - returns a kwargs dict matching MessageLog signature added in Plan 12-01."""
    base = {
        "id": uuid.uuid4(),
        "tenant_id": uuid.uuid4(),
        "patient_id": uuid.uuid4(),
        "channel": "sms",
        "purpose": "operational",
        "status": "queued",
        "body": "Test message body",
        "provider_message_id": None,
        "created_at": datetime.now(timezone.utc),
    }
    base.update(overrides)
    return base
