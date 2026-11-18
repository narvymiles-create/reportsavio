-- ============ Manual payments, activation keys, audit log; locks always on ============

-- Manual (mobile money to Skavio) orders live in billing_payments next to gateway payments.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.billing_payments'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%channel%' LOOP
    EXECUTE format('ALTER TABLE public.billing_payments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.billing_payments ADD CONSTRAINT billing_payments_channel_check
  CHECK (channel IS NULL OR channel IN ('hosted_checkout','mobile_money','manual'));
ALTER TABLE public.billing_payments
  ADD COLUMN IF NOT EXISTS review_status text CHECK (review_status IN ('awaiting_proof','submitted','approved','rejected','activated')),
  ADD COLUMN IF NOT EXISTS payer_reference text,
  ADD COLUMN IF NOT EXISTS payer_phone text,
  ADD COLUMN IF NOT EXISTS proof_path text,
  ADD COLUMN IF NOT EXISTS proof_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;
CREATE INDEX IF NOT EXISTS billing_payments_review_idx ON public.billing_payments (review_status, created_at DESC) WHERE channel = 'manual';

CREATE TABLE public.billing_activation_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.billing_payments(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_hint text NOT NULL,
  product text NOT NULL,
  package jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','used','revoked','expired')),
  expires_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE UNIQUE INDEX billing_activation_keys_one_live ON public.billing_activation_keys (payment_id) WHERE status = 'issued';
GRANT SELECT ON public.billing_activation_keys TO authenticated;
GRANT ALL ON public.billing_activation_keys TO service_role;
ALTER TABLE public.billing_activation_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_activation_keys_admin_read ON public.billing_activation_keys FOR SELECT TO authenticated USING (public.is_super_admin());

CREATE TABLE public.billing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  payment_id uuid,
  key_id uuid,
  action text NOT NULL,
  actor uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_audit_log_school_idx ON public.billing_audit_log (school_id, created_at DESC);
CREATE INDEX billing_audit_log_action_idx ON public.billing_audit_log (action, school_id, created_at DESC);
GRANT SELECT ON public.billing_audit_log TO authenticated;
GRANT ALL ON public.billing_audit_log TO service_role;
ALTER TABLE public.billing_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_audit_log_read ON public.billing_audit_log FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (school_id IS NOT NULL AND public.is_school_billing_admin(school_id)));

CREATE OR REPLACE FUNCTION public.billing__audit(_school uuid, _payment uuid, _key uuid, _action text, _details jsonb DEFAULT '{}'::jsonb)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  INSERT INTO public.billing_audit_log (school_id, payment_id, key_id, action, actor, details)
  VALUES (_school, _payment, _key, _action, auth.uid(), COALESCE(_details, '{}'::jsonb))
$$;

-- What a school is entitled to right now (subscription in its term/grace, lifetime licence, Learner balance).
CREATE OR REPLACE FUNCTION public.billing_school_entitlement(_school uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_sub jsonb; v_lic jsonb; v_bal integer;
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
  RETURN jsonb_build_object('school_id', _school, 'active', v_sub IS NOT NULL OR v_lic IS NOT NULL,
    'subscription', v_sub, 'licence', v_lic, 'learner_balance', COALESCE(v_bal, 0));
END $$;

CREATE OR REPLACE FUNCTION public.billing_my_entitlement()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.current_user_school_id() IS NULL
    THEN jsonb_build_object('active', false, 'learner_balance', 0)
    ELSE public.billing_school_entitlement(public.current_user_school_id()) END
$$;

-- 25 random Crockford-base32 characters (125 bits), shown as SKV-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX; only the hash is stored.
CREATE OR REPLACE FUNCTION public.billing__new_key(_payment_id uuid, _days integer DEFAULT 30)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  p public.billing_payments; v_alpha constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_raw text; v_bytes bytea; i integer; v_id uuid; v_exp timestamptz := now() + make_interval(days => _days);
BEGIN
  SELECT * INTO p FROM public.billing_payments WHERE id = _payment_id;
  LOOP
    v_bytes := extensions.gen_random_bytes(25); v_raw := '';
    FOR i IN 0..24 LOOP v_raw := v_raw || substr(v_alpha, (get_byte(v_bytes, i) % 32) + 1, 1); END LOOP;
    BEGIN
      INSERT INTO public.billing_activation_keys (school_id, payment_id, key_hash, key_hint, product, package, expires_at, created_by)
      VALUES (p.school_id, p.id, encode(extensions.digest(v_raw, 'sha256'), 'hex'), right(v_raw, 4), p.product,
        jsonb_build_object('description', p.description, 'amount', p.amount, 'reference', p.reference) || p.details, v_exp, auth.uid())
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (SELECT 1 FROM public.billing_activation_keys WHERE payment_id = p.id AND status = 'issued') THEN RAISE; END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('key_id', v_id, 'expires_at', v_exp,
    'key', 'SKV-' || substr(v_raw, 1, 5) || '-' || substr(v_raw, 6, 5) || '-' || substr(v_raw, 11, 5) || '-' || substr(v_raw, 16, 5) || '-' || substr(v_raw, 21, 5));
END $$;

-- School submits its transaction ID and/or screenshot for a manual order.
CREATE OR REPLACE FUNCTION public.billing_manual_submit_proof(_payment_id uuid, _payer_reference text, _payer_phone text, _proof_path text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.billing_payments; v_school uuid := public.current_user_school_id(); v_ref text := nullif(btrim(_payer_reference), ''); v_path text := nullif(btrim(_proof_path), '');
BEGIN
  SELECT * INTO p FROM public.billing_payments WHERE id = _payment_id FOR UPDATE;
  IF p.id IS NULL OR p.school_id IS DISTINCT FROM v_school OR NOT public.is_school_billing_admin(v_school) THEN RAISE EXCEPTION 'Payment order not found'; END IF;
  IF p.channel IS DISTINCT FROM 'manual' OR p.status <> 'pending' OR COALESCE(p.review_status, '') NOT IN ('awaiting_proof','submitted') THEN
    RAISE EXCEPTION 'This order can no longer be changed.';
  END IF;
  IF v_ref IS NULL AND v_path IS NULL THEN RAISE EXCEPTION 'Enter the transaction ID or attach the payment screenshot.'; END IF;
  IF v_ref IS NOT NULL AND length(v_ref) > 80 THEN RAISE EXCEPTION 'The transaction ID is too long.'; END IF;
  IF v_path IS NOT NULL THEN
    IF v_path NOT LIKE p.school_id::text || '/' || p.id::text || '/%' OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'payment-proofs' AND o.name = v_path) THEN
      RAISE EXCEPTION 'The screenshot upload could not be found. Please attach it again.';
    END IF;
  END IF;
  UPDATE public.billing_payments SET review_status = 'submitted', proof_submitted_at = now(),
    payer_reference = COALESCE(v_ref, payer_reference), payer_phone = COALESCE(left(nullif(btrim(_payer_phone), ''), 20), payer_phone),
    proof_path = COALESCE(v_path, proof_path), updated_at = now()
  WHERE id = p.id;
  PERFORM public.billing__audit(p.school_id, p.id, NULL, 'proof_submitted', jsonb_build_object('payer_reference', v_ref, 'screenshot', v_path IS NOT NULL));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Platform admin approves (issues a single-use key, returned once) or rejects a manual payment.
CREATE OR REPLACE FUNCTION public.billing_admin_review_payment(_payment_id uuid, _approve boolean, _note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.billing_payments; k jsonb; v_note text := left(nullif(btrim(_note), ''), 500);
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
  UPDATE public.billing_payments SET review_status = 'approved', review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p.id;
  k := public.billing__new_key(p.id);
  PERFORM public.billing__audit(p.school_id, p.id, NULL, 'payment_approved', jsonb_build_object('note', v_note, 'amount', p.amount));
  PERFORM public.billing__audit(p.school_id, p.id, (k->>'key_id')::uuid, 'key_generated', jsonb_build_object('hint', right(replace(k->>'key', '-', ''), 4), 'expires_at', k->>'expires_at'));
  INSERT INTO public.billing_notifications (school_id, kind, dedupe_key, severity, title, body)
  VALUES (p.school_id, 'payment_approved', 'payment_approved:' || p.id, 'info', 'Payment verified',
    format('%s (%s) is verified. Enter the activation key Skavio sends you under Activate Package.', p.description, p.reference)) ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'status', 'approved') || k;
END $$;

-- Replace a lost/expired key: the old one stops working immediately.
CREATE OR REPLACE FUNCTION public.billing_admin_reissue_key(_payment_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE p public.billing_payments; k jsonb; v_old integer;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Only Skavio platform administrators can issue keys.'; END IF;
  SELECT * INTO p FROM public.billing_payments WHERE id = _payment_id FOR UPDATE;
  IF p.id IS NULL OR p.channel IS DISTINCT FROM 'manual' OR p.review_status IS DISTINCT FROM 'approved' OR p.status <> 'pending' THEN
    RAISE EXCEPTION 'Keys can only be reissued for approved payments that have not been activated.';
  END IF;
  UPDATE public.billing_activation_keys SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   WHERE payment_id = p.id AND status IN ('issued','expired');
  GET DIAGNOSTICS v_old = ROW_COUNT;
  k := public.billing__new_key(p.id);
  PERFORM public.billing__audit(p.school_id, p.id, (k->>'key_id')::uuid, 'key_reissued', jsonb_build_object('revoked_previous', v_old, 'expires_at', k->>'expires_at'));
  RETURN jsonb_build_object('ok', true) || k;
END $$;

CREATE OR REPLACE FUNCTION public.billing_admin_revoke_key(_key_id uuid, _note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE k public.billing_activation_keys;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Only Skavio platform administrators can revoke keys.'; END IF;
  UPDATE public.billing_activation_keys SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   WHERE id = _key_id AND status = 'issued' RETURNING * INTO k;
  IF k.id IS NULL THEN RAISE EXCEPTION 'Only unused keys can be revoked.'; END IF;
  PERFORM public.billing__audit(k.school_id, k.payment_id, k.id, 'key_revoked', jsonb_build_object('note', left(_note, 500)));
  RETURN jsonb_build_object('ok', true);
END $$;

-- School enters its key: validated against hash, school, payment approval, expiry and single use; then the
-- purchased package is fulfilled through the same function automated gateways use.
CREATE OR REPLACE FUNCTION public.billing_activate_key(_key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_school uuid := public.current_user_school_id(); v_norm text; v_hash text; v_fails integer;
  k public.billing_activation_keys; p public.billing_payments; r jsonb;
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

-- ============ Download / print locks are always on ============
COMMENT ON COLUMN public.billing_settings.enforcement_enabled IS 'Report output locks are always enforced; this flag now only controls learner-capacity limits';
UPDATE public.billing_settings SET enforcement_enabled = true WHERE id = 1;

CREATE OR REPLACE FUNCTION public.billing__issue(_school uuid, _level text, _term_id uuid, _learners uuid[], _allow_charge boolean, _actor uuid, _dry_run boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  t record; v_year integer; v_term integer; v_sub uuid; v_method text; v_new uuid[]; v_new_count integer; v_licence boolean;
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

  v_sub := CASE WHEN v_term > 0 THEN public.billing_term_subscription(_school, v_year, v_term) END;
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

-- ============ Storage: payment proofs (private, per school) and stored report files (entitled schools only) ============
CREATE POLICY payment_proofs_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = public.current_user_school_id()::text
    AND public.is_school_billing_admin(public.current_user_school_id()));
CREATE POLICY payment_proofs_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND (public.is_super_admin() OR (storage.foldername(name))[1] = public.current_user_school_id()::text));
CREATE POLICY report_cards_files_need_entitlement ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (CASE WHEN bucket_id <> 'report-cards' THEN true
    ELSE public.is_super_admin() OR COALESCE((public.billing_my_entitlement()->>'active')::boolean, false) END);

-- ============ Function privileges ============
REVOKE ALL ON FUNCTION public.billing__audit(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing__new_key(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_school_entitlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing__audit(uuid, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_school_entitlement(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.billing_my_entitlement() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_manual_submit_proof(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_admin_review_payment(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_admin_reissue_key(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_admin_revoke_key(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_activate_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_my_entitlement() TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_manual_submit_proof(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_review_payment(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_reissue_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_admin_revoke_key(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_activate_key(text) TO authenticated;