
ALTER TABLE public.terms DROP CONSTRAINT IF EXISTS terms_name_year_key;
ALTER TABLE public.terms ADD CONSTRAINT terms_school_name_year_key UNIQUE (school_id, name, year);
