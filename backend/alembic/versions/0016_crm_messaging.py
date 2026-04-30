"""Phase 12 CRM & Patient Engagement: messaging tables + appointment column adds.

Creates 4 tenant tables (message_log, message_template, recall_queue_run,
inbound_message), adds 4 columns to appointments for reminder tracking,
and creates 2 supporting indexes for recall + reminder queries.

Patient consent flags + tenant messaging settings live in JSONB
(contact_info_jsonb / settings_jsonb respectively) — no schema change needed.

AuditAction enum extension is Python-only (VARCHAR(50) storage —
see 0008_claims_basics.py:78) so no ALTER TYPE here.

Revision ID: 0016_crm_messaging
Revises: 0015_system_health_samples
Create Date: 2026-04-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "0016_crm_messaging"
down_revision = "0015_system_health_samples"
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
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
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
        sa.Column(
            "patient_id",
            UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "appointment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("appointments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("template_kind", sa.String(40), nullable=True),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("message_template.id", ondelete="SET NULL"),
            nullable=True,
        ),
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
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_message_log_tenant_id", "message_log", ["tenant_id"])
    op.create_index(
        "ix_message_log_tenant_patient_created",
        "message_log",
        ["tenant_id", "patient_id", "created_at"],
    )
    op.create_index("ix_message_log_provider_msg_id", "message_log", ["provider_message_id"])
    op.create_index("ix_message_log_batch", "message_log", ["batch_id"])
    op.create_index("ix_message_log_appointment", "message_log", ["appointment_id"])
    op.create_index(
        "ix_message_log_status",
        "message_log",
        ["tenant_id", "status", "created_at"],
    )

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
    op.create_index(
        "ix_recall_queue_run_tenant_started",
        "recall_queue_run",
        ["tenant_id", "started_at"],
    )

    # 4. inbound_message
    op.create_table(
        "inbound_message",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "patient_id",
            UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("from_e164", sa.String(20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("classification", sa.String(40), nullable=True),
        sa.Column("classification_confidence", sa.String(10), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "replied_message_id",
            UUID(as_uuid=True),
            sa.ForeignKey("message_log.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("provider_message_id", sa.String(100), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_inbound_message_tenant_id", "inbound_message", ["tenant_id"])
    op.create_index(
        "ix_inbound_message_tenant_unread",
        "inbound_message",
        ["tenant_id", "is_read", "received_at"],
    )
    op.create_index(
        "ix_inbound_message_patient",
        "inbound_message",
        ["patient_id", "received_at"],
    )
    op.create_index(
        "ix_inbound_message_provider_msg_id",
        "inbound_message",
        ["provider_message_id"],
        unique=True,
    )

    # 5. appointments column adds (idempotent — Phase 10.2 precedent)
    op.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_confirmed_at TIMESTAMPTZ")
    op.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_status VARCHAR(20)")
    op.execute("ALTER TABLE appointments ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ")
    op.execute(
        "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "
        "reminders_sent_count INTEGER NOT NULL DEFAULT 0"
    )

    # 6. Recall query support indexes (RESEARCH.md lines 521-529)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_encounters_tenant_finalized_patient "
        "ON encounters (tenant_id, finalized_at DESC, patient_id) "
        "WHERE finalized_at IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_appointments_tenant_patient_starttime "
        "ON appointments (tenant_id, patient_id, start_time)"
    )


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
