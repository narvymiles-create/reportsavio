-- Billing scenario checks for Skavio EduReports.
-- Runs inside one transaction against a real school and always rolls back, so no data is kept.
-- Expected outcome: the block ends with  ERROR: ALL_SCENARIOS_PASSED (rolled back) ...
DO $$
DECLARE
  a uuid := '733a3d5a-abff-411f-a4ee-5a9e6e9b1e9d';  -- school under test
  b uuid; t1 uuid; t3 uuid; ls uuid[]; lb uuid; r jsonb; p1 uuid; p2 uuid; p3 uuid; ok boolean; n integer; bal integer;
  log text := ''; v_year integer; st record; c integer; u uuid;
BEGIN
  SELECT id, year INTO t1, v_year FROM terms WHERE school_id = a AND name = 'Term 1' LIMIT 1;
  SELECT id INTO t3 FROM terms WHERE school_id = a AND name = 'Term 3' LIMIT 1;
  ls := ARRAY(SELECT id FROM learners WHERE school_id = a AND status = 'active' ORDER BY id LIMIT 4);
  SELECT id INTO b FROM schools WHERE id <> a LIMIT 1;
  SELECT id INTO lb FROM learners WHERE school_id <> a LIMIT 1;
  DELETE FROM report_card_issues WHERE school_id = a AND level = 'primary' AND learner_id = ANY(ls);
  UPDATE billing_settings SET enforcement_enabled = true WHERE id = 1;

  -- S1 no plan under enforcement -> blocked, nothing charged
  r := billing__issue(a, 'primary', t1, ls[1:1], true, NULL, true);
  IF (r->>'reason') <> 'plan_required' OR (r->>'paid')::boolean THEN RAISE EXCEPTION 'FAIL S1 %', r; END IF;
  log := log || 'S1 ok; ';

  -- S2 credit purchase is fulfilled once even if the webhook repeats
  INSERT INTO billing_payments (school_id, reference, product, description, amount, details)
  VALUES (a, 'TEST-S2-' || gen_random_uuid(), 'report_credits', '3 credits', 1500, '{"quantity":3}') RETURNING id INTO p1;
  r := billing_fulfil_payment(p1, 'SUCCESSFUL', 1500, 'UGX', 'GW-S2', 'MTN', 'TEST', NULL);
  r := billing_fulfil_payment(p1, 'SUCCESSFUL', 1500, 'UGX', 'GW-S2', 'MTN', 'TEST', NULL);
  IF (r->>'result') <> 'already_fulfilled' THEN RAISE EXCEPTION 'FAIL S2 %', r; END IF;
  SELECT balance INTO bal FROM report_credit_accounts WHERE school_id = a;
  IF bal <> 3 THEN RAISE EXCEPTION 'FAIL S2 balance %', bal; END IF;
  log := log || 'S2 ok; ';

  -- S3 wrong amount is flagged as a mismatch and grants nothing
  INSERT INTO billing_payments (school_id, reference, product, description, amount, details)
  VALUES (a, 'TEST-S3-' || gen_random_uuid(), 'report_credits', '20 credits', 10000, '{"quantity":20}') RETURNING id INTO p2;
  r := billing_fulfil_payment(p2, 'SUCCESSFUL', 500, 'UGX', 'GW-S3', 'MTN', 'TEST', NULL);
  SELECT balance INTO bal FROM report_credit_accounts WHERE school_id = a;
  IF (r->>'result') <> 'mismatch' OR bal <> 3 THEN RAISE EXCEPTION 'FAIL S3 % %', r, bal; END IF;
  log := log || 'S3 ok; ';

  -- S4 pay per report: bulk of 2 charges 2, repeating charges 0, overlap charges only the new learner
  INSERT INTO school_term_billing (school_id, academic_year, term_number, method) VALUES (a, v_year, 1, 'per_report')
  ON CONFLICT (school_id, academic_year, term_number) DO UPDATE SET method = 'per_report', subscription_id = NULL;
  r := billing__issue(a, 'primary', t1, ls[1:2], true, NULL, false);
  IF (r->>'charged')::int <> 2 THEN RAISE EXCEPTION 'FAIL S4a %', r; END IF;
  r := billing__issue(a, 'primary', t1, ls[1:2], true, NULL, false);
  IF (r->>'charged')::int <> 0 THEN RAISE EXCEPTION 'FAIL S4b %', r; END IF;
  r := billing__issue(a, 'primary', t1, ls[1:3], true, NULL, false);
  IF (r->>'charged')::int <> 1 THEN RAISE EXCEPTION 'FAIL S4c %', r; END IF;
  log := log || 'S4 ok; ';

  -- S5 not enough credits -> refused, nothing charged
  ok := false;
  BEGIN PERFORM billing__issue(a, 'primary', t1, ls[4:4], true, NULL, false);
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'BILLING_INSUFFICIENT_CREDITS%'; END;
  SELECT used INTO n FROM report_credit_accounts WHERE school_id = a;
  IF NOT ok OR n <> 3 THEN RAISE EXCEPTION 'FAIL S5 % %', ok, n; END IF;
  log := log || 'S5 ok; ';

  -- S6 a different term is billed separately (needs its own credit)
  INSERT INTO school_term_billing (school_id, academic_year, term_number, method) VALUES (a, v_year, 3, 'per_report')
  ON CONFLICT (school_id, academic_year, term_number) DO UPDATE SET method = 'per_report', subscription_id = NULL;
  r := billing__issue(a, 'primary', t3, ls[1:1], true, NULL, true);
  IF (r->>'reason') <> 'insufficient_credits' OR (r->>'new')::int <> 1 THEN RAISE EXCEPTION 'FAIL S6 %', r; END IF;
  log := log || 'S6 ok; ';

  -- S7 termly subscription covers the term: no credits used
  INSERT INTO billing_payments (school_id, reference, product, description, amount, details)
  VALUES (a, 'TEST-S7-' || gen_random_uuid(), 'online_term', 'Term 3', 65000,
    jsonb_build_object('academic_year', v_year, 'term_number', 3, 'tier', 'T150', 'capacity', 150, 'grace_limit', 165,
      'starts_on', billing_today() - 1, 'expires_on', billing_today() + 60)) RETURNING id INTO p3;
  r := billing_fulfil_payment(p3, 'SUCCESSFUL', 65000, 'UGX', 'GW-S7', 'AIRTEL', 'TEST', NULL);
  IF (r->>'result') <> 'fulfilled' THEN RAISE EXCEPTION 'FAIL S7 pay %', r; END IF;
  r := billing__issue(a, 'primary', t3, ls[1:4], true, NULL, false);
  IF (r->>'method') <> 'subscription' OR (r->>'charged')::int <> 0 THEN RAISE EXCEPTION 'FAIL S7 %', r; END IF;
  log := log || 'S7 ok; ';

  -- S8 capacity: above the 10% allowance, activating another learner is refused; archiving is always allowed
  INSERT INTO school_billing_profiles (school_id, custom_capacity, custom_grace_limit) VALUES (a, 10, 11)
  ON CONFLICT (school_id) DO UPDATE SET custom_capacity = 10, custom_grace_limit = 11;
  PERFORM billing_refresh_capacity(a);
  SELECT * INTO st FROM school_capacity_status WHERE school_id = a AND edition = 'online';
  IF st.state <> 'exceeded' THEN RAISE EXCEPTION 'FAIL S8 state %', st.state; END IF;
  UPDATE learners SET status = 'archived' WHERE id = ls[1];
  ok := false;
  BEGIN UPDATE learners SET status = 'active' WHERE id = ls[1];
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'BILLING_CAPACITY_UPGRADE_REQUIRED%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL S8 guard'; END IF;
  log := log || 'S8 ok; ';

  -- S10 Growth Allowance is permanent: within the allowance there is no countdown, even months later
  c := billing_active_learner_count(a);
  IF c < 2 THEN RAISE EXCEPTION 'FAIL S10 needs at least 2 active learners'; END IF;
  UPDATE school_billing_profiles SET custom_capacity = c - 1, custom_grace_limit = c + 5 WHERE school_id = a;
  PERFORM billing_refresh_capacity(a);
  UPDATE school_capacity_status SET over_since = now() - interval '120 days' WHERE school_id = a;
  PERFORM billing_refresh_capacity(a);
  SELECT * INTO st FROM school_capacity_status WHERE school_id = a AND edition = 'online';
  IF st.state <> 'allowance' OR st.grace_ends_at IS NOT NULL THEN RAISE EXCEPTION 'FAIL S10 state % %', st.state, st.grace_ends_at; END IF;
  UPDATE learners SET status = 'active' WHERE id = ls[1];  -- still inside the allowance: allowed
  log := log || 'S10 ok; ';

  -- S11 a desktop lifetime licence unlocks output without using Learners
  INSERT INTO desktop_licences (school_id, licence_key, tier, capacity, grace_limit, version, status, max_devices)
  VALUES (a, 'TEST-S11-' || gen_random_uuid(), 'desktop_300', 300, 330, 1, 'active', 1);
  SELECT used INTO n FROM report_credit_accounts WHERE school_id = a;
  r := billing__issue(a, 'primary', t1, ls[4:4], true, NULL, false);
  IF (r->>'method') <> 'licence' OR (r->>'charged')::int <> 0 OR NOT (r->>'paid')::boolean THEN RAISE EXCEPTION 'FAIL S11 %', r; END IF;
  log := log || 'S11 ok; ';

  -- S12 feature switches: a school override wins over the global default and blocks in the database
  SELECT m.user_id INTO u FROM school_members m JOIN user_roles ur ON ur.user_id = m.user_id AND ur.role = 'admin'
   WHERE m.school_id = a LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  INSERT INTO school_feature_overrides (school_id, feature_key, enabled) VALUES (a, 'download', false);
  ok := false;
  BEGIN PERFORM billing_unlock_report_output('primary', t1, ls[4:4], 'download');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'FEATURE_DISABLED: Download is turned off%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL S12 download'; END IF;
  r := billing_unlock_report_output('primary', t1, ls[4:4], 'print');  -- print still allowed
  UPDATE platform_features SET enabled = false WHERE key = 'learner_editing';
  ok := false;
  BEGIN UPDATE learners SET full_name = full_name WHERE id = ls[2];
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'FEATURE_DISABLED%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL S12 global'; END IF;
  INSERT INTO school_feature_overrides (school_id, feature_key, enabled) VALUES (a, 'learner_editing', true);
  UPDATE learners SET full_name = full_name WHERE id = ls[2];  -- school override wins
  PERFORM set_config('request.jwt.claims', '', true);
  log := log || 'S12 ok; ';

  -- S9 school isolation: another school's learner can never be issued under this school
  ok := false;
  BEGIN PERFORM billing__issue(a, 'primary', t1, ARRAY[lb], true, NULL, false);
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE '%not found in this school%'; END;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL S9'; END IF;
  log := log || 'S9 ok; ';

  RAISE EXCEPTION 'ALL_SCENARIOS_PASSED (rolled back): %', log;
END $$;
