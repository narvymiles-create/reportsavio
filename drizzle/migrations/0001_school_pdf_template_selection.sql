GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO authenticated;
GRANT ALL ON public.report_templates TO service_role;
ALTER TABLE public.report_templates ADD COLUMN IF NOT EXISTS field_names jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.report_templates ADD COLUMN IF NOT EXISTS page_count integer NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION public.select_report_template(_level text, _template_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid;
BEGIN
 sid := public.current_user_school_id();
 IF sid IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF _level NOT IN ('primary','nursery') THEN RAISE EXCEPTION 'Unsupported education level'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(sid::text || _level, 0));
 IF _template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.report_templates WHERE id = _template_id AND school_id = sid AND level = _level) THEN RAISE EXCEPTION 'Template not found in this school and level'; END IF;
 UPDATE public.report_templates SET is_active = false WHERE school_id = sid AND level = _level AND is_active;
 IF _template_id IS NOT NULL THEN UPDATE public.report_templates SET is_active = true WHERE id = _template_id AND school_id = sid; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.select_report_template(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_report_template(text,uuid) TO authenticated, service_role;