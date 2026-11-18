-- ============ Learner status (capacity counts active learners only) ============
ALTER TABLE public.learners ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.learners DROP CONSTRAINT IF EXISTS learners_status_check;
ALTER TABLE public.learners ADD CONSTRAINT learners_status_check CHECK (status IN ('active','archived','withdrawn','graduated'));
ALTER TABLE public.nursery_learners ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.nursery_learners DROP CONSTRAINT IF EXISTS nursery_learners_status_check;
ALTER TABLE public.nursery_learners ADD CONSTRAINT nursery_learners_status_check CHECK (status IN ('active','archived','withdrawn','graduated'));

-- ============ Helpers ============
CREATE OR REPLACE FUNCTION public.billing_today() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT (now() AT TIME ZONE 'Africa/Kampala')::date $$;

CREATE OR REPLACE FUNCTION public.billing_term_number(_name text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(substring(lower(coalesce(_name,'')) from 'term\s*([1-3])\M'), '')::int,
    CASE WHEN lower(coalesce(_name,'')) ~ '\m(three|third|iii)\M' THEN 3
         WHEN lower(coalesce(_name,'')) ~ '\m(two|second|ii)\M' THEN 2
         WHEN lower(coalesce(_name,'')) ~ '\m(one|first|i)\M' THEN 1 END,
    NULLIF(substring(coalesce(_name,'') from '^\s*([1-3])\s*$'), '')::int)
$$;

CREATE OR REPLACE FUNCTION public.is_school_billing_admin(_school uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR (
    public.has_role(auth.uid(), 'admin') AND EXISTS (
      SELECT 1 FROM public.school_members m
      WHERE m.user_id = auth.uid() AND m.school_id = _school AND m.role = 'school_admin'))
$$;

-- ============ Platform settings & academic calendar ============
CREATE TABLE public.billing_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enforcement_enabled boolean NOT NULL DEFAULT false,
  payment_mode text NOT NULL DEFAULT 'TEST' CHECK (payment_mode IN ('TEST','LIVE')),
  subscription_grace_days integer NOT NULL DEFAULT 7 CHECK (subscription_grace_days BETWEEN 0 AND 60),
  capacity_grace_days integer NOT NULL DEFAULT 30 CHECK (capacity_grace_days BETWEEN 0 AND 180),
  capacity_grace_percent numeric NOT NULL DEFAULT 10 CHECK (capacity_grace_percent BETWEEN 0 AND 50),
  reminder_days integer[] NOT NULL DEFAULT '{14,7,0}',
  grace_reminder_days integer[] NOT NULL DEFAULT '{1,6}',
  low_credit_threshold integer NOT NULL DEFAULT 10 CHECK (low_credit_threshold >= 0),
  default_max_devices integer NOT NULL DEFAULT 1 CHECK (default_max_devices BETWEEN 1 AND 20),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_settings_read ON public.billing_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY billing_settings_write ON public.billing_settings FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
INSERT INTO public.billing_settings DEFAULT VALUES ON CONFLICT DO NOTHING;

CREATE TABLE public.billing_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year integer NOT NULL CHECK (academic_year BETWEEN 2000 AND 2100),
  term_number integer NOT NULL CHECK (term_number BETWEEN 1 AND 3),
  opens_on date NOT NULL,
  closes_on date NOT NULL,
  renewal_due_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year, term_number),
  CHECK (closes_on > opens_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_calendar TO authenticated;
GRANT ALL ON public.billing_calendar TO service_role;
ALTER TABLE public.billing_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_calendar_read ON public.billing_calendar FOR SELECT TO authenticated USING (true);
CREATE POLICY billing_calendar_insert ON public.billing_calendar FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY billing_calendar_update ON public.billing_calendar FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY billing_calendar_delete ON public.billing_calendar FOR DELETE TO authenticated USING (public.is_super_admin());

-- ============ School billing profile ============
CREATE TABLE public.school_billing_profiles (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  edition text NOT NULL DEFAULT 'online' CHECK (edition IN ('online','desktop','both')),
  default_method text CHECK (default_method IN ('subscription','per_report')),
  custom_capacity integer CHECK (custom_capacity > 0),
  custom_grace_limit integer CHECK (custom_grace_limit > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.school_billing_profiles TO authenticated;
GRANT ALL ON public.school_billing_profiles TO service_role;
ALTER TABLE public.school_billing_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY sbp_read ON public.school_billing_profiles FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));
CREATE POLICY sbp_insert ON public.school_billing_profiles FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY sbp_update ON public.school_billing_profiles FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ============ Payments ============
CREATE SEQUENCE public.billing_receipt_seq;
GRANT USAGE ON SEQUENCE public.billing_receipt_seq TO service_role;

CREATE TABLE public.billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  client_request_id uuid,
  product text NOT NULL CHECK (product IN ('online_term','online_annual','online_upgrade','report_credits','desktop_licence','desktop_upgrade')),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'UGX' CHECK (currency = 'UGX'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','successful','failed','cancelled','mismatch','refunded','partially_refunded')),
  channel text CHECK (channel IN ('hosted_checkout','mobile_money')),
  msisdn text,
  mode text,
  gateway_reference text UNIQUE,
  checkout_session_id text UNIQUE,
  checkout_url text,
  provider text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_message text,
  refunded_amount numeric(12,2) NOT NULL DEFAULT 0,
  receipt_no text UNIQUE,
  created_by uuid,
  fulfilled_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, client_request_id)
);
CREATE INDEX billing_payments_school_idx ON public.billing_payments (school_id, created_at DESC);
CREATE INDEX billing_payments_pending_idx ON public.billing_payments (status, created_at) WHERE status = 'pending';
GRANT SELECT ON public.billing_payments TO authenticated;
GRANT ALL ON public.billing_payments TO service_role;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_payments_read ON public.billing_payments FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));

CREATE TABLE public.billing_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event_type text,
  payment_reference text,
  payment_id uuid REFERENCES public.billing_payments(id) ON DELETE SET NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  payload jsonb,
  result text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT SELECT ON public.billing_webhook_events TO authenticated;
GRANT ALL ON public.billing_webhook_events TO service_role;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_webhook_events_read ON public.billing_webhook_events FOR SELECT TO authenticated USING (public.is_super_admin());

