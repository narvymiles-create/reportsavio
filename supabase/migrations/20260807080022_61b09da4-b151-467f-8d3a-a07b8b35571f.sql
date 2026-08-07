-- 1) Remove overly permissive INSERT policy on schools.
-- School creation goes only through create_school_for_current_user() (SECURITY DEFINER).
DROP POLICY IF EXISTS "auth_insert_schools" ON public.schools;

-- 2) Revoke EXECUTE from anon on all SECURITY DEFINER functions.
REVOKE ALL ON FUNCTION public.create_school_for_current_user(text, text, text, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.current_user_school_id() FROM anon, public;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM anon, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.set_school_id_from_user() FROM anon, authenticated, public;

-- 3) Grant back only what the app genuinely needs.
GRANT EXECUTE ON FUNCTION public.create_school_for_current_user(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_school_for_current_user(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_school_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_school_id_from_user() TO service_role;