"""
db/models/tenant/clinical.py

SQLAlchemy ORM models for the clinical data plane.

All tables live in the public schema with a tenant_id column for isolation.
Tenant isolation is enforced at the Python level — every query MUST include
.where(Model.tenant_id == ctx.tenant_id).  RLS policies are defense-in-depth.
"""

import enum
import secrets
import uuid
import datetime as _dt_mod
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as _Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)


def Enum(enum_class, **kw):
    """Wrapper that forces SQLAlchemy to use enum .value (lowercase) instead of .name (uppercase).
    Uses native_enum=False to store as VARCHAR, avoiding missing PostgreSQL enum type errors."""
    kw.setdefault("native_enum", False)
    return _Enum(enum_class, values_callable=lambda e: [x.value for x in e], **kw)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import TenantBase
from backend.db.mixins import SoftDeleteMixin, TimestampMixin


# ---------------------------------------------------------------------------
# Enums  (these will be created inside each tenant schema)
# ---------------------------------------------------------------------------


class StaffRole(str, enum.Enum):
    """RBAC roles within a single clinic."""

    DOCTOR = "doctor"               # OD / MD — full clinical access
    TECHNICIAN = "technician"       # Pre-testing, vitals, scribing
    RECEPTIONIST = "receptionist"   # Scheduling, demographics only
    ADMIN = "admin"                 # Billing, reporting, user management
    OWNER = "owner"                 # All permissions + subscription management


