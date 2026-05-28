"""point of sale: sales, line items, payments, refunds, daily close, stripe webhooks

Phase 15 — Point of Sale (financial ledger schema).

Creates 8 new tables that hold the full sale → payment → refund → daily-close
lifecycle, plus extensions to existing tables:

- ``sales``                  — open / paid / refunded / voided lifecycle.
- ``sale_line_items``        — superbill / optical_order / product / adhoc;
                               carries optical_order_line_item_id FK for
                               exact restock targeting (Plan 15-05).
- ``payments``               — cash / stripe_card / external_card / write_off,
                               with Stripe processor IDs and last4 / brand.
- ``refunds``                — refund header with mandatory ``reason``.
- ``refund_line_items``      — refund ↔ sale line join (qty, amount).
- ``refund_payments``        — refund ↔ payment allocation join.
- ``daily_close_runs``       — end-of-day cash reconciliation (one per day).
- ``stripe_webhook_events``  — idempotency log (event_id globally unique).

Existing tables extended:

- ``tenants``                — sales_tax_rate (Numeric 5,4) +
                               stripe_publishable_key / stripe_secret_key_encrypted /
                               stripe_webhook_secret_encrypted columns.
- ``inventory_transactions`` — sale_id FK column + ck_inventory_reason CHECK
                               widened with 'sale_placed' and 'refund_restock'.

Enum-like columns stored as VARCHAR with CHECK constraints (per
.claude/rules/backend-python.md — no native PostgreSQL enums).

AuditAction extensions are Python-only (clinical.py); audit_log.action is
VARCHAR(50) so no ALTER TYPE is needed (see 0008_claims_basics.py:78).

Stripe secret + webhook secret are persisted Fernet-encrypted (Plan 15-02
backend.services.payments.crypto); migration only allocates TEXT columns.

Revision ID: 0020_phase15_point_of_sale
Revises: 0019_optical_order_configuration
Create Date: 2026-05-28
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0020_phase15_point_of_sale"
down_revision: Union[str, None] = "0019_optical_order_configuration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. tenants — Phase 15 payment-config column additions.
    #    Idempotent ADD COLUMN IF NOT EXISTS so dev DBs that already ran a
    #    partial 0020 don't fail on re-run (matches Phase 10.2 pattern).
    # ------------------------------------------------------------------
    op.execute(
        "ALTER TABLE tenants "
        "ADD COLUMN IF NOT EXISTS sales_tax_rate NUMERIC(5,4) "
        "NOT NULL DEFAULT 0.0725"
    )
    op.execute(
        "ALTER TABLE tenants "
        "ADD COLUMN IF NOT EXISTS stripe_publishable_key VARCHAR(128)"
    )
    op.execute(
        "ALTER TABLE tenants "
        "ADD COLUMN IF NOT EXISTS stripe_secret_key_encrypted TEXT"
    )
    op.execute(
        "ALTER TABLE tenants "
        "ADD COLUMN IF NOT EXISTS stripe_webhook_secret_encrypted TEXT"
    )

    # ------------------------------------------------------------------
    # 2. sales — the financial-and-inventory commit point.
    # ------------------------------------------------------------------
    op.create_table(
        "sales",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patients.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "subtotal",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column("tax", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column(
            "discount_total",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column("total", sa.Numeric(10, 2), nullable=False, server_default="0.00"),
        sa.Column("receipt_number", sa.String(20), nullable=True),
        sa.Column("receipt_url", sa.Text(), nullable=True),
        sa.Column("notes", sa.String(1000), nullable=True),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "opened_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('open','paid','refunded','voided')",
            name="ck_sale_status",
        ),
    )
    op.create_index("ix_sales_tenant_id", "sales", ["tenant_id"])
    op.create_index(
        "ix_sales_tenant_patient", "sales", ["tenant_id", "patient_id"]
    )
    op.create_index(
        "ix_sales_tenant_status_closed",
        "sales",
        ["tenant_id", "status", "closed_at"],
    )
    op.create_index(
        "ix_sales_tenant_opened_desc", "sales", ["tenant_id", "opened_at"]
    )
    # Partial unique index — receipt_number only assigned on close.
    op.execute(
        "CREATE UNIQUE INDEX uq_sales_receipt_number "
        "ON sales (tenant_id, receipt_number) WHERE receipt_number IS NOT NULL"
    )

    # ------------------------------------------------------------------
    # 3. sale_line_items — carries optical_order_line_item_id for restock.
    # ------------------------------------------------------------------
    op.create_table(
        "sale_line_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "sale_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sales.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "optical_order_line_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("optical_order_line_items.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "discount_amount",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column("discount_reason", sa.String(200), nullable=True),
        sa.Column(
            "taxable", sa.Boolean(), nullable=False, server_default="true"
        ),
        sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
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
        sa.CheckConstraint("qty > 0", name="ck_sale_line_qty_positive"),
        sa.CheckConstraint(
            "source_type IN ('superbill','optical_order','product','adhoc')",
            name="ck_sale_line_source_type",
        ),
    )
    op.create_index("ix_sale_line_items_sale", "sale_line_items", ["sale_id"])
    op.create_index(
        "ix_sale_line_items_source",
        "sale_line_items",
        ["tenant_id", "source_type", "source_id"],
    )
    op.execute(
        "CREATE INDEX ix_sale_line_items_optical_oli "
        "ON sale_line_items (tenant_id, optical_order_line_item_id) "
        "WHERE optical_order_line_item_id IS NOT NULL"
    )

    # ------------------------------------------------------------------
    # 4. payments — cash / stripe_card / external_card / write_off.
    # ------------------------------------------------------------------
    op.create_table(
        "payments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "sale_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sales.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("tendered", sa.Numeric(10, 2), nullable=True),
        sa.Column("change_due", sa.Numeric(10, 2), nullable=True),
        sa.Column("processor_payment_id", sa.String(128), nullable=True),
        sa.Column("processor_charge_id", sa.String(128), nullable=True),
        sa.Column("last4", sa.String(4), nullable=True),
        sa.Column("card_brand", sa.String(20), nullable=True),
        sa.Column("auth_code", sa.String(20), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("reason_note", sa.String(500), nullable=True),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id", ondelete="SET NULL"),
            nullable=True,
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
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
        sa.CheckConstraint(
            "method IN ('cash','stripe_card','external_card','write_off')",
            name="ck_payment_method",
        ),
        sa.CheckConstraint(
            "status IN ('pending','succeeded','failed','refunded','partial_refund')",
            name="ck_payment_status",
        ),
    )
    op.create_index("ix_payments_sale", "payments", ["sale_id"])
    op.execute(
        "CREATE UNIQUE INDEX uq_payments_processor_payment_id "
        "ON payments (tenant_id, processor_payment_id) "
        "WHERE processor_payment_id IS NOT NULL"
    )
    op.create_index(
        "ix_payments_tenant_status_created",
        "payments",
        ["tenant_id", "status", "created_at"],
    )

    # ------------------------------------------------------------------
    # 5. refunds — header (mandatory reason).
    # ------------------------------------------------------------------
    op.create_table(
        "refunds",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "sale_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sales.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column(
            "refunded_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("processor_refund_id", sa.String(128), nullable=True),
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
            "total_amount > 0", name="ck_refund_amount_positive"
        ),
    )
    op.create_index("ix_refunds_sale", "refunds", ["sale_id"])
    op.create_index(
        "ix_refunds_tenant_created", "refunds", ["tenant_id", "created_at"]
    )

    # ------------------------------------------------------------------
    # 6. refund_line_items — join (refund ↔ sale line).
    # ------------------------------------------------------------------
    op.create_table(
        "refund_line_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "refund_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("refunds.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sale_line_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sale_line_items.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("qty > 0", name="ck_refund_line_qty_positive"),
    )
    op.create_index(
        "ix_refund_line_items_refund", "refund_line_items", ["refund_id"]
    )
    op.create_index(
        "ix_refund_line_items_sale_line",
        "refund_line_items",
        ["sale_line_item_id"],
    )

    # ------------------------------------------------------------------
    # 7. refund_payments — join (refund ↔ payment).
    # ------------------------------------------------------------------
    op.create_table(
        "refund_payments",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "refund_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("refunds.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "payment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payments.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("processor_refund_id", sa.String(128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "amount > 0", name="ck_refund_payment_amount_positive"
        ),
    )
    op.create_index(
        "ix_refund_payments_refund", "refund_payments", ["refund_id"]
    )
    op.create_index(
        "ix_refund_payments_payment", "refund_payments", ["payment_id"]
    )

    # ------------------------------------------------------------------
    # 8. daily_close_runs — end-of-day cash reconciliation.
    # ------------------------------------------------------------------
    op.create_table(
        "daily_close_runs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("close_date", sa.Date(), nullable=False),
        sa.Column(
            "expected_cash",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0.00",
        ),
        sa.Column("counted_cash", sa.Numeric(10, 2), nullable=False),
        sa.Column("variance", sa.Numeric(10, 2), nullable=False),
        sa.Column("notes", sa.String(1000), nullable=True),
        sa.Column(
            "run_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staff.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "run_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "tenant_id", "close_date", name="uq_daily_close_per_day"
        ),
    )
    op.create_index(
        "ix_daily_close_tenant_date",
        "daily_close_runs",
        ["tenant_id", "close_date"],
    )

    # ------------------------------------------------------------------
    # 9. stripe_webhook_events — Stripe idempotency log (event_id global).
    # ------------------------------------------------------------------
    op.create_table(
        "stripe_webhook_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("payment_intent_id", sa.String(128), nullable=True),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("event_id", name="uq_stripe_webhook_event_id"),
    )
    op.create_index(
        "ix_stripe_webhook_tenant_received",
        "stripe_webhook_events",
        ["tenant_id", "received_at"],
    )

    # ------------------------------------------------------------------
    # 10. inventory_transactions — Phase 15 extensions.
    #     (a) ADD COLUMN sale_id + FK to sales (now that sales exists).
    #     (b) DROP + ADD ck_inventory_reason to include the 2 new reasons.
    # ------------------------------------------------------------------
    op.execute(
        "ALTER TABLE inventory_transactions "
        "ADD COLUMN IF NOT EXISTS sale_id UUID"
    )
    op.create_foreign_key(
        "fk_inventory_transactions_sale",
        "inventory_transactions",
        "sales",
        ["sale_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_inventory_transactions_sale",
        "inventory_transactions",
        ["tenant_id", "sale_id"],
    )
    op.drop_constraint(
        "ck_inventory_reason", "inventory_transactions", type_="check"
    )
    op.create_check_constraint(
        "ck_inventory_reason",
        "inventory_transactions",
        "reason IN ('order_placed','order_cancelled','receive_stock',"
        "'manual_adjust','sale_placed','refund_restock')",
    )


def downgrade() -> None:
    # ------------------------------------------------------------------
    # Reverse inventory_transactions extensions first (revert CHECK to the
    # Phase 13 set, drop FK + column + index).
    # ------------------------------------------------------------------
    op.drop_constraint(
        "ck_inventory_reason", "inventory_transactions", type_="check"
    )
    op.create_check_constraint(
        "ck_inventory_reason",
        "inventory_transactions",
        "reason IN ('order_placed','order_cancelled','receive_stock','manual_adjust')",
    )
    op.drop_index(
        "ix_inventory_transactions_sale", table_name="inventory_transactions"
    )
    op.drop_constraint(
        "fk_inventory_transactions_sale",
        "inventory_transactions",
        type_="foreignkey",
    )
    op.drop_column("inventory_transactions", "sale_id")

    # ------------------------------------------------------------------
    # Drop new tables in reverse FK dependency order.
    # ------------------------------------------------------------------
    op.drop_index(
        "ix_stripe_webhook_tenant_received", table_name="stripe_webhook_events"
    )
    op.drop_table("stripe_webhook_events")

    op.drop_index(
        "ix_daily_close_tenant_date", table_name="daily_close_runs"
    )
    op.drop_table("daily_close_runs")

    op.drop_index(
        "ix_refund_payments_payment", table_name="refund_payments"
    )
    op.drop_index(
        "ix_refund_payments_refund", table_name="refund_payments"
    )
    op.drop_table("refund_payments")

    op.drop_index(
        "ix_refund_line_items_sale_line", table_name="refund_line_items"
    )
    op.drop_index(
        "ix_refund_line_items_refund", table_name="refund_line_items"
    )
    op.drop_table("refund_line_items")

    op.drop_index("ix_refunds_tenant_created", table_name="refunds")
    op.drop_index("ix_refunds_sale", table_name="refunds")
    op.drop_table("refunds")

    op.drop_index(
        "ix_payments_tenant_status_created", table_name="payments"
    )
    op.execute("DROP INDEX IF EXISTS uq_payments_processor_payment_id")
    op.drop_index("ix_payments_sale", table_name="payments")
    op.drop_table("payments")

    op.execute("DROP INDEX IF EXISTS ix_sale_line_items_optical_oli")
    op.drop_index(
        "ix_sale_line_items_source", table_name="sale_line_items"
    )
    op.drop_index("ix_sale_line_items_sale", table_name="sale_line_items")
    op.drop_table("sale_line_items")

    op.execute("DROP INDEX IF EXISTS uq_sales_receipt_number")
    op.drop_index("ix_sales_tenant_opened_desc", table_name="sales")
    op.drop_index("ix_sales_tenant_status_closed", table_name="sales")
    op.drop_index("ix_sales_tenant_patient", table_name="sales")
    op.drop_index("ix_sales_tenant_id", table_name="sales")
    op.drop_table("sales")

    # ------------------------------------------------------------------
    # Tenant column removals (ADD COLUMN IF NOT EXISTS counterparts).
    # ------------------------------------------------------------------
    op.drop_column("tenants", "stripe_webhook_secret_encrypted")
    op.drop_column("tenants", "stripe_secret_key_encrypted")
    op.drop_column("tenants", "stripe_publishable_key")
    op.drop_column("tenants", "sales_tax_rate")
