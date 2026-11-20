-- ============ One pending request, one active package, year-wide coverage, reconciliation ============

ALTER TABLE public.billing_payments DROP CONSTRAINT IF EXISTS billing_payments_review_status_check;
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.billing_payments'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%review_status%' LOOP
    EXECUTE format('ALTER TABLE public.billing_payments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_review_status_check
  CHECK (review_status IN ('awaiting_proof','submitted','approved','rejected','activated','cancelled'));

-- Reconcile: an approved, unredeemed order whose period is already covered by an activated package is a duplicate.
-- Keep the record (history), cancel it and revoke its key so it can never activate a second package.
WITH dup AS (
  SELECT p.id, p.school_id FROM public.billing_payments p
  WHERE p.channel = 'manual' AND p.status = 'pending' AND p.review_status IN ('awaiting_proof','submitted','approved')
    AND p.product IN ('online_term','online_annual')
    AND EXISTS (SELECT 1 FROM public.school_subscriptions s WHERE s.school_id = p.school_id AND s.status = 'active'
      AND s.starts_on <= (p.details->>'expires_on')::date AND (p.details->>'starts_on')::date <= s.expires_on)
), rev AS (
  UPDATE public.billing_activation_keys k SET status = 'revoked', revoked_at = now()
  FROM dup WHERE k.payment_id = dup.id AND k.status = 'issued' RETURNING k.id
), upd AS (
  UPDATE public.billing_payments p SET status = 'cancelled', review_status = 'cancelled', updated_at = now(),
    review_note = 'Cancelled automatically: this period is already covered by an activated package.',
    failure_message = 'Duplicate request — the period is already covered by an activated package.'
  FROM dup WHERE p.id = dup.id RETURNING p.id, p.school_id
)
INSERT INTO public.billing_audit_log (school_id, payment_id, action, details)
SELECT school_id, id, 'reconciled_duplicate', jsonb_build_object('note', 'Duplicate of an activated package; key revoked') FROM upd;

-- Keep only the newest open request per school before enforcing one-at-a-time (older ones are cancelled, not deleted).
WITH ranked AS (
  SELECT id, school_id, row_number() OVER (PARTITION BY school_id ORDER BY created_at DESC) rn FROM public.billing_payments
  WHERE channel = 'manual' AND status = 'pending' AND review_status IN ('awaiting_proof','submitted')
), upd AS (
  UPDATE public.billing_payments p SET status = 'cancelled', review_status = 'cancelled', updated_at = now(),
    review_note = 'Cancelled automatically: only one open package request is allowed per school.'
  FROM ranked r WHERE p.id = r.id AND r.rn > 1 RETURNING p.id, p.school_id
)
INSERT INTO public.billing_audit_log (school_id, payment_id, action, details)
SELECT school_id, id, 'reconciled_duplicate', jsonb_build_object('note', 'Older open request cancelled; one open request per school') FROM upd;

-- At most one open (unreviewed) package request per school, enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_one_open_request
  ON public.billing_payments (school_id) WHERE channel = 'manual' AND status = 'pending' AND review_status IN ('awaiting_proof','submitted');

CREATE OR REPLACE FUNCTION public.billing__active_year_subscription(_school uuid, _year integer)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.id FROM public.school_subscriptions s
  WHERE s.school_id = _school AND s.academic_year = _year AND s.status = 'active'
    AND public.billing_subscription_state(s.starts_on, s.expires_on, s.status) IN ('active','grace')
  ORDER BY (s.plan = 'annual') DESC, s.capacity DESC LIMIT 1
$$;

-- Why a new package would conflict with the school's current one (NULL = allowed). Upgrades change the current package and never conflict.
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

-- School cancels its own open request (record kept for history).
CREATE OR REPLACE FUNCTION public.billing_manual_cancel_order(_payment_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.billing_payments; v_school uuid := public.current_user_school_id();
BEGIN
  SELECT * INTO p FROM public.billing_payments WHERE id = _payment_id FOR UPDATE;
  IF p.id IS NULL OR p.school_id IS DISTINCT FROM v_school OR NOT public.is_school_billing_admin(v_school) THEN RAISE EXCEPTION 'Payment order not found'; END IF;
  IF p.channel IS DISTINCT FROM 'manual' OR p.status <> 'pending' OR COALESCE(p.review_status, '') NOT IN ('awaiting_proof','submitted') THEN
    RAISE EXCEPTION 'Only requests that Skavio has not reviewed yet can be cancelled.';
  END IF;
  UPDATE public.billing_payments SET status = 'cancelled', review_status = 'cancelled', review_note = 'Cancelled by the school', updated_at = now() WHERE id = p.id;
  PERFORM public.billing__audit(p.school_id, p.id, NULL, 'order_cancelled', jsonb_build_object('by', 'school'));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Platform admin cancels an approved-but-unredeemed order (its key stops working).
CREATE OR REPLACE FUNCTION public.billing_admin_cancel_order(_payment_id uuid, _note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.billing_payments; v_note text := COALESCE(left(nullif(btrim(_note), ''), 500), 'Cancelled by Skavio');
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Only Skavio platform administrators can cancel orders.'; END IF;
  SELECT * INTO p FROM public.billing_payments WHERE id = _payment_id FOR UPDATE;
  IF p.id IS NULL OR p.channel IS DISTINCT FROM 'manual' OR p.status <> 'pending' OR COALESCE(p.review_status, '') NOT IN ('awaiting_proof','submitted','approved') THEN
    RAISE EXCEPTION 'Only open or approved, not yet activated orders can be cancelled.';
  END IF;
  UPDATE public.billing_activation_keys SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid() WHERE payment_id = p.id AND status = 'issued';
  UPDATE public.billing_payments SET status = 'cancelled', review_status = 'cancelled', review_note = v_note, updated_at = now() WHERE id = p.id;
  PERFORM public.billing__audit(p.school_id, p.id, NULL, 'order_cancelled', jsonb_build_object('by', 'skavio', 'note', v_note));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Approval refuses orders that would conflict with the school's current package.
CREATE OR REPLACE FUNCTION public.billing_admin_review_payment(_payment_id uuid, _approve boolean, _note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.billing_payments; k jsonb; v_note text := left(nullif(btrim(_note), ''), 500); v_conflict text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Only Skavio platform administrators can review payments.'; END IF;
  SELECT * INTO p FROM public.billing_payments WHERE id = _payment_id FOR UPDATE;
  IF p.id IS NULL OR p.channel IS DISTINCT FROM 'manual' THEN RAISE EXCEPTION 'Manual payment not found'; END IF;
  IF p.status <> 'pending' OR COALESCE(p.review_status, '') NOT IN ('awaiting_proof','submitted') THEN RAISE EXCEPTION 'This payment has already been reviewed.'; END IF;
  IF NOT _approve THEN
    IF v_note IS NULL THEN RAISE EXCEPTION 'Give the school a reason for rejecting the payment.'; END IF;
    UPDATE public.billing_payments SET status = 'cancelled', review_status = 'rejected', review_note = v_note, failure_message = v_note,
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p.id;
    PERFORM public.billing__audit(p.school_id, p.id, NULL, 'payment_rejected', jsonb_build_object('note', v_note));
    INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
    VALUES (p.school_id, 'payment_rejected', 'payment_rejected:' || p.id, 'warning', 'Payment could not be verified',
      format('%s (%s): %s', p.description, p.reference, v_note)) ON CONFLICT (dedupe_key) DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;
  v_conflict := public.billing__package_conflict(p.school_id, p.product, p.details);
  IF v_conflict IS NOT NULL THEN RAISE EXCEPTION 'Cannot approve: %', v_conflict; END IF;
  IF EXISTS (SELECT 1 FROM public.billing_payments o WHERE o.school_id = p.school_id AND o.id <> p.id AND o.channel = 'manual'
      AND o.status = 'pending' AND o.review_status = 'approved') THEN
    RAISE EXCEPTION 'Cannot approve: this school already has an approved order waiting for activation. Cancel it first.';
  END IF;
  UPDATE public.billing_payments SET review_status = 'approved', review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p.id;
  k := public.billing__new_key(p.id);
  PERFORM public.billing__audit(p.school_id, p.id, NULL, 'payment_approved', jsonb_build_object('note', v_note, 'amount', p.amount));
  PERFORM public.billing__audit(p.school_id, p.id, (k->>'key_id')::uuid, 'key_generated', jsonb_build_object('hint', right(replace(k->>'key', '-', ''), 4), 'expires_at', k->>'expires_at'));
  INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
  VALUES (p.school_id, 'payment_approved', 'payment_approved:' || p.id, 'info', 'Payment verified',
    format('%s (%s) is verified. Enter the activation key Skavio sends you under Activate Package.', p.description, p.reference)) ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'status', 'approved') || k;
END $$;

CREATE OR REPLACE FUNCTION public.billing_activate_key(_key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_school uuid := public.current_user_school_id(); v_norm text; v_hash text; v_fails integer;
  k public.billing_activation_keys; p public.billing_payments; r jsonb; v_conflict text;
  generic constant text := 'This activation key is not valid for your school. Check it and try again, or contact Skavio Technologies.';
BEGIN
  IF v_school IS NULL OR NOT public.is_school_billing_admin(v_school) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only school administrators can activate packages.');
  END IF;
  SELECT count(*) INTO v_fails FROM public.billing_audit_log
   WHERE school_id = v_school AND action = 'activation_failed' AND created_at > now() - interval '1 hour';
  IF v_fails >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many incorrect attempts. Please wait an hour, or contact Skavio Technologies.');
  END IF;
  v_norm := regexp_replace(upper(COALESCE(_key, '')), '[^0-9A-Z]', '', 'g');
  IF left(v_norm, 3) = 'SKV' AND length(v_norm) = 28 THEN v_norm := substr(v_norm, 4); END IF;
  v_norm := translate(v_norm, 'OIL', '011');
  IF length(v_norm) <> 25 THEN
    PERFORM public.billing__audit(v_school, NULL, NULL, 'activation_failed', jsonb_build_object('reason', 'malformed'));
    RETURN jsonb_build_object('ok', false, 'error', 'An activation key looks like SKV-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX. Check it and try again.');
  END IF;
  v_hash := encode(extensions.digest(v_norm, 'sha256'), 'hex');
  SELECT * INTO k FROM public.billing_activation_keys WHERE key_hash = v_hash FOR UPDATE;
  IF k.id IS NULL OR k.status = 'revoked' OR k.school_id IS DISTINCT FROM v_school THEN
    PERFORM public.billing__audit(v_school, NULL, CASE WHEN k.school_id = v_school THEN k.id END, 'activation_failed',
      jsonb_build_object('reason', CASE WHEN k.id IS NULL THEN 'unknown' WHEN k.school_id <> v_school THEN 'other_school' ELSE 'revoked' END));
    IF k.id IS NOT NULL AND k.school_id <> v_school THEN
      PERFORM public.billing__audit(k.school_id, k.payment_id, k.id, 'key_used_by_other_school', jsonb_build_object('attempted_by_school', v_school));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', generic);
  END IF;
  IF k.status = 'used' THEN
    PERFORM public.billing__audit(v_school, k.payment_id, k.id, 'activation_failed', jsonb_build_object('reason', 'already_used'));
    RETURN jsonb_build_object('ok', false, 'error', 'This activation key has already been used. Each key works only once.');
  END IF;
  IF k.status = 'expired' OR k.expires_at < now() THEN
    UPDATE public.billing_activation_keys SET status = 'expired' WHERE id = k.id AND status = 'issued';
    PERFORM public.billing__audit(v_school, k.payment_id, k.id, 'key_expired', '{}'::jsonb);
    RETURN jsonb_build_object('ok', false, 'error', 'This activation key has expired. Contact Skavio Technologies for a new one.');
  END IF;
  SELECT * INTO p FROM public.billing_payments WHERE id = k.payment_id FOR UPDATE;
  IF p.id IS NULL OR p.school_id IS DISTINCT FROM v_school OR p.channel IS DISTINCT FROM 'manual' OR p.review_status IS DISTINCT FROM 'approved' OR p.status IS DISTINCT FROM 'pending' THEN
    PERFORM public.billing__audit(v_school, k.payment_id, k.id, 'activation_failed', jsonb_build_object('reason', 'payment_not_approved', 'payment_status', p.status, 'review_status', p.review_status));
    RETURN jsonb_build_object('ok', false, 'error', generic);
  END IF;

  -- Serialise activations per school so two keys can never activate conflicting packages at the same time.
  PERFORM pg_advisory_xact_lock(hashtext('billing_activate:' || v_school::text));
  v_conflict := public.billing__package_conflict(v_school, p.product, p.details);
  IF v_conflict IS NOT NULL THEN
    PERFORM public.billing__audit(v_school, p.id, k.id, 'activation_blocked', jsonb_build_object('reason', 'package_conflict', 'detail', v_conflict));
    RETURN jsonb_build_object('ok', false, 'error', v_conflict || ' Contact Skavio Technologies if this is unexpected.');
  END IF;
  r := public.billing_fulfil_payment(p.id, 'SUCCESSFUL', p.amount, 'UGX', 'MANUAL-' || p.reference, 'manual', p.mode, NULL);
  IF r->>'result' NOT IN ('fulfilled','already_fulfilled') THEN
    RAISE EXCEPTION 'Activation could not be completed (%). Nothing was changed. Contact Skavio Technologies.', r->>'result';
  END IF;
  UPDATE public.billing_activation_keys SET status = 'used', used_at = now(), used_by = auth.uid() WHERE id = k.id;
  UPDATE public.billing_payments SET review_status = 'activated', updated_at = now() WHERE id = p.id;
  IF p.product = 'report_credits' THEN
    INSERT INTO public.school_billing_profiles (school_id, default_method) VALUES (p.school_id, 'per_report')
    ON CONFLICT (school_id) DO UPDATE SET default_method = COALESCE(public.school_billing_profiles.default_method, 'per_report');
  END IF;
  PERFORM public.billing__audit(v_school, p.id, k.id, 'package_activated', jsonb_build_object('product', p.product, 'description', p.description, 'result', r));
  RETURN jsonb_build_object('ok', true, 'product', p.product, 'description', p.description, 'reference', p.reference, 'entitlement', public.billing_school_entitlement(v_school));
END $$;

CREATE OR REPLACE FUNCTION public.billing__issue(_school uuid, _level text, _term_id uuid, _learners uuid[], _allow_charge boolean, _actor uuid, _dry_run boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  t record; v_year integer; v_term integer; v_sub uuid; v_year_sub uuid; v_method text; v_new uuid[]; v_new_count integer; v_licence boolean;
  v_balance integer; v_found integer; v_issue uuid; v_charged integer := 0; l uuid; res jsonb; v_reason text;
BEGIN
  IF _level NOT IN ('primary','nursery') THEN RAISE EXCEPTION 'Invalid report level'; END IF;
  SELECT id, name, year, school_id INTO t FROM public.terms WHERE id = _term_id;
  IF t.id IS NULL OR t.school_id <> _school THEN RAISE EXCEPTION 'Term not found for this school'; END IF;
  v_year := t.year;
  v_term := public.billing_term_number(t.name);
  v_licence := EXISTS (SELECT 1 FROM public.desktop_licences d WHERE d.school_id = _school AND d.status = 'active');
  -- A subscription that is active today covers every report card of its academic year.
  v_year_sub := public.billing__active_year_subscription(_school, v_year);
  IF v_term IS NULL THEN
    IF NOT v_licence AND v_year_sub IS NULL THEN
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

  v_sub := COALESCE(CASE WHEN v_term > 0 THEN public.billing_term_subscription(_school, v_year, v_term) END, v_year_sub);
  IF v_sub IS NOT NULL THEN
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
      RAISE EXCEPTION 'BILLING_PLAN_REQUIRED: No active package covers Term % of %. Choose a package and activate it to download or print.', v_term, v_year;
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

REVOKE ALL ON FUNCTION public.billing__active_year_subscription(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing__package_conflict(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing__package_conflict(uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.billing_manual_cancel_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_admin_cancel_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_manual_cancel_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_cancel_order(uuid, text) TO authenticated;