class Sex(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"


class AppointmentStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    ARRIVED = "arrived"       # Patient checked in at front desk
    IN_PRETEST = "in_pretest" # Technician working
    IN_EXAM = "in_exam"       # Doctor in the room
    COMPLETED = "completed"
    FINALIZED = "finalized"     # Note signed off by provider
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class AppointmentType(str, enum.Enum):
    COMPREHENSIVE_EXAM = "comprehensive_exam"
    CONTACT_LENS_EXAM = "contact_lens_exam"
    FOLLOW_UP = "follow_up"
    URGENT_CARE = "urgent_care"
    PEDIATRIC_EXAM = "pediatric_exam"


class EyeAffected(str, enum.Enum):
    """Standard optometric abbreviations."""

    OD = "OD"   # Oculus Dexter  — Right eye
    OS = "OS"   # Oculus Sinister — Left eye
    OU = "OU"   # Oculus Uterque  — Both eyes


class RefractionType(str, enum.Enum):
    """
    The different prescription measurements captured during one visit.
    Multiple refractions of different types can exist per encounter.
    """

    HABITUAL = "habitual"   # Reading from the patient's current glasses (lensometry)
    AUTO = "auto"           # Autorefractor machine output (starting point)
    MANIFEST = "manifest"   # Doctor's subjective refraction during the exam
    CYCLOPLEGIC = "cycloplegic"  # Post-dilation measurement
    FINAL = "final"         # The prescription that is actually dispensed


class ExamSection(str, enum.Enum):
    """Section identifiers for exam findings."""

    ANTERIOR_SEGMENT = "anterior_segment"
    POSTERIOR_SEGMENT = "posterior_segment"


class BlockType(str, enum.Enum):
    """Type of blocked time slot for staff scheduling."""

    LUNCH = "lunch"
    HOLIDAY = "holiday"
    PERSONAL = "personal"
    OTHER = "other"


class AuditAction(str, enum.Enum):
    """Actions tracked in the HIPAA audit log.

    NOTE: AuditAction values are stored as strings in the ``action`` JSONB
    column of audit_log (via a PostgreSQL enum named ``audit_action_enum``).
    Adding new values here does NOT automatically update the DB enum type —
    a migration is required to ALTER TYPE ... ADD VALUE for each new member
    before deploying.  The scheduling values below were added in migration
    0002_appointments (the enum is created fresh there and includes them).
    """

    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    FINALIZE = "finalize"
    PROMOTE = "promote"
    AI_SCRIBE_GENERATED = "ai_scribe_generated"
    AI_SCRIBE_AUTOFILL = "ai_scribe_autofill"
    MANUAL_EDIT = "manual_edit"
    PHI_VIEWED = "phi_viewed"
    # Scheduling actions (added in Phase 3 — migration 0002_appointments)
    CHECK_IN = "check_in"
    REVERT_CHECK_IN = "revert_check_in"
    START_EXAM = "start_exam"
    START_EXAM_PHASE = "start_exam_phase"
    REVERT_TO_PRETEST = "revert_to_pretest"
    CANCEL_APPOINTMENT = "cancel_appointment"
    RESCHEDULE = "reschedule"
    NO_SHOW = "no_show"
    # Billing actions (added in Phase 4 — migration 0003_billing)
    CREATE_SUPERBILL = "create_superbill"
    UPDATE_SUPERBILL = "update_superbill"
    SUBMIT_SUPERBILL = "submit_superbill"
    # Optical actions (added in Phase 6 — optical handoff)
    VIEW_OPTICAL_QUEUE = "view_optical_queue"
    UPDATE_OPTICAL_STATUS = "update_optical_status"
    GENERATE_RX_PDF = "generate_rx_pdf"
    # Intake actions (added in Phase 7 — patient intake)
    GENERATE_INTAKE_TOKEN = "generate_intake_token"
    INTAKE_SUBMITTED = "intake_submitted"
    # Addendum actions (added in Sprint 4.2 — encounter addenda)
    CREATE_ADDENDUM = "create_addendum"
    # Insurance / claims actions (added in Phase 9 — migration 0008_claims_basics)
    CREATE_INSURANCE = "create_insurance"
    UPDATE_INSURANCE = "update_insurance"
    DELETE_INSURANCE = "delete_insurance"
    GENERATE_PDF = "generate_pdf"
    # CRM & messaging actions (added in Phase 12 — migration 0016_crm_messaging)
    # Stored as VARCHAR(50); no ALTER TYPE needed (see 0008_claims_basics.py:78).
    MESSAGE_SENT = "message_sent"
    MESSAGE_DELIVERED = "message_delivered"
    MESSAGE_FAILED = "message_failed"
    MESSAGE_READ = "message_read"
    MESSAGE_DEFERRED = "message_deferred"  # quiet hours
    INBOUND_MESSAGE_RECEIVED = "inbound_message_received"
    OPT_OUT_RECORDED = "opt_out_recorded"
    OPT_IN_RECORDED = "opt_in_recorded"
    CONSENT_GRANTED = "consent_granted"
    CONSENT_REVOKED = "consent_revoked"
    CHANNEL_PREFERENCE_UPDATED = "channel_preference_updated"
    TEMPLATE_CREATED = "template_created"
    TEMPLATE_UPDATED = "template_updated"
    BULK_MESSAGE_BATCH_CREATED = "bulk_message_batch_created"
    RECALL_QUEUE_RUN_STARTED = "recall_queue_run_started"
    RECALL_QUEUE_RUN_COMPLETED = "recall_queue_run_completed"
    MESSAGING_ENABLED = "messaging_enabled"
    MESSAGING_DISABLED = "messaging_disabled"
    # Phase 13 — Retail Inventory & Optical Orders (migration 0017)
    # Stored as VARCHAR(50); no ALTER TYPE needed (see 0008_claims_basics.py:78).
    PRODUCT_CREATE = "product_create"
    PRODUCT_UPDATE = "product_update"
    PRODUCT_DEACTIVATE = "product_deactivate"
    STOCK_RECEIVE = "stock_receive"
    STOCK_ADJUST = "stock_adjust"
    OPTICAL_ORDER_CREATE = "optical_order_create"
    OPTICAL_ORDER_PLACE = "optical_order_place"
    OPTICAL_ORDER_CANCEL = "optical_order_cancel"
    OPTICAL_ORDER_DISPENSE = "optical_order_dispense"
    # Phase 14 — Optical Order Configuration (migration 0019)
    # Stored as VARCHAR(50); no ALTER TYPE needed.
    OPTICAL_ORDER_CONFIGURE_UPDATE = "optical_order_configure_update"
    JOB_TICKET_GENERATE = "job_ticket_generate"
    LENS_TYPE_CREATE = "lens_type_create"
    LENS_MATERIAL_CREATE = "lens_material_create"
    LENS_COATING_CREATE = "lens_coating_create"
    # Phase 15 — Point of Sale (migration 0020)
    # Stored as VARCHAR(50); no ALTER TYPE needed.
    SALE_CREATE = "sale_create"
    SALE_OPENED = "sale_opened"
    SALE_PAID = "sale_paid"
    SALE_VOIDED = "sale_voided"
    PAYMENT_RECORDED = "payment_recorded"
    PAYMENT_FAILED = "payment_failed"
    WRITE_OFF_RECORDED = "write_off_recorded"
    REFUND_ISSUED = "refund_issued"
    RECEIPT_EMAILED = "receipt_emailed"
    RECEIPT_PRINTED = "receipt_printed"
    DAILY_CLOSE_RUN = "daily_close_run"
    SALE_DISCOUNT_APPLIED = "sale_discount_applied"
    STRIPE_KEYS_UPDATED = "stripe_keys_updated"
    STRIPE_WEBHOOK_RECEIVED = "stripe_webhook_received"


# ---------------------------------------------------------------------------
# Phase 13 — Retail Inventory & Optical Orders enums
# Stored as VARCHAR with CHECK constraints in DB (per backend-python.md).
# ---------------------------------------------------------------------------


class ProductType(str, enum.Enum):
    FRAME = "frame"
    CONTACT_LENS = "contact_lens"


class OrderStatus(str, enum.Enum):
    DRAFT = "draft"
    PLACED = "placed"
    DISPENSED = "dispensed"
    CANCELLED = "cancelled"


class InventoryReason(str, enum.Enum):
    ORDER_PLACED = "order_placed"
    ORDER_CANCELLED = "order_cancelled"
    RECEIVE_STOCK = "receive_stock"
    MANUAL_ADJUST = "manual_adjust"
    # Phase 15 — Point of Sale (migration 0020 widens ck_inventory_reason).
    SALE_PLACED = "sale_placed"
    REFUND_RESTOCK = "refund_restock"


# ---------------------------------------------------------------------------
# Phase 15 — Point of Sale enums
# All stored as VARCHAR with CHECK constraints in DB (per backend-python.md).
# ---------------------------------------------------------------------------


class SaleStatus(str, enum.Enum):
    OPEN = "open"
    PAID = "paid"
    REFUNDED = "refunded"
    VOIDED = "voided"


class SaleLineItemSourceType(str, enum.Enum):
    SUPERBILL = "superbill"
    OPTICAL_ORDER = "optical_order"
    PRODUCT = "product"
    ADHOC = "adhoc"


class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    STRIPE_CARD = "stripe_card"
    EXTERNAL_CARD = "external_card"
    WRITE_OFF = "write_off"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    REFUNDED = "refunded"
    PARTIAL_REFUND = "partial_refund"


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------


class Staff(TimestampMixin, TenantBase):
    """Maps a GlobalUser to their role inside a clinic."""

    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, unique=True, index=True
    )
    role: Mapped[StaffRole] = mapped_column(
        Enum(StaffRole, name="staff_role"), nullable=False
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    license_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    npi_number: Mapped[str | None] = mapped_column(String(10), nullable=True)  # National Provider ID
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # --- Relationships ---
    appointments: Mapped[list["Appointment"]] = relationship(
        "Appointment", back_populates="provider", foreign_keys="Appointment.provider_id"
    )
    encounters: Mapped[list["Encounter"]] = relationship(
        "Encounter", back_populates="provider", foreign_keys="Encounter.provider_id"
    )
    weekly_schedules: Mapped[list["StaffWeeklySchedule"]] = relationship(
        "StaffWeeklySchedule", cascade="all, delete-orphan", lazy="selectin"
    )
    blocked_times: Mapped[list["StaffBlockedTime"]] = relationship(
        "StaffBlockedTime", cascade="all, delete-orphan", lazy="selectin"
    )
    attendance: Mapped[list["StaffAttendance"]] = relationship(
        "StaffAttendance", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


# ---------------------------------------------------------------------------
# Patient
# ---------------------------------------------------------------------------


class Patient(TimestampMixin, SoftDeleteMixin, TenantBase):
    """Core demographics for a clinic's patient."""

    __tablename__ = "patients"
    __table_args__ = (
        Index("ix_patients_last_name_first_name", "last_name", "first_name"),
        Index("ix_patients_dob", "dob"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    preferred_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    dob: Mapped[str] = mapped_column(Date, nullable=False)  # type: ignore[assignment]
    sex: Mapped[Sex] = mapped_column(Enum(Sex, name="sex", create_type=False), nullable=False)

    # Encrypted at the infrastructure level (RDS encryption / pgcrypto).
    # Do NOT log or expose these fields in API responses unless explicitly needed.
    chart_number: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)

    ssn_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)

    contact_info_jsonb: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="'{}'::jsonb"
    )
    medical_history_jsonb: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="'{}'::jsonb"
    )

    # HIPAA: note any special privacy flags (e.g., restricted record access)
    privacy_flags_jsonb: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="'{}'::jsonb"
    )

    # AI Prep Me cache (generated once per day, avoids repeated LLM calls)
    prep_me_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    prep_me_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- Relationships ---
    appointments: Mapped[list["Appointment"]] = relationship(
        "Appointment", back_populates="patient", cascade="all, delete-orphan"
    )
    encounters: Mapped[list["Encounter"]] = relationship(
        "Encounter", back_populates="patient", cascade="all, delete-orphan"
    )
    # Phase 15 — Point of Sale. ``lazy="dynamic"`` so the patient detail page can
    # paginate sales without eager-loading the whole history. Sale deletes
    # cascade only at the DB level (SET NULL) — never delete patient sales rows
    # through the ORM (POS-09 audit immutability).
    sales: Mapped[list["Sale"]] = relationship(
        "Sale", back_populates="patient", lazy="dynamic"
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    def __repr__(self) -> str:
        return f"<Patient {self.full_name!r} dob={self.dob}>"


# ---------------------------------------------------------------------------
# Appointment
# ---------------------------------------------------------------------------


class Appointment(TimestampMixin, TenantBase):
    """A scheduled slot connecting a patient to a provider."""

    __tablename__ = "appointments"
    __table_args__ = (
        Index("ix_appointments_provider_start", "provider_id", "start_time"),
        Index("ix_appointments_start_time", "start_time"),
        CheckConstraint("end_time > start_time", name="ck_appointment_times"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )

    # --- FKs ---
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # The staff member who booked the appointment (for audit purposes)
    booked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )

    appointment_type: Mapped[AppointmentType] = mapped_column(
        Enum(AppointmentType, name="appointment_type_enum"), nullable=False
    )
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, name="appointment_status_enum"),
        nullable=False,
        default=AppointmentStatus.SCHEDULED,
    )

    start_time: Mapped[DateTime] = mapped_column(  # type: ignore[assignment]
        DateTime(timezone=True), nullable=False
    )
    end_time: Mapped[DateTime] = mapped_column(  # type: ignore[assignment]
        DateTime(timezone=True), nullable=False
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    # Pre-exam intake notes from the patient (captured via patient portal or front desk)
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Reminder tracking
    reminder_sent_at: Mapped[DateTime | None] = mapped_column(  # type: ignore[assignment]
        DateTime(timezone=True), nullable=True
    )

    # Phase 12 CRM reminder cadence (alembic 0016) — tracked per-appointment to keep
    # the 5-min scheduler tick idempotent. patient_confirmed_at = patient replied YES
    # to a reminder; reminders_sent_count is the touch index (0=none, 1=after 7d, etc).
    patient_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reminder_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_reminder_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reminders_sent_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )

    # Intake (Phase 7) — null = no intake sent, "pending" = link sent, "submitted" = form received
    intake_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # AI triage results: {urgency: "routine"|"moderate"|"urgent", flags: str[], reasoning: str}
    triage_flags_jsonb: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Wait time tracking — set automatically when status transitions to ARRIVED
    checked_in_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    # --- Relationships ---
    patient: Mapped["Patient"] = relationship("Patient", back_populates="appointments")
    provider: Mapped["Staff"] = relationship(
        "Staff", back_populates="appointments", foreign_keys=[provider_id]
    )
    booked_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[booked_by_id]
    )
    encounter: Mapped["Encounter | None"] = relationship(
        "Encounter", back_populates="appointment", uselist=False
    )
    intake_token: Mapped["IntakeToken | None"] = relationship(  # noqa: F821
        "IntakeToken", back_populates="appointment", uselist=False
    )

    def __repr__(self) -> str:
        return (
            f"<Appointment patient_id={self.patient_id} "
            f"start={self.start_time} status={self.status}>"
        )


