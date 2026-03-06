"""Add appointments table and related enum types.

The Appointment ORM model is defined in backend/db/models/tenant/clinical.py.
This migration creates the backing database table, indexes, check constraints,
foreign keys, and the two PostgreSQL enum types for appointment_status and
appointment_type.

Note: The encounters table already carries appointment_id in the ORM. The
baseline migration was a no-op, so this migration conditionally adds the
appointment_id column to encounters if it does not already exist.

Revision ID: 0002_appointments
Revises: 0001_baseline
Create Date: 2026-03-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_appointments"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Enum type helpers
# ---------------------------------------------------------------------------

appointment_status_enum = postgresql.ENUM(
    "scheduled",
    "confirmed",
    "arrived",
    "in_pretest",
    "in_exam",
    "completed",
    "cancelled",
    "no_show",
    name="appointment_status_enum",
    create_type=False,
)

appointment_type_enum = postgresql.ENUM(
    "comprehensive_exam",
    "contact_lens_exam",
    "follow_up",
    "urgent_care",
    "pediatric_exam",
    name="appointment_type_enum",
    create_type=False,
)


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    # ---- 1. Create PostgreSQL enum types ------------------------------------
    appointment_status_enum.create(op.get_bind(), checkfirst=True)
    appointment_type_enum.create(op.get_bind(), checkfirst=True)

    # ---- 2. Create the appointments table ----------------------------------
    op.create_table(
        "appointments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        # Foreign keys
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("booked_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Enums
        sa.Column(
            "appointment_type",
            sa.Enum(
                "comprehensive_exam",
                "contact_lens_exam",
                "follow_up",
                "urgent_care",
                "pediatric_exam",
                name="appointment_type_enum",
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "scheduled",
                "confirmed",
                "arrived",
                "in_pretest",
                "in_exam",
                "completed",
                "cancelled",
                "no_show",
                name="appointment_status_enum",
                create_constraint=False,
            ),
            nullable=False,
            server_default="scheduled",
        ),
        # Scheduling fields
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "duration_minutes",
            sa.Integer(),
            nullable=False,
            server_default="30",
        ),
        # Clinical intake
        sa.Column("chief_complaint", sa.Text(), nullable=True),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
        # Timestamps (TimestampMixin)
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        # Constraints
        sa.CheckConstraint("end_time > start_time", name="ck_appointment_times"),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["staff.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["booked_by_id"],
            ["staff.id"],
            ondelete="SET NULL",
        ),
    )

    # ---- 3. Indexes --------------------------------------------------------
    op.create_index(
        "ix_appointments_tenant_id",
        "appointments",
        ["tenant_id"],
    )
    op.create_index(
        "ix_appointments_patient_id",
        "appointments",
        ["patient_id"],
    )
    op.create_index(
        "ix_appointments_provider_start",
        "appointments",
        ["provider_id", "start_time"],
    )
    op.create_index(
        "ix_appointments_start_time",
        "appointments",
        ["start_time"],
    )

    # ---- 4. Add appointment_id FK to encounters (idempotent) ---------------
    # The Encounter ORM model has appointment_id but the baseline migration
    # was a no-op.  We add the column only if it does not already exist.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'encounters'
                  AND column_name = 'appointment_id'
            ) THEN
                ALTER TABLE encounters
                    ADD COLUMN appointment_id UUID UNIQUE;
                ALTER TABLE encounters
                    ADD CONSTRAINT fk_encounters_appointment_id
                    FOREIGN KEY (appointment_id)
                    REFERENCES appointments(id)
                    ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    # Remove appointment_id FK from encounters
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'encounters'
                  AND column_name = 'appointment_id'
            ) THEN
                ALTER TABLE encounters DROP COLUMN appointment_id;
            END IF;
        END $$;
        """
    )

    # Drop indexes
    op.drop_index("ix_appointments_start_time", table_name="appointments")
    op.drop_index("ix_appointments_provider_start", table_name="appointments")
    op.drop_index("ix_appointments_patient_id", table_name="appointments")
    op.drop_index("ix_appointments_tenant_id", table_name="appointments")

    # Drop the appointments table
    op.drop_table("appointments")

    # Drop enum types
    appointment_status_enum.drop(op.get_bind(), checkfirst=True)
    appointment_type_enum.drop(op.get_bind(), checkfirst=True)
