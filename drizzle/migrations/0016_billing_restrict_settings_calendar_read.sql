DROP POLICY IF EXISTS billing_settings_read ON public.billing_settings;
CREATE POLICY billing_settings_read ON public.billing_settings FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.is_school_billing_admin(public.current_user_school_id()));

DROP POLICY IF EXISTS billing_calendar_read ON public.billing_calendar;
CREATE POLICY billing_calendar_read ON public.billing_calendar FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.is_school_billing_admin(public.current_user_school_id()));