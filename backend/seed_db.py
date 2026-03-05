#!/usr/bin/env python3
"""
seed_db.py
══════════════════════════════════════════════════════════════════════════════
Standalone database seeder for the Clarity Optometry EHR.

Creates the full schema-per-tenant database structure and populates it with
realistic mock data for development and testing.

What this script provisions
───────────────────────────
  PUBLIC SCHEMA (SaaS control plane)
    ├── 3 SubscriptionPlans  (Core, Plus, Premium)
    ├── 1 Tenant             (Sunview Eye Care  →  schema: clinic_sunview1)
    ├── 2 GlobalUsers        (Dr. Sarah Chen, Marcus Webb)
    └── 1 TenantAddon        (ai_scribe add-on for the clinic)

  TENANT SCHEMA  clinic_sunview1  (clinical data plane)
    ├── 2 Staff records      (doctor + technician)
    ├── 5 Patients           (diverse demographics and medical histories)
    └── 2 Encounters         (full visits with vitals, refractions, findings,
                              diagnoses for patients #1 and #2)

Multi-tenant schema-switching mechanism
───────────────────────────────────────
The critical architectural pattern this script demonstrates:

  Step 1 ─ CREATE SCHEMA clinic_sunview1
            PostgreSQL creates the physical schema namespace.

  Step 2 ─ SET search_path TO clinic_sunview1, public
            All subsequent unqualified table/type references on this
            connection resolve to clinic_sunview1 first, then public.
            This is IDENTICAL to what the FastAPI middleware does on every
            authenticated request.

  Step 3 ─ TenantBase.metadata.create_all(conn)
            SQLAlchemy issues CREATE TABLE statements with NO schema prefix
            (TenantBase models never hardcode a schema name).  PostgreSQL
            resolves them to clinic_sunview1 via search_path.

  Step 4 ─ Session(bind=conn)
            The ORM session is bound to the SAME connection that has
            search_path set, so every INSERT also lands in clinic_sunview1.

Run instructions
────────────────
  cd backend/
  pip install psycopg2-binary sqlalchemy python-dotenv

  # Default connects to localhost with defaults from app/core/config.py
  python seed_db.py

  # Override the database URL:
  DATABASE_URL="postgresql+psycopg2://myuser:mypass@myhost:5432/mydb" python seed_db.py

  # Wipe existing seed data and re-seed:
  RESEED=true python seed_db.py
"""

from __future__ import annotations

import os
import sys
import uuid
import datetime
import textwrap
from decimal import Decimal

# ── Path setup ─────────────────────────────────────────────────────────────
# Must be run from the backend/ directory so that `app.*` imports resolve.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

# ── SQLAlchemy ─────────────────────────────────────────────────────────────
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# ── Our models ─────────────────────────────────────────────────────────────
# Public schema (SaaS control plane)
from backend.db.base import PublicBase, TenantBase

from backend.db.models.public.saas import (
    GlobalUser,
    PlanInterval,
    SubscriptionPlan,
    Tenant,
    TenantAddon,
    TenantStatus,
)

# Tenant schema (clinical data plane) — ALL models imported so that
# TenantBase.metadata is fully populated before create_all() is called.
from backend.db.models.tenant.clinical import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
    Diagnosis,
    Encounter,
    ExamFindings,
    EyeAffected,
    FindingCategory,
    Patient,
    Refraction,
    RefractionType,
    Sex,
    Staff,
    StaffRole,
    VitalsAndPretest,
)

# Feature key constants
from backend.core.entitlements import Entitlement

# ══════════════════════════════════════════════════════════════════════════
# Configuration
# ══════════════════════════════════════════════════════════════════════════

# The app uses asyncpg; the seed script uses psycopg2 (synchronous).
# Accept either URL format and normalise.
_RAW_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:password@localhost:5432/optometry_erp",
)
DATABASE_URL = (
    _RAW_URL
    .replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    .replace("postgresql://",         "postgresql+psycopg2://")
)

# When RESEED=true, drop and recreate the tenant schema on each run.
RESEED = os.getenv("RESEED", "false").lower() in ("true", "1", "yes")

# The tenant schema name provisioned for this demo clinic.
# Production generates this as f"clinic_{uuid4().hex[:8]}" at signup time.
TENANT_SCHEMA = "clinic_sunview1"

# ══════════════════════════════════════════════════════════════════════════
# Logging helpers
# ══════════════════════════════════════════════════════════════════════════

GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg: str) -> None:
    print(f"  {GREEN}✓{RESET}  {msg}")

def step(msg: str) -> None:
    print(f"\n{BOLD}{CYAN}▶  {msg}{RESET}")

def warn(msg: str) -> None:
    print(f"  {YELLOW}⚠{RESET}  {msg}")

def header(msg: str) -> None:
    bar = "═" * 60
    print(f"\n{BOLD}{bar}")
    print(f"  {msg}")
    print(f"{bar}{RESET}")

# ══════════════════════════════════════════════════════════════════════════
# Seed data definitions
# ══════════════════════════════════════════════════════════════════════════

# Stable UUIDs so re-running the seeder doesn't create duplicate rows
# (we check for existence before inserting).
PLAN_CORE_ID    = uuid.UUID("00000000-0001-0001-0001-000000000001")
PLAN_PLUS_ID    = uuid.UUID("00000000-0001-0001-0001-000000000002")
PLAN_PREMIUM_ID = uuid.UUID("00000000-0001-0001-0001-000000000003")

TENANT_ID    = uuid.UUID("00000000-0002-0002-0002-000000000001")
USER_DOCTOR_ID = uuid.UUID("00000000-0003-0003-0003-000000000001")
USER_TECH_ID   = uuid.UUID("00000000-0003-0003-0003-000000000002")

STAFF_DOCTOR_ID = uuid.UUID("00000000-0004-0004-0004-000000000001")
STAFF_TECH_ID   = uuid.UUID("00000000-0004-0004-0004-000000000002")

PATIENT_IDS = [uuid.UUID(f"00000000-0005-0005-0005-{str(i).zfill(12)}") for i in range(1, 6)]

