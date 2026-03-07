#!/usr/bin/env python3
"""
enable_premium.py
Inserts a Premium subscription plan (if missing) and links the tenant to it.
Also redeploys the updated JWT hook that injects plan_name.

Usage:
  cd backend/
  python enable_premium.py
"""
from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
for env_path in [os.path.join(_SCRIPT_DIR, ".env"), os.path.join(_SCRIPT_DIR, "..", ".env")]:
    if os.path.exists(env_path):
        load_dotenv(env_path)
        break

DATABASE_URL = os.getenv("DATABASE_URL", "").replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
).replace(
    "postgresql://", "postgresql+psycopg2://"
)

TENANT_ID = "b0000000-0000-0000-0000-000000000001"
PREMIUM_PLAN_ID = "p0000000-0000-0000-0000-000000000003"

GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):  print(f"  {GREEN}[OK]{RESET}  {msg}")
def step(msg): print(f"\n{BOLD}{CYAN}>>  {msg}{RESET}")


def main():
    from sqlalchemy import create_engine, text
    engine = create_engine(DATABASE_URL)

    # Step 1: Insert Premium plan if it doesn't exist
    step("Ensuring Premium subscription plan exists")
    with engine.begin() as conn:
        existing = conn.execute(text(
            "SELECT id FROM public.subscription_plans WHERE name = 'Premium' LIMIT 1"
        )).fetchone()

        if existing:
            plan_id = str(existing[0])
            ok(f"Premium plan already exists (id={plan_id})")
        else:
            conn.execute(text("""
                INSERT INTO public.subscription_plans (id, name, slug, price_cents, interval, base_features_jsonb)
                VALUES (
                    CAST(:plan_id AS uuid),
                    'Premium',
                    'premium',
                    29900,
                    'monthly',
                    '["scheduling","patient_demographics","basic_exam","icd10_diagnoses","billing_export","multi_provider","ai_scribe","advanced_analytics","equipment_import"]'::jsonb
                )
                ON CONFLICT (slug) DO NOTHING
            """), {"plan_id": PREMIUM_PLAN_ID})
            plan_id = PREMIUM_PLAN_ID
            ok(f"Inserted Premium plan (id={plan_id})")

    # Step 2: Link tenant to Premium plan
    step("Linking tenant to Premium plan")
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE public.tenants
            SET plan_id = (SELECT id FROM public.subscription_plans WHERE name = 'Premium' LIMIT 1)
            WHERE id = CAST(:tenant_id AS uuid)
        """), {"tenant_id": TENANT_ID})
        ok(f"Tenant {TENANT_ID} linked to Premium plan")

    # Step 3: Redeploy JWT hook
    step("Redeploying Custom Access Token Hook")
    hook_sql_path = os.path.join(_SCRIPT_DIR, "db", "sql", "custom_access_token_hook.sql")
    with open(hook_sql_path) as f:
        hook_sql = f.read()

    with engine.begin() as conn:
        conn.execute(text(hook_sql))
    ok("JWT hook function deployed with plan_name support")

    step("DONE")
    print(f"""
  {GREEN}Premium plan enabled!{RESET}

  The JWT hook now injects plan_name into app_metadata.
  Log out and log back in to get a new JWT with plan_name: "Premium".
  AI Scribe and other premium features will then be available.
""")


if __name__ == "__main__":
    main()
