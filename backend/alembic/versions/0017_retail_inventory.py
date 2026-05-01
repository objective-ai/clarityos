"""retail inventory: products, optical_orders, line_items, inventory_transactions

Phase 13 — Retail Inventory & Optical Orders.

Creates the four foundational tables for retail-side workflows:
  - products              (frames + contact lenses, JSONB attributes,
                           per-product stock_qty + reorder_threshold)
  - optical_orders        (status: draft -> placed -> dispensed | cancelled)
  - optical_order_line_items
  - inventory_transactions (append-only stock movement audit log)

Partial unique index ``uq_products_active_sku`` on (tenant_id, sku)
WHERE is_active = true mirrors the Phase 10.1 PatientInsurance pattern:
soft-deleted (is_active=false) products preserve historical SKUs without
blocking the live catalog.

All enum-like columns stored as VARCHAR with CHECK constraints
(per .claude/rules/backend-python.md — no native PostgreSQL enums).
AuditAction enum extension is Python-only (clinical.py); audit_log.action
is VARCHAR(50) so no ALTER TYPE is needed.

Revision ID: 0017_retail_inventory
Revises: 0016_crm_messaging
Create Date: 2026-05-01
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0017_retail_inventory"
down_revision: Union[str, None] = "0016_crm_messaging"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # products
    # ------------------------------------------------------------------
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_type", sa.String(20), nullable=False),
        sa.Column("brand", sa.String(100), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("sku", sa.String(100), nullable=False),
        sa.Column("upc", sa.String(50), nullable=True),
        sa.Column(
            "attributes",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("retail_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("cost_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("stock_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reorder_threshold", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
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
        sa.CheckConstraint(
            "product_type IN ('frame', 'contact_lens')",
            name="ck_product_type",
        ),
    )
    op.create_index("ix_products_tenant_id", "products", ["tenant_id"])
    op.create_index(
        "ix_products_tenant_type_active",
        "products",
        ["tenant_id", "product_type", "is_active"],
    )
    # Partial unique index — verbatim shape from 0012_insurance_revamp_fields.py:64-67
    op.execute(
        "CREATE UNIQUE INDEX uq_products_active_sku "
        "ON products (tenant_id, sku) WHERE is_active = true"
    )

    # ------------------------------------------------------------------
    # optical_orders
    # ------------------------------------------------------------------
    op.create_table(
        "optical_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "encounter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("encounters.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column(
            "total_price",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("placed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispensed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint(
            "status IN ('draft','placed','dispensed','cancelled')",
            name="ck_optical_order_status",
        ),
    )
    op.create_index(
        "ix_optical_orders_tenant_patient",
        "optical_orders",
        ["tenant_id", "patient_id"],
    )
    op.create_index(
        "ix_optical_orders_encounter",
        "optical_orders",
        ["encounter_id"],
    )

    # ------------------------------------------------------------------
    # optical_order_line_items
    # Phase 14 will ADD COLUMN here for lens config / coatings / measurements.
    # ------------------------------------------------------------------
    op.create_table(
        "optical_order_line_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("optical_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("qty", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_optical_order_line_items_order",
        "optical_order_line_items",
        ["order_id"],
    )

    # ------------------------------------------------------------------
    # inventory_transactions — append-only stock movement audit
    # delta is signed: -2 = decrement on order_placed; +5 = receive_stock.
    # ------------------------------------------------------------------
    op.create_table(
        "inventory_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column(
            "optical_order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("optical_orders.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "staff_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("po_reference", sa.String(100), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "reason IN ('order_placed','order_cancelled','receive_stock','manual_adjust')",
            name="ck_inventory_reason",
        ),
    )
    op.create_index(
        "ix_inventory_transactions_product",
        "inventory_transactions",
        ["product_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("inventory_transactions")
    op.drop_table("optical_order_line_items")
    op.drop_table("optical_orders")
    op.execute("DROP INDEX IF EXISTS uq_products_active_sku")
    op.drop_table("products")
