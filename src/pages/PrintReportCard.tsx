import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import "./PrintReportCard.css";

type Anything = Record<string, any>;

async function signedUrl(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export default function PrintReportCard() {
  const { learnerId, termId } = useParams<{ learnerId: string; termId: string }>();
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<Anything | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headSigUrl, setHeadSigUrl] = useState<string | null>(null);
  const [classSigUrl, setClassSigUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [learner, setLearner] = useState<Anything | null>(null);
  const [klass, setKlass] = useState<Anything | null>(null);
  const [stream, setStream] = useState<Anything | null>(null);
  const [classTeacher, setClassTeacher] = useState<Anything | null>(null);
  const [term, setTerm] = useState<Anything | null>(null);
  const [report, setReport] = useState<Anything | null>(null);
  const [subjects, setSubjects] = useState<Anything[]>([]);
  const [marks, setMarks] = useState<Anything[]>([]);

  useEffect(() => {
    if (!learnerId || !termId) return;
    (async () => {
      setLoading(true);
      const { data: ln } = await supabase.from("learners").select("*").eq("id", learnerId).maybeSingle();
      setLearner(ln);

      const [{ data: tm }, { data: rc }, { data: si }] = await Promise.all([
        supabase.from("terms").select("*").eq("id", termId).maybeSingle(),
        supabase.from("report_cards").select("*").eq("learner_id", learnerId).eq("term_id", termId).maybeSingle(),
        supabase.from("school_info").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setTerm(tm); setReport(rc); setSchool(si);

      let cls: Anything | null = null;
      if (ln?.class_id) {
        const { data } = await supabase.from("classes").select("*").eq("id", ln.class_id).maybeSingle();
        cls = data; setKlass(data);
      }
      if (ln?.stream_id) {
        const { data } = await supabase.from("streams").select("*").eq("id", ln.stream_id).maybeSingle();
        setStream(data);
      }
      if (cls?.class_teacher_id) {
        const { data } = await supabase.from("teachers").select("*").eq("id", cls.class_teacher_id).maybeSingle();
        setClassTeacher(data);
      }
      if (ln?.class_id) {
        const { data: subs } = await supabase.from("subjects").select("*").eq("class_id", ln.class_id).order("sort_order");
        setSubjects(subs ?? []);
      }
      const { data: mks } = await supabase.from("marks").select("*").eq("term_id", termId).eq("learner_id", learnerId);
      setMarks(mks ?? []);

      const [lg, hs, cs, ph] = await Promise.all([
        signedUrl("school-assets", si?.logo_path ?? null),
        signedUrl("signatures", si?.head_teacher_signature_path ?? null),
        signedUrl("signatures", cls?.class_signature_path ?? null),
        signedUrl("learner-photos", ln?.photo_path ?? null),
      ]);
      setLogoUrl(lg); setHeadSigUrl(hs); setClassSigUrl(cs); setPhotoUrl(ph);

      setLoading(false);
    })();
  }, [learnerId, termId]);

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!learner || !term || !report) {
    return <div className="p-8 text-center">
      <p className="text-muted-foreground">Report card not found. Generate it from the Report Cards page first.</p>
    </div>;
  }

  const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—";

  return (
    <div className="print-root">
      <div className="no-print sticky top-0 z-10 bg-background border-b p-3 flex justify-end gap-2">
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>

      <div className="report-page">
        {/* Header */}
        <header className="rc-header">
          {logoUrl && <img src={logoUrl} alt="logo" className="rc-logo" />}
          <div className="rc-school">
            <h1>{school?.name ?? "School Name"}</h1>
            <div className="rc-meta">
              {school?.po_box && <span>P.O. Box {school.po_box}</span>}
              {school?.location && <span>{school.location}</span>}
              {school?.tel && <span>Tel: {school.tel}</span>}
              {school?.email && <span>Email: {school.email}</span>}
            </div>
            {school?.motto && <div className="rc-motto">"{school.motto}"</div>}
          </div>
          {photoUrl ? <img src={photoUrl} alt="learner" className="rc-photo" /> : <div className="rc-photo-placeholder">PHOTO</div>}
        </header>

        <h2 className="rc-title">TERMINAL REPORT — {term.name?.toUpperCase()} {term.year}</h2>

        {/* Learner block */}
        <table className="rc-info">
          <tbody>
            <tr>
              <td><strong>Name:</strong> {learner.full_name}</td>
              <td><strong>Class:</strong> {klass?.name ?? "—"}{stream ? ` ${stream.name}` : ""}</td>
              <td><strong>Section:</strong> {learner.section ?? "—"}</td>
            </tr>
            <tr>
              <td><strong>Index No:</strong> {learner.index_no ?? "—"}</td>
              <td><strong>House:</strong> {learner.house ?? "—"}</td>
              <td><strong>Age:</strong> {learner.age ?? "—"}</td>
            </tr>
            <tr>
              <td><strong>Position:</strong> {report.position} of {report.class_size}</td>
              <td><strong>Pay Code:</strong> {learner.pay_code ?? "—"}</td>
              <td><strong>Division:</strong> {report.division}</td>
            </tr>
          </tbody>
        </table>

        {/* Marks table */}
        <table className="rc-marks">
          <thead>
            <tr>
              <th>Subject</th>
              <th>BOT</th>
              <th>MID</th>
              <th>EOT</th>
              <th>Total</th>
              <th>Grade</th>
              <th>Pts</th>
              <th>Remark</th>
              <th>Teacher</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map(s => {
              const m = marks.find(mm => mm.subject_id === s.id);
              return (
                <tr key={s.id}>
                  <td className="rc-subject">{s.name}</td>
                  <td>{m?.bot ?? "—"}</td>
                  <td>{m?.mid ?? "—"}</td>
                  <td>{m?.eot ?? "—"}</td>
                  <td><strong>{m?.total ?? "—"}</strong></td>
                  <td><strong>{m?.grade ?? "—"}</strong></td>
                  <td>{m?.points ?? "—"}</td>
                  <td>{m?.remark ?? "—"}</td>
                  <td>{m?.teacher_initials ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="rc-total-label">TOTAL</td>
              <td><strong>{report.total_marks}</strong></td>
              <td colSpan={2}><strong>Aggregate: {report.aggregate}</strong></td>
              <td colSpan={2}><strong>Average: {report.average}</strong></td>
            </tr>
          </tfoot>
        </table>

        {/* Comments */}
        <div className="rc-comments">
          <div className="rc-comment-block">
            <div className="rc-comment-label">Class Teacher's Comment</div>
            <div className="rc-comment-text">{report.class_teacher_comment || "—"}</div>
            <div className="rc-sign-line">
              {classSigUrl && <img src={classSigUrl} alt="signature" className="rc-sign" />}
              <div className="rc-sign-name">{classTeacher?.full_name ?? ""}</div>
              <div className="rc-sign-role">Class Teacher</div>
            </div>
          </div>
          <div className="rc-comment-block">
            <div className="rc-comment-label">Head Teacher's Comment</div>
            <div className="rc-comment-text">{report.head_teacher_comment || "—"}</div>
            <div className="rc-sign-line">
              {headSigUrl && <img src={headSigUrl} alt="signature" className="rc-sign" />}
              <div className="rc-sign-name">{school?.head_teacher_name ?? ""}</div>
              <div className="rc-sign-role">Head Teacher</div>
            </div>
          </div>
        </div>

        {/* Footer dates */}
        <div className="rc-footer">
          <div><strong>Term Ends:</strong> {fmtDate(term.ends_on ?? term.end_date)}</div>
          <div><strong>Next Term Begins:</strong> {fmtDate(term.next_begins_on)}</div>
          <div><strong>Generated:</strong> {fmtDate(report.generated_at)}</div>
        </div>
      </div>
    </div>
  );
}
