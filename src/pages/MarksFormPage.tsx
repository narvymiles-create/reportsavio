import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Printer, Upload } from "lucide-react";
import { calculateDivision, computeTotal, gradeFor, applyF9Override, isCriticalCoreSubject, type GradeBand } from "@/lib/grading";
import Papa from "papaparse";
import skavioLogoUrl from "@/assets/skavio-logo-transparent.png";
import "./MarksFormPage.css";


export type ExamColumn = "bot" | "mid" | "eot";

type Term = { id: string; name: string; year: number; is_current: boolean };
type Cls = { id: string; name: string };
type Stream = { id: string; class_id: string; name: string };
type Subject = { id: string; name: string; code: string; code_label: string | null; class_id: string; max_marks: number; sort_order: number; subject_teacher_id: string | null; is_core: boolean };
type Learner = { id: string; full_name: string; class_id: string | null; stream_id: string | null; index_no: string | null };
type Teacher = { id: string; initials: string | null };

// marks indexed by `${learner_id}|${subject_id}` -> row
type MarkRow = { id?: string; learner_id: string; subject_id: string; bot: number | null; mid: number | null; eot: number | null };

const TITLES: Record<ExamColumn, string> = {
  bot: "BEGINNING OF TERM EXAMS FORM",
  mid: "MID OF TERM EXAMS FORM",
  eot: "END OF TERM EXAMS FORM",
};

