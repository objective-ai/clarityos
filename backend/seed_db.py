#!/usr/bin/env python3
"""
seed_db.py
============================================================================
Standalone database seeder for the Clarity Optometry EHR.

Creates the full schema structure and populates it with realistic demo data
for development, testing, and product demos.

SCHEMA STRATEGY (v1 — Public Schema)
─────────────────────────────────────
All data lives in public + clinic_sunview schemas with tenant_id column
for logical isolation. Multi-tenant schema-per-tenant will be v2.
For now there is a single demo tenant: Sunview Eye Care.

What this script provisions
───────────────────────────
  PUBLIC SCHEMA (SaaS control plane)
    ├── 3 SubscriptionPlans  (Core, Plus, Premium)
    ├── 1 Tenant             (Sunview Eye Care → schema: clinic_sunview)
    └── 1 TenantAddon        (ai_scribe add-on)

  TENANT SCHEMA  clinic_sunview  (clinical data plane)
    ├── 4 Staff              (owner + doctor + technician + receptionist)
    ├── 10 Patients           (diverse demographics and medical histories)
    ├── 13 Appointments       (past, today, next week)
    ├── 7 Encounters          (full visits with vitals, refractions, findings, diagnoses)
    ├── 3 Superbills          (with CPT line items)
    └── 2 IntakeTokens        (patient intake form links)

Run instructions
────────────────
  npm run db:seed             # first-time seed (auto-loads .env)
  npm run db:reseed           # wipe + reseed

  Or directly from project root:
  python backend/seed_db.py           # first-time seed
  RESEED=true python backend/seed_db.py  # wipe + reseed
"""

from __future__ import annotations

import os
import secrets
import sys
import uuid
import datetime
from decimal import Decimal

# ── Path setup ─────────────────────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

# ── Auto-load .env (works from project root or backend/) ───────────────────
try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv(os.path.join(_SCRIPT_DIR, "..", ".env"), override=False)
except ImportError:
    pass  # dotenv optional — env vars may already be set in shell

# ── SQLAlchemy ─────────────────────────────────────────────────────────────
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# ── Our models ─────────────────────────────────────────────────────────────
from backend.db.base import PublicBase, TenantBase

from backend.db.models.public.saas import (
    PlanInterval,
    SubscriptionPlan,
    Tenant,
    TenantAddon,
    TenantStatus,
)

from backend.db.models.tenant.clinical import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
    ClaimStatus,
    Diagnosis,
    Encounter,
    ExamFindings,
    EyeAffected,
    Patient,
    Refraction,
    RefractionType,
    Sex,
    Staff,
    StaffRole,
    StaffWeeklySchedule,
    Superbill,
    SuperbillLineItem,
    VitalsAndPretest,
)

from backend.db.models.tenant.intake import IntakeToken

from backend.db.models.tenant.clinical import (
    InsurancePayer,
    FeeScheduleItem,
    PatientInsurance,
)

from backend.core.entitlements import Entitlement

# ══════════════════════════════════════════════════════════════════════════
# Configuration
# ══════════════════════════════════════════════════════════════════════════

_RAW_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:password@localhost:5432/optometry_erp",
)
DATABASE_URL = (
    _RAW_URL
    .replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    .replace("postgresql://",         "postgresql+psycopg2://")
)

RESEED = os.getenv("RESEED", "false").lower() in ("true", "1", "yes")
TENANT_SCHEMA = "clinic_sunview"

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
# UUID Constants — aligned with Supabase auth + mock-session.ts
# ══════════════════════════════════════════════════════════════════════════

# Subscription Plans
PLAN_CORE_ID    = uuid.UUID("00000000-0001-0001-0001-000000000001")
PLAN_PLUS_ID    = uuid.UUID("00000000-0001-0001-0001-000000000002")
PLAN_PREMIUM_ID = uuid.UUID("00000000-0001-0001-0001-000000000003")

# Tenant (matches MEMORY.md + Supabase)
TENANT_ID = uuid.UUID("b0000000-0000-0000-0000-000000000001")

# Supabase auth user UUID for duytran@yahoo.com
USER_DUY_SUPABASE = uuid.UUID("c75da6ec-259c-4f97-933c-8dbea5ebbdf3")

# Staff (matches mock-session.ts)
STAFF_SARAH_ID  = uuid.UUID("c0000000-0000-0000-0000-000000000001")
STAFF_MARCUS_ID = uuid.UUID("c0000000-0000-0000-0000-000000000002")
STAFF_DUY_ID    = uuid.UUID("c0000000-0000-0000-0000-000000000003")
STAFF_EMILY_ID  = uuid.UUID("c0000000-0000-0000-0000-000000000004")

# Patients (10)
PATIENT_IDS = [uuid.UUID(f"d0000000-0005-0000-0000-{str(i).zfill(12)}") for i in range(1, 11)]

# Appointments (13)
APPT_IDS = [uuid.UUID(f"a0000000-0006-0000-0000-{str(i).zfill(12)}") for i in range(1, 14)]

# Encounters (8)
ENC_IDS = [uuid.UUID(f"e0000000-0007-0000-0000-{str(i).zfill(12)}") for i in range(1, 9)]

# Superbills (6 — one per status: accepted, ready_to_bill, submitted, draft, rejected, submitted)
SB_IDS = [uuid.UUID(f"50000000-0008-0000-0000-{str(i).zfill(12)}") for i in range(1, 7)]

# Insurance Payers (fixed IDs so superbills can reference them)
PAYER_VSP_ID        = uuid.UUID("b0000000-0010-0000-0000-000000000001")
PAYER_EYEMED_ID     = uuid.UUID("b0000000-0010-0000-0000-000000000002")
PAYER_DAVIS_ID      = uuid.UUID("b0000000-0010-0000-0000-000000000003")
PAYER_MEDICARE_ID   = uuid.UUID("b0000000-0010-0000-0000-000000000004")
PAYER_MEDICAID_ID   = uuid.UUID("b0000000-0010-0000-0000-000000000005")
PAYER_AETNA_ID      = uuid.UUID("b0000000-0010-0000-0000-000000000006")
PAYER_BLUESHIELD_ID = uuid.UUID("b0000000-0010-0000-0000-000000000007")
PAYER_ANTHEM_ID     = uuid.UUID("b0000000-0010-0000-0000-000000000008")
PAYER_UHC_ID        = uuid.UUID("b0000000-0010-0000-0000-000000000009")
PAYER_HUMANA_ID     = uuid.UUID("b0000000-0010-0000-0000-000000000010")

# Intake Tokens (2)
IT_IDS = [uuid.UUID(f"10000000-0009-0000-0000-{str(i).zfill(12)}") for i in range(1, 3)]

# Addon
ADDON_ID = uuid.UUID("00000000-0007-0007-0007-000000000001")

# Use today's actual date so schedule appointments always land on the current day
TODAY = datetime.date.today()
YESTERDAY = TODAY - datetime.timedelta(days=1)
TOMORROW = TODAY + datetime.timedelta(days=1)

# Clinic timezone — seed times are specified in local clinic time and converted to UTC
from zoneinfo import ZoneInfo
CLINIC_TZ = ZoneInfo("America/Los_Angeles")

def _dt(date: datetime.date, hour: int, minute: int = 0) -> datetime.datetime:
    """Build a UTC datetime from a local clinic time (Pacific).
    e.g. _dt(TODAY, 8) → 8:00 AM PST → 16:00 UTC (or 15:00 UTC during PDT)."""
    local = datetime.datetime(date.year, date.month, date.day, hour, minute, 0,
                               tzinfo=CLINIC_TZ)
    return local.astimezone(datetime.timezone.utc)


# ══════════════════════════════════════════════════════════════════════════
# Phase 1 — Public schema
# ══════════════════════════════════════════════════════════════════════════

