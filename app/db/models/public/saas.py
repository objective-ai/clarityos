"""
db/models/public/saas.py

SaaS control plane models — tenants, subscription plans, global users.
All live in the public schema.
"""

import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import PublicBase
from app.db.mixins import TimestampMixin


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
    schema_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    status: Mapped[TenantStatus] = mapped_column(
        Enum(TenantStatus, name="tenant_status", create_type=False),
        default=TenantStatus.ACTIVE,
    )
    plan_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("public.subscription_plans.id"), nullable=True
    )
    owner_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
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
