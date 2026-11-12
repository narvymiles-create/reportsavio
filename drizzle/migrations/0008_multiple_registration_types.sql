ALTER TABLE public.learners ADD COLUMN IF NOT EXISTS active_reg_types text[] NOT NULL DEFAULT '{}';
UPDATE public.learners SET active_reg_types = ARRAY[active_reg_type] WHERE active_reg_type IS NOT NULL AND active_reg_types = '{}';
CREATE OR REPLACE FUNCTION public.validate_learner_registration()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE filled text[] := '{}';
BEGIN
  IF NEW.index_no IS NOT NULL AND NEW.index_no <> '' THEN filled := filled || 'INDEX'; END IF;
  IF NEW.lin_no IS NOT NULL AND NEW.lin_no <> '' THEN filled := filled || 'LIN'; END IF;
  IF NEW.reg_no IS NOT NULL AND NEW.reg_no <> '' THEN filled := filled || 'REG'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(NEW.active_reg_types,'{}')) t WHERE t NOT IN ('INDEX','LIN','REG')) THEN
    RAISE EXCEPTION 'Unknown registration type' USING ERRCODE = 'check_violation';
  END IF;
  -- Only filled numbers may be active; keep any selected order.
  NEW.active_reg_types := coalesce(ARRAY(SELECT t FROM unnest(coalesce(NEW.active_reg_types,'{}')) WITH ORDINALITY u(t,o) WHERE t = ANY(filled) ORDER BY o), '{}');
  IF cardinality(NEW.active_reg_types) = 0 THEN NEW.active_reg_types := filled; END IF;
  IF NEW.active_reg_type IS NULL OR NOT (NEW.active_reg_type = ANY(NEW.active_reg_types)) THEN
    NEW.active_reg_type := NEW.active_reg_types[1];
  END IF;
  RETURN NEW;
END;
$function$;