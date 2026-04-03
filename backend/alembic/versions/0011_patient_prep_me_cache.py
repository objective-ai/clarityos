"""patient_prep_me_cache: Cache AI Prep Me summary on patients table

Revision ID: 0011_patient_prep_me_cache
Revises: 0010_add_preliminary_fields
Create Date: 2026-03-28

Adds prep_me_summary (Text) and prep_me_generated_at (DateTime) to patients
so the AI pre-visit summary is generated once per day instead of on every request.
"""
import sqlalchemy as sa
from alembic import op

revision: str = "0011_patient_prep_me_cache"
down_revision: str = "0010_add_preliminary_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("prep_me_summary", sa.Text(), nullable=True))
    op.add_column(
        "patients",
        sa.Column("prep_me_generated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("patients", "prep_me_generated_at")
    op.drop_column("patients", "prep_me_summary")
