"""Add problem_id FK to diagnoses table.

Links diagnoses to patient problems for master problem list sync.
Allows storing problem_id explicitly instead of parsing from notes field.

Revision ID: 0006_diagnosis_problem_id
Revises: 0005_rx_modality
Create Date: 2026-03-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_diagnosis_problem_id"
down_revision: Union[str, None] = "0005_rx_modality"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "diagnoses",
        sa.Column("problem_id", sa.UUID(), nullable=True),
    )
    op.create_index("ix_diagnoses_problem_id", "diagnoses", ["problem_id"])
    op.create_foreign_key(
        "fk_diagnoses_problem_id",
        "diagnoses",
        "patient_problems",
        ["problem_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_diagnoses_problem_id", "diagnoses", type_="foreignkey")
    op.drop_index("ix_diagnoses_problem_id", "diagnoses")
    op.drop_column("diagnoses", "problem_id")
