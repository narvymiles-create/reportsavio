CREATE OR REPLACE FUNCTION public.upload_report_template(_expected_level text, _name text, _file_path text, _page_width numeric, _page_height numeric, _page_count integer, _field_names jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid; active_level text; template_id uuid;
BEGIN
 sid := public.current_user_school_id();
 IF sid IS NULL OR NOT (public.has_role(auth.uid(), 'admin') OR public.is_super_admin()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT value #>> '{}' INTO active_level FROM public.system_settings WHERE school_id = sid AND key = 'report_module';
 active_level := COALESCE(active_level, 'primary');
 IF active_level NOT IN ('primary','nursery') OR _expected_level IS DISTINCT FROM active_level THEN RAISE EXCEPTION 'The active education level changed. Reopen the upload in the selected sidebar level.'; END IF;
 IF split_part(_file_path,'/',1) <> sid::text OR split_part(_file_path,'/',2) <> active_level OR array_length(string_to_array(_file_path,'/'),1) <> 3 OR _file_path NOT LIKE '%.pdf' THEN RAISE EXCEPTION 'The PDF must belong to the current school and active education level'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='report-templates' AND name=_file_path) THEN RAISE EXCEPTION 'Upload the PDF before registering the template'; END IF;
 IF NULLIF(btrim(_name),'') IS NULL OR _page_width <= 0 OR _page_height <= 0 OR _page_count < 1 OR jsonb_typeof(_field_names) <> 'array' THEN RAISE EXCEPTION 'Invalid template details'; END IF;
 INSERT INTO public.report_templates(school_id,level,name,file_path,page_width,page_height,page_count,field_names,is_active) VALUES(sid,active_level,btrim(_name),_file_path,_page_width,_page_height,_page_count,_field_names,false) RETURNING id INTO template_id;
 RETURN template_id;
END; $$;
REVOKE ALL ON FUNCTION public.upload_report_template(text,text,text,numeric,numeric,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upload_report_template(text,text,text,numeric,numeric,integer,jsonb) TO authenticated;
REVOKE INSERT ON public.report_templates FROM authenticated, anon;
CREATE OR REPLACE FUNCTION public.preserve_report_template_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.level IS DISTINCT FROM OLD.level OR NEW.file_path IS DISTINCT FROM OLD.file_path THEN RAISE EXCEPTION 'A template cannot be moved to another school or education level'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.preserve_report_template_scope() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER preserve_report_template_scope BEFORE UPDATE ON public.report_templates FOR EACH ROW EXECUTE FUNCTION public.preserve_report_template_scope();