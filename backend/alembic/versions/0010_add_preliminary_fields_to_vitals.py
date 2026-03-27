"""add_preliminary_fields_to_vitals: Add 9 pre-test columns to vitals_and_pretest

Revision ID: 0010_add_preliminary_fields
Revises: 0009_enable_rls_public_tables
Create Date: 2026-03-27

Adds confrontation, motility, color_vision, npc, pupils_od_mm, pupils_os_mm,
autorefractor, keratometer, and entrance_rx columns for the pre-test technician
workflow (Phase 10 — Encounter Workflow Redesign).
"""
import sqlalchemy as sa
from alembic import op

revision: str = "0010_add_preliminary_fields"
down_revision: str = "0009_enable_rls_public_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vitals_and_pretest", sa.Column("confrontation", sa.String(100), nullable=True))
    op.add_column("vitals_and_pretest", sa.Column("motility", sa.String(100), nullable=True))
    op.add_column("vitals_and_pretest", sa.Column("color_vision", sa.String(100), nullable=True))
    op.add_column("vitals_and_pretest", sa.Column("npc", sa.String(100), nullable=True))
    op.add_column("vitals_and_pretest", sa.Column("pupils_od_mm", sa.Numeric(4, 1), nullable=True))
    op.add_column("vitals_and_pretest", sa.Column("pupils_os_mm", sa.Numeric(4, 1), nullable=True))
    op.add_column("vitals_and_pretest", sa.Column("autorefractor", sa.Text(), nullable=True))
    op.add_column("vitals_and_pretest", sa.Column("keratometer", sa.Text(), nullable=True))
    op.add_column("vitals_and_pretest", sa.Column("entrance_rx", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("vitals_and_pretest", "entrance_rx")
    op.drop_column("vitals_and_pretest", "keratometer")
    op.drop_column("vitals_and_pretest", "autorefractor")
    op.drop_column("vitals_and_pretest", "pupils_os_mm")
    op.drop_column("vitals_and_pretest", "pupils_od_mm")
    op.drop_column("vitals_and_pretest", "npc")
    op.drop_column("vitals_and_pretest", "color_vision")
    op.drop_column("vitals_and_pretest", "motility")
    op.drop_column("vitals_and_pretest", "confrontation")
