# Supabase Security Advisor Audit (2026-03-06)

**Status:** Deferred to pre-launch — no real risk while in localhost dev
**Project:** `iedzzcokfwnbyfyevjoz` (ClarityOS)

## Findings Summary

| # | Severity | Finding | Real Risk | Action |
|---|----------|---------|-----------|--------|
| 1 | ERROR | RLS disabled on `tenants` | HIGH — anon can read/modify all tenant records via PostgREST | Enable RLS + add policies |
| 2 | ERROR | RLS disabled on `tenant_members` | CRITICAL — anon could add themselves to any tenant | Enable RLS + add policies |
| 3 | ERROR | RLS disabled on `subscription_plans` | MEDIUM — read-only reference data, but anon has write grants | Enable RLS + read-only policy |
| 4 | ERROR | RLS disabled on `tenant_addons` | MEDIUM — anon can modify addon subscriptions | Enable RLS + add policies |
| 5 | ERROR | RLS disabled on `audit_log` | CRITICAL — anon can SELECT patient_id (ePHI), TRUNCATE audit trail | Enable RLS + add policies |
| 6 | ERROR | RLS disabled on `superbills` | HIGH — anon can read patient_id and billing data | Enable RLS + add policies |
| 7 | ERROR | RLS disabled on `superbill_line_items` | HIGH — anon can read/delete CPT codes and fees | Enable RLS + add policies |
| 8 | WARN | 3 functions missing `search_path` pin | LOW-MEDIUM — schema poisoning risk | `ALTER FUNCTION ... SET search_path = ''` |
| 9 | WARN | Leaked password protection disabled | MEDIUM — users can set breached passwords | Enable in Supabase dashboard |

## Why Safe to Defer

- App is localhost dev only, not deployed
- Frontend doesn't use Supabase client for data — all data flows through BFF -> FastAPI (service_role, bypasses RLS)
- PostgREST exploit requires anon key + network access to Supabase instance

## Pre-Launch Remediation (single SQL migration)

```sql
-- ============================================================
-- Supabase Security Advisor Remediation
-- Fixes: 7 RLS errors, 3 search_path warnings
-- ============================================================

-- 1. Enable RLS on all unprotected public tables

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.superbills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.superbill_line_items ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies

CREATE POLICY "plans_read_only" ON public.subscription_plans
  FOR SELECT USING (true);

CREATE POLICY "tenant_read_own" ON public.tenants
  FOR SELECT USING (
    id = (((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid)
  );

CREATE POLICY "members_read_own" ON public.tenant_members
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "addons_read_own" ON public.tenant_addons
  FOR SELECT USING (
    tenant_id = (((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid)
  );

CREATE POLICY "audit_log_tenant_read" ON public.audit_log
  FOR SELECT TO authenticated USING (
    tenant_id = (((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid)
  );

CREATE POLICY "superbills_tenant" ON public.superbills
  FOR ALL USING (
    tenant_id = (((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid)
  );

CREATE POLICY "line_items_tenant" ON public.superbill_line_items
  FOR ALL USING (
    tenant_id = (((auth.jwt() -> 'app_metadata') ->> 'tenant_id')::uuid)
  );

-- 3. Revoke dangerous grants from anon

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenants FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_members FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscription_plans FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_addons FROM anon;
REVOKE ALL ON public.audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.superbills FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.superbill_line_items FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscription_plans FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenants FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_members FROM authenticated;

-- 4. Fix function search_path warnings

ALTER FUNCTION public.custom_access_token_hook(jsonb)
  SET search_path = '';

ALTER FUNCTION public.sync_tenant_to_app_metadata()
  SET search_path = '';

ALTER FUNCTION public.set_updated_at()
  SET search_path = '';
```

## Dashboard Action (Manual)

- Enable "Leaked password protection" in Supabase Dashboard > Authentication > Settings > Password Security

## Impact Assessment

| Component | Impact |
|-----------|--------|
| FastAPI backend | None — uses `service_role` key which bypasses RLS |
| Frontend Supabase client | None — frontend only uses Supabase for auth (login/signup), not direct table access |
| Auth hook | None — `custom_access_token_hook` already uses fully-qualified `public.*` table refs |
| PostgREST API | Locked down — unauthorized access to sensitive tables blocked |

## Verification (after applying)

1. Re-run Supabase Security Advisor — should show 0 errors, 1 warning (leaked password, requires dashboard)
2. Test login still works (auth hook functional with `search_path = ''`)
3. Verify FastAPI endpoints still work (service_role bypasses RLS)
4. Confirm PostgREST returns empty for protected tables with anon key
