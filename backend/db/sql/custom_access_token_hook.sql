-- Custom Access Token Hook for ClarityOS EHR
-- Injects tenant_id and role into JWT claims from tenant_members table.
--
-- Setup:
--   1. Run this SQL in Supabase Dashboard -> SQL Editor
--   2. Enable the hook in: Authentication -> Hooks -> Custom Access Token
--      -> Select function: public.custom_access_token_hook
--
-- This function runs on every token mint (login + refresh). It looks up the
-- user's active tenant membership and injects tenant_id and role into
-- app_metadata, which then flows into the JWT claims read by both the
-- Next.js middleware and the FastAPI backend.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_tenant_id uuid;
  v_role text;
BEGIN
  claims := event -> 'claims';

  -- Look up the user's active tenant membership
  SELECT tm.tenant_id, tm.role
  INTO v_tenant_id, v_role
  FROM public.tenant_members tm
  WHERE tm.global_user_id = (event ->> 'user_id')::uuid
    AND tm.is_active = true
  LIMIT 1;

  -- Inject tenant_id and role into app_metadata if membership found
  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}'::jsonb) ||
      jsonb_build_object(
        'tenant_id', v_tenant_id::text,
        'role', v_role
      )
    );
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

-- Security: Only supabase_auth_admin should be able to execute this hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
