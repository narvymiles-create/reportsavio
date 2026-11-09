CREATE TABLE public.report_field_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES public.schools(id), level text NOT NULL CHECK(level IN ('primary','nursery')), label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 120), field_type text NOT NULL DEFAULT 'text' CHECK(field_type IN ('text','number','date','percentage','multiline')), scope text NOT NULL DEFAULT 'learner' CHECK(scope IN ('school','learner')), archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(school_id,level,label)
);
GRANT SELECT,INSERT,UPDATE ON public.report_field_definitions TO authenticated;
GRANT ALL ON public.report_field_definitions TO service_role;
ALTER TABLE public.report_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY field_read ON public.report_field_definitions FOR SELECT TO authenticated USING(school_id=public.current_user_school_id());
CREATE POLICY field_add ON public.report_field_definitions FOR INSERT TO authenticated WITH CHECK(school_id=public.current_user_school_id() AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin()));
CREATE POLICY field_edit ON public.report_field_definitions FOR UPDATE TO authenticated USING(school_id=public.current_user_school_id() AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin())) WITH CHECK(school_id=public.current_user_school_id());
CREATE TABLE public.report_field_values (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES public.schools(id), level text NOT NULL CHECK(level IN ('primary','nursery')), definition_id uuid NOT NULL REFERENCES public.report_field_definitions(id), learner_id uuid, term_id uuid REFERENCES public.terms(id), academic_year integer, value text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.report_field_values TO authenticated;
GRANT ALL ON public.report_field_values TO service_role;
ALTER TABLE public.report_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY value_read ON public.report_field_values FOR SELECT TO authenticated USING(school_id=public.current_user_school_id());
CREATE POLICY value_manage ON public.report_field_values FOR ALL TO authenticated USING(school_id=public.current_user_school_id() AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin())) WITH CHECK(school_id=public.current_user_school_id() AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin()));
CREATE UNIQUE INDEX report_field_value_context ON public.report_field_values(definition_id,coalesce(learner_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(term_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(academic_year,0));
CREATE TABLE public.report_field_associations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES public.schools(id), level text NOT NULL CHECK(level IN ('primary','nursery')), template_id uuid NOT NULL REFERENCES public.report_templates(id) ON DELETE CASCADE, definition_id uuid REFERENCES public.report_field_definitions(id), source_key text, pdf_field text, page integer NOT NULL DEFAULT 1, x numeric NOT NULL DEFAULT 0, y numeric NOT NULL DEFAULT 0, width numeric NOT NULL DEFAULT 150, height numeric NOT NULL DEFAULT 25, font_size numeric NOT NULL DEFAULT 10, align text NOT NULL DEFAULT 'left' CHECK(align IN ('left','center','right')), CHECK((definition_id IS NULL) <> (source_key IS NULL)), CHECK(page>0 AND x>=0 AND y>=0 AND width>0 AND height>0 AND font_size BETWEEN 4 AND 48)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.report_field_associations TO authenticated;
GRANT ALL ON public.report_field_associations TO service_role;
ALTER TABLE public.report_field_associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY association_read ON public.report_field_associations FOR SELECT TO authenticated USING(school_id=public.current_user_school_id());
CREATE POLICY association_manage ON public.report_field_associations FOR ALL TO authenticated USING(school_id=public.current_user_school_id() AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin())) WITH CHECK(school_id=public.current_user_school_id() AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin()));
CREATE UNIQUE INDEX association_pdf_target ON public.report_field_associations(template_id,pdf_field) WHERE pdf_field IS NOT NULL;
CREATE FUNCTION public.validate_report_custom_field() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d public.report_field_definitions; t public.report_templates; learner_school uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.school_id<>OLD.school_id OR NEW.level<>OLD.level) THEN RAISE EXCEPTION 'School and level cannot be changed'; END IF;
 IF TG_TABLE_NAME='report_field_definitions' THEN
  IF TG_OP='UPDATE' AND (NEW.scope<>OLD.scope OR NEW.field_type<>OLD.field_type) AND EXISTS(SELECT 1 FROM public.report_field_values WHERE definition_id=NEW.id) THEN RAISE EXCEPTION 'Type and scope cannot change after values are saved'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.definition_id IS NOT NULL THEN
  SELECT * INTO d FROM public.report_field_definitions WHERE id=NEW.definition_id;
  IF d.id IS NULL OR d.school_id<>NEW.school_id OR d.level<>NEW.level OR d.archived THEN RAISE EXCEPTION 'Field must belong to the same school and level and be active'; END IF;
 END IF;
 IF TG_TABLE_NAME='report_field_associations' THEN
  SELECT * INTO t FROM public.report_templates WHERE id=NEW.template_id;
  IF t.id IS NULL OR t.school_id<>NEW.school_id OR t.level<>NEW.level THEN RAISE EXCEPTION 'Template must belong to the same school and level'; END IF;
  IF NEW.pdf_field IS NOT NULL AND NOT(t.field_names ? NEW.pdf_field) THEN RAISE EXCEPTION 'Choose a supported PDF field'; END IF;
  IF NEW.pdf_field IS NULL AND (NEW.page>t.page_count OR NEW.x+NEW.width>t.page_width OR NEW.y+NEW.height>t.page_height) THEN RAISE EXCEPTION 'Placement must fit inside the template page'; END IF;
  IF NEW.source_key IS NOT NULL AND NEW.source_key !~ '^(school|learner|term|report|class|stream|academic|bot|mid|eot|subject|learning)[.]' THEN RAISE EXCEPTION 'Invalid existing data source'; END IF;
 ELSE
  IF d.scope='school' AND NEW.learner_id IS NOT NULL OR d.scope='learner' AND NEW.learner_id IS NULL THEN RAISE EXCEPTION 'Choose the correct value scope'; END IF;
  IF NEW.learner_id IS NOT NULL THEN
   IF NEW.level='primary' THEN SELECT school_id INTO learner_school FROM public.learners WHERE id=NEW.learner_id; ELSE SELECT school_id INTO learner_school FROM public.nursery_learners WHERE id=NEW.learner_id; END IF;
   IF learner_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Learner must belong to the same school and level'; END IF;
  END IF;
  IF NEW.term_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.terms WHERE id=NEW.term_id AND school_id=NEW.school_id) THEN RAISE EXCEPTION 'Term must belong to the same school'; END IF;
  IF NEW.academic_year IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.academic_years WHERE school_id=NEW.school_id AND year=NEW.academic_year) THEN RAISE EXCEPTION 'Choose a school academic year'; END IF;
  IF length(NEW.value)>5000 THEN RAISE EXCEPTION 'Value is too long'; END IF;
  IF NEW.value<>'' THEN
   IF d.field_type IN ('number','percentage') THEN
    IF NEW.value !~ '^[+-]?[0-9]+([.][0-9]+)?$' THEN RAISE EXCEPTION 'Enter a valid number'; END IF;
    IF d.field_type='percentage' AND (NEW.value::numeric<0 OR NEW.value::numeric>100) THEN RAISE EXCEPTION 'Percentage must be between 0 and 100'; END IF;
   ELSIF d.field_type='date' THEN
    IF NEW.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Enter an ISO date'; END IF;
    PERFORM NEW.value::date;
   ELSIF d.field_type='text' AND NEW.value ~ E'[\n\r]' THEN RAISE EXCEPTION 'Use Multiline Text for multiple lines'; END IF;
  END IF;
  NEW.updated_at=now();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_report_custom_field() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_report_definition BEFORE INSERT OR UPDATE ON public.report_field_definitions FOR EACH ROW EXECUTE FUNCTION public.validate_report_custom_field();
CREATE TRIGGER validate_report_value BEFORE INSERT OR UPDATE ON public.report_field_values FOR EACH ROW EXECUTE FUNCTION public.validate_report_custom_field();
CREATE TRIGGER validate_report_association BEFORE INSERT OR UPDATE ON public.report_field_associations FOR EACH ROW EXECUTE FUNCTION public.validate_report_custom_field();