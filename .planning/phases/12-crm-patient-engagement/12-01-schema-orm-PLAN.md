---
phase: 12
plan: 01
slug: schema-orm
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/db/models/tenant/messaging.py
  - backend/db/models/tenant/clinical.py
  - backend/db/models/tenant/__init__.py
  - backend/alembic/versions/0016_crm_messaging.py
  - backend/schemas/messaging.py
  - types/messaging.ts
  - lib/entitlements.ts
  - app/core/entitlements.py
  - .planning/REQUIREMENTS.md
autonomous: true
gap_closure: false
requirements: [CRM-01, CRM-04, CRM-05, CRM-06, CRM-07, CRM-08, CRM-09, CRM-10, CRM-17, CRM-18]

must_haves:
  truths:
    - "MessageLog, MessageTemplate, RecallQueueRun, InboundMessage tables exist in DB after Alembic upgrade"
    - "AuditAction enum extended with messaging actions (MESSAGE_SENT, OPT_OUT_RECORDED, etc.)"
    - "patients.contact_info_jsonb supports new keys: consent_sms_marketing_at, consent_sms_operational_at, consent_email_marketing_at, consent_email_operational_at, paused_until, recall_exhausted, deceased, guardian (object), preferred_language, timezone"
    - "appointments table has patient_confirmed_at + reminder_status + last_reminder_sent_at columns"
    - "tenants.settings_jsonb supports new messaging key (daily_sms_cap_cents, messaging_enabled, twilio_messaging_service_sid, twilio_phone_number, etc.)"
    - "messaging entitlement registered in TS + Python; included in Plus + Premium plans"
    - "REQUIREMENTS.md gains CRM-01 through CRM-20 with phase mapping"
  artifacts:
    - path: "backend/db/models/tenant/messaging.py"
      provides: "MessageLog, MessageTemplate, RecallQueueRun, InboundMessage ORM models"
      exports: ["MessageLog", "MessageTemplate", "RecallQueueRun", "InboundMessage", "MessageChannel", "MessagePurpose", "MessageStatus"]
    - path: "backend/alembic/versions/0016_crm_messaging.py"
      contains: "def upgrade"
    - path: "backend/schemas/messaging.py"
      provides: "Pydantic schemas matching the ORM models with by_alias"
    - path: "types/messaging.ts"
      exports: ["MessageLog", "MessageTemplate", "RecallQueueRun", "InboundMessage", "MessageStatus", "MessageChannel", "MessagePurpose", "ChannelPreference", "ConsentFlags"]
    - path: "lib/entitlements.ts"
      contains: "MESSAGING:"
    - path: "app/core/entitlements.py"
      contains: "messaging"
    - path: ".planning/REQUIREMENTS.md"
      contains: "CRM-01"
  key_links:
    - from: "backend/db/models/tenant/messaging.py"
      to: "backend/db/models/tenant/clinical.py"
      via: "AuditAction enum import"
      pattern: "from .clinical import AuditAction"
    - from: "backend/alembic/versions/0016_crm_messaging.py"
      to: "audit_action enum"
      via: "ALTER TYPE audit_action_enum ADD VALUE"
      pattern: "ADD VALUE"
---