-- ============ Online subscriptions ============
CREATE TABLE public.school_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  plan text NOT NULL CHECK (plan IN ('termly','annual')),
  tier text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  grace_limit integer NOT NULL CHECK (grace_limit >= capacity),
  academic_year integer NOT NULL,
  term_number integer CHECK (term_number BETWEEN 1 AND 3),
  starts_on date NOT NULL,
  expires_on date NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_id uuid UNIQUE REFERENCES public.billing_payments(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((plan = 'termly' AND term_number IS NOT NULL) OR (plan = 'annual' AND term_number IS NULL)),
  CHECK (expires_on >= starts_on)
);
CREATE INDEX school_subscriptions_school_idx ON public.school_subscriptions (school_id, academic_year);
GRANT SELECT, UPDATE ON public.school_subscriptions TO authenticated;
GRANT ALL ON public.school_subscriptions TO service_role;
ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_subscriptions_read ON public.school_subscriptions FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));
CREATE POLICY school_subscriptions_admin_update ON public.school_subscriptions FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.school_term_billing (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year integer NOT NULL,
  term_number integer NOT NULL CHECK (term_number BETWEEN 1 AND 3),
  method text NOT NULL CHECK (method IN ('subscription','per_report')),
  subscription_id uuid REFERENCES public.school_subscriptions(id) ON DELETE SET NULL,
  chosen_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, academic_year, term_number)
);
GRANT SELECT ON public.school_term_billing TO authenticated;
GRANT ALL ON public.school_term_billing TO service_role;
ALTER TABLE public.school_term_billing ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_term_billing_read ON public.school_term_billing FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));

-- ============ Desktop licences ============
CREATE TABLE public.desktop_licences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  licence_key text NOT NULL UNIQUE,
  tier text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  grace_limit integer NOT NULL CHECK (grace_limit >= capacity),
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  max_devices integer NOT NULL DEFAULT 1 CHECK (max_devices BETWEEN 1 AND 20),
  maintenance_until date,
  payment_id uuid UNIQUE REFERENCES public.billing_payments(id) ON DELETE RESTRICT,
  certificate text,
  certificate_version integer,
  issued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.desktop_licences TO authenticated;
GRANT ALL ON public.desktop_licences TO service_role;
ALTER TABLE public.desktop_licences ENABLE ROW LEVEL SECURITY;
CREATE POLICY desktop_licences_read ON public.desktop_licences FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));
CREATE POLICY desktop_licences_admin_update ON public.desktop_licences FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.desktop_licence_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licence_id uuid NOT NULL REFERENCES public.desktop_licences(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL CHECK (length(device_fingerprint) BETWEEN 16 AND 200),
  device_name text,
  certificate text,
  activated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  deactivated_by uuid
);
CREATE UNIQUE INDEX desktop_licence_devices_active_uniq ON public.desktop_licence_devices (licence_id, device_fingerprint) WHERE deactivated_at IS NULL;
GRANT SELECT ON public.desktop_licence_devices TO authenticated;
GRANT ALL ON public.desktop_licence_devices TO service_role;
ALTER TABLE public.desktop_licence_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY desktop_licence_devices_read ON public.desktop_licence_devices FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));

-- ============ Upgrades history ============
CREATE TABLE public.billing_upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  edition text NOT NULL CHECK (edition IN ('online','desktop')),
  subscription_id uuid REFERENCES public.school_subscriptions(id) ON DELETE SET NULL,
  licence_id uuid REFERENCES public.desktop_licences(id) ON DELETE SET NULL,
  from_tier text, to_tier text NOT NULL,
  from_capacity integer, to_capacity integer NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_id uuid UNIQUE REFERENCES public.billing_payments(id) ON DELETE RESTRICT,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_upgrades TO authenticated;
GRANT ALL ON public.billing_upgrades TO service_role;
ALTER TABLE public.billing_upgrades ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_upgrades_read ON public.billing_upgrades FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));

-- ============ Report-card credits & issues ============
CREATE TABLE public.report_credit_accounts (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  purchased integer NOT NULL DEFAULT 0 CHECK (purchased >= 0),
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  adjusted integer NOT NULL DEFAULT 0,
  balance integer GENERATED ALWAYS AS (purchased - used + adjusted) STORED,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (purchased - used + adjusted >= 0)
);
GRANT SELECT ON public.report_credit_accounts TO authenticated;
GRANT ALL ON public.report_credit_accounts TO service_role;
ALTER TABLE public.report_credit_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_credit_accounts_read ON public.report_credit_accounts FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));

CREATE TABLE public.report_card_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('primary','nursery')),
  learner_id uuid NOT NULL,
  term_id uuid,
  academic_year integer NOT NULL,
  term_number integer NOT NULL,
  method text NOT NULL CHECK (method IN ('subscription','per_report','unbilled','legacy')),
  subscription_id uuid REFERENCES public.school_subscriptions(id) ON DELETE SET NULL,
  issued_by uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  UNIQUE (school_id, level, learner_id, academic_year, term_number)
);
CREATE INDEX report_card_issues_school_idx ON public.report_card_issues (school_id, academic_year, term_number);
GRANT SELECT ON public.report_card_issues TO authenticated;
GRANT ALL ON public.report_card_issues TO service_role;
ALTER TABLE public.report_card_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_card_issues_read ON public.report_card_issues FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));

CREATE TABLE public.report_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  delta integer NOT NULL CHECK (delta <> 0),
  kind text NOT NULL CHECK (kind IN ('purchase','usage','release','adjustment')),
  payment_id uuid REFERENCES public.billing_payments(id) ON DELETE RESTRICT,
  issue_id uuid REFERENCES public.report_card_issues(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX report_credit_ledger_purchase_uniq ON public.report_credit_ledger (payment_id) WHERE kind = 'purchase';
CREATE INDEX report_credit_ledger_school_idx ON public.report_credit_ledger (school_id, created_at DESC);
GRANT SELECT ON public.report_credit_ledger TO authenticated;
GRANT ALL ON public.report_credit_ledger TO service_role;
ALTER TABLE public.report_credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_credit_ledger_read ON public.report_credit_ledger FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));

-- ============ Capacity status, notifications, quotes ============
CREATE TABLE public.school_capacity_status (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  edition text NOT NULL CHECK (edition IN ('online','desktop')),
  licensed integer NOT NULL,
  grace_limit integer NOT NULL,
  active_learners integer NOT NULL,
  over_since timestamptz,
  grace_ends_at timestamptz,
  state text NOT NULL CHECK (state IN ('ok','approaching','grace','exceeded','upgrade_required')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, edition)
);
GRANT SELECT ON public.school_capacity_status TO authenticated;
GRANT ALL ON public.school_capacity_status TO service_role;
ALTER TABLE public.school_capacity_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_capacity_status_read ON public.school_capacity_status FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));