def seed_public_schema(session: Session) -> None:
    """Seed PUBLIC schema: subscription plans, tenant, add-ons."""

    # ── Subscription Plans ───────────────────────────────────────────────
    step("Seeding SubscriptionPlans")

    plans_data = [
        dict(
            id=PLAN_CORE_ID,
            name="Core",
            slug="core",
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
            name="Plus",
            slug="plus",
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
            name="Premium",
            slug="premium",
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
        if session.get(SubscriptionPlan, pd["id"]):
            warn(f"Plan '{pd['slug']}' already exists — skipping")
            continue
        session.add(SubscriptionPlan(**pd))
        ok(f"Created plan: {pd['name']} (${pd['price_cents'] / 100:.0f}/mo)")

    session.flush()

    # ── Tenant ───────────────────────────────────────────────────────────
    step("Seeding Tenant (Clinic)")

    if session.get(Tenant, TENANT_ID):
        warn("Tenant 'Sunview Eye Care' already exists — skipping")
    else:
        session.add(Tenant(
            id=TENANT_ID,
            name="Sunview Eye Care",
            slug="sunview",
            schema_name=TENANT_SCHEMA,
            status=TenantStatus.ACTIVE,
            plan_id=PLAN_PREMIUM_ID,
            owner_id=USER_DUY_SUPABASE,
            settings_jsonb={
                "booking": {
                    "enabled": True,
                    "hours": {
                        "mon": {"start": "08:00", "end": "17:00"},
                        "tue": {"start": "08:00", "end": "17:00"},
                        "wed": {"start": "08:00", "end": "17:00"},
                        "thu": {"start": "08:00", "end": "17:00"},
                        "fri": {"start": "08:00", "end": "16:00"},
                        "sat": None,
                        "sun": None,
                    },
                    "slot_interval_minutes": 15,
                    "bookable_types": [
                        "comprehensive_exam",
                        "contact_lens_exam",
                        "pediatric_exam",
                    ],
                    "max_advance_days": 90,
                },
            },
        ))
        ok("Created tenant: Sunview Eye Care")

    session.flush()

    # ── TenantAddon ──────────────────────────────────────────────────────
    step("Seeding TenantAddons")

    if session.get(TenantAddon, ADDON_ID):
        warn("TenantAddon ai_scribe already exists — skipping")
    else:
        session.add(TenantAddon(
            id=ADDON_ID,
            tenant_id=TENANT_ID,
            feature_key=Entitlement.AI_SCRIBE,
        ))
        ok("Created TenantAddon: AI_SCRIBE")

    session.commit()
    ok("Public schema committed.")


# ══════════════════════════════════════════════════════════════════════════
# Phase 2 — Tenant schema
# ══════════════════════════════════════════════════════════════════════════

def seed_tenant_schema(session: Session) -> None:
    """Seed TENANT schema (clinic_sunview). Called after SET search_path."""

    _seed_staff(session)
    _seed_staff_schedules(session)
    _seed_patients(session)
    _seed_appointments(session)
    _seed_encounters(session)
    _seed_insurance_payers(session)
    _seed_patient_insurance(session)
    _seed_superbills(session)
    _seed_intake_tokens(session)

    session.commit()
    ok("Tenant schema committed.")


# ── Staff ─────────────────────────────────────────────────────────────────

def _seed_staff(session: Session) -> None:
    step("Seeding Staff (4 members)")

    staff_data = [
        dict(
            id=STAFF_SARAH_ID,
            tenant_id=TENANT_ID,
            user_id=None,
            role=StaffRole.DOCTOR,
            first_name="Sarah",
            last_name="Lin",
            license_number="OD-CA-2018-44821",
            npi_number="1234567890",
            is_active=True,
        ),
        dict(
            id=STAFF_MARCUS_ID,
            tenant_id=TENANT_ID,
            user_id=None,
            role=StaffRole.TECHNICIAN,
            first_name="Marcus",
            last_name="Webb",
            license_number=None,
            npi_number=None,
            is_active=True,
        ),
        dict(
            id=STAFF_DUY_ID,
            tenant_id=TENANT_ID,
            user_id=USER_DUY_SUPABASE,
            role=StaffRole.OWNER,
            first_name="Duy",
            last_name="Tran",
            license_number="OD-CA-2015-33102",
            npi_number="9876543210",
            is_active=True,
        ),
        dict(
            id=STAFF_EMILY_ID,
            tenant_id=TENANT_ID,
            user_id=None,
            role=StaffRole.RECEPTIONIST,
            first_name="Emily",
            last_name="Nguyen",
            license_number=None,
            npi_number=None,
            is_active=True,
        ),
    ]

    for sd in staff_data:
        if session.get(Staff, sd["id"]):
            warn(f"Staff '{sd['first_name']} {sd['last_name']}' already exists — skipping")
            continue
        session.add(Staff(**sd))
        ok(f"Created Staff: {sd['first_name']} {sd['last_name']} ({sd['role'].value})")

    session.flush()


# ── Staff Weekly Schedules ────────────────────────────────────────────────

def _seed_staff_schedules(session: Session) -> None:
    step("Seeding Staff Weekly Schedules (Mon-Fri 9-5)")

    staff_ids = [STAFF_SARAH_ID, STAFF_MARCUS_ID, STAFF_DUY_ID, STAFF_EMILY_ID]
    for staff_id in staff_ids:
        for dow in range(7):
            existing = session.query(StaffWeeklySchedule).filter_by(
                staff_id=staff_id, day_of_week=dow
            ).first()
            if existing:
                continue
            session.add(StaffWeeklySchedule(
                id=uuid.uuid4(),
                tenant_id=TENANT_ID,
                staff_id=staff_id,
                day_of_week=dow,
                start_time=datetime.time(9, 0),
                end_time=datetime.time(17, 0),
                is_active=(dow < 5),  # Mon-Fri active, Sat-Sun off
            ))
    ok("Created weekly schedules for 4 staff members")
    session.flush()


# ── Patients ──────────────────────────────────────────────────────────────

def _seed_patients(session: Session) -> None:
    step("Seeding 10 Patients")

    patients_data = [
        # 1: Robert Hargrove — myopia, diabetes, HTN
        dict(
            id=PATIENT_IDS[0], tenant_id=TENANT_ID, chart_number=1001,
            first_name="Robert", last_name="Hargrove", preferred_name="Bob",
            dob=datetime.date(1968, 3, 14), sex=Sex.MALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-0142"}, {"type": "home", "number": "555-0199"}],
                "email": "robert.hargrove@email.com", "preferred_contact": "mobile",
                "address": {"street": "412 Elmwood Drive", "city": "San Diego", "state": "CA", "zip": "92101"},
                "emergency_contact": {"name": "Linda Hargrove", "relationship": "spouse", "phone": "555-0143"},
            },
            medical_history_jsonb={
                "systemic_conditions": ["Type 2 Diabetes (dx 2015)", "Hypertension"],
                "ocular_history": ["Myopia since age 12"],
                "family_history": ["Glaucoma (father)", "Macular degeneration (maternal grandmother)"],
                "current_medications": ["Metformin 1000mg twice daily", "Lisinopril 10mg", "Atorvastatin 40mg"],
                "allergies": ["Penicillin (rash)"],
                "surgeries": [],
                "last_dilated_exam": "2025-02-20",
            },
            privacy_flags_jsonb={},
        ),
        # 2: Elena Vasquez — presbyopia, CL wearer, dry eye
        dict(
            id=PATIENT_IDS[1], tenant_id=TENANT_ID, chart_number=1002,
            first_name="Elena", last_name="Vasquez", preferred_name=None,
            dob=datetime.date(1973, 9, 22), sex=Sex.FEMALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-0287"}],
                "email": "evasquez@workmail.com", "preferred_contact": "email",
                "address": {"street": "88 Coastline Blvd, Apt 4B", "city": "San Diego", "state": "CA", "zip": "92109"},
                "emergency_contact": {"name": "Carlos Vasquez", "relationship": "husband", "phone": "555-0288"},
            },
            medical_history_jsonb={
                "systemic_conditions": ["Seasonal allergies"],
                "ocular_history": ["Contact lens wearer (soft daily) since age 22", "Dry eye syndrome"],
                "family_history": ["Cataracts (mother)"],
                "current_medications": ["Loratadine 10mg PRN", "Systane Ultra eye drops PRN"],
                "allergies": ["Thimerosal (preservative in some contact lens solutions)"],
                "surgeries": [],
                "last_dilated_exam": "2025-02-21",
            },
            privacy_flags_jsonb={},
        ),
        # 3: James Thornton — glaucoma suspect
        dict(
            id=PATIENT_IDS[2], tenant_id=TENANT_ID, chart_number=1003,
            first_name="James", last_name="Thornton", preferred_name=None,
            dob=datetime.date(1955, 11, 3), sex=Sex.MALE,
            contact_info_jsonb={
                "phones": [{"type": "home", "number": "555-0312"}, {"type": "mobile", "number": "555-0313"}],
                "email": None, "preferred_contact": "home",
                "address": {"street": "1701 Harbor View Road", "city": "Chula Vista", "state": "CA", "zip": "91910"},
                "emergency_contact": {"name": "Dorothy Thornton", "relationship": "wife", "phone": "555-0312"},
            },
            medical_history_jsonb={
                "systemic_conditions": ["Hypertension", "Hypercholesterolemia"],
                "ocular_history": ["Elevated IOP — monitoring since 2020", "Large optic nerve cups OD > OS", "Glaucoma suspect"],
                "family_history": ["Glaucoma (brother and father)", "Diabetes (mother)"],
                "current_medications": ["Amlodipine 5mg", "Rosuvastatin 20mg", "Travoprost 0.004% OU QHS"],
                "allergies": [],
                "surgeries": ["Appendectomy 1989"],
                "last_dilated_exam": "2026-01-14",
            },
            privacy_flags_jsonb={},
        ),
        # 4: Priya Patel — young adult, first comprehensive exam
        dict(
            id=PATIENT_IDS[3], tenant_id=TENANT_ID, chart_number=1004,
            first_name="Priya", last_name="Patel", preferred_name=None,
            dob=datetime.date(2001, 6, 17), sex=Sex.FEMALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-0467"}],
                "email": "priya.patel.eyes@gmail.com", "preferred_contact": "email",
                "address": {"street": "203 University Ave", "city": "San Diego", "state": "CA", "zip": "92103"},
                "emergency_contact": {"name": "Anita Patel", "relationship": "mother", "phone": "555-0468"},
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
        # 5: William Donovan — post-LASIK, presbyopia
        dict(
            id=PATIENT_IDS[4], tenant_id=TENANT_ID, chart_number=1005,
            first_name="William", last_name="Donovan", preferred_name="Will",
            dob=datetime.date(1962, 1, 28), sex=Sex.MALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-0551"}, {"type": "office", "number": "555-0552"}],
                "email": "wdonovan@legalgroup.com", "preferred_contact": "mobile",
                "address": {"street": "9 Hillcrest Lane", "city": "La Jolla", "state": "CA", "zip": "92037"},
                "emergency_contact": {"name": "Patricia Donovan", "relationship": "wife", "phone": "555-0553"},
            },
            medical_history_jsonb={
                "systemic_conditions": ["Hypothyroidism"],
                "ocular_history": ["LASIK OD + OS — 2005", "Presbyopia onset — approximately 2018", "OTC +1.50 reading glasses"],
                "family_history": ["Glaucoma (mother)", "Cataracts (both parents)"],
                "current_medications": ["Levothyroxine 75mcg"],
                "allergies": [],
                "surgeries": ["LASIK 2005"],
                "last_dilated_exam": "2025-06-20",
            },
            privacy_flags_jsonb={},
        ),
        # 6: Maria Santos — CL refit, keratoconus suspect
        dict(
            id=PATIENT_IDS[5], tenant_id=TENANT_ID, chart_number=1006,
            first_name="Maria", last_name="Santos", preferred_name=None,
            dob=datetime.date(1980, 4, 22), sex=Sex.FEMALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-0634"}],
                "email": "maria.santos@email.com", "preferred_contact": "mobile",
                "address": {"street": "512 Pacific Highway", "city": "San Diego", "state": "CA", "zip": "92110"},
                "emergency_contact": {"name": "Jorge Santos", "relationship": "husband", "phone": "555-0635"},
            },
            medical_history_jsonb={
                "systemic_conditions": [],
                "ocular_history": ["Contact lens wearer since age 16", "Progressive astigmatism", "Keratoconus suspect OS"],
                "family_history": ["Keratoconus (brother)"],
                "current_medications": [],
                "allergies": ["Sulfa drugs"],
                "surgeries": [],
                "last_dilated_exam": "2025-09-10",
            },
            privacy_flags_jsonb={},
        ),
        # 7: David Kim — digital eye strain
        dict(
            id=PATIENT_IDS[6], tenant_id=TENANT_ID, chart_number=1007,
            first_name="David", last_name="Kim", preferred_name=None,
            dob=datetime.date(1990, 8, 15), sex=Sex.MALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-0721"}],
                "email": "dkim.dev@gmail.com", "preferred_contact": "email",
                "address": {"street": "1420 Kettner Blvd, Unit 8", "city": "San Diego", "state": "CA", "zip": "92101"},
                "emergency_contact": {"name": "Jenny Kim", "relationship": "sister", "phone": "555-0722"},
            },
            medical_history_jsonb={
                "systemic_conditions": [],
                "ocular_history": ["Computer vision syndrome", "Occasional headaches with screen use"],
                "family_history": [],
                "current_medications": [],
                "allergies": [],
                "surgeries": [],
                "last_dilated_exam": "2024-11-05",
            },
            privacy_flags_jsonb={},
        ),
        # 8: Barbara Thompson — cataracts, AMD screening
        dict(
            id=PATIENT_IDS[7], tenant_id=TENANT_ID, chart_number=1008,
            first_name="Barbara", last_name="Thompson", preferred_name="Barb",
            dob=datetime.date(1948, 12, 1), sex=Sex.FEMALE,
            contact_info_jsonb={
                "phones": [{"type": "home", "number": "555-0845"}, {"type": "mobile", "number": "555-0846"}],
                "email": "barbara.t@aol.com", "preferred_contact": "home",
                "address": {"street": "225 Rosecrans St", "city": "San Diego", "state": "CA", "zip": "92106"},
                "emergency_contact": {"name": "Thomas Thompson", "relationship": "son", "phone": "555-0847"},
            },
            medical_history_jsonb={
                "systemic_conditions": ["Hypertension", "Osteoarthritis"],
                "ocular_history": ["Cataracts (moderate OU)", "Early age-related macular degeneration", "Pseudophakia OD (cataract surgery 2024)"],
                "family_history": ["Macular degeneration (mother)", "Glaucoma (father)"],
                "current_medications": ["Lisinopril 20mg", "Acetaminophen PRN", "AREDS2 vitamins"],
                "allergies": ["Codeine (nausea)"],
                "surgeries": ["Cataract extraction OD 2024"],
                "last_dilated_exam": "2026-02-15",
            },
            privacy_flags_jsonb={},
        ),
        # 9: Michael Chen — diabetic retinopathy monitoring
        dict(
            id=PATIENT_IDS[8], tenant_id=TENANT_ID, chart_number=1009,
            first_name="Michael", last_name="Chen", preferred_name="Mike",
            dob=datetime.date(1975, 6, 30), sex=Sex.MALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-0918"}],
                "email": "mchen75@yahoo.com", "preferred_contact": "mobile",
                "address": {"street": "3402 Adams Ave", "city": "San Diego", "state": "CA", "zip": "92116"},
                "emergency_contact": {"name": "Lisa Chen", "relationship": "wife", "phone": "555-0919"},
            },
            medical_history_jsonb={
                "systemic_conditions": ["Type 1 Diabetes (dx 2000)", "Hypertension"],
                "ocular_history": ["Mild non-proliferative diabetic retinopathy OU", "Annual dilated exam required"],
                "family_history": ["Diabetes (father)", "Cataracts (mother)"],
                "current_medications": ["Insulin pump", "Lisinopril 10mg", "Aspirin 81mg"],
                "allergies": [],
                "surgeries": [],
                "last_dilated_exam": "2025-09-15",
            },
            privacy_flags_jsonb={},
        ),
        # 10: Sophia Rodriguez — pediatric myopia management
        dict(
            id=PATIENT_IDS[9], tenant_id=TENANT_ID, chart_number=1010,
            first_name="Sophia", last_name="Rodriguez", preferred_name=None,
            dob=datetime.date(2015, 2, 14), sex=Sex.FEMALE,
            contact_info_jsonb={
                "phones": [{"type": "mobile", "number": "555-1034"}],
                "email": "rosa.rodriguez@email.com", "preferred_contact": "mobile",
                "address": {"street": "780 E Street", "city": "Chula Vista", "state": "CA", "zip": "91910"},
                "emergency_contact": {"name": "Rosa Rodriguez", "relationship": "mother", "phone": "555-1034"},
            },
            medical_history_jsonb={
                "systemic_conditions": [],
                "ocular_history": ["Progressive myopia since age 8", "Currently wearing glasses"],
                "family_history": ["High myopia (both parents)"],
                "current_medications": [],
                "allergies": [],
                "surgeries": [],
                "last_dilated_exam": "2025-08-20",
            },
            privacy_flags_jsonb={},
        ),
    ]

    for pd in patients_data:
        if session.get(Patient, pd["id"]):
            warn(f"Patient '{pd['first_name']} {pd['last_name']}' already exists — skipping")
            continue
        session.add(Patient(**pd))
        ok(f"Created Patient: {pd['first_name']} {pd['last_name']} (DOB {pd['dob']})")

    session.flush()


