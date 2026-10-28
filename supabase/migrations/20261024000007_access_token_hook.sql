-- Migration: 20261024000007_access_token_hook.sql
-- Custom Access Token Hook to inject user_role and user_status claims into JWT

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claims jsonb;
  user_role_val user_role;
  user_status_val profile_status;
BEGIN
  -- Lookup profile attributes
  SELECT role, status INTO user_role_val, user_status_val
  FROM public.profiles
  WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  IF user_role_val IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role_val::text));
  ELSE
    claims := jsonb_set(claims, '{user_role}', '"student"'::jsonb);
  END IF;

  IF user_status_val IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_status}', to_jsonb(user_status_val::text));
  ELSE
    claims := jsonb_set(claims, '{user_status}', '"active"'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Grant execution permissions strictly to supabase_auth_admin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