ENCOUNTER_1_ID = uuid.UUID("00000000-0006-0006-0006-000000000001")
ENCOUNTER_2_ID = uuid.UUID("00000000-0006-0006-0006-000000000002")

NOW = datetime.datetime.now(datetime.timezone.utc)
TODAY = datetime.date.today()

# Bcrypt hash of "SeedPassword123!" — never use in production.
# Generated with: bcrypt.hashpw(b"SeedPassword123!", bcrypt.gensalt()).decode()
PLACEHOLDER_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaLtrHn3E1KUQbBX3YBqbQc3e"

# ══════════════════════════════════════════════════════════════════════════
# Phase 1 — Public schema
# ══════════════════════════════════════════════════════════════════════════

def seed_public_schema(session: Session) -> tuple[Tenant, Staff, Staff]:
    """
    Seed the PUBLIC schema: subscription plans, tenant, global users, add-ons.

    Returns the Tenant, doctor Staff-stub, and tech Staff-stub so the caller
    can reference their IDs when building tenant-schema records.
    """

    # ── Subscription Plans ───────────────────────────────────────────────
    step("Seeding SubscriptionPlans")

    plans_data = [
        dict(
            id=PLAN_CORE_ID,
            name="core",
            display_name="Core — $99/mo",
            description="Essential scheduling, demographics, and clinical exam tools.",
            price_cents=9900,
            interval=PlanInterval.MONTHLY,
            base_features_jsonb=[
                Entitlement.SCHEDULING,
                Entitlement.PATIENT_DEMOGRAPHICS,
                Entitlement.BASIC_EXAM,
                Entitlement.ICD10_DIAGNOSES,
            ],
        ),
        dict(
            id=PLAN_PLUS_ID,
            name="plus",
            display_name="Plus — $149/mo",
            description="Everything in Core, plus billing export and multi-provider support.",
            price_cents=14900,
            interval=PlanInterval.MONTHLY,
            base_features_jsonb=[
                Entitlement.SCHEDULING,
                Entitlement.PATIENT_DEMOGRAPHICS,
                Entitlement.BASIC_EXAM,
                Entitlement.ICD10_DIAGNOSES,
                Entitlement.BILLING_EXPORT,
                Entitlement.MULTI_PROVIDER,
            ],
        ),
        dict(
            id=PLAN_PREMIUM_ID,
            name="premium",
            display_name="Premium — $249/mo",
            description="Everything in Plus, plus AI Scribe and Advanced Analytics.",
            price_cents=24900,
            interval=PlanInterval.MONTHLY,
            base_features_jsonb=[
                Entitlement.SCHEDULING,
                Entitlement.PATIENT_DEMOGRAPHICS,
                Entitlement.BASIC_EXAM,
                Entitlement.ICD10_DIAGNOSES,
                Entitlement.BILLING_EXPORT,
                Entitlement.MULTI_PROVIDER,
                Entitlement.AI_SCRIBE,
                Entitlement.ADVANCED_ANALYTICS,
            ],
        ),
    ]

    for pd in plans_data:
        existing = session.get(SubscriptionPlan, pd["id"])
        if existing:
            warn(f"Plan '{pd['name']}' already exists — skipping")
            continue
        plan = SubscriptionPlan(**pd)
        session.add(plan)
        ok(f"Created plan: {pd['display_name']}")

    session.flush()

    # ── Tenant ───────────────────────────────────────────────────────────
    step("Seeding Tenant (Clinic)")

    existing_tenant = session.get(Tenant, TENANT_ID)
    if existing_tenant:
        warn(f"Tenant '{existing_tenant.name}' already exists — skipping")
        tenant = existing_tenant
    else:
        tenant = Tenant(
            id=TENANT_ID,
            name="Sunview Eye Care",
            schema_name=TENANT_SCHEMA,
            status=TenantStatus.ACTIVE,
            plan_id=PLAN_PREMIUM_ID,
            trial_ends_at=None,
            # Stripe IDs are null in development
            stripe_customer_id=None,
            stripe_subscription_id=None,
        )
        session.add(tenant)
        ok(f"Created tenant: {tenant.name!r}  schema={tenant.schema_name!r}")

    session.flush()

    # ── GlobalUsers ──────────────────────────────────────────────────────
    step("Seeding GlobalUsers (login identities)")

    users_data = [
        dict(
            id=USER_DOCTOR_ID,
            email="dr.chen@sunvieweyecare.com",
            password_hash=PLACEHOLDER_HASH,
            is_active=True,
            is_superuser=False,
            tenant_id=TENANT_ID,
        ),
        dict(
            id=USER_TECH_ID,
            email="marcus.webb@sunvieweyecare.com",
            password_hash=PLACEHOLDER_HASH,
            is_active=True,
            is_superuser=False,
            tenant_id=TENANT_ID,
        ),
    ]

    for ud in users_data:
        existing = session.get(GlobalUser, ud["id"])
        if existing:
            warn(f"GlobalUser '{ud['email']}' already exists — skipping")
            continue
        user = GlobalUser(**ud)
        session.add(user)
        ok(f"Created GlobalUser: {ud['email']}")

    session.flush()

    # ── TenantAddon ──────────────────────────────────────────────────────
    step("Seeding TenantAddons (à la carte feature upgrades)")

    addon_id = uuid.UUID("00000000-0007-0007-0007-000000000001")
    existing_addon = session.get(TenantAddon, addon_id)
    if existing_addon:
        warn("TenantAddon ai_scribe already exists — skipping")
    else:
        addon = TenantAddon(
            id=addon_id,
            tenant_id=TENANT_ID,
            feature_key=Entitlement.AI_SCRIBE,
            is_active=True,
            expires_at=None,
        )
        session.add(addon)
        ok(f"Created TenantAddon: {Entitlement.AI_SCRIBE!r}")

    session.commit()
    ok("Public schema committed.")

    return tenant


# ══════════════════════════════════════════════════════════════════════════
# Phase 2 — Tenant schema
# ══════════════════════════════════════════════════════════════════════════