# ── Appointments ──────────────────────────────────────────────────────────

def _seed_appointments(session: Session) -> None:
    step("Seeding 13 Appointments")

    appts = [
        # Historical — linked to Thornton encounter series
        dict(id=APPT_IDS[2], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[2], provider_id=STAFF_DUY_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.FOLLOW_UP,
             status=AppointmentStatus.COMPLETED, start_time=_dt(datetime.date(2026, 1, 14), 9),
             end_time=_dt(datetime.date(2026, 1, 14), 9, 30), duration_minutes=30,
             chief_complaint="12-month glaucoma follow-up",
             intake_status="submitted",
             checked_in_at=_dt(datetime.date(2026, 1, 14), 8, 50)),

        # Yesterday — completed visits
        dict(id=APPT_IDS[0], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[0], provider_id=STAFF_SARAH_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.COMPREHENSIVE_EXAM,
             status=AppointmentStatus.COMPLETED, start_time=_dt(YESTERDAY, 9),
             end_time=_dt(YESTERDAY, 9, 45), duration_minutes=45,
             chief_complaint="Annual comprehensive exam — diabetic patient",
             intake_status="submitted",
             checked_in_at=_dt(YESTERDAY, 8, 48)),
        dict(id=APPT_IDS[1], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[1], provider_id=STAFF_SARAH_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.CONTACT_LENS_EXAM,
             status=AppointmentStatus.COMPLETED, start_time=_dt(YESTERDAY, 10, 30),
             end_time=_dt(YESTERDAY, 11), duration_minutes=30,
             chief_complaint="Difficulty reading at near, dry eye worsening",
             intake_status="submitted",
             checked_in_at=_dt(YESTERDAY, 10, 15)),

        # Today — active clinic day (~1 hr spacing)
        dict(id=APPT_IDS[3], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[3], provider_id=STAFF_SARAH_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.COMPREHENSIVE_EXAM,
             status=AppointmentStatus.ARRIVED, start_time=_dt(TODAY, 9),
             end_time=_dt(TODAY, 9, 45), duration_minutes=45,
             chief_complaint="First comprehensive eye exam",
             intake_status="submitted",
             checked_in_at=_dt(TODAY, 8, 48)),
        dict(id=APPT_IDS[4], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[4], provider_id=STAFF_DUY_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.COMPREHENSIVE_EXAM,
             status=AppointmentStatus.IN_EXAM, start_time=_dt(TODAY, 10),
             end_time=_dt(TODAY, 10, 45), duration_minutes=45,
             chief_complaint="Post-LASIK annual, presbyopia worsening",
             intake_status="submitted",
             checked_in_at=_dt(TODAY, 9, 46)),
        dict(id=APPT_IDS[5], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[7], provider_id=STAFF_SARAH_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.COMPREHENSIVE_EXAM,
             status=AppointmentStatus.CONFIRMED, start_time=_dt(TODAY, 11),
             end_time=_dt(TODAY, 11, 45), duration_minutes=45,
             chief_complaint="Cataract monitoring, AMD follow-up",
             intake_status="submitted"),
        dict(id=APPT_IDS[6], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[8], provider_id=STAFF_DUY_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.FOLLOW_UP,
             status=AppointmentStatus.SCHEDULED, start_time=_dt(TODAY, 13),
             end_time=_dt(TODAY, 13, 30), duration_minutes=30,
             chief_complaint="Diabetic retinopathy monitoring — annual dilated exam",
             intake_status="pending"),

        # Tomorrow — upcoming schedule (~1 hr spacing)
        dict(id=APPT_IDS[7], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[5], provider_id=STAFF_SARAH_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.CONTACT_LENS_EXAM,
             status=AppointmentStatus.CONFIRMED, start_time=_dt(TOMORROW, 9),
             end_time=_dt(TOMORROW, 9, 30), duration_minutes=30,
             chief_complaint="Contact lens refit — progressive astigmatism",
             intake_status="submitted"),
        dict(id=APPT_IDS[8], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[1], provider_id=STAFF_DUY_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.CONTACT_LENS_EXAM,
             status=AppointmentStatus.CONFIRMED, start_time=_dt(TOMORROW, 10),
             end_time=_dt(TOMORROW, 10, 30), duration_minutes=30,
             chief_complaint="Contact lens dryness and discomfort — possible fit issue",
             intake_status="pending"),
        dict(id=APPT_IDS[9], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[9], provider_id=STAFF_SARAH_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.PEDIATRIC_EXAM,
             status=AppointmentStatus.SCHEDULED, start_time=_dt(TOMORROW, 11),
             end_time=_dt(TOMORROW, 11, 45), duration_minutes=45,
             chief_complaint="Progressive myopia management — 11yo",
             intake_status="submitted"),
        dict(id=APPT_IDS[10], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[0], provider_id=STAFF_SARAH_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.FOLLOW_UP,
             status=AppointmentStatus.SCHEDULED, start_time=_dt(TOMORROW, 13),
             end_time=_dt(TOMORROW, 13, 20), duration_minutes=20,
             chief_complaint="Glasses adjustment, vision check",
             intake_status="pending"),

        # Next week
        dict(id=APPT_IDS[11], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[2], provider_id=STAFF_DUY_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.FOLLOW_UP,
             status=AppointmentStatus.SCHEDULED, start_time=_dt(datetime.date(2026, 3, 10), 9),
             end_time=_dt(datetime.date(2026, 3, 10), 9, 30), duration_minutes=30,
             chief_complaint="Glaucoma follow-up — IOP check",
             intake_status="pending"),
        dict(id=APPT_IDS[12], tenant_id=TENANT_ID, patient_id=PATIENT_IDS[1], provider_id=STAFF_SARAH_ID,
             booked_by_id=STAFF_EMILY_ID, appointment_type=AppointmentType.FOLLOW_UP,
             status=AppointmentStatus.CONFIRMED, start_time=_dt(datetime.date(2026, 3, 11), 10),
             end_time=_dt(datetime.date(2026, 3, 11), 10, 20), duration_minutes=20,
             chief_complaint="Multifocal CL trial follow-up",
             intake_status="pending"),
    ]

    for ad in appts:
        if session.get(Appointment, ad["id"]):
            warn(f"Appointment {ad['id']} already exists — skipping")
            continue
        session.add(Appointment(**ad))

    session.flush()
    ok(f"Created {len(appts)} appointments")


# ── Encounters ────────────────────────────────────────────────────────────

def _seed_encounters(session: Session) -> None:
    step("Seeding 8 Encounters")

    _seed_enc_hargrove(session)
    _seed_enc_vasquez(session)
    _seed_enc_thornton_series(session)
    _seed_enc_thompson(session)
    _seed_enc_david_kim_today(session)
    _seed_enc_donovan_today(session)

    session.flush()