export default function MarksFormPage({ exam }: { exam: ExamColumn }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [learners, setLearners] = useState<Learner[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [bands, setBands] = useState<GradeBand[]>([]);
  const [school, setSchool] = useState<{ name: string } | null>(null);

  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState<string>("all");

  // marks keyed by learner|subject
  const [marks, setMarks] = useState<Record<string, MarkRow>>({});
  // baseline snapshot used to detect dirty state
  const [baseline, setBaseline] = useState<Record<string, MarkRow>>({});
  // CSV import dialog
  const [importOpen, setImportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const [t, c, s, te, gb, si] = await Promise.all([
        supabase.from("terms").select("id,name,year,is_current").order("year", { ascending: false }).order("name"),
        supabase.from("classes").select("id,name").order("sort_order").order("name"),
        supabase.from("streams").select("id,class_id,name").order("name"),
        supabase.from("teachers").select("id,initials"),
        supabase.from("grading_scales").select("grade,points,min_mark,max_mark,remark").order("sort_order"),
        supabase.from("school_info").select("name").eq("is_active", true).maybeSingle(),
      ]);
      setTerms((t.data ?? []) as Term[]);
      setClasses((c.data ?? []) as Cls[]);
      setStreams((s.data ?? []) as Stream[]);
      setTeachers((te.data ?? []) as Teacher[]);
      setBands((gb.data ?? []) as GradeBand[]);
      setSchool((si.data as any) ?? null);
      const current = (t.data ?? []).find((x: any) => x.is_current);
      if (current) setTermId(current.id);
      setLoading(false);
    })();
  }, []);

  // Subjects + learners when class changes
  useEffect(() => {
    if (!classId) { setSubjects([]); setLearners([]); return; }
    (async () => {
      const [sub, ln] = await Promise.all([
        supabase.from("subjects").select("*").eq("class_id", classId).order("sort_order"),
        supabase.from("learners").select("id,full_name,class_id,stream_id,index_no").eq("class_id", classId).order("full_name"),
      ]);
      setSubjects((sub.data ?? []) as Subject[]);
      setLearners((ln.data ?? []) as Learner[]);
    })();
  }, [classId]);

  // Existing marks for term + class subjects
  useEffect(() => {
    if (!termId || subjects.length === 0) { setMarks({}); return; }
    const ids = subjects.map(s => s.id);
    (async () => {
      const { data } = await supabase
        .from("marks")
        .select("id,learner_id,subject_id,bot,mid,eot")
        .eq("term_id", termId)
        .in("subject_id", ids);
      const map: Record<string, MarkRow> = {};
      (data ?? []).forEach((m: any) => { map[`${m.learner_id}|${m.subject_id}`] = m; });
      setMarks(map);
      setBaseline(JSON.parse(JSON.stringify(map)));
    })();
  }, [termId, subjects]);

  const filteredLearners = useMemo(() => {
    if (streamId === "all") return learners;
    if (streamId === "none") return learners.filter(l => !l.stream_id);
    return learners.filter(l => l.stream_id === streamId);
  }, [learners, streamId]);

  const setMark = (learnerId: string, subjectId: string, v: string) => {
    const key = `${learnerId}|${subjectId}`;
    const num = v.trim() === "" ? null : Number(v);
    setMarks(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { learner_id: learnerId, subject_id: subjectId, bot: null, mid: null, eot: null }),
        [exam]: num,
      } as MarkRow,
    }));
  };

  // Core subjects drive AGG and DIV exclusively
  const coreSubjects = useMemo(() => subjects.filter(s => s.is_core), [subjects]);
  const coreSubjectIds = useMemo(() => new Set(coreSubjects.map(s => s.id)), [coreSubjects]);
  const coreCountValid = coreSubjects.length === 4;

  // Per-row computed values (live)
  type RowCalc = { total: number; ave: number; agg: number; div: string; coreMissing: number; subjectGrades: Record<string, string | null> };
  const rowCalcs = useMemo(() => {
    const out = new Map<string, RowCalc>();
    for (const l of filteredLearners) {
      const subjectGrades: Record<string, string | null> = {};
      let total = 0; let count = 0; let agg = 0; let coreEntered = 0; let coreMissing = 0;
      let hasF9InEngOrMath = false;
      for (const s of subjects) {
        const m = marks[`${l.id}|${s.id}`];
        const v = m?.[exam] ?? null;
        if (v != null && !isNaN(v)) {
          total += v; count += 1;
          const band = gradeFor(v, bands);
          if (s.is_core) {
            subjectGrades[s.id] = band?.grade ?? null;
            if (band?.points != null) agg += band.points;
            coreEntered += 1;
          } else {
            subjectGrades[s.id] = null;
          }
          // F9-in-ENG/MTC override detection
          if (band?.grade === "F9" && isCriticalCoreSubject(s.name)) {
            hasF9InEngOrMath = true;
          }
        } else {
          if (s.is_core) coreMissing += 1;
          subjectGrades[s.id] = null;
        }
      }
      const ave = count ? Math.round((total / count) * 100) / 100 : 0;
      // Division logic mirrors report card:
      // - If config invalid (≠4 core subjects) → blank
      // - If at least one core has marks but some core is missing → "X"
      // - If all 4 core subjects have marks → calculateDivision(agg)
      // - F9 in ENG or MTC → push division ONE level worse (skipped for X/U)
      let div = "";
      if (coreCountValid) {
        if (coreEntered === 4) div = calculateDivision(agg);
        else if (coreEntered > 0 && coreMissing > 0) div = "X";
        div = applyF9Override(div, hasF9InEngOrMath);
      }
      out.set(l.id, {
        total, ave,
        agg: coreEntered > 0 ? agg : 0,
        div,
        coreMissing,
        subjectGrades,
      });
    }
    return out;
  }, [filteredLearners, subjects, marks, bands, exam, coreCountValid]);

  // Position ranking by total desc (ties share)
  const positions = useMemo(() => {
    const arr = filteredLearners.map(l => ({ id: l.id, total: rowCalcs.get(l.id)?.total ?? 0 }));
    arr.sort((a, b) => b.total - a.total);
    const map = new Map<string, number>();
    let lastTotal: number | null = null; let lastPos = 0;
    arr.forEach((r, i) => {
      if (r.total !== lastTotal) { lastPos = i + 1; lastTotal = r.total; }
      map.set(r.id, r.total > 0 ? lastPos : 0);
    });
    return map;
  }, [filteredLearners, rowCalcs]);

  // Division summary counts
  const divSummary = useMemo(() => {
    const counts: Record<"1" | "2" | "3" | "4" | "X" | "U", number> = { "1": 0, "2": 0, "3": 0, "4": 0, X: 0, U: 0 };
    for (const l of filteredLearners) {
      const c = rowCalcs.get(l.id);
      if (!c || !c.div) continue;
      if (c.div === "1" || c.div === "2" || c.div === "3" || c.div === "4" || c.div === "X" || c.div === "U") {
        counts[c.div] = (counts[c.div] ?? 0) + 1;
      }
    }
    return counts;
  }, [filteredLearners, rowCalcs]);

  // Subject performance summary: per-subject grade distribution + first-grade contribution
  const GRADE_COLS = ["D1", "D2", "C3", "C4", "C5", "C6", "P7", "P8"] as const;
  const subjectPerformance = useMemo(() => {
    const rows = subjects.map(s => {
      const counts: Record<string, number> = { D1: 0, D2: 0, C3: 0, C4: 0, C5: 0, C6: 0, P7: 0, P8: 0 };
      for (const l of filteredLearners) {
        const v = marks[`${l.id}|${s.id}`]?.[exam] ?? null;
        if (v == null || isNaN(v)) continue;
        const band = gradeFor(v, bands);
        const g = band?.grade?.toUpperCase();
        if (g && counts[g] != null) counts[g] += 1;
      }
      const firstGrade = counts.D1 + counts.D2 + counts.C3;
      return {
        subjectId: s.id,
        label: (s.code === "OTHER" && s.code_label) ? s.code_label : s.code,
        counts,
        firstGrade,
      };
    });
    // Rank by firstGrade desc, tie-break on D1 desc, then D2 desc
    const sorted = [...rows].sort((a, b) => {
      if (b.firstGrade !== a.firstGrade) return b.firstGrade - a.firstGrade;
      if (b.counts.D1 !== a.counts.D1) return b.counts.D1 - a.counts.D1;
      return b.counts.D2 - a.counts.D2;
    });
    let lastKey = ""; let lastRank = 0;
    return sorted.map((r, i) => {
      const key = `${r.firstGrade}|${r.counts.D1}|${r.counts.D2}`;
      if (key !== lastKey) { lastRank = i + 1; lastKey = key; }
      return { ...r, rank: lastRank };
    });
  }, [subjects, filteredLearners, marks, bands, exam]);

  // Dirty detection: compare current marks vs baseline for the active exam column only
  const isDirty = useMemo(() => {
    const keys = new Set([...Object.keys(marks), ...Object.keys(baseline)]);
    for (const k of keys) {
      const a = marks[k]?.[exam] ?? null;
      const b = baseline[k]?.[exam] ?? null;
      if ((a ?? null) !== (b ?? null)) return true;
    }
    return false;
  }, [marks, baseline, exam]);

  const saveAll = async () => {
    if (!termId || !classId) return;
    if (!isDirty) {
      return toast({ title: "No new changes made" });
    }
    if (bands.length === 0) {
      return toast({ title: "Set up grading first", description: "Add grade bands in Grading System.", variant: "destructive" });
    }
    setSaving(true);
    const payload: any[] = [];
    for (const l of filteredLearners) {
      for (const s of subjects) {
        const m = marks[`${l.id}|${s.id}`];
        if (!m) continue;
        if (m.bot == null && m.mid == null && m.eot == null) continue;
        const total = computeTotal(m.bot, m.mid, m.eot);
        const band = gradeFor(total, bands);
        const ti = teachers.find(t => t.id === s.subject_teacher_id)?.initials ?? null;
        payload.push({
          term_id: termId,
          learner_id: l.id,
          subject_id: s.id,
          bot: m.bot, mid: m.mid, eot: m.eot,
          total,
          grade: band?.grade ?? null,
          points: band?.points ?? null,
          remark: band?.remark ?? null,
          teacher_initials: ti,
        });
      }
    }
    if (payload.length === 0) { setSaving(false); return toast({ title: "Nothing to save" }); }
    const { error } = await supabase.from("marks").upsert(payload, { onConflict: "term_id,learner_id,subject_id" });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    setBaseline(JSON.parse(JSON.stringify(marks)));
    toast({ title: `Saved ${payload.length} record(s)` });
  };

  const handlePrint = () => window.print();

  // Build a tabular export representation of the current view
  const buildExportRows = () => {
    const headers = [
      "NAMES",
      ...subjects.map(s => (s.code === "OTHER" && s.code_label) ? s.code_label : s.code),
      "TOTAL", "AVE", "POSITION", "AGG", "DIV",
    ];
    const rows = filteredLearners.map(l => {
      const calc = rowCalcs.get(l.id);
      const pos = positions.get(l.id) ?? 0;
      const subjectCells = subjects.map(s => marks[`${l.id}|${s.id}`]?.[exam] ?? "");
      return [
        l.full_name,
        ...subjectCells,
        calc && calc.total > 0 ? calc.total : "",
        calc && calc.total > 0 ? calc.ave : "",
        pos > 0 ? pos : "",
        calc && calc.agg > 0 ? calc.agg : "",
        calc && calc.div ? calc.div : "",
      ];
    });
    return { headers, rows };
  };

  const baseFileName = () => {
    const t = terms.find(x => x.id === termId);
    const c = classes.find(x => x.id === classId);
    return `${TITLES[exam].replace(/\s+/g, "_")}_${c?.name ?? "Class"}_${t ? `${t.name}_${t.year}` : ""}`.replace(/[^A-Za-z0-9_\-]/g, "");
  };

  const downloadFile = (data: BlobPart, mime: string, ext: string) => {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${baseFileName()}.${ext}`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const { headers, rows } = buildExportRows();
    const csv = Papa.unparse([headers, ...rows]);
    downloadFile(csv, "text/csv;charset=utf-8;", "csv");
  };

  const exportXLSX = () => {
    const { headers, rows } = buildExportRows();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Marks");
    // Summary sheet
    const sumWs = XLSX.utils.aoa_to_sheet([
      ["DIV1", "DIV2", "DIV3", "DIV4", "DIV X", "U"],
      [divSummary["1"] || 0, divSummary["2"] || 0, divSummary["3"] || 0, divSummary["4"] || 0, divSummary.X || 0, divSummary.U || 0],
    ]);
    XLSX.utils.book_append_sheet(wb, sumWs, "Summary");
    XLSX.writeFile(wb, `${baseFileName()}.xlsx`);
  };

  const exportPDF = async () => {
    const { headers, rows } = buildExportRows();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const logoDataUrl = await getSkavioLogoDataUrl();
    const title = `${school?.name ?? ""} — ${TITLES[exam]}`;
    doc.setFontSize(12);
    doc.text(title, 40, 30);
    const t = terms.find(x => x.id === termId); const c = classes.find(x => x.id === classId);
    doc.setFontSize(9);
    doc.text(`Class: ${c?.name ?? "—"}    Term: ${t ? `${t.name} ${t.year}` : "—"}`, 40, 46);

    const colW = Math.max(40, (doc.internal.pageSize.getWidth() - 80) / headers.length);
    const FOOTER_RESERVE = 36; // pt — keeps content above Skavio footer
    let y = 70;
    doc.setFontSize(8);
    headers.forEach((h, i) => doc.text(String(h), 40 + i * colW, y));
    y += 12; doc.setLineWidth(0.5); doc.line(40, y - 8, 40 + headers.length * colW, y - 8);
    rows.forEach(r => {
      r.forEach((v, i) => doc.text(String(v ?? ""), 40 + i * colW, y));
      y += 12;
      if (y > doc.internal.pageSize.getHeight() - FOOTER_RESERVE) { doc.addPage(); y = 40; }
    });
    y += 14;
    if (y > doc.internal.pageSize.getHeight() - FOOTER_RESERVE - 30) { doc.addPage(); y = 40; }
    doc.setFontSize(10); doc.text("SUMMARY", 40, y); y += 14;
    doc.setFontSize(9);
    doc.text(`DIV1: ${divSummary["1"] || 0}   DIV2: ${divSummary["2"] || 0}   DIV3: ${divSummary["3"] || 0}   DIV4: ${divSummary["4"] || 0}   DIV X: ${divSummary.X || 0}   U: ${divSummary.U || 0}`, 40, y);
    drawSkavioFooter(doc, logoDataUrl);
    doc.save(`${baseFileName()}.pdf`);
  };

  // Download form as PDF (print-styled)
  const downloadPDF = () => {
    // Use the browser's native print-to-PDF flow with the existing print stylesheet.
    // Most modern browsers expose "Save as PDF" in the print dialog, which respects A4 layout.
    window.print();
  };

  // CSV TEMPLATE: NAMES, <core subject codes>
  const downloadTemplate = () => {
    const header = ["NAMES", ...subjects.map(s => (s.code === "OTHER" && s.code_label) ? s.code_label : s.code)];
    const example = filteredLearners.slice(0, 1).map(l => [l.full_name, ...subjects.map(() => "")]);
    if (example.length === 0) example.push(["Nalule", ...subjects.map((_, i) => String([50, 66, 78, 81, 70, 72, 65, 60][i] ?? ""))]);
    const csv = Papa.unparse([header, ...example]);
    downloadFile(csv, "text/csv;charset=utf-8;", "template.csv");
  };

  const handleImportFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data;
        if (!rows.length) { toast({ title: "Empty file", variant: "destructive" }); return; }
        const headerKeys = Object.keys(rows[0]).map(k => k.trim());
        const nameKey = headerKeys.find(k => k.toUpperCase() === "NAMES" || k.toUpperCase() === "NAME");
        if (!nameKey) { toast({ title: "Invalid format or unknown student/subject", description: "Missing NAMES column", variant: "destructive" }); return; }
        // Map header -> subject id
        const subByCode: Record<string, Subject> = {};
        for (const s of subjects) {
          const code = (s.code === "OTHER" && s.code_label) ? s.code_label : s.code;
          subByCode[String(code).toUpperCase()] = s;
        }
        const learnerByName: Record<string, Learner> = {};
        for (const l of filteredLearners) learnerByName[l.full_name.toUpperCase().trim()] = l;

        const updates: Record<string, MarkRow> = { ...marks };
        let updated = 0; const unknown: string[] = [];
        for (const r of rows) {
          const name = String(r[nameKey] ?? "").trim().toUpperCase();
          const learner = learnerByName[name];
          if (!learner) { unknown.push(name); continue; }
          for (const h of headerKeys) {
            if (h === nameKey) continue;
            const subj = subByCode[h.toUpperCase()];
            if (!subj) { unknown.push(h); continue; }
            const raw = String(r[h] ?? "").trim();
            if (raw === "") continue;
            const num = Number(raw);
            if (isNaN(num)) continue;
            const key = `${learner.id}|${subj.id}`;
            updates[key] = {
              ...(updates[key] ?? { learner_id: learner.id, subject_id: subj.id, bot: null, mid: null, eot: null }),
              [exam]: num,
            } as MarkRow;
            updated += 1;
          }
        }
        if (updated === 0) {
          toast({ title: "Invalid format or unknown student/subject", description: unknown.slice(0, 5).join(", "), variant: "destructive" });
          return;
        }
        setMarks(updates);
        setImportOpen(false);
        toast({ title: `Imported ${updated} mark(s)`, description: unknown.length ? `Skipped: ${unknown.slice(0, 5).join(", ")}` : undefined });
      },
      error: (err) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
    });
  };


  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const term = terms.find(t => t.id === termId);
  const cls = classes.find(c => c.id === classId);
  const stream = streams.find(s => s.id === streamId);

  return (
    <div className="space-y-4">
      {/* Controls (hidden in print) */}
      <div className="no-print space-y-4">
        <div>
          <h1 className="text-3xl font-bold">{TITLES[exam]}</h1>
          <p className="text-muted-foreground">Enter marks; grade, totals, position and division compute live.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border rounded-md bg-card">
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
              <SelectContent>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Stream</Label>
            <Select value={streamId} onValueChange={setStreamId} disabled={!classId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All streams</SelectItem>
                <SelectItem value="none">No stream</SelectItem>
                {streams.filter(s => s.class_id === classId).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={saveAll}
              disabled={saving || !termId || !classId || filteredLearners.length === 0 || !isDirty}
              className="w-full"
              title={!isDirty ? "No new changes made" : "Save changes"}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save{isDirty ? " *" : ""}
            </Button>
          </div>
        </div>

        {/* Action toolbar */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadPDF} disabled={!classId || filteredLearners.length === 0}>
            <FileDown className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={!classId || filteredLearners.length === 0}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!classId || subjects.length === 0}>
            <Upload className="mr-2 h-4 w-4" /> Import Marks (CSV)
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!classId || filteredLearners.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportXLSX}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={exportCSV}><FileText className="mr-2 h-4 w-4" /> CSV (.csv)</DropdownMenuItem>
              <DropdownMenuItem onClick={exportPDF}><FileDown className="mr-2 h-4 w-4" /> PDF (.pdf)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {classId && !coreCountValid && (
          <div className="rounded-md border border-destructive bg-destructive/10 text-destructive text-sm p-3">
            Exactly 4 core subjects are required to calculate aggregates. This class currently has {coreSubjects.length}. Mark exactly 4 subjects as <strong>Core</strong> in the Subjects page — AGG and DIV are disabled until then.
          </div>
        )}
        {classId && coreCountValid && (
          <div className="text-xs text-muted-foreground">
            Aggregates calculated using: {coreSubjects.map(s => (s.code === "OTHER" && s.code_label) ? s.code_label : s.code).join(", ")}
          </div>
        )}
      </div>

      {/* Import CSV dialog (no-print) */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="no-print">
          <DialogHeader>
            <DialogTitle>Import Marks (CSV)</DialogTitle>
            <DialogDescription>
              Upload a CSV file with the columns: <strong>NAMES</strong>, then one column per subject code.
              Student names must match system records and subject headers must match subject codes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono">
              NAMES,{subjects.map(s => (s.code === "OTHER" && s.code_label) ? s.code_label : s.code).join(",")}<br />
              Nalule,{subjects.map(() => "").join(",")}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" /> Download Template
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.currentTarget.value = ""; }}
              />
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Choose CSV File
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable area */}
      <div className="marks-form">
        <div className="marks-form__header">
          <div className="marks-form__school">{school?.name ?? ""}</div>
          <h2 className="marks-form__title">{TITLES[exam]}</h2>
          <div className="marks-form__meta">
            <span><strong>CLASS:</strong> {cls?.name ?? "—"}</span>
            <span><strong>STREAM:</strong> {streamId === "all" ? "All" : streamId === "none" ? "—" : (stream?.name ?? "—")}</span>
            <span><strong>TERM:</strong> {term ? `${term.name} ${term.year}` : "—"}</span>
          </div>
        </div>

        {!classId ? (
          <p className="no-print text-sm text-muted-foreground py-6 text-center">Select a class to begin.</p>
        ) : (
          <>
            <table className="marks-form__table">
              <thead>
                <tr>
                  <th className="col-name">
                    <div className="diag-cell">
                      <span className="diag-sub">SUB</span>
                      <span className="diag-name">NAMES</span>
                    </div>
                  </th>
                  {subjects.map(s => (
                    <th key={s.id} className="col-sub">{s.code === "OTHER" && s.code_label ? s.code_label : s.code}</th>
                  ))}
                  <th>TOTAL</th>
                  <th>AVE</th>
                  <th>POSITION</th>
                  <th>AGG</th>
                  <th>DIV</th>
                </tr>
              </thead>
              <tbody>
                {filteredLearners.map((l) => {
                  const calc = rowCalcs.get(l.id);
                  const pos = positions.get(l.id) ?? 0;
                  return (
                    <tr key={l.id}>
                      <td className="col-name">{l.full_name}</td>
                      {subjects.map(s => {
                        const v = marks[`${l.id}|${s.id}`]?.[exam];
                        const grade = calc?.subjectGrades[s.id];
                        return (
                          <td key={s.id} className="col-sub">
                            <div className="mark-cell">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={s.max_marks}
                                value={v ?? ""}
                                onChange={(e) => setMark(l.id, s.id, e.target.value)}
                              />
                              <span className="mark-grade">{v != null && grade ? `(${grade})` : ""}</span>
                            </div>
                          </td>
                        );
                      })}
                      <td>{calc && calc.total > 0 ? calc.total : ""}</td>
                      <td>{calc && calc.total > 0 ? calc.ave : ""}</td>
                      <td>{pos > 0 ? pos : ""}</td>
                      <td>{calc && calc.agg > 0 ? calc.agg : ""}</td>
                      <td>{calc?.div || ""}</td>
                    </tr>
                  );
                })}
                {/* pad with empty rows so the table feels register-like */}
                {Array.from({ length: Math.max(0, 5 - filteredLearners.length) }).map((_, i) => (
                  <tr key={`pad-${i}`} className="pad-row">
                    <td className="col-name">&nbsp;</td>
                    {subjects.map(s => <td key={s.id} className="col-sub">&nbsp;</td>)}
                    <td></td><td></td><td></td><td></td><td></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="marks-form__summary-wrap">
              <div className="marks-form__summary-title">SUMMARY</div>
              <table className="marks-form__summary">
                <thead>
                  <tr>
                    <th>DN</th>
                    <th>DIV1</th>
                    <th>DIV2</th>
                    <th>DIV3</th>
                    <th>DIV4</th>
                    <th>DIV X</th>
                    <th>U</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>No.</td>
                    <td>{divSummary["1"] || ""}</td>
                    <td>{divSummary["2"] || ""}</td>
                    <td>{divSummary["3"] || ""}</td>
                    <td>{divSummary["4"] || ""}</td>
                    <td>{divSummary.X || ""}</td>
                    <td>{divSummary.U || ""}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Subject Performance Summary (auto-generated, real-time) */}
            <div className="marks-form__summary-wrap">
              <div className="marks-form__summary-title">SUBJECT PERFORMANCE SUMMARY (AUTO GENERATED){cls?.name ? ` — ${cls.name}` : ""}</div>
              <table className="marks-form__summary">
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th style={{ textAlign: "left" }}>GRADE SUBJECT</th>
                    {GRADE_COLS.map(g => <th key={g}>{g}</th>)}
                    <th>FIRST GRADE CONTRIBUTION</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectPerformance.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: "center" }}>No subjects.</td></tr>
                  ) : subjectPerformance.map(r => (
                    <tr key={r.subjectId}>
                      <td>{r.rank}</td>
                      <td style={{ textAlign: "left" }}>{r.label}</td>
                      {GRADE_COLS.map(g => <td key={g}>{r.counts[g] || 0}</td>)}
                      <td><strong>{r.firstGrade}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", fontWeight: 600 }}>
                      TOTAL NUMBER OF LEARNERS = {filteredLearners.length}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Skavio footer — visible on screen, print and save-as-PDF */}
            <div className="marks-form__footer">
              <img
                src={skavioLogoUrl}
                alt="Skavio Technologies"
                className="marks-form__footer-logo"
              />
              <span className="marks-form__footer-text">
                Generated by Skavio Primary — Powered by Skavio Technologies | 0705466283
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
