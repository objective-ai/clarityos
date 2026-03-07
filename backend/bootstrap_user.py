#!/usr/bin/env python3
"""
bootstrap_user.py
Links a real Supabase Auth user to an existing tenant with Staff + TenantMember records.
Uses the Supabase REST API (PostgREST) — no direct DB connection needed.

Usage:
  cd backend/
  python bootstrap_user.py duytran@yahoo.com
  python bootstrap_user.py duytran@yahoo.com --role doctor
  python bootstrap_user.py duytran@yahoo.com --role owner
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

# ── Path setup ──────────────────────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Load .env from backend/ or project root
for env_path in [os.path.join(_SCRIPT_DIR, ".env"), os.path.join(_SCRIPT_DIR, "..", ".env")]:
    if os.path.exists(env_path):
        load_dotenv(env_path)
        break

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg: str) -> None:
    print(f"  {GREEN}[OK]{RESET}  {msg}")

def warn(msg: str) -> None:
    print(f"  {YELLOW}[!!]{RESET}  {msg}")

def fail(msg: str) -> None:
    print(f"  {RED}[FAIL]{RESET}  {msg}")
    sys.exit(1)

def step(msg: str) -> None:
    print(f"\n{BOLD}{CYAN}>>  {msg}{RESET}")


# ── Supabase helpers ────────────────────────────────────────────────────────

def _service_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def supabase_get(path: str) -> list[dict]:
    """GET from Supabase REST API (PostgREST)."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, headers=_service_headers())
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        fail(f"GET {path} returned {e.code}: {e.read().decode()[:300]}")


def supabase_post(table: str, data: dict) -> dict:
    """POST (insert) to Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=_service_headers(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read().decode())
            return rows[0] if rows else {}
    except urllib.error.HTTPError as e:
        fail(f"POST {table} returned {e.code}: {e.read().decode()[:300]}")


def supabase_patch(path: str, data: dict) -> dict:
    """PATCH (update) via Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=_service_headers(), method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read().decode())
            return rows[0] if rows else {}
    except urllib.error.HTTPError as e:
        fail(f"PATCH {path} returned {e.code}: {e.read().decode()[:300]}")


