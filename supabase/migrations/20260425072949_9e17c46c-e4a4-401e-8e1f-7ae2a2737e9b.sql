CREATE TABLE public.marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL,
  learner_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  bot NUMERIC,
  mid NUMERIC,
  eot NUMERIC,
  total NUMERIC,
  grade TEXT,
  points INTEGER,
  remark TEXT,
  teacher_initials TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (term_id, learner_id, subject_id)
);
CREATE INDEX idx_marks_term_subject ON public.marks(term_id, subject_id);
CREATE INDEX idx_marks_term_learner ON public.marks(term_id, learner_id);

ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view marks" ON public.marks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert marks" ON public.marks FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update marks" ON public.marks FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete marks" ON public.marks FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_marks_updated BEFORE UPDATE ON public.marks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();