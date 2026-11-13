CREATE TABLE public.assessment_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES public.learners(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  assessment_key text NOT NULL CHECK (assessment_key ~ '^[a-z0-9_]{1,40}$' AND assessment_key NOT IN ('bot','mid','eot')),
  mark numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, learner_id, subject_id, assessment_key)
);
COMMENT ON TABLE public.assessment_marks IS 'Marks for school-configured Primary assessments beyond the legacy bot/mid/eot columns in marks.';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_marks TO authenticated;
GRANT ALL ON public.assessment_marks TO service_role;
ALTER TABLE public.assessment_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessment_marks school select" ON public.assessment_marks FOR SELECT TO authenticated USING (school_id = public.current_user_school_id() OR public.is_super_admin());
CREATE POLICY "assessment_marks school insert" ON public.assessment_marks FOR INSERT TO authenticated WITH CHECK (school_id = public.current_user_school_id() OR public.is_super_admin());
CREATE POLICY "assessment_marks school update" ON public.assessment_marks FOR UPDATE TO authenticated USING (school_id = public.current_user_school_id() OR public.is_super_admin()) WITH CHECK (school_id = public.current_user_school_id() OR public.is_super_admin());
CREATE POLICY "assessment_marks school delete" ON public.assessment_marks FOR DELETE TO authenticated USING (school_id = public.current_user_school_id() OR public.is_super_admin());
CREATE TRIGGER trg_assessment_marks_set_school_id BEFORE INSERT ON public.assessment_marks FOR EACH ROW EXECUTE FUNCTION public.set_school_id_from_user();
CREATE TRIGGER trg_assessment_marks_updated BEFORE UPDATE ON public.assessment_marks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX assessment_marks_school_term_idx ON public.assessment_marks (school_id, term_id);