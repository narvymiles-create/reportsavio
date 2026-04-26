-- Add section column to teachers to separate primary vs nursery staff
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'primary';

-- Add nursery-specific signature/head-teacher fields to school_info
ALTER TABLE public.school_info
  ADD COLUMN IF NOT EXISTS nursery_head_teacher_name text,
  ADD COLUMN IF NOT EXISTS nursery_head_teacher_signature_path text;