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
from datetime import datetime
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
    UniqueConstraint,
    func,
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
    CANCEL_APPOINTMENT = "cancel_appointment"
    RESCHEDULE = "reschedule"
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

    # --- Relationships ---
    appointments: Mapped[list["Appointment"]] = relationship(
        "Appointment", back_populates="patient", cascade="all, delete-orphan"
    )
    encounters: Mapped[list["Encounter"]] = relationship(
        "Encounter", back_populates="patient", cascade="all, delete-orphan"
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

    # Intake (Phase 7) — null = no intake sent, "pending" = link sent, "submitted" = form received
    intake_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # AI triage results: {urgency: "routine"|"moderate"|"urgent", flags: str[], reasoning: str}
    triage_flags_jsonb: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

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
            f"<AuditLog {self.action.value} {self.resource_type} "
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

    # --- Relationships ---
    encounter: Mapped["Encounter"] = relationship("Encounter")
    patient: Mapped["Patient"] = relationship("Patient")
    provider: Mapped["Staff"] = relationship("Staff", foreign_keys=[provider_id])
    created_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[created_by_id]
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

    # --- Relationships ---
    superbill: Mapped["Superbill"] = relationship(
        "Superbill", back_populates="line_items"
    )

    def __repr__(self) -> str:
        return (
            f"<SuperbillLineItem cpt={self.cpt_code} "
            f"fee={self.fee} dx={self.diagnosis_pointers}>"
        )
