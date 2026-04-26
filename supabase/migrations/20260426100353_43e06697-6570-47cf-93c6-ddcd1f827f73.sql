ALTER TABLE public.school_info
  ADD COLUMN IF NOT EXISTS watermark_path text,
  ADD COLUMN IF NOT EXISTS watermark_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watermark_x numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS watermark_y numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS watermark_scale numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS watermark_opacity numeric NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS watermark_mode text NOT NULL DEFAULT 'custom';