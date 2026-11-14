DROP POLICY IF EXISTS "assessment_marks school insert" ON public.assessment_marks;
DROP POLICY IF EXISTS "assessment_marks school update" ON public.assessment_marks;
DROP POLICY IF EXISTS "assessment_marks school delete" ON public.assessment_marks;
CREATE POLICY "assessment_marks admin insert" ON public.assessment_marks FOR INSERT TO authenticated
  WITH CHECK ((school_id = current_user_school_id() AND has_role(auth.uid(),'admin'::app_role)) OR is_super_admin());
CREATE POLICY "assessment_marks admin update" ON public.assessment_marks FOR UPDATE TO authenticated
  USING ((school_id = current_user_school_id() AND has_role(auth.uid(),'admin'::app_role)) OR is_super_admin())
  WITH CHECK ((school_id = current_user_school_id() AND has_role(auth.uid(),'admin'::app_role)) OR is_super_admin());
CREATE POLICY "assessment_marks admin delete" ON public.assessment_marks FOR DELETE TO authenticated
  USING ((school_id = current_user_school_id() AND has_role(auth.uid(),'admin'::app_role)) OR is_super_admin());