def seed_tenant_schema(session: Session) -> None:
    """
    Seed the TENANT schema (clinic_sunview1).

    IMPORTANT: This function is called AFTER the connection has already
    executed SET search_path TO clinic_sunview1, public.  Every INSERT here
    lands in the correct tenant schema without any schema prefix in the SQL.
    """

    # ── Staff ────────────────────────────────────────────────────────────
    step("Seeding Staff (clinic roles)")

    staff_data = [
        dict(
            id=STAFF_DOCTOR_ID,
            global_user_id=USER_DOCTOR_ID,  # logical ref to public.global_users
            role=StaffRole.DOCTOR,
            first_name="Sarah",
            last_name="Chen",
            license_number="OD-CA-2018-44821",
            npi_number="1234567890",
            is_active=True,
        ),
        dict(
            id=STAFF_TECH_ID,
            global_user_id=USER_TECH_ID,
            role=StaffRole.TECHNICIAN,
            first_name="Marcus",
            last_name="Webb",
            license_number=None,
            npi_number=None,
            is_active=True,
        ),
    ]

    for sd in staff_data:
        existing = session.get(Staff, sd["id"])
        if existing:
            warn(f"Staff '{sd['first_name']} {sd['last_name']}' already exists — skipping")
            continue
        staff = Staff(**sd)
        session.add(staff)
        ok(f"Created Staff: {sd['first_name']} {sd['last_name']} ({sd['role'].value})")

    session.flush()

    # ── Patients ─────────────────────────────────────────────────────────
    step("Seeding 5 Patients")

    patients_data = [
        # ── Patient 1: Classic myopia + astigmatism + systemic comorbidities
        dict(
            id=PATIENT_IDS[0],
            first_name="Robert",
            last_name="Hargrove",
            preferred_name="Bob",
            dob=datetime.date(1968, 3, 14),
            sex=Sex.MALE,
            contact_info_jsonb={
                "phones": [
                    {"type": "mobile", "number": "555-0142"},
                    {"type": "home",   "number": "555-0199"},
                ],
                "email": "robert.hargrove@email.com",
                "preferred_contact": "mobile",
                "address": {
                    "street": "412 Elmwood Drive",
                    "city": "San Diego",
                    "state": "CA",
                    "zip": "92101",
                },
                "emergency_contact": {
                    "name": "Linda Hargrove",
                    "relationship": "spouse",
                    "phone": "555-0143",
                },
            },
            medical_history_jsonb={
                "systemic_conditions": ["Type 2 Diabetes (dx 2015)", "Hypertension"],
                "ocular_history": ["Myopia since age 12"],
                "family_history": ["Glaucoma (father)", "Macular degeneration (maternal grandmother)"],
                "current_medications": [
                    "Metformin 1000mg twice daily",
                    "Lisinopril 10mg",
                    "Atorvastatin 40mg",
                ],
                "allergies": ["Penicillin (rash)"],
                "surgeries": [],
                "last_dilated_exam": "2023-03-10",
            },
            privacy_flags_jsonb={},
        ),

        # ── Patient 2: Presbyopia, contact lens wearer
        dict(
            id=PATIENT_IDS[1],
            first_name="Elena",
            last_name="Vasquez",
            preferred_name=None,
            dob=datetime.date(1973, 9, 22),
            sex=Sex.FEMALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-0287"}],
                "email": "evasquez@workmail.com",
                "preferred_contact": "email",
                "address": {
                    "street": "88 Coastline Blvd, Apt 4B",
                    "city": "San Diego",
                    "state": "CA",
                    "zip": "92109",
                },
                "emergency_contact": {
                    "name": "Carlos Vasquez",
                    "relationship": "husband",
                    "phone": "555-0288",
                },
            },
            medical_history_jsonb={
                "systemic_conditions": ["Seasonal allergies"],
                "ocular_history": ["Contact lens wearer (soft daily) since age 22", "Dry eye syndrome"],
                "family_history": ["Cataracts (mother)"],
                "current_medications": [
                    "Loratadine 10mg PRN",
                    "Systane Ultra eye drops PRN",
                ],
                "allergies": ["Thimerosal (preservative in some contact lens solutions)"],
                "surgeries": [],
                "last_dilated_exam": "2023-09-15",
            },
            privacy_flags_jsonb={},
        ),

        # ── Patient 3: Glaucoma suspect, elevated IOP
        dict(
            id=PATIENT_IDS[2],
            first_name="James",
            last_name="Thornton",
            preferred_name=None,
            dob=datetime.date(1955, 11, 3),
            sex=Sex.MALE,
            contact_info_jsonb={
                "phones": [
                    {"type": "home",   "number": "555-0312"},
                    {"type": "mobile", "number": "555-0313"},
                ],
                "email": None,
                "preferred_contact": "home",
                "address": {
                    "street": "1701 Harbor View Road",
                    "city": "Chula Vista",
                    "state": "CA",
                    "zip": "91910",
                },
                "emergency_contact": {
                    "name": "Dorothy Thornton",
                    "relationship": "wife",
                    "phone": "555-0312",
                },
            },
            medical_history_jsonb={
                "systemic_conditions": ["Hypertension", "Hypercholesterolemia"],
                "ocular_history": [
                    "Elevated IOP (borderline) — monitoring since 2020",
                    "Large optic nerve cups OD > OS",
                    "Glaucoma suspect — annual visual fields ordered",
                ],
                "family_history": ["Glaucoma (brother and father)", "Diabetes (mother)"],
                "current_medications": [
                    "Amlodipine 5mg",
                    "Rosuvastatin 20mg",
                    "Travoprost 0.004% — right eye only (trial started 2023)",
                ],
                "allergies": [],
                "surgeries": ["Appendectomy 1989"],
                "last_dilated_exam": "2024-01-08",
            },
            privacy_flags_jsonb={},
        ),

        # ── Patient 4: Pediatric-adjacent (young adult, first exam)
        dict(
            id=PATIENT_IDS[3],
            first_name="Priya",
            last_name="Patel",
            preferred_name=None,
            dob=datetime.date(2001, 6, 17),
            sex=Sex.FEMALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-0467"}],
                "email": "priya.patel.eyes@gmail.com",
                "preferred_contact": "email",
                "address": {
                    "street": "203 University Ave",
                    "city": "San Diego",
                    "state": "CA",
                    "zip": "92103",
                },
                "emergency_contact": {
                    "name": "Anita Patel",
                    "relationship": "mother",
                    "phone": "555-0468",
                },
            },
            medical_history_jsonb={
                "systemic_conditions": [],
                "ocular_history": ["First comprehensive eye exam"],
                "family_history": ["High myopia (mother, father)"],
                "current_medications": [],
                "allergies": [],
                "surgeries": [],
                "last_dilated_exam": None,
            },
            privacy_flags_jsonb={},
        ),

        # ── Patient 5: Post-LASIK, now needs reading glasses
        dict(
            id=PATIENT_IDS[4],
            first_name="William",
            last_name="Donovan",
            preferred_name="Will",
            dob=datetime.date(1962, 1, 28),
            sex=Sex.MALE,
            contact_info_jsonb={
                "phones": [
                    {"type": "mobile", "number": "555-0551"},
                    {"type": "office", "number": "555-0552"},
                ],
                "email": "wdonovan@legalgroup.com",
                "preferred_contact": "mobile",
                "address": {
                    "street": "9 Hillcrest Lane",
                    "city": "La Jolla",
                    "state": "CA",
                    "zip": "92037",
                },
                "emergency_contact": {
                    "name": "Patricia Donovan",
                    "relationship": "wife",
                    "phone": "555-0553",
                },
            },
            medical_history_jsonb={
                "systemic_conditions": ["Hypothyroidism"],
                "ocular_history": [
                    "LASIK OD + OS — 2005 (Dr. Reynolds, UCSD)",
                    "Presbyopia onset — approximately 2018",
                    "Currently using OTC +1.50 reading glasses",
                ],
                "family_history": ["Glaucoma (mother)", "Cataracts (both parents)"],
                "current_medications": ["Levothyroxine 75mcg"],
                "allergies": [],
                "surgeries": ["LASIK 2005"],
                "last_dilated_exam": "2022-06-20",
            },
            privacy_flags_jsonb={},
        ),
    ]

    for pd in patients_data:
        existing = session.get(Patient, pd["id"])
        if existing:
            warn(f"Patient '{pd['first_name']} {pd['last_name']}' already exists — skipping")
            continue
        patient = Patient(**pd)
        session.add(patient)
        ok(f"Created Patient: {pd['first_name']} {pd['last_name']} (DOB {pd['dob']})")

    session.flush()

    # ── Encounters ───────────────────────────────────────────────────────
    step("Seeding 2 Encounters (full clinical visits)")

    _seed_encounter_1(session)
    _seed_encounter_2(session)

    session.commit()
    ok("Tenant schema committed.")


