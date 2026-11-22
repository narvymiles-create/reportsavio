-- ============ Per-term paid entitlements (one verified record per school, academic year and term) ============
CREATE TABLE public.school_term_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year integer NOT NULL,
  term_number integer NOT NULL CHECK (term_number BETWEEN 1 AND 3),
  source text NOT NULL DEFAULT 'subscription' CHECK (source IN ('subscription','manual_adjustment')),
  subscription_id uuid REFERENCES public.school_subscriptions(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.billing_payments(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text,
  UNIQUE (school_id, academic_year, term_number)
);
GRANT SELECT ON public.school_term_entitlements TO authenticated;
GRANT ALL ON public.school_term_entitlements TO service_role;
ALTER TABLE public.school_term_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_term_entitlements_read ON public.school_term_entitlements FOR SELECT TO authenticated
  USING (public.is_super_admin() OR school_id = public.current_user_school_id());
COMMENT ON TABLE public.school_term_entitlements IS 'Verified paid terms; written only by subscription triggers. A paid term stays unlocked after its package expires.';

-- Every verified subscription records the term(s) it paid for; a cancelled (refunded) one withdraws only its own terms.
CREATE OR REPLACE FUNCTION public.billing_record_term_entitlements()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO public.school_term_entitlements (school_id, academic_year, term_number, source, subscription_id, payment_id)
    SELECT NEW.school_id, NEW.academic_year, t, 'subscription', NEW.id, NEW.payment_id
      FROM unnest(CASE WHEN NEW.plan = 'annual' THEN ARRAY[1,2,3] ELSE ARRAY[NEW.term_number] END) t
    ON CONFLICT (school_id, academic_year, term_number) DO UPDATE
      SET revoked_at = NULL, revoked_reason = NULL, subscription_id = EXCLUDED.subscription_id, payment_id = EXCLUDED.payment_id
      WHERE public.school_term_entitlements.revoked_at IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    UPDATE public.school_term_entitlements SET revoked_at = now(), revoked_reason = 'Subscription cancelled'
     WHERE subscription_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billing_record_term_entitlements() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER school_subscriptions_term_entitlements AFTER INSERT OR UPDATE OF status ON public.school_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.billing_record_term_entitlements();

-- Reconcile: every subscription already paid and activated gets its term record (expired ones included).
INSERT INTO public.school_term_entitlements (school_id, academic_year, term_number, source, subscription_id, payment_id, granted_at)
SELECT s.school_id, s.academic_year, t, 'subscription', s.id, s.payment_id, s.created_at
  FROM public.school_subscriptions s
  CROSS JOIN LATERAL unnest(CASE WHEN s.plan = 'annual' THEN ARRAY[1,2,3] ELSE ARRAY[s.term_number] END) t
 WHERE s.status = 'active'
ON CONFLICT (school_id, academic_year, term_number) DO NOTHING;

COMMENT ON FUNCTION public.billing__active_year_subscription(uuid, integer) IS 'DEPRECATED: packages unlock only their own term (school_term_entitlements)';

-- Status for the school's screens now also lists every paid term.
CREATE OR REPLACE FUNCTION public.billing_school_entitlement(_school uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_sub jsonb; v_lic jsonb; v_bal integer; v_terms jsonb;
BEGIN
  SELECT jsonb_build_object('id', s.id, 'plan', s.plan, 'tier', s.tier, 'capacity', s.capacity, 'grace_limit', s.grace_limit,
           'academic_year', s.academic_year, 'term_number', s.term_number, 'starts_on', s.starts_on, 'expires_on', s.expires_on,
           'state', public.billing_subscription_state(s.starts_on, s.expires_on, s.status))
    INTO v_sub FROM public.school_subscriptions s
   WHERE s.school_id = _school AND s.status = 'active'
     AND public.billing_subscription_state(s.starts_on, s.expires_on, s.status) IN ('active','grace')
   ORDER BY s.expires_on DESC, s.capacity DESC LIMIT 1;
  SELECT jsonb_build_object('id', d.id, 'tier', d.tier, 'capacity', d.capacity, 'grace_limit', d.grace_limit)
    INTO v_lic FROM public.desktop_licences d WHERE d.school_id = _school AND d.status = 'active' ORDER BY d.capacity DESC LIMIT 1;
  SELECT balance INTO v_bal FROM public.report_credit_accounts WHERE school_id = _school;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('academic_year', e.academic_year, 'term_number', e.term_number) ORDER BY e.academic_year DESC, e.term_number DESC), '[]'::jsonb)
    INTO v_terms FROM public.school_term_entitlements e WHERE e.school_id = _school AND e.revoked_at IS NULL;
  RETURN jsonb_build_object('school_id', _school, 'active', v_sub IS NOT NULL OR v_lic IS NOT NULL,
     'subscription', v_sub, 'licence', v_lic, 'learner_balance', COALESCE(v_bal, 0), 'paid_terms', v_terms);
