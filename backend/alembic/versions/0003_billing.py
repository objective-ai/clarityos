"""Add superbills and superbill_line_items tables for billing.

Creates the Superbill and SuperbillLineItem tables, the claim_status_enum
PostgreSQL type, and adds billing-related AuditAction values.

Revision ID: 0003_billing
Revises: 0002_appointments
Create Date: 2026-03-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_billing"
down_revision: Union[str, None] = "0002_appointments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Enum type helpers
# ---------------------------------------------------------------------------

claim_status_enum = postgresql.ENUM(
    "draft",
    "ready_to_bill",
    "submitted",
    "accepted",
    "rejected",
    name="claim_status_enum",
    create_type=False,
)


def upgrade() -> None:
    # ── Create enum types ────────────────────────────────────────────────
    claim_status_enum.create(op.get_bind(), checkfirst=True)

    # ── Add new AuditAction values ───────────────────────────────────────
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'create_superbill'")
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'update_superbill'")
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'submit_superbill'")

    # ── Create superbills table ──────────────────────────────────────────
    op.create_table(
        "superbills",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "encounter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("encounters.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "provider_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "claim_status",
            claim_status_enum,
            nullable=False,
            server_default="draft",
        ),
        sa.Column("mdm_level", sa.String(50), nullable=True),
        sa.Column("mdm_reasoning", sa.Text, nullable=True),
        sa.Column("suggested_em_code", sa.String(10), nullable=True),
        sa.Column(
            "total_fee",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index("ix_superbills_tenant_id", "superbills", ["tenant_id"])
    op.create_index("ix_superbills_encounter", "superbills", ["encounter_id"])
    op.create_index("ix_superbills_patient_id", "superbills", ["patient_id"])
    op.create_index(
        "ix_superbills_status", "superbills", ["tenant_id", "claim_status"]
    )

    # ── Create superbill_line_items table ────────────────────────────────
    op.create_table(
        "superbill_line_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "superbill_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("superbills.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("cpt_code", sa.String(10), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column(
            "fee",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column("units", sa.Integer, nullable=False, server_default="1"),
        sa.Column(
            "diagnosis_pointers",
            postgresql.JSONB,
            nullable=False,
            server_default="'[]'::jsonb",
        ),
        sa.Column(
            "modifiers",
            postgresql.JSONB,
            nullable=False,
            server_default="'[]'::jsonb",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_superbill_line_items_tenant_id",
        "superbill_line_items",
        ["tenant_id"],
    )
    op.create_index(
        "ix_superbill_line_items_superbill",
        "superbill_line_items",
        ["superbill_id"],
    )


def downgrade() -> None:
    op.drop_table("superbill_line_items")
    op.drop_table("superbills")
    claim_status_enum.drop(op.get_bind(), checkfirst=True)