<objective>
Land the entire DB + types foundation for CRM messaging in one atomic migration. Creates 4 new tables (message_log, message_template, recall_queue_run, inbound_message), adds 10 columns across patients/appointments/tenants (mostly via JSONB keys to minimize migration churn — see RESEARCH.md § Conflicts #3-#5), extends the existing AuditAction enum with 14 new values, and mirrors the schema in Pydantic + TypeScript types.

Purpose: All downstream plans (sender service, scheduler, routes, UI) need stable data contracts. This plan is the contract. Without it, every other plan invents its own column names and we get integration drift.

Output:
- 4 new ORM models in `backend/db/models/tenant/messaging.py`
- 1 Alembic migration `0016_crm_messaging.py` (idempotent, uses ADD COLUMN IF NOT EXISTS pattern from Phase 10.2)
- Pydantic schemas (snake_case server contract) + TS types (camelCase client contract)
- `messaging` entitlement added in both runtimes
- REQUIREMENTS.md updated with CRM-01..CRM-20
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/12-crm-patient-engagement/12-CONTEXT.md
@.planning/phases/12-crm-patient-engagement/12-RESEARCH.md
@./CLAUDE.md
@.claude/rules/backend-python.md
@.claude/rules/clinical-safety.md
@backend/db/models/tenant/clinical.py
@backend/db/models/tenant/__init__.py
@lib/entitlements.ts
@app/core/entitlements.py

<interfaces>
<!-- Existing patterns to mirror -->
From backend/db/models/tenant/clinical.py (lines 933-993 — AuditLog model — reuse this for messaging audit):
```python
class AuditLog(TenantBase):
    __tablename__ = "audit_log"
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    patient_id: Mapped[uuid.UUID | None] = ...
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
```

From backend/db/models/tenant/clinical.py (search for `class AuditAction` enum):
- AuditAction is a Python str-based enum stored as VARCHAR in DB (`native_enum=False` per project rule)
- New values are added BY APPENDING to the enum class — DB does NOT need ALTER TYPE since it's stored as VARCHAR(50)
- This means messaging extends without an enum migration (clean!)

From backend/alembic/versions/0014_*.py and 0015_*.py (Phase 10.4 + 10.3 precedent):
- `op.add_column("table", sa.Column(...), schema="public")` — schema is "public" (clinic_sunview unused)
- `op.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS ...")` for idempotency

From lib/entitlements.ts (lines 25-46):
```ts
export const Entitlement = {
  ...
  VIEW_SYSTEM_STATUS: "view_system_status" as const,
} satisfies Record<string, EntitlementKey>;
```

From app/core/entitlements.py (Python mirror — read file for current pattern):
- Class with string constants
- PLAN_FEATURES dict mapping plan name → list of entitlements
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create messaging ORM models + extend AuditAction enum</name>
  <files>
    backend/db/models/tenant/messaging.py,
    backend/db/models/tenant/clinical.py,
    backend/db/models/tenant/__init__.py
  </files>
  <read_first>
    - backend/db/models/tenant/clinical.py (read full AuditLog class lines ~933-993 AND the AuditAction enum class definition — search for `class AuditAction`)
    - backend/db/models/tenant/__init__.py (current model exports list)
    - backend/db/models/tenant/base.py (TenantBase + SoftDeleteMixin patterns)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 220-240 — recommended directory structure; lines 805-820 — AuditLog reuse)
    - .claude/rules/backend-python.md (enum as VARCHAR rule, native_enum=False)
  </read_first>
  <action>
**Step 1.** Open `backend/db/models/tenant/clinical.py`, find the `class AuditAction(str, Enum)` declaration. APPEND these new values at the end of the enum class (do not reorder existing values — order matters for VARCHAR storage compat):

```python
    # Phase 12: CRM & Messaging
    MESSAGE_SENT = "message_sent"
    MESSAGE_DELIVERED = "message_delivered"
    MESSAGE_FAILED = "message_failed"
    MESSAGE_READ = "message_read"
    MESSAGE_DEFERRED = "message_deferred"  # quiet hours
    INBOUND_MESSAGE_RECEIVED = "inbound_message_received"
    OPT_OUT_RECORDED = "opt_out_recorded"
    OPT_IN_RECORDED = "opt_in_recorded"
    CONSENT_GRANTED = "consent_granted"
    CONSENT_REVOKED = "consent_revoked"
    CHANNEL_PREFERENCE_UPDATED = "channel_preference_updated"
    TEMPLATE_CREATED = "template_created"
    TEMPLATE_UPDATED = "template_updated"
    BULK_MESSAGE_BATCH_CREATED = "bulk_message_batch_created"
    RECALL_QUEUE_RUN_STARTED = "recall_queue_run_started"
    RECALL_QUEUE_RUN_COMPLETED = "recall_queue_run_completed"
    MESSAGING_ENABLED = "messaging_enabled"
    MESSAGING_DISABLED = "messaging_disabled"
```

**Step 2.** Create `backend/db/models/tenant/messaging.py`:

