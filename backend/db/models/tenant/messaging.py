"""CRM & Patient Engagement messaging models (Phase 12).

Tables:
- message_log: Outbound message history (SMS + email)
- message_template: Per-clinic editable templates (token-based)
- recall_queue_run: Daily recall candidate snapshots (one row per "Send All" batch)
- inbound_message: Inbound SMS replies (non-STOP — STOP routes through Twilio Advanced Opt-Out)
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from backend.db.base import TenantBase
from backend.db.mixins import SoftDeleteMixin


class MessageChannel(str, Enum):
    SMS = "sms"
    EMAIL = "email"


class MessagePurpose(str, Enum):
    OPERATIONAL = "operational"   # reminders, confirmations
    MARKETING = "marketing"       # recall (TCPA marketing class)
    MANUAL = "manual"             # staff-initiated send


class MessageStatus(str, Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"            # email opens only
    FAILED = "failed"
    DEFERRED = "deferred"    # quiet hours
    CANCELLED = "cancelled"  # patient confirmed before reminder fired


class TemplateKind(str, Enum):
    REMINDER_7D = "reminder_7d"
    REMINDER_72H = "reminder_72h"
    REMINDER_24H = "reminder_24h"
    RECALL_M12 = "recall_m12"
    RECALL_M14 = "recall_m14"
    MANUAL = "manual"
    BOUNCE_FALLBACK_NOTICE = "bounce_fallback_notice"


class MessageLog(TenantBase, SoftDeleteMixin):
    """Outbound message history. One row per attempted send (including deferred + cancelled).

    Status priority for idempotent webhook upserts:
      queued=0 < sent=1 < delivered=2 < read=3 < failed=99
    """

    __tablename__ = "message_log"
    __table_args__ = (
        Index("ix_message_log_tenant_patient_created", "tenant_id", "patient_id", "created_at"),
        Index("ix_message_log_provider_msg_id", "provider_message_id"),
        Index("ix_message_log_batch", "batch_id"),
        Index("ix_message_log_appointment", "appointment_id"),
        Index("ix_message_log_status", "tenant_id", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="RESTRICT"),
        nullable=False,
    )
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Routing
    channel: Mapped[str] = mapped_column(String(10), nullable=False)        # MessageChannel
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)        # MessagePurpose
    template_kind: Mapped[str | None] = mapped_column(String(40), nullable=True)  # TemplateKind
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("message_template.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Recipient (resolved at send-time — not patient.phone, can be guardian)
    recipient_e164: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_kind: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="patient",
    )  # patient | guardian

    # Content
    body: Mapped[str] = mapped_column(Text, nullable=False)               # rendered, post-token-replace
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)  # email only
    language: Mapped[str] = mapped_column(String(5), nullable=False, server_default="en")  # en | es

    # State
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="queued")  # MessageStatus
    status_priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Provider linkage
    provider_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provider_segments: Mapped[int | None] = mapped_column(Integer, nullable=True)  # SMS segment count
    provider_cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Batch + scheduling linkage
    batch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deferred_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Lifecycle timestamps
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Audit context
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )  # null for scheduler
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)


class MessageTemplate(TenantBase, SoftDeleteMixin):
    """Per-clinic editable message body. Token replacement happens at send-time."""

    __tablename__ = "message_template"
    __table_args__ = (
        Index(
            "ix_message_template_tenant_kind_lang",
            "tenant_id",
            "kind",
            "language",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)        # TemplateKind
    channel: Mapped[str] = mapped_column(String(10), nullable=False)     # MessageChannel
    language: Mapped[str] = mapped_column(String(5), nullable=False, server_default="en")
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)  # email only
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )  # ClarityOS-authored seed
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class RecallQueueRun(TenantBase):
    """One row per "Send All" batch on the recall queue page (audit + analytics)."""

    __tablename__ = "recall_queue_run"
    __table_args__ = (
        Index("ix_recall_queue_run_tenant_started", "tenant_id", "started_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    started_by_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    excluded_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
    )  # opt-out / no contact
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)


class InboundMessage(TenantBase, SoftDeleteMixin):
    """Inbound SMS reply (non-STOP). STOP routes through Twilio Advanced Opt-Out, not here."""

    __tablename__ = "inbound_message"
    __table_args__ = (
        Index("ix_inbound_message_tenant_unread", "tenant_id", "is_read", "received_at"),
        Index("ix_inbound_message_patient", "patient_id", "received_at"),
        Index("ix_inbound_message_provider_msg_id", "provider_message_id", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="SET NULL"),
        nullable=True,
    )
    from_e164: Mapped[str] = mapped_column(String(20), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    classification: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )  # reschedule_request | cancellation | question_clinical | question_billing | thank_you | spam | null=pending
    classification_confidence: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )  # high | medium | low
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    replied_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("message_log.id", ondelete="SET NULL"),
        nullable=True,
    )
    provider_message_id: Mapped[str] = mapped_column(String(100), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
