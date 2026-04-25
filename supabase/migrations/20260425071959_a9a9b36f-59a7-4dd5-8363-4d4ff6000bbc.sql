
-- TEACHER ROLE ENUM
CREATE TYPE public.teacher_role AS ENUM ('class_teacher', 'head_teacher', 'subject_teacher');

-- TEACHERS
CREATE TABLE public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  role public.teacher_role NOT NULL DEFAULT 'subject_teacher',
  initials TEXT,
  email TEXT,
  phone TEXT,
  signature_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER teachers_set_updated_at BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Authenticated view teachers" ON public.teachers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert teachers" ON public.teachers
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update teachers" ON public.teachers
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete teachers" ON public.teachers
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- CLASSES
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  level TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  class_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  class_signature_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER classes_set_updated_at BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Authenticated view classes" ON public.classes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert classes" ON public.classes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update classes" ON public.classes
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete classes" ON public.classes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- STREAMS
CREATE TABLE public.streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, name)
);
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view streams" ON public.streams
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert streams" ON public.streams
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update streams" ON public.streams
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete streams" ON public.streams
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- SUBJECT CODE ENUM
CREATE TYPE public.subject_code AS ENUM ('ENG', 'MTC', 'SCI', 'SST', 'RE', 'ICT', 'OTHER');

-- SUBJECTS
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  code public.subject_code NOT NULL,
  name TEXT NOT NULL,
  max_marks NUMERIC(6,2) NOT NULL DEFAULT 100,
  sort_order INT NOT NULL DEFAULT 0,
  subject_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, code, name)
);
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER subjects_set_updated_at BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Authenticated view subjects" ON public.subjects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert subjects" ON public.subjects
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update subjects" ON public.subjects
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete subjects" ON public.subjects
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_subjects_class ON public.subjects(class_id);
CREATE INDEX idx_streams_class ON public.streams(class_id);
