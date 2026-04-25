
-- TERMS
CREATE TABLE public.terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  year INT NOT NULL,
  start_date DATE,
  end_date DATE,
  next_begins_on DATE,
  ends_on DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, year)
);
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER terms_set_updated_at BEFORE UPDATE ON public.terms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Authenticated view terms" ON public.terms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert terms" ON public.terms
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update terms" ON public.terms
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete terms" ON public.terms
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- LEARNERS
CREATE TABLE public.learners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  stream_id UUID REFERENCES public.streams(id) ON DELETE SET NULL,
  section TEXT,
  age INT,
  house TEXT,
  index_no TEXT,
  pay_code TEXT,
  photo_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.learners ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER learners_set_updated_at BEFORE UPDATE ON public.learners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_learners_class ON public.learners(class_id);
CREATE INDEX idx_learners_stream ON public.learners(stream_id);

CREATE POLICY "Authenticated view learners" ON public.learners
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert learners" ON public.learners
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update learners" ON public.learners
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete learners" ON public.learners
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
