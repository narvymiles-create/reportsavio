import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateDivision, gradeFor, applyF9Override, isCriticalCoreSubject, type GradeBand } from "@/lib/grading";
import { useLearnerFieldSettings } from "@/hooks/useLearnerFieldSettings";
import { preloadImageAsBase64, waitForImagesAndFonts } from "@/lib/reportAssets";


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
  /** Reports true/false readiness whenever the sheet reloads. */
  onReadyChange?: (ready: boolean) => void;
  /** Adds the CSS class that triggers a page-break-after for bulk pages. */
  pageBreak?: boolean;
};

/**
 * Renders a single, fully-styled report card sheet (no header/print toolbar).
 * Reuses the .report-page CSS in PrintReportCard.css.
 */
export function ReportCardSheet({ learnerId, termId, onReady, onReadyChange, pageBreak }: ReportCardSheetProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const readySignaledRef = useRef(false);
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
  const [classMarks, setClassMarks] = useState<Anything[]>([]);
  const [classSubjects, setClassSubjects] = useState<Anything[]>([]);
  const [classLearnerCount, setClassLearnerCount] = useState<number>(0);
  const [teachersById, setTeachersById] = useState<Record<string, Anything>>({});
  const [reportDataReady, setReportDataReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { flags, order } = useLearnerFieldSettings();

  useEffect(() => {
    if (!learnerId || !termId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setReportDataReady(false);
      readySignaledRef.current = false;
      onReadyChange?.(false);
      const { data: ln } = await supabase.from("learners").select("*").eq("id", learnerId).maybeSingle();
      if (cancelled) return;

      const [{ data: tm }, { data: rc }, { data: si }, { data: gs }] = await Promise.all([
        supabase.from("terms").select("*").eq("id", termId).maybeSingle(),
        supabase.from("report_cards").select("*").eq("learner_id", learnerId).eq("term_id", termId).maybeSingle(),
        supabase.from("school_info").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("grading_scales").select("grade,points,min_mark,max_mark,remark").order("sort_order"),
      ]);
      if (cancelled) return;

      let cls: Anything | null = null;
      let strm: Anything | null = null;
      let teacher: Anything | null = null;
      let subs: Anything[] = [];
      let teachersMap: Record<string, Anything> = {};
      let classSubjectsData: Anything[] = [];
      let classLearnerCountData = 0;
      let classMarksData: Anything[] = [];
      if (ln?.class_id) {
        const { data } = await supabase.from("classes").select("*").eq("id", ln.class_id).maybeSingle();
        cls = data;
      }
      if (ln?.stream_id) {
        const { data } = await supabase.from("streams").select("*").eq("id", ln.stream_id).maybeSingle();
        strm = data;
      }
      if (cls?.class_teacher_id) {
        const { data } = await supabase.from("teachers").select("*").eq("id", cls.class_teacher_id).maybeSingle();
        teacher = data;
      }
      if (ln?.class_id) {
        const { data } = await supabase.from("subjects").select("*").eq("class_id", ln.class_id).order("sort_order");
        subs = data ?? [];
        const teacherIds = Array.from(new Set((subs ?? []).map((s: any) => s.subject_teacher_id).filter(Boolean)));
        if (teacherIds.length) {
          const { data: ts } = await supabase.from("teachers").select("id,initials,full_name").in("id", teacherIds);
          (ts ?? []).forEach((t: any) => { teachersMap[t.id] = t; });
        }
      }
      // Load class-wide subjects + marks for live position/aggregate computation
      if (ln?.class_id) {
        classSubjectsData = ((await supabase.from("subjects").select("id,is_core,class_id").eq("class_id", ln.class_id)).data ?? []);
        const { data: classLearners } = await supabase.from("learners").select("id").eq("class_id", ln.class_id);
        const ids = (classLearners ?? []).map((l: any) => l.id);
        classLearnerCountData = ids.length;
        if (ids.length) {
          const { data: cm } = await supabase.from("marks").select("learner_id,subject_id,bot,mid,eot,total,points").eq("term_id", termId).in("learner_id", ids);
          classMarksData = cm ?? [];
        }
      }
      const { data: mks } = await supabase.from("marks").select("*").eq("term_id", termId).eq("learner_id", learnerId);

      const [lg, hs, cs, ph, st, wm] = await Promise.all([
        signedUrl("school-assets", si?.logo_path ?? null),
        signedUrl("signatures", si?.head_teacher_signature_path ?? null),
        signedUrl("signatures", cls?.class_signature_path ?? null),
        signedUrl("learner-photos", ln?.photo_path ?? null),
        signedUrl("school-assets", si?.stamp_path ?? null),
        signedUrl("school-assets", si?.watermark_path ?? null),
      ]);
      const [logoBase64, headSigBase64, classSigBase64, photoBase64, stampBase64, watermarkBase64] = await Promise.all([
        preloadImageAsBase64(lg),
        preloadImageAsBase64(hs),
        preloadImageAsBase64(cs),
        preloadImageAsBase64(ph),
        preloadImageAsBase64(st),
        preloadImageAsBase64(wm),
      ]);
      if (cancelled) return;
      setLearner(ln);
      setTerm(tm); setReport(rc); setSchool(si); setBands((gs ?? []) as GradeBand[]);
      setKlass(cls); setStream(strm); setClassTeacher(teacher);
      setSubjects(subs); setTeachersById(teachersMap);
      setClassSubjects(classSubjectsData); setClassLearnerCount(classLearnerCountData); setClassMarks(classMarksData);
      setMarks(mks ?? []);
      setLogoUrl(logoBase64); setHeadSigUrl(headSigBase64); setClassSigUrl(classSigBase64); setPhotoUrl(photoBase64); setStampUrl(stampBase64); setWatermarkUrl(watermarkBase64);
      setReportDataReady(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [learnerId, termId, reloadKey]);

  useEffect(() => {
    if (loading || !reportDataReady || !pageRef.current || readySignaledRef.current) return;
    let cancelled = false;
    waitForImagesAndFonts(pageRef.current).then(() => {
      if (!cancelled && !readySignaledRef.current) {
        readySignaledRef.current = true;
        onReadyChange?.(true);
        onReady?.();
      }
    });
    return () => { cancelled = true; };
  }, [loading, reportDataReady, onReady, onReadyChange]);

  // Realtime: refetch when marks/subjects/grading_scales change
  useEffect(() => {
    if (!learnerId || !termId) return;
    const ch = supabase
      .channel(`rc-live-${learnerId}-${termId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "marks", filter: `term_id=eq.${termId}` }, () => setReloadKey(k => k + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "subjects" }, () => setReloadKey(k => k + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "learners" }, () => setReloadKey(k => k + 1))
      .on("postgres_changes", { event: "*", schema: "public", table: "grading_scales" }, () => setReloadKey(k => k + 1))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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

  // Live per-phase class-wide computation: position, aggregate, division for BOT/MID/EOT independently.
  const livePhase = useMemo(() => {
    const subjIds = new Set(classSubjects.map((s: any) => s.id));
    const coreIds = new Set(classSubjects.filter((s: any) => s.is_core).map((s: any) => s.id));
    const coreOk = coreIds.size === 4;

    const computeFor = (phase: "bot" | "mid" | "eot") => {
      const byLearner = new Map<string, { totalSum: number; aggregate: number; count: number }>();
      classMarks.forEach((m: any) => {
        if (!subjIds.has(m.subject_id)) return;
        const acc = byLearner.get(m.learner_id) ?? { totalSum: 0, aggregate: 0, count: 0 };
        const raw = m?.[phase];
        const v = raw != null && raw !== "" ? Number(raw) : null;
        if (v != null && !isNaN(v)) {
          acc.totalSum += v;
          acc.count += 1;
          if (coreOk && coreIds.has(m.subject_id)) {
            const b = gradeFor(v, bands);
            acc.aggregate += b?.points ?? 0;
          }
        }
        byLearner.set(m.learner_id, acc);
      });
      // rank: only learners with at least one mark for this phase
      const arr = Array.from(byLearner.entries())
        .filter(([, v]) => v.count > 0)
        .map(([id, v]) => ({ id, total: v.totalSum, aggregate: v.aggregate }))
        .sort((a, b) => b.total - a.total);
      const positionMap = new Map<string, number>();
      let lastTotal: number | null = null, lastPos = 0;
      arr.forEach((r, i) => {
        if (r.total !== lastTotal) { lastPos = i + 1; lastTotal = r.total; }
        positionMap.set(r.id, lastPos);
      });
      return { positionMap, classSize: arr.length };
    };

    return {
      bot: computeFor("bot"),
      mid: computeFor("mid"),
      eot: computeFor("eot"),
    };
  }, [classMarks, classSubjects, bands]);


  if (loading || !learner || !term) {
    return <div ref={pageRef} className="report-page" style={pageBreak ? { pageBreakAfter: "always" } : undefined}>
      <p style={{ textAlign: "center", marginTop: "40mm", color: "#666" }}>
        {loading ? "Preparing report card..." : "Learner or term not found."}
      </p>
    </div>;
  }

  const botSum = summary("bot");
  const midSum = summary("mid");
  const eotSum = summary("eot");
  const eotTotal = eotSum.total;
  const eotAvg = eotSum.avg;
  const eotAggregate = eotSum.aggregate;

  // Per-phase presence check (independent datasets)
  const hasPhaseData = (phase: "bot" | "mid" | "eot") =>
    marks.some((m: any) => m?.[phase] != null && m?.[phase] !== "");
  const botHas = hasPhaseData("bot");
  const midHas = hasPhaseData("mid");
  const eotHas = hasPhaseData("eot");

  // Debug verification — confirms each section is sourced independently
  // eslint-disable-next-line no-console
  console.log(
    `[ReportCard ${learnerId}] BEGINNING data ${botHas ? "loaded" : "MISSING"} | ` +
    `MID-TERM data ${midHas ? "loaded" : "MISSING"} | ` +
    `END-TERM data ${eotHas ? "loaded" : "MISSING"}`
  );
  // Check if any core subject is missing marks for this phase
  const missingCoreCount = (phase: "bot" | "mid" | "eot") => {
    let missing = 0;
    coreSubjectIds.forEach((id) => {
      const m = marksBySubject.get(id as string);
      const v = m?.[phase];
      if (v == null || v === "" || isNaN(Number(v))) missing += 1;
    });
    return missing;
  };

  // Detect if learner has F9 in ENG or MTC for a phase
  const hasF9InEngOrMath = (phase: "bot" | "mid" | "eot") => {
    for (const s of orderedSubjects) {
      const tag = isCriticalCoreSubject(s.name);
      if (!tag) continue;
      const m = marksBySubject.get(s.id);
      const v = m?.[phase];
      if (v == null || v === "" || isNaN(Number(v))) continue;
      const g = gradeFor(Number(v), bands);
      if (g?.grade === "F9") return true;
    }
    return false;
  };

  const phaseInfo = (phase: "bot" | "mid" | "eot", aggregate: number, hasData: boolean) => {
    const lp = livePhase[phase];
    const position = lp.positionMap.get(learnerId) ?? null;
    const classSize = classLearnerCount || 0;
    let division = "";
    if (hasData && coreCountValid) {
      const missing = missingCoreCount(phase);
      // RULE: missing core subjects → Division = "X" (overrides aggregate-based division)
      const base = missing > 0 ? "X" : calculateDivision(aggregate);
      // RULE: F9 in ENG or MTC → push division one level worse (not for X/U)
      division = applyF9Override(base, hasF9InEngOrMath(phase));
    }
    return { position, classSize, division };
  };
  const botInfo = phaseInfo("bot", botSum.aggregate, botHas);
  const midInfo = phaseInfo("mid", midSum.aggregate, midHas);
  const eotInfo = phaseInfo("eot", eotAggregate, eotHas);
  const livePosition = eotInfo.position;
  const liveClassSize = eotInfo.classSize;
  const liveDivision = eotInfo.division;

  // Debug logging — verify per-exam computation
  // eslint-disable-next-line no-console
  console.log(`[ReportCard ${learnerId}] BOT AGG: ${botSum.aggregate} DIVISION: ${botInfo.division} | MID AGG: ${midSum.aggregate} DIVISION: ${midInfo.division} | EOT AGG: ${eotAggregate} DIVISION: ${eotInfo.division} | missingCoreEOT=${missingCoreCount("eot")}`);

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
    sum: { total: number; avg: number; aggregate: number },
    info: { position: number | null; classSize: number; division: string },
    hasData: boolean
  ) => {
    if (!hasData) return null;
    return (
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
              const g = v != null && v !== "" ? gradeFor(Number(v), bands) : null;
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
            {flags.show_position && (
              <td><span className="rc-ps-label">POSITION:</span> <span className="rc-ps-val">{info.position && info.classSize ? `${info.position}/${info.classSize}` : ""}</span></td>
            )}
            <td><span className="rc-ps-label">AGGREGATES:</span> <span className="rc-ps-val">{coreCountValid && hasData ? sum.aggregate : ""}</span></td>
            <td><span className="rc-ps-label">DIVISION:</span> <span className="rc-ps-val">{info.division}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    );
  };
  const wmEnabled = !!school?.watermark_enabled && !!watermarkUrl;
  const wmMode = (school?.watermark_mode as string) || "custom";
  const wmOpacity = school?.watermark_opacity ?? 0.3;
  const wmScale = school?.watermark_scale ?? 1.0;
  const wmX = school?.watermark_x ?? 50;
  const wmY = school?.watermark_y ?? 50;

  return (
    <div ref={pageRef} className="report-page" style={pageBreak ? { pageBreakAfter: "always" } : undefined}>
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

      {(() => {
        // Build label/value cells in the configured order, skipping fields disabled by flags.
        const regLabel =
          learner.active_reg_type === "LIN" ? "LIN NO.:" :
          learner.active_reg_type === "REG" ? "REG NO.:" : "INDEX NO.:";
        const regValue =
          learner.active_reg_type === "LIN" ? (learner.lin_no ?? "") :
          learner.active_reg_type === "REG" ? (learner.reg_no ?? "") :
          (learner.index_no ?? "");

        const cellMap: Record<string, { enabled: boolean; label: string; value: string }> = {
          name:     { enabled: true,          label: "NAME:",     value: learner.full_name ?? "" },
          stream:   { enabled: !!flags.stream,   label: "STREAM:",   value: stream?.name ?? "" },
          house:    { enabled: !!flags.house,    label: "HOUSE:",    value: learner.house ?? "" },
          section:  { enabled: !!flags.section,  label: "SECTION:",  value: learner.section ?? "" },
          age:      { enabled: true,          label: "AGE:",      value: learner.age != null ? String(learner.age) : "" },
          sex:      { enabled: true,          label: "SEX:",      value: learner.sex ?? "" },
          reg:      { enabled: true,          label: regLabel,    value: String(regValue) },
          class:    { enabled: true,          label: "CLASS:",    value: klass?.name ?? "" },
          pay_code: { enabled: !!flags.pay_code, label: "PAY CODE:", value: learner.pay_code ?? "" },
        };

        const visible = order
          .map(k => ({ key: k, ...cellMap[k] }))
          .filter(c => c?.enabled);

        // Pad to a multiple of 3 so the 3-column grid stays balanced.
        const padded = [...visible];
        while (padded.length % 3 !== 0) padded.push(null as any);

        const rows: Array<Array<{ key: string; label: string; value: string } | null>> = [];
        for (let i = 0; i < padded.length; i += 3) rows.push(padded.slice(i, i + 3));

        return (
          <table className="rc-student" cellSpacing={0} cellPadding={0}>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) => c
                    ? (
                      <td key={c.key}>
                        <span className="rc-lbl">{c.label}</span>{" "}
                        <span className="rc-fill">{c.value}</span>
                      </td>
                    )
                    : <td key={`empty-${ri}-${ci}`} />
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })()}

      {renderPhaseTable("BEGINNING OF TERM EXAMS", "bot", botSum, botInfo, botHas)}
      {renderPhaseTable("MID-TERM EXAMS", "mid", midSum, midInfo, midHas)}

      {eotHas && (
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
            // Grade & remark MUST match the EOT marks entry exactly:
            // marks entry computes grade from the EOT mark only (gradeFor(eot, bands)),
            // not from the stored `marks.grade` (which is grade of the average total).
            const eotVal = m?.eot;
            const eotBand = eotVal != null && eotVal !== "" && !isNaN(Number(eotVal))
              ? gradeFor(Number(eotVal), bands)
              : null;
            // Debug: confirm EOT grade comes from EOT mark, not recomputed from average
            // eslint-disable-next-line no-console
            if (eotVal != null && eotVal !== "") console.log(`[ReportCard EOT] ${s.name}: mark=${eotVal} grade=${eotBand?.grade ?? ""}`);
            return (
              <tr key={s.id}>
                <td className="rc-eot-subject">{s.name?.toUpperCase()}</td>
                <td>{s.max_marks ?? 100}</td>
                <td>{eotVal ?? ""}</td>
                <td>{isCore ? (eotBand?.grade ?? "") : ""}</td>
                <td>{isCore ? (eotBand?.remark ?? "") : ""}</td>
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
            {flags.show_position && (
              <td><span className="rc-ps-label">POSITION:</span> <span className="rc-ps-val">{livePosition && liveClassSize ? `${livePosition}/${liveClassSize}` : ""}</span></td>
            )}
            <td><span className="rc-ps-label">AGGREGATES:</span> <span className="rc-ps-val">{coreCountValid && eotHas ? eotAggregate : ""}</span></td>
            <td><span className="rc-ps-label">DIVISION:</span> <span className="rc-ps-val">{liveDivision}</span></td>
          </tr>
        </tbody>
      </table>
      </div>
      )}

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
                <div className="rc-b-text-col">{report?.class_teacher_comment ?? ""}</div>
              </div>
              <div className="rc-b-row-split">
                <div className="rc-b-label-col">Head Teacher&rsquo;s final comment:</div>
                <div className="rc-b-text-col">{report?.head_teacher_comment ?? ""}</div>
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
