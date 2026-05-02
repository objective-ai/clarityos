"""products: add is_deleted + deleted_at (SoftDeleteMixin schema gap)

Phase 13-15 gap closure. The Product ORM model in
backend/db/models/tenant/clinical.py declares
``Product(TimestampMixin, SoftDeleteMixin, TenantBase)``, which adds
``is_deleted: bool`` and ``deleted_at: datetime | None`` columns. Migration
0017 omitted those columns when creating the products table, so every
SELECT against products fails at runtime with::

    UndefinedColumnError: column products.is_deleted does not exist

This migration adds the columns server-side with safe defaults so the
existing dev seed data is unaffected.

Revision ID: 0018_products_soft_delete
Revises: 0017_retail_inventory
Create Date: 2026-05-02
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0018_products_soft_delete"
down_revision: Union[str, None] = "0017_retail_inventory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "products",
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("products", "deleted_at")
    op.drop_column("products", "is_deleted")
