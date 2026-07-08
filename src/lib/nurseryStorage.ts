import { supabase } from "@/integrations/supabase/client";

const BUCKET = "nursery-assets";

/**
 * Returns a time-limited signed URL for a file in the private nursery-assets bucket.
 * Bucket is private — public URLs will not work.
 */
export async function nurserySignedUrl(
  path: string | null | undefined,
  expiresInSeconds: number = 3600,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** @deprecated bucket is private — use nurserySignedUrl instead. */
export function nurseryPublicUrl(_path: string | null | undefined): string | null {
  return null;
}

export async function uploadNurseryAsset(file: File, prefix: string, schoolId: string): Promise<string> {
  if (!schoolId) throw new Error("Missing school context");
  const ext = file.name.split(".").pop() || "png";
  const path = `schools/${schoolId}/${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}