# ══════════════════════════════════════════════════════════════════════════
# Encounter 1 — Robert Hargrove, myopia + astigmatism follow-up
# ══════════════════════════════════════════════════════════════════════════

def _seed_encounter_1(session: Session) -> None:
    existing = session.get(Encounter, ENCOUNTER_1_ID)
    if existing:
        warn("Encounter 1 (Robert Hargrove) already exists — skipping")
        return

    enc_date = datetime.date(2024, 11, 14)
    print()
    print(f"    ┌─ Encounter 1: Robert Hargrove — {enc_date}")

    # Master encounter record
    enc = Encounter(
        id=ENCOUNTER_1_ID,
        patient_id=PATIENT_IDS[0],        # Robert Hargrove
        provider_id=STAFF_DOCTOR_ID,      # Dr. Sarah Chen
        appointment_id=None,              # Walk-in (no appointment linked)
        encounter_date=enc_date,
        chief_complaint=(
            "Patient reports blurred vision at distance that has worsened "
            "over the past 6 months. Headaches in the evening. Current "
            "glasses 2 years old."
        ),
        assessment_and_plan=(
            "1. Myopia with astigmatism — prescription updated, see Final Rx.\n"
            "2. Diabetic patient — annual dilated fundus exam completed, "
            "no diabetic retinopathy noted at this time. Counseled on "
            "importance of blood glucose control for ocular health.\n"
            "3. Recommend follow-up in 12 months or sooner if vision changes.\n"
            "4. New glasses Rx dispensed."
        ),
        is_finalized=True,
        finalized_at=datetime.datetime(2024, 11, 14, 16, 42, 0,
                                       tzinfo=datetime.timezone.utc),
    )
    session.add(enc)
    session.flush()
    print(f"    │  ✓ Encounter record")

    # ── Vitals & Pre-test ────────────────────────────────────────────────
    vitals = VitalsAndPretest(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        # IOP: OD normal, OS borderline-elevated — doctor should note
        iop_od=Decimal("15.0"),
        iop_os=Decimal("18.0"),
        iop_time=datetime.datetime(2024, 11, 14, 9, 15, 0,
                                   tzinfo=datetime.timezone.utc),
        iop_method="iCare Rebound Tonometer",
        # Uncorrected VA — poor distance without glasses
        ucva_od="20/200",
        ucva_os="20/150",
        # Best-corrected VA with current (old) glasses
        bcva_od="20/40",
        bcva_os="20/30",
        # Near VA (with current glasses)
        near_va_od="20/25",
        near_va_os="20/20",
        blood_pressure="128/82",
        pulse=72,
        pupils_equal_round_reactive=True,
        relative_afferent_pupillary_defect=False,
        cover_test_notes="Orthophoria at distance and near. No deviation detected.",
        technician_notes=(
            "Patient reports headaches primarily in the evenings during "
            "screen time. Last HbA1c per patient report: 7.1% (3 months ago)."
        ),
        recorded_by_id=STAFF_TECH_ID,
    )
    session.add(vitals)
    print(f"    │  ✓ VitalsAndPretest (IOP OD 15.0 / OS 18.0)")

    # ── Refractions ──────────────────────────────────────────────────────
    # Habitual: what the patient's current glasses measure (lensometry)
    rx_habitual = Refraction(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        refraction_type=RefractionType.HABITUAL,
        # OD (Right Eye)
        od_sphere=Decimal("-2.00"),
        od_cylinder=Decimal("-0.75"),
        od_axis=90,
        od_add=None,
        od_visual_acuity="20/40",
        # OS (Left Eye)
        os_sphere=Decimal("-1.75"),
        os_cylinder=Decimal("-0.50"),
        os_axis=175,
        os_add=None,
        os_visual_acuity="20/30",
        pd_distance=Decimal("63.0"),
        is_final_rx=False,
        notes="Lensometry of current glasses. 2 years old.",
        recorded_by_id=STAFF_TECH_ID,
    )
    session.add(rx_habitual)

    # Autorefractor: machine-generated starting point
    rx_auto = Refraction(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        refraction_type=RefractionType.AUTO,
        od_sphere=Decimal("-2.50"),
        od_cylinder=Decimal("-1.25"),
        od_axis=88,
        od_add=None,
        od_visual_acuity=None,
        os_sphere=Decimal("-2.00"),
        os_cylinder=Decimal("-0.75"),
        os_axis=173,
        os_add=None,
        os_visual_acuity=None,
        is_final_rx=False,
        notes="Topcon KR-800 autorefractor.",
        recorded_by_id=STAFF_TECH_ID,
    )
    session.add(rx_auto)

    # Manifest: doctor's subjective finding during the exam
    rx_manifest = Refraction(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        refraction_type=RefractionType.MANIFEST,
        od_sphere=Decimal("-2.25"),
        od_cylinder=Decimal("-1.00"),
        od_axis=90,
        od_add=None,
        od_visual_acuity="20/20",
        os_sphere=Decimal("-1.75"),
        os_cylinder=Decimal("-0.50"),
        os_axis=175,
        os_add=None,
        os_visual_acuity="20/20",
        pd_distance=Decimal("63.0"),
        is_final_rx=False,
        notes="Patient preferred +0.25 more plus OD at distance. Accepted at -2.25.",
        recorded_by_id=STAFF_DOCTOR_ID,
    )
    session.add(rx_manifest)

    # Final Rx: the actual prescription dispensed to the patient
    rx_final = Refraction(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        refraction_type=RefractionType.FINAL,
        od_sphere=Decimal("-2.25"),
        od_cylinder=Decimal("-1.00"),
        od_axis=90,
        od_add=None,
        od_visual_acuity="20/20",
        os_sphere=Decimal("-1.75"),
        os_cylinder=Decimal("-0.50"),
        os_axis=175,
        os_add=None,
        os_visual_acuity="20/20",
        pd_distance=Decimal("63.0"),
        pd_near=None,
        is_final_rx=True,
        notes=(
            "Patient happy with distance correction. No reading add needed "
            "at this time — accommodating well at near."
        ),
        recorded_by_id=STAFF_DOCTOR_ID,
    )
    session.add(rx_final)
    print(f"    │  ✓ Refractions (habitual / auto / manifest / final)")

    # ── ExamFindings (JSONB) ─────────────────────────────────────────────
    # Slit-lamp anterior segment findings
    slit_lamp = ExamFindings(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        category=FindingCategory.SLIT_LAMP_ANTERIOR,
        details_jsonb={
            "lids_lashes":        {"OD": "Normal, no lesions", "OS": "Normal"},
            "conjunctiva":        {"OD": "Clear and white", "OS": "Clear and white, trace injection inferiorly"},
            "cornea":             {"OD": "Clear, no scarring, Bowman layer intact post-LASIK: N/A", "OS": "Clear"},
            "anterior_chamber":   {"OD": "Deep and quiet, no cell or flare", "OS": "Deep and quiet"},
            "iris":               {"OD": "Normal architecture, round pupil", "OS": "Normal"},
            "lens":               {
                "OD": "Trace nuclear sclerosis — clinically insignificant",
                "OS": "Trace nuclear sclerosis — clinically insignificant",
            },
            "vitreous":           {"OD": "Clear", "OS": "Clear, patient reports occasional floaters"},
            "additional_notes":   "Patient dilated with 1% Tropicamide + 2.5% Neo-Synephrine.",
        },
        recorded_by_id=STAFF_DOCTOR_ID,
    )
    session.add(slit_lamp)

    # Fundus (posterior segment) findings — important for the diabetic patient
    fundus = ExamFindings(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        category=FindingCategory.FUNDUS_POSTERIOR,
        details_jsonb={
            "disc": {
                "OD": "0.40 cup-to-disc ratio, sharp margins, no pallor, healthy rim tissue",
                "OS": "0.35 cup-to-disc ratio, sharp margins, healthy rim tissue",
            },
            "macula": {
                "OD": "Flat and even reflex, no exudates, no cotton wool spots",
                "OS": "Flat and even reflex, no drusen, no pigment changes",
            },
            "vessels": {
                "OD": "Normal A/V ratio (~2:3), no nicking, no tortuosity",
                "OS": "Normal A/V ratio, mild arterial light reflex consistent with hypertension",
            },
            "periphery": {
                "OD": "Flat, no breaks, no lattice degeneration",
                "OS": "Flat, no breaks, trace peripheral pigment clumping — benign",
            },
            "media":     {"OD": "Clear", "OS": "Clear"},
            "diabetic_screening": {
                "result":   "No diabetic retinopathy detected (ETDRS level 10)",
                "notes":    "No microaneurysms, dot hemorrhages, or exudates visible. Annual follow-up recommended.",
            },
        },
        recorded_by_id=STAFF_DOCTOR_ID,
    )
    session.add(fundus)
    print(f"    │  ✓ ExamFindings (slit-lamp anterior + fundus posterior)")

    # ── Diagnoses (ICD-10) ───────────────────────────────────────────────
    diag_myopia_od = Diagnosis(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        icd10_code="H52.11",
        description="Myopia, right eye",
        eye_affected=EyeAffected.OD,
        severity="moderate",
        status="Active",
    )
    diag_myopia_os = Diagnosis(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        icd10_code="H52.12",
        description="Myopia, left eye",
        eye_affected=EyeAffected.OS,
        severity="low-moderate",
        status="Active",
    )
    diag_astigmatism = Diagnosis(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        icd10_code="H52.20",
        description="Unspecified astigmatism",
        eye_affected=EyeAffected.OU,
        severity="mild",
        status="Active",
        notes="Minus cylinder form. Stable compared to last visit.",
    )
    diag_diabetes_screen = Diagnosis(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_1_ID,
        icd10_code="Z01.01",
        description="Encounter for examination of eyes and vision with abnormal findings — diabetic screening",
        eye_affected=None,
        severity=None,
        status="Active",
        notes="Annual dilated diabetic eye exam. No retinopathy detected. Patient counseled.",
    )

    for d in [diag_myopia_od, diag_myopia_os, diag_astigmatism, diag_diabetes_screen]:
        session.add(d)

    print(f"    │  ✓ Diagnoses (H52.11 / H52.12 / H52.20 / Z01.01)")
    print(f"    └─ Encounter 1 complete ✓")
    session.flush()