# ---------------------------------------------------------------------------
# Encounter  (the master visit record)
# ---------------------------------------------------------------------------


class Encounter(TimestampMixin, SoftDeleteMixin, TenantBase):
    """The master record for a single patient visit."""

    __tablename__ = "encounters"
    __table_args__ = (
        Index("ix_encounters_patient_date", "patient_id", "encounter_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    short_id: Mapped[str] = mapped_column(
        String(12), nullable=False, unique=True, default=lambda: secrets.token_urlsafe(6)
    )

    # --- FKs ---
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="RESTRICT"),
        nullable=False,
    )
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("appointments.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,  # One encounter per appointment
    )

    encounter_date: Mapped[Date] = mapped_column(Date, nullable=False)  # type: ignore[assignment]
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Doctor's overall plan / recommendations for the visit
    assessment_and_plan: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Populated by the async AI Scribe worker (premium feature)
    ai_summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary_generated_at: Mapped[DateTime | None] = mapped_column(  # type: ignore[assignment]
        DateTime(timezone=True), nullable=True
    )

    # Once finalized, the record is locked
    is_finalized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    finalized_at: Mapped[DateTime | None] = mapped_column(  # type: ignore[assignment]
        DateTime(timezone=True), nullable=True
    )

    # Electronic signature — who signed the chart
    signed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="RESTRICT"),
        nullable=True,
    )
    signed_at: Mapped[DateTime | None] = mapped_column(  # type: ignore[assignment]
        DateTime(timezone=True), nullable=True
    )

    # Optical workflow status (set after finalization, tracked in optical queue)
    optical_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default=None
    )

    # --- Relationships ---
    patient: Mapped["Patient"] = relationship("Patient", back_populates="encounters")
    provider: Mapped["Staff"] = relationship(
        "Staff", back_populates="encounters", foreign_keys=[provider_id]
    )
    signed_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[signed_by_id]
    )
    appointment: Mapped["Appointment | None"] = relationship(
        "Appointment", back_populates="encounter"
    )
    vitals: Mapped["VitalsAndPretest | None"] = relationship(
        "VitalsAndPretest", back_populates="encounter", uselist=False,
        cascade="all, delete-orphan"
    )
    refractions: Mapped[list["Refraction"]] = relationship(
        "Refraction", back_populates="encounter", cascade="all, delete-orphan",
        order_by="Refraction.created_at"
    )
    exam_findings: Mapped[list["ExamFindings"]] = relationship(
        "ExamFindings", back_populates="encounter", cascade="all, delete-orphan"
    )
    diagnoses: Mapped[list["Diagnosis"]] = relationship(
        "Diagnosis", back_populates="encounter", cascade="all, delete-orphan"
    )
    addenda: Mapped[list["EncounterAddendum"]] = relationship(
        "EncounterAddendum", back_populates="encounter",
        cascade="all, delete-orphan", order_by="EncounterAddendum.created_at"
    )
    # Phase 13 — Retail Inventory & Optical Orders (migration 0017).
    # Optical-queue rollup (INV-16) reads OpticalOrder.status to compute
    # encounter optical status; nullable encounter_id supports walk-in orders.
    optical_orders: Mapped[list["OpticalOrder"]] = relationship(
        "OpticalOrder", back_populates="encounter",
        order_by="OpticalOrder.created_at",
    )

    def __repr__(self) -> str:
        return (
            f"<Encounter patient_id={self.patient_id} "
            f"date={self.encounter_date} finalized={self.is_finalized}>"
        )


# ---------------------------------------------------------------------------
# EncounterAddendum — post-finalization timestamped amendments
# ---------------------------------------------------------------------------


class EncounterAddendum(TimestampMixin, TenantBase):
    """Immutable post-finalization note appended to a locked encounter.

    Once created, addenda cannot be edited or deleted — they serve as
    a legally compliant audit trail of amendments to the clinical record.
    """

    __tablename__ = "encounter_addenda"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encounters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="RESTRICT"),
        nullable=False,
    )

    # --- Relationships ---
    encounter: Mapped["Encounter"] = relationship(
        "Encounter", back_populates="addenda"
    )
    created_by: Mapped["Staff"] = relationship("Staff")


# ---------------------------------------------------------------------------
# VitalsAndPretest
# ---------------------------------------------------------------------------


class VitalsAndPretest(TimestampMixin, TenantBase):
    """Technician-recorded measurements taken before the doctor enters."""

    __tablename__ = "vitals_and_pretest"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encounters.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # One vitals record per encounter
        index=True,
    )

    # Intraocular Pressure (mmHg)
    iop_od: Mapped[Decimal | None] = mapped_column(Numeric(5, 1), nullable=True)
    iop_os: Mapped[Decimal | None] = mapped_column(Numeric(5, 1), nullable=True)
    iop_time: Mapped[DateTime | None] = mapped_column(  # type: ignore[assignment]
        DateTime(timezone=True), nullable=True
    )
    # Tonometry method (e.g., "Goldmann", "iCare", "Air Puff")
    iop_method: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Uncorrected Visual Acuity (without glasses)
    ucva_od: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ucva_os: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Best Corrected Visual Acuity (with current glasses)
    bcva_od: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bcva_os: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Near Visual Acuity
    near_va_od: Mapped[str | None] = mapped_column(String(20), nullable=True)
    near_va_os: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Systemic vitals
    blood_pressure: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pulse: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Pupil assessment
    pupils_equal_round_reactive: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )
    relative_afferent_pupillary_defect: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True  # RAPD — sign of optic nerve disease
    )

    # Cover test (alignment)
    cover_test_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Notes the tech wants the doctor to see
    technician_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Preliminary test fields (Phase 10)
    confrontation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    motility: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color_vision: Mapped[str | None] = mapped_column(String(100), nullable=True)
    npc: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pupils_od_mm: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    pupils_os_mm: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    autorefractor: Mapped[str | None] = mapped_column(Text, nullable=True)
    keratometer: Mapped[str | None] = mapped_column(Text, nullable=True)
    entrance_rx: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who took the measurements
    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Relationships ---
    encounter: Mapped["Encounter"] = relationship(
        "Encounter", back_populates="vitals"
    )
    recorded_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[recorded_by_id]
    )

    def __repr__(self) -> str:
        return (
            f"<VitalsAndPretest encounter_id={self.encounter_id} "
            f"iop_od={self.iop_od} iop_os={self.iop_os}>"
        )


