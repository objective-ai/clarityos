"""Add 'finalized' to appointment_status PostgreSQL enum.

The finalize encounter route sets appointment.status = 'finalized'
when an encounter is signed off by a provider. This value was missing
from the appointment_status enum type in PostgreSQL, causing every
POST /encounters/{id}/finalize to return 500.

Note: The DB enum type is named 'appointment_status' (Supabase default),
NOT 'appointment_status_enum' as referenced in 0002_appointments.py.

Revision ID: 0007_appt_finalized
Revises: 0006_diagnosis_problem_id
Create Date: 2026-03-13

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_appt_finalized"
down_revision: Union[str, None] = "0006_diagnosis_problem_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ADD VALUE must be committed immediately (cannot run inside a transaction
    # on some PostgreSQL versions). Use execute_if to be safe.
    # IF NOT EXISTS prevents errors on repeat runs.
    op.execute(
        "ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'finalized'"
    )


def downgrade() -> None:
    # PostgreSQL does not support removing enum values.
    # Downgrade is intentionally a no-op.
    pass
