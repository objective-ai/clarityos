"""staff scheduling: weekly schedule, blocked times, attendance

Revision ID: 0014_staff_scheduling
Revises: 0013
Create Date: 2026-04-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014_staff_scheduling"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_weekly_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("staff_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("staff.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("staff_id", "day_of_week", name="uq_staff_weekly_schedule_day"),
    )
    op.create_index("ix_staff_weekly_schedules_tenant_id", "staff_weekly_schedules", ["tenant_id"])
    op.create_index("ix_staff_weekly_schedules_staff_id", "staff_weekly_schedules", ["staff_id"])

    op.create_table(
        "staff_blocked_times",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("staff_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("staff.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("block_type", sa.String(length=20), nullable=False, server_default="other"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_staff_blocked_times_tenant_id", "staff_blocked_times", ["tenant_id"])
    op.create_index("ix_staff_blocked_times_staff_id", "staff_blocked_times", ["staff_id"])
    op.create_index("ix_staff_blocked_times_staff_start", "staff_blocked_times", ["staff_id", "start_datetime"])

    op.create_table(
        "staff_attendance",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("staff_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("staff.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clock_in_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clock_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_staff_attendance_tenant_id", "staff_attendance", ["tenant_id"])
    op.create_index("ix_staff_attendance_staff_id", "staff_attendance", ["staff_id"])
    op.create_index("ix_staff_attendance_date", "staff_attendance", ["date"])
    op.create_index("ix_staff_attendance_staff_date", "staff_attendance", ["staff_id", "date"])


def downgrade() -> None:
    op.drop_table("staff_attendance")
    op.drop_table("staff_blocked_times")
    op.drop_table("staff_weekly_schedules")
