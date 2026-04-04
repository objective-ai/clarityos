"""Add checked_in_at to appointments table

Revision ID: 0013
Revises: 0012_insurance_revamp_fields
Create Date: 2026-04-03

Adds checked_in_at TIMESTAMPTZ column to appointments table in each tenant schema.
Uses ADD COLUMN IF NOT EXISTS for idempotency (column already exists in dev via
provision_user.py raw SQL).
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0013"
down_revision = "0012_insurance_revamp_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use raw SQL with IF NOT EXISTS for idempotency across dev + production tenants.
    # The column already exists in dev schemas created by provision_user.py.
    op.execute(
        sa.text(
            "ALTER TABLE appointments ADD COLUMN IF NOT EXISTS "
            "checked_in_at TIMESTAMPTZ"
        )
    )


def downgrade() -> None:
    op.drop_column("appointments", "checked_in_at")
