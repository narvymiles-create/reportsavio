CREATE TABLE public.academic_years (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id),
 year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
 is_current boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_years TO authenticated;
GRANT ALL ON public.academic_years TO service_role;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY years_read ON public.academic_years FOR SELECT TO authenticated USING (school_id = public.current_user_school_id() OR public.is_super_admin());
CREATE POLICY years_insert ON public.academic_years FOR INSERT TO authenticated WITH CHECK ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY years_update ON public.academic_years FOR UPDATE TO authenticated USING ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin()) WITH CHECK ((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin());
CREATE POLICY years_delete ON public.academic_years FOR DELETE TO authenticated USING (((school_id = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin()) AND NOT is_current);
CREATE TRIGGER set_academic_year_school BEFORE INSERT ON public.academic_years FOR EACH ROW EXECUTE FUNCTION public.set_school_id_from_user();
INSERT INTO public.academic_years(school_id, year, is_current)
SELECT school_id, year, year = COALESCE(max(year) FILTER (WHERE bool_or_current) OVER (PARTITION BY school_id), max(year) OVER (PARTITION BY school_id))
FROM (SELECT school_id, year, bool_or(is_current) AS bool_or_current FROM public.terms GROUP BY school_id, year) existing;
INSERT INTO public.academic_years(school_id,year,is_current)
SELECT id, extract(year FROM current_date)::integer, true FROM public.schools s WHERE NOT EXISTS (SELECT 1 FROM public.academic_years y WHERE y.school_id = s.id);
CREATE UNIQUE INDEX one_current_academic_year_per_school ON public.academic_years(school_id) WHERE is_current;
CREATE OR REPLACE FUNCTION public.set_current_academic_year(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE target_school uuid;
BEGIN
 SELECT school_id INTO target_school FROM public.academic_years WHERE id = _id;
 IF target_school IS NULL OR NOT ((target_school = public.current_user_school_id() AND public.has_role(auth.uid(), 'admin')) OR public.is_super_admin()) THEN RAISE EXCEPTION 'Not authorized to change the current year'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(target_school::text, 0));
 UPDATE public.academic_years SET is_current = false WHERE school_id = target_school AND is_current AND id <> _id;
 UPDATE public.academic_years SET is_current = true WHERE id = _id;
END; $$;
REVOKE ALL ON FUNCTION public.set_current_academic_year(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_current_academic_year(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.sync_current_academic_year() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF NEW.is_current THEN UPDATE public.terms SET year = NEW.year WHERE school_id = NEW.school_id AND year IS DISTINCT FROM NEW.year; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_current_academic_year() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_current_academic_year AFTER INSERT OR UPDATE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION public.sync_current_academic_year();
CREATE OR REPLACE FUNCTION public.use_current_academic_year_for_term() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE selected_year integer;
BEGIN
 IF NEW.school_id IS NULL THEN NEW.school_id := public.current_user_school_id(); END IF;
 SELECT year INTO selected_year FROM public.academic_years WHERE school_id = NEW.school_id AND is_current;
 IF selected_year IS NULL THEN RAISE EXCEPTION 'Set a current year in Years before adding or editing a term'; END IF;
 NEW.year := selected_year;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.use_current_academic_year_for_term() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER use_current_academic_year_for_term BEFORE INSERT OR UPDATE ON public.terms FOR EACH ROW EXECUTE FUNCTION public.use_current_academic_year_for_term();
COMMENT ON COLUMN public.terms.year IS 'Compatibility projection of the school current academic_years.year; not an independently editable term setting.';
UPDATE public.terms t SET year = y.year FROM public.academic_years y WHERE y.school_id = t.school_id AND y.is_current AND t.year IS DISTINCT FROM y.year;