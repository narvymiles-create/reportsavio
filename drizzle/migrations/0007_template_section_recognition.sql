ALTER TABLE public.report_templates ADD COLUMN IF NOT EXISTS section_map jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.record_template_verification(_template_id uuid,_learner_id uuid,_term_id uuid,_academic_year integer,_results jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.report_templates; item jsonb; k text; needed boolean;
BEGIN SELECT * INTO t FROM public.report_templates WHERE id=_template_id AND school_id=public.current_user_school_id(); IF t.id IS NULL OR NOT(public.has_role(auth.uid(),'admin') OR public.is_super_admin()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.terms WHERE id=_term_id AND school_id=t.school_id) OR NOT EXISTS(SELECT 1 FROM public.academic_years WHERE school_id=t.school_id AND year=_academic_year) THEN RAISE EXCEPTION 'Choose a school term and year'; END IF;
IF t.level='primary' THEN IF NOT EXISTS(SELECT 1 FROM public.learners WHERE id=_learner_id AND school_id=t.school_id) THEN RAISE EXCEPTION 'Choose a learner in this school and level'; END IF; ELSE IF NOT EXISTS(SELECT 1 FROM public.nursery_learners WHERE id=_learner_id AND school_id=t.school_id) THEN RAISE EXCEPTION 'Choose a learner in this school and level'; END IF; END IF;
IF jsonb_typeof(_results) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid verification'; END IF;
FOR k IN SELECT jsonb_array_elements_text(t.field_names) LOOP
  SELECT v INTO item FROM jsonb_array_elements(_results) v WHERE v->>'key'=k; IF item IS NULL THEN RAISE EXCEPTION 'Verification incomplete; rerun the test'; END IF;
  SELECT coalesce(r.required,true) INTO needed FROM (SELECT 1) x LEFT JOIN public.template_field_rules r ON r.template_id=t.id AND r.field_key=k;
  IF needed AND item->>'status'='Unrecognised' THEN RAISE EXCEPTION 'Unrecognised template label: %',k; END IF;
END LOOP;
INSERT INTO public.template_verifications(template_id,school_id,level,learner_id,term_id,academic_year,verified_by,configuration_hash,results) VALUES(t.id,t.school_id,t.level,_learner_id,_term_id,_academic_year,auth.uid(),public.template_configuration_hash(t.id),_results) ON CONFLICT(template_id) DO UPDATE SET learner_id=excluded.learner_id,term_id=excluded.term_id,academic_year=excluded.academic_year,verified_by=excluded.verified_by,verified_at=now(),configuration_hash=excluded.configuration_hash,results=excluded.results; END $$;
REVOKE ALL ON FUNCTION public.record_template_verification(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_template_verification(uuid,uuid,uuid,integer,jsonb) TO authenticated,service_role;