CREATE TABLE public.billing_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX billing_notifications_school_idx ON public.billing_notifications (school_id, created_at DESC);
GRANT SELECT ON public.billing_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.billing_notifications TO authenticated;
GRANT ALL ON public.billing_notifications TO service_role;
ALTER TABLE public.billing_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_notifications_read ON public.billing_notifications FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));
CREATE POLICY billing_notifications_mark_read ON public.billing_notifications FOR UPDATE TO authenticated USING (public.is_school_billing_admin(school_id)) WITH CHECK (public.is_school_billing_admin(school_id));

CREATE TABLE public.billing_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  edition text NOT NULL CHECK (edition IN ('online','desktop')),
  product text NOT NULL CHECK (product IN ('online_term','online_annual','desktop_licence','desktop_upgrade','report_credits')),
  learner_capacity integer CHECK (learner_capacity > 0),
  grace_limit integer CHECK (grace_limit > 0),
  academic_year integer,
  term_number integer CHECK (term_number BETWEEN 1 AND 3),
  quantity integer CHECK (quantity > 0),
  amount numeric(12,2) CHECK (amount >= 500),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','open','paid','cancelled')),
  request_note text CHECK (length(request_note) <= 1000),
  admin_note text CHECK (length(admin_note) <= 1000),
  valid_until date,
  payment_id uuid REFERENCES public.billing_payments(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.billing_quotes TO authenticated;
GRANT ALL ON public.billing_quotes TO service_role;
ALTER TABLE public.billing_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_quotes_read ON public.billing_quotes FOR SELECT TO authenticated USING (public.is_school_billing_admin(school_id));
CREATE POLICY billing_quotes_admin_insert ON public.billing_quotes FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY billing_quotes_admin_update ON public.billing_quotes FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- updated_at triggers
CREATE TRIGGER billing_calendar_updated BEFORE UPDATE ON public.billing_calendar FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sbp_updated BEFORE UPDATE ON public.school_billing_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER billing_payments_updated BEFORE UPDATE ON public.billing_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER school_subscriptions_updated BEFORE UPDATE ON public.school_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER school_term_billing_updated BEFORE UPDATE ON public.school_term_billing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER desktop_licences_updated BEFORE UPDATE ON public.desktop_licences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER billing_quotes_updated BEFORE UPDATE ON public.billing_quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Subscription state & coverage ============
CREATE OR REPLACE FUNCTION public.billing_subscription_state(_starts date, _expires date, _status text) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _status = 'cancelled' THEN 'cancelled'
    WHEN public.billing_today() < _starts THEN 'scheduled'
    WHEN public.billing_today() <= _expires THEN 'active'
    WHEN public.billing_today() <= _expires + (SELECT subscription_grace_days FROM public.billing_settings WHERE id = 1) THEN 'grace'
    ELSE 'expired' END
$$;

CREATE OR REPLACE FUNCTION public.billing_term_subscription(_school uuid, _year integer, _term integer) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM public.school_subscriptions s
  WHERE s.school_id = _school AND s.academic_year = _year AND s.status = 'active'
    AND (s.plan = 'annual' OR s.term_number = _term)
    AND public.billing_subscription_state(s.starts_on, s.expires_on, s.status) IN ('scheduled','active','grace')
  ORDER BY (s.plan = 'annual') DESC, s.capacity DESC LIMIT 1
$$;

-- Keep subscription dates aligned with the configured academic calendar.
CREATE OR REPLACE FUNCTION public.billing_calendar_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.school_subscriptions SET expires_on = NEW.closes_on
   WHERE academic_year = NEW.academic_year AND ((plan = 'termly' AND term_number = NEW.term_number) OR (plan = 'annual' AND NEW.term_number = 3));
  UPDATE public.school_subscriptions SET starts_on = LEAST(NEW.opens_on, expires_on)
   WHERE academic_year = NEW.academic_year AND ((plan = 'termly' AND term_number = NEW.term_number) OR (plan = 'annual' AND NEW.term_number = 1));
  RETURN NEW;
END $$;
CREATE TRIGGER billing_calendar_sync_trg AFTER UPDATE OF opens_on, closes_on ON public.billing_calendar FOR EACH ROW EXECUTE FUNCTION public.billing_calendar_sync();

-- ============ Capacity ============
CREATE OR REPLACE FUNCTION public.billing_active_learner_count(_school uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ((SELECT count(*) FROM public.learners WHERE school_id = _school AND status = 'active')
        + (SELECT count(*) FROM public.nursery_learners WHERE school_id = _school AND status = 'active'))::int
$$;

CREATE OR REPLACE FUNCTION public.billing__capacity_row(_school uuid, _edition text, _licensed integer, _grace integer, _count integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev record; v_over timestamptz; v_state text; v_days integer; v_ends timestamptz;
BEGIN
  SELECT capacity_grace_days INTO v_days FROM public.billing_settings WHERE id = 1;
  SELECT * INTO prev FROM public.school_capacity_status WHERE school_id = _school AND edition = _edition;
  IF _licensed IS NULL THEN
    DELETE FROM public.school_capacity_status WHERE school_id = _school AND edition = _edition;
    RETURN;
  END IF;
  IF _count > _licensed THEN v_over := COALESCE(prev.over_since, now()); ELSE v_over := NULL; END IF;
  v_ends := CASE WHEN v_over IS NULL THEN NULL ELSE v_over + make_interval(days => v_days) END;
  v_state := CASE
    WHEN _count <= _licensed AND _count >= ceil(_licensed * 0.9) THEN 'approaching'
    WHEN _count <= _licensed THEN 'ok'
    WHEN _count > _grace THEN 'exceeded'
    WHEN now() > v_ends THEN 'upgrade_required'
    ELSE 'grace' END;
  INSERT INTO public.school_capacity_status (school_id, edition, licensed, grace_limit, active_learners, over_since, grace_ends_at, state, updated_at)
  VALUES (_school, _edition, _licensed, _grace, _count, v_over, v_ends, v_state, now())
  ON CONFLICT (school_id, edition) DO UPDATE SET licensed = EXCLUDED.licensed, grace_limit = EXCLUDED.grace_limit,
    active_learners = EXCLUDED.active_learners, over_since = EXCLUDED.over_since, grace_ends_at = EXCLUDED.grace_ends_at,
    state = EXCLUDED.state, updated_at = now();
  IF v_state IN ('grace','exceeded','upgrade_required') AND (prev IS NULL OR prev.state IS DISTINCT FROM v_state) THEN
    INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
    VALUES (_school, 'capacity_' || v_state,
      'capacity:' || _edition || ':' || v_state || ':' || to_char(COALESCE(v_over, now()), 'YYYYMMDD'),
      CASE WHEN v_state = 'grace' THEN 'warning' ELSE 'critical' END,
      CASE v_state WHEN 'grace' THEN 'Learner capacity grace allowance started'
                   WHEN 'exceeded' THEN 'Learner capacity grace limit exceeded'
                   ELSE 'Capacity grace period has ended' END,
      format('%s active learners against a licensed capacity of %s (temporary limit %s). %s', _count, _licensed, _grace,
        CASE v_state WHEN 'grace' THEN format('You have until %s to reduce enrolment or upgrade.', to_char(v_ends AT TIME ZONE 'Africa/Kampala', 'DD Mon YYYY'))
                     ELSE 'Please upgrade your package. Existing learners and records are not affected.' END))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.billing_refresh_capacity(_school uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer; sub record; prof record; lic record; v_pct numeric; v_lic integer; v_grace integer;
BEGIN
  v_count := public.billing_active_learner_count(_school);
  SELECT capacity_grace_percent INTO v_pct FROM public.billing_settings WHERE id = 1;
  SELECT * INTO prof FROM public.school_billing_profiles WHERE school_id = _school;
  SELECT * INTO sub FROM public.school_subscriptions s WHERE s.school_id = _school AND s.status = 'active'
    AND public.billing_subscription_state(s.starts_on, s.expires_on, s.status) IN ('active','grace')
    ORDER BY s.capacity DESC LIMIT 1;
  v_lic := COALESCE(prof.custom_capacity, sub.capacity);
  v_grace := COALESCE(prof.custom_grace_limit, CASE WHEN prof.custom_capacity IS NOT NULL THEN ceil(prof.custom_capacity * (1 + v_pct / 100))::int ELSE sub.grace_limit END);
  PERFORM public.billing__capacity_row(_school, 'online', v_lic, v_grace, v_count);
  SELECT * INTO lic FROM public.desktop_licences WHERE school_id = _school AND status = 'active' ORDER BY capacity DESC LIMIT 1;
  PERFORM public.billing__capacity_row(_school, 'desktop', lic.capacity, lic.grace_limit, v_count);
END $$;

CREATE OR REPLACE FUNCTION public.billing_capacity_after_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM public.billing_refresh_capacity(NEW.school_id); END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.school_id IS DISTINCT FROM NEW.school_id) THEN PERFORM public.billing_refresh_capacity(OLD.school_id); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.billing_capacity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st record; v_enforce boolean; v_next integer;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.school_id = NEW.school_id THEN RETURN NEW; END IF;
  SELECT enforcement_enabled INTO v_enforce FROM public.billing_settings WHERE id = 1;
  IF NOT COALESCE(v_enforce, false) THEN RETURN NEW; END IF;
  SELECT * INTO st FROM public.school_capacity_status WHERE school_id = NEW.school_id AND edition = 'online';
  IF st IS NULL THEN RETURN NEW; END IF;
  v_next := public.billing_active_learner_count(NEW.school_id) + 1;
  IF v_next > st.grace_limit OR (v_next > st.licensed AND st.grace_ends_at IS NOT NULL AND now() > st.grace_ends_at) THEN
    RAISE EXCEPTION 'BILLING_CAPACITY_UPGRADE_REQUIRED: Your package allows % learners (temporary limit %). Upgrade your package to add more active learners. Existing learners are not affected.', st.licensed, st.grace_limit;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_billing_capacity_guard BEFORE INSERT OR UPDATE OF status, school_id ON public.learners FOR EACH ROW EXECUTE FUNCTION public.billing_capacity_guard();
CREATE TRIGGER zz_billing_capacity_guard BEFORE INSERT OR UPDATE OF status, school_id ON public.nursery_learners FOR EACH ROW EXECUTE FUNCTION public.billing_capacity_guard();
CREATE TRIGGER zz_billing_capacity_refresh AFTER INSERT OR DELETE OR UPDATE OF status, school_id ON public.learners FOR EACH ROW EXECUTE FUNCTION public.billing_capacity_after_change();
CREATE TRIGGER zz_billing_capacity_refresh AFTER INSERT OR DELETE OR UPDATE OF status, school_id ON public.nursery_learners FOR EACH ROW EXECUTE FUNCTION public.billing_capacity_after_change();

-- ============ Report-card issuing (UGX 500 per unique learner/year/term) ============
CREATE OR REPLACE FUNCTION public.billing__issue(_school uuid, _level text, _term_id uuid, _learners uuid[], _allow_charge boolean, _actor uuid, _dry_run boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record; v_year integer; v_term integer; v_sub uuid; v_method text; v_new uuid[]; v_new_count integer;
  v_balance integer; v_enforce boolean; v_found integer; v_issue uuid; v_charged integer := 0; l uuid; res jsonb; v_reason text;
BEGIN
  IF _level NOT IN ('primary','nursery') THEN RAISE EXCEPTION 'Invalid report level'; END IF;
  SELECT id, name, year, school_id INTO t FROM public.terms WHERE id = _term_id;
  IF t.id IS NULL OR t.school_id <> _school THEN RAISE EXCEPTION 'Term not found for this school'; END IF;
  SELECT enforcement_enabled INTO v_enforce FROM public.billing_settings WHERE id = 1;
  v_enforce := COALESCE(v_enforce, false);
  v_year := t.year;
  v_term := public.billing_term_number(t.name);
  IF v_term IS NULL THEN
    IF v_enforce THEN RAISE EXCEPTION 'BILLING_TERM_UNRECOGNISED: Name your terms "Term 1", "Term 2" and "Term 3" so report cards can be matched to the academic calendar.'; END IF;
    v_term := 0;
  END IF;
  _learners := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(_learners, '{}'::uuid[])) x WHERE x IS NOT NULL);
  IF _level = 'primary' THEN
    SELECT count(*) INTO v_found FROM public.learners WHERE id = ANY(_learners) AND school_id = _school;
  ELSE
    SELECT count(*) INTO v_found FROM public.nursery_learners WHERE id = ANY(_learners) AND school_id = _school;
  END IF;
  IF v_found <> cardinality(_learners) THEN RAISE EXCEPTION 'One or more learners were not found in this school'; END IF;

  v_new := ARRAY(SELECT x FROM unnest(_learners) x WHERE NOT EXISTS (
    SELECT 1 FROM public.report_card_issues i WHERE i.school_id = _school AND i.level = _level AND i.learner_id = x
      AND i.academic_year = v_year AND i.term_number = v_term AND i.released_at IS NULL));
  v_new_count := cardinality(v_new);

  v_sub := CASE WHEN v_term > 0 THEN public.billing_term_subscription(_school, v_year, v_term) END;
  IF v_sub IS NOT NULL THEN
    v_method := 'subscription';
  ELSE
    SELECT method INTO v_method FROM public.school_term_billing WHERE school_id = _school AND academic_year = v_year AND term_number = v_term;
    IF v_method IS NULL THEN SELECT default_method INTO v_method FROM public.school_billing_profiles WHERE school_id = _school; END IF;
    IF v_method = 'subscription' THEN v_method := NULL; END IF; -- subscription chosen but not (or no longer) covering this term
  END IF;
  IF v_method IS NULL THEN v_method := CASE WHEN v_enforce THEN 'none' ELSE 'unbilled' END; END IF;
  SELECT balance INTO v_balance FROM public.report_credit_accounts WHERE school_id = _school;
  v_balance := COALESCE(v_balance, 0);

  res := jsonb_build_object('method', v_method, 'requested', cardinality(_learners), 'new', v_new_count,
    'already_issued', cardinality(_learners) - v_new_count, 'academic_year', v_year, 'term_number', v_term,
    'credits_needed', CASE WHEN v_method = 'per_report' THEN v_new_count ELSE 0 END,
    'balance', v_balance, 'enforcement', v_enforce, 'subscription_id', v_sub);

  IF v_new_count = 0 THEN RETURN res || jsonb_build_object('allowed', true, 'charged', 0); END IF;
  v_reason := CASE
    WHEN v_method = 'none' THEN 'plan_required'
    WHEN v_method = 'per_report' AND NOT _allow_charge THEN 'not_generated'
    WHEN v_method = 'per_report' AND v_balance < v_new_count THEN 'insufficient_credits' END;
  IF v_reason IS NOT NULL THEN
    IF _dry_run THEN RETURN res || jsonb_build_object('allowed', false, 'reason', v_reason, 'charged', 0); END IF;
    IF v_reason = 'plan_required' THEN
      RAISE EXCEPTION 'BILLING_PLAN_REQUIRED: No active subscription or pay-per-report-card plan covers Term % of %. Open Billing & Subscription to choose one.', v_term, v_year;
    ELSIF v_reason = 'not_generated' THEN
      RAISE EXCEPTION 'BILLING_NOT_GENERATED: This report card has not been generated yet. Generate it from the Report Cards page first.';
    ELSE
      RAISE EXCEPTION 'BILLING_INSUFFICIENT_CREDITS: % new report card(s) need % credit(s) but only % remain. Buy more report-card credits in Billing & Subscription.', v_new_count, v_new_count, v_balance;
    END IF;
  END IF;
  IF _dry_run THEN RETURN res || jsonb_build_object('allowed', true, 'charged', 0); END IF;

  IF v_method = 'per_report' THEN
    INSERT INTO public.report_credit_accounts (school_id) VALUES (_school) ON CONFLICT DO NOTHING;
    SELECT balance INTO v_balance FROM public.report_credit_accounts WHERE school_id = _school FOR UPDATE;
    IF v_balance < v_new_count THEN
      RAISE EXCEPTION 'BILLING_INSUFFICIENT_CREDITS: % new report card(s) need % credit(s) but only % remain. Buy more report-card credits in Billing & Subscription.', v_new_count, v_new_count, v_balance;
    END IF;
    IF v_term > 0 THEN
      INSERT INTO public.school_term_billing (school_id, academic_year, term_number, method, chosen_by)
      VALUES (_school, v_year, v_term, 'per_report', _actor) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  FOREACH l IN ARRAY v_new LOOP
    v_issue := NULL;
    INSERT INTO public.report_card_issues (school_id, level, learner_id, term_id, academic_year, term_number, method, subscription_id, issued_by)
    VALUES (_school, _level, l, _term_id, v_year, v_term, v_method, v_sub, _actor)
    ON CONFLICT (school_id, level, learner_id, academic_year, term_number) DO UPDATE
      SET released_at = NULL, method = EXCLUDED.method, subscription_id = EXCLUDED.subscription_id,
          issued_at = now(), term_id = EXCLUDED.term_id, issued_by = EXCLUDED.issued_by
      WHERE public.report_card_issues.released_at IS NOT NULL
    RETURNING id INTO v_issue;
    IF v_issue IS NOT NULL AND v_method = 'per_report' THEN
      INSERT INTO public.report_credit_ledger (school_id, delta, kind, issue_id, created_by) VALUES (_school, -1, 'usage', v_issue, _actor);
      v_charged := v_charged + 1;
    END IF;
  END LOOP;
  IF v_charged > 0 THEN
    UPDATE public.report_credit_accounts SET used = used + v_charged, updated_at = now() WHERE school_id = _school;
  END IF;
  RETURN res || jsonb_build_object('allowed', true, 'charged', v_charged, 'balance', v_balance - v_charged);
END $$;

CREATE OR REPLACE FUNCTION public.billing__caller_school_for_term(_term_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.terms WHERE id = _term_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Term not found'; END IF;
  IF public.is_super_admin() THEN RETURN v_school; END IF;
  IF v_school IS DISTINCT FROM public.current_user_school_id() OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised for this school';
  END IF;
  RETURN v_school;
END $$;

CREATE OR REPLACE FUNCTION public.billing_report_card_quote(_level text, _term_id uuid, _learner_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.billing__issue(public.billing__caller_school_for_term(_term_id), _level, _term_id, _learner_ids, true, auth.uid(), true);
END $$;

CREATE OR REPLACE FUNCTION public.billing_issue_report_cards(_level text, _term_id uuid, _learner_ids uuid[], _allow_charge boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.billing__issue(public.billing__caller_school_for_term(_term_id), _level, _term_id, _learner_ids, _allow_charge, auth.uid(), false);
END $$;

-- Undo a just-made charge when the report could not be produced (never for saved report cards).
CREATE OR REPLACE FUNCTION public.billing_release_report_cards(_level text, _term_id uuid, _learner_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid; r record; v_released integer := 0; v_refund integer := 0;
BEGIN
  v_school := public.billing__caller_school_for_term(_term_id);
  FOR r IN
    SELECT i.* FROM public.report_card_issues i
    WHERE i.school_id = v_school AND i.level = _level AND i.term_id = _term_id AND i.learner_id = ANY(_learner_ids)
      AND i.released_at IS NULL AND i.issued_at > now() - interval '15 minutes' AND i.method IN ('per_report','subscription','unbilled')
      AND NOT EXISTS (SELECT 1 FROM public.report_cards rc WHERE _level = 'primary' AND rc.learner_id = i.learner_id AND rc.term_id = i.term_id)
    FOR UPDATE
  LOOP
    UPDATE public.report_card_issues SET released_at = now() WHERE id = r.id;
    v_released := v_released + 1;
    IF r.method = 'per_report' THEN
      INSERT INTO public.report_credit_ledger (school_id, delta, kind, issue_id, note, created_by)
      VALUES (v_school, 1, 'release', r.id, 'Report card could not be generated', auth.uid());
      v_refund := v_refund + 1;
    END IF;
  END LOOP;
  IF v_refund > 0 THEN
    UPDATE public.report_credit_accounts SET used = GREATEST(used - v_refund, 0), updated_at = now() WHERE school_id = v_school;
  END IF;
  RETURN v_released;
END $$;

CREATE OR REPLACE FUNCTION public.billing_report_card_issue_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing__issue(NEW.school_id, TG_ARGV[0], NEW.term_id, ARRAY[NEW.learner_id], true, auth.uid(), false);
  RETURN NEW;
END $$;
CREATE TRIGGER zz_billing_issue BEFORE INSERT ON public.report_cards FOR EACH ROW EXECUTE FUNCTION public.billing_report_card_issue_trg('primary');
-- Nursery cards are issued when they are first printed/downloaded (saving comments never charges).

-- Existing report cards stay free to reprint/regenerate.
INSERT INTO public.report_card_issues (school_id, level, learner_id, term_id, academic_year, term_number, method, issued_at)
SELECT rc.school_id, 'primary', rc.learner_id, rc.term_id, t.year, COALESCE(public.billing_term_number(t.name), 0), 'legacy', COALESCE(rc.generated_at, rc.created_at)
FROM public.report_cards rc JOIN public.terms t ON t.id = rc.term_id
ON CONFLICT DO NOTHING;
INSERT INTO public.report_card_issues (school_id, level, learner_id, term_id, academic_year, term_number, method, issued_at)
SELECT nr.school_id, 'nursery', nr.learner_id, nr.term_id, t.year, COALESCE(public.billing_term_number(t.name), 0), 'legacy', COALESCE(nr.generated_at, nr.created_at)
FROM public.nursery_report_cards nr JOIN public.terms t ON t.id = nr.term_id
ON CONFLICT DO NOTHING;

-- ============ School-admin choices ============
CREATE OR REPLACE FUNCTION public.billing_set_term_method(_academic_year integer, _term_number integer, _method text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid; cur record;
BEGIN
  v_school := public.current_user_school_id();
  IF v_school IS NULL OR NOT public.is_school_billing_admin(v_school) THEN RAISE EXCEPTION 'Only school administrators can change billing'; END IF;
  IF _method NOT IN ('per_report') THEN RAISE EXCEPTION 'Subscriptions are selected by paying for them'; END IF;
  IF _term_number NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Invalid term'; END IF;
  IF public.billing_term_subscription(v_school, _academic_year, _term_number) IS NOT NULL THEN
    RAISE EXCEPTION 'This term is already covered by a subscription, so report cards are not charged individually.';
  END IF;
  SELECT * INTO cur FROM public.school_term_billing WHERE school_id = v_school AND academic_year = _academic_year AND term_number = _term_number;
  IF cur IS NOT NULL AND cur.method = _method THEN RETURN; END IF;
  INSERT INTO public.school_term_billing (school_id, academic_year, term_number, method, chosen_by)
  VALUES (v_school, _academic_year, _term_number, _method, auth.uid())
  ON CONFLICT (school_id, academic_year, term_number) DO UPDATE SET method = EXCLUDED.method, subscription_id = NULL, chosen_by = EXCLUDED.chosen_by;
END $$;

CREATE OR REPLACE FUNCTION public.billing_set_default_method(_method text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid;
BEGIN
  v_school := public.current_user_school_id();
  IF v_school IS NULL OR NOT public.is_school_billing_admin(v_school) THEN RAISE EXCEPTION 'Only school administrators can change billing'; END IF;
  IF _method IS NOT NULL AND _method NOT IN ('subscription','per_report') THEN RAISE EXCEPTION 'Invalid billing method'; END IF;
  INSERT INTO public.school_billing_profiles (school_id, default_method) VALUES (v_school, _method)
  ON CONFLICT (school_id) DO UPDATE SET default_method = EXCLUDED.default_method;
END $$;

CREATE OR REPLACE FUNCTION public.billing_request_quote(_edition text, _product text, _capacity integer, _note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid; v_id uuid;
BEGIN
  v_school := public.current_user_school_id();
  IF v_school IS NULL OR NOT public.is_school_billing_admin(v_school) THEN RAISE EXCEPTION 'Only school administrators can request quotations'; END IF;
  IF (SELECT count(*) FROM public.billing_quotes WHERE school_id = v_school AND status = 'requested') >= 5 THEN
    RAISE EXCEPTION 'You already have pending quotation requests';
  END IF;
  INSERT INTO public.billing_quotes (school_id, edition, product, learner_capacity, request_note, created_by)
  VALUES (v_school, _edition, _product, _capacity, left(_note, 1000), auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.billing_refresh_my_capacity() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid;
BEGIN
  v_school := public.current_user_school_id();
  IF v_school IS NULL OR NOT public.is_school_billing_admin(v_school) THEN RETURN; END IF;
  PERFORM public.billing_refresh_capacity(v_school);
END $$;

-- ============ Payment fulfilment (service role only; idempotent) ============
CREATE OR REPLACE FUNCTION public.billing_fulfil_payment(_payment_id uuid, _status text, _amount numeric, _currency text, _gateway_reference text, _provider text, _mode text, _failure text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.billing_payments; d jsonb; v_status text := upper(coalesce(_status, '')); v_sub uuid; v_lic uuid; v_ledger uuid;
  v_year integer; v_term integer; v_dup boolean := false; v_key text; v_inserted boolean;
BEGIN
  SELECT * INTO p FROM public.billing_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  UPDATE public.billing_payments SET gateway_reference = COALESCE(gateway_reference, _gateway_reference),
    provider = COALESCE(_provider, provider), mode = COALESCE(_mode, mode), last_checked_at = now() WHERE id = p.id;
  IF p.status IN ('successful','refunded','partially_refunded') THEN
    RETURN jsonb_build_object('result', 'already_fulfilled', 'payment_id', p.id);
  END IF;
  IF v_status IN ('PENDING','PROCESSING','') THEN RETURN jsonb_build_object('result', 'pending'); END IF;
  IF v_status IN ('FAILED','CANCELLED') THEN
    UPDATE public.billing_payments SET status = lower(v_status), failure_message = left(_failure, 500) WHERE id = p.id AND status = 'pending';
    RETURN jsonb_build_object('result', lower(v_status));
  END IF;
  IF v_status <> 'SUCCESSFUL' THEN RETURN jsonb_build_object('result', 'ignored', 'status', v_status); END IF;
  IF upper(coalesce(_currency, '')) <> 'UGX' OR round(coalesce(_amount, -1), 2) <> round(p.amount, 2) THEN
    UPDATE public.billing_payments SET status = 'mismatch',
      failure_message = format('Gateway reported %s %s but %s UGX was expected', _currency, _amount, p.amount) WHERE id = p.id;
    RETURN jsonb_build_object('result', 'mismatch');
  END IF;

  d := p.details;
  UPDATE public.billing_payments SET status = 'successful', fulfilled_at = now(), failure_message = NULL,
    receipt_no = 'SER-' || to_char(now() AT TIME ZONE 'Africa/Kampala', 'YYYY') || '-' || lpad(nextval('public.billing_receipt_seq')::text, 6, '0')
  WHERE id = p.id;

  IF p.product IN ('online_term','online_annual') THEN
    v_year := (d->>'academic_year')::int;
    v_term := NULLIF(d->>'term_number', '')::int;
    IF p.product = 'online_term' THEN
      v_dup := public.billing_term_subscription(p.school_id, v_year, v_term) IS NOT NULL;
    ELSE
      v_dup := EXISTS (SELECT 1 FROM public.school_subscriptions s WHERE s.school_id = p.school_id AND s.academic_year = v_year AND s.status = 'active' AND s.expires_on >= public.billing_today());
    END IF;
    INSERT INTO public.school_subscriptions (school_id, plan, tier, capacity, grace_limit, academic_year, term_number, starts_on, expires_on, amount, payment_id)
    VALUES (p.school_id, CASE WHEN p.product = 'online_term' THEN 'termly' ELSE 'annual' END, d->>'tier', (d->>'capacity')::int, (d->>'grace_limit')::int,
      v_year, CASE WHEN p.product = 'online_term' THEN v_term END, (d->>'starts_on')::date, (d->>'expires_on')::date, p.amount, p.id)
    ON CONFLICT (payment_id) DO NOTHING RETURNING id INTO v_sub;
    IF v_sub IS NOT NULL THEN
      INSERT INTO public.school_term_billing (school_id, academic_year, term_number, method, subscription_id)
      SELECT p.school_id, v_year, n, 'subscription', v_sub
      FROM generate_series(1, 3) n WHERE p.product = 'online_annual' OR n = v_term
      ON CONFLICT (school_id, academic_year, term_number) DO UPDATE SET method = 'subscription', subscription_id = EXCLUDED.subscription_id;
      INSERT INTO public.school_billing_profiles (school_id, default_method) VALUES (p.school_id, 'subscription')
      ON CONFLICT (school_id) DO UPDATE SET default_method = COALESCE(public.school_billing_profiles.default_method, 'subscription');
    END IF;
    IF v_dup THEN
      UPDATE public.billing_payments SET details = details || '{"possible_duplicate": true}'::jsonb WHERE id = p.id;
    END IF;
  ELSIF p.product = 'online_upgrade' THEN
    UPDATE public.school_subscriptions SET tier = d->>'to_tier', capacity = (d->>'to_capacity')::int, grace_limit = (d->>'to_grace_limit')::int
    WHERE id = (d->>'subscription_id')::uuid AND school_id = p.school_id;
    INSERT INTO public.billing_upgrades (school_id, edition, subscription_id, from_tier, to_tier, from_capacity, to_capacity, amount, payment_id, details)
    VALUES (p.school_id, 'online', (d->>'subscription_id')::uuid, d->>'from_tier', d->>'to_tier', (d->>'from_capacity')::int, (d->>'to_capacity')::int, p.amount, p.id, d)
    ON CONFLICT (payment_id) DO NOTHING;
  ELSIF p.product = 'report_credits' THEN
    INSERT INTO public.report_credit_accounts (school_id) VALUES (p.school_id) ON CONFLICT DO NOTHING;
    PERFORM 1 FROM public.report_credit_accounts WHERE school_id = p.school_id FOR UPDATE;
    INSERT INTO public.report_credit_ledger (school_id, delta, kind, payment_id, note)
    VALUES (p.school_id, (d->>'quantity')::int, 'purchase', p.id, format('%s report-card credits', d->>'quantity'))
    ON CONFLICT (payment_id) WHERE kind = 'purchase' DO NOTHING RETURNING id INTO v_ledger;
    IF v_ledger IS NOT NULL THEN
      UPDATE public.report_credit_accounts SET purchased = purchased + (d->>'quantity')::int, updated_at = now() WHERE school_id = p.school_id;
    END IF;
  ELSIF p.product = 'desktop_licence' THEN
    v_key := 'SER-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
      || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    INSERT INTO public.desktop_licences (school_id, licence_key, tier, capacity, grace_limit, payment_id, max_devices)
    VALUES (p.school_id, v_key, d->>'tier', (d->>'capacity')::int, (d->>'grace_limit')::int, p.id,
      (SELECT default_max_devices FROM public.billing_settings WHERE id = 1))
    ON CONFLICT (payment_id) DO NOTHING RETURNING id INTO v_lic;
  ELSIF p.product = 'desktop_upgrade' THEN
    v_lic := (d->>'licence_id')::uuid;
    INSERT INTO public.billing_upgrades (school_id, edition, licence_id, from_tier, to_tier, from_capacity, to_capacity, amount, payment_id, details)
    VALUES (p.school_id, 'desktop', v_lic, d->>'from_tier', d->>'to_tier', (d->>'from_capacity')::int, (d->>'to_capacity')::int, p.amount, p.id, d)
    ON CONFLICT (payment_id) DO NOTHING RETURNING true INTO v_inserted;
    IF v_inserted THEN
      UPDATE public.desktop_licences SET tier = d->>'to_tier', capacity = (d->>'to_capacity')::int, grace_limit = (d->>'to_grace_limit')::int, version = version + 1
      WHERE id = v_lic AND school_id = p.school_id;
    END IF;
  END IF;

  IF d ? 'quote_id' THEN
    UPDATE public.billing_quotes SET status = 'paid', payment_id = p.id WHERE id = (d->>'quote_id')::uuid AND school_id = p.school_id;
  END IF;
  PERFORM public.billing_refresh_capacity(p.school_id);
  INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
  VALUES (p.school_id, 'payment_received', 'payment:' || p.id, 'info', 'Payment received',
    format('%s — UGX %s confirmed.', p.description, to_char(p.amount, 'FM999,999,999,990')))
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('result', 'fulfilled', 'payment_id', p.id, 'product', p.product,
    'licence_id', COALESCE(v_lic, (SELECT id FROM public.desktop_licences WHERE payment_id = p.id)), 'possible_duplicate', v_dup);
END $$;

CREATE OR REPLACE FUNCTION public.billing_record_refund(_payment_id uuid, _refunded numeric, _status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.billing_payments SET refunded_amount = LEAST(amount, GREATEST(0, _refunded)),
    status = CASE WHEN upper(_status) = 'REFUNDED' THEN 'refunded' WHEN upper(_status) = 'PARTIALLY_REFUNDED' THEN 'partially_refunded' ELSE status END
  WHERE id = _payment_id AND status IN ('successful','partially_refunded','refunded');
END $$;

-- ============ Daily maintenance: reminders, expiry, capacity, low credits ============
CREATE OR REPLACE FUNCTION public.billing_daily_maintenance() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; sub record; cfg public.billing_settings; v_today date := public.billing_today(); v_left integer; v_rd integer; v_n integer := 0; acc record;
BEGIN
  SELECT * INTO cfg FROM public.billing_settings WHERE id = 1;
  FOR s IN SELECT id FROM public.schools LOOP PERFORM public.billing_refresh_capacity(s.id); END LOOP;

  FOR sub IN
    SELECT ss.* FROM public.school_subscriptions ss
    WHERE ss.status = 'active' AND ss.expires_on BETWEEN v_today - cfg.subscription_grace_days - 1 AND v_today + 31
      AND NOT EXISTS (SELECT 1 FROM public.school_subscriptions n WHERE n.school_id = ss.school_id AND n.status = 'active' AND n.id <> ss.id AND n.expires_on > ss.expires_on)
  LOOP
    v_left := sub.expires_on - v_today;
    IF v_left >= 0 THEN
      SELECT min(x) INTO v_rd FROM unnest(cfg.reminder_days) x WHERE x >= v_left;
      IF v_rd IS NOT NULL THEN
        INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
        VALUES (sub.school_id, 'renewal_reminder', 'renewal:' || sub.id || ':' || v_rd, CASE WHEN v_left <= 7 THEN 'warning' ELSE 'info' END,
          CASE WHEN v_left = 0 THEN 'Your subscription expires today' ELSE format('Your subscription expires in %s day(s)', v_left) END,
          format('Your %s subscription ends on %s. Renew to keep generating new report cards. A %s-day renewal grace period follows.',
            sub.plan, to_char(sub.expires_on, 'DD Mon YYYY'), cfg.subscription_grace_days))
        ON CONFLICT (dedupe_key) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
      END IF;
    ELSIF -v_left <= cfg.subscription_grace_days THEN
      SELECT max(x) INTO v_rd FROM unnest(cfg.grace_reminder_days) x WHERE x <= -v_left;
      IF v_rd IS NOT NULL THEN
        INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
        VALUES (sub.school_id, 'grace_reminder', 'grace:' || sub.id || ':' || v_rd, 'critical', 'Renewal grace period in progress',
          format('Your subscription expired on %s. Renew by %s to avoid interruption of new report-card generation. Your records are safe.',
            to_char(sub.expires_on, 'DD Mon YYYY'), to_char(sub.expires_on + cfg.subscription_grace_days, 'DD Mon YYYY')))
        ON CONFLICT (dedupe_key) DO NOTHING;
      END IF;
    ELSE
      INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
      VALUES (sub.school_id, 'expired', 'expired:' || sub.id, 'critical', 'Subscription expired',
        'Premium online reporting is paused until you renew. All learners, marks and generated reports are preserved.')
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END LOOP;

  FOR acc IN
    SELECT a.* FROM public.report_credit_accounts a
    WHERE a.purchased > 0 AND a.balance <= cfg.low_credit_threshold
  LOOP
    INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
    VALUES (acc.school_id, 'credits_low', 'credits_low:' || acc.school_id || ':' || to_char(v_today, 'IYYY-IW'), 'warning',
      'Report-card credits are running low', format('%s credit(s) remain. Buy more to keep generating new report cards.', acc.balance))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;

  INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
  SELECT c.school_id, 'capacity_grace_ending', 'capacity_ending:' || c.edition || ':' || to_char(c.over_since, 'YYYYMMDD'), 'critical',
    'Capacity grace period ends soon',
    format('%s active learners against a capacity of %s. The grace period ends on %s — upgrade or reduce enrolment.', c.active_learners, c.licensed,
      to_char(c.grace_ends_at AT TIME ZONE 'Africa/Kampala', 'DD Mon YYYY'))
  FROM public.school_capacity_status c
  WHERE c.state = 'grace' AND c.grace_ends_at - now() <= interval '7 days'
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'date', v_today);
END $$;

-- ============ Function privileges ============
REVOKE ALL ON FUNCTION public.billing__issue(uuid, text, uuid, uuid[], boolean, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing__capacity_row(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_refresh_capacity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_fulfil_payment(uuid, text, numeric, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_record_refund(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_daily_maintenance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_term_subscription(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_active_learner_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing__caller_school_for_term(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_calendar_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_capacity_after_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_capacity_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_report_card_issue_trg() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing__issue(uuid, text, uuid, uuid[], boolean, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_refresh_capacity(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_fulfil_payment(uuid, text, numeric, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_refund(uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_daily_maintenance() TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_term_subscription(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_active_learner_count(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_school_billing_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_school_billing_admin(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.billing_report_card_quote(text, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_issue_report_cards(text, uuid, uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_release_report_cards(text, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_set_term_method(integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_set_default_method(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_request_quote(text, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_refresh_my_capacity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_report_card_quote(text, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_issue_report_cards(text, uuid, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_release_report_cards(text, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_set_term_method(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_set_default_method(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_request_quote(text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_refresh_my_capacity() TO authenticated;