def supabase_rpc(fn_name: str, params: dict) -> any:
    """Call a Supabase RPC function."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}"
    body = json.dumps(params).encode()
    req = urllib.request.Request(url, data=body, headers=_service_headers(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        fail(f"RPC {fn_name} returned {e.code}: {e.read().decode()[:300]}")


def lookup_supabase_user(email: str) -> dict:
    """Look up a Supabase Auth user by email using the Admin API."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")

    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    req = urllib.request.Request(url, headers=_service_headers())

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        fail(f"Supabase Admin API returned {e.code}: {e.read().decode()[:200]}")

    users = data.get("users", [])
    matches = [u for u in users if (u.get("email") or "").lower() == email.lower()]

    if not matches:
        fail(f"No Supabase Auth user found with email: {email}")

    return matches[0]


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Link a Supabase user to a tenant")
    parser.add_argument("email", help="Supabase Auth user email")
    parser.add_argument("--role", default="doctor", help="Role: doctor, technician, receptionist, owner (default: doctor)")
    args = parser.parse_args()

    # Step 1: Look up the Supabase user
    step(f"Looking up Supabase Auth user: {args.email}")
    sb_user = lookup_supabase_user(args.email)
    user_id = sb_user["id"]
    user_email = sb_user.get("email", args.email)
    user_meta = sb_user.get("user_metadata", {})
    full_name = user_meta.get("full_name", "") or user_meta.get("name", "")
    ok(f"Found user: {user_id} ({user_email})")

    # Derive first/last name
    if full_name:
        parts = full_name.strip().split()
        first_name = parts[0]
        last_name = " ".join(parts[1:]) if len(parts) > 1 else ""
    else:
        local = user_email.split("@")[0]
        first_name = local.capitalize()
        last_name = ""

    # Step 2: Find an active tenant
    step("Finding active tenant")
    tenants = supabase_get("tenants?status=eq.active&limit=1")
    if not tenants:
        fail("No active tenant found in public.tenants. Run seed_db.py first.")

    tenant = tenants[0]
    tenant_id = tenant["id"]
    tenant_name = tenant["name"]
    schema_name = tenant["schema_name"]
    ok(f"Found tenant: {tenant_name} (schema: {schema_name}, id: {tenant_id})")

    # Step 3: Upsert tenant_members
    step("Upserting tenant_members record")
    existing_tm = supabase_get(f"tenant_members?user_id=eq.{user_id}&tenant_id=eq.{tenant_id}")

    if existing_tm:
        supabase_patch(
            f"tenant_members?id=eq.{existing_tm[0]['id']}",
            {"role": args.role, "is_active": True},
        )
        ok(f"Updated existing tenant_members record (role={args.role})")
    else:
        supabase_post("tenant_members", {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "tenant_id": tenant_id,
            "role": args.role,
            "is_active": True,
        })
        ok(f"Created tenant_members record (role={args.role})")

    # Step 4: Upsert Staff record in tenant schema
    # PostgREST can't access tenant schemas directly, so we generate SQL
    step(f"Generating Staff record SQL for schema: {schema_name}")
    staff_id = str(uuid.uuid4())

    # Quote schema name for SQL (handles hyphens etc.)
    qs = f'"{schema_name}"'

    staff_sql = f"""-- Run this in Supabase Dashboard -> SQL Editor
-- Creates/updates Staff record for {user_email} in {schema_name}

DO $$
BEGIN
  -- Ensure schema exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = '{schema_name}') THEN
    RAISE EXCEPTION 'Schema {schema_name} does not exist. Run seed_db.py first.';
  END IF;

  -- Upsert staff record
  INSERT INTO {qs}.staff (id, tenant_id, user_id, role, first_name, last_name, is_active)
  VALUES (
    '{staff_id}'::uuid,
    '{tenant_id}'::uuid,
    '{user_id}'::uuid,
    '{args.role}',
    '{first_name}',
    '{last_name}',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    is_active = true;

  -- If there's already a staff record for this user_id, update it instead
  UPDATE {qs}.staff
  SET role = '{args.role}', is_active = true, first_name = '{first_name}', last_name = '{last_name}'
  WHERE user_id = '{user_id}'::uuid
    AND tenant_id = '{tenant_id}'::uuid
    AND id != '{staff_id}'::uuid;
END $$;"""

    ok(f"SQL generated for Staff: {first_name} {last_name}")

    # Step 5: Read and display the hook SQL
    hook_sql_path = os.path.join(_SCRIPT_DIR, "db", "sql", "custom_access_token_hook.sql")
    hook_sql = ""
    if os.path.exists(hook_sql_path):
        with open(hook_sql_path) as f:
            hook_sql = f.read()

    # Print next steps
    step("NEXT STEPS")
    print(f"""
  tenant_members record has been created via REST API.

  Now run the following SQL in {BOLD}Supabase Dashboard -> SQL Editor{RESET}:

  {BOLD}--- PART 1: Staff record ---{RESET}
""")
    print(staff_sql)
    print(f"""
  {BOLD}--- PART 2: JWT Hook (if not already deployed) ---{RESET}
  Paste the contents of: {CYAN}{hook_sql_path}{RESET}
""")
    if hook_sql:
        print(hook_sql)

    print(f"""
  {BOLD}--- PART 3: Enable the hook ---{RESET}
  Dashboard -> Authentication -> Hooks -> Custom Access Token
  Select function: {CYAN}public.custom_access_token_hook{RESET}

  {BOLD}--- PART 4: Verify ---{RESET}
  Log out and log back in with {BOLD}{user_email}{RESET}
  The JWT will now include tenant_id={tenant_id} and role={args.role}

  {GREEN}Done! User {user_email} is linked to tenant "{tenant_name}".{RESET}
""")


if __name__ == "__main__":
    main()
