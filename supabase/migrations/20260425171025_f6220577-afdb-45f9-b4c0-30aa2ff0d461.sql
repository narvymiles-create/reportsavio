-- Subjects: custom code label + core flag
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS code_label text,
  ADD COLUMN IF NOT EXISTS is_core boolean NOT NULL DEFAULT false;

-- Enforce one class teacher per teacher (a teacher can only be class teacher of one class)
CREATE UNIQUE INDEX IF NOT EXISTS classes_class_teacher_unique
  ON public.classes (class_teacher_id)
  WHERE class_teacher_id IS NOT NULL;

-- Validate max 4 core subjects per level (Lower/Upper)
CREATE OR REPLACE FUNCTION public.validate_core_subjects_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  lvl text;
  cnt int;
BEGIN
  IF NEW.is_core IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT level INTO lvl FROM public.classes WHERE id = NEW.class_id;
  IF lvl IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO cnt
  FROM public.subjects s
  JOIN public.classes c ON c.id = s.class_id
  WHERE s.is_core = true
    AND c.level = lvl
    AND s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF cnt >= 4 THEN
    RAISE EXCEPTION 'Only 4 core subjects are allowed per level (%).', lvl
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subjects_core_limit ON public.subjects;
CREATE TRIGGER subjects_core_limit
  BEFORE INSERT OR UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.validate_core_subjects_limit();