```python
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
from typing import TYPE_CHECKING

from sqlalchemy import (
    String, Text, DateTime, ForeignKey, Index, Boolean, Integer, JSON
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from .base import TenantBase, SoftDeleteMixin


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

    Status priority for idempotent webhook upserts (RESEARCH.md Pitfall 3):
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
    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False)
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True)

    # Routing
    channel: Mapped[str] = mapped_column(String(10), nullable=False)        # MessageChannel
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)        # MessagePurpose
    template_kind: Mapped[str | None] = mapped_column(String(40), nullable=True)  # TemplateKind
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("message_template.id", ondelete="SET NULL"), nullable=True)

    # Recipient (resolved at send-time — not patient.phone, can be guardian)
    recipient_e164: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_kind: Mapped[str] = mapped_column(String(20), nullable=False, server_default="patient")  # patient | guardian

    # Content
    body: Mapped[str] = mapped_column(Text, nullable=False)               # rendered, post-token-replace
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)  # email only
    language: Mapped[str] = mapped_column(String(5), nullable=False, server_default="en")  # en | es

    # State
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="queued")  # MessageStatus
    status_priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")  # for idempotent upserts
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Provider linkage
    provider_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provider_segments: Mapped[int | None] = mapped_column(Integer, nullable=True)  # SMS segment count
    provider_cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Batch + scheduling linkage
    batch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # bulk + recall runs
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # when scheduler picked this row
    deferred_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # quiet-hours deferral

    # Lifecycle timestamps
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Audit context
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)  # null for scheduler
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)


class MessageTemplate(TenantBase, SoftDeleteMixin):
    """Per-clinic editable message body. Token replacement happens at send-time."""
    __tablename__ = "message_template"
    __table_args__ = (
        Index("ix_message_template_tenant_kind_lang", "tenant_id", "kind", "language", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)        # TemplateKind
    channel: Mapped[str] = mapped_column(String(10), nullable=False)     # MessageChannel
    language: Mapped[str] = mapped_column(String(5), nullable=False, server_default="en")
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)  # email only
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")  # ClarityOS-authored seed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


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
    excluded_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")  # opt-out / no contact
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
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
    patient_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="SET NULL"), nullable=True)
    from_e164: Mapped[str] = mapped_column(String(20), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    classification: Mapped[str | None] = mapped_column(String(40), nullable=True)  # reschedule_request | cancellation | question_clinical | question_billing | thank_you | spam | null=pending
    classification_confidence: Mapped[str | None] = mapped_column(String(10), nullable=True)  # high | medium | low
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    replied_message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("message_log.id", ondelete="SET NULL"), nullable=True)
    provider_message_id: Mapped[str] = mapped_column(String(100), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
```

**Step 3.** Open `backend/db/models/tenant/__init__.py`, add re-exports:
```python
from .messaging import (
    MessageLog,
    MessageTemplate,
    RecallQueueRun,
    InboundMessage,
    MessageChannel,
    MessagePurpose,
    MessageStatus,
    TemplateKind,
)
```
  </action>
  <verify>
    <automated>cd backend && python -c "from db.models.tenant.messaging import MessageLog, MessageTemplate, RecallQueueRun, InboundMessage, MessageChannel, MessagePurpose, MessageStatus, TemplateKind; from db.models.tenant.clinical import AuditAction; assert AuditAction.MESSAGE_SENT.value == 'message_sent'; assert MessageStatus.QUEUED.value == 'queued'; print('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "MESSAGE_SENT" backend/db/models/tenant/clinical.py` returns at least 1
    - `grep -c "OPT_OUT_RECORDED" backend/db/models/tenant/clinical.py` returns at least 1
    - `grep -c "RECALL_QUEUE_RUN_STARTED" backend/db/models/tenant/clinical.py` returns at least 1
    - `grep -c "class MessageLog" backend/db/models/tenant/messaging.py` returns 1
    - `grep -c "class MessageTemplate" backend/db/models/tenant/messaging.py` returns 1
    - `grep -c "class RecallQueueRun" backend/db/models/tenant/messaging.py` returns 1
    - `grep -c "class InboundMessage" backend/db/models/tenant/messaging.py` returns 1
    - `grep -c "status_priority" backend/db/models/tenant/messaging.py` returns at least 1
    - `grep -c "from .messaging import" backend/db/models/tenant/__init__.py` returns 1
    - Python import test passes (see verify command)
  </acceptance_criteria>
  <done>4 ORM models created, AuditAction enum extended with 18 messaging actions, all models importable.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Alembic migration 0016 + Pydantic schemas + TS types</name>
  <files>
    backend/alembic/versions/0016_crm_messaging.py,
    backend/schemas/messaging.py,
    types/messaging.ts
  </files>
  <read_first>
    - backend/alembic/versions/0014_*.py (Phase 10.4 staff scheduling — most recent multi-table migration; mirror structure)
    - backend/alembic/versions/0015_*.py (Phase 10.3 system health — most recent migration; check current revision id chain)
    - backend/db/models/tenant/messaging.py (created in Task 1 — column types must match exactly)
    - backend/schemas/insurance.py OR backend/schemas/staff_schedule.py (Pydantic snake_case + by_alias pattern)
    - types/staffSchedule.ts (TS type pattern — camelCase + Zod or plain interfaces, follow whichever is in use)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 482-528 — recall query indexes; lines 988-994 — JSONB strategy for tenant.settings_jsonb and patient.contact_info_jsonb)
    - MEMORY.md feedback_camelizekeys_nested.md (snake_case keys preserved in JSONB)
  </read_first>
  <action>
