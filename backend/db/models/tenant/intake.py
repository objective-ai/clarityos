"""
db/models/tenant/intake.py

SQLAlchemy ORM model for patient intake tokens.
Intake tokens provide time-limited, anonymous access to intake forms
without requiring Supabase authentication.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import TenantBase
from backend.db.mixins import TimestampMixin


class IntakeStatus(str, enum.Enum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    EXPIRED = "expired"
    REVOKED = "revoked"


class IntakeToken(TimestampMixin, TenantBase):
    """A time-limited token granting anonymous access to a patient intake form."""

    __tablename__ = "intake_tokens"
    __table_args__ = (
        Index("ix_intake_tokens_token", "token", unique=True),
        Index("ix_intake_tokens_appointment", "appointment_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    appointment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="CASCADE"),
        nullable=False,
    )

    # 64-char hex string (secrets.token_hex(32)), URL-safe
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=IntakeStatus.PENDING.value
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # DOB verification: track failed attempts to lock after 3
    dob_attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    dob_verified: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Raw form submission stored for HIPAA audit
    intake_data_jsonb: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # AI triage results: {urgency, flags[], reasoning}
    triage_flags_jsonb: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Submitter IP for audit
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # --- Relationships ---
    appointment: Mapped["Appointment"] = relationship(  # noqa: F821
        "Appointment", back_populates="intake_token"
    )

    def __repr__(self) -> str:
        return (
            f"<IntakeToken appointment_id={self.appointment_id} "
            f"status={self.status} expires={self.expires_at}>"
        )
