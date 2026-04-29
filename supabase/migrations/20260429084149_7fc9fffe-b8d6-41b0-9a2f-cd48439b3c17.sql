-- Migrate existing storage objects into schools/{school_id}/... layout
-- We attach all currently-orphaned objects to the Default School.

DO $$
DECLARE
  default_school uuid;
  obj record;
  new_name text;
BEGIN
  SELECT id INTO default_school FROM public.schools
   WHERE name = 'Default School' ORDER BY created_at ASC LIMIT 1;
  IF default_school IS NULL THEN
    RAISE NOTICE 'No Default School found — skipping storage migration';
    RETURN;
  END IF;

  FOR obj IN
    SELECT bucket_id, name FROM storage.objects
    WHERE bucket_id IN ('school-assets','learner-photos','signatures','report-cards','nursery-assets')
      AND name NOT LIKE 'schools/%'
  LOOP
    new_name := 'schools/' || default_school::text || '/' || obj.name;
    -- Avoid collision: if a row already exists at the new path, skip
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
       WHERE bucket_id = obj.bucket_id AND name = new_name
    ) THEN
      UPDATE storage.objects
         SET name = new_name,
             path_tokens = string_to_array(new_name, '/')
       WHERE bucket_id = obj.bucket_id AND name = obj.name;
    END IF;
  END LOOP;
END $$;

-- Rewrite stored path references on tenant tables so they point at the new locations.
DO $$
DECLARE default_school uuid; prefix text;
BEGIN
  SELECT id INTO default_school FROM public.schools
   WHERE name = 'Default School' ORDER BY created_at ASC LIMIT 1;
  IF default_school IS NULL THEN RETURN; END IF;
  prefix := 'schools/' || default_school::text || '/';

  UPDATE public.school_info SET logo_path = prefix || logo_path
    WHERE logo_path IS NOT NULL AND logo_path NOT LIKE 'schools/%';
  UPDATE public.school_info SET stamp_path = prefix || stamp_path
    WHERE stamp_path IS NOT NULL AND stamp_path NOT LIKE 'schools/%';
  UPDATE public.school_info SET watermark_path = prefix || watermark_path
    WHERE watermark_path IS NOT NULL AND watermark_path NOT LIKE 'schools/%';
  UPDATE public.school_info SET head_teacher_signature_path = prefix || head_teacher_signature_path
    WHERE head_teacher_signature_path IS NOT NULL AND head_teacher_signature_path NOT LIKE 'schools/%';
  UPDATE public.school_info SET nursery_head_teacher_signature_path = prefix || nursery_head_teacher_signature_path
    WHERE nursery_head_teacher_signature_path IS NOT NULL AND nursery_head_teacher_signature_path NOT LIKE 'schools/%';

  UPDATE public.learners SET photo_path = prefix || photo_path
    WHERE photo_path IS NOT NULL AND photo_path NOT LIKE 'schools/%';
  UPDATE public.nursery_learners SET photo_path = prefix || photo_path
    WHERE photo_path IS NOT NULL AND photo_path NOT LIKE 'schools/%';
  UPDATE public.nursery_learning_areas SET image_path = prefix || image_path
    WHERE image_path IS NOT NULL AND image_path NOT LIKE 'schools/%';

  UPDATE public.classes SET class_signature_path = prefix || class_signature_path
    WHERE class_signature_path IS NOT NULL AND class_signature_path NOT LIKE 'schools/%';
  UPDATE public.nursery_classes SET class_signature_path = prefix || class_signature_path
    WHERE class_signature_path IS NOT NULL AND class_signature_path NOT LIKE 'schools/%';

  UPDATE public.teachers SET signature_path = prefix || signature_path
    WHERE signature_path IS NOT NULL AND signature_path NOT LIKE 'schools/%';
END $$;