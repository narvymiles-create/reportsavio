DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['report_cards','nursery_assessments','system_settings','marks','learners','grading_scales','nursery_learners'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_update_'||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (((school_id = public.current_user_school_id()) AND public.has_role(auth.uid(), ''admin''::public.app_role)) OR public.is_super_admin()) WITH CHECK (((school_id = public.current_user_school_id()) AND public.has_role(auth.uid(), ''admin''::public.app_role)) OR public.is_super_admin())', 'tenant_update_'||t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.validate_primary_assessments() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v jsonb; a jsonb; ids text[] := '{}'; names text[] := '{}'; m text; arr text; f text; s numeric := 0; n int := 0; eot_active boolean := false;
BEGIN
  IF NEW.key <> 'primary_assessments' THEN RETURN NEW; END IF;
  v := NEW.value;
  IF jsonb_typeof(v) <> 'object' OR jsonb_typeof(v->'assessments') <> 'array' THEN RAISE EXCEPTION 'Assessment settings are invalid.'; END IF;
  IF jsonb_array_length(v->'assessments') < 1 OR jsonb_array_length(v->'assessments') > 30 THEN RAISE EXCEPTION 'Add between 1 and 30 assessments.'; END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(v->'assessments') LOOP
    IF jsonb_typeof(a) <> 'object' OR coalesce(a->>'id','') !~ '^[a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'Assessment settings are invalid.'; END IF;
    IF length(trim(coalesce(a->>'name',''))) = 0 OR length(a->>'name') > 100 THEN RAISE EXCEPTION 'Every assessment needs a name.'; END IF;
    IF jsonb_typeof(a->'maxMarks') <> 'number' OR (a->>'maxMarks')::numeric <= 0 OR (a->>'maxMarks')::numeric > 1000 THEN RAISE EXCEPTION 'Maximum marks must be between 1 and 1000.'; END IF;
    IF a ? 'weight' AND jsonb_typeof(a->'weight') NOT IN ('null','number') THEN RAISE EXCEPTION 'Assessment percentages must be numbers.'; END IF;
    IF jsonb_typeof(a->'weight') = 'number' AND ((a->>'weight')::numeric < 0 OR (a->>'weight')::numeric > 100) THEN RAISE EXCEPTION 'Assessment percentages must be between 0 and 100.'; END IF;
    IF (a->>'id') = ANY(ids) OR lower(trim(a->>'name')) = ANY(names) THEN RAISE EXCEPTION 'Assessment names must be unique.'; END IF;
    ids := ids || (a->>'id'); names := names || lower(trim(a->>'name'));
    IF a->>'id' = 'eot' AND coalesce(a->>'active','true') <> 'false' THEN eot_active := true; END IF;
  END LOOP;
  m := coalesce(v->>'method','current'); arr := coalesce(v->>'arrangement','separate');
  IF m NOT IN ('current','eot_only','average','weighted') OR arr NOT IN ('separate','merged','merged_final') THEN RAISE EXCEPTION 'Assessment settings are invalid.'; END IF;
  IF m IN ('current','eot_only') AND NOT eot_active THEN RAISE EXCEPTION 'This calculation needs the End of Term assessment to be active.'; END IF;
  IF v ? 'finalIds' AND jsonb_typeof(v->'finalIds') <> 'array' THEN RAISE EXCEPTION 'Assessment settings are invalid.'; END IF;
  IF m IN ('average','weighted') THEN
    FOR f IN SELECT jsonb_array_elements_text(coalesce(v->'finalIds','[]'::jsonb)) LOOP
      SELECT x INTO a FROM jsonb_array_elements(v->'assessments') x WHERE x->>'id' = f AND coalesce(x->>'active','true') <> 'false';
      IF a IS NULL THEN CONTINUE; END IF;
      n := n + 1;
      IF m = 'weighted' THEN
        IF jsonb_typeof(a->'weight') <> 'number' OR (a->>'weight')::numeric <= 0 THEN RAISE EXCEPTION 'Give every assessment in the final result a percentage above 0.'; END IF;
        s := s + (a->>'weight')::numeric;
      END IF;
    END LOOP;
    IF n = 0 THEN RAISE EXCEPTION 'Choose at least one active assessment for the final result.'; END IF;
    IF m = 'weighted' AND abs(s - 100) > 0.01 THEN RAISE EXCEPTION 'Final-result percentages must add up to 100.'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_primary_assessments() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_school_primary_assessments ON public.system_settings;
CREATE TRIGGER validate_school_primary_assessments BEFORE INSERT OR UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.validate_primary_assessments();