# ══════════════════════════════════════════════════════════════════════════
# Encounter 2 — Elena Vasquez, presbyopia + contact lens exam
# ══════════════════════════════════════════════════════════════════════════

def _seed_encounter_2(session: Session) -> None:
    existing = session.get(Encounter, ENCOUNTER_2_ID)
    if existing:
        warn("Encounter 2 (Elena Vasquez) already exists — skipping")
        return

    enc_date = datetime.date(2024, 11, 15)
    print()
    print(f"    ┌─ Encounter 2: Elena Vasquez — {enc_date}")

    enc = Encounter(
        id=ENCOUNTER_2_ID,
        patient_id=PATIENT_IDS[1],        # Elena Vasquez
        provider_id=STAFF_DOCTOR_ID,
        appointment_id=None,
        encounter_date=enc_date,
        chief_complaint=(
            "Patient reports difficulty reading at near even with her contacts in. "
            "Holding phone farther away than usual. Experiencing more dry eye "
            "symptoms in the afternoon. Interested in multifocal contact lenses."
        ),
        assessment_and_plan=(
            "1. Presbyopia — progressive. Updated spectacle Rx with near add +1.75 OU.\n"
            "2. Contact lens assessment: trialing multifocal daily CL "
            "(Dailies Total1 Multifocal) — high add OU. Trial lenses dispensed.\n"
            "3. Dry eye syndrome — worsening with extended screen use. Added "
            "Restasis 0.05% BID OU. Continue preservative-free artificial tears PRN.\n"
            "4. Follow-up in 2 weeks for CL trial assessment."
        ),
        is_finalized=True,
        finalized_at=datetime.datetime(2024, 11, 15, 11, 30, 0,
                                       tzinfo=datetime.timezone.utc),
    )
    session.add(enc)
    session.flush()
    print(f"    │  ✓ Encounter record")

    # ── Vitals ───────────────────────────────────────────────────────────
    vitals = VitalsAndPretest(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        iop_od=Decimal("14.0"),
        iop_os=Decimal("15.0"),
        iop_time=datetime.datetime(2024, 11, 15, 8, 50, 0,
                                   tzinfo=datetime.timezone.utc),
        iop_method="iCare Rebound Tonometer",
        ucva_od="20/30",
        ucva_os="20/40",
        bcva_od="20/20",
        bcva_os="20/20",
        near_va_od="20/50",    # Reduced near — primary complaint
        near_va_os="20/50",
        blood_pressure="118/76",
        pulse=68,
        pupils_equal_round_reactive=True,
        relative_afferent_pupillary_defect=False,
        cover_test_notes="Orthophoria at distance. Esophoria 2pd at near — within normal limits.",
        technician_notes=(
            "Patient arrived in daily disposable contacts. Removed for exam. "
            "Schirmer's test: OD 6mm / OS 5mm (5 minutes) — reduced tear production."
        ),
        recorded_by_id=STAFF_TECH_ID,
    )
    session.add(vitals)
    print(f"    │  ✓ VitalsAndPretest (IOP OD 14.0 / OS 15.0, dry eye noted)")

    # ── Refractions ──────────────────────────────────────────────────────
    rx_habitual = Refraction(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        refraction_type=RefractionType.HABITUAL,
        od_sphere=Decimal("-0.50"),
        od_cylinder=Decimal("-0.25"),
        od_axis=180,
        od_add=Decimal("1.50"),
        od_visual_acuity="20/25",
        os_sphere=Decimal("-0.75"),
        os_cylinder=Decimal("-0.25"),
        os_axis=175,
        os_add=Decimal("1.50"),
        os_visual_acuity="20/30",
        pd_distance=Decimal("61.5"),
        pd_near=Decimal("58.5"),
        is_final_rx=False,
        notes="Previous spectacle Rx from Dr. Morris, 2022.",
        recorded_by_id=STAFF_TECH_ID,
    )
    session.add(rx_habitual)

    rx_auto = Refraction(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        refraction_type=RefractionType.AUTO,
        od_sphere=Decimal("-0.75"),
        od_cylinder=Decimal("-0.50"),
        od_axis=178,
        od_add=None,
        od_visual_acuity=None,
        os_sphere=Decimal("-1.00"),
        os_cylinder=Decimal("-0.25"),
        os_axis=172,
        os_add=None,
        os_visual_acuity=None,
        is_final_rx=False,
        notes="Topcon KR-800.",
        recorded_by_id=STAFF_TECH_ID,
    )
    session.add(rx_auto)

    rx_manifest = Refraction(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        refraction_type=RefractionType.MANIFEST,
        od_sphere=Decimal("-0.50"),
        od_cylinder=Decimal("-0.25"),
        od_axis=180,
        od_add=Decimal("1.75"),
        od_visual_acuity="20/20",
        os_sphere=Decimal("-0.75"),
        os_cylinder=Decimal("-0.25"),
        os_axis=175,
        os_add=Decimal("1.75"),
        os_visual_acuity="20/20",
        pd_distance=Decimal("61.5"),
        pd_near=Decimal("58.5"),
        is_final_rx=False,
        notes=(
            "Patient achieves 20/20 OD and OS at distance. "
            "Near add +1.75 gives J1 equivalent at 16 inches. "
            "Patient comfortable with balance."
        ),
        recorded_by_id=STAFF_DOCTOR_ID,
    )
    session.add(rx_manifest)

    rx_final = Refraction(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        refraction_type=RefractionType.FINAL,
        od_sphere=Decimal("-0.50"),
        od_cylinder=Decimal("-0.25"),
        od_axis=180,
        od_add=Decimal("1.75"),
        od_visual_acuity="20/20",
        os_sphere=Decimal("-0.75"),
        os_cylinder=Decimal("-0.25"),
        os_axis=175,
        os_add=Decimal("1.75"),
        os_visual_acuity="20/20",
        pd_distance=Decimal("61.5"),
        pd_near=Decimal("58.5"),
        is_final_rx=True,
        notes=(
            "Progressive addition lens recommended. "
            "Patient advised on adaptation period (7-10 days). "
            "Contact lens trial (multifocal) also dispensed for comparison."
        ),
        recorded_by_id=STAFF_DOCTOR_ID,
    )
    session.add(rx_final)
    print(f"    │  ✓ Refractions (habitual / auto / manifest / final with Add +1.75)")

    # ── ExamFindings ─────────────────────────────────────────────────────
    slit_lamp = ExamFindings(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        category=FindingCategory.SLIT_LAMP_ANTERIOR,
        details_jsonb={
            "lids_lashes":      {"OD": "Normal, mild meibomian gland inspissation", "OS": "Normal, mild MGD"},
            "conjunctiva":      {"OD": "Mild injection, 1+ papillae on tarsal conjunctiva", "OS": "Mild injection, 1+ papillae"},
            "tear_film":        {"OD": "TBUT 4 seconds (reduced)", "OS": "TBUT 4 seconds"},
            "cornea":           {
                "OD": "Clear. Superficial punctate keratitis (SPK) inferior 1/3 — consistent with dry eye",
                "OS": "Clear. Trace SPK inferior 1/3",
            },
            "anterior_chamber": {"OD": "Deep and quiet", "OS": "Deep and quiet"},
            "iris":             {"OD": "Normal", "OS": "Normal"},
            "lens":             {"OD": "Clear — no nuclear sclerosis", "OS": "Clear"},
            "vitreous":         {"OD": "Clear", "OS": "Clear"},
            "additional_notes": (
                "Contact lens fit assessment: current Acuvue Moist daily — "
                "centration good OD, slightly inferior OS. Consider upgrade to "
                "Dailies Total1 for improved oxygen transmissibility."
            ),
        },
        recorded_by_id=STAFF_DOCTOR_ID,
    )
    session.add(slit_lamp)

    fundus = ExamFindings(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        category=FindingCategory.FUNDUS_POSTERIOR,
        details_jsonb={
            "disc":     {"OD": "0.35 CDR, sharp margins, healthy rim", "OS": "0.35 CDR, sharp margins"},
            "macula":   {"OD": "Flat and even reflex", "OS": "Flat and even reflex"},
            "vessels":  {"OD": "Normal A/V ratio", "OS": "Normal A/V ratio"},
            "periphery": {"OD": "Flat, no breaks", "OS": "Flat, no breaks, no lattice"},
            "media":    {"OD": "Clear", "OS": "Clear"},
        },
        recorded_by_id=STAFF_DOCTOR_ID,
    )
    session.add(fundus)
    print(f"    │  ✓ ExamFindings (slit-lamp with dry eye notes + fundus)")

    # ── Diagnoses ────────────────────────────────────────────────────────
    diag_presbyopia = Diagnosis(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        icd10_code="H52.4",
        description="Presbyopia",
        eye_affected=EyeAffected.OU,
        severity="moderate",
        status="Active",
        notes="Progressive. Add increased from +1.50 to +1.75 OU.",
    )
    diag_dry_eye = Diagnosis(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        icd10_code="H04.123",
        description="Dry eye syndrome, bilateral",
        eye_affected=EyeAffected.OU,
        severity="mild-moderate",
        status="Active",
        notes="Worsening. Added Restasis. Schirmer's reduced OU.",
    )
    diag_mgd = Diagnosis(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        icd10_code="H00.019",
        description="Meibomian gland dysfunction, unspecified eye",
        eye_affected=EyeAffected.OU,
        severity="mild",
        status="Active",
        notes="Warm compresses + lid hygiene routine recommended.",
    )
    diag_cl_fitting = Diagnosis(
        id=uuid.uuid4(),
        encounter_id=ENCOUNTER_2_ID,
        icd10_code="Z46.0",
        description="Encounter for fitting and adjustment of spectacles and contact lenses",
        eye_affected=None,
        status="Active",
    )

    for d in [diag_presbyopia, diag_dry_eye, diag_mgd, diag_cl_fitting]:
        session.add(d)

    print(f"    │  ✓ Diagnoses (H52.4 / H04.123 / H00.019 / Z46.0)")
    print(f"    └─ Encounter 2 complete ✓")
    session.flush()


