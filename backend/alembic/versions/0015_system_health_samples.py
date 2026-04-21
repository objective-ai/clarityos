"""system_health_samples

Creates the system_health_samples table in the public schema.
One row per health probe (on-demand /api/system/health/ hit OR the
background self-pinger). Feeds Plan 10.3-05 (uptime computation) and
Plan 10.3-06 (System Status UI).

Revision ID: 0015_system_health_samples
Revises: 0014_staff_scheduling
Create Date: 2026-04-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0015_system_health_samples"
down_revision = "0014_staff_scheduling"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_health_samples",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "checked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("api_status", sa.String(16), nullable=False),
        sa.Column("pg_status", sa.String(16), nullable=False),
        sa.Column("pg_latency_ms", sa.Integer(), nullable=False),
        sa.Column("auth_status", sa.String(16), nullable=False),
        sa.Column("auth_latency_ms", sa.Integer(), nullable=False),
        sa.Column("all_green", sa.Boolean(), nullable=False),
        schema="public",
    )
    op.create_index(
        "ix_system_health_samples_checked_at",
        "system_health_samples",
        ["checked_at"],
        schema="public",
    )
    op.create_index(
        "ix_system_health_samples_all_green",
        "system_health_samples",
        ["all_green"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_system_health_samples_all_green",
        table_name="system_health_samples",
        schema="public",
    )
    op.drop_index(
        "ix_system_health_samples_checked_at",
        table_name="system_health_samples",
        schema="public",
    )
    op.drop_table("system_health_samples", schema="public")
