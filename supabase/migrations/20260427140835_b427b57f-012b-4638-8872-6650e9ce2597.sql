-- Replace per-level core subject limit with per-class limit
CREATE OR REPLACE FUNCTION public.validate_core_subjects_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  cnt int;
BEGIN
  IF NEW.is_core IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO cnt
  FROM public.subjects s
  WHERE s.is_core = true
    AND s.class_id = NEW.class_id
    AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF cnt >= 4 THEN
    RAISE EXCEPTION 'Only 4 core subjects allowed for this class.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;