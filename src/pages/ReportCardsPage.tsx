import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Eye, FileText, Loader2, Sparkles } from "lucide-react";
import { generateClassReports } from "@/lib/reportCards";

type Term = { id: string; name: string; year: number; is_current: boolean };
type Cls = { id: string; name: string };
type Stream = { id: string; class_id: string; name: string };
type Learner = { id: string; full_name: string; class_id: string | null; stream_id: string | null; index_no: string | null };
type Report = {
  learner_id: string; total_marks: number | null; average: number | null;
  aggregate: number | null; division: string | null; position: number | null;
  class_size: number | null; generated_at: string;
};

export default function ReportCardsPage() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [reports, setReports] = useState<Record<string, Report>>({});

  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("all");

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

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const generatedCount = filtered.filter(l => reports[l.id]).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Report Cards</h1>
        <p className="text-muted-foreground">Generate, preview and print report cards. Generation computes totals, average, aggregates, division and class position.</p>
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
              <Select value={classId} onValueChange={(v) => { setClassId(v); setStreamId("all"); }}>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Learners ({filtered.length}) — Generated: {generatedCount}</CardTitle>
          <Button onClick={generate} disabled={generating || !termId || !classId}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate / Refresh All
          </Button>
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
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{l.full_name}</TableCell>
                      <TableCell>{r?.total_marks ?? "—"}</TableCell>
                      <TableCell>{r?.average ?? "—"}</TableCell>
                      <TableCell>{r?.aggregate ?? "—"}</TableCell>
                      <TableCell>{r?.division ? <Badge>{r.division}</Badge> : "—"}</TableCell>
                      <TableCell>{r?.position ? `${r.position} / ${r.class_size}` : "—"}</TableCell>
                      <TableCell className="text-right">
                        {r ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/print/report-card/${l.id}/${termId}`} target="_blank">
                              <Eye className="mr-2 h-4 w-4" /> View / Print
                            </Link>
                          </Button>
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
