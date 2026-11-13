import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { PrimaryPdfViewer } from "./PrimaryPdfViewer";
import { useAuth } from "@/contexts/AuthContext";
import { useReportModule } from "@/hooks/useReportModule";
import { OnlineReportDataSource } from "@/lib/onlineReportDataSource";
import { testSchoolTemplate } from "@/lib/templateTest";
import type { SchoolTemplate } from "@/lib/reportTemplates";
import { templateErrorMessage } from "@/lib/templateErrors";

export function AutomaticTemplateTestDialog({ template, close }: { template: SchoolTemplate; close: () => void }) {
  const { schoolId } = useAuth();
  const { module: level, loading } = useReportModule();
  const [result, setResult] = useState<Awaited<ReturnType<typeof testSchoolTemplate>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (loading) return;
    let alive = true;
    setResult(null); setError("");
    if (!schoolId) { setError("Select a school before testing a template."); return; }
    testSchoolTemplate(template, level, new OnlineReportDataSource(schoolId))
      .then(value => { if (alive) setResult(value); })
      .catch(e => { if (alive) setError(templateErrorMessage(e)); });
    return () => { alive = false; };
  }, [template, schoolId, level, loading]);
  const output = useCallback(async () => {
    if (!result) throw new Error("The template preview is not ready yet.");
    return result.blob;
  }, [result]);
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="max-h-[95vh] max-w-5xl overflow-auto"><DialogHeader><DialogTitle>Test Template · {template.name}</DialogTitle></DialogHeader>
    {error ? <p role="alert" className="text-destructive">{error}</p> : !result ? <div role="status" className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Preparing report card…</div> : <>
      <p className="text-sm text-muted-foreground">{result.learner.full_name} · {result.term.name} · {result.academicYear}</p>
      <PrimaryPdfViewer learnerIds={[result.learner.id]} termId={result.term.id} filename={`${template.name}-test`} generate={output} />
      {result.fields.some(f => f.status === "Missing Data") && <p role="status" className="text-sm text-muted-foreground">Not saved: {result.fields.filter(f => f.status === "Missing Data").map(f => f.label).join(", ")}.</p>}
    </>}
  </DialogContent></Dialog>;
}