def _seed_enc_hargrove(session: Session) -> None:
    """E1: Robert Hargrove — myopia + astigmatism, diabetic screening."""
    if session.get(Encounter, ENC_IDS[0]):
        warn("Encounter 1 (Hargrove) exists — skipping"); return

    enc_date = TODAY  # Optical queue needs finalized encounters on TODAY
    session.add(Encounter(
        id=ENC_IDS[0], tenant_id=TENANT_ID,
        patient_id=PATIENT_IDS[0], provider_id=STAFF_SARAH_ID,
        appointment_id=APPT_IDS[0], encounter_date=enc_date,
        chief_complaint="Annual comprehensive exam. Blurred vision at distance worsening. Current glasses 2 years old.",
        assessment_and_plan=(
            "1. Myopia with astigmatism — prescription updated.\n"
            "2. Annual dilated fundus exam completed — no diabetic retinopathy.\n"
            "3. Counseled on blood glucose control for ocular health.\n"
            "4. New glasses Rx dispensed. Follow-up in 12 months."
        ),
        is_finalized=True,
        finalized_at=_dt(enc_date, 16, 42),
    ))
    session.flush()

    session.add(VitalsAndPretest(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[0],
        iop_od=Decimal("15.0"), iop_os=Decimal("18.0"),
        iop_time=_dt(enc_date, 9, 15), iop_method="icare",
        ucva_od="20/200", ucva_os="20/150", bcva_od="20/40", bcva_os="20/30",
        near_va_od="20/25", near_va_os="20/20",
        blood_pressure="128/82", pulse=72,
        pupils_equal_round_reactive=True, relative_afferent_pupillary_defect=False,
        cover_test_notes="Orthophoria at distance and near.",
        technician_notes="Headaches in evenings with screen use. Last HbA1c 7.1%.",
        recorded_by_id=STAFF_MARCUS_ID,
    ))

    # Refractions: habitual, auto, manifest, final
    for rt, sph_od, cyl_od, ax_od, sph_os, cyl_os, ax_os, va_od, va_os, final, notes in [
        (RefractionType.HABITUAL, "-2.00", "-0.75", 90, "-1.75", "-0.50", 175, "20/40", "20/30", False, "Lensometry of current glasses. 2 years old."),
        (RefractionType.AUTO, "-2.50", "-1.25", 88, "-2.00", "-0.75", 173, None, None, False, "Topcon KR-800 autorefractor."),
        (RefractionType.MANIFEST, "-2.25", "-1.00", 90, "-1.75", "-0.50", 175, "20/20", "20/20", False, "Patient preferred +0.25 more plus OD."),
        (RefractionType.FINAL, "-2.25", "-1.00", 90, "-1.75", "-0.50", 175, "20/20", "20/20", True, "Final Rx dispensed. No reading add needed."),
    ]:
        session.add(Refraction(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[0],
            refraction_type=rt,
            od_sphere=Decimal(sph_od), od_cylinder=Decimal(cyl_od), od_axis=ax_od,
            od_visual_acuity=va_od,
            os_sphere=Decimal(sph_os), os_cylinder=Decimal(cyl_os), os_axis=ax_os,
            os_visual_acuity=va_os,
            pd_distance=Decimal("63.0"), is_final_rx=final, notes=notes,
            recorded_by_id=STAFF_SARAH_ID if final or rt == RefractionType.MANIFEST else STAFF_MARCUS_ID,
        ))

    # Exam findings
    session.add(ExamFindings(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[0], patient_id=PATIENT_IDS[0],
        exam_section="anterior_segment", is_normal_wnl=True,
        findings_od={
            "lids_lashes": {"status": "Normal", "severity": None, "finding": ""},
            "conjunctiva_sclera": {"status": "White & quiet", "severity": None, "finding": ""},
            "cornea": {"status": "Clear", "severity": None, "finding": ""},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "Trace nuclear sclerosis", "severity": "trace", "finding": "1+ NS"},
            "tear_film": {"status": "Stable", "severity": None, "finding": ""},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        findings_os={
            "lids_lashes": {"status": "Normal", "severity": None, "finding": ""},
            "conjunctiva_sclera": {"status": "White & quiet", "severity": None, "finding": "Trace injection"},
            "cornea": {"status": "Clear", "severity": None, "finding": ""},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "Trace nuclear sclerosis", "severity": "trace", "finding": "1+ NS"},
            "tear_film": {"status": "Stable", "severity": None, "finding": ""},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        recorded_by_id=STAFF_SARAH_ID,
    ))
    session.add(ExamFindings(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[0], patient_id=PATIENT_IDS[0],
        exam_section="posterior_segment", is_normal_wnl=False,
        findings_od={
            "cup_to_disc_ratio": {"status": "0.40", "severity": None, "finding": "Sharp margins"},
            "optic_nerve": {"status": "Healthy, pink", "severity": None, "finding": ""},
            "macula": {"status": "Flat & intact", "severity": None, "finding": "No exudates"},
            "vitreous": {"status": "Clear", "severity": None, "finding": ""},
            "vessels": {"status": "Normal A/V ratio", "severity": None, "finding": ""},
            "periphery": {"status": "Flat & intact", "severity": None, "finding": "No breaks"},
        },
        findings_os={
            "cup_to_disc_ratio": {"status": "0.35", "severity": None, "finding": "Sharp margins"},
            "optic_nerve": {"status": "Healthy, pink", "severity": None, "finding": ""},
            "macula": {"status": "Flat & intact", "severity": None, "finding": "No drusen"},
            "vitreous": {"status": "Clear", "severity": None, "finding": ""},
            "vessels": {"status": "Normal A/V ratio", "severity": "mild", "finding": "Mild arterial reflex (HTN)"},
            "periphery": {"status": "Flat & intact", "severity": None, "finding": "Trace pigment clumping"},
        },
        provider_notes="No diabetic retinopathy detected (ETDRS level 10). Annual follow-up recommended.",
        recorded_by_id=STAFF_SARAH_ID,
    ))

    # Diagnoses
    for code, desc, eye, sev in [
        ("H52.11", "Myopia, right eye", EyeAffected.OD, "moderate"),
        ("H52.12", "Myopia, left eye", EyeAffected.OS, "low-moderate"),
        ("H52.20", "Unspecified astigmatism", EyeAffected.OU, "mild"),
        ("Z01.01", "Eye exam with abnormal findings — diabetic screening", EyeAffected.OU, None),
    ]:
        session.add(Diagnosis(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[0],
            icd10_code=code, description=desc, eye_affected=eye, severity=sev, status="active",
        ))

    session.flush()
    ok("Encounter 1 (Robert Hargrove) created")


def _seed_enc_vasquez(session: Session) -> None:
    """E2: Elena Vasquez — presbyopia + dry eye + CL fitting."""
    if session.get(Encounter, ENC_IDS[1]):
        warn("Encounter 2 (Vasquez) exists — skipping"); return

    enc_date = TODAY  # Optical queue needs finalized encounters on TODAY
    session.add(Encounter(
        id=ENC_IDS[1], tenant_id=TENANT_ID,
        patient_id=PATIENT_IDS[1], provider_id=STAFF_SARAH_ID,
        appointment_id=APPT_IDS[1], encounter_date=enc_date,
        chief_complaint="Difficulty reading at near with contacts. Dry eye worsening afternoon. Interested in multifocal CLs.",
        assessment_and_plan=(
            "1. Presbyopia — updated Rx with +1.75 add OU.\n"
            "2. Trialing Dailies Total1 Multifocal — high add OU.\n"
            "3. Dry eye — added Restasis 0.05% BID OU. Continue PF tears PRN.\n"
            "4. Follow-up in 2 weeks for CL trial assessment."
        ),
        is_finalized=True,
        finalized_at=_dt(enc_date, 11, 30),
    ))
    session.flush()

    session.add(VitalsAndPretest(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[1],
        iop_od=Decimal("14.0"), iop_os=Decimal("15.0"),
        iop_time=_dt(enc_date, 8, 50), iop_method="icare",
        ucva_od="20/30", ucva_os="20/40", bcva_od="20/20", bcva_os="20/20",
        near_va_od="20/50", near_va_os="20/50",
        blood_pressure="118/76", pulse=68,
        pupils_equal_round_reactive=True, relative_afferent_pupillary_defect=False,
        cover_test_notes="Ortho at distance. Esophoria 2pd at near — WNL.",
        technician_notes="Schirmer's: OD 6mm / OS 5mm (5 min). Reduced tear production.",
        recorded_by_id=STAFF_MARCUS_ID,
    ))

    for rt, sph_od, cyl_od, ax_od, add_od, sph_os, cyl_os, ax_os, add_os, va_od, va_os, final, notes in [
        (RefractionType.HABITUAL, "-0.50", "-0.25", 180, "1.50", "-0.75", "-0.25", 175, "1.50", "20/25", "20/30", False, "Previous Rx from 2024."),
        (RefractionType.AUTO, "-0.75", "-0.50", 178, None, "-1.00", "-0.25", 172, None, None, None, False, "Topcon KR-800."),
        (RefractionType.MANIFEST, "-0.50", "-0.25", 180, "1.75", "-0.75", "-0.25", 175, "1.75", "20/20", "20/20", False, "Near add +1.75 gives J1 at 16in."),
        (RefractionType.FINAL, "-0.50", "-0.25", 180, "1.75", "-0.75", "-0.25", 175, "1.75", "20/20", "20/20", True, "PAL recommended. CL trial also dispensed."),
    ]:
        session.add(Refraction(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[1],
            refraction_type=rt,
            od_sphere=Decimal(sph_od), od_cylinder=Decimal(cyl_od), od_axis=ax_od,
            od_add=Decimal(add_od) if add_od else None, od_visual_acuity=va_od,
            os_sphere=Decimal(sph_os), os_cylinder=Decimal(cyl_os), os_axis=ax_os,
            os_add=Decimal(add_os) if add_os else None, os_visual_acuity=va_os,
            pd_distance=Decimal("61.5"), pd_near=Decimal("58.5"),
            is_final_rx=final, notes=notes,
            recorded_by_id=STAFF_SARAH_ID if final or rt == RefractionType.MANIFEST else STAFF_MARCUS_ID,
        ))

    session.add(ExamFindings(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[1], patient_id=PATIENT_IDS[1],
        exam_section="anterior_segment", is_normal_wnl=False,
        findings_od={
            "lids_lashes": {"status": "Mild MGD", "severity": "mild", "finding": "Meibomian gland dysfunction, reduced expressibility"},
            "conjunctiva_sclera": {"status": "1+ papillae", "severity": "mild", "finding": "Papillary reaction"},
            "cornea": {"status": "SPK inferior", "severity": "mild", "finding": "Punctate staining inferior 1/3 on NaFl"},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "Clear", "severity": None, "finding": ""},
            "tear_film": {"status": "Reduced TBUT", "severity": "moderate", "finding": "TBUT 4s OD"},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        findings_os={
            "lids_lashes": {"status": "Mild MGD", "severity": "mild", "finding": "Meibomian gland dysfunction"},
            "conjunctiva_sclera": {"status": "1+ papillae", "severity": "mild", "finding": "Papillary reaction"},
            "cornea": {"status": "Trace SPK inferior", "severity": "trace", "finding": "Trace punctate staining inferior on NaFl"},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "Clear", "severity": None, "finding": ""},
            "tear_film": {"status": "Reduced TBUT", "severity": "moderate", "finding": "TBUT 4s OS"},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        recorded_by_id=STAFF_SARAH_ID,
    ))
    session.add(ExamFindings(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[1], patient_id=PATIENT_IDS[1],
        exam_section="posterior_segment", is_normal_wnl=True,
        findings_od={
            "cup_to_disc_ratio": {"status": "0.35", "severity": None, "finding": ""},
            "optic_nerve": {"status": "Healthy, pink", "severity": None, "finding": ""},
            "macula": {"status": "Flat & intact", "severity": None, "finding": ""},
            "vitreous": {"status": "Clear", "severity": None, "finding": ""},
            "vessels": {"status": "Normal A/V ratio", "severity": None, "finding": ""},
            "periphery": {"status": "Flat & intact", "severity": None, "finding": ""},
        },
        findings_os={
            "cup_to_disc_ratio": {"status": "0.35", "severity": None, "finding": ""},
            "optic_nerve": {"status": "Healthy, pink", "severity": None, "finding": ""},
            "macula": {"status": "Flat & intact", "severity": None, "finding": ""},
            "vitreous": {"status": "Clear", "severity": None, "finding": ""},
            "vessels": {"status": "Normal A/V ratio", "severity": None, "finding": ""},
            "periphery": {"status": "Flat & intact", "severity": None, "finding": ""},
        },
        recorded_by_id=STAFF_SARAH_ID,
    ))

    for code, desc, eye, sev in [
        ("H52.4", "Presbyopia", EyeAffected.OU, "moderate"),
        ("H04.123", "Dry eye syndrome, bilateral", EyeAffected.OU, "mild-moderate"),
        ("H00.019", "Meibomian gland dysfunction", EyeAffected.OU, "mild"),
        ("Z46.0", "Fitting and adjustment of contact lenses", EyeAffected.OU, None),
    ]:
        session.add(Diagnosis(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[1],
            icd10_code=code, description=desc, eye_affected=eye, severity=sev, status="active",
        ))

    session.flush()
    ok("Encounter 2 (Elena Vasquez) created")