# ══════════════════════════════════════════════════════════════════════════
# Orchestrator
# ══════════════════════════════════════════════════════════════════════════

def main() -> None:
    header("Clarity Optometry EHR — Database Seeder")
    print(f"  Target URL   : {DATABASE_URL.split('@')[-1]}")  # hide credentials
    print(f"  Tenant schema: {TENANT_SCHEMA}")
    print(f"  Reseed mode  : {RESEED}")

    # ── Create synchronous engine ─────────────────────────────────────────
    engine = create_engine(
        DATABASE_URL,
        echo=False,          # Set True to see all SQL statements
        pool_pre_ping=True,  # Verify connection health before use
    )

    # ── Test connectivity before doing anything ───────────────────────────
    step("Testing database connectivity")
    try:
        with engine.connect() as probe:
            version = probe.execute(text("SELECT version()")).scalar()
            ok(f"Connected: {version[:60]}…")
    except Exception as exc:
        print(f"\n  {RED}✗  Cannot connect to database:{RESET}")
        print(f"     {exc}")
        print(f"\n  Make sure PostgreSQL is running and this URL is correct:")
        print(f"  {YELLOW}{DATABASE_URL}{RESET}\n")
        sys.exit(1)

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 1: PUBLIC SCHEMA
    # Create all PublicBase tables in the 'public' schema.
    # PublicBase models have schema='public' hardcoded in __table_args__,
    # so create_all() targets the right schema regardless of search_path.
    # ═══════════════════════════════════════════════════════════════════════

    step("Creating PUBLIC schema tables (PublicBase.metadata.create_all)")
    with engine.connect() as conn:
        PublicBase.metadata.create_all(bind=conn, checkfirst=True)
        conn.commit()
    ok("Public schema tables ready.")

    # Seed public-schema data
    with Session(engine) as pub_session:
        tenant = seed_public_schema(pub_session)

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 2: TENANT SCHEMA
    #
    # The 3-step schema-switching sequence that mirrors what TenantMiddleware
    # does on every authenticated API request:
    #
    #   Step A — CREATE the physical PostgreSQL schema namespace
    #   Step B — SET search_path TO clinic_sunview1, public
    #             From this point, all unqualified names → clinic_sunview1
    #   Step C — CREATE tables & INSERT data through this same connection
    #
    # Using the SAME connection object for steps B and C is non-negotiable.
    # SQLAlchemy's connection pool can hand out different connections, so
    # search_path set on one connection does NOT carry over to another.
    # ═══════════════════════════════════════════════════════════════════════

    # Step A: Create the schema namespace
    step(f"Creating tenant PostgreSQL schema: {TENANT_SCHEMA!r}")
    with engine.connect() as conn:
        if RESEED:
            warn(f"RESEED=true — dropping schema {TENANT_SCHEMA!r} and all its contents")
            conn.execute(text(f"DROP SCHEMA IF EXISTS {TENANT_SCHEMA} CASCADE"))
            conn.commit()
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {TENANT_SCHEMA}"))
        conn.commit()
    ok(f"Schema '{TENANT_SCHEMA}' exists.")

    # Steps B + C: Set search_path and create tenant tables on ONE connection
    step(f"Setting search_path → creating TenantBase tables in {TENANT_SCHEMA!r}")
    with engine.connect() as tenant_conn:
        # ── CRITICAL: switch to tenant schema ───────────────────────────
        # This single SQL statement is the entire tenant-routing mechanism.
        # It makes every subsequent unqualified table reference resolve to
        # clinic_sunview1 for the lifetime of this connection.
        tenant_conn.execute(
            text(f"SET search_path TO {TENANT_SCHEMA}, public")
        )
        ok(f"search_path = {TENANT_SCHEMA}, public")

        # Create all tenant tables in clinic_sunview1 via search_path
        # TenantBase models have NO schema prefix — PostgreSQL resolves them
        # to clinic_sunview1 because it's first in search_path.
        TenantBase.metadata.create_all(bind=tenant_conn, checkfirst=True)
        tenant_conn.commit()
        ok("Tenant schema tables created.")

        # Bind the ORM session to THIS SAME CONNECTION so all inserts also
        # land in clinic_sunview1 (same search_path, no pool re-assignment).
        with Session(bind=tenant_conn) as tenant_session:
            seed_tenant_schema(tenant_session)

    # ═══════════════════════════════════════════════════════════════════════
    # Summary
    # ═══════════════════════════════════════════════════════════════════════

    header("Seed complete — Summary")

    summary = f"""
  PUBLIC schema (postgres.public)
  ├── SubscriptionPlans : 3  (core / plus / premium)
  ├── Tenants           : 1  (Sunview Eye Care)
  ├── GlobalUsers       : 2  (dr.chen / marcus.webb)
  └── TenantAddons      : 1  (ai_scribe)

  TENANT schema ({TENANT_SCHEMA})
  ├── Staff             : 2  (Dr. Sarah Chen OD / Marcus Webb Tech)
  ├── Patients          : 5  (Hargrove / Vasquez / Thornton / Patel / Donovan)
  └── Encounters        : 2
      ├── Encounter 1 — Robert Hargrove (myopia + astigmatism, diabetic)
      │     Vitals      : IOP 15/18 mmHg, UCVA 20/200, BCVA 20/40
      │     Refractions : habitual (-2.00/-0.75×90) → auto → manifest → final
      │     Findings    : Slit-lamp anterior + Fundus (no diabetic retinopathy)
      │     Diagnoses   : H52.11 / H52.12 / H52.20 / Z01.01
      └── Encounter 2 — Elena Vasquez (presbyopia + dry eye)
            Vitals      : IOP 14/15 mmHg, Near VA 20/50 bilateral
            Refractions : habitual (+Add 1.50) → auto → manifest → final (+Add 1.75)
            Findings    : Slit-lamp (SPK, MGD) + Fundus
            Diagnoses   : H52.4 / H04.123 / H00.019 / Z46.0

  {BOLD}Login credentials (seed only — never use in production){RESET}
  ┌──────────────────────────────────────────────┬──────────────────────┐
  │ Email                                        │ Password             │
  ├──────────────────────────────────────────────┼──────────────────────┤
  │ dr.chen@sunvieweyecare.com                   │ SeedPassword123!     │
  │ marcus.webb@sunvieweyecare.com               │ SeedPassword123!     │
  └──────────────────────────────────────────────┴──────────────────────┘
    """
    print(summary)
    print(f"  {GREEN}{BOLD}Database is ready for development. ✓{RESET}\n")


if __name__ == "__main__":
    main()
