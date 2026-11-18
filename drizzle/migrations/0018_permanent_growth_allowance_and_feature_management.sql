-- ============ Permanent 10% Growth Allowance (no time limit) ============
ALTER TABLE public.school_capacity_status DROP CONSTRAINT IF EXISTS school_capacity_status_state_check;
UPDATE public.school_capacity_status
   SET state = CASE WHEN state IN ('grace','upgrade_required') THEN 'allowance' ELSE state END, grace_ends_at = NULL;
ALTER TABLE public.school_capacity_status ADD CONSTRAINT school_capacity_status_state_check
  CHECK (state IN ('ok','approaching','allowance','exceeded'));
COMMENT ON COLUMN public.school_capacity_status.grace_ends_at IS 'DEPRECATED: the Growth Allowance is permanent; always NULL';
COMMENT ON COLUMN public.billing_settings.capacity_grace_days IS 'DEPRECATED: the Growth Allowance is permanent and has no time limit';

CREATE OR REPLACE FUNCTION public.billing__capacity_row(_school uuid, _edition text, _licensed integer, _grace integer, _count integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE prev record; v_over timestamptz; v_state text; v_pct numeric;
BEGIN
  SELECT capacity_grace_percent INTO v_pct FROM public.billing_settings WHERE id = 1;
  SELECT * INTO prev FROM public.school_capacity_status WHERE school_id = _school AND edition = _edition;
  IF _licensed IS NULL THEN
    DELETE FROM public.school_capacity_status WHERE school_id = _school AND edition = _edition;
    RETURN;
  END IF;
  IF _count > _licensed THEN v_over := COALESCE(prev.over_since, now()); ELSE v_over := NULL; END IF;
  v_state := CASE
    WHEN _count > _grace THEN 'exceeded'
    WHEN _count > _licensed THEN 'allowance'
    WHEN _count >= ceil(_licensed * 0.9) THEN 'approaching'
    ELSE 'ok' END;
  INSERT INTO public.school_capacity_status (school_id, edition, licensed, grace_limit, active_learners, over_since, grace_ends_at, state, updated_at)
  VALUES (_school, _edition, _licensed, _grace, _count, v_over, NULL, v_state, now())
  ON CONFLICT (school_id, edition) DO UPDATE SET licensed = EXCLUDED.licensed, grace_limit = EXCLUDED.grace_limit,
    active_learners = EXCLUDED.active_learners, over_since = EXCLUDED.over_since, grace_ends_at = NULL,
    state = EXCLUDED.state, updated_at = now();
  IF v_state IN ('allowance','exceeded') AND (prev IS NULL OR prev.state IS DISTINCT FROM v_state) THEN
    INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
    VALUES (_school, 'capacity_' || v_state,
      'capacity:' || _edition || ':' || v_state || ':' || to_char(now(), 'YYYYMMDD'),
      CASE WHEN v_state = 'allowance' THEN 'info' ELSE 'critical' END,
      CASE v_state WHEN 'allowance' THEN 'Growth Allowance in use' ELSE 'Learner limit reached — upgrade available' END,
      CASE v_state
        WHEN 'allowance' THEN format('%s active learners against your %s-learner package. Your permanent %s%% Growth Allowance covers up to %s learners at no extra cost and never expires.', _count, _licensed, round(COALESCE(v_pct, 10)), _grace)
        ELSE format('%s active learners are above your %s-learner package and its Growth Allowance of %s. Upgrade your package to add more active learners. Nothing is charged automatically and existing learners and records are not affected.', _count, _licensed, _grace) END)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.billing_capacity_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE st record; v_enforce boolean; v_next integer;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND OLD.school_id = NEW.school_id THEN RETURN NEW; END IF;
  SELECT enforcement_enabled INTO v_enforce FROM public.billing_settings WHERE id = 1;
  IF NOT COALESCE(v_enforce, false) THEN RETURN NEW; END IF;
  SELECT * INTO st FROM public.school_capacity_status WHERE school_id = NEW.school_id ORDER BY grace_limit DESC LIMIT 1;
  IF st IS NULL OR st.school_id IS NULL THEN RETURN NEW; END IF;
  v_next := public.billing_active_learner_count(NEW.school_id) + 1;
  IF v_next > st.grace_limit THEN
    RAISE EXCEPTION 'BILLING_CAPACITY_UPGRADE_REQUIRED: Your package covers % learners plus a permanent Growth Allowance up to %. Upgrade your package to add more active learners. Existing learners are not affected.', st.licensed, st.grace_limit;
  END IF;
  RETURN NEW;
END $function$;

-- ============ Lifetime licences unlock output; report generation is free ============
ALTER TABLE public.report_card_issues DROP CONSTRAINT IF EXISTS report_card_issues_method_check;
ALTER TABLE public.report_card_issues ADD CONSTRAINT report_card_issues_method_check
  CHECK (method IN ('subscription','per_report','unbilled','legacy','licence'));
DROP TRIGGER IF EXISTS zz_billing_issue ON public.report_cards;
CREATE OR REPLACE FUNCTION public.billing__issue(_school uuid, _level text, _term_id uuid, _learners uuid[], _allow_charge boolean, _actor uuid, _dry_run boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ELSIF EXISTS (SELECT 1 FROM public.desktop_licences d WHERE d.school_id = _school AND d.status = 'active') THEN
    v_method := 'licence'; -- a valid lifetime licence never expires and unlocks online output too
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
    'balance', v_balance, 'enforcement', v_enforce, 'subscription_id', v_sub,
    'paid', (NOT v_enforce) OR v_new_count = 0 OR v_method IN ('subscription','licence','unbilled'));

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
      RAISE EXCEPTION 'BILLING_INSUFFICIENT_CREDITS: % new report card(s) need % learner(s) but only % remain. Buy more learners in Billing & Subscription.', v_new_count, v_new_count, v_balance;
    END IF;
  END IF;
  IF _dry_run THEN RETURN res || jsonb_build_object('allowed', true, 'charged', 0); END IF;

  IF v_method = 'per_report' THEN
    INSERT INTO public.report_credit_accounts (school_id) VALUES (_school) ON CONFLICT DO NOTHING;
    SELECT balance INTO v_balance FROM public.report_credit_accounts WHERE school_id = _school FOR UPDATE;
    IF v_balance < v_new_count THEN
      RAISE EXCEPTION 'BILLING_INSUFFICIENT_CREDITS: % new report card(s) need % learner(s) but only % remain. Buy more learners in Billing & Subscription.', v_new_count, v_new_count, v_balance;
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
END $function$;

CREATE OR REPLACE FUNCTION public.billing_daily_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          format('Your %s subscription ends on %s. Renew to keep downloading and printing report cards. A %s-day renewal grace period follows.',
            sub.plan, to_char(sub.expires_on, 'DD Mon YYYY'), cfg.subscription_grace_days))
        ON CONFLICT (dedupe_key) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
      END IF;
    ELSIF -v_left <= cfg.subscription_grace_days THEN
      SELECT max(x) INTO v_rd FROM unnest(cfg.grace_reminder_days) x WHERE x <= -v_left;
      IF v_rd IS NOT NULL THEN
        INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
        VALUES (sub.school_id, 'grace_reminder', 'grace:' || sub.id || ':' || v_rd, 'critical', 'Renewal grace period in progress',
          format('Your subscription expired on %s. Renew by %s to keep downloading and printing report cards. Your records are safe.',
            to_char(sub.expires_on, 'DD Mon YYYY'), to_char(sub.expires_on + cfg.subscription_grace_days, 'DD Mon YYYY')))
        ON CONFLICT (dedupe_key) DO NOTHING;
      END IF;
    ELSE
      INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
      VALUES (sub.school_id, 'expired', 'expired:' || sub.id, 'critical', 'Subscription expired',
        'Downloading and printing new report cards is paused until you renew. Previews, learners, marks and generated reports are all preserved.')
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END LOOP;

  FOR acc IN
    SELECT a.* FROM public.report_credit_accounts a
    WHERE a.purchased > 0 AND a.balance <= cfg.low_credit_threshold
  LOOP
    INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
    VALUES (acc.school_id, 'credits_low', 'credits_low:' || acc.school_id || ':' || to_char(v_today, 'IYYY-IW'), 'warning',
      'Learners are running low', format('%s learner(s) remain. Buy more to keep downloading and printing new report cards.', acc.balance))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'date', v_today);
