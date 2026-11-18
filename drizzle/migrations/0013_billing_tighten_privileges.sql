DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing_settings','billing_calendar','school_billing_profiles','billing_payments','billing_webhook_events',
    'school_subscriptions','school_term_billing','desktop_licences','desktop_licence_devices','billing_upgrades','report_credit_accounts',
    'report_card_issues','report_credit_ledger','school_capacity_status','billing_notifications','billing_quotes']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

GRANT UPDATE ON public.billing_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.billing_calendar TO authenticated;
GRANT INSERT, UPDATE ON public.school_billing_profiles TO authenticated;
GRANT UPDATE ON public.school_subscriptions TO authenticated;
GRANT UPDATE ON public.desktop_licences TO authenticated;
GRANT INSERT, UPDATE ON public.billing_quotes TO authenticated;
GRANT UPDATE (read_at) ON public.billing_notifications TO authenticated;

REVOKE ALL ON SEQUENCE public.billing_receipt_seq FROM anon, authenticated;