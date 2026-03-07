"""
db/base.py

Defines two SQLAlchemy declarative bases:
  - PublicBase  → maps to the shared 'public' schema (SaaS layer)
  - TenantBase  → maps to per-tenant schemas (e.g. clinic_1042)

We keep them separate so that Alembic can run distinct migration
environments against each schema template without cross-contamination.
"""

from sqlalchemy.orm import DeclarativeBase, declared_attr


class PublicBase(DeclarativeBase):
    """
    Base for all tables that live in the PostgreSQL 'public' schema.
    Every model subclassing this will have __table_args__ defaulting
    to schema='public', which makes migrations explicit and prevents
    accidental writes to a tenant schema.
    """

    @declared_attr.directive
    def __tablename__(cls) -> str:  # noqa: N805
        # Snake-case class name as a sensible default; models can override.
        import re
        name = re.sub(r"(?<!^)(?=[A-Z])", "_", cls.__name__).lower()
        return name

    @declared_attr.directive
    def __table_args__(cls):  # noqa: N805
        # Force every public model into the 'public' schema explicitly.
        return {"schema": "public"}


class TenantBase(DeclarativeBase):
    """
    Base for all tables that live inside a per-tenant schema.

    IMPORTANT: TenantBase models do NOT hardcode a schema name.
    The schema is resolved at runtime by the tenant-routing middleware,
    which executes `SET search_path TO <tenant_schema>` on each
    database connection before any query runs.  This is what makes
    cross-tenant data leaks structurally impossible.
    """

    @declared_attr.directive
    def __tablename__(cls) -> str:  # noqa: N805
        import re
        name = re.sub(r"(?<!^)(?=[A-Z])", "_", cls.__name__).lower()
        return name
