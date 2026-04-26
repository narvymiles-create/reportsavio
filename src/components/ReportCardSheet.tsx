import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { gradeFor, type GradeBand } from "@/lib/grading";
import { useLearnerFieldSettings } from "@/hooks/useLearnerFieldSettings";


type Anything = Record<string, any>;

async function signedUrl(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";

export type ReportCardSheetProps = {
  learnerId: string;
  termId: string;
  /** Called once when this card has finished loading (signals readiness for print/snapshot). */
  onReady?: () => void;
  /** Adds the CSS class that triggers a page-break-after for bulk pages. */
  pageBreak?: boolean;
};

/**
 * Renders a single, fully-styled report card sheet (no header/print toolbar).
 * Reuses the .report-page CSS in PrintReportCard.css.
 */
export function ReportCardSheet({ learnerId, termId, onReady, pageBreak }: ReportCardSheetProps) {
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<Anything | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
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
  const [bands, setBands] = useState<GradeBand[]>([]);
  const [teachersById, setTeachersById] = useState<Record<string, Anything>>({});
  const { flags } = useLearnerFieldSettings();

  useEffect(() => {
    if (!learnerId || !termId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: ln } = await supabase.from("learners").select("*").eq("id", learnerId).maybeSingle();
      if (cancelled) return;
      setLearner(ln);

      const [{ data: tm }, { data: rc }, { data: si }, { data: gs }] = await Promise.all([
        supabase.from("terms").select("*").eq("id", termId).maybeSingle(),
        supabase.from("report_cards").select("*").eq("learner_id", learnerId).eq("term_id", termId).maybeSingle(),
        supabase.from("school_info").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("grading_scales").select("grade,points,min_mark,max_mark,remark").order("sort_order"),
      ]);
      if (cancelled) return;
      setTerm(tm); setReport(rc); setSchool(si); setBands((gs ?? []) as GradeBand[]);

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
        const teacherIds = Array.from(new Set((subs ?? []).map((s: any) => s.subject_teacher_id).filter(Boolean)));
        if (teacherIds.length) {
          const { data: ts } = await supabase.from("teachers").select("id,initials,full_name").in("id", teacherIds);
          const map: Record<string, Anything> = {};
          (ts ?? []).forEach((t: any) => { map[t.id] = t; });
          setTeachersById(map);
        } else {
          setTeachersById({});
        }
      }
      const { data: mks } = await supabase.from("marks").select("*").eq("term_id", termId).eq("learner_id", learnerId);
      setMarks(mks ?? []);

      const [lg, hs, cs, ph, st, wm] = await Promise.all([
        signedUrl("school-assets", si?.logo_path ?? null),
        signedUrl("signatures", si?.head_teacher_signature_path ?? null),
        signedUrl("signatures", cls?.class_signature_path ?? null),
        signedUrl("learner-photos", ln?.photo_path ?? null),
        signedUrl("school-assets", si?.stamp_path ?? null),
        signedUrl("school-assets", si?.watermark_path ?? null),
      ]);
      if (cancelled) return;
      setLogoUrl(lg); setHeadSigUrl(hs); setClassSigUrl(cs); setPhotoUrl(ph); setStampUrl(st); setWatermarkUrl(wm);
      setLoading(false);
      onReady?.();
    })();
    return () => { cancelled = true; };
  }, [learnerId, termId]);

  const MAX_SUBJECTS = 7;
  const orderedSubjects = useMemo(() => subjects.slice(0, MAX_SUBJECTS), [subjects]);
  const subjectCountKey = Math.min(Math.max(orderedSubjects.length, 3), 7);
  const marksBySubject = useMemo(() => {
    const map = new Map<string, Anything>();
    marks.forEach(m => map.set(m.subject_id, m));
    return map;
  }, [marks]);

  const coreSubjectIds = useMemo(
    () => new Set(orderedSubjects.filter((s: any) => s.is_core).map((s: any) => s.id)),
    [orderedSubjects]
  );
  const coreCountValid = coreSubjectIds.size === 4;

  const summary = (phase: "bot" | "mid" | "eot") => {
    const vals = orderedSubjects.map(s => {
      const m = marksBySubject.get(s.id);
      const v = m?.[phase];
      return { id: s.id, v: typeof v === "number" ? v : (v != null ? Number(v) : null) };
    });
    const present = vals.map(x => x.v).filter((v): v is number => v != null && !isNaN(v));
    const total = present.reduce((a, b) => a + b, 0);
    const avg = present.length ? Math.round((total / present.length) * 100) / 100 : 0;
    const aggregate = coreCountValid
      ? vals.reduce((sum, x) => {
          if (x.v == null || !coreSubjectIds.has(x.id)) return sum;
          const b = gradeFor(x.v, bands);
          return sum + (b?.points ?? 0);
        }, 0)
      : 0;
    return { total, avg, aggregate };
  };

  if (loading || !learner || !term || !report) {
    return <div className="report-page" style={pageBreak ? { pageBreakAfter: "always" } : undefined}>
      <p style={{ textAlign: "center", marginTop: "40mm", color: "#666" }}>
        {loading ? "Loading..." : "Report card not generated for this learner."}
      </p>
    </div>;
  }

  const botSum = summary("bot");
  const midSum = summary("mid");
  const eotTotal = report.total_marks ?? 0;
  const eotAvg = report.average ?? 0;
  const eotAggregate = report.aggregate ?? 0;

  const codeFor = (name: string): string => {
    const n = name.toUpperCase();
    if (n.includes("ENGLISH")) return "ENG";
    if (n.includes("MATH")) return "MTC";
    if (n.includes("SCIEN")) return "SCI";
    if (n.includes("SOCIAL")) return "SST";
    if (n.includes("RELIG")) return "R.E";
    if (n.includes("COMPUT") || n.includes("ICT")) return "ICT";
    return name.slice(0, 4).toUpperCase();
  };

  const renderPhaseTable = (
    label: string,
    phase: "bot" | "mid",
    sum: { total: number; avg: number; aggregate: number }
  ) => (
    <div className="rc-phase-section" data-subjects={subjectCountKey}>
      <div className="rc-section-label">{label}</div>
      <table className="rc-phase" data-subjects={subjectCountKey}>
        <thead>
          <tr>
            <th className="rc-phase-rowlabel">SUBJECTS</th>
            {orderedSubjects.map(s => <th key={s.id}>{codeFor(s.name)}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="rc-phase-rowlabel">MARKS</td>
            {orderedSubjects.map(s => {
              const m = marksBySubject.get(s.id);
              const v = m?.[phase];
              return <td key={s.id}>{v != null && v !== "" ? v : ""}</td>;
            })}
          </tr>
          <tr>
            <td className="rc-phase-rowlabel">GRADE</td>
            {orderedSubjects.map(s => {
              const m = marksBySubject.get(s.id);
              const v = m?.[phase];
              const g = v != null ? gradeFor(Number(v), bands) : null;
              return <td key={s.id}>{g?.grade ?? ""}</td>;
            })}
          </tr>
        </tbody>
      </table>
      <table className="rc-phase-summary">
        <tbody>
          <tr>
            <td><span className="rc-ps-label">TOTAL MARKS:</span> <span className="rc-ps-val">{sum.total || ""}</span></td>
            <td><span className="rc-ps-label">AVERAGE:</span> <span className="rc-ps-val">{sum.avg || ""}</span></td>
            <td><span className="rc-ps-label">POSITION:</span> <span className="rc-ps-val">—</span></td>
            <td><span className="rc-ps-label">AGGREGATES:</span> <span className="rc-ps-val">{sum.aggregate || ""}</span></td>
            <td><span className="rc-ps-label">DIVISION:</span> <span className="rc-ps-val">—</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const divisionFigure = (() => {
    const d = report.division;
    if (d == null || d === "") return "";
    const s = String(d);
    const arabic = s.match(/\d+/);
    if (arabic) return arabic[0];
    const romanMap: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4", V: "5", U: "U", X: "U" };
    const upper = s.toUpperCase().replace(/[^A-Z]/g, "");
    const tokens = upper.match(/IV|III|II|I|V|U|X/g);
    if (tokens && tokens[0] && romanMap[tokens[0]]) return romanMap[tokens[0]];
    return s;
  })();

  const wmEnabled = !!school?.watermark_enabled && !!watermarkUrl;
  const wmMode = (school?.watermark_mode as string) || "custom";
  const wmOpacity = school?.watermark_opacity ?? 0.3;
  const wmScale = school?.watermark_scale ?? 1.0;
  const wmX = school?.watermark_x ?? 50;
  const wmY = school?.watermark_y ?? 50;

  return (
    <div className="report-page" style={pageBreak ? { pageBreakAfter: "always" } : undefined}>
      {wmEnabled && (
        <div
          aria-hidden
          className="rc-watermark"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          {wmMode === "fit" || wmMode === "fill" ? (
            <img
              src={watermarkUrl!}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: wmMode === "fill" ? "cover" : "contain",
                opacity: wmOpacity,
              }}
            />
          ) : (
            <img
              src={watermarkUrl!}
              alt=""
              style={{
                position: "absolute",
                left: `${wmX}%`,
                top: `${wmY}%`,
                width: `${40 * wmScale}%`,
                height: "auto",
                transform: "translate(-50%, -50%)",
                opacity: wmOpacity,
              }}
            />
          )}
        </div>
      )}

      <table className="rc-head" cellSpacing={0} cellPadding={0}>
        <tbody>
          <tr>
            <td className="rc-head-logo-cell">
              <div className="rc-box rc-logo-box">
                {logoUrl ? <img src={logoUrl} alt="logo" /> : <span>SCHOOL<br />LOGO</span>}
              </div>
            </td>
            <td className="rc-head-school-cell">
              <div className="rc-school-name">{(school?.name ?? "SCHOOL NAME").toUpperCase()}</div>
              {school?.location && <div className="rc-school-line">Location: {school.location}</div>}
              {school?.po_box && <div className="rc-school-line">P.O.BOX {school.po_box}</div>}
              {school?.tel && <div className="rc-school-line">TEL: {school.tel}</div>}
              {school?.email && <div className="rc-school-line">Email: {school.email}</div>}
              {school?.website && <div className="rc-school-line">Website: {school.website}</div>}
            </td>
            <td className="rc-head-photo-cell">
              <div className="rc-box rc-photo-box">
                {photoUrl ? <img src={photoUrl} alt="learner" /> : <span>STUDENT<br />PHOTO</span>}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="rc-title">
        LEARNER&rsquo;S ASSESSMENT REPORT CARD TERM &ndash; {term.name?.toUpperCase()} {term.year}
      </div>

      <table className="rc-student" cellSpacing={0} cellPadding={0}>
        <tbody>
          <tr>
            <td><span className="rc-lbl">NAME:</span> <span className="rc-fill">{learner.full_name ?? ""}</span></td>
            {flags.stream
              ? <td><span className="rc-lbl">STREAM:</span> <span className="rc-fill">{stream?.name ?? ""}</span></td>
              : <td />}
            {flags.house
              ? <td><span className="rc-lbl">HOUSE:</span> <span className="rc-fill">{learner.house ?? ""}</span></td>
              : <td />}
          </tr>
          <tr>
            {flags.section
              ? <td><span className="rc-lbl">SECTION:</span> <span className="rc-fill">{learner.section ?? ""}</span></td>
              : <td />}
            <td><span className="rc-lbl">AGE:</span> <span className="rc-fill">{learner.age ?? ""}</span></td>
            <td><span className="rc-lbl">SEX:</span> <span className="rc-fill">{learner.sex ?? ""}</span></td>
          </tr>
          <tr>
            <td>
              <span className="rc-lbl">
                {learner.active_reg_type === "LIN" ? "LIN NO.:" :
                 learner.active_reg_type === "REG" ? "REG NO.:" : "INDEX NO.:"}
              </span>{" "}
              <span className="rc-fill">
                {learner.active_reg_type === "LIN" ? (learner.lin_no ?? "") :
                 learner.active_reg_type === "REG" ? (learner.reg_no ?? "") :
                 (learner.index_no ?? "")}
              </span>
            </td>
            <td />
            <td />
          </tr>
          <tr>
            <td><span className="rc-lbl">CLASS:</span> <span className="rc-fill">{klass?.name ?? ""}</span></td>
            {flags.stream
              ? <td><span className="rc-lbl">STREAM:</span> <span className="rc-fill">{stream?.name ?? ""}</span></td>
              : <td />}
            {flags.pay_code
              ? <td><span className="rc-lbl">PAY CODE:</span> <span className="rc-fill">{learner.pay_code ?? ""}</span></td>
              : <td />}
          </tr>
        </tbody>
      </table>

      {renderPhaseTable("BEGINNING OF TERM EXAMS", "bot", botSum)}
      {renderPhaseTable("MID-TERM EXAMS", "mid", midSum)}

      <div className="rc-eot-section" data-subjects={subjectCountKey}>
      <div className="rc-section-label">END OF TERM EXAMS</div>
      <table className="rc-eot" data-subjects={subjectCountKey}>
        <thead>
          <tr>
            <th className="rc-eot-subject">SUBJECTS</th>
            <th>FULL MARKS</th><th>MARKS GOT</th><th>GRADE</th><th>REMARKS</th><th>INITIALS</th>
          </tr>
        </thead>
        <tbody>
          {orderedSubjects.map(s => {
            const m = marksBySubject.get(s.id);
            const isCore = coreSubjectIds.has(s.id);
            return (
              <tr key={s.id}>
                <td className="rc-eot-subject">{s.name?.toUpperCase()}</td>
                <td>{s.max_marks ?? 100}</td>
                <td>{m?.eot ?? ""}</td>
                <td>{isCore ? (m?.grade ?? "") : ""}</td>
                <td>{isCore ? (m?.remark ?? "") : ""}</td>
                <td>{(s.subject_teacher_id && teachersById[s.subject_teacher_id]?.initials) || m?.teacher_initials || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="rc-phase-summary">
        <tbody>
          <tr>
            <td><span className="rc-ps-label">TOTAL MARKS:</span> <span className="rc-ps-val">{eotTotal || ""}</span></td>
            <td><span className="rc-ps-label">AVERAGE:</span> <span className="rc-ps-val">{eotAvg || ""}</span></td>
            <td><span className="rc-ps-label">POSITION:</span> <span className="rc-ps-val">{report.position ? `${report.position} / ${report.class_size}` : ""}</span></td>
            <td><span className="rc-ps-label">AGGREGATES:</span> <span className="rc-ps-val">{eotAggregate || ""}</span></td>
            <td><span className="rc-ps-label">DIVISION:</span> <span className="rc-ps-val">{divisionFigure}</span></td>
          </tr>
        </tbody>
      </table>
      </div>

      <table className="rc-bottom" cellSpacing={0} cellPadding={0}>
        <tbody>
          <tr>
            <td className="rc-b-cell rc-b-tl">
              <div className="rc-b-block rc-b-inline">
                <span className="rc-b-label">Learner&rsquo;s Conduct &amp; Behavior:</span>
                <span className="rc-b-text">{learner.conduct ?? ""}</span>
              </div>
              <div className="rc-b-block rc-b-inline">
                <span className="rc-b-label">Co-curricular Activities:</span>
                <span className="rc-b-text">{learner.co_curricular ?? ""}</span>
              </div>
            </td>
            <td className="rc-b-cell rc-b-tr">
              <div className="rc-sig-block">
                <div className="rc-sig-stack">
                  {classSigUrl && <img src={classSigUrl} alt="class signature" className="rc-sig-img" />}
                  <div className="rc-sig-dots">..................................................</div>
                </div>
                <div className="rc-sig-name">{classTeacher?.full_name?.toUpperCase() ?? ""}</div>
                <div className="rc-sig-position">Class Teacher</div>
              </div>
            </td>
          </tr>
          <tr>
            <td className="rc-b-cell rc-b-bl">
              <div className="rc-b-row-split">
                <div className="rc-b-label-col">Class Teacher&rsquo;s final comment:</div>
                <div className="rc-b-text-col">{report.class_teacher_comment ?? ""}</div>
              </div>
              <div className="rc-b-row-split">
                <div className="rc-b-label-col">Head Teacher&rsquo;s final comment:</div>
                <div className="rc-b-text-col">{report.head_teacher_comment ?? ""}</div>
              </div>
            </td>
            <td className="rc-b-cell rc-b-br">
              <div className="rc-sig-block">
                <div className="rc-sig-stack">
                  {headSigUrl && <img src={headSigUrl} alt="head signature" className="rc-sig-img" />}
                  <div className="rc-sig-dots">..................................................</div>
                </div>
                <div className="rc-sig-name">{school?.head_teacher_name?.toUpperCase() ?? ""}</div>
                <div className="rc-sig-position">Head Teacher</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="rc-term-dates">
        <div><span className="rc-lbl">Next Term Begins On:</span> <span className="rc-fill">{fmtDate(term.next_begins_on)}</span></div>
        <div><span className="rc-lbl">Ends On:</span> <span className="rc-fill">{fmtDate(term.ends_on ?? term.end_date)}</span></div>
      </div>

      <div className="rc-grading-title">SCHOOL GRADING SYSTEM</div>
      <table className="rc-grading">
        <tbody>
          <tr>
            <td className="rc-g-label">GRADE</td>
            {bands.map(b => <td key={b.grade}>{b.grade}</td>)}
          </tr>
          <tr>
            <td className="rc-g-label">MARKS</td>
            {bands.map(b => <td key={b.grade}>{b.min_mark}-{b.max_mark}</td>)}
          </tr>
        </tbody>
      </table>

      {stampUrl && (
        <img
          src={stampUrl}
          alt="school stamp"
          className="rc-stamp"
          style={{
            position: "absolute",
            left: `${school?.stamp_x ?? 75}%`,
            top: `${school?.stamp_y ?? 78}%`,
            width: `${28 * (school?.stamp_size ?? 1)}mm`,
            height: `${28 * (school?.stamp_size ?? 1)}mm`,
            objectFit: "contain",
            opacity: school?.stamp_opacity ?? 0.6,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
