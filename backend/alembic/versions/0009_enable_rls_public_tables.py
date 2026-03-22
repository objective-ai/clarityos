"""enable_rls_public_tables: Enable Row Level Security on all public tables exposed to PostgREST

Revision ID: 0009_enable_rls_public_tables
Revises: 0008_claims_basics
Create Date: 2026-03-21

Security: Blocks direct PostgREST/anon-key access to all public tables.
FastAPI (postgres superuser) is unaffected — superusers bypass RLS.
"""
from alembic import op

revision: str = "0009_enable_rls_public_tables"
down_revision: str = "0008_claims_basics"
branch_labels = None
depends_on = None

# Tables to protect — no policies added intentionally (RLS + no policies = deny all)
TABLES = [
    "tenants",
    "tenant_members",
    "tenant_addons",
    "subscription_plans",
    "fee_schedule_items",
    "insurance_payers",
    "patient_insurance",
    "superbills",
    "superbill_line_items",
    "encounter_addenda",
    "audit_log",
    "intake_tokens",
    "alembic_version",
]


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY;")
