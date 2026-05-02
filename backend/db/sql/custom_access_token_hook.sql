-- Custom Access Token Hook for ClarityOS EHR
-- Injects tenant context into JWT claims from tenant_members + tenant schema staff table.
--
-- SECURITY DEFINER: Required because this function uses dynamic SQL (EXECUTE format)
-- to query the tenant-specific schema (e.g., clinic_sunview.staff). Without it,
-- supabase_auth_admin can't access tenant schemas.
--
-- Setup:
--   1. Run this SQL in Supabase Dashboard -> SQL Editor
--   2. Enable the hook in: Authentication -> Hooks -> Custom Access Token
--      -> Select function: public.custom_access_token_hook
--   3. IMPORTANT: After ANY change to this function, re-toggle the hook in Dashboard:
--      disable -> save -> re-enable -> select function -> save
--
-- Test output:
--   SELECT public.custom_access_token_hook(jsonb_build_object(
--     'user_id', '<user-uuid>',
--     'claims', jsonb_build_object('app_metadata', '{}'::jsonb)
--   ));
--
-- This function runs on every token mint (login + refresh). It looks up the
-- user's active tenant membership and injects tenant context into app_metadata,
-- which flows into the JWT claims read by Next.js middleware and FastAPI backend.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  v_tenant_id uuid;
  v_role text;
  v_schema_name text;
  v_tenant_slug text;
  v_clinic_name text;
  v_plan_name text;
  v_staff_id uuid;
  v_full_name text;
  v_entitlements jsonb;
  v_base_features jsonb;
BEGIN
  claims := event -> 'claims';

  -- Look up the user's active tenant membership
  SELECT tm.tenant_id, tm.role
  INTO v_tenant_id, v_role
  FROM public.tenant_members tm
  WHERE tm.user_id = (event ->> 'user_id')::uuid
    AND tm.is_active = true
  LIMIT 1;

  -- Look up tenant details if membership found
  IF v_tenant_id IS NOT NULL THEN
    SELECT t.schema_name, t.slug, t.name
    INTO v_schema_name, v_tenant_slug, v_clinic_name
    FROM public.tenants t
    WHERE t.id = v_tenant_id;

    -- Look up subscription plan name (defaults to 'Core' if no plan linked)
    v_plan_name := 'Core';
    BEGIN
      SELECT sp.name INTO v_plan_name
      FROM public.subscription_plans sp
      JOIN public.tenants t ON t.plan_id = sp.id
      WHERE t.id = v_tenant_id;
    EXCEPTION WHEN OTHERS THEN
      v_plan_name := 'Core';
    END;

    -- Look up staff record from tenant schema for staff_id and full_name
    BEGIN
      EXECUTE format(
        'SELECT id, first_name || '' '' || last_name FROM %I.staff WHERE user_id = $1 AND is_active = true LIMIT 1',
        v_schema_name
      )
      INTO v_staff_id, v_full_name
      USING (event ->> 'user_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      -- Schema or table might not exist yet
      v_staff_id := NULL;
      v_full_name := NULL;
    END;

    -- Resolve entitlements: union of subscription_plans.base_features_jsonb
    -- and tenant_addons.feature_key for this tenant. Phase 13 introduced
    -- retail_pos as the first true add-on (not bundled into any plan tier).
    v_base_features := '[]'::jsonb;
    BEGIN
      SELECT COALESCE(sp.base_features_jsonb, '[]'::jsonb)
      INTO v_base_features
      FROM public.subscription_plans sp
      JOIN public.tenants t ON t.plan_id = sp.id
      WHERE t.id = v_tenant_id;
    EXCEPTION WHEN OTHERS THEN
      v_base_features := '[]'::jsonb;
    END;

    -- Union add-on feature_keys (one row per active add-on for this tenant).
    SELECT COALESCE(
      jsonb_agg(DISTINCT feat),
      '[]'::jsonb
    )
    INTO v_entitlements
    FROM (
      SELECT jsonb_array_elements_text(v_base_features) AS feat
      UNION
      SELECT ta.feature_key AS feat
      FROM public.tenant_addons ta
      WHERE ta.tenant_id = v_tenant_id
    ) AS combined;

    -- Inject tenant context into app_metadata.
    -- entitlements is the server-authoritative union of:
    --   subscription_plans.base_features_jsonb (PLAN_FEATURES tier)
    -- ∪ public.tenant_addons.feature_key (per-tenant add-ons, e.g. retail_pos)
    -- FE session-hydrator (lib/auth/session-hydrator.ts) prefers this array
    -- over the PLAN_FEATURES fallback when present.
    --
    -- IMPORTANT: subscription_plans.base_features_jsonb in seed_db.py MUST
    -- mirror backend/core/entitlements.py:PLAN_FEATURES exactly. Otherwise the
    -- moment this hook lands, Plus/Premium tenants regress on messaging access
    -- (the FE flips from PLAN_FEATURES fallback to rawEntitlements). Phase
    -- 13-15 reconciles this in the same commit set.
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', v_tenant_id::text,
        'tenant_slug', COALESCE(v_tenant_slug, 'clinic'),
        'role', v_role,
        'schema_name', COALESCE(v_schema_name, 'public'),
        'clinic_name', COALESCE(v_clinic_name, 'ClarityOS Clinic'),
        'plan_name', COALESCE(v_plan_name, 'Core'),
        'staff_id', COALESCE(v_staff_id::text, ''),
        'full_name', COALESCE(v_full_name, ''),
        'entitlements', COALESCE(v_entitlements, '[]'::jsonb)
      )
    );
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

-- Security: Only supabase_auth_admin should be able to execute this hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- The hook reads these tables — supabase_auth_admin needs SELECT access
GRANT SELECT ON public.tenant_members TO supabase_auth_admin;
GRANT SELECT ON public.tenants TO supabase_auth_admin;
GRANT SELECT ON public.subscription_plans TO supabase_auth_admin;
GRANT SELECT ON public.tenant_addons TO supabase_auth_admin;
GRANT USAGE ON SCHEMA clinic_sunview TO supabase_auth_admin;
GRANT SELECT ON clinic_sunview.staff TO supabase_auth_admin;
