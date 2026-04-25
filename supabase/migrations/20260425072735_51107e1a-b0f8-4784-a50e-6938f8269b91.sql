-- Grading scales
CREATE TABLE public.grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade TEXT NOT NULL,
  points INTEGER NOT NULL,
  min_mark NUMERIC NOT NULL,
  max_mark NUMERIC NOT NULL,
  remark TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.grading_scales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view grading_scales" ON public.grading_scales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert grading_scales" ON public.grading_scales FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update grading_scales" ON public.grading_scales FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete grading_scales" ON public.grading_scales FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_grading_scales_updated BEFORE UPDATE ON public.grading_scales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Division rules
CREATE TABLE public.division_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division TEXT NOT NULL,
  min_aggregate INTEGER NOT NULL,
  max_aggregate INTEGER NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.division_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view division_rules" ON public.division_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert division_rules" ON public.division_rules FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update division_rules" ON public.division_rules FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete division_rules" ON public.division_rules FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_division_rules_updated BEFORE UPDATE ON public.division_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Comment templates
CREATE TYPE public.comment_audience AS ENUM ('class_teacher','head_teacher');
CREATE TABLE public.comment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience public.comment_audience NOT NULL,
  min_average NUMERIC NOT NULL,
  max_average NUMERIC NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comment_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view comment_templates" ON public.comment_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert comment_templates" ON public.comment_templates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update comment_templates" ON public.comment_templates FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete comment_templates" ON public.comment_templates FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_comment_templates_updated BEFORE UPDATE ON public.comment_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();