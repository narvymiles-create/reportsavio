import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveTemplate, type SchoolTemplate } from "@/lib/reportTemplates";
import { generateCustomOutput } from "@/lib/pdf/customReport";
import { PrimaryPdfViewer } from "./PrimaryPdfViewer";
import { APPEARANCE_CHANGED, APPEARANCE_KEY, parseAppearance } from "@/lib/reportAppearance";
import { supabase } from "@/integrations/supabase/client";
import { generateNurseryOutput } from "@/lib/reportAppearancePreview";

function CustomViewer({ template, learnerIds, termId }: { template: SchoolTemplate; learnerIds: string[]; termId: string }) {
  const generate = useCallback((ids: string[], term: string, progress?: (done: number, total: number) => void) => generateCustomOutput(template, ids, term, progress), [template.id]);
  return <PrimaryPdfViewer learnerIds={learnerIds} termId={termId} generate={generate} filename="report-cards" />;
}
export function NurseryTemplateOutput({ learnerIds, termId, children }: { learnerIds: string[]; termId: string; children: ReactNode }) {
  const { schoolId } = useAuth();
  const [state, setState] = useState<{ template: SchoolTemplate | null; customized?: boolean; error?: string } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => { const changed = () => setRevision(v => v + 1); window.addEventListener(APPEARANCE_CHANGED, changed); return () => window.removeEventListener(APPEARANCE_CHANGED, changed); }, []);
  const idsKey = learnerIds.join(",");
  useEffect(() => {
    let cancelled = false;
    setState(null);
    Promise.all([getActiveTemplate("nursery"), supabase.from("system_settings").select("value").eq("school_id", schoolId ?? "").eq("key", APPEARANCE_KEY).maybeSingle()]).then(([template, result]) => { if (result.error) throw result.error; if (!cancelled) setState({ template, customized: Object.keys(parseAppearance(result.data?.value)).length > 0 }); })
      .catch(error => { if (!cancelled) setState({ template: null, error: error.message }); });
    return () => { cancelled = true; };
  }, [schoolId, idsKey, termId, revision]);
  if (!state) return <p role="status" className="p-6 text-muted-foreground">Preparing report…</p>;
  if (state.error) return <p role="alert" className="p-6 text-destructive">{state.error}</p>;
  return state.template ? <CustomViewer template={state.template} learnerIds={learnerIds} termId={termId} /> : state.customized ? <PrimaryPdfViewer key={revision} learnerIds={learnerIds} termId={termId} generate={generateNurseryOutput} filename="nursery-report-cards" /> : <>{children}</>;
}