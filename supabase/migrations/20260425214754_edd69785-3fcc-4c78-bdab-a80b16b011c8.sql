
ALTER TABLE public.school_info
  ADD COLUMN IF NOT EXISTS stamp_path text,
  ADD COLUMN IF NOT EXISTS stamp_x numeric NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS stamp_y numeric NOT NULL DEFAULT 78,
  ADD COLUMN IF NOT EXISTS stamp_position_type text,
  ADD COLUMN IF NOT EXISTS stamp_size numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS stamp_opacity numeric NOT NULL DEFAULT 0.6;