# ---------------------------------------------------------------------------
# Refraction
# ---------------------------------------------------------------------------


class Refraction(TimestampMixin, TenantBase):
    """A single prescription measurement within an encounter."""

    __tablename__ = "refractions"
    __table_args__ = (
        CheckConstraint("od_axis BETWEEN 1 AND 180", name="ck_od_axis_range"),
        CheckConstraint("os_axis BETWEEN 1 AND 180", name="ck_os_axis_range"),
        CheckConstraint(
            "od_sphere BETWEEN -25.00 AND 25.00", name="ck_od_sphere_range"
        ),
        CheckConstraint(
            "os_sphere BETWEEN -25.00 AND 25.00", name="ck_os_sphere_range"
        ),
        Index("ix_refractions_encounter_type", "encounter_id", "refraction_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encounters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    refraction_type: Mapped[RefractionType] = mapped_column(
        Enum(RefractionType, name="refraction_type_enum"), nullable=False
    )

    # ---- Right Eye (OD) ----
    od_sphere: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    od_cylinder: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    od_axis: Mapped[int | None] = mapped_column(Integer, nullable=True)
    od_add: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    od_prism: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    od_prism_base: Mapped[str | None] = mapped_column(String(10), nullable=True)
    od_visual_acuity: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ---- Left Eye (OS) ----
    os_sphere: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    os_cylinder: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    os_axis: Mapped[int | None] = mapped_column(Integer, nullable=True)
    os_add: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    os_prism: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    os_prism_base: Mapped[str | None] = mapped_column(String(10), nullable=True)
    os_visual_acuity: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ---- Binocular ----
    # Pupillary Distance — needed to physically fabricate the glasses
    pd_distance: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    pd_near: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    # Monocular PD split (right / left)
    pd_od: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    pd_os: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)

    # Additional clinical context
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_final_rx: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # glasses | contact_lens — validated at Pydantic/TS level
    rx_modality: Mapped[str] = mapped_column(
        String(50), nullable=False, default="glasses", server_default="glasses"
    )

    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Relationships ---
    encounter: Mapped["Encounter"] = relationship(
        "Encounter", back_populates="refractions"
    )
    recorded_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[recorded_by_id]
    )

    def __repr__(self) -> str:
        return (
            f"<Refraction encounter_id={self.encounter_id} "
            f"type={self.refraction_type} "
            f"OD: {self.od_sphere}/{self.od_cylinder}x{self.od_axis}>"
        )


# ---------------------------------------------------------------------------
# ExamFindings  (the JSONB trick)
# ---------------------------------------------------------------------------


