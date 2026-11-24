DROP POLICY IF EXISTS platform_features_read ON public.platform_features;
CREATE POLICY platform_features_read ON public.platform_features
  FOR SELECT TO authenticated
  USING (public.is_super_admin());