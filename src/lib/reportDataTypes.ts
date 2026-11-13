import type { Database, Tables } from "@/integrations/supabase/types";
export type TableName = keyof Database["public"]["Tables"];
export type { Tables };