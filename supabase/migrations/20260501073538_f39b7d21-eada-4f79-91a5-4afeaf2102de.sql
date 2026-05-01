-- Drop the global unique on key and replace with (school_id, key)
ALTER TABLE public.system_settings DROP CONSTRAINT IF EXISTS system_settings_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS system_settings_school_key_uniq
  ON public.system_settings (school_id, key);