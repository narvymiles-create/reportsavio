-- Normalize legacy section values
UPDATE public.learners
SET section = CASE
  WHEN section IS NULL THEN NULL
  WHEN UPPER(TRIM(section)) IN ('DAY','D') THEN 'DAY'
  WHEN UPPER(TRIM(section)) IN ('BOARDING','BOARDER','B') THEN 'BOARDING'
  ELSE NULL
END;

-- Add new learner columns
ALTER TABLE public.learners
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS lin_no text,
  ADD COLUMN IF NOT EXISTS reg_no text,
  ADD COLUMN IF NOT EXISTS active_reg_type text;

ALTER TABLE public.learners
  DROP CONSTRAINT IF EXISTS learners_sex_check;
ALTER TABLE public.learners
  ADD CONSTRAINT learners_sex_check CHECK (sex IS NULL OR sex IN ('M','F'));

ALTER TABLE public.learners
  DROP CONSTRAINT IF EXISTS learners_section_check;
ALTER TABLE public.learners
  ADD CONSTRAINT learners_section_check CHECK (section IS NULL OR section IN ('DAY','BOARDING'));

ALTER TABLE public.learners
  DROP CONSTRAINT IF EXISTS learners_active_reg_type_check;
ALTER TABLE public.learners
  ADD CONSTRAINT learners_active_reg_type_check CHECK (active_reg_type IS NULL OR active_reg_type IN ('INDEX','LIN','REG'));

CREATE OR REPLACE FUNCTION public.validate_learner_registration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  filled int := 0;
BEGIN
  IF NEW.index_no IS NOT NULL AND NEW.index_no <> '' THEN filled := filled + 1; END IF;
  IF NEW.lin_no IS NOT NULL AND NEW.lin_no <> '' THEN filled := filled + 1; END IF;
  IF NEW.reg_no IS NOT NULL AND NEW.reg_no <> '' THEN filled := filled + 1; END IF;

  IF filled > 1 THEN
    RAISE EXCEPTION 'Only one of Index No, LIN, or REG can be filled per learner.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF filled = 1 THEN
    IF NEW.index_no IS NOT NULL AND NEW.index_no <> '' THEN NEW.active_reg_type := 'INDEX';
    ELSIF NEW.lin_no IS NOT NULL AND NEW.lin_no <> '' THEN NEW.active_reg_type := 'LIN';
    ELSIF NEW.reg_no IS NOT NULL AND NEW.reg_no <> '' THEN NEW.active_reg_type := 'REG';
    END IF;
  ELSIF filled = 0 THEN
    NEW.active_reg_type := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_learner_registration_trg ON public.learners;
CREATE TRIGGER validate_learner_registration_trg
BEFORE INSERT OR UPDATE ON public.learners
FOR EACH ROW EXECUTE FUNCTION public.validate_learner_registration();