"""Pydantic schemas for Phase 12 CRM messaging.

Server contract is snake_case. Client (apiFetch) camelizes on load —
no `by_alias` needed here.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


MessageChannelLit = Literal["sms", "email"]
MessagePurposeLit = Literal["operational", "marketing", "manual"]
MessageStatusLit = Literal[
    "queued", "sent", "delivered", "read", "failed", "deferred", "cancelled"
]
TemplateKindLit = Literal[
    "reminder_7d",
    "reminder_72h",
    "reminder_24h",
    "recall_m12",
    "recall_m14",
    "manual",
    "bounce_fallback_notice",
]
LanguageLit = Literal["en", "es"]
RecipientKindLit = Literal["patient", "guardian"]
ChannelPreferenceLit = Literal["sms", "email", "both"]
InboundClassificationLit = Literal[
    "reschedule_request",
    "cancellation",
    "question_clinical",
    "question_billing",
    "thank_you",
    "spam",
]
ClassificationConfidenceLit = Literal["high", "medium", "low"]


# ---------- MessageLog ----------


class MessageLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    patient_id: UUID
    appointment_id: Optional[UUID] = None
    channel: MessageChannelLit
    purpose: MessagePurposeLit
    template_kind: Optional[TemplateKindLit] = None
    template_id: Optional[UUID] = None
    recipient_e164: Optional[str] = None
    recipient_email: Optional[str] = None
    recipient_kind: RecipientKindLit
    body: str
    subject: Optional[str] = None
    language: LanguageLit
    status: MessageStatusLit
    status_priority: int
    failure_reason: Optional[str] = None
    retry_count: int
    provider_message_id: Optional[str] = None
    provider_segments: Optional[int] = None
    provider_cost_cents: Optional[int] = None
    batch_id: Optional[UUID] = None
    scheduled_for: Optional[datetime] = None
    deferred_until: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    actor_user_id: Optional[UUID] = None
    metadata: Optional[dict] = Field(default=None, alias="metadata_")


class MessageLogCreate(BaseModel):
    patient_id: UUID
    channel: MessageChannelLit
    purpose: MessagePurposeLit
    body: str
    appointment_id: Optional[UUID] = None
    template_id: Optional[UUID] = None
    template_kind: Optional[TemplateKindLit] = None
    subject: Optional[str] = None
    language: LanguageLit = "en"


# ---------- MessageTemplate ----------


class MessageTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    kind: TemplateKindLit
    channel: MessageChannelLit
    language: LanguageLit
    subject: Optional[str] = None
    body: str
    is_default: bool
    created_at: datetime
    updated_at: datetime


class MessageTemplateCreate(BaseModel):
    kind: TemplateKindLit
    channel: MessageChannelLit
    language: LanguageLit = "en"
    subject: Optional[str] = None
    body: str


class MessageTemplateUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None


# ---------- InboundMessage ----------


class InboundMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    patient_id: Optional[UUID] = None
    from_e164: str
    body: str
    classification: Optional[InboundClassificationLit] = None
    classification_confidence: Optional[ClassificationConfidenceLit] = None
    is_read: bool
    replied_message_id: Optional[UUID] = None
    provider_message_id: str
    received_at: datetime


# ---------- Recall ----------


class RecallCandidateOut(BaseModel):
    """Computed by the recall query — not a direct ORM mirror."""

    patient_id: UUID
    first_name: str
    last_name: str
    last_finalized_at: datetime
    phone_e164: Optional[str] = None
    email: Optional[str] = None
    has_marketing_consent_sms: bool = False
    has_marketing_consent_email: bool = False


# ---------- Bulk send ----------


class BulkRecipient(BaseModel):
    patient_id: UUID
    tokens: dict = Field(default_factory=dict)


class BulkSendRequest(BaseModel):
    recipients: list[BulkRecipient] = Field(..., max_length=50)
    template_id: UUID
    channel: MessageChannelLit
    force_outside_quiet_hours: bool = False

    @field_validator("recipients")
    @classmethod
    def _non_empty(cls, v: list[BulkRecipient]) -> list[BulkRecipient]:
        if not v:
            raise ValueError("recipients must be non-empty")
        return v


# ---------- Channel preference (patient-level) ----------


class ConsentFlagsOut(BaseModel):
    sms_marketing: bool = False
    sms_operational: bool = False
    email_marketing: bool = False
    email_operational: bool = False
    sms_marketing_at: Optional[datetime] = None
    sms_operational_at: Optional[datetime] = None
    email_marketing_at: Optional[datetime] = None
    email_operational_at: Optional[datetime] = None
    sms_opted_out_at: Optional[datetime] = None
    paused_until: Optional[datetime] = None


class ChannelPreferenceOut(BaseModel):
    patient_id: UUID
    preferred_channel: ChannelPreferenceLit = "both"
    preferred_language: LanguageLit = "en"
    consents: ConsentFlagsOut = Field(default_factory=ConsentFlagsOut)
    guardian_routing: bool = False
    guardian_name: Optional[str] = None
    guardian_phone_e164: Optional[str] = None
    guardian_email: Optional[str] = None
    guardian_relationship: Optional[str] = None
    recall_exhausted: bool = False


class ChannelPreferenceUpdate(BaseModel):
    preferred_channel: Optional[ChannelPreferenceLit] = None
    preferred_language: Optional[LanguageLit] = None
    consents: Optional[ConsentFlagsOut] = None
    guardian_routing: Optional[bool] = None
    guardian_name: Optional[str] = None
    guardian_phone_e164: Optional[str] = None
    guardian_email: Optional[str] = None
    guardian_relationship: Optional[str] = None


# ---------- Tenant-level messaging settings ----------


class MessagingSettingsOut(BaseModel):
    messaging_enabled: bool = False
    daily_sms_cap_cents: int = 2500
    twilio_phone_number: Optional[str] = None
    twilio_messaging_service_sid: Optional[str] = None
    resend_from_email: Optional[str] = None


class MessagingSettingsUpdate(BaseModel):
    messaging_enabled: Optional[bool] = None
    daily_sms_cap_cents: Optional[int] = Field(default=None, ge=0)
    twilio_phone_number: Optional[str] = None
    twilio_messaging_service_sid: Optional[str] = None
    resend_from_email: Optional[str] = None
