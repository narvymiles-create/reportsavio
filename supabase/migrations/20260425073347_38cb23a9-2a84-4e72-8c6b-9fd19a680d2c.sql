CREATE TABLE public.report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL,
  learner_id UUID NOT NULL,
  class_id UUID,
  total_marks NUMERIC,
  average NUMERIC,
  aggregate INTEGER,
  division TEXT,
  position INTEGER,
  class_size INTEGER,
  class_teacher_comment TEXT,
  head_teacher_comment TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (term_id, learner_id)
);
CREATE INDEX idx_report_cards_term_class ON public.report_cards(term_id, class_id);

ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view report_cards" ON public.report_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert report_cards" ON public.report_cards FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update report_cards" ON public.report_cards FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete report_cards" ON public.report_cards FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_report_cards_updated BEFORE UPDATE ON public.report_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();