END $function$;

-- ============ Feature Management ============
CREATE TABLE public.platform_features (
  key text PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);
GRANT SELECT, UPDATE ON public.platform_features TO authenticated;
GRANT ALL ON public.platform_features TO service_role;
ALTER TABLE public.platform_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_features_read ON public.platform_features FOR SELECT TO authenticated USING (true);
CREATE POLICY platform_features_admin_update ON public.platform_features FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.school_feature_overrides (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.platform_features(key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (school_id, feature_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_feature_overrides TO authenticated;
GRANT ALL ON public.school_feature_overrides TO service_role;
ALTER TABLE public.school_feature_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_feature_overrides_read ON public.school_feature_overrides FOR SELECT TO authenticated
  USING (public.is_super_admin() OR school_id = public.current_user_school_id());
CREATE POLICY school_feature_overrides_admin_insert ON public.school_feature_overrides FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
CREATE POLICY school_feature_overrides_admin_update ON public.school_feature_overrides FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY school_feature_overrides_admin_delete ON public.school_feature_overrides FOR DELETE TO authenticated
  USING (public.is_super_admin());

INSERT INTO public.platform_features (key, label, description, category, sort_order) VALUES
 ('learner_editing','Learner information editing','Add, edit, archive and delete learners and their details.','Learners & marks',10),
 ('marks_entry','Marks and assessments','Enter marks and assessments, and change assessment settings.','Learners & marks',20),
 ('report_comments','Report card comments','Edit comment banks and Nursery report-card comments.','Learners & marks',30),
 ('primary_reports','Primary report cards','Generate, preview and output Primary report cards.','Report cards',40),
 ('nursery_reports','Nursery report cards','Preview and output Nursery report cards.','Report cards',50),
 ('download','Download','Download a single report card as a PDF.','Output',60),
 ('bulk_download','Bulk Download','Download a whole class of report cards as a ZIP.','Output',70),
 ('print','Print','Print a single report card.','Output',80),
 ('bulk_print','Bulk Print','Print a whole class of report cards.','Output',90),
 ('marksheet_output','Marksheet print and download','Print or download class marksheets.','Output',100),
 ('template_view','Template viewing','Open the Report Templates page and preview templates.','Templates',110),
 ('template_select','Template selection','Choose which uploaded template or default card is active.','Templates',120),
 ('template_create','Template creation','Upload new report-card templates.','Templates',130),
 ('template_edit','Template editing','Edit template fields, sections and corrections, or remove templates.','Templates',140),
 ('custom_fields','Custom report fields','Create and fill custom school and learner fields.','Templates',150),
 ('appearance','Layout and colour customisation','Change report colours, themes, borders, fonts, stamp and watermark.','Design',160);

CREATE OR REPLACE FUNCTION public.feature_enabled(_school uuid, _key text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT o.enabled FROM public.school_feature_overrides o WHERE o.school_id = _school AND o.feature_key = _key),
    (SELECT f.enabled FROM public.platform_features f WHERE f.key = _key),
    true)
$$;

CREATE OR REPLACE FUNCTION public.my_school_features()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_object_agg(f.key, public.feature_enabled(public.current_user_school_id(), f.key)), '{}'::jsonb)
  FROM public.platform_features f
$$;

CREATE OR REPLACE FUNCTION public.feature__raise(_key text)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_label text;
BEGIN
  SELECT label INTO v_label FROM public.platform_features WHERE key = _key;
  RAISE EXCEPTION 'FEATURE_DISABLED: % is turned off for your school by Skavio. Your existing data is kept. Contact Skavio to turn it back on.', COALESCE(v_label, _key);
END $$;

CREATE OR REPLACE FUNCTION public.feature_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r jsonb; o jsonb; v_key text := TG_ARGV[0]; v_school uuid; k text; v_changed boolean := false;
BEGIN
  -- Background jobs and the service role are never blocked.
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  r := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  o := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;

  IF TG_TABLE_NAME = 'report_templates' THEN
    v_key := CASE
      WHEN TG_OP = 'INSERT' THEN 'template_create'
      WHEN TG_OP = 'UPDATE' AND (r - 'is_active' - 'updated_at') = (o - 'is_active' - 'updated_at') THEN 'template_select'
      ELSE 'template_edit' END;
  ELSIF TG_TABLE_NAME = 'system_settings' THEN
    v_key := CASE
      WHEN r->>'key' IN ('report_appearance','report_custom_themes','border_style','nursery_font_style','learner_info_order')
        OR r->>'key' LIKE 'template_border_%' THEN 'appearance'
      WHEN r->>'key' = 'primary_assessments' THEN 'marks_entry' END;
  ELSIF TG_TABLE_NAME = 'school_info' THEN
    IF TG_OP = 'UPDATE' THEN
      FOREACH k IN ARRAY ARRAY['stamp_path','stamp_x','stamp_y','stamp_position_type','stamp_size','stamp_opacity','watermark_path',
        'watermark_enabled','watermark_x','watermark_y','watermark_scale','watermark_opacity','watermark_mode'] LOOP
        IF (r->k) IS DISTINCT FROM (o->k) THEN v_changed := true; END IF;
      END LOOP;
    END IF;
    v_key := CASE WHEN v_changed THEN 'appearance' END;
  END IF;

  IF v_key IS NOT NULL THEN
    v_school := NULLIF(r->>'school_id', '')::uuid;
    IF v_school IS NULL AND r ? 'template_id' THEN
      SELECT t.school_id INTO v_school FROM public.report_templates t WHERE t.id = (r->>'template_id')::uuid;
    END IF;
    IF v_school IS NOT NULL AND NOT public.feature_enabled(v_school, v_key) THEN
      PERFORM public.feature__raise(v_key);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('learners','learner_editing'), ('nursery_learners','learner_editing'),
    ('marks','marks_entry'), ('assessment_marks','marks_entry'), ('nursery_assessments','marks_entry'),
    ('comment_templates','report_comments'), ('nursery_report_cards','report_comments'),
    ('report_cards','primary_reports'),
    ('report_templates','template_edit'), ('template_field_mappings','template_edit'),
    ('report_field_associations','template_edit'), ('template_field_rules','template_edit'),
    ('template_custom_fields','custom_fields'), ('report_field_definitions','custom_fields'),
    ('report_field_values','custom_fields'), ('custom_field_values','custom_fields'),
    ('system_settings','appearance'), ('school_info','appearance')
  ) AS v(tbl, feature) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS aa_feature_guard ON public.%I', t.tbl);
    EXECUTE format('CREATE TRIGGER aa_feature_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.feature_guard(%L)', t.tbl, t.feature);
  END LOOP;
END $$;

-- Download / print unlock: checks the feature switches, then issues (charging Learners once when pay-per-report).
CREATE OR REPLACE FUNCTION public.billing_unlock_report_output(_level text, _term_id uuid, _learner_ids uuid[], _action text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_school uuid; k text;
BEGIN
  IF _action NOT IN ('download','bulk_download','print','bulk_print') THEN RAISE EXCEPTION 'Invalid output action'; END IF;
  IF _level NOT IN ('primary','nursery') THEN RAISE EXCEPTION 'Invalid report level'; END IF;
  v_school := public.billing__caller_school_for_term(_term_id);
  FOREACH k IN ARRAY ARRAY[_level || '_reports', _action] LOOP
    IF NOT public.feature_enabled(v_school, k) THEN PERFORM public.feature__raise(k); END IF;
  END LOOP;
  RETURN public.billing__issue(v_school, _level, _term_id, _learner_ids, true, auth.uid(), false);
END $$;

REVOKE ALL ON FUNCTION public.feature_enabled(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feature__raise(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.feature_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_school_features() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_school_features() TO authenticated;
REVOKE ALL ON FUNCTION public.billing_unlock_report_output(text, uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_unlock_report_output(text, uuid, uuid[], text) TO authenticated;