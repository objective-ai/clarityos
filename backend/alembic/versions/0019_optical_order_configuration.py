"""optical order configuration: lens reference catalog + order extensions

Phase 14 — Optical Order Configuration.

Creates the three admin-managed lens reference tables (`lens_types`,
`lens_materials`, `lens_coatings`) and extends `optical_orders` /
`optical_order_line_items` with the Phase 14 configuration columns:

- ``optical_orders.vision_plan_jsonb``        — vision plan capture (member id / group / copay)
- ``optical_orders.fitting_jsonb``            — measurements + lens-fitting metadata
- ``optical_orders.suggestion_resolutions_jsonb`` — AI Scribe suggestion accept/dismiss audit
- ``optical_orders.final_refraction_id``      — FK to refractions (the Rx being dispensed)
- ``optical_orders.habitual_refraction_id``   — FK to refractions (the prior Rx)
- ``optical_orders.job_ticket_generated_at``  — set once the lab job ticket PDF is produced
- ``optical_order_line_items.lens_config_jsonb`` — per-line lens type/material/coatings

Partial unique indexes ``uq_lens_{table}_active_name`` on (tenant_id, name)
WHERE is_active = true mirror the 0017 Product pattern: soft-deleted reference
rows preserve historical names without blocking the live catalog.

JSONB server_defaults use ``sa.text("'{}'::jsonb")`` (NOT ``server_default="{}"``)
because asyncpg double-quotes the latter into the literal string ``"{}"``,
which fails JSONB cast at insert time. See 14-RESEARCH.md §Pitfall 5.

AuditAction extension is Python-only (clinical.py); audit_log.action
is VARCHAR(50) so no ALTER TYPE is needed (see 0008_claims_basics.py:78).

Revision ID: 0019_optical_order_configuration
Revises: 0018_products_soft_delete
Create Date: 2026-05-14
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0019_optical_order_configuration"
down_revision: Union[str, None] = "0018_products_soft_delete"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _baseline_columns() -> list[sa.Column]:
    """Common columns shared by the three lens reference tables.

    Mirrors the Phase 13 Product shape: UUID PK (gen_random_uuid server-side),
    tenant_id, soft-delete flag, display ordering hint, audit timestamps.
    """
    return [
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column(
            "display_order",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
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
    ]


def upgrade() -> None:
    # ------------------------------------------------------------------
    # lens_types  —  4 admin-seeded values: Single Vision, Bifocal,
    # Progressive, Reading. requires_seg_height + requires_vertex drive
    # the configurator's required-field gating per OPT14-04.
    # ------------------------------------------------------------------
    op.create_table(
        "lens_types",
        *_baseline_columns(),
        sa.Column(
            "requires_seg_height",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "requires_vertex",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_index("ix_lens_types_tenant", "lens_types", ["tenant_id"])
    op.execute(
        "CREATE UNIQUE INDEX uq_lens_types_active_name "
        "ON lens_types (tenant_id, name) WHERE is_active = true"
    )

    # ------------------------------------------------------------------
    # lens_materials — 6 admin-seeded values (CR-39, polycarbonate, trivex,
    # hi-index 1.67/1.74/1.80). refractive_index + abbe_value are optical
    # properties surfaced as tooltips in the configurator UI.
    # ------------------------------------------------------------------
    op.create_table(
        "lens_materials",
        *_baseline_columns(),
        sa.Column("refractive_index", sa.Numeric(3, 2), nullable=True),
        sa.Column("abbe_value", sa.Integer(), nullable=True),
    )
    op.create_index("ix_lens_materials_tenant", "lens_materials", ["tenant_id"])
    op.execute(
        "CREATE UNIQUE INDEX uq_lens_materials_active_name "
        "ON lens_materials (tenant_id, name) WHERE is_active = true"
    )

    # ------------------------------------------------------------------
    # lens_coatings — 7 admin-seeded values (AR, UV, blue light, photochromic,
    # polarized, scratch-resistant, mirror). `category` segments treatments
    # vs tints vs finishes for grouped display in the configurator.
    # ------------------------------------------------------------------
    op.create_table(
        "lens_coatings",
        *_baseline_columns(),
        sa.Column("category", sa.String(20), nullable=True),
        sa.CheckConstraint(
            "category IN ('treatment', 'tint', 'finish') OR category IS NULL",
            name="ck_lens_coatings_category",
        ),
    )
    op.create_index("ix_lens_coatings_tenant", "lens_coatings", ["tenant_id"])
    op.execute(
        "CREATE UNIQUE INDEX uq_lens_coatings_active_name "
        "ON lens_coatings (tenant_id, name) WHERE is_active = true"
    )

    # ------------------------------------------------------------------
    # optical_orders — Phase 14 ADD COLUMN (6 columns)
    # JSONB server_default uses sa.text("'{}'::jsonb") per Pitfall 5.
    # ------------------------------------------------------------------
    op.add_column(
        "optical_orders",
        sa.Column(
            "vision_plan_jsonb",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "optical_orders",
        sa.Column(
            "fitting_jsonb",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "optical_orders",
        sa.Column(
            "suggestion_resolutions_jsonb",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "optical_orders",
        sa.Column(
            "final_refraction_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("refractions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "optical_orders",
        sa.Column(
            "habitual_refraction_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("refractions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "optical_orders",
        sa.Column(
            "job_ticket_generated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # ------------------------------------------------------------------
    # optical_order_line_items — Phase 14 ADD COLUMN (1 column)
    # No server_default: null means frame-only or contact-lens line per
    # 14-CONTEXT §B (lens config only applies to spectacle-lens lines).
    # ------------------------------------------------------------------
    op.add_column(
        "optical_order_line_items",
        sa.Column("lens_config_jsonb", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    # Reverse order: order extensions first, then lens reference tables.
    op.drop_column("optical_order_line_items", "lens_config_jsonb")

    op.drop_column("optical_orders", "job_ticket_generated_at")
    op.drop_column("optical_orders", "habitual_refraction_id")
    op.drop_column("optical_orders", "final_refraction_id")
    op.drop_column("optical_orders", "suggestion_resolutions_jsonb")
    op.drop_column("optical_orders", "fitting_jsonb")
    op.drop_column("optical_orders", "vision_plan_jsonb")

    op.execute("DROP INDEX IF EXISTS uq_lens_coatings_active_name")
    op.drop_index("ix_lens_coatings_tenant", table_name="lens_coatings")
    op.drop_table("lens_coatings")

    op.execute("DROP INDEX IF EXISTS uq_lens_materials_active_name")
    op.drop_index("ix_lens_materials_tenant", table_name="lens_materials")
    op.drop_table("lens_materials")

    op.execute("DROP INDEX IF EXISTS uq_lens_types_active_name")
    op.drop_index("ix_lens_types_tenant", table_name="lens_types")
    op.drop_table("lens_types")