class ExamFindings(TimestampMixin, TenantBase):
    """Per-eye JSONB exam findings (anterior / posterior segment)."""

    __tablename__ = "exam_findings"
    __table_args__ = (
        UniqueConstraint(
            "encounter_id", "exam_section", name="uq_exam_findings_encounter_section"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encounters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    exam_section: Mapped[str] = mapped_column(String(50), nullable=False)
    is_normal_wnl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Per-eye structured JSONB payloads
    findings_od: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    findings_os: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    ai_raw_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Relationships ---
    encounter: Mapped["Encounter"] = relationship(
        "Encounter", back_populates="exam_findings"
    )
    patient: Mapped["Patient"] = relationship("Patient")
    recorded_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[recorded_by_id]
    )

    def __repr__(self) -> str:
        return (
            f"<ExamFindings encounter_id={self.encounter_id} "
            f"section={self.exam_section} wnl={self.is_normal_wnl}>"
        )


# ---------------------------------------------------------------------------
# Diagnosis
# ---------------------------------------------------------------------------


class Diagnosis(TimestampMixin, SoftDeleteMixin, TenantBase):
    """An ICD-10 diagnostic code attached to an encounter."""

    __tablename__ = "diagnoses"
    __table_args__ = (
        Index("ix_diagnoses_encounter_icd10", "encounter_id", "icd10_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encounters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    icd10_code: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)

    eye_affected: Mapped[EyeAffected | None] = mapped_column(
        Enum(EyeAffected, name="eye_affected_enum"), nullable=True
    )

    # Clinical severity / acuity (optional; useful for referral letters)
    severity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # "active", "resolved", "chronic", "suspect"
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional link to PatientProblem (for syncing master problem list on encounter finalization)
    problem_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patient_problems.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Relationships ---
    encounter: Mapped["Encounter"] = relationship(
        "Encounter", back_populates="diagnoses"
    )
    recorded_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[recorded_by_id]
    )

    def __repr__(self) -> str:
        return (
            f"<Diagnosis {self.icd10_code!r} {self.description!r} "
            f"eye={self.eye_affected}>"
        )


# ---------------------------------------------------------------------------
# Patient Problem (Master Problem List)
# ---------------------------------------------------------------------------


class PatientProblem(TimestampMixin, SoftDeleteMixin, TenantBase):
    """A chronic/recurring condition on a patient's master problem list."""

    __tablename__ = "patient_problems"
    # Partial index on (patient_id, status) WHERE NOT is_deleted
    # is created via DB migration — no need to declare here.

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    icd10_code: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)

    eye_affected: Mapped[EyeAffected | None] = mapped_column(
        Enum(EyeAffected, name="eye_affected"), nullable=True
    )

    severity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # "active", "inactive", "resolved"
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    onset_date: Mapped[Date | None] = mapped_column(Date, nullable=True)  # type: ignore[assignment]
    resolved_date: Mapped[Date | None] = mapped_column(Date, nullable=True)  # type: ignore[assignment]

    source_encounter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encounters.id", ondelete="SET NULL"),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Relationships ---
    patient: Mapped["Patient"] = relationship("Patient")
    source_encounter: Mapped["Encounter | None"] = relationship("Encounter")

    def __repr__(self) -> str:
        return (
            f"<PatientProblem {self.icd10_code!r} status={self.status} "
            f"patient_id={self.patient_id}>"
        )


# ---------------------------------------------------------------------------
# Audit Log (HIPAA 164.312(b) — immutable ePHI access log)
# ---------------------------------------------------------------------------


class AuditLog(TenantBase):
    """Append-only audit log for all clinical data access and mutations.

    Records are never updated or deleted.  No SoftDeleteMixin, no updated_at.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_resource", "tenant_id", "resource_type", "resource_id"),
        Index("ix_audit_log_patient", "tenant_id", "patient_id", "created_at"),
        Index("ix_audit_log_user", "tenant_id", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )

    # Who
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )  # global auth UUID (ctx.user_id)
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )  # resolved internal staff ID

    # What
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # Context
    encounter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    changes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    metadata_: Mapped[dict | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # When (server-side, immutable)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog {self.action} {self.resource_type} "
            f"{self.resource_id} by user={self.user_id}>"
        )


# ---------------------------------------------------------------------------
# Billing Enums
# ---------------------------------------------------------------------------


class ClaimStatus(str, enum.Enum):
    """Status of a superbill/claim."""

    DRAFT = "draft"
    READY_TO_BILL = "ready_to_bill"
    SUBMITTED = "submitted"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class MdmLevel(str, enum.Enum):
    """Medical Decision Making complexity levels for E&M coding."""

    STRAIGHTFORWARD = "straightforward"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


# ---------------------------------------------------------------------------
# Superbill  (billing record for an encounter)
# ---------------------------------------------------------------------------


class Superbill(TimestampMixin, TenantBase):
    """Billing superbill linked to a finalized encounter."""

    __tablename__ = "superbills"
    __table_args__ = (
        Index("ix_superbills_encounter", "encounter_id"),
        Index("ix_superbills_status", "tenant_id", "claim_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encounters.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # One superbill per encounter
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="RESTRICT"),
        nullable=False,
    )

    claim_status: Mapped[ClaimStatus] = mapped_column(
        Enum(ClaimStatus, name="claim_status_enum"),
        nullable=False,
        default=ClaimStatus.DRAFT,
    )

    # AI-calculated MDM complexity
    mdm_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    mdm_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_em_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Total fee for the superbill
    total_fee: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who created / last modified the superbill
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Phase 9 — Insurance / claims extensions
    billed_payer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insurance_payers.id", ondelete="SET NULL"), nullable=True
    )
    is_self_pay: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_pdf_generated_at: Mapped[DateTime | None] = mapped_column(  # type: ignore[assignment]
        DateTime(timezone=True), nullable=True
    )
    pdf_generation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # --- Relationships ---
    encounter: Mapped["Encounter"] = relationship("Encounter")
    patient: Mapped["Patient"] = relationship("Patient")
    provider: Mapped["Staff"] = relationship("Staff", foreign_keys=[provider_id])
    created_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[created_by_id]
    )
    billed_payer: Mapped["InsurancePayer | None"] = relationship(
        "InsurancePayer", foreign_keys=[billed_payer_id]
    )
    line_items: Mapped[list["SuperbillLineItem"]] = relationship(
        "SuperbillLineItem", back_populates="superbill",
        cascade="all, delete-orphan", order_by="SuperbillLineItem.created_at"
    )

    def __repr__(self) -> str:
        return (
            f"<Superbill encounter_id={self.encounter_id} "
            f"status={self.claim_status}>"
        )


# ---------------------------------------------------------------------------
# SuperbillLineItem  (individual CPT code on a superbill)
# ---------------------------------------------------------------------------


class SuperbillLineItem(TimestampMixin, SoftDeleteMixin, TenantBase):
    """A single CPT line item on a superbill with diagnosis pointers."""

    __tablename__ = "superbill_line_items"
    __table_args__ = (
        Index("ix_superbill_line_items_superbill", "superbill_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    superbill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("superbills.id", ondelete="CASCADE"),
        nullable=False,
    )

    cpt_code: Mapped[str] = mapped_column(String(10), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    fee: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    units: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Diagnosis pointers — array of ICD-10 codes that justify this CPT
    # Stored as JSONB array of strings, e.g. ["H52.13", "H40.1130"]
    diagnosis_pointers: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )

    # Modifier codes (e.g., "-25" for significant, separately identifiable E/M)
    modifiers: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )

    # Phase 9 — Fee source tracking
    is_fee_overridden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fee_source: Mapped[str] = mapped_column(String(20), nullable=False, default="base_rate")
    # fee_source values: "payer_rate" | "base_rate" | "manual"

    # --- Relationships ---
    superbill: Mapped["Superbill"] = relationship(
        "Superbill", back_populates="line_items"
    )

    def __repr__(self) -> str:
        return (
            f"<SuperbillLineItem cpt={self.cpt_code} "
            f"fee={self.fee} dx={self.diagnosis_pointers}>"
        )


# ---------------------------------------------------------------------------
# InsurancePayer  (Phase 9 — claims basics)
# ---------------------------------------------------------------------------


class InsurancePayer(TimestampMixin, TenantBase):
    """An insurance company / payer that the clinic bills."""

    __tablename__ = "insurance_payers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    payer_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_jsonb: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # metadata_jsonb: junk drawer for clearinghouse IDs, EDI fields, etc.
    # e.g. {"electronic_payer_id": "12345", "clearinghouse": "availity"}

    # --- Relationships ---
    fee_items: Mapped[list["FeeScheduleItem"]] = relationship(
        "FeeScheduleItem", back_populates="payer", cascade="all, delete-orphan",
        foreign_keys="FeeScheduleItem.payer_id",
    )

    def __repr__(self) -> str:
        return f"<InsurancePayer {self.name!r} payer_id={self.payer_id}>"


# ---------------------------------------------------------------------------
# FeeScheduleItem  (Phase 9 — claims basics)
# ---------------------------------------------------------------------------


class FeeScheduleItem(TimestampMixin, TenantBase):
    """A CPT fee entry — either base catalog (payer_id=NULL) or payer-specific override."""

    __tablename__ = "fee_schedule_items"
    __table_args__ = (
        UniqueConstraint("tenant_id", "payer_id", "cpt_code", name="uq_fee_payer_cpt"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    payer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insurance_payers.id", ondelete="CASCADE"), nullable=True
    )
    cpt_code: Mapped[str] = mapped_column(String(10), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # --- Relationships ---
    payer: Mapped["InsurancePayer | None"] = relationship(
        "InsurancePayer", back_populates="fee_items", foreign_keys=[payer_id]
    )

    def __repr__(self) -> str:
        return f"<FeeScheduleItem cpt={self.cpt_code} fee={self.fee} payer_id={self.payer_id}>"


# ---------------------------------------------------------------------------
# PatientInsurance  (Phase 9 — claims basics)
# ---------------------------------------------------------------------------


class PatientInsurance(TimestampMixin, TenantBase):
    """Links a patient to an insurance payer (primary or secondary)."""

    __tablename__ = "patient_insurance"
    __table_args__ = (
        CheckConstraint("priority IN ('primary', 'secondary')", name="ck_insurance_priority"),
        CheckConstraint(
            "eligibility_status IN ('active', 'inactive', 'pending_verification', 'expired', 'unknown')",
            name="ck_insurance_eligibility_status",
        ),
        # Partial unique enforced via DB index (uq_patient_insurance_active_priority),
        # not via ORM UniqueConstraint
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("insurance_payers.id", ondelete="RESTRICT"),
        nullable=False,
    )
    priority: Mapped[str] = mapped_column(String(10), nullable=False)  # "primary" | "secondary"
    plan_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "medical" | "vision" | "other"
    subscriber_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    group_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    plan_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    relationship_to_subscriber: Mapped[str] = mapped_column(String(20), nullable=False, default="self")
    subscriber_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    subscriber_dob: Mapped[Date | None] = mapped_column(Date, nullable=True)  # type: ignore[assignment]

    # --- Phase 10.1: Insurance Revamp ---
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    copay_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    eligibility_status: Mapped[str] = mapped_column(String(30), nullable=False, default="unknown")
    eligibility_verified_date: Mapped[Date | None] = mapped_column(Date, nullable=True)  # type: ignore[assignment]
    auth_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    auth_expiry: Mapped[Date | None] = mapped_column(Date, nullable=True)  # type: ignore[assignment]
    auth_services: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Relationships ---
    payer: Mapped["InsurancePayer"] = relationship("InsurancePayer", foreign_keys=[payer_id])

    def __repr__(self) -> str:
        return (
            f"<PatientInsurance patient_id={self.patient_id} "
            f"payer_id={self.payer_id} priority={self.priority}>"
        )


# ---------------------------------------------------------------------------
# Staff Scheduling  (Phase 10.4)
# ---------------------------------------------------------------------------


class StaffWeeklySchedule(TenantBase):
    """Regular weekly availability for a staff member (0=Mon .. 6=Sun)."""

    __tablename__ = "staff_weekly_schedules"
    __table_args__ = (
        UniqueConstraint("staff_id", "day_of_week", name="uq_staff_weekly_schedule_day"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    staff_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Mon .. 6=Sun
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<StaffWeeklySchedule staff_id={self.staff_id} day={self.day_of_week}>"


class StaffBlockedTime(TenantBase):
    """A date-range block on a staff member's calendar (lunch, holiday, etc.)."""

    __tablename__ = "staff_blocked_times"
    __table_args__ = (
        Index("ix_staff_blocked_times_staff_start", "staff_id", "start_datetime"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    staff_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True
    )
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    block_type: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"<StaffBlockedTime staff_id={self.staff_id} type={self.block_type}>"


class StaffAttendance(TenantBase):
    """Clock-in / clock-out records for a staff member."""

    __tablename__ = "staff_attendance"
    __table_args__ = (
        Index("ix_staff_attendance_staff_date", "staff_id", "date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    staff_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clock_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    clock_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self) -> str:
        return f"<StaffAttendance staff_id={self.staff_id} date={self.date}>"


# ---------------------------------------------------------------------------
# Phase 13 — Retail Inventory & Optical Orders
# Tables created in migration 0017_retail_inventory.
# Enum-like columns stored as VARCHAR (per backend-python.md).
# ---------------------------------------------------------------------------


class Product(TimestampMixin, SoftDeleteMixin, TenantBase):
    """Retail catalog item — frame or contact lens.

    Variants (color/size for frames, base curve/power for contacts) are each
    their own row sharing brand+model. JSONB ``attributes`` carries
    type-specific fields (frame: color/eye_size/material; contact: modality/
    base_curve/diameter/power). Soft delete via ``is_active=false`` preserves
    historical SKUs for past order references.
    """

    __tablename__ = "products"
    __table_args__ = (
        Index(
            "ix_products_tenant_type_active",
            "tenant_id", "product_type", "is_active",
        ),
        CheckConstraint(
            "product_type IN ('frame', 'contact_lens')",
            name="ck_product_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    product_type: Mapped[str] = mapped_column(String(20), nullable=False)
    brand: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    upc: Mapped[str | None] = mapped_column(String(50), nullable=True)
    attributes: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    retail_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    cost_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    stock_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reorder_threshold: Mapped[int] = mapped_column(
        Integer, nullable=False, default=3
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # --- Relationships ---
    transactions: Mapped[list["InventoryTransaction"]] = relationship(
        "InventoryTransaction", back_populates="product",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Product {self.brand} {self.model} sku={self.sku}>"


class OpticalOrder(TimestampMixin, TenantBase):
    """Patient-bound retail order — frames + contacts (Phase 13 thin primitive).

    Status lifecycle: ``draft`` -> ``placed`` -> ``dispensed``; cancellation
    permitted from ``draft`` or ``placed``. Stock decrements on ``placed``
    and restocks on ``cancelled`` (both via ``InventoryTransaction`` rows in
    the same primary TXN). Encounter linkage is optional to support walk-in
    contact-lens refills. Phase 14 will ``ADD COLUMN`` for lens config.
    """

    __tablename__ = "optical_orders"
    __table_args__ = (
        Index(
            "ix_optical_orders_tenant_patient",
            "tenant_id", "patient_id",
        ),
        CheckConstraint(
            "status IN ('draft','placed','dispensed','cancelled')",
            name="ck_optical_order_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
    )
    encounter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encounters.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft", server_default="draft"
    )
    total_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00"),
        server_default="0.00",
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="RESTRICT"),
        nullable=False,
    )
    placed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    dispensed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Phase 14 — Optical Order Configuration (migration 0019)
    vision_plan_jsonb: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="'{}'::jsonb"
    )
    fitting_jsonb: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="'{}'::jsonb"
    )
    suggestion_resolutions_jsonb: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="'{}'::jsonb"
    )
    final_refraction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("refractions.id", ondelete="SET NULL"),
        nullable=True,
    )
    habitual_refraction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("refractions.id", ondelete="SET NULL"),
        nullable=True,
    )
    job_ticket_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- Relationships ---
    line_items: Mapped[list["OpticalOrderLineItem"]] = relationship(
        "OpticalOrderLineItem", back_populates="order",
        cascade="all, delete-orphan",
        order_by="OpticalOrderLineItem.created_at",
        lazy="selectin",
    )
    encounter: Mapped["Encounter | None"] = relationship(
        "Encounter", back_populates="optical_orders"
    )
    created_by: Mapped["Staff"] = relationship(
        "Staff", foreign_keys=[created_by_id]
    )
    # Phase 14 — explicit foreign_keys per Pitfall 6 (two FKs to refractions
    # would otherwise raise AmbiguousForeignKeysError at mapper configure).
    final_refraction: Mapped["Refraction | None"] = relationship(
        "Refraction", foreign_keys=[final_refraction_id], lazy="selectin"
    )
    habitual_refraction: Mapped["Refraction | None"] = relationship(
        "Refraction", foreign_keys=[habitual_refraction_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return (
            f"<OpticalOrder patient_id={self.patient_id} "
            f"status={self.status} total={self.total_price}>"
        )


class OpticalOrderLineItem(TenantBase):
    """A single product line on an OpticalOrder.

    Locked once parent order transitions to ``placed`` — cancel-and-recreate
    is the only edit path in Phase 13. Phase 14 will ``ADD COLUMN`` for
    lens type, coatings, fitting measurements, vision plan.
    """

    __tablename__ = "optical_order_line_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("optical_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Phase 14 — per-line lens configuration (null for frame-only / contact lines).
    lens_config_jsonb: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )

    # --- Relationships ---
    order: Mapped["OpticalOrder"] = relationship(
        "OpticalOrder", back_populates="line_items"
    )
    product: Mapped["Product"] = relationship("Product")

    def __repr__(self) -> str:
        return (
            f"<OpticalOrderLineItem order_id={self.order_id} "
            f"product_id={self.product_id} qty={self.qty}>"
        )


class InventoryTransaction(TenantBase):
    """Append-only audit log for stock movements.

    ``delta`` is signed: negative on ``order_placed`` / ``manual_adjust``
    decrements; positive on ``order_cancelled`` / ``receive_stock`` /
    ``manual_adjust`` increments. Always written in the primary TXN
    alongside the ``Product.stock_qty`` mutation
    (per .claude/rules/clinical-safety.md).
    """

    __tablename__ = "inventory_transactions"
    __table_args__ = (
        Index(
            "ix_inventory_transactions_product",
            "product_id", "created_at",
        ),
        Index(
            "ix_inventory_transactions_sale",
            "tenant_id", "sale_id",
        ),
        # Phase 15 widens ck_inventory_reason with 'sale_placed' + 'refund_restock'.
        # Migration 0020 drops + recreates the CHECK; ORM mirrors the new shape.
        CheckConstraint(
            "reason IN ('order_placed','order_cancelled','receive_stock',"
            "'manual_adjust','sale_placed','refund_restock')",
            name="ck_inventory_reason",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
    )
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(30), nullable=False)
    optical_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("optical_orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Phase 15 — POS audit trail. Populated by Plan 15-04 on close_sale (when
    # a product line decrements stock) and by Plan 15-05 on refund_restock.
    sale_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="SET NULL"),
        nullable=True,
    )
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )
    po_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # --- Relationships ---
    product: Mapped["Product"] = relationship(
        "Product", back_populates="transactions"
    )

    def __repr__(self) -> str:
        return (
            f"<InventoryTransaction product_id={self.product_id} "
            f"delta={self.delta} reason={self.reason}>"
        )


