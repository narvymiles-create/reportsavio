
-- =========================================
-- NURSERY MODULE: separate tables
-- =========================================

-- Nursery classes
CREATE TABLE public.nursery_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  level text,
  class_teacher_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nursery_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view nursery_classes" ON public.nursery_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert nursery_classes" ON public.nursery_classes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update nursery_classes" ON public.nursery_classes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete nursery_classes" ON public.nursery_classes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_nursery_classes_updated BEFORE UPDATE ON public.nursery_classes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Nursery streams
CREATE TABLE public.nursery_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.nursery_classes(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nursery_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view nursery_streams" ON public.nursery_streams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert nursery_streams" ON public.nursery_streams FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update nursery_streams" ON public.nursery_streams FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete nursery_streams" ON public.nursery_streams FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Nursery learners
CREATE TABLE public.nursery_learners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  age integer,
  dob date,
  sex text,
  class_id uuid REFERENCES public.nursery_classes(id) ON DELETE SET NULL,
  stream_id uuid REFERENCES public.nursery_streams(id) ON DELETE SET NULL,
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nursery_learners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view nursery_learners" ON public.nursery_learners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert nursery_learners" ON public.nursery_learners FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update nursery_learners" ON public.nursery_learners FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete nursery_learners" ON public.nursery_learners FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_nursery_learners_updated BEFORE UPDATE ON public.nursery_learners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Learning areas
CREATE TABLE public.nursery_learning_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  image_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nursery_learning_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view nursery_learning_areas" ON public.nursery_learning_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert nursery_learning_areas" ON public.nursery_learning_areas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update nursery_learning_areas" ON public.nursery_learning_areas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete nursery_learning_areas" ON public.nursery_learning_areas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_nursery_learning_areas_updated BEFORE UPDATE ON public.nursery_learning_areas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grade colors (color key)
CREATE TABLE public.nursery_grade_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade text NOT NULL UNIQUE,
  label text NOT NULL,
  color text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nursery_grade_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view nursery_grade_colors" ON public.nursery_grade_colors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert nursery_grade_colors" ON public.nursery_grade_colors FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update nursery_grade_colors" ON public.nursery_grade_colors FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete nursery_grade_colors" ON public.nursery_grade_colors FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_nursery_grade_colors_updated BEFORE UPDATE ON public.nursery_grade_colors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-area assessment
CREATE TABLE public.nursery_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES public.nursery_learners(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  learning_area_id uuid NOT NULL REFERENCES public.nursery_learning_areas(id) ON DELETE CASCADE,
  grade text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, term_id, learning_area_id)
);
ALTER TABLE public.nursery_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view nursery_assessments" ON public.nursery_assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert nursery_assessments" ON public.nursery_assessments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update nursery_assessments" ON public.nursery_assessments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete nursery_assessments" ON public.nursery_assessments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_nursery_assessments_updated BEFORE UPDATE ON public.nursery_assessments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Report card (comments per learner per term)
CREATE TABLE public.nursery_report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES public.nursery_learners(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_teacher_comment text,
  head_teacher_comment text,
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, term_id)
);
ALTER TABLE public.nursery_report_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view nursery_report_cards" ON public.nursery_report_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert nursery_report_cards" ON public.nursery_report_cards FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update nursery_report_cards" ON public.nursery_report_cards FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete nursery_report_cards" ON public.nursery_report_cards FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_nursery_report_cards_updated BEFORE UPDATE ON public.nursery_report_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for nursery assets (learning area images, learner photos)
INSERT INTO storage.buckets (id, name, public) VALUES ('nursery-assets', 'nursery-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public view nursery-assets" ON storage.objects FOR SELECT USING (bucket_id = 'nursery-assets');
CREATE POLICY "Admins upload nursery-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'nursery-assets' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update nursery-assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'nursery-assets' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete nursery-assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'nursery-assets' AND has_role(auth.uid(), 'admin'::app_role));

-- Default report module setting
INSERT INTO public.system_settings (key, value)
VALUES ('report_module', '"primary"'::jsonb)
ON CONFLICT DO NOTHING;

-- Seed 10 default learning areas
INSERT INTO public.nursery_learning_areas (name, sort_order) VALUES
  ('Social Development', 1),
  ('Music and Dance', 2),
  ('Mathematical Concepts', 3),
  ('Physical Development', 4),
  ('Sharing', 5),
  ('General Knowledge', 6),
  ('Language Development 1', 7),
  ('Language Development 2', 8),
  ('Health Habits', 9),
  ('Self Expression', 10);

-- Seed default color key
INSERT INTO public.nursery_grade_colors (grade, label, color, sort_order) VALUES
  ('A', 'Very Good', '#F87171', 1),
  ('B', 'Good',      '#FB923C', 2),
  ('C', 'Good Trial','#FACC15', 3),
  ('D', 'Fair',      '#4ADE80', 4),
  ('E', 'Trying',    '#60A5FA', 5);
