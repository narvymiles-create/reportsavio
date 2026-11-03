CREATE TABLE public.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  level text NOT NULL CHECK (level IN ('nursery','primary')),
  name text NOT NULL,
  file_path text NOT NULL,
  page_width numeric NOT NULL DEFAULT 595.28,
  page_height numeric NOT NULL DEFAULT 841.89,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX report_templates_one_active_per_level ON public.report_templates (school_id, level) WHERE is_active;

CREATE TABLE public.template_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  template_id uuid NOT NULL REFERENCES public.report_templates(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  page integer NOT NULL DEFAULT 1,
  x numeric NOT NULL,
  y numeric NOT NULL,
  width numeric NOT NULL DEFAULT 140,
  height numeric NOT NULL DEFAULT 18,
  font_size numeric NOT NULL DEFAULT 8,
  align text NOT NULL DEFAULT 'left' CHECK (align IN ('left','center','right')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, field_key, page)
);

CREATE TABLE public.template_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  template_id uuid NOT NULL REFERENCES public.report_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','percentage','multiline')),
  description text,
  scope text NOT NULL DEFAULT 'learner' CHECK (scope IN ('school','learner')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  field_id uuid NOT NULL REFERENCES public.template_custom_fields(id) ON DELETE CASCADE,
  learner_id uuid,
  term_id uuid,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX custom_field_values_unique ON public.custom_field_values (field_id, COALESCE(learner_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(term_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO authenticated;
GRANT ALL ON public.report_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_field_mappings TO authenticated;
GRANT ALL ON public.template_field_mappings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_custom_fields TO authenticated;
GRANT ALL ON public.template_custom_fields TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_field_values TO authenticated;
GRANT ALL ON public.custom_field_values TO service_role;

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read report_templates" ON public.report_templates FOR SELECT TO authenticated USING (school_id = public.current_user_school_id() OR public.is_super_admin());
CREATE POLICY "admins insert report_templates" ON public.report_templates FOR INSERT TO authenticated WITH CHECK ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY "admins update report_templates" ON public.report_templates FOR UPDATE TO authenticated USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY "admins delete report_templates" ON public.report_templates FOR DELETE TO authenticated USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());

CREATE POLICY "members read template_field_mappings" ON public.template_field_mappings FOR SELECT TO authenticated USING (school_id = public.current_user_school_id() OR public.is_super_admin());
CREATE POLICY "admins insert template_field_mappings" ON public.template_field_mappings FOR INSERT TO authenticated WITH CHECK ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY "admins update template_field_mappings" ON public.template_field_mappings FOR UPDATE TO authenticated USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY "admins delete template_field_mappings" ON public.template_field_mappings FOR DELETE TO authenticated USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());

CREATE POLICY "members read template_custom_fields" ON public.template_custom_fields FOR SELECT TO authenticated USING (school_id = public.current_user_school_id() OR public.is_super_admin());
CREATE POLICY "admins insert template_custom_fields" ON public.template_custom_fields FOR INSERT TO authenticated WITH CHECK ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY "admins update template_custom_fields" ON public.template_custom_fields FOR UPDATE TO authenticated USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY "admins delete template_custom_fields" ON public.template_custom_fields FOR DELETE TO authenticated USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());

CREATE POLICY "members read custom_field_values" ON public.custom_field_values FOR SELECT TO authenticated USING (school_id = public.current_user_school_id() OR public.is_super_admin());
CREATE POLICY "admins insert custom_field_values" ON public.custom_field_values FOR INSERT TO authenticated WITH CHECK ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY "admins update custom_field_values" ON public.custom_field_values FOR UPDATE TO authenticated USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY "admins delete custom_field_values" ON public.custom_field_values FOR DELETE TO authenticated USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());

CREATE TRIGGER trg_report_templates_set_school_id BEFORE INSERT ON public.report_templates FOR EACH ROW EXECUTE FUNCTION set_school_id_from_user();
CREATE TRIGGER trg_report_templates_updated BEFORE UPDATE ON public.report_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_template_field_mappings_set_school_id BEFORE INSERT ON public.template_field_mappings FOR EACH ROW EXECUTE FUNCTION set_school_id_from_user();
CREATE TRIGGER trg_template_custom_fields_set_school_id BEFORE INSERT ON public.template_custom_fields FOR EACH ROW EXECUTE FUNCTION set_school_id_from_user();
CREATE TRIGGER trg_template_custom_fields_updated BEFORE UPDATE ON public.template_custom_fields FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_custom_field_values_set_school_id BEFORE INSERT ON public.custom_field_values FOR EACH ROW EXECUTE FUNCTION set_school_id_from_user();
CREATE TRIGGER trg_custom_field_values_updated BEFORE UPDATE ON public.custom_field_values FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "members read report template files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'report-templates' AND ((storage.foldername(name))[1] = public.current_user_school_id()::text OR public.is_super_admin()));
CREATE POLICY "admins upload report template files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'report-templates' AND ((storage.foldername(name))[1] = public.current_user_school_id()::text AND public.has_role(auth.uid(), 'admin') OR public.is_super_admin()));
CREATE POLICY "admins update report template files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'report-templates' AND ((storage.foldername(name))[1] = public.current_user_school_id()::text AND public.has_role(auth.uid(), 'admin') OR public.is_super_admin()));
CREATE POLICY "admins delete report template files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'report-templates' AND ((storage.foldername(name))[1] = public.current_user_school_id()::text AND public.has_role(auth.uid(), 'admin') OR public.is_super_admin()));