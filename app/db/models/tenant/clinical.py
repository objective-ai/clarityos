"""
db/models/tenant/clinical.py

SQLAlchemy ORM models for the TENANT schema — the clinical data plane.

These models define the schema template that is provisioned for every new
clinic that signs up.  At runtime, the `search_path` is set to the specific
clinic's schema (e.g., `clinic_a3f9b2`) so that all of these tables resolve
to the correct schema without any schema name hardcoded in the models.

Module structure:
  Staff          → maps GlobalUser → clinic role
  Patient        → demographics and medical history
  Appointment    → scheduling
  Encounter      → the master record for a single visit
  VitalsAndPretest → technician measurements pre-exam
  Refraction     → all prescription types during a visit
  ExamFindings   → slit-lamp / fundus notes stored as JSONB
  Diagnosis      → ICD-10 codes attached to an encounter

Design principles:
  - Clinically critical numeric data (prescriptions) is always strictly typed
    decimal columns — never JSONB.  This allows trend queries and graphing.
  - Flexible clinical narrative data (slit-lamp findings) uses JSONB, which
    lets the frontend render dynamic, tenant-customizable forms without a
    schema migration every time a doctor wants a new field.
  - Every table uses UUID primary keys to prevent enumeration attacks and
    to make future cross-schema references unambiguous.
  - Soft-delete is applied to patients and encounters (HIPAA audit trail).
  - All foreign keys within the tenant schema are unqualified (no schema
    prefix) because the search_path resolves them at runtime.
"""

import enum
import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import TenantBase
from app.db.mixins import SoftDeleteMixin, TimestampMixin


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


class FindingCategory(str, enum.Enum):
    """Categories for the flexible JSONB exam findings table."""

    SLIT_LAMP_ANTERIOR = "slit_lamp_anterior"   # Front-of-eye structures
    FUNDUS_POSTERIOR = "fundus_posterior"        # Retina, optic nerve, macula
    VISUAL_FIELDS = "visual_fields"             # Peripheral vision assessment
    OCT = "oct"                                 # Optical coherence tomography notes


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------


class Staff(TimestampMixin, TenantBase):
    """
    Maps a GlobalUser (who can log in) to their role inside this clinic.

    A GlobalUser with access to multiple clinics would have one Staff record
    per clinic (multi-location support is a Phase 2 feature).

    global_user_id is a logical reference — it points to public.global_users
    but cannot be a database-level FK because the tenant schema does not have
    a dependency on the public schema at the table level.  Enforcement happens
    in the application layer.
    """

    __tablename__ = "staff"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Logical reference to public.global_users.id (no DB-level FK across schemas)
    global_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, unique=True, index=True
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

    def __repr__(self) -> str:
        return f"<Staff {self.full_name!r} role={self.role}>"


# ---------------------------------------------------------------------------
# Patient
# ---------------------------------------------------------------------------


