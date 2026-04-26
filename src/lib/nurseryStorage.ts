import { supabase } from "@/integrations/supabase/client";

const BUCKET = "nursery-assets";

export function nurseryPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
}

export async function uploadNurseryAsset(file: File, prefix: string): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}
