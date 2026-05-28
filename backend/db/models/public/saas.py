"""
db/models/public/saas.py

SaaS control plane models — tenants, subscription plans, global users.
All live in the public schema.
"""

import enum
from datetime import datetime
from uuid import UUID, uuid4

from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as _Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)


def Enum(enum_class, **kw):
    """Wrapper that forces SQLAlchemy to use enum .value (lowercase) instead of .name (uppercase).
    Uses native_enum=False to store as VARCHAR, avoiding missing PostgreSQL enum type errors."""
    kw.setdefault("native_enum", False)
    return _Enum(enum_class, values_callable=lambda e: [x.value for x in e], **kw)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import PublicBase
from backend.db.mixins import TimestampMixin


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class PlanInterval(str, enum.Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"


class TenantStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SubscriptionPlan(TimestampMixin, PublicBase):
    __tablename__ = "subscription_plans"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    interval: Mapped[PlanInterval] = mapped_column(
        Enum(PlanInterval, name="plan_interval", create_type=False),
        default=PlanInterval.MONTHLY,
    )
    base_features_jsonb: Mapped[dict] = mapped_column(JSONB, default=list)

    tenants: Mapped[list["Tenant"]] = relationship(back_populates="plan")


class Tenant(TimestampMixin, PublicBase):
    __tablename__ = "tenants"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    schema_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    status: Mapped[TenantStatus] = mapped_column(
        Enum(TenantStatus, name="tenant_status", create_type=False),
        default=TenantStatus.ACTIVE,
    )
    plan_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("public.subscription_plans.id"), nullable=True
    )
    owner_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="America/Los_Angeles"
    )

    # Phase 15 — Point of Sale (POS-08 tax, POS-13 Stripe credentials).
    # Stripe secret + webhook secret are Fernet-encrypted in
    # backend.services.payments.crypto (Plan 15-02) before persistence;
    # the publishable key is safe in plaintext.
    sales_tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 4), nullable=False, server_default=text("0.0725")
    )
    stripe_publishable_key: Mapped[str | None] = mapped_column(
        String(128), nullable=True
    )
    stripe_secret_key_encrypted: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    stripe_webhook_secret_encrypted: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    settings_jsonb: Mapped[dict] = mapped_column(JSONB, default=dict)

    plan: Mapped[SubscriptionPlan | None] = relationship(back_populates="tenants")
    addons: Mapped[list["TenantAddon"]] = relationship(back_populates="tenant")


class TenantAddon(PublicBase):
    __tablename__ = "tenant_addons"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("public.tenants.id", ondelete="CASCADE"), nullable=False
    )
    feature_key: Mapped[str] = mapped_column(String(50), nullable=False)
    enabled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tenant: Mapped[Tenant] = relationship(back_populates="addons")


class TenantMember(TimestampMixin, PublicBase):
    __tablename__ = "tenant_members"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("public.tenants.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), default="receptionist")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------------------------------------------------------------------
# System Health (Phase 10.3-04 — uptime / status page data source)
# ---------------------------------------------------------------------------


class SystemHealthSample(PublicBase):
    """One row per health probe (on-demand or self-pinger).

    Lives in the `public` schema; SaaS-level telemetry, NOT PHI.
    Consumed by the uptime endpoint (Plan 10.3-05) and the System Status
    admin panel (Plan 10.3-06).
    """

    __tablename__ = "system_health_samples"
    __table_args__ = {"schema": "public"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    api_status: Mapped[str] = mapped_column(String(16), nullable=False)
    pg_status: Mapped[str] = mapped_column(String(16), nullable=False)
    pg_latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    auth_status: Mapped[str] = mapped_column(String(16), nullable=False)
    auth_latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    all_green: Mapped[bool] = mapped_column(Boolean, nullable=False, index=True)