**Step 1.** Create Alembic migration `backend/alembic/versions/0016_crm_messaging.py`:

```python
"""Phase 12 CRM & Patient Engagement: messaging tables + patient/appointment/tenant column adds.

Revision ID: 0016_crm_messaging
Revises: 0015_system_health   # confirm current head with `alembic current` before running
Create Date: 2026-04-30
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


# revision identifiers, used by Alembic.
revision = "0016_crm_messaging"
down_revision = "0015_system_health"  # VERIFY before commit — `cd backend && alembic heads`
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. message_template (referenced by message_log.template_id — create first)
    op.create_table(
        "message_template",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("language", sa.String(5), nullable=False, server_default="en"),
        sa.Column("subject", sa.String(255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_message_template_tenant_id", "message_template", ["tenant_id"])
    op.create_index(
        "ix_message_template_tenant_kind_lang",
        "message_template",
        ["tenant_id", "kind", "language"],
        unique=True,
    )

    # 2. message_log
    op.create_table(
        "message_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("appointment_id", UUID(as_uuid=True), sa.ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("template_kind", sa.String(40), nullable=True),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("message_template.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recipient_e164", sa.String(20), nullable=True),
        sa.Column("recipient_email", sa.String(255), nullable=True),
        sa.Column("recipient_kind", sa.String(20), nullable=False, server_default="patient"),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("subject", sa.String(255), nullable=True),
        sa.Column("language", sa.String(5), nullable=False, server_default="en"),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("status_priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider_message_id", sa.String(100), nullable=True),
        sa.Column("provider_segments", sa.Integer(), nullable=True),
        sa.Column("provider_cost_cents", sa.Integer(), nullable=True),
        sa.Column("batch_id", UUID(as_uuid=True), nullable=True),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deferred_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("actor_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_message_log_tenant_id", "message_log", ["tenant_id"])
    op.create_index("ix_message_log_tenant_patient_created", "message_log", ["tenant_id", "patient_id", "created_at"])
    op.create_index("ix_message_log_provider_msg_id", "message_log", ["provider_message_id"])
    op.create_index("ix_message_log_batch", "message_log", ["batch_id"])
    op.create_index("ix_message_log_appointment", "message_log", ["appointment_id"])
    op.create_index("ix_message_log_status", "message_log", ["tenant_id", "status", "created_at"])

    # 3. recall_queue_run
    op.create_table(
        "recall_queue_run",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("started_by_user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("candidate_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("excluded_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
    )
    op.create_index("ix_recall_queue_run_tenant_id", "recall_queue_run", ["tenant_id"])
    op.create_index("ix_recall_queue_run_tenant_started", "recall_queue_run", ["tenant_id", "started_at"])

    # 4. inbound_message
    op.create_table(
        "inbound_message",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("from_e164", sa.String(20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("classification", sa.String(40), nullable=True),
        sa.Column("classification_confidence", sa.String(10), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("replied_message_id", UUID(as_uuid=True), sa.ForeignKey("message_log.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provider_message_id", sa.String(100), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_inbound_message_tenant_id", "inbound_message", ["tenant_id"])
    op.create_index("ix_inbound_message_tenant_unread", "inbound_message", ["tenant_id", "is_read", "received_at"])
    op.create_index("ix_inbound_message_patient", "inbound_message", ["patient_id", "received_at"])
    op.create_index("ix_inbound_message_provider_msg_id", "inbound_message", ["provider_message_id"], unique=True)

    # 5. appointments column adds (idempotent — Phase 10.2 precedent)
    op.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_confirmed_at TIMESTAMPTZ")
    op.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_status VARCHAR(20)")
    op.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ")
    op.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminders_sent_count INTEGER NOT NULL DEFAULT 0")

    # 6. Recall query support indexes (RESEARCH.md lines 521-529)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_encounters_tenant_finalized_patient "
        "ON encounters (tenant_id, finalized_at DESC, patient_id) WHERE finalized_at IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_appointments_tenant_patient_starttime "
        "ON appointments (tenant_id, patient_id, start_time)"
    )

    # NOTE: patient consent flags + tenant messaging settings live in JSONB
    # (contact_info_jsonb and settings_jsonb respectively) — no schema change needed.
    # See RESEARCH.md § Conflicts #3-#5 for the JSONB-vs-column decision.


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_appointments_tenant_patient_starttime")
    op.execute("DROP INDEX IF EXISTS ix_encounters_tenant_finalized_patient")
    op.execute("ALTER TABLE appointments DROP COLUMN IF EXISTS reminders_sent_count")
    op.execute("ALTER TABLE appointments DROP COLUMN IF EXISTS last_reminder_sent_at")
    op.execute("ALTER TABLE appointments DROP COLUMN IF EXISTS reminder_status")
    op.execute("ALTER TABLE appointments DROP COLUMN IF EXISTS patient_confirmed_at")
    op.drop_table("inbound_message")
    op.drop_table("recall_queue_run")
    op.drop_table("message_log")
    op.drop_table("message_template")
```

