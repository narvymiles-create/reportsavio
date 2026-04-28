import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import {
  Download, Eye, FileText, Loader2, Printer, Sparkles, Trash2, UserCheck, Package, FolderArchive,
} from "lucide-react";
import { generateClassReports } from "@/lib/reportCards";
import { calculateDivision } from "@/lib/grading";
import { ReportCardSheet } from "@/components/ReportCardSheet";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import JSZip from "jszip";
import "./PrintReportCard.css";

type Term = { id: string; name: string; year: number; is_current: boolean };
type Cls = { id: string; name: string };
type Stream = { id: string; class_id: string; name: string };
type Learner = { id: string; full_name: string; class_id: string | null; stream_id: string | null; index_no: string | null };
type Report = {
  learner_id: string; total_marks: number | null; average: number | null;
  aggregate: number | null; division: string | null; position: number | null;
  class_size: number | null; generated_at: string;
};
type ReportJob = { id: number; mode: "print" | "download"; learners: Learner[]; label: string };

const BULK_BATCH_SIZE = 5;

function IconAction({ icon: Icon, label, onClick, asChild, href, target, variant = "ghost", danger }: {
  icon: any; label: string; onClick?: () => void; asChild?: boolean; href?: string; target?: string;
  variant?: "ghost" | "outline"; danger?: boolean;
}) {
  const btn = (
    <Button
      size="icon"
      variant={variant}
      className={`h-8 w-8 ${danger ? "text-destructive hover:text-destructive" : ""} hidden sm:inline-flex`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  // On large screens (lg+), show text label instead
  const lgBtn = (
    <Button
      size="sm"
      variant={variant}
      className={`hidden lg:inline-flex ${danger ? "text-destructive" : ""}`}
      onClick={onClick}
    >
      <Icon className="mr-1 h-4 w-4" /> {label}
    </Button>
  );

  if (asChild && href) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size="icon" variant={variant} className={`h-8 w-8 inline-flex lg:hidden ${danger ? "text-destructive" : ""}`} aria-label={label}>
              <Link to={href} target={target}><Icon className="h-4 w-4" /></Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
        <Button asChild size="sm" variant={variant} className="hidden lg:inline-flex">
          <Link to={href} target={target}><Icon className="mr-1 h-4 w-4" /> {label}</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex lg:hidden">{btn}</span></TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {lgBtn}
    </>
  );
}

function ReportJobRunner({ job, termId, onDone }: { job: ReportJob; termId: string; onDone: () => void }) {
  const [readyIds, setReadyIds] = useState<Record<string, boolean>>({});
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("Preparing report cards...");
  const [errorMsg, setErrorMsg] = useState("");
  const sheetsRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; document.body.classList.remove("bulk-report-printing"); };
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (working) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [working]);

  const readyCount = Object.keys(readyIds).length;
  const allReady = readyCount >= job.learners.length;

  const renderPageToPdfBlob = async (page: HTMLDivElement): Promise<Blob> => {
    const canvas = await html2canvas(page, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    let w = pageW;
    let h = pageW / ratio;
    if (h > pageH) { h = pageH; w = pageH * ratio; }
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h, undefined, "FAST");
    return pdf.output("blob");
  };

  const runDownload = async () => {
    const pages = Array.from(sheetsRef.current?.querySelectorAll<HTMLDivElement>(".report-page") ?? []);
    if (pages.length === 0) throw new Error("No printable report cards were found.");
    const failures: string[] = [];

    if (pages.length === 1) {
      setStatusMsg("Generating PDF...");
      const blob = await renderPageToPdfBlob(pages[0]);
      const safe = (job.learners[0]?.full_name ?? "report-card").replace(/[^a-z0-9_\-\s]/gi, "_");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safe}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setProgress(100);
      console.log(`[ReportCards PDF] PDF generated: ${safe}`);
      toast({ title: "Download ready", description: `${safe}.pdf` });
      return;
    }

    const zip = new JSZip();
    console.log(`[ReportCards ZIP] Starting ${pages.length} learner(s)`);

    for (let i = 0; i < pages.length; i += BULK_BATCH_SIZE) {
      const batchEnd = Math.min(i + BULK_BATCH_SIZE, pages.length);
      if (mountedRef.current) setStatusMsg(`Processing ${i + 1}–${batchEnd} of ${pages.length}...`);
      for (let j = i; j < batchEnd; j++) {
        if (!mountedRef.current) return;
        const learner = job.learners[j];
        try {
          const blob = await renderPageToPdfBlob(pages[j]);
          const safe = (learner?.full_name ?? `report-${j + 1}`).replace(/[^a-z0-9_\-\s]/gi, "_");
          zip.file(`${safe}.pdf`, blob);
          console.log(`[ReportCards ZIP] PDF generated: ${safe}`);
        } catch (error) {
          console.error(`[ReportCards ZIP] Failed: ${learner?.full_name}`, error);
          failures.push(learner?.full_name ?? `#${j + 1}`);
        }
        if (mountedRef.current) setProgress(Math.round(((j + 1) / pages.length) * 100));
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }

    if (mountedRef.current) setStatusMsg("Packaging ZIP file...");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    console.log("[ReportCards ZIP] ZIP creation success");
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-cards-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (failures.length) toast({ title: "Some reports failed", description: `${failures.length} failed: ${failures.slice(0, 3).join(", ")}`, variant: "destructive" });
    else toast({ title: "Download ready", description: `${pages.length} report card(s) packaged.` });
  };

  const runJob = async () => {
    try {
      if (!job.learners.length) throw new Error("No learners available for report generation.");
      setWorking(true);
      setErrorMsg("");
      setProgress(0);
      console.log(`[ReportCards ${job.mode}] Learners: ${job.learners.length}`);
      if (job.mode === "print") {
        setStatusMsg("Opening print options...");
        document.body.classList.add("bulk-report-printing");
        window.print();
        setTimeout(() => {
          document.body.classList.remove("bulk-report-printing");
          if (mountedRef.current) onDone();
        }, 1000);
      } else {
        await runDownload();
        if (mountedRef.current) onDone();
      }
    } catch (error: any) {
      console.error("[ReportCards job] fatal", error);
      if (mountedRef.current) {
        setErrorMsg(error?.message || "Bulk process failed");
        toast({ title: "Report action failed", description: error?.message || "Bulk process failed", variant: "destructive" });
      }
    } finally {
      if (mountedRef.current && job.mode !== "print") setWorking(false);
    }
  };

  useEffect(() => {
    if (!allReady || startedRef.current) return;
    startedRef.current = true;
    const t = setTimeout(runJob, 500);
    return () => clearTimeout(t);
  }, [allReady, job.id]);

  return (
    <div className="report-job-overlay fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-6 overflow-auto">
      <Card className="no-print max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>{job.label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm"><strong>{job.learners.length}</strong> report card(s) — {allReady ? "ready" : `loading ${readyCount}/${job.learners.length}…`}</p>
          <p className="text-sm text-muted-foreground">{errorMsg || statusMsg} {working && `${progress}%`}</p>
          <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${allReady && job.mode === "print" ? 100 : progress}%` }} /></div>
          {errorMsg && <Button variant="outline" onClick={onDone}>Close</Button>}
        </CardContent>
      </Card>
      <div ref={sheetsRef} className="report-job-renderer" aria-hidden={job.mode === "download"}>
        {job.learners.map((learner, i) => (
          <ReportCardSheet
            key={`${job.id}-${learner.id}`}
            learnerId={learner.id}
            termId={termId}
            pageBreak={i < job.learners.length - 1}
            onReady={() => setReadyIds(prev => prev[learner.id] ? prev : { ...prev, [learner.id]: true })}
          />
        ))}
      </div>
    </div>
  );
}

export default function ReportCardsPage() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingOne, setGeneratingOne] = useState<string | null>(null);
  const [reportJob, setReportJob] = useState<ReportJob | null>(null);

  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [reports, setReports] = useState<Record<string, Report>>({});

  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("all");
  const [singleLearnerId, setSingleLearnerId] = useState("");
  const jobCounterRef = useRef(0);

  useEffect(() => {
    (async () => {
      const [t, c, s] = await Promise.all([
        supabase.from("terms").select("id,name,year,is_current").order("year", { ascending: false }).order("name"),
        supabase.from("classes").select("id,name").order("sort_order").order("name"),
        supabase.from("streams").select("id,class_id,name").order("name"),
      ]);
      setTerms((t.data ?? []) as Term[]);
      setClasses((c.data ?? []) as Cls[]);
      setStreams((s.data ?? []) as Stream[]);
      const cur = (t.data ?? []).find((x: any) => x.is_current);
      if (cur) setTermId(cur.id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!classId) { setLearners([]); return; }
    supabase.from("learners").select("id,full_name,class_id,stream_id,index_no")
      .eq("class_id", classId).order("full_name")
      .then(({ data }) => setLearners((data ?? []) as Learner[]));
  }, [classId]);

  const loadReports = async () => {
    if (!termId || !classId) { setReports({}); return; }
    const { data } = await supabase.from("report_cards")
      .select("learner_id,total_marks,average,aggregate,division,position,class_size,generated_at")
      .eq("term_id", termId).eq("class_id", classId);
    const map: Record<string, Report> = {};
    (data ?? []).forEach((r: any) => { map[r.learner_id] = r; });
    setReports(map);
  };
  useEffect(() => { loadReports(); }, [termId, classId]);

  const filtered = useMemo(() => {
    if (streamId === "all") return learners;
    if (streamId === "none") return learners.filter(l => !l.stream_id);
    return learners.filter(l => l.stream_id === streamId);
  }, [learners, streamId]);

  const generate = async () => {
    if (!termId || !classId) return toast({ title: "Pick a term and class", variant: "destructive" });
    setGenerating(true);
    try {
      const rows = await generateClassReports(termId, classId);
      toast({ title: `Generated ${rows.length} report card(s)` });
      loadReports();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const generateSingle = async () => {
    if (!termId || !classId || !singleLearnerId) {
      return toast({ title: "Select term, class and learner", variant: "destructive" });
    }
    setGeneratingOne(singleLearnerId);
    try {
      // Generation runs class-wide (positions need the whole class), then we open the chosen learner
      await generateClassReports(termId, classId);
      await loadReports();
      toast({ title: "Report card ready" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingOne(null);
    }
  };

  const deleteReport = async (learnerId: string) => {
    if (!confirm("Delete this report card? It can be regenerated later.")) return;
    const { error } = await supabase.from("report_cards").delete().eq("term_id", termId).eq("learner_id", learnerId);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    toast({ title: "Deleted" });
    loadReports();
  };

  const startReportJob = (mode: "print" | "download", selectedLearners?: Learner[], label?: string) => {
    if (!termId || !classId) return toast({ title: "Pick a term and class", variant: "destructive" });
    const readyLearners = (selectedLearners ?? filtered).filter(l => reports[l.id]);
    if (readyLearners.length === 0) return toast({ title: "No report cards generated yet", variant: "destructive" });
    setReportJob({ id: ++jobCounterRef.current, mode, learners: readyLearners, label: label ?? (mode === "print" ? "Bulk print" : "Bulk ZIP download") });
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const generatedCount = filtered.filter(l => reports[l.id]).length;

  return (
    <div className="space-y-6">
      {reportJob && <ReportJobRunner job={reportJob} termId={termId} onDone={() => setReportJob(null)} />}

      <div>
        <h1 className="text-3xl font-bold">Report Cards</h1>
        <p className="text-muted-foreground">Generate, preview, print and bulk-export report cards.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Selection</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Term</Label>
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                <SelectContent>
                  {terms.map(t => <SelectItem key={t.id} value={t.id}>{t.name} {t.year}{t.is_current ? " (current)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Class</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setStreamId("all"); setSingleLearnerId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stream (filter only)</Label>
              <Select value={streamId} onValueChange={setStreamId} disabled={!classId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All streams</SelectItem>
                  <SelectItem value="none">No stream</SelectItem>
                  {streams.filter(s => s.class_id === classId).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual report */}
      <Card>
        <CardHeader><CardTitle>Generate Single Report Card</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label>Learner</Label>
              <Select value={singleLearnerId} onValueChange={setSingleLearnerId} disabled={!classId || learners.length === 0}>
                <SelectTrigger><SelectValue placeholder={classId ? "Select a learner" : "Pick a class first"} /></SelectTrigger>
                <SelectContent>
                  {learners.map(l => <SelectItem key={l.id} value={l.id}>{l.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateSingle} disabled={!singleLearnerId || generatingOne !== null}>
              {generatingOne ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
              Generate Report Card
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle>Learners ({filtered.length}) — Generated: {generatedCount}</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={generate} disabled={generating || !termId || !classId}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate / Refresh All
            </Button>
            <Button variant="outline" onClick={() => startReportJob("print")} disabled={!termId || !classId || generatedCount === 0 || !!reportJob}>
              <Package className="mr-2 h-4 w-4" /> Bulk Print
            </Button>
            <Button variant="outline" onClick={() => startReportJob("download")} disabled={!termId || !classId || generatedCount === 0 || !!reportJob}>
              <FolderArchive className="mr-2 h-4 w-4" /> Bulk Download (ZIP)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!termId || !classId ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Select a term and class to begin.</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No learners.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Learner</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Avg</TableHead>
                  <TableHead>Agg</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l, i) => {
                  const r = reports[l.id];
                  const printUrl = `/print/report-card/${l.id}/${termId}`;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{l.full_name}</TableCell>
                      <TableCell>{r?.total_marks ?? "—"}</TableCell>
                      <TableCell>{r?.average ?? "—"}</TableCell>
                      <TableCell>{r?.aggregate ?? "—"}</TableCell>
                      <TableCell>{r?.aggregate != null ? <Badge>{calculateDivision(r.aggregate)}</Badge> : "—"}</TableCell>
                      <TableCell>{r?.position ? `${r.position} / ${r.class_size}` : "—"}</TableCell>
                      <TableCell className="text-right">
                        {r ? (
                          <div className="inline-flex items-center gap-1 justify-end">
                            <IconAction icon={Eye} label="View" asChild href={printUrl} target="_blank" />
                            <IconAction icon={Printer} label="Print" onClick={() => startReportJob("print", [l], `Print ${l.full_name}`)} />
                            <IconAction icon={Download} label="Download" onClick={() => startReportJob("download", [l], `Download ${l.full_name}`)} />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 inline-flex lg:hidden" onClick={() => { setSingleLearnerId(l.id); generateSingle(); }} title="Re-generate" aria-label="Edit / Regenerate">
                                  {generatingOne === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Re-generate</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive inline-flex lg:hidden" onClick={() => deleteReport(l.id)} title="Delete" aria-label="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                            <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => { setSingleLearnerId(l.id); generateSingle(); }}>
                              {generatingOne === l.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} Edit
                            </Button>
                            <Button size="sm" variant="ghost" className="hidden lg:inline-flex text-destructive" onClick={() => deleteReport(l.id)}>
                              <Trash2 className="mr-1 h-4 w-4" /> Delete
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground inline-flex items-center"><FileText className="mr-1 h-3 w-3" /> Not generated</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
