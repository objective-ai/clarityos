"""insurance_revamp_fields: Add 7 new columns to patient_insurance + partial unique

Revision ID: 0012_insurance_revamp_fields
Revises: 0011_patient_prep_me_cache
Create Date: 2026-04-03

Adds copay_amount, eligibility_status, eligibility_verified_date, auth_number,
auth_expiry, auth_services, is_active columns to patient_insurance.

Replaces the hard unique constraint on (patient_id, priority) with a partial
unique index scoped to active records only (WHERE is_active = true).
"""
import sqlalchemy as sa
from alembic import op

revision: str = "0012_insurance_revamp_fields"
down_revision: str = "0011_patient_prep_me_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add is_active first (needed before constraint swap)
    op.add_column(
        "patient_insurance",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )

    # 2. Add remaining 6 columns
    op.add_column(
        "patient_insurance",
        sa.Column("copay_amount", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "patient_insurance",
        sa.Column(
            "eligibility_status",
            sa.String(30),
            nullable=False,
            server_default="unknown",
        ),
    )
    op.add_column(
        "patient_insurance",
        sa.Column("eligibility_verified_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "patient_insurance",
        sa.Column("auth_number", sa.String(100), nullable=True),
    )
    op.add_column(
        "patient_insurance",
        sa.Column("auth_expiry", sa.Date(), nullable=True),
    )
    op.add_column(
        "patient_insurance",
        sa.Column("auth_services", sa.Text(), nullable=True),
    )

    # 3. Drop old hard unique constraint
    op.drop_constraint("uq_patient_insurance_priority", "patient_insurance", type_="unique")

    # 4. Create partial unique index (active records only)
    op.execute(
        "CREATE UNIQUE INDEX uq_patient_insurance_active_priority "
        "ON patient_insurance (patient_id, priority) WHERE is_active = true"
    )

    # 5. Add check constraint for eligibility_status enum validation
    op.execute(
        "ALTER TABLE patient_insurance ADD CONSTRAINT ck_insurance_eligibility_status "
        "CHECK (eligibility_status IN ('active', 'inactive', 'pending_verification', 'expired', 'unknown'))"
    )


def downgrade() -> None:
    # Drop check constraint
    op.execute(
        "ALTER TABLE patient_insurance DROP CONSTRAINT ck_insurance_eligibility_status"
    )

    # Drop partial unique index
    op.execute("DROP INDEX IF EXISTS uq_patient_insurance_active_priority")

    # Recreate hard unique constraint
    op.create_unique_constraint(
        "uq_patient_insurance_priority",
        "patient_insurance",
        ["patient_id", "priority"],
    )

    # Drop the 7 new columns
    op.drop_column("patient_insurance", "auth_services")
    op.drop_column("patient_insurance", "auth_expiry")
    op.drop_column("patient_insurance", "auth_number")
    op.drop_column("patient_insurance", "eligibility_verified_date")
    op.drop_column("patient_insurance", "eligibility_status")
    op.drop_column("patient_insurance", "copay_amount")
    op.drop_column("patient_insurance", "is_active")
