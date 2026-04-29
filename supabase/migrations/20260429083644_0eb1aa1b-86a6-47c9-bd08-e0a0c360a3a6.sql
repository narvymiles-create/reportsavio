-- =========================================================================
-- 1) SCHOOLS + MEMBERSHIP
-- =========================================================================
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  logo_path text,
  stamp_path text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_schools_updated BEFORE UPDATE ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TYPE public.school_role AS ENUM ('school_admin', 'member');

CREATE TABLE public.school_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.school_role NOT NULL DEFAULT 'school_admin',
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, school_id)
);
ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX one_primary_school_per_user
  ON public.school_members(user_id) WHERE is_primary;

-- =========================================================================
-- 2) HELPERS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.current_user_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.school_members
  WHERE user_id = auth.uid() AND is_primary = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.set_school_id_from_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    NEW.school_id := public.current_user_school_id();
  END IF;
  IF NEW.school_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'No school context for current user';
  END IF;
  RETURN NEW;
END;
$$;

-- =========================================================================
-- 3) ADD school_id TO TENANT TABLES
-- =========================================================================
DO $$
DECLARE t text;
  tables text[] := ARRAY[
    'school_info','classes','streams','subjects','teachers','learners',
    'terms','marks','grading_scales','division_rules','comment_templates',
    'houses','report_cards','system_settings',
    'nursery_classes','nursery_streams','nursery_learners','nursery_learning_areas',
    'nursery_assessments','nursery_grade_colors','nursery_report_cards'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE', t);
  END LOOP;
END $$;

-- =========================================================================
-- 4) BACKFILL: Default School + attach all data + admins
-- =========================================================================
DO $$
DECLARE
  default_school_id uuid;
  s_name text; s_email text; s_phone text; s_addr text; s_logo text; s_stamp text;
BEGIN
  SELECT name, email, tel, location, logo_path, stamp_path
    INTO s_name, s_email, s_phone, s_addr, s_logo, s_stamp
  FROM public.school_info WHERE is_active = true LIMIT 1;

  INSERT INTO public.schools (name, email, phone, address, logo_path, stamp_path)
  VALUES (COALESCE(s_name,'Default School'), s_email, s_phone, s_addr, s_logo, s_stamp)
  RETURNING id INTO default_school_id;

  UPDATE public.school_info        SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.classes            SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.streams            SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.subjects           SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.teachers           SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.learners           SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.terms              SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.marks              SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.grading_scales     SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.division_rules     SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.comment_templates  SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.houses             SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.report_cards       SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.system_settings    SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.nursery_classes        SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.nursery_streams        SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.nursery_learners       SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.nursery_learning_areas SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.nursery_assessments    SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.nursery_grade_colors   SET school_id = default_school_id WHERE school_id IS NULL;
  UPDATE public.nursery_report_cards   SET school_id = default_school_id WHERE school_id IS NULL;

  INSERT INTO public.school_members (school_id, user_id, role, is_primary)
  SELECT default_school_id, ur.user_id, 'school_admin', true
  FROM public.user_roles ur WHERE ur.role = 'admin'
  ON CONFLICT (user_id, school_id) DO NOTHING;
END $$;

-- =========================================================================
-- 5) NOT NULL + INDEX + AUTO-FILL TRIGGER
-- =========================================================================
DO $$
DECLARE t text;
  tables text[] := ARRAY[
    'school_info','classes','streams','subjects','teachers','learners',
    'terms','marks','grading_scales','division_rules','comment_templates',
    'houses','report_cards','system_settings',
    'nursery_classes','nursery_streams','nursery_learners','nursery_learning_areas',
    'nursery_assessments','nursery_grade_colors','nursery_report_cards'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN school_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(school_id)', t || '_school_id_idx', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_school_id ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_set_school_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_school_id_from_user()', t, t);
  END LOOP;
END $$;

