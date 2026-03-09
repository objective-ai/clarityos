"""Add rx_modality column to refractions table.

Stores whether a final Rx is for glasses or contact lenses.
Default 'glasses' for all existing rows.

Revision ID: 0005_rx_modality
Revises: 0004_encounter_addenda
Create Date: 2026-03-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_rx_modality"
down_revision: Union[str, None] = "0004_encounter_addenda"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "refractions",
        sa.Column("rx_modality", sa.String(50), nullable=False, server_default="glasses"),
    )


def downgrade() -> None:
    op.drop_column("refractions", "rx_modality")
