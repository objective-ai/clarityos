#!/usr/bin/env python3
"""
provision_user.py
Directly provisions a Supabase Auth user into a tenant via SQL.
Creates the tenant schema if missing, fixes schema_name, and inserts Staff.

Usage:
  cd backend/
  python provision_user.py duytran@yahoo.com --role owner
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
import urllib.request
import urllib.error

from dotenv import load_dotenv

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
for env_path in [os.path.join(_SCRIPT_DIR, ".env"), os.path.join(_SCRIPT_DIR, "..", ".env")]:
    if os.path.exists(env_path):
        load_dotenv(env_path)
        break

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "").replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
).replace(
    "postgresql://", "postgresql+psycopg2://"
)

TENANT_SCHEMA = "clinic_sunview"
TENANT_ID = "b0000000-0000-0000-0000-000000000001"

GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):  print(f"  {GREEN}[OK]{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}[!!]{RESET}  {msg}")
def fail(msg): print(f"  {RED}[FAIL]{RESET}  {msg}"); sys.exit(1)
def step(msg): print(f"\n{BOLD}{CYAN}>>  {msg}{RESET}")


def _svc_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def lookup_user(email):
    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    req = urllib.request.Request(url, headers=_svc_headers())
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
    users = data.get("users", [])
    matches = [u for u in users if (u.get("email") or "").lower() == email.lower()]
    if not matches:
        fail(f"No Supabase Auth user with email: {email}")
    return matches[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    parser.add_argument("--role", default="owner")
    args = parser.parse_args()

    # Need psycopg2 + sqlalchemy for direct DB access
    try:
        from sqlalchemy import create_engine, text
    except ImportError:
        fail("pip install sqlalchemy psycopg2-binary")

    if not DATABASE_URL:
        fail("DATABASE_URL not set in .env")

    # Step 1: Look up Supabase Auth user
    step(f"Looking up Supabase Auth user: {args.email}")
    sb_user = lookup_user(args.email)
    user_id = sb_user["id"]
    user_email = sb_user.get("email", args.email)
    user_meta = sb_user.get("user_metadata", {})
    full_name = user_meta.get("full_name", "") or user_meta.get("name", "")
    if full_name:
        parts = full_name.strip().split()
        first_name, last_name = parts[0], " ".join(parts[1:]) if len(parts) > 1 else ""
    else:
        first_name, last_name = user_email.split("@")[0].capitalize(), ""
    ok(f"Found: {user_id} ({user_email}) -> {first_name} {last_name}")

    # Step 2: Connect to DB and provision everything
    step("Connecting to database")
    engine = create_engine(DATABASE_URL, echo=False)

    with engine.begin() as conn:
        # 2a: Fix tenant schema_name
        step(f"Fixing tenant schema_name -> {TENANT_SCHEMA}")
        conn.execute(text("""
            UPDATE tenants
            SET schema_name = :schema_name
            WHERE id = :tenant_id        """), {"schema_name": TENANT_SCHEMA, "tenant_id": TENANT_ID})
        ok(f"Tenant schema_name set to '{TENANT_SCHEMA}'")

        # 2b: Create the tenant schema if it doesn't exist
        step(f"Creating schema '{TENANT_SCHEMA}' if not exists")
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{TENANT_SCHEMA}"'))
        ok(f"Schema '{TENANT_SCHEMA}' ready")

        # 2c: Set search_path and create tables
        step("Creating tenant tables via search_path")
        conn.execute(text(f'SET search_path TO "{TENANT_SCHEMA}", public'))

        # Create the staff_role enum type if not exists
        exists = conn.execute(text("""
            SELECT 1 FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'staff_role' AND n.nspname = :schema
        """), {"schema": TENANT_SCHEMA}).fetchone()

        if not exists:
            conn.execute(text(f"""
                CREATE TYPE "{TENANT_SCHEMA}".staff_role AS ENUM
                ('doctor', 'technician', 'receptionist', 'owner')
            """))
            ok("Created staff_role enum")
        else:
            ok("staff_role enum exists")

        # Create staff table if not exists
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{TENANT_SCHEMA}".staff (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                user_id UUID UNIQUE,
                role "{TENANT_SCHEMA}".staff_role NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                license_number VARCHAR(100),
                npi_number VARCHAR(10),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        ok("Staff table ready")

        # Create other essential tables (patients, appointments, encounters, etc.)
        # We need these for the app to function

        # sex enum
        exists = conn.execute(text("""
            SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'sex' AND n.nspname = :schema
        """), {"schema": TENANT_SCHEMA}).fetchone()
        if not exists:
            conn.execute(text(f"""
                CREATE TYPE "{TENANT_SCHEMA}".sex AS ENUM
                ('male', 'female', 'other', 'prefer_not_to_say')
            """))

        # appointment_status enum
        exists = conn.execute(text("""
            SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'appointment_status' AND n.nspname = :schema
        """), {"schema": TENANT_SCHEMA}).fetchone()
        if not exists:
            conn.execute(text(f"""
                CREATE TYPE "{TENANT_SCHEMA}".appointment_status AS ENUM
                ('scheduled', 'checked_in', 'in_exam', 'completed', 'cancelled', 'no_show')
            """))

        # appointment_type enum
        exists = conn.execute(text("""
            SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'appointment_type' AND n.nspname = :schema
        """), {"schema": TENANT_SCHEMA}).fetchone()
        if not exists:
            conn.execute(text(f"""
                CREATE TYPE "{TENANT_SCHEMA}".appointment_type AS ENUM
                ('comprehensive_eye_exam', 'follow_up', 'contact_lens_fitting',
                 'medical_eye_exam', 'pediatric_exam', 'emergency', 'pre_op', 'post_op')
            """))

        # encounter_status enum
        exists = conn.execute(text("""
            SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = 'encounter_status' AND n.nspname = :schema
        """), {"schema": TENANT_SCHEMA}).fetchone()
        if not exists:
            conn.execute(text(f"""
                CREATE TYPE "{TENANT_SCHEMA}".encounter_status AS ENUM
                ('pre_test', 'in_exam', 'finalized')
            """))

        # patients table
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{TENANT_SCHEMA}".patients (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                dob DATE NOT NULL,
                sex "{TENANT_SCHEMA}".sex NOT NULL DEFAULT 'prefer_not_to_say',
                email VARCHAR(255),
                phone VARCHAR(20),
                address_line1 VARCHAR(255),
                address_line2 VARCHAR(255),
                city VARCHAR(100),
                state VARCHAR(50),
                zip_code VARCHAR(20),
                insurance_provider VARCHAR(200),
                insurance_policy_number VARCHAR(100),
                emergency_contact_name VARCHAR(200),
                emergency_contact_phone VARCHAR(20),
                medical_history_notes TEXT,
                allergies TEXT,
                current_medications TEXT,
                is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                deleted_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        ok("Patients table ready")

        # appointments table
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{TENANT_SCHEMA}".appointments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES "{TENANT_SCHEMA}".patients(id),
                provider_id UUID NOT NULL REFERENCES "{TENANT_SCHEMA}".staff(id),
                appointment_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME,
                appointment_type "{TENANT_SCHEMA}".appointment_type NOT NULL DEFAULT 'comprehensive_eye_exam',
                status "{TENANT_SCHEMA}".appointment_status NOT NULL DEFAULT 'scheduled',
                reason_for_visit TEXT,
                notes TEXT,
                checked_in_at TIMESTAMPTZ,
                encounter_id UUID,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        ok("Appointments table ready")

        # encounters table
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{TENANT_SCHEMA}".encounters (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                patient_id UUID NOT NULL REFERENCES "{TENANT_SCHEMA}".patients(id),
                provider_id UUID NOT NULL REFERENCES "{TENANT_SCHEMA}".staff(id),
                appointment_id UUID,
                encounter_date DATE NOT NULL DEFAULT CURRENT_DATE,
                status "{TENANT_SCHEMA}".encounter_status NOT NULL DEFAULT 'pre_test',
                chief_complaint TEXT,
                assessment TEXT,
                plan TEXT,
                signed_by_name VARCHAR(200),
                signed_at TIMESTAMPTZ,
                ai_summary_text TEXT,
                ai_summary_generated_at TIMESTAMPTZ,
                is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                deleted_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        ok("Encounters table ready")

        # audit_logs table
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS "{TENANT_SCHEMA}".audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                encounter_id UUID,
                user_id UUID,
                action VARCHAR(100) NOT NULL,
                entity_type VARCHAR(100),
                entity_id UUID,
                old_values JSONB,
                new_values JSONB,
                ip_address VARCHAR(45),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        ok("Audit logs table ready")

        # 2d: Upsert Staff record for this user
        step(f"Upserting Staff record for {first_name} {last_name}")
        staff_id = str(uuid.uuid4())

        existing_staff = conn.execute(text(f"""
            SELECT id FROM "{TENANT_SCHEMA}".staff
            WHERE user_id = CAST(:user_id AS uuid)
        """), {"user_id": user_id}).fetchone()

        if existing_staff:
            conn.execute(text(f"""
                UPDATE "{TENANT_SCHEMA}".staff
                SET role = CAST(:role AS "{TENANT_SCHEMA}".staff_role),
                    first_name = :first_name,
                    last_name = :last_name,
                    is_active = true,
                    updated_at = now()
                WHERE user_id = CAST(:user_id AS uuid)
            """), {
                "role": args.role,
                "first_name": first_name,
                "last_name": last_name,
                "user_id": user_id,
            })
            ok(f"Updated existing Staff record (role={args.role})")
        else:
            conn.execute(text(f"""
                INSERT INTO "{TENANT_SCHEMA}".staff
                    (id, tenant_id, user_id, role, first_name, last_name, is_active)
                VALUES (
                    CAST(:staff_id AS uuid), CAST(:tenant_id AS uuid), CAST(:user_id AS uuid),
                    CAST(:role AS "{TENANT_SCHEMA}".staff_role),
                    :first_name, :last_name, true
                )
            """), {
                "staff_id": staff_id,
                "tenant_id": TENANT_ID,
                "user_id": user_id,
                "role": args.role,
                "first_name": first_name,
                "last_name": last_name,
            })
            ok(f"Created Staff record: {staff_id} (role={args.role})")

        # 2e: Upsert tenant_members record
        step("Upserting tenant_members record")
        existing_tm = conn.execute(text("""
            SELECT id FROM tenant_members
            WHERE user_id = CAST(:user_id AS uuid) AND tenant_id = CAST(:tenant_id AS uuid)
        """), {"user_id": user_id, "tenant_id": TENANT_ID}).fetchone()

        if existing_tm:
            conn.execute(text("""
                UPDATE tenant_members
                SET role = :role, is_active = true
                WHERE user_id = CAST(:user_id AS uuid) AND tenant_id = CAST(:tenant_id AS uuid)
            """), {"role": args.role, "user_id": user_id, "tenant_id": TENANT_ID})
            ok("Updated tenant_members")
        else:
            conn.execute(text("""
                INSERT INTO tenant_members (id, user_id, tenant_id, role, is_active)
                VALUES (CAST(:id AS uuid), CAST(:user_id AS uuid), CAST(:tenant_id AS uuid), :role, true)
            """), {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "tenant_id": TENANT_ID,
                "role": args.role,
            })
            ok("Created tenant_members record")

    # Step 3: Deploy JWT hook
    step("Deploying Custom Access Token Hook")
    hook_sql_path = os.path.join(_SCRIPT_DIR, "db", "sql", "custom_access_token_hook.sql")
    if os.path.exists(hook_sql_path):
        with open(hook_sql_path) as f:
            hook_sql = f.read()

        with engine.begin() as conn:
            conn.execute(text(hook_sql))
        ok("JWT hook function deployed")
    else:
        warn(f"Hook SQL not found at {hook_sql_path}")

    # Done
    step("DONE")
    print(f"""
  {GREEN}All provisioning complete!{RESET}

  Tenant:  Sunview Eye Care
  Schema:  {TENANT_SCHEMA}
  User:    {user_email} ({user_id})
  Role:    {args.role}
  Staff:   {first_name} {last_name}

  {BOLD}Remaining manual step:{RESET}
  Go to Supabase Dashboard -> Authentication -> Hooks -> Custom Access Token
  Select function: {CYAN}public.custom_access_token_hook{RESET}

  Then {BOLD}log out and log back in{RESET} so the new JWT takes effect.
""")


if __name__ == "__main__":
    main()
