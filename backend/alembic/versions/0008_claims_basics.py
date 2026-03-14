"""claims_basics: InsurancePayer, FeeScheduleItem, PatientInsurance + Superbill extensions

Revision ID: 0008_claims_basics
Revises: 0007_appt_finalized
Create Date: 2026-03-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "0008_claims_basics"
down_revision: str = "0007_appt_finalized"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "insurance_payers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("payer_id", sa.String(50), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("metadata_jsonb", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_index("ix_insurance_payers_tenant_id", "insurance_payers", ["tenant_id"])

    op.create_table(
        "fee_schedule_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("payer_id", UUID(as_uuid=True), sa.ForeignKey("insurance_payers.id", ondelete="CASCADE"), nullable=True),
        sa.Column("cpt_code", sa.String(10), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("fee", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "payer_id", "cpt_code", name="uq_fee_payer_cpt"),
    )
    op.create_index("ix_fee_schedule_items_tenant_id", "fee_schedule_items", ["tenant_id"])

    op.create_table(
        "patient_insurance",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payer_id", UUID(as_uuid=True), sa.ForeignKey("insurance_payers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("priority", sa.String(10), nullable=False),
        sa.Column("plan_type", sa.String(20), nullable=False),
        sa.Column("subscriber_id", sa.String(100), nullable=True),
        sa.Column("group_number", sa.String(100), nullable=True),
        sa.Column("plan_name", sa.String(200), nullable=True),
        sa.Column("relationship_to_subscriber", sa.String(20), nullable=False, server_default="self"),
        sa.Column("subscriber_name", sa.String(200), nullable=True),
        sa.Column("subscriber_dob", sa.Date, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.CheckConstraint("priority IN ('primary', 'secondary')", name="ck_insurance_priority"),
        sa.UniqueConstraint("patient_id", "priority", name="uq_patient_insurance_priority"),
    )
    op.create_index("ix_patient_insurance_patient_id", "patient_insurance", ["patient_id"])

    # Extend superbills
    op.add_column("superbills", sa.Column("billed_payer_id", UUID(as_uuid=True), sa.ForeignKey("insurance_payers.id", ondelete="SET NULL"), nullable=True))
    op.add_column("superbills", sa.Column("is_self_pay", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("superbills", sa.Column("last_pdf_generated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("superbills", sa.Column("pdf_generation_count", sa.Integer, nullable=False, server_default="0"))

    # Extend superbill_line_items
    op.add_column("superbill_line_items", sa.Column("is_fee_overridden", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("superbill_line_items", sa.Column("fee_source", sa.String(20), nullable=False, server_default="base_rate"))

    # NOTE: audit_action is stored as VARCHAR (native_enum=False), not a PG enum type.
    # New AuditAction values are defined in clinical.py — no ALTER TYPE needed.


def downgrade() -> None:
    op.drop_column("superbill_line_items", "fee_source")
    op.drop_column("superbill_line_items", "is_fee_overridden")
    op.drop_column("superbills", "pdf_generation_count")
    op.drop_column("superbills", "last_pdf_generated_at")
    op.drop_column("superbills", "is_self_pay")
    op.drop_column("superbills", "billed_payer_id")
    op.drop_table("patient_insurance")
    op.drop_table("fee_schedule_items")
    op.drop_table("insurance_payers")