END $$;

CREATE OR REPLACE FUNCTION public.billing__package_conflict(_school uuid, _product text, _details jsonb)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lic boolean; s record; v_start date; v_end date;
BEGIN
  v_lic := EXISTS (SELECT 1 FROM public.desktop_licences WHERE school_id = _school AND status = 'active');
  SELECT * INTO s FROM public.school_subscriptions x WHERE x.school_id = _school AND x.status = 'active'
    AND public.billing_subscription_state(x.starts_on, x.expires_on, x.status) IN ('active','grace') ORDER BY x.expires_on DESC LIMIT 1;
  IF _product IN ('online_term','online_annual') THEN
    IF v_lic THEN RETURN 'Your school already has an active desktop lifetime licence, which also unlocks online downloads and printing.'; END IF;
    IF EXISTS (SELECT 1 FROM public.school_term_entitlements e WHERE e.school_id = _school AND e.revoked_at IS NULL
        AND e.academic_year = NULLIF(_details->>'academic_year', '')::int
        AND (_product = 'online_annual' OR e.term_number = NULLIF(_details->>'term_number', '')::int)) THEN
      RETURN CASE WHEN _product = 'online_annual'
        THEN 'Your school has already paid for a term of this academic year. Choose termly packages for the remaining terms instead.'
        ELSE 'Your school has already paid for this term. Its report cards stay unlocked.' END;
    END IF;
    v_start := NULLIF(_details->>'starts_on', '')::date; v_end := NULLIF(_details->>'expires_on', '')::date;
    IF EXISTS (SELECT 1 FROM public.school_subscriptions x WHERE x.school_id = _school AND x.status = 'active'
        AND public.billing_subscription_state(x.starts_on, x.expires_on, x.status) IN ('scheduled','active','grace')
        AND (v_start IS NULL OR v_end IS NULL OR (x.starts_on <= v_end AND v_start <= x.expires_on))) THEN
      RETURN 'Your school already has an active package for this period. Upgrade it instead, or renew for a later term once it ends.';
    END IF;
  ELSIF _product = 'desktop_licence' THEN
    IF v_lic THEN RETURN 'Your school already owns a desktop licence. Use Upgrade to increase its capacity.'; END IF;
    IF s.id IS NOT NULL THEN RETURN format('Your school already has an active online package until %s. Choose a desktop licence after it ends, or contact Skavio Technologies to switch.', to_char(s.expires_on, 'DD Mon YYYY')); END IF;
  ELSIF _product = 'report_credits' THEN
    IF v_lic OR s.id IS NOT NULL THEN RETURN 'Your school already has an active package that covers report cards, so prepaid Learners are not needed.'; END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.billing__issue(_school uuid, _level text, _term_id uuid, _learners uuid[], _allow_charge boolean, _actor uuid, _dry_run boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  t record; v_year integer; v_term integer; v_sub uuid; v_paid_term boolean := false; v_method text; v_new uuid[]; v_new_count integer; v_licence boolean;
  v_balance integer; v_found integer; v_issue uuid; v_charged integer := 0; l uuid; res jsonb; v_reason text;
BEGIN
  IF _level NOT IN ('primary','nursery') THEN RAISE EXCEPTION 'Invalid report level'; END IF;
  SELECT id, name, year, school_id INTO t FROM public.terms WHERE id = _term_id;
  IF t.id IS NULL OR t.school_id <> _school THEN RAISE EXCEPTION 'Term not found for this school'; END IF;
  v_year := t.year;
  v_term := public.billing_term_number(t.name);
  v_licence := EXISTS (SELECT 1 FROM public.desktop_licences d WHERE d.school_id = _school AND d.status = 'active');
  IF v_term IS NULL THEN
    IF NOT v_licence THEN
      IF _dry_run THEN
        RETURN jsonb_build_object('method', 'none', 'paid', false, 'allowed', false, 'reason', 'term_unrecognised', 'enforcement', true,
          'requested', cardinality(COALESCE(_learners, '{}'::uuid[])), 'new', cardinality(COALESCE(_learners, '{}'::uuid[])), 'already_issued', 0,
          'credits_needed', 0, 'balance', 0, 'charged', 0, 'academic_year', v_year, 'term_number', 0);
      END IF;
      RAISE EXCEPTION 'BILLING_TERM_UNRECOGNISED: Name your terms "Term 1", "Term 2" and "Term 3" so report cards can be matched to the academic calendar.';
    END IF;
    v_term := 0;
  END IF;
  _learners := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(_learners, '{}'::uuid[])) x WHERE x IS NOT NULL);
  IF _level = 'primary' THEN
    SELECT count(*) INTO v_found FROM public.learners WHERE id = ANY(_learners) AND school_id = _school;
  ELSE
    SELECT count(*) INTO v_found FROM public.nursery_learners WHERE id = ANY(_learners) AND school_id = _school;
  END IF;
  IF v_found <> cardinality(_learners) THEN RAISE EXCEPTION 'One or more learners were not found in this school'; END IF;

  -- Only cards unlocked by a real entitlement stay free; cards recorded before locks existed ("legacy"/"unbilled") do not count.
  v_new := ARRAY(SELECT x FROM unnest(_learners) x WHERE NOT EXISTS (
    SELECT 1 FROM public.report_card_issues i WHERE i.school_id = _school AND i.level = _level AND i.learner_id = x
      AND i.academic_year = v_year AND i.term_number = v_term AND i.released_at IS NULL
      AND i.method IN ('subscription','per_report','licence')));
  v_new_count := cardinality(v_new);

  -- A paid term stays unlocked forever, and a package unlocks only the term(s) it was bought for.
  IF v_term > 0 THEN
    SELECT true, e.subscription_id INTO v_paid_term, v_sub FROM public.school_term_entitlements e
     WHERE e.school_id = _school AND e.academic_year = v_year AND e.term_number = v_term AND e.revoked_at IS NULL;
    v_paid_term := COALESCE(v_paid_term, false);
  END IF;
  IF v_paid_term THEN
    v_method := 'subscription';
  ELSIF v_licence THEN
    v_method := 'licence'; -- a valid lifetime licence never expires and unlocks online output too
  ELSE
    SELECT method INTO v_method FROM public.school_term_billing WHERE school_id = _school AND academic_year = v_year AND term_number = v_term;
    IF v_method IS NULL THEN SELECT default_method INTO v_method FROM public.school_billing_profiles WHERE school_id = _school; END IF;
    IF v_method IS DISTINCT FROM 'per_report' THEN v_method := NULL; END IF;
  END IF;
  IF v_method IS NULL THEN v_method := 'none'; END IF;
  SELECT balance INTO v_balance FROM public.report_credit_accounts WHERE school_id = _school;
  v_balance := COALESCE(v_balance, 0);

  res := jsonb_build_object('method', v_method, 'requested', cardinality(_learners), 'new', v_new_count,
    'already_issued', cardinality(_learners) - v_new_count, 'academic_year', v_year, 'term_number', v_term,
    'credits_needed', CASE WHEN v_method = 'per_report' THEN v_new_count ELSE 0 END,
    'balance', v_balance, 'enforcement', true, 'subscription_id', v_sub,
    'paid', v_new_count = 0 OR v_method IN ('subscription','licence'));

  IF v_new_count = 0 THEN RETURN res || jsonb_build_object('allowed', true, 'charged', 0); END IF;
  v_reason := CASE
    WHEN v_method = 'none' THEN 'plan_required'
    WHEN v_method = 'per_report' AND NOT _allow_charge THEN 'not_generated'
    WHEN v_method = 'per_report' AND v_balance < v_new_count THEN 'insufficient_credits' END;
  IF v_reason IS NOT NULL THEN
    IF _dry_run THEN RETURN res || jsonb_build_object('allowed', false, 'reason', v_reason, 'charged', 0); END IF;
    IF v_reason = 'plan_required' THEN
      RAISE EXCEPTION 'BILLING_PLAN_REQUIRED: No paid package covers Term % of %. Choose a package for that term and activate it to download or print.', v_term, v_year;
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
         OR public.report_card_issues.method NOT IN ('subscription','per_report','licence')
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