# ---------------------------------------------------------------------------
# Phase 14 — Lens reference catalog (admin-managed)
#
# Three tenant-scoped, soft-deletable, display-ordered reference tables that
# drive the configurator's lens selection. Mirrors the Product shape minus the
# pricing / stock columns. Partial unique index on (tenant_id, name) WHERE
# is_active=true lives in migration 0019 (raw SQL — sqlalchemy's
# postgresql_where did not always emit the WHERE clause cleanly per
# Phase 13 0017 precedent).
# ---------------------------------------------------------------------------


class LensType(TimestampMixin, SoftDeleteMixin, TenantBase):
    """Admin-managed lens type (Single Vision, Bifocal, Progressive, Reading).

    ``requires_seg_height`` drives the configurator's required-marker on the
    seg-height field; ``requires_vertex`` does the same for the vertex
    distance field (OPT14-04 / Pitfall 7).
    """

    __tablename__ = "lens_types"
    __table_args__ = (
        Index("ix_lens_types_tenant", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    requires_seg_height: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    requires_vertex: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    def __repr__(self) -> str:
        return f"<LensType name={self.name!r} seg={self.requires_seg_height}>"


class LensMaterial(TimestampMixin, SoftDeleteMixin, TenantBase):
    """Admin-managed lens material (CR-39, polycarbonate, trivex, hi-index …).

    ``refractive_index`` + ``abbe_value`` are optical properties surfaced as
    tooltips in the configurator UI; both nullable because not every material
    has them documented (e.g. legacy entries).
    """

    __tablename__ = "lens_materials"
    __table_args__ = (
        Index("ix_lens_materials_tenant", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    refractive_index: Mapped[Decimal | None] = mapped_column(
        Numeric(3, 2), nullable=True
    )
    abbe_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    def __repr__(self) -> str:
        return f"<LensMaterial name={self.name!r} n={self.refractive_index}>"


class LensCoating(TimestampMixin, SoftDeleteMixin, TenantBase):
    """Admin-managed lens coating (AR, UV, blue light, photochromic, …).

    ``category`` segments treatments vs tints vs finishes for grouped display
    in the configurator. Nullable because legacy / uncategorised entries.
    """

    __tablename__ = "lens_coatings"
    __table_args__ = (
        Index("ix_lens_coatings_tenant", "tenant_id"),
        CheckConstraint(
            "category IN ('treatment', 'tint', 'finish') OR category IS NULL",
            name="ck_lens_coatings_category",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    def __repr__(self) -> str:
        return f"<LensCoating name={self.name!r} category={self.category}>"


# ---------------------------------------------------------------------------
# Phase 15 — Point of Sale: financial-ledger schema
#
# Eight tables hold the full sale → payment → refund → daily-close lifecycle.
# Enum-like columns stored as VARCHAR with CHECK constraints (matches Phase 13
# convention). Money columns are Numeric(10,2); arithmetic always uses Decimal
# with ROUND_HALF_EVEN in backend.services.money (Plan 15-03).
#
# Cascade rules (POS-09 audit immutability):
#   - sale → lines / payments / refunds: CASCADE on sale DELETE (sales are not
#     deleted in practice; cascade exists for test-fixture cleanup only).
#   - refund → refund_line_items / refund_payments: CASCADE.
#   - Stripe webhook events: never deleted — append-only idempotency log.
# ---------------------------------------------------------------------------


class Sale(TimestampMixin, TenantBase):
    """A point-of-sale ledger entry — the financial-and-inventory commit point.

    Lifecycle: ``open`` → ``paid`` (close_sale) → optionally ``refunded`` /
    ``voided``. Stock decrements happen at close, not at open — see Plan 15-04
    close_sale for the primary-TXN pattern. ``receipt_number`` is populated on
    close as ``R-YYYYMMDD-NNNN`` and is unique per tenant.
    """

    __tablename__ = "sales"
    __table_args__ = (
        Index("ix_sales_tenant_patient", "tenant_id", "patient_id"),
        Index("ix_sales_tenant_status_closed", "tenant_id", "status", "closed_at"),
        Index("ix_sales_tenant_opened_desc", "tenant_id", "opened_at"),
        Index(
            "uq_sales_receipt_number",
            "tenant_id", "receipt_number",
            unique=True,
            postgresql_where=text("receipt_number IS NOT NULL"),
        ),
        CheckConstraint(
            "status IN ('open','paid','refunded','voided')",
            name="ck_sale_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    patient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("patients.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open", server_default="open"
    )
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False,
        default=Decimal("0.00"), server_default="0.00",
    )
    tax: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False,
        default=Decimal("0.00"), server_default="0.00",
    )
    discount_total: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False,
        default=Decimal("0.00"), server_default="0.00",
    )
    total: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False,
        default=Decimal("0.00"), server_default="0.00",
    )
    receipt_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Reserved for future Supabase Storage cache; Phase 15 regenerates the PDF
    # on every download (Open Q 2 — receipts are cheap and avoid stale data).
    receipt_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- Relationships ---
    patient: Mapped["Patient | None"] = relationship(
        "Patient", back_populates="sales", lazy="selectin"
    )
    created_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[created_by_id], lazy="selectin"
    )
    lines: Mapped[list["SaleLineItem"]] = relationship(
        "SaleLineItem",
        back_populates="sale",
        cascade="all, delete-orphan",
        order_by="SaleLineItem.created_at",
        lazy="selectin",
    )
    payments: Mapped[list["Payment"]] = relationship(
        "Payment",
        back_populates="sale",
        cascade="all, delete-orphan",
        order_by="Payment.created_at",
        lazy="selectin",
    )
    refunds: Mapped[list["Refund"]] = relationship(
        "Refund",
        back_populates="sale",
        cascade="all, delete-orphan",
        order_by="Refund.created_at",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<Sale id={self.id} status={self.status} "
            f"total={self.total} receipt={self.receipt_number!r}>"
        )


class SaleLineItem(TimestampMixin, TenantBase):
    """A single line on a Sale.

    Lines may originate from a Superbill copay (``source_type='superbill'``),
    an OpticalOrder dispense (``source_type='optical_order'``, with
    ``optical_order_line_item_id`` populated for exact restock targeting in
    Plan 15-05), a retail Product (``source_type='product'``), or an ad-hoc
    line (``source_type='adhoc'``, no source_id required).
    """

    __tablename__ = "sale_line_items"
    __table_args__ = (
        Index("ix_sale_line_items_sale", "sale_id"),
        Index(
            "ix_sale_line_items_source",
            "tenant_id", "source_type", "source_id",
        ),
        Index(
            "ix_sale_line_items_optical_oli",
            "tenant_id", "optical_order_line_item_id",
            postgresql_where=text("optical_order_line_item_id IS NOT NULL"),
        ),
        CheckConstraint("qty > 0", name="ck_sale_line_qty_positive"),
        CheckConstraint(
            "source_type IN ('superbill','optical_order','product','adhoc')",
            name="ck_sale_line_source_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # source_id is nullable: 'adhoc' carries no upstream reference; for
    # 'optical_order' it points at OpticalOrder.id (NOT line item) for UI
    # grouping. Exact restock target is ``optical_order_line_item_id`` below.
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    # Plan 15-05 reads this FK directly to find the OpticalOrderLineItem
    # (and therefore the product_id to restock) — no fragile line_total
    # matching. Populated by Plan 15-03 prefill_from_optical_order.
    optical_order_line_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("optical_order_line_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    qty: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False,
        default=Decimal("0.00"), server_default="0.00",
    )
    discount_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    taxable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # line_total = qty * unit_price - discount_amount, computed app-side
    # (backend.services.money) and stored for daily-close aggregation.
    line_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # --- Relationships ---
    sale: Mapped["Sale"] = relationship("Sale", back_populates="lines")
    optical_order_line_item: Mapped["OpticalOrderLineItem | None"] = relationship(
        "OpticalOrderLineItem", lazy="selectin"
    )

    def __repr__(self) -> str:
        return (
            f"<SaleLineItem sale_id={self.sale_id} "
            f"source={self.source_type} total={self.line_total}>"
        )


class Payment(TimestampMixin, TenantBase):
    """A payment recorded against a Sale.

    Cash/external_card/write_off are recorded inline; stripe_card requires a
    PaymentIntent + confirm round-trip (Plan 15-04). ``status`` advances from
    ``pending`` to ``succeeded`` on confirmation. ``reason_note`` is mandatory
    for write_off — enforced application-side (not by CHECK) because the
    requirement is contextual to method.
    """

    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_sale", "sale_id"),
        Index(
            "uq_payments_processor_payment_id",
            "tenant_id", "processor_payment_id",
            unique=True,
            postgresql_where=text("processor_payment_id IS NOT NULL"),
        ),
        Index(
            "ix_payments_tenant_status_created",
            "tenant_id", "status", "created_at",
        ),
        CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
        CheckConstraint(
            "method IN ('cash','stripe_card','external_card','write_off')",
            name="ck_payment_method",
        ),
        CheckConstraint(
            "status IN ('pending','succeeded','failed','refunded','partial_refund')",
            name="ck_payment_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
    )
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Cash-only fields
    tendered: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    change_due: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Card fields — Stripe IDs for stripe_card, last4/brand for both stripe + external
    processor_payment_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    processor_charge_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    card_brand: Mapped[str | None] = mapped_column(String(20), nullable=True)
    auth_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    # Required for write_off (insurance contractual adjustment), optional otherwise.
    reason_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Relationships ---
    sale: Mapped["Sale"] = relationship("Sale", back_populates="payments")
    created_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[created_by_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return (
            f"<Payment sale_id={self.sale_id} "
            f"method={self.method} amount={self.amount} status={self.status}>"
        )


class Refund(TimestampMixin, TenantBase):
    """A refund issued against a closed Sale.

    Atomicity rule (Plan 15-05): the refund, its line items, payment
    allocations, processor refund call, restock InventoryTransaction rows, and
    audit log entry MUST all be in the same primary TXN. ``reason`` is required
    (POS-15) — refunds without justification are blocked at the schema level.
    """

    __tablename__ = "refunds"
    __table_args__ = (
        Index("ix_refunds_sale", "sale_id"),
        Index("ix_refunds_tenant_created", "tenant_id", "created_at"),
        CheckConstraint("total_amount > 0", name="ck_refund_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    sale_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="CASCADE"),
        nullable=False,
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    refunded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )
    processor_refund_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # --- Relationships ---
    sale: Mapped["Sale"] = relationship("Sale", back_populates="refunds")
    refunded_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[refunded_by_id], lazy="selectin"
    )
    line_items: Mapped[list["RefundLineItem"]] = relationship(
        "RefundLineItem",
        back_populates="refund",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    payment_allocations: Mapped[list["RefundPayment"]] = relationship(
        "RefundPayment",
        back_populates="refund",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<Refund sale_id={self.sale_id} "
            f"total={self.total_amount} reason={self.reason!r}>"
        )


class RefundLineItem(TenantBase):
    """Join row tying a Refund to a specific SaleLineItem with refunded qty."""

    __tablename__ = "refund_line_items"
    __table_args__ = (
        Index("ix_refund_line_items_refund", "refund_id"),
        Index("ix_refund_line_items_sale_line", "sale_line_item_id"),
        CheckConstraint("qty > 0", name="ck_refund_line_qty_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    refund_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("refunds.id", ondelete="CASCADE"),
        nullable=False,
    )
    sale_line_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sale_line_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # --- Relationships ---
    refund: Mapped["Refund"] = relationship("Refund", back_populates="line_items")
    sale_line_item: Mapped["SaleLineItem"] = relationship(
        "SaleLineItem", lazy="selectin"
    )

    def __repr__(self) -> str:
        return (
            f"<RefundLineItem refund_id={self.refund_id} "
            f"sale_line_item_id={self.sale_line_item_id} qty={self.qty}>"
        )


class RefundPayment(TenantBase):
    """Join row tying a Refund to the Payment(s) being reversed.

    For stripe_card refunds, ``processor_refund_id`` (re_xxx) is populated by
    Plan 15-05 after the Stripe refund API call. For cash/external_card the
    field stays null — the audit trail is the row itself.
    """

    __tablename__ = "refund_payments"
    __table_args__ = (
        Index("ix_refund_payments_refund", "refund_id"),
        Index("ix_refund_payments_payment", "payment_id"),
        CheckConstraint("amount > 0", name="ck_refund_payment_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    refund_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("refunds.id", ondelete="CASCADE"),
        nullable=False,
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    processor_refund_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # --- Relationships ---
    refund: Mapped["Refund"] = relationship("Refund", back_populates="payment_allocations")
    payment: Mapped["Payment"] = relationship("Payment", lazy="selectin")

    def __repr__(self) -> str:
        return (
            f"<RefundPayment refund_id={self.refund_id} "
            f"payment_id={self.payment_id} amount={self.amount}>"
        )


class DailyCloseRun(TenantBase):
    """End-of-day cash reconciliation run (POS-10).

    One row per tenant per close_date — UNIQUE constraint blocks duplicate
    closes for the same business day. ``expected_cash`` is computed from the
    day's cash payments minus cash refunds; ``counted_cash`` is the till count
    entered by the staff member running the close; ``variance`` is the signed
    difference and is what the OWNER reviews as the daily smoke-test.
    """

    __tablename__ = "daily_close_runs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "close_date", name="uq_daily_close_per_day"),
        Index("ix_daily_close_tenant_date", "tenant_id", "close_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    close_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_cash: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False,
        default=Decimal("0.00"), server_default="0.00",
    )
    counted_cash: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    variance: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    run_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="RESTRICT"),
        nullable=False,
    )
    run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # --- Relationships ---
    run_by: Mapped["Staff"] = relationship(
        "Staff", foreign_keys=[run_by_id], lazy="selectin"
    )

    def __repr__(self) -> str:
        return (
            f"<DailyCloseRun close_date={self.close_date} "
            f"variance={self.variance}>"
        )


class StripeWebhookEvent(TenantBase):
    """Idempotency log for inbound Stripe webhook events (POS-14 / Pitfall 6).

    ``event_id`` is globally unique across all Stripe accounts — the UNIQUE
    constraint is NOT scoped to tenant_id. The webhook handler in Plan 15-08
    inserts this row inside the same TXN as the payment-state update, so a
    duplicate delivery (Stripe retries on 5xx) is rejected by the constraint
    rather than double-applying the side effect.
    """

    __tablename__ = "stripe_webhook_events"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_stripe_webhook_event_id"),
        Index("ix_stripe_webhook_tenant_received", "tenant_id", "received_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    event_id: Mapped[str] = mapped_column(String(64), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payment_intent_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<StripeWebhookEvent event_id={self.event_id} "
            f"type={self.event_type}>"
        )


# ---------------------------------------------------------------------------
# Re-export ClinicalAction so Phase 15 Wave-0 tests (test_pos_enums,
# test_permissions_pos) can import it from this module alongside AuditAction.
#
# Use lazy ``__getattr__`` (PEP 562) instead of an unconditional top-level
# import: backend.core.permissions transitively pulls in backend.core.config,
# which instantiates a Settings() that requires DATABASE_URL + the Supabase
# secrets. Alembic env.py imports this module before .env is loaded, so an
# eager import would crash migration generation. The lazy form resolves
# ClinicalAction only when an attribute access actually asks for it.
# ---------------------------------------------------------------------------


def __getattr__(name: str):
    if name == "ClinicalAction":
        from backend.core.permissions import ClinicalAction as _ClinicalAction

        return _ClinicalAction
    raise AttributeError(
        f"module {__name__!r} has no attribute {name!r}"
    )
