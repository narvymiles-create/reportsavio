
-- Fix: privilege escalation via school_members self-insert
DROP POLICY IF EXISTS insert_own_membership ON public.school_members;
CREATE POLICY manage_members_insert ON public.school_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  );

-- Fix: lock down SECURITY DEFINER trigger/helper functions that should never be callable by clients
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_school_id_from_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_learner_registration() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_core_subjects_limit() FROM PUBLIC, anon, authenticated;