def _seed_enc_thornton_series(session: Session) -> None:
    """E3-E5: James Thornton glaucoma suspect — 3 encounters over 12 months."""

    # E3: Initial workup — Jan 2025
    if not session.get(Encounter, ENC_IDS[2]):
        enc_date = datetime.date(2025, 1, 8)
        session.add(Encounter(
            id=ENC_IDS[2], tenant_id=TENANT_ID,
            patient_id=PATIENT_IDS[2], provider_id=STAFF_DUY_ID,
            appointment_id=None, encounter_date=enc_date,
            chief_complaint="Annual exam. Family history of glaucoma. Using Travoprost OD only per previous doctor.",
            assessment_and_plan=(
                "1. Glaucoma suspect — IOP 22/24. C/D 0.65 OD, 0.55 OS (asymmetric). "
                "Pachymetry 521/518um (thin). HVF full. OCT RNFL WNL.\n"
                "2. Start Travoprost 0.004% OS QHS (already on OD).\n"
                "3. Mild nuclear sclerosis OU — not visually significant.\n"
                "4. Follow-up 6 months: IOP, OCT RNFL, HVF."
            ),
            is_finalized=True, finalized_at=_dt(enc_date, 16, 30),
        ))
        session.flush()

        session.add(VitalsAndPretest(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[2],
            iop_od=Decimal("22.0"), iop_os=Decimal("24.0"),
            iop_time=_dt(enc_date, 9), iop_method="goldmann",
            ucva_od="20/40", ucva_os="20/30", bcva_od="20/20", bcva_os="20/20",
            near_va_od="20/25", near_va_os="20/25",
            blood_pressure="142/88", pulse=76,
            pupils_equal_round_reactive=True, relative_afferent_pupillary_defect=False,
            cover_test_notes="Ortho at distance and near.",
            technician_notes="Pachymetry: OD 521um, OS 518um. Thin corneas may underestimate IOP.",
            recorded_by_id=STAFF_MARCUS_ID,
        ))

        for rt, final, notes in [
            (RefractionType.HABITUAL, False, "Current glasses 1yr old. Good acuity."),
            (RefractionType.MANIFEST, True, "No Rx change. Habitual adequate."),
        ]:
            session.add(Refraction(
                id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[2],
                refraction_type=rt,
                od_sphere=Decimal("-1.50"), od_cylinder=Decimal("-1.00"), od_axis=85, od_add=Decimal("2.00"), od_visual_acuity="20/20",
                os_sphere=Decimal("-1.25"), os_cylinder=Decimal("-0.75"), os_axis=95, os_add=Decimal("2.00"), os_visual_acuity="20/20",
                pd_distance=Decimal("65.0"), is_final_rx=final, notes=notes,
                recorded_by_id=STAFF_DUY_ID if final else STAFF_MARCUS_ID,
            ))

        for code, desc, eye in [
            ("H40.001", "Preglaucoma, unspecified, right eye", EyeAffected.OD),
            ("H40.002", "Preglaucoma, unspecified, left eye", EyeAffected.OS),
            ("H25.10", "Age-related nuclear cataract, unspecified eye", EyeAffected.OU),
            ("Z01.01", "Eye exam with abnormal findings", EyeAffected.OU),
        ]:
            session.add(Diagnosis(
                id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[2],
                icd10_code=code, description=desc, eye_affected=eye, status="active",
            ))
        session.flush()
        ok("Encounter 3 (Thornton — initial workup) created")
    else:
        warn("Encounter 3 exists — skipping")

    # E4: 6-month follow-up — Jul 2025
    if not session.get(Encounter, ENC_IDS[3]):
        enc_date = datetime.date(2025, 7, 15)
        session.add(Encounter(
            id=ENC_IDS[3], tenant_id=TENANT_ID,
            patient_id=PATIENT_IDS[2], provider_id=STAFF_DUY_ID,
            appointment_id=None, encounter_date=enc_date,
            chief_complaint="6-month glaucoma follow-up. No visual complaints. Travoprost OU QHS.",
            assessment_and_plan=(
                "1. IOP improved 19/21 (from 22/24). Target <18 not yet reached OS.\n"
                "2. HVF stable. OCT RNFL stable, borderline inferior OD unchanged.\n"
                "3. Continue Travoprost. Consider adding Timolol 0.5% OS if >18 next visit.\n"
                "4. Follow-up 6 months."
            ),
            is_finalized=True, finalized_at=_dt(enc_date, 15),
        ))
        session.flush()

        session.add(VitalsAndPretest(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[3],
            iop_od=Decimal("19.0"), iop_os=Decimal("21.0"),
            iop_time=_dt(enc_date, 9, 30), iop_method="goldmann",
            ucva_od="20/40", ucva_os="20/30", bcva_od="20/20", bcva_os="20/20",
            near_va_od="20/25", near_va_os="20/25",
            blood_pressure="138/84", pulse=72,
            pupils_equal_round_reactive=True, relative_afferent_pupillary_defect=False,
            cover_test_notes="Ortho.", technician_notes="Compliant with Travoprost OU. Mild periorbital darkening noted.",
            recorded_by_id=STAFF_MARCUS_ID,
        ))

        session.add(Refraction(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[3],
            refraction_type=RefractionType.MANIFEST,
            od_sphere=Decimal("-1.50"), od_cylinder=Decimal("-1.00"), od_axis=85, od_add=Decimal("2.00"), od_visual_acuity="20/20",
            os_sphere=Decimal("-1.25"), os_cylinder=Decimal("-0.75"), os_axis=95, os_add=Decimal("2.00"), os_visual_acuity="20/20",
            pd_distance=Decimal("65.0"), is_final_rx=True, notes="Rx stable.",
            recorded_by_id=STAFF_DUY_ID,
        ))

        for code, desc, eye in [
            ("H40.001", "Preglaucoma, right eye", EyeAffected.OD),
            ("H40.002", "Preglaucoma, left eye", EyeAffected.OS),
            ("H25.10", "Nuclear cataract, unspecified eye", EyeAffected.OU),
        ]:
            session.add(Diagnosis(
                id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[3],
                icd10_code=code, description=desc, eye_affected=eye, status="active",
            ))
        session.flush()
        ok("Encounter 4 (Thornton — 6mo follow-up) created")
    else:
        warn("Encounter 4 exists — skipping")

    # E5: 12-month follow-up — Jan 2026 (linked to APPT_IDS[2])
    if not session.get(Encounter, ENC_IDS[4]):
        enc_date = datetime.date(2026, 1, 14)
        session.add(Encounter(
            id=ENC_IDS[4], tenant_id=TENANT_ID,
            patient_id=PATIENT_IDS[2], provider_id=STAFF_DUY_ID,
            appointment_id=APPT_IDS[2], encounter_date=enc_date,
            chief_complaint="12-month glaucoma follow-up. Distance vision slightly blurred OD. Travoprost OU QHS.",
            assessment_and_plan=(
                "1. IOP at target: 17/18. Continue Travoprost OU QHS.\n"
                "2. HVF/OCT stable — no progression over 12 months.\n"
                "3. Myopic shift OD -0.25D. Updated Rx dispensed.\n"
                "4. Nuclear sclerosis 1+ OU — may contribute to shift.\n"
                "5. Follow-up 6 months. Consider gonioscopy."
            ),
            is_finalized=True, finalized_at=_dt(enc_date, 16),
        ))
        session.flush()

        session.add(VitalsAndPretest(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[4],
            iop_od=Decimal("17.0"), iop_os=Decimal("18.0"),
            iop_time=_dt(enc_date, 9, 15), iop_method="goldmann",
            ucva_od="20/50", ucva_os="20/30", bcva_od="20/20", bcva_os="20/20",
            near_va_od="20/25", near_va_os="20/25",
            blood_pressure="134/80", pulse=74,
            pupils_equal_round_reactive=True, relative_afferent_pupillary_defect=False,
            cover_test_notes="Ortho.", technician_notes="Distance blur OD worsening 3mo. Travoprost compliance good.",
            recorded_by_id=STAFF_MARCUS_ID,
        ))

        session.add(Refraction(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[4],
            refraction_type=RefractionType.HABITUAL,
            od_sphere=Decimal("-1.50"), od_cylinder=Decimal("-1.00"), od_axis=85, od_add=Decimal("2.00"), od_visual_acuity="20/30",
            os_sphere=Decimal("-1.25"), os_cylinder=Decimal("-0.75"), os_axis=95, os_add=Decimal("2.00"), os_visual_acuity="20/20",
            pd_distance=Decimal("65.0"), is_final_rx=False, notes="Current glasses — reduced acuity OD.",
            recorded_by_id=STAFF_MARCUS_ID,
        ))
        session.add(Refraction(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[4],
            refraction_type=RefractionType.MANIFEST,
            od_sphere=Decimal("-1.75"), od_cylinder=Decimal("-1.00"), od_axis=85, od_add=Decimal("2.25"), od_visual_acuity="20/20",
            os_sphere=Decimal("-1.25"), os_cylinder=Decimal("-0.75"), os_axis=95, os_add=Decimal("2.25"), os_visual_acuity="20/20",
            pd_distance=Decimal("65.0"), is_final_rx=True,
            notes="Myopic shift OD -0.25D. Nuclear sclerosis may contribute. New Rx dispensed.",
            recorded_by_id=STAFF_DUY_ID,
        ))

        for code, desc, eye in [
            ("H40.001", "Preglaucoma, right eye", EyeAffected.OD),
            ("H40.002", "Preglaucoma, left eye", EyeAffected.OS),
            ("H25.10", "Nuclear cataract, unspecified eye", EyeAffected.OU),
            ("H52.11", "Myopia, right eye", EyeAffected.OD),
        ]:
            session.add(Diagnosis(
                id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[4],
                icd10_code=code, description=desc, eye_affected=eye, status="active",
            ))
        session.flush()
        ok("Encounter 5 (Thornton — 12mo follow-up) created")
    else:
        warn("Encounter 5 exists — skipping")


