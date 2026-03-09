"""Add encounter_addenda table for post-finalization amendments.

Creates the EncounterAddendum table for immutable post-finalization notes.
AuditAction uses native_enum=False (VARCHAR), so no ALTER TYPE needed.

Revision ID: 0004_encounter_addenda
Revises: 0003_billing
Create Date: 2026-03-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0004_encounter_addenda"
down_revision: Union[str, None] = "0003_billing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # AuditAction is stored as VARCHAR (native_enum=False), so new values
    # are accepted without ALTER TYPE.

    # ── Create encounter_addenda table ────────────────────────────────────
    op.create_table(
        "encounter_addenda",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column(
            "encounter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("encounters.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id", ondelete="RESTRICT"),
            nullable=False,
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
            onupdate=sa.func.now(),
            nullable=False,
        ),
        # No is_deleted — addenda are immutable and cannot be soft-deleted.
    )


def downgrade() -> None:
    op.drop_table("encounter_addenda")
