import { supabase } from "@/integrations/supabase/client";
import { assertReportScope, type ReportDataSource, type ReportQuery } from "./reportDataSource";
import type { Tables, TableName } from "./reportDataTypes";

export class OnlineReportDataSource implements ReportDataSource {
  constructor(readonly schoolId: string) {
    if (!schoolId) throw new Error("Select a school before loading report data.");
  }
  async read<T extends TableName>(table: T, options: ReportQuery = {}): Promise<Tables<T>[]> {
    assertReportScope(this.schoolId, options);
    // Query column names are validated by PostgREST; row results retain the public table type.
    let query = supabase.from(table as TableName).select("*").eq("school_id", this.schoolId);
    for (const [key, value] of Object.entries(options.eq ?? {})) query = query.eq(key, value as string);
    for (const [key, values] of Object.entries(options.in ?? {})) query = query.in(key, values as string[]);
    if (options.order) query = query.order(options.order, { ascending: options.ascending ?? true });
    if (options.limit !== undefined) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Tables<T>[];
  }
  async assetUrl(bucket: string, path: string | null | undefined) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }
  async fileBytes(bucket: string, path: string) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  }
}

export async function currentReportDataSource(): Promise<ReportDataSource> {
  const { data, error } = await supabase.rpc("current_user_school_id");
  if (error) throw error;
  if (!data) throw new Error("Select a school before loading report data.");
  return new OnlineReportDataSource(data);
}