-- =========================================================================
-- 6) REPLACE RLS POLICIES on every tenant table
-- =========================================================================
DO $$
DECLARE t text; pol record;
  tables text[] := ARRAY[
    'school_info','classes','streams','subjects','teachers','learners',
    'terms','marks','grading_scales','division_rules','comment_templates',
    'houses','report_cards','system_settings',
    'nursery_classes','nursery_streams','nursery_learners','nursery_learning_areas',
    'nursery_assessments','nursery_grade_colors','nursery_report_cards'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format($f$CREATE POLICY "tenant_select_%1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (school_id = public.current_user_school_id() OR public.is_super_admin())$f$, t);

    EXECUTE format($f$CREATE POLICY "tenant_insert_%1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(),'admin')) OR public.is_super_admin())$f$, t);

    EXECUTE format($f$CREATE POLICY "tenant_update_%1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (school_id = public.current_user_school_id() OR public.is_super_admin())
      WITH CHECK (school_id = public.current_user_school_id() OR public.is_super_admin())$f$, t);

    EXECUTE format($f$CREATE POLICY "tenant_delete_%1$s" ON public.%1$I FOR DELETE TO authenticated
      USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(),'admin')) OR public.is_super_admin())$f$, t);
  END LOOP;
END $$;

-- =========================================================================
-- 7) RLS for schools + school_members
-- =========================================================================
CREATE POLICY "members_view_own_school" ON public.schools FOR SELECT TO authenticated
  USING (id = public.current_user_school_id() OR public.is_super_admin());
CREATE POLICY "auth_insert_schools" ON public.schools FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "school_admin_update_school" ON public.schools FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (id = public.current_user_school_id() AND public.has_role(auth.uid(),'admin')));
CREATE POLICY "super_admin_delete_schools" ON public.schools FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "view_own_membership" ON public.school_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin() OR school_id = public.current_user_school_id());
CREATE POLICY "insert_own_membership" ON public.school_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin()
              OR (school_id = public.current_user_school_id() AND public.has_role(auth.uid(),'admin')));
CREATE POLICY "manage_members_update" ON public.school_members FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (school_id = public.current_user_school_id() AND public.has_role(auth.uid(),'admin')));
CREATE POLICY "manage_members_delete" ON public.school_members FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (school_id = public.current_user_school_id() AND public.has_role(auth.uid(),'admin')));

-- =========================================================================
-- 8) handle_new_user — no longer auto-promote first user
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$;

-- =========================================================================
-- 9) Atomic school creation RPC for signup flow
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_school_for_current_user(_name text, _email text, _phone text, _address text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_school_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Must be authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.school_members WHERE user_id = auth.uid() AND is_primary) THEN
    RAISE EXCEPTION 'User already belongs to a school';
  END IF;

  INSERT INTO public.schools (name, email, phone, address)
  VALUES (_name, _email, _phone, _address) RETURNING id INTO new_school_id;

  INSERT INTO public.school_members (school_id, user_id, role, is_primary)
  VALUES (new_school_id, auth.uid(), 'school_admin', true);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'admin') ON CONFLICT DO NOTHING;

  RETURN new_school_id;
END;
$$;

-- =========================================================================
-- 10) STORAGE: enforce schools/{school_id}/... per bucket
-- =========================================================================
DO $$
DECLARE pol record; b text;
  bucket_names text[] := ARRAY['school-assets','learner-photos','signatures','report-cards','nursery-assets'];
BEGIN
  FOREACH b IN ARRAY bucket_names LOOP
    FOR pol IN SELECT policyname FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE '%' || b || '%' LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE b text;
  bucket_names text[] := ARRAY['school-assets','learner-photos','signatures','report-cards','nursery-assets'];
BEGIN
  FOREACH b IN ARRAY bucket_names LOOP
    EXECUTE format($f$CREATE POLICY "tenant_select_%1$s" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = %2$L AND (public.is_super_admin() OR
        ((storage.foldername(name))[1] = 'schools' AND (storage.foldername(name))[2] = public.current_user_school_id()::text)))$f$, b, b);

    EXECUTE format($f$CREATE POLICY "tenant_insert_%1$s" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = %2$L AND (public.is_super_admin() OR
        ((storage.foldername(name))[1] = 'schools' AND (storage.foldername(name))[2] = public.current_user_school_id()::text)))$f$, b, b);

    EXECUTE format($f$CREATE POLICY "tenant_update_%1$s" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = %2$L AND (public.is_super_admin() OR
        ((storage.foldername(name))[1] = 'schools' AND (storage.foldername(name))[2] = public.current_user_school_id()::text)))$f$, b, b);

    EXECUTE format($f$CREATE POLICY "tenant_delete_%1$s" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = %2$L AND (public.is_super_admin() OR
        ((storage.foldername(name))[1] = 'schools' AND (storage.foldername(name))[2] = public.current_user_school_id()::text)))$f$, b, b);
  END LOOP;
END $$;