def _seed_enc_thompson(session: Session) -> None:
    """E6: Barbara Thompson — cataract eval + AMD screening."""
    if session.get(Encounter, ENC_IDS[5]):
        warn("Encounter 6 (Thompson) exists — skipping"); return

    enc_date = datetime.date(2026, 2, 15)
    session.add(Encounter(
        id=ENC_IDS[5], tenant_id=TENANT_ID,
        patient_id=PATIENT_IDS[7], provider_id=STAFF_DUY_ID,
        appointment_id=None, encounter_date=enc_date,
        chief_complaint="Blurry vision OS worsening. History of cataract surgery OD 2024. AMD monitoring.",
        assessment_and_plan=(
            "1. Cataract OS moderate — visually significant. Refer to cataract surgeon when ready.\n"
            "2. IOL OD stable, clear. VA OD 20/20 uncorrected.\n"
            "3. Early dry AMD OU — drusen stable from prior visit. Continue AREDS2.\n"
            "4. Follow-up 6 months or sooner if vision changes."
        ),
        is_finalized=True, finalized_at=_dt(enc_date, 15, 30),
    ))
    session.flush()

    session.add(VitalsAndPretest(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[5],
        iop_od=Decimal("14.0"), iop_os=Decimal("16.0"),
        iop_time=_dt(enc_date, 9, 30), iop_method="icare",
        ucva_od="20/20", ucva_os="20/80", bcva_od="20/20", bcva_os="20/50",
        near_va_od="20/25", near_va_os="20/60",
        blood_pressure="142/86", pulse=78,
        pupils_equal_round_reactive=True, relative_afferent_pupillary_defect=False,
        cover_test_notes="Ortho.", technician_notes="OD is pseudophakic. OS cataract significant.",
        recorded_by_id=STAFF_MARCUS_ID,
    ))

    session.add(ExamFindings(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[5], patient_id=PATIENT_IDS[7],
        exam_section="anterior_segment", is_normal_wnl=False,
        findings_od={
            "lids_lashes": {"status": "Normal", "severity": None, "finding": ""},
            "conjunctiva_sclera": {"status": "White & quiet", "severity": None, "finding": ""},
            "cornea": {"status": "Clear", "severity": None, "finding": ""},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "Pseudophakia", "severity": None, "finding": "Clear PCIOL, well-centered"},
            "tear_film": {"status": "Stable", "severity": None, "finding": ""},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        findings_os={
            "lids_lashes": {"status": "Normal", "severity": None, "finding": ""},
            "conjunctiva_sclera": {"status": "White & quiet", "severity": None, "finding": ""},
            "cornea": {"status": "Clear", "severity": None, "finding": ""},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "2+ nuclear sclerosis", "severity": "moderate", "finding": "2+ NS, 1+ posterior subcapsular cataract"},
            "tear_film": {"status": "Stable", "severity": None, "finding": ""},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        recorded_by_id=STAFF_DUY_ID,
    ))
    session.add(ExamFindings(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[5], patient_id=PATIENT_IDS[7],
        exam_section="posterior_segment", is_normal_wnl=False,
        findings_od={
            "cup_to_disc_ratio": {"status": "0.30", "severity": None, "finding": ""},
            "optic_nerve": {"status": "Healthy, pink", "severity": None, "finding": ""},
            "macula": {"status": "Drusen present", "severity": "mild", "finding": "Few small drusen, no hemorrhage"},
            "vitreous": {"status": "Clear", "severity": None, "finding": ""},
            "vessels": {"status": "Mild arteriolar narrowing", "severity": "mild", "finding": ""},
            "periphery": {"status": "Flat & intact", "severity": None, "finding": ""},
        },
        findings_os={
            "cup_to_disc_ratio": {"status": "0.30", "severity": None, "finding": ""},
            "optic_nerve": {"status": "Healthy, pink", "severity": None, "finding": ""},
            "macula": {"status": "Moderate drusen", "severity": "moderate", "finding": "Moderate drusen, no wet changes"},
            "vitreous": {"status": "Clear", "severity": None, "finding": ""},
            "vessels": {"status": "Mild arteriolar narrowing", "severity": "mild", "finding": ""},
            "periphery": {"status": "Flat & intact", "severity": None, "finding": ""},
        },
        provider_notes="OCT macula: drusen stable. No subretinal fluid. Early dry AMD.",
        recorded_by_id=STAFF_DUY_ID,
    ))

    for code, desc, eye, sev in [
        ("H25.11", "Age-related nuclear cataract, right eye", EyeAffected.OD, None),
        ("H25.12", "Age-related nuclear cataract, left eye", EyeAffected.OS, "moderate"),
        ("H35.31", "Nonexudative age-related macular degeneration", EyeAffected.OU, "early"),
        ("Z96.1", "Pseudophakia — presence of intraocular lens", EyeAffected.OD, None),
    ]:
        session.add(Diagnosis(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[5],
            icd10_code=code, description=desc, eye_affected=eye, severity=sev, status="active",
        ))

    session.flush()
    ok("Encounter 6 (Barbara Thompson) created")


def _seed_enc_david_kim_today(session: Session) -> None:
    """E7: David Kim — today's in-progress exam (digital eye strain, vitals + habitual Rx only)."""
    if session.get(Encounter, ENC_IDS[6]):
        warn("Encounter 7 (David Kim) exists — skipping"); return

    session.add(Encounter(
        id=ENC_IDS[6], tenant_id=TENANT_ID,
        patient_id=PATIENT_IDS[6], provider_id=STAFF_DUY_ID,
        appointment_id=None,  # Walk-in — not in the public schedule
        encounter_date=TODAY,
        chief_complaint="Digital eye strain — headaches with screen use, blurry near vision after prolonged screen time.",
        assessment_and_plan=None,  # In progress — doctor hasn't documented yet
        is_finalized=False,
    ))
    session.flush()

    session.add(VitalsAndPretest(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[6],
        iop_od=Decimal("15.0"), iop_os=Decimal("16.0"),
        iop_time=_dt(TODAY, 11, 10), iop_method="icare",
        ucva_od="20/25", ucva_os="20/25", bcva_od="20/20", bcva_os="20/20",
        near_va_od="20/30", near_va_os="20/30",
        blood_pressure="118/74", pulse=72,
        pupils_equal_round_reactive=True, relative_afferent_pupillary_defect=False,
        cover_test_notes="Ortho at distance and near.",
        technician_notes="Screen use 8-10h/day. Reports reduced blink rate. Last Rx 2 years old. No current glasses worn.",
        recorded_by_id=STAFF_MARCUS_ID,
    ))

    # Habitual and autorefraction captured by tech — manifest not done yet
    for rt, sph_od, cyl_od, ax_od, sph_os, cyl_os, ax_os, va_od, va_os, notes in [
        (RefractionType.HABITUAL, "-0.50", "-0.25", 180, "-0.50", "0.00", 180, "20/25", "20/25", "Old glasses — 2 years ago Rx."),
        (RefractionType.AUTO, "-0.75", "-0.50", 178, "-0.75", "-0.25", 172, None, None, "Topcon KR-800 autorefractor."),
    ]:
        session.add(Refraction(
            id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[6],
            refraction_type=rt,
            od_sphere=Decimal(sph_od), od_cylinder=Decimal(cyl_od), od_axis=ax_od,
            od_visual_acuity=va_od,
            os_sphere=Decimal(sph_os), os_cylinder=Decimal(cyl_os), os_axis=ax_os,
            os_visual_acuity=va_os,
            pd_distance=Decimal("62.0"), is_final_rx=False, notes=notes,
            recorded_by_id=STAFF_MARCUS_ID,
        ))

    # Tech started anterior grid — dry eye suspected
    session.add(ExamFindings(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[6], patient_id=PATIENT_IDS[6],
        exam_section="anterior_segment", is_normal_wnl=False,
        findings_od={
            "lids_lashes": {"status": "Normal", "severity": None, "finding": ""},
            "conjunctiva_sclera": {"status": "White & quiet", "severity": None, "finding": "Trace injection inferior"},
            "cornea": {"status": "Clear", "severity": None, "finding": "Trace SPK inferior OD on NaFl"},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "Clear", "severity": None, "finding": ""},
            "tear_film": {"status": "Reduced TBUT", "severity": "mild", "finding": "TBUT ~7s OD"},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        findings_os={
            "lids_lashes": {"status": "Normal", "severity": None, "finding": ""},
            "conjunctiva_sclera": {"status": "White & quiet", "severity": None, "finding": "Trace injection inferior"},
            "cornea": {"status": "Clear", "severity": None, "finding": "Trace SPK inferior OS on NaFl"},
            "anterior_chamber": {"status": "Deep & quiet", "severity": None, "finding": ""},
            "iris": {"status": "Flat, normal architecture", "severity": None, "finding": ""},
            "lens": {"status": "Clear", "severity": None, "finding": ""},
            "tear_film": {"status": "Reduced TBUT", "severity": "mild", "finding": "TBUT ~8s OS"},
            "angles": {"status": "Open (Grade 4)", "severity": None, "finding": ""},
        },
        recorded_by_id=STAFF_MARCUS_ID,
    ))

    session.flush()
    ok("Encounter 7 (David Kim — in progress) created")


def _seed_enc_donovan_today(session: Session) -> None:
    """E8: William Donovan — post-LASIK annual, presbyopia worsening; in-exam today."""
    if session.get(Encounter, ENC_IDS[7]):
        warn("Encounter 8 (Donovan) exists — skipping"); return

    session.add(Encounter(
        id=ENC_IDS[7], tenant_id=TENANT_ID,
        patient_id=PATIENT_IDS[4], provider_id=STAFF_DUY_ID,
        appointment_id=APPT_IDS[4], encounter_date=TODAY,
        is_finalized=False,
    ))

    # Pre-test vitals done — post-LASIK IOP typically normal-low
    session.add(VitalsAndPretest(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[7],
        iop_od=Decimal("13.0"), iop_os=Decimal("14.0"),
        iop_time=_dt(TODAY, 9, 10), iop_method="icare",
    ))

    # Habitual Rx: plano post-LASIK with +1.50 reading add (no cylinder → axis NULL)
    session.add(Refraction(
        id=uuid.uuid4(), tenant_id=TENANT_ID, encounter_id=ENC_IDS[7],
        refraction_type=RefractionType.HABITUAL,
        od_sphere=Decimal("0.00"), od_cylinder=Decimal("0.00"), od_axis=None,
        od_add=Decimal("1.50"), od_visual_acuity="20/20",
        os_sphere=Decimal("0.00"), os_cylinder=Decimal("0.00"), os_axis=None,
        os_add=Decimal("1.50"), os_visual_acuity="20/20",
    ))

    session.flush()
    ok("Encounter 8 (Donovan — in progress) created")


# ── Patient Insurance ────────────────────────────────────────────────────