class Patient(TimestampMixin, SoftDeleteMixin, TenantBase):
    """
    Core demographics for a clinic's patient.

    contact_info_jsonb stores flexible contact data to handle patients with
    multiple phone numbers, emergency contacts, and preferred contact methods
    without creating additional tables.

    medical_history_jsonb captures the patient's past medical and ocular
    history as a structured object.  This is intentionally flexible because
    different doctors capture slightly different intake fields.

    Example contact_info_jsonb:
        {
          "phones": [{"type": "mobile", "number": "555-0101"}],
          "preferred_contact": "email",
          "emergency_contact": {"name": "Jane Doe", "phone": "555-0199"}
        }

    Example medical_history_jsonb:
        {
          "systemic_conditions": ["Type 2 Diabetes", "Hypertension"],
          "ocular_history": ["LASIK 2018 OD/OS"],
          "family_history": ["Glaucoma (father)"],
          "current_medications": ["Metformin 500mg", "Lisinopril 10mg"],
          "allergies": ["Penicillin"],
          "surgeries": []
        }
    """

    __tablename__ = "patients"
    __table_args__ = (
        Index("ix_patients_last_name_first_name", "last_name", "first_name"),
        Index("ix_patients_dob", "dob"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    preferred_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    dob: Mapped[str] = mapped_column(Date, nullable=False)  # type: ignore[assignment]
    sex: Mapped[Sex] = mapped_column(Enum(Sex, name="sex_enum"), nullable=False)

    # Encrypted at the infrastructure level (RDS encryption / pgcrypto).
    # Do NOT log or expose these fields in API responses unless explicitly needed.
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
    """
    A scheduled slot connecting a patient to a provider on a specific date/time.

    duration_minutes defaults to 30; comprehensive exams are typically 60.
    cancellation_reason is free text captured when status → CANCELLED.

    Two indexes make the schedule calendar query fast:
      - provider + start_time (the day view for a single doctor)
      - start_time alone (the daily roster across all providers)
    """

    __tablename__ = "appointments"
    __table_args__ = (
        Index("ix_appointments_provider_start", "provider_id", "start_time"),
        Index("ix_appointments_start_time", "start_time"),
        CheckConstraint("end_time > start_time", name="ck_appointment_times"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
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

    def __repr__(self) -> str:
        return (
            f"<Appointment patient_id={self.patient_id} "
            f"start={self.start_time} status={self.status}>"
        )


# ---------------------------------------------------------------------------
# Encounter  (the master visit record)
# ---------------------------------------------------------------------------


class Encounter(TimestampMixin, SoftDeleteMixin, TenantBase):
    """
    The master record for a single patient visit.

    Every clinical sub-table (vitals, refractions, findings, diagnoses)
    hangs off this record via encounter_id FK.

    ai_summary_text is populated asynchronously by the AI Scribe worker
    after the doctor finalizes the visit.  It is NULL until the job completes.

    is_finalized is set to True when the doctor signs off.  Once finalized,
    the encounter is read-only (the UI should not allow edits).
    """

    __tablename__ = "encounters"
    __table_args__ = (
        Index("ix_encounters_patient_date", "patient_id", "encounter_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
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

    # --- Relationships ---
    patient: Mapped["Patient"] = relationship("Patient", back_populates="encounters")
    provider: Mapped["Staff"] = relationship(
        "Staff", back_populates="encounters", foreign_keys=[provider_id]
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

    def __repr__(self) -> str:
        return (
            f"<Encounter patient_id={self.patient_id} "
            f"date={self.encounter_date} finalized={self.is_finalized}>"
        )


# ---------------------------------------------------------------------------
# VitalsAndPretest
# ---------------------------------------------------------------------------


class VitalsAndPretest(TimestampMixin, TenantBase):
    """
    Technician-recorded measurements taken before the doctor enters the room.

    OD = Oculus Dexter  (Right eye)
    OS = Oculus Sinister (Left eye)

    IOP (Intraocular Pressure) is measured in mmHg.  Normal range is 10–21.
    Values above 21 are clinically significant and should trigger a UI alert.

    Visual Acuity (VA) is stored as a string because values like "20/20",
    "20/400", "CF" (Count Fingers), "HM" (Hand Motion), and "NLP"
    (No Light Perception) cannot be represented as simple numerics.

    blood_pressure is stored as systolic/diastolic strings (e.g., "120/80").
    """

    __tablename__ = "vitals_and_pretest"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
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
    """
    A single prescription measurement within an encounter.

    This table is intentionally fully relational — no JSONB.  Prescription
    data must be queryable for:
      - Trend analysis (how has the patient's myopia progressed over 5 years?)
      - Comparison views in the UI (old Rx vs. new Rx side-by-side)
      - Future billing integrations (Rx data populates optical lab orders)

    Multiple Refraction rows can exist per encounter (one per type).
    The FINAL type is the prescription given to the patient.

    Optometric notation conventions:
      sphere   : Lens power in diopters.  Negative = myopia. Range: ~-20 to +20
      cylinder : Astigmatism correction.  Almost always negative. Range: ~-6 to +6
      axis     : Orientation of the cylinder. Integer 1–180 degrees.
      add      : Near addition for presbyopia / bifocals. Positive. Range: +0.75 to +3.50
      prism    : Prismatic correction for eye alignment. Stored in prism diopters.
      base     : Direction of prism (Up, Down, In, Out)
    """

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
    """
    Flexible, category-based exam findings stored as JSONB.

    Rather than 15 tables (one per anatomical structure), we use one table
    with a category discriminator and a JSONB payload.  This lets:
      1. Each clinic customize their exam template (add fields) via the UI
         without requiring a database schema migration.
      2. The doctor document the cornea, lens, retina, etc. in a single,
         accordion-style UI panel.
      3. Future AI features to read the raw JSONB and generate narrative
         clinical notes.

    One ExamFindings row per (encounter_id, category) pair — enforced by
    the unique constraint.

    Example details_jsonb for SLIT_LAMP_ANTERIOR:
        {
          "lids_lashes": {"od": "normal", "os": "normal"},
          "conjunctiva": {"od": "clear and white", "os": "mild injection"},
          "cornea": {"od": "clear", "os": "superficial punctate keratitis"},
          "anterior_chamber": {"od": "deep and quiet", "os": "deep and quiet"},
          "iris": {"od": "normal", "os": "normal"},
          "lens": {"od": "trace nuclear sclerosis", "os": "1+ nuclear sclerosis"},
          "vitreous": {"od": "clear", "os": "clear"}
        }

    Example details_jsonb for FUNDUS_POSTERIOR:
        {
          "disc": {"od": "0.35 cup-to-disc, sharp margins", "os": "0.40 cup-to-disc"},
          "macula": {"od": "flat and even reflex", "os": "flat and even reflex"},
          "vessels": {"od": "normal AV ratio", "os": "normal AV ratio"},
          "periphery": {"od": "flat, no breaks", "os": "lattice degeneration inferotemporal"},
          "media": {"od": "clear", "os": "clear"}
        }
    """

    __tablename__ = "exam_findings"
    __table_args__ = (
        UniqueConstraint(
            "encounter_id", "category", name="uq_exam_findings_encounter_category"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    encounter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("encounters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    category: Mapped[FindingCategory] = mapped_column(
        Enum(FindingCategory, name="finding_category_enum"), nullable=False
    )

    # The flexible payload.  Schema is defined by the frontend form config.
    details_jsonb: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="'{}'::jsonb"
    )

    # Which staff member entered these findings
    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Relationships ---
    encounter: Mapped["Encounter"] = relationship(
        "Encounter", back_populates="exam_findings"
    )
    recorded_by: Mapped["Staff | None"] = relationship(
        "Staff", foreign_keys=[recorded_by_id]
    )

    def __repr__(self) -> str:
        return (
            f"<ExamFindings encounter_id={self.encounter_id} "
            f"category={self.category}>"
        )


# ---------------------------------------------------------------------------
# Diagnosis
# ---------------------------------------------------------------------------


class Diagnosis(TimestampMixin, TenantBase):
    """
    An ICD-10 diagnostic code attached to an encounter.

    Multiple diagnoses can exist per encounter.  The eye_affected column
    uses the OD/OS/OU convention — critical for future billing modules
    where the claim line item must specify which eye was treated.

    icd10_code is stored as a string (e.g., "H40.1130") rather than a FK
    because ICD-10 tables are enormous and updated annually.  We validate
    format in the Pydantic schema layer, not at the DB level.
    """

    __tablename__ = "diagnoses"
    __table_args__ = (
        Index("ix_diagnoses_encounter_icd10", "encounter_id", "icd10_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
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
    # "Active", "Resolved", "Chronic", "Suspect"
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Active")

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Relationships ---
    encounter: Mapped["Encounter"] = relationship(
        "Encounter", back_populates="diagnoses"
    )

    def __repr__(self) -> str:
        return (
            f"<Diagnosis {self.icd10_code!r} {self.description!r} "
            f"eye={self.eye_affected}>"
        )
