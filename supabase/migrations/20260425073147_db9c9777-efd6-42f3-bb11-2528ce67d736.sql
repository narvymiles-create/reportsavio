ALTER TABLE public.school_info
  ADD COLUMN IF NOT EXISTS head_teacher_name TEXT,
  ADD COLUMN IF NOT EXISTS head_teacher_signature_path TEXT;