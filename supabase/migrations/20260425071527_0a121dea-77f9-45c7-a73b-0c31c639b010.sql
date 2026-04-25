
-- =========================
-- ROLES
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- user_roles policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================
-- Auto-create profile + bootstrap first admin
-- =========================
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- updated_at helper
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- SCHOOL INFO (singleton)
-- =========================
CREATE TABLE public.school_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  po_box TEXT,
  tel TEXT NOT NULL,
  email TEXT,
  website TEXT,
  motto TEXT,
  logo_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.school_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view school info"
  ON public.school_info FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY "Admins can insert school info"
  ON public.school_info FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update school info"
  ON public.school_info FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete school info"
  ON public.school_info FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER school_info_set_updated_at
  BEFORE UPDATE ON public.school_info
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- STORAGE BUCKETS
-- =========================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('school-assets', 'school-assets', true),
  ('learner-photos', 'learner-photos', true),
  ('signatures', 'signatures', true),
  ('report-cards', 'report-cards', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for all four buckets
CREATE POLICY "Public read school-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'school-assets');
CREATE POLICY "Public read learner-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'learner-photos');
CREATE POLICY "Public read signatures"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'signatures');
CREATE POLICY "Public read report-cards"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'report-cards');

-- Admin write/delete on all four
CREATE POLICY "Admins write school-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'school-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update school-assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'school-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete school-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'school-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write learner-photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'learner-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update learner-photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'learner-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete learner-photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'learner-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'signatures' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update signatures"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'signatures' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete signatures"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'signatures' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write report-cards"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'report-cards' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update report-cards"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'report-cards' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete report-cards"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'report-cards' AND public.has_role(auth.uid(), 'admin'));
