ALTER TABLE public.learners
ADD COLUMN IF NOT EXISTS conduct text,
ADD COLUMN IF NOT EXISTS co_curricular text;