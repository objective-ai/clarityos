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

    -- Inject tenant context into app_metadata
    -- Note: entitlements are derived client-side from plan_name via PLAN_FEATURES map
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
        'full_name', COALESCE(v_full_name, '')
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
GRANT USAGE ON SCHEMA clinic_sunview TO supabase_auth_admin;
GRANT SELECT ON clinic_sunview.staff TO supabase_auth_admin;