**Step 2.** Create `backend/schemas/messaging.py` with Pydantic models. snake_case fields with `Field(alias=)` only when the JSON contract differs (it shouldn't — apiFetch camelizes on the client side automatically). Include:

- `MessageLogOut` (mirrors MessageLog ORM, exposes status as Literal)
- `MessageLogCreate` (tenant_id + patient_id + channel + purpose + body + appointment_id?)
- `MessageTemplateOut` + `MessageTemplateCreate` + `MessageTemplateUpdate`
- `InboundMessageOut`
- `RecallCandidateOut` (computed by query — patient_id, first_name, last_name, last_finalized_at, phone, email, has_marketing_consent)
- `BulkSendRequest` with `recipients: list[BulkRecipient]` (patient_id + tokens), `template_id`, `channel`, `force_outside_quiet_hours: bool = False`. Include validator `@field_validator("recipients") -> max_length=50` (RESEARCH.md § Bulk Send Safeguards).
- `ChannelPreferenceOut` and `ChannelPreferenceUpdate` for the patient-detail consent pill
- `MessagingSettingsOut` and `MessagingSettingsUpdate` (daily_sms_cap_cents default 2500, messaging_enabled, twilio_phone_number, twilio_messaging_service_sid)

Use the project Pydantic v2 pattern (search for `model_config = ConfigDict` in existing schemas to copy).

**Step 3.** Create `types/messaging.ts` mirroring the schemas in camelCase:

```typescript
/**
 * types/messaging.ts — Phase 12 CRM messaging shared types.
 *
 * Server returns snake_case; apiFetch camelizes on load.
 * IMPORTANT: tokens dict keys must NOT be camelized (RESEARCH.md Pitfall 9).
 */

export type MessageChannel = "sms" | "email";
export type MessagePurpose = "operational" | "marketing" | "manual";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "deferred" | "cancelled";
export type TemplateKind =
  | "reminder_7d" | "reminder_72h" | "reminder_24h"
  | "recall_m12" | "recall_m14"
  | "manual" | "bounce_fallback_notice";
export type InboundClassification =
  | "reschedule_request" | "cancellation"
  | "question_clinical" | "question_billing"
  | "thank_you" | "spam";

export interface MessageLog {
  id: string;
  tenantId: string;
  patientId: string;
  appointmentId: string | null;
  channel: MessageChannel;
  purpose: MessagePurpose;
  templateKind: TemplateKind | null;
  templateId: string | null;
  recipientE164: string | null;
  recipientEmail: string | null;
  recipientKind: "patient" | "guardian";
  body: string;
  subject: string | null;
  language: "en" | "es";
  status: MessageStatus;
  statusPriority: number;
  failureReason: string | null;
  retryCount: number;
  providerMessageId: string | null;
  providerSegments: number | null;
  providerCostCents: number | null;
  batchId: string | null;
  scheduledFor: string | null;
  deferredUntil: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
  actorUserId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface MessageTemplate {
  id: string;
  tenantId: string;
  kind: TemplateKind;
  channel: MessageChannel;
  language: "en" | "es";
  subject: string | null;
  body: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InboundMessage {
  id: string;
  tenantId: string;
  patientId: string | null;
  fromE164: string;
  body: string;
  classification: InboundClassification | null;
  classificationConfidence: "high" | "medium" | "low" | null;
  isRead: boolean;
  repliedMessageId: string | null;
  providerMessageId: string;
  receivedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface ConsentFlags {
  smsMarketing: boolean;
  smsOperational: boolean;
  emailMarketing: boolean;
  emailOperational: boolean;
  smsMarketingAt: string | null;
  smsOperationalAt: string | null;
  emailMarketingAt: string | null;
  emailOperationalAt: string | null;
  smsOptedOutAt: string | null;
  pausedUntil: string | null;
}

export interface ChannelPreference {
  patientId: string;
  preferredChannel: MessageChannel | "both";
  preferredLanguage: "en" | "es";
  consents: ConsentFlags;
  guardianRouting: boolean;
  guardianName: string | null;
  guardianPhoneE164: string | null;
  guardianEmail: string | null;
  guardianRelationship: string | null;
  recallExhausted: boolean;
}

export interface RecallCandidate {
  patientId: string;
  firstName: string;
  lastName: string;
  lastFinalizedAt: string;
  phoneE164: string | null;
  email: string | null;
  hasMarketingConsentSms: boolean;
  hasMarketingConsentEmail: boolean;
}

export interface BulkRecipient {
  patientId: string;
  tokens: Record<string, string>;
}

export interface BulkSendRequest {
  recipients: BulkRecipient[]; // max 50 — enforced server-side
  templateId: string;
  channel: MessageChannel;
  forceOutsideQuietHours?: boolean;
}

export interface MessagingSettings {
  messagingEnabled: boolean;
  dailySmsCapCents: number;
  twilioPhoneNumber: string | null;
  twilioMessagingServiceSid: string | null;
  resendFromEmail: string | null;
}
```
  </action>
  <verify>
    <automated>cd backend && alembic upgrade head --sql 2>&1 | grep -E "CREATE TABLE message_(log|template)" | head -2 ; cd backend && python -c "from schemas.messaging import MessageLogOut, MessageTemplateOut, BulkSendRequest, RecallCandidateOut, ChannelPreferenceOut, MessagingSettingsOut; print('schemas OK')" ; npx tsc --noEmit types/messaging.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "revision = \"0016_crm_messaging\"" backend/alembic/versions/0016_crm_messaging.py` returns 1
    - `grep -c "down_revision = \"0015_system_health\"" backend/alembic/versions/0016_crm_messaging.py` returns 1 (verify via `cd backend && alembic heads` matches)
    - `grep -c "create_table(\"message_log\"" backend/alembic/versions/0016_crm_messaging.py` returns 1
    - `grep -c "create_table(\"message_template\"" backend/alembic/versions/0016_crm_messaging.py` returns 1
    - `grep -c "create_table(\"recall_queue_run\"" backend/alembic/versions/0016_crm_messaging.py` returns 1
    - `grep -c "create_table(\"inbound_message\"" backend/alembic/versions/0016_crm_messaging.py` returns 1
    - `grep -c "patient_confirmed_at" backend/alembic/versions/0016_crm_messaging.py` returns at least 1
    - `grep -c "ix_encounters_tenant_finalized_patient" backend/alembic/versions/0016_crm_messaging.py` returns at least 1
    - `grep -c "class MessageLogOut" backend/schemas/messaging.py` returns 1
    - `grep -c "class BulkSendRequest" backend/schemas/messaging.py` returns 1
    - `grep -c "max_length=50" backend/schemas/messaging.py` returns at least 1 (bulk send 50 cap)
    - `grep -c "export interface MessageLog" types/messaging.ts` returns 1
    - `grep -c "export interface ChannelPreference" types/messaging.ts` returns 1
    - `grep -c "export interface BulkSendRequest" types/messaging.ts` returns 1
    - `npx tsc --noEmit` exits 0
    - `cd backend && alembic upgrade head` exits 0 (against dev DB)
  </acceptance_criteria>
  <done>Migration 0016 runs cleanly upgrade + downgrade; Pydantic schemas import; TS types compile; encounter + appointment indexes for recall query in place.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Add messaging entitlement (TS + Python) + register CRM-01..CRM-20 in REQUIREMENTS.md</name>
  <files>
    lib/entitlements.ts,
    app/core/entitlements.py,
    .planning/REQUIREMENTS.md
  </files>
  <read_first>
    - lib/entitlements.ts (full file — see embedded interfaces for pattern)
    - app/core/entitlements.py (Python mirror — read full file)
    - .planning/REQUIREMENTS.md (lines 89-97 for SCH-01..SCH-16 pattern; lines 167-251 for traceability table)
    - .planning/phases/12-crm-patient-engagement/12-RESEARCH.md (lines 110-138 — full CRM-01..CRM-20 list)
  </read_first>
  <action>
**Step 1.** Edit `lib/entitlements.ts`:

In the `Entitlement` const, add (after `VIEW_SYSTEM_STATUS`):
```ts
  // ---- CRM (Phase 12) ----
  MESSAGING: "messaging" as const,
```

In `PLAN_FEATURES`, add `Entitlement.MESSAGING` to BOTH the `Plus` and `Premium` arrays (after `Entitlement.MULTI_PROVIDER` in Plus; after `Entitlement.AI_SCRIBE` in Premium).

In `ENTITLEMENT_META`, add a new entry after `view_system_status`:
```ts
  messaging: {
    label: "Patient Messaging",
    description: "Automated reminders, recall campaigns, manual SMS/email, and inbound triage.",
    plan: "Plus",
  },
```

**Step 2.** Edit `app/core/entitlements.py` to mirror the TS changes — add `MESSAGING = "messaging"` constant (or string in the `Entitlement` mapping, matching existing style), add to `PLAN_FEATURES["Plus"]` and `PLAN_FEATURES["Premium"]` arrays, add ENTITLEMENT_META entry.

Also add a `require_messaging_entitlement` dependency function (match the pattern of `require_ai_scribe_entitlement` if present, or `require_entitlement("messaging")`).

**Step 3.** Edit `.planning/REQUIREMENTS.md`:

After the `### Schedule & Booking Revamp (Phase 10.2)` section, add a new section:

```markdown
### CRM & Patient Engagement (Phase 12)

- [ ] **CRM-01**: Operational appointment reminders sent automatically at 7d, 72h, 24h pre-appointment via patient's preferred channel(s)
- [ ] **CRM-02**: Staff can manually send a message from patient detail header, schedule kebab, inbox reply, or bulk-select on schedule
- [ ] **CRM-03**: Recall reminders triggered for patients whose last finalized encounter > 12 months ago AND no future appointment, surfaced in staff-approved queue
- [ ] **CRM-04**: Patients can opt out of SMS via STOP keyword (Twilio Advanced Opt-Out + DB sync); opt-out respected on every send via preflight check
- [ ] **CRM-05**: Per-patient message history viewable on patient detail Messages tab with states (queued/sent/delivered/read/failed)
- [ ] **CRM-06**: Per-channel × per-purpose consent flags (4 flags) captured at intake/booking with explicit timestamps for TCPA audit trail
- [ ] **CRM-07**: Twilio + Resend webhooks verify provider signatures and update message status idempotently by provider_message_id
- [ ] **CRM-08**: Quiet hours 9pm–8am patient-local enforced by scheduler; messages deferred to next allowed window
- [ ] **CRM-09**: Daily per-clinic spend cap with 80% warn + 100% hard-stop with admin override
- [ ] **CRM-10**: Bulk-send safeguards: max 50 recipients, throttle 1 msg/sec, mandatory preview-confirm, single batch_id audit
- [ ] **CRM-11**: Inbound non-STOP SMS classified by Claude into 6 categories; reschedule/cancellation tagged float to top of inbox
- [ ] **CRM-12**: "Draft with AI" composer button: staff intent → HIPAA-safe message respecting opt-out + minor routing
- [ ] **CRM-13**: Onboarding wizard with test-send + "I received them" gate before clinic_messaging_enabled=true
- [ ] **CRM-14**: Per-clinic dedicated local Twilio number auto-provisioned during wizard step 3
- [ ] **CRM-15**: /messaging/analytics page (reminder funnel, recall conversion, opt-out trend, cost+volume) + dashboard hero cards
- [ ] **CRM-16**: Monthly "Communications Compliance Report" PDF export, OWNER-gated
- [ ] **CRM-17**: messaging entitlement key added to lib/entitlements.ts and app/core/entitlements.py; included in Plus + Premium plans
- [ ] **CRM-18**: Minors (<18) route to Guardian (name+phone+email+relationship); 18th-birthday "switch to patient" prompt
- [ ] **CRM-19**: Household bundling: shared contact + same-day appointments → single bundled SMS
- [ ] **CRM-20**: Bounce fallback: 3 fails on preferred channel → auto-flip to alternate + "needs update" badge
```

In the **Traceability** table at the bottom, append 20 new rows:
```
| CRM-01 | Phase 12 | Pending |
| CRM-02 | Phase 12 | Pending |
... (through CRM-20)
```

Update the **Coverage** counts at the bottom:
- Total requirements: 83 → 103
- Pending: 16 → 36
- (Complete count unchanged at 67)
  </action>
  <verify>
    <automated>grep -c "MESSAGING:" lib/entitlements.ts && grep -c "messaging" app/core/entitlements.py && grep -c "CRM-01" .planning/REQUIREMENTS.md && grep -c "CRM-20" .planning/REQUIREMENTS.md && npx tsc --noEmit && cd backend && python -c "from app.core.entitlements import PLAN_FEATURES; assert 'messaging' in PLAN_FEATURES['Plus'] and 'messaging' in PLAN_FEATURES['Premium']; print('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "MESSAGING:" lib/entitlements.ts` returns at least 1
    - `grep -c "Entitlement.MESSAGING" lib/entitlements.ts` returns at least 2 (Plus + Premium plans)
    - `grep -c "messaging" lib/entitlements.ts` returns at least 3 (const, plans, meta)
    - `grep -c "messaging" app/core/entitlements.py` returns at least 3
    - `grep -c "CRM-01" .planning/REQUIREMENTS.md` returns at least 2 (definition + traceability)
    - `grep -c "CRM-20" .planning/REQUIREMENTS.md` returns at least 2
    - `grep -c "CRM-" .planning/REQUIREMENTS.md` returns at least 40 (20 defs + 20 traceability)
    - `grep -c "Total requirements: 103" .planning/REQUIREMENTS.md` returns 1
    - `npx tsc --noEmit` exits 0
    - `cd backend && python -c "from app.core.entitlements import PLAN_FEATURES; assert 'messaging' in PLAN_FEATURES['Plus']"` exits 0
  </acceptance_criteria>
  <done>messaging entitlement registered in both runtimes; REQUIREMENTS.md gains 20 CRM rows + traceability + coverage update.</done>
</task>

</tasks>

<verification>
1. `cd backend && alembic upgrade head` → exits 0, all 4 tables exist (verify with `\d message_log` etc.)
2. `cd backend && alembic downgrade -1 && alembic upgrade head` → idempotent, no errors
3. `cd backend && python -c "from db.models.tenant.messaging import MessageLog, MessageTemplate, RecallQueueRun, InboundMessage; from db.models.tenant.clinical import AuditAction; assert AuditAction.MESSAGE_SENT"` → exits 0
4. `cd backend && python -c "from schemas.messaging import MessageLogOut, BulkSendRequest"` → exits 0
5. `npx tsc --noEmit` → exits 0
6. `grep -c "CRM-" .planning/REQUIREMENTS.md` → at least 40
</verification>

<success_criteria>
- 4 new tables exist with correct columns + 6+ indexes (per ORM specifications)
- AuditAction enum extended with 18 messaging values
- appointments table gains 4 new columns (patient_confirmed_at, reminder_status, last_reminder_sent_at, reminders_sent_count)
- 2 query indexes for recall + reminder cadence in place
- Pydantic + TS types in lockstep (snake_case server → camelCase client)
- messaging entitlement in Plus + Premium plans (TS + Python)
- 20 CRM-* requirements in REQUIREMENTS.md with traceability table updated
</success_criteria>

<output>
After completion, create `.planning/phases/12-crm-patient-engagement/12-01-SUMMARY.md` documenting:
- Final list of new tables + their indexes
- AuditAction enum values added (the 18 names)
- Migration revision id chain (0015 → 0016)
- TS / Python type mirroring decision (any divergences from CONTEXT/RESEARCH)
- Decision on JSONB vs column for patient consent flags + tenant settings (RESEARCH.md § Conflicts §3-§5 confirmation)
</output>