def _seed_patient_insurance(session: Session) -> None:
    step("Seeding 14 Patient Insurance records (10 primary + 4 secondary)")

    from sqlalchemy import select as _select
    existing = session.execute(
        _select(PatientInsurance).where(PatientInsurance.tenant_id == TENANT_ID)
    ).first()
    if existing:
        warn("Patient insurance already exists — skipping")
        return

    records = [
        # Hargrove (65, diabetic) — Medicare primary
        dict(patient_id=PATIENT_IDS[0], payer_id=PAYER_MEDICARE_ID,
             priority="primary", plan_type="medical",
             subscriber_id="1EG4-TE5-MK72", plan_name="Medicare Part B",
             relationship_to_subscriber="self",
             copay_amount=Decimal("0.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 3, 28)),
        # Vasquez (52, CL wearer) — VSP Vision primary
        dict(patient_id=PATIENT_IDS[1], payer_id=PAYER_VSP_ID,
             priority="primary", plan_type="vision",
             subscriber_id="VSP-8821047", group_number="GRP-4401",
             plan_name="VSP Signature Plan", relationship_to_subscriber="self",
             copay_amount=Decimal("15.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 3, 25)),
        # Thornton (58, glaucoma suspect) — Aetna primary
        dict(patient_id=PATIENT_IDS[2], payer_id=PAYER_AETNA_ID,
             priority="primary", plan_type="medical",
             subscriber_id="W123456789", group_number="AET-8801",
             plan_name="Aetna Choice POS II", relationship_to_subscriber="self",
             copay_amount=Decimal("40.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 3, 30),
             auth_number="AUTH-AET-2026-04471", auth_expiry=datetime.date(2026, 9, 30),
             auth_services="OCT imaging, Visual field testing"),
        # Patel (28) — United Healthcare primary
        dict(patient_id=PATIENT_IDS[3], payer_id=PAYER_UHC_ID,
             priority="primary", plan_type="medical",
             subscriber_id="UHC-44918273", group_number="UHC-2200",
             plan_name="UHC Choice Plus", relationship_to_subscriber="self",
             copay_amount=Decimal("35.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 4, 1)),
        # Donovan (55, post-LASIK) — EyeMed primary
        dict(patient_id=PATIENT_IDS[4], payer_id=PAYER_EYEMED_ID,
             priority="primary", plan_type="vision",
             subscriber_id="EYEM-6612009", group_number="EYM-5501",
             plan_name="EyeMed Access Plan", relationship_to_subscriber="self",
             copay_amount=Decimal("10.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 3, 20)),
        # Santos (45) — Anthem Blue Cross primary
        dict(patient_id=PATIENT_IDS[5], payer_id=PAYER_ANTHEM_ID,
             priority="primary", plan_type="medical",
             subscriber_id="ANT-77301928", group_number="ANT-3301",
             plan_name="Anthem PPO 2000", relationship_to_subscriber="self",
             copay_amount=Decimal("50.00"), eligibility_status="pending_verification"),
        # Kim (32, digital eye strain) — Blue Shield primary
        dict(patient_id=PATIENT_IDS[6], payer_id=PAYER_BLUESHIELD_ID,
             priority="primary", plan_type="medical",
             subscriber_id="BSC-10293847", group_number="BSC-7701",
             plan_name="Blue Shield PPO", relationship_to_subscriber="self",
             copay_amount=Decimal("30.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 3, 31)),
        # Thompson (72, cataracts) — Medicare primary
        dict(patient_id=PATIENT_IDS[7], payer_id=PAYER_MEDICARE_ID,
             priority="primary", plan_type="medical",
             subscriber_id="2KL9-TE4-NP81", plan_name="Medicare Part B",
             relationship_to_subscriber="self",
             copay_amount=Decimal("0.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 3, 15),
             auth_number="AUTH-MCR-2026-08192", auth_expiry=datetime.date(2026, 12, 31),
             auth_services="OCT imaging"),
        # Chen (44) — Humana primary
        dict(patient_id=PATIENT_IDS[8], payer_id=PAYER_HUMANA_ID,
             priority="primary", plan_type="medical",
             subscriber_id="HUM-55019283", group_number="HUM-9901",
             plan_name="Humana Gold Plus HMO", relationship_to_subscriber="self",
             copay_amount=Decimal("25.00"), eligibility_status="expired",
             eligibility_verified_date=datetime.date(2025, 12, 10),
             auth_number="AUTH-HUM-2025-55019", auth_expiry=datetime.date(2026, 3, 31),
             auth_services="Visual field testing, OCT imaging"),
        # Rodriguez (31) — Medi-Cal primary
        dict(patient_id=PATIENT_IDS[9], payer_id=PAYER_MEDICAID_ID,
             priority="primary", plan_type="medical",
             subscriber_id="MC-88271039", plan_name="Medi-Cal Managed Care",
             relationship_to_subscriber="self",
             copay_amount=Decimal("0.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 4, 1)),

        # ── Secondary Insurance ──────────────────────────────────────
        # Hargrove (Medicare primary) → VSP Vision secondary
        dict(patient_id=PATIENT_IDS[0], payer_id=PAYER_VSP_ID,
             priority="secondary", plan_type="vision",
             subscriber_id="VSP-1001-HRG", group_number="GRP-4401",
             plan_name="VSP Signature Plan", relationship_to_subscriber="self",
             copay_amount=Decimal("15.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 3, 28)),
        # Vasquez (VSP primary) → Aetna medical secondary
        dict(patient_id=PATIENT_IDS[1], payer_id=PAYER_AETNA_ID,
             priority="secondary", plan_type="medical",
             subscriber_id="W998877665", group_number="AET-8801",
             plan_name="Aetna Choice POS II", relationship_to_subscriber="spouse",
             copay_amount=Decimal("40.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 3, 25)),
        # Thompson (Medicare primary) → EyeMed Vision secondary
        dict(patient_id=PATIENT_IDS[7], payer_id=PAYER_EYEMED_ID,
             priority="secondary", plan_type="vision",
             subscriber_id="EYEM-9908001", group_number="EYM-5501",
             plan_name="EyeMed Access Plan", relationship_to_subscriber="self",
             copay_amount=Decimal("10.00"), eligibility_status="active",
             eligibility_verified_date=datetime.date(2026, 3, 15)),
        # Santos (Anthem primary) → VSP Vision secondary
        dict(patient_id=PATIENT_IDS[5], payer_id=PAYER_VSP_ID,
             priority="secondary", plan_type="vision",
             subscriber_id="VSP-6634-SNT", group_number="GRP-4401",
             plan_name="VSP Signature Plan", relationship_to_subscriber="self",
             copay_amount=Decimal("15.00"), eligibility_status="pending_verification"),
    ]

    for r in records:
        session.add(PatientInsurance(id=uuid.uuid4(), tenant_id=TENANT_ID, **r))
    session.flush()
    ok(f"Created {len(records)} patient insurance records")


# ── Superbills ────────────────────────────────────────────────────────────

def _seed_superbills(session: Session) -> None:
    step("Seeding 6 Superbills (one per claim status)")

    # S1: Robert Hargrove (E1) — ACCEPTED (Medicare paid)
    if not session.get(Superbill, SB_IDS[0]):
        sb = Superbill(
            id=SB_IDS[0], tenant_id=TENANT_ID,
            encounter_id=ENC_IDS[0], patient_id=PATIENT_IDS[0], provider_id=STAFF_SARAH_ID,
            claim_status=ClaimStatus.ACCEPTED,
            mdm_level="moderate", suggested_em_code="99214",
            total_fee=Decimal("420.00"), created_by_id=STAFF_SARAH_ID,
            billed_payer_id=PAYER_MEDICARE_ID, is_self_pay=False,
        )
        session.add(sb)
        session.flush()
        for cpt, desc, fee, dx in [
            ("92004", "Comprehensive exam, new patient", Decimal("250.00"), ["H52.11", "H52.12"]),
            ("92250", "Fundus photography",              Decimal("75.00"),  ["Z01.01"]),
            ("92083", "Visual field examination",         Decimal("95.00"),  ["H52.11", "H52.12"]),
        ]:
            session.add(SuperbillLineItem(
                id=uuid.uuid4(), tenant_id=TENANT_ID, superbill_id=SB_IDS[0],
                cpt_code=cpt, description=desc, fee=fee, units=1, diagnosis_pointers=dx, modifiers=[],
            ))
        ok("Superbill 1 (Hargrove — ACCEPTED / Medicare)")
    else:
        warn("Superbill 1 exists — skipping")

    # S2: Elena Vasquez (E2) — READY_TO_BILL (posted, waiting to submit to VSP)
    if not session.get(Superbill, SB_IDS[1]):
        sb = Superbill(
            id=SB_IDS[1], tenant_id=TENANT_ID,
            encounter_id=ENC_IDS[1], patient_id=PATIENT_IDS[1], provider_id=STAFF_SARAH_ID,
            claim_status=ClaimStatus.READY_TO_BILL,
            mdm_level="low", suggested_em_code="99213",
            total_fee=Decimal("345.00"), created_by_id=STAFF_SARAH_ID,
            billed_payer_id=PAYER_VSP_ID, is_self_pay=False,
        )
        session.add(sb)
        session.flush()
        for cpt, desc, fee, dx in [
            ("92014", "Comprehensive exam, established", Decimal("185.00"), ["H52.4", "H04.123"]),
            ("92015", "Determination of refractive state", Decimal("45.00"), ["H52.4"]),
            ("99213", "E/M level 3",                     Decimal("115.00"), ["H04.123"]),
        ]:
            session.add(SuperbillLineItem(
                id=uuid.uuid4(), tenant_id=TENANT_ID, superbill_id=SB_IDS[1],
                cpt_code=cpt, description=desc, fee=fee, units=1, diagnosis_pointers=dx, modifiers=[],
            ))
        ok("Superbill 2 (Vasquez — READY_TO_BILL / VSP)")
    else:
        warn("Superbill 2 exists — skipping")

    # S3: James Thornton (E5) — SUBMITTED (waiting on Aetna)
    if not session.get(Superbill, SB_IDS[2]):
        sb = Superbill(
            id=SB_IDS[2], tenant_id=TENANT_ID,
            encounter_id=ENC_IDS[4], patient_id=PATIENT_IDS[2], provider_id=STAFF_DUY_ID,
            claim_status=ClaimStatus.SUBMITTED,
            mdm_level="moderate", suggested_em_code="99214",
            total_fee=Decimal("375.00"), created_by_id=STAFF_DUY_ID,
            billed_payer_id=PAYER_AETNA_ID, is_self_pay=False,
        )
        session.add(sb)
        session.flush()
        for cpt, desc, fee, dx in [
            ("92014", "Comprehensive exam, established", Decimal("185.00"), ["H40.001", "H40.002"]),
            ("92083", "Visual field examination",         Decimal("95.00"),  ["H40.001", "H40.002"]),
            ("92134", "Scanning computerized ophthalmic imaging (OCT)", Decimal("95.00"), ["H40.001"]),
        ]:
            session.add(SuperbillLineItem(
                id=uuid.uuid4(), tenant_id=TENANT_ID, superbill_id=SB_IDS[2],
                cpt_code=cpt, description=desc, fee=fee, units=1, diagnosis_pointers=dx, modifiers=[],
            ))
        ok("Superbill 3 (Thornton — SUBMITTED / Aetna)")
    else:
        warn("Superbill 3 exists — skipping")

    # S4: David Kim (E7) — DRAFT, clean (has payer + ICD → "Post" button)
    if not session.get(Superbill, SB_IDS[3]):
        sb = Superbill(
            id=SB_IDS[3], tenant_id=TENANT_ID,
            encounter_id=ENC_IDS[6], patient_id=PATIENT_IDS[6], provider_id=STAFF_DUY_ID,
            claim_status=ClaimStatus.DRAFT,
            mdm_level="low", suggested_em_code="99213",
            total_fee=Decimal("220.00"), created_by_id=STAFF_DUY_ID,
            billed_payer_id=PAYER_BLUESHIELD_ID, is_self_pay=False,
        )
        session.add(sb)
        session.flush()
        for cpt, desc, fee, dx in [
            ("92014", "Comprehensive exam, established",  Decimal("175.00"), ["H53.14", "H52.4"]),
            ("92015", "Determination of refractive state", Decimal("45.00"),  ["H52.4"]),
        ]:
            session.add(SuperbillLineItem(
                id=uuid.uuid4(), tenant_id=TENANT_ID, superbill_id=SB_IDS[3],
                cpt_code=cpt, description=desc, fee=fee, units=1, diagnosis_pointers=dx, modifiers=[],
            ))
        ok("Superbill 4 (Kim — DRAFT / Blue Shield)")
    else:
        warn("Superbill 4 exists — skipping")

    # S5: William Donovan (E8) — REJECTED (EyeMed denied)
    if not session.get(Superbill, SB_IDS[4]):
        sb = Superbill(
            id=SB_IDS[4], tenant_id=TENANT_ID,
            encounter_id=ENC_IDS[7], patient_id=PATIENT_IDS[4], provider_id=STAFF_DUY_ID,
            claim_status=ClaimStatus.REJECTED,
            mdm_level="low", suggested_em_code="99213",
            total_fee=Decimal("265.00"), created_by_id=STAFF_DUY_ID,
            billed_payer_id=PAYER_EYEMED_ID, is_self_pay=False,
        )
        session.add(sb)
        session.flush()
        for cpt, desc, fee, dx in [
            ("92014", "Comprehensive exam, established",  Decimal("175.00"), ["H52.4", "Z96.1"]),
            ("92015", "Determination of refractive state", Decimal("45.00"),  ["H52.4"]),
            ("92025", "Computerized corneal topography",   Decimal("45.00"),  ["H52.4"]),
        ]:
            session.add(SuperbillLineItem(
                id=uuid.uuid4(), tenant_id=TENANT_ID, superbill_id=SB_IDS[4],
                cpt_code=cpt, description=desc, fee=fee, units=1, diagnosis_pointers=dx, modifiers=[],
            ))
        ok("Superbill 5 (Donovan — REJECTED / EyeMed)")
    else:
        warn("Superbill 5 exists — skipping")

    # S6: Barbara Thompson (E6) — SUBMITTED (Medicare pending)
    if not session.get(Superbill, SB_IDS[5]):
        sb = Superbill(
            id=SB_IDS[5], tenant_id=TENANT_ID,
            encounter_id=ENC_IDS[5], patient_id=PATIENT_IDS[7], provider_id=STAFF_DUY_ID,
            claim_status=ClaimStatus.SUBMITTED,
            mdm_level="moderate", suggested_em_code="99214",
            total_fee=Decimal("310.00"), created_by_id=STAFF_DUY_ID,
            billed_payer_id=PAYER_MEDICARE_ID, is_self_pay=False,
        )
        session.add(sb)
        session.flush()
        for cpt, desc, fee, dx in [
            ("92014", "Comprehensive exam, established", Decimal("175.00"), ["H26.9", "H35.30"]),
            ("92250", "Fundus photography",              Decimal("85.00"),  ["H35.30"]),
            ("92015", "Determination of refractive state", Decimal("45.00"), ["H26.9"]),
        ]:
            session.add(SuperbillLineItem(
                id=uuid.uuid4(), tenant_id=TENANT_ID, superbill_id=SB_IDS[5],
                cpt_code=cpt, description=desc, fee=fee, units=1, diagnosis_pointers=dx, modifiers=[],
            ))
        ok("Superbill 6 (Thompson — SUBMITTED / Medicare)")
    else:
        warn("Superbill 6 exists — skipping")

    session.flush()


# ── Intake Tokens ─────────────────────────────────────────────────────────

def _seed_intake_tokens(session: Session) -> None:
    step("Seeding 2 Intake Tokens")

    tokens = [
        dict(
            id=IT_IDS[0], tenant_id=TENANT_ID,
            appointment_id=APPT_IDS[9],  # Sophia Rodriguez, today 1pm
            token="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
            status="pending",
            expires_at=_dt(datetime.date(2026, 3, 10), 23, 59),
        ),
        dict(
            id=IT_IDS[1], tenant_id=TENANT_ID,
            appointment_id=APPT_IDS[11],  # Thornton, next week
            token="f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
            status="pending",
            expires_at=_dt(datetime.date(2026, 3, 13), 23, 59),
        ),
    ]

    for td in tokens:
        if session.get(IntakeToken, td["id"]):
            warn(f"IntakeToken {td['id']} exists — skipping")
            continue
        session.add(IntakeToken(**td))
        ok(f"Created IntakeToken for appointment {td['appointment_id']}")

    session.flush()


# ── Insurance Payers + Fee Catalog ─────────────────────────────────────────

def _seed_insurance_payers(session: Session) -> None:
    step("Seeding Insurance Payers + Base Fee Catalog")

    CA_PAYERS = [
        {"id": PAYER_VSP_ID,        "name": "VSP Vision Care",          "payer_id": "VSP001"},
        {"id": PAYER_EYEMED_ID,     "name": "EyeMed Vision Care",        "payer_id": "EYEMED"},
        {"id": PAYER_DAVIS_ID,      "name": "Davis Vision",              "payer_id": "DAVIS"},
        {"id": PAYER_MEDICARE_ID,   "name": "Medicare Part B",           "payer_id": "MEDICAREB"},
        {"id": PAYER_MEDICAID_ID,   "name": "Medi-Cal",                  "payer_id": "MEDCAL"},
        {"id": PAYER_AETNA_ID,      "name": "Aetna",                     "payer_id": "AETNA"},
        {"id": PAYER_BLUESHIELD_ID, "name": "Blue Shield of California", "payer_id": "BLUESHIELD"},
        {"id": PAYER_ANTHEM_ID,     "name": "Anthem Blue Cross CA",      "payer_id": "ANTHEM"},
        {"id": PAYER_UHC_ID,        "name": "United Healthcare",         "payer_id": "UHC"},
        {"id": PAYER_HUMANA_ID,     "name": "Humana",                    "payer_id": "HUMANA"},
    ]
    created = 0
    for p_data in CA_PAYERS:
        if session.get(InsurancePayer, p_data["id"]):
            continue
        session.add(InsurancePayer(tenant_id=TENANT_ID, **p_data))
        created += 1
    session.flush()
    if created:
        ok(f"Created {created} insurance payers")
    else:
        warn("Insurance payers already exist — skipping")

    from sqlalchemy import select as _select
    existing_fees = session.execute(
        _select(FeeScheduleItem).where(
            FeeScheduleItem.tenant_id == TENANT_ID,
            FeeScheduleItem.payer_id.is_(None),
        )
    ).first()
    if existing_fees:
        warn("Base fee catalog already exists — skipping")
        return

    CPT_CATALOG_SEED = [
        # E/M codes — New Patient
        ("99202", "Office visit, new patient, straightforward MDM",        Decimal("100.00")),
        ("99203", "Office visit, new patient, low MDM",                    Decimal("135.00")),
        ("99204", "Office visit, new patient, moderate MDM",               Decimal("190.00")),
        ("99205", "Office visit, new patient, high MDM",                   Decimal("255.00")),
        # E/M codes — Established Patient
        ("99212", "Office visit, established patient, straightforward MDM", Decimal("75.00")),
        # Eye examination codes
        ("92002", "Medical examination new patient, intermediate",        Decimal("120.00")),
        ("92004", "Medical examination new patient, comprehensive",        Decimal("175.00")),
        ("92012", "Medical examination established patient, intermediate", Decimal("95.00")),
        ("92014", "Medical examination established patient, comprehensive",Decimal("150.00")),
        ("92015", "Determination of refractive state",                     Decimal("45.00")),
        ("92025", "Computerized corneal topography",                       Decimal("65.00")),
        ("92081", "Visual field examination, limited",                     Decimal("55.00")),
        ("92082", "Visual field examination, intermediate",                Decimal("75.00")),
        ("92083", "Visual field examination, extended",                    Decimal("95.00")),
        ("92134", "Scanning computerized ophthalmic imaging (OCT)",        Decimal("120.00")),
        ("92250", "Fundus photography",                                    Decimal("85.00")),
    ]
    for cpt, desc, fee in CPT_CATALOG_SEED:
        session.add(FeeScheduleItem(
            id=uuid.uuid4(), tenant_id=TENANT_ID, payer_id=None,
            cpt_code=cpt, description=desc, fee=fee,
        ))
    session.flush()
    ok(f"Created {len(CPT_CATALOG_SEED)} base fee catalog entries")


# ══════════════════════════════════════════════════════════════════════════
# Orchestrator
# ══════════════════════════════════════════════════════════════════════════

def main() -> None:
    header("Clarity Optometry EHR — Database Seeder (v1 Public Schema)")
    print(f"  Target URL   : {DATABASE_URL.split('@')[-1]}")
    print(f"  Tenant schema: {TENANT_SCHEMA}")
    print(f"  Reseed mode  : {RESEED}")

    engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

    # Test connectivity
    step("Testing database connectivity")
    try:
        with engine.connect() as probe:
            version = probe.execute(text("SELECT version()")).scalar()
            ok(f"Connected: {version[:60]}…")
    except Exception as exc:
        print(f"\n  {RED}✗  Cannot connect to database:{RESET}")
        print(f"     {exc}")
        sys.exit(1)

    # Phase 1: Public schema
    step("Creating PUBLIC schema tables")
    with engine.connect() as conn:
        PublicBase.metadata.create_all(bind=conn, checkfirst=True)
        conn.commit()
    ok("Public schema tables ready.")

    # Schema patches — add columns that create_all(checkfirst=True) won't auto-add
    step("Applying schema patches")
    with engine.connect() as conn:
        patches = [
            "ALTER TABLE public.encounters ADD COLUMN IF NOT EXISTS optical_status VARCHAR(20)",
        ]
        for patch in patches:
            conn.execute(text(patch))
        conn.commit()
    ok("Schema patches applied.")

    # On RESEED: drop tenant schema first (FK deps), then clean public data
    if RESEED:
        with engine.connect() as conn:
            warn(f"RESEED=true — dropping schema {TENANT_SCHEMA!r}")
            conn.execute(text(f"DROP SCHEMA IF EXISTS {TENANT_SCHEMA} CASCADE"))
            conn.commit()
        with engine.connect() as cleanup_conn:
            warn("RESEED=true — clearing public seed data (CASCADE)")
            cleanup_conn.execute(text("TRUNCATE public.tenant_addons, public.tenants, public.subscription_plans CASCADE"))
            cleanup_conn.commit()

    with Session(engine) as pub_session:
        seed_public_schema(pub_session)

    # Phase 2: Tenant schema
    step(f"Creating tenant schema: {TENANT_SCHEMA!r}")
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {TENANT_SCHEMA}"))
        conn.commit()
    ok(f"Schema '{TENANT_SCHEMA}' exists.")

    step(f"Setting search_path → creating tables in {TENANT_SCHEMA!r}")
    with engine.connect() as tenant_conn:
        tenant_conn.execute(text(f"SET search_path TO {TENANT_SCHEMA}, public"))
        ok(f"search_path = {TENANT_SCHEMA}, public")

        TenantBase.metadata.create_all(bind=tenant_conn, checkfirst=True)
        tenant_conn.commit()
        ok("Tenant schema tables created.")

        with Session(bind=tenant_conn) as tenant_session:
            seed_tenant_schema(tenant_session)

    # Summary
    header("Seed complete — Summary")
    print(f"""
  PUBLIC schema (postgres.public)
  ├── SubscriptionPlans : 3  (core / plus / premium)
  ├── Tenants           : 1  (Sunview Eye Care)
  └── TenantAddons      : 1  (ai_scribe)

  TENANT schema ({TENANT_SCHEMA})
  ├── Staff             : 4  (Dr. Duy Tran, Dr. Sarah Lin, Marcus Webb, Emily Nguyen)
  ├── Patients          : 10 (diverse demographics)
  ├── Appointments      : 13 (1 past + 2 yesterday + 4 today + 4 tomorrow + 2 next week)
  ├── Encounters        : 8  (5 finalized + 2 in-progress + 1 glaucoma series)
  ├── Superbills        : 3  (with CPT line items)
  ├── IntakeTokens      : 2  (pending)
  ├── InsurancePayers   : 10 (CA payers — VSP, EyeMed, Medicare, etc.)
  ├── PatientInsurance  : 14 (10 primary + 4 secondary)
  └── FeeScheduleItems  : 11 (base CPT fee catalog)

  Login: duytran@yahoo.com / 123456 (via Supabase Auth)

  {GREEN}{BOLD}Database is ready for development. ✓{RESET}
""")


if __name__ == "__main__":
    main()
