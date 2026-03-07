-- Migration: Add slug column to tenants table
-- Run in Supabase Dashboard -> SQL Editor

-- Step 1: Add column (nullable first for backfill)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS slug varchar(100);

-- Step 2: Backfill from schema_name (strip 'tenant_' prefix, replace _ with -)
UPDATE public.tenants
SET slug = REPLACE(
  REGEXP_REPLACE(schema_name, '^tenant_', ''),
  '_', '-'
)
WHERE slug IS NULL;

-- Step 3: Make NOT NULL + unique
ALTER TABLE public.tenants ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_slug ON public.tenants (slug);

-- Step 4: Grant access for the auth hook
GRANT SELECT ON public.tenants TO supabase_auth_admin;
