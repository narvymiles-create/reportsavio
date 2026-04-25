-- Houses table
CREATE TABLE public.houses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view houses" ON public.houses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert houses" ON public.houses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update houses" ON public.houses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete houses" ON public.houses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_houses_updated_at
BEFORE UPDATE ON public.houses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- System settings (single-row key/value flags for learner field visibility)
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view system_settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert system_settings" ON public.system_settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update system_settings" ON public.system_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete system_settings" ON public.system_settings FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed defaults: all learner-detail fields ON
INSERT INTO public.system_settings (key, value) VALUES
  ('learner_fields', '{"stream": true, "house": true, "section": true, "pay_code": true}'::jsonb);

-- Seed common houses
INSERT INTO public.houses (name, color, sort_order) VALUES
  ('Blue', '#1e40af', 1),
  ('Red', '#b91c1c', 2),
  ('Green', '#15803d', 3),
  ('Yellow', '#ca8a04', 4);
