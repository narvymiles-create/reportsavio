import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveTemplate, type SchoolTemplate } from "@/lib/reportTemplates";
import { generateCustomOutput } from "@/lib/pdf/customReport";
import { PrimaryPdfViewer } from "./PrimaryPdfViewer";

function CustomViewer({ template, learnerIds, termId }: { template: SchoolTemplate; learnerIds: string[]; termId: string }) {
  const generate = useCallback((ids: string[], term: string, progress?: (done: number, total: number) => void) => generateCustomOutput(template, ids, term, progress), [template.id]);
  return <PrimaryPdfViewer learnerIds={learnerIds} termId={termId} generate={generate} filename="report-cards" />;
}
export function NurseryTemplateOutput({ learnerIds, termId, children }: { learnerIds: string[]; termId: string; children: ReactNode }) {
  const { schoolId } = useAuth();
  const [state, setState] = useState<{ template: SchoolTemplate | null; error?: string } | null>(null);
  const idsKey = learnerIds.join(",");
  useEffect(() => {
    let cancelled = false;
    setState(null);
    getActiveTemplate("nursery").then(template => { if (!cancelled) setState({ template }); })
      .catch(error => { if (!cancelled) setState({ template: null, error: error.message }); });
    return () => { cancelled = true; };
  }, [schoolId, idsKey, termId]);
  if (!state) return <p role="status" className="p-6 text-muted-foreground">Preparing report…</p>;
  if (state.error) return <p role="alert" className="p-6 text-destructive">{state.error}</p>;
  return state.template ? <CustomViewer template={state.template} learnerIds={learnerIds} termId={termId} /> : <>{children}</>;
}