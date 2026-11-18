DO $mig$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.billing__issue(uuid,text,uuid,uuid[],boolean,uuid,boolean)'::regprocedure);
  def := replace(def, '% new report card(s) need % credit(s) but only % remain. Buy more report-card credits in Billing & Subscription.',
                      '% new report card(s) need % learner(s) but only % remain. Buy more learners in Billing & Subscription.');
  EXECUTE def;

  def := pg_get_functiondef('public.billing_fulfil_payment(uuid,text,numeric,text,text,text,text,text)'::regprocedure);
  def := replace(def, $q$format('%s report-card credits', d->>'quantity')$q$, $q$format('%s learners (pay per report card)', d->>'quantity')$q$);
  EXECUTE def;

  def := pg_get_functiondef('public.billing_daily_maintenance()'::regprocedure);
  def := replace(def, $q$'Report-card credits are running low', format('%s credit(s) remain. Buy more to keep generating new report cards.', acc.balance)$q$,
                      $q$'Learners are running low', format('%s learner(s) remain. Buy more to keep generating new report cards.', acc.balance)$q$);
  EXECUTE def;
END $mig$;