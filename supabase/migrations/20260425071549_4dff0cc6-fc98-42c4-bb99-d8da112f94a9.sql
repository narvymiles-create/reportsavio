
-- Fix function search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first_user;

  IF is_first_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Make buckets private and restrict reads to authenticated
UPDATE storage.buckets SET public = false
WHERE id IN ('school-assets', 'learner-photos', 'signatures', 'report-cards');

DROP POLICY IF EXISTS "Public read school-assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read learner-photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read signatures" ON storage.objects;
DROP POLICY IF EXISTS "Public read report-cards" ON storage.objects;

CREATE POLICY "Authenticated read school-assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'school-assets');
CREATE POLICY "Authenticated read learner-photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'learner-photos');
CREATE POLICY "Authenticated read signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'signatures');
CREATE POLICY "Authenticated read report-cards"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'report-cards');
