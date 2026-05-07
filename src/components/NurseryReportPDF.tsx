/**
 * NurseryReportPDF — A DEDICATED static-HTML component for PDF/print rendering.
 * NO transforms, NO flex wrapping, NO CSS grid, NO animations, NO scaling.
 * Uses ONLY simple tables and divs for maximum html2canvas compatibility.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nurseryPublicUrl } from "@/lib/nurseryStorage";
import { preloadImageAsBase64 } from "@/lib/reportAssets";
import { NURSERY_FONT_STYLES } from "@/hooks/useNurseryFontStyle";
import "./NurseryReportPDF.css";

type Props = {
  learnerId: string;
  termId: string;
  onReady?: () => void;
  pageBreak?: boolean;
};

type Area = { id: string; name: string; image_path: string | null; imageBase64?: string | null; sort_order: number };
type GC = { grade: string; label: string; color: string };

export function NurseryReportPDF({ learnerId, termId, onReady, pageBreak }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState<any>(null);
  const [logoB64, setLogoB64] = useState<string | null>(null);
  const [stampB64, setStampB64] = useState<string | null>(null);
  const [watermarkB64, setWatermarkB64] = useState<string | null>(null);
  const [learner, setLearner] = useState<any>(null);
  const [photoB64, setPhotoB64] = useState<string | null>(null);
  const [cls, setCls] = useState<any>(null);
  const [stream, setStream] = useState<any>(null);
  const [term, setTerm] = useState<any>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [colors, setColors] = useState<GC[]>([]);
  const [assessments, setAssessments] = useState<Record<string, { grade: string | null; comment: string | null }>>({});
  const [report, setReport] = useState({ class_teacher_comment: "", head_teacher_comment: "" });
  const [classTeacher, setClassTeacher] = useState<any>(null);
  const [classSigB64, setClassSigB64] = useState<string | null>(null);
  const [headSigB64, setHeadSigB64] = useState<string | null>(null);
  const [borderStyle, setBorderStyle] = useState("double");
  const [fontStyleCss, setFontStyleCss] = useState(NURSERY_FONT_STYLES[0].css);
  const [showPayCode, setShowPayCode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      readyRef.current = false;

      // Settings
      const { data: settingsRows } = await supabase
        .from("system_settings" as any)
        .select("key,value")
        .in("key", ["border_style", "nursery_font_style", "learner_fields"]);
      if (cancelled) return;
      const sMap: Record<string, any> = {};
      ((settingsRows as any[]) ?? []).forEach((r: any) => { sMap[r.key] = r.value; });
      if (typeof sMap.border_style === "string") setBorderStyle(sMap.border_style);
      if (typeof sMap.nursery_font_style === "string") {
        const match = NURSERY_FONT_STYLES.find((f) => f.key === sMap.nursery_font_style);
        if (match) setFontStyleCss(match.css);
      }
      if (sMap.learner_fields && typeof sMap.learner_fields === "object") {
        setShowPayCode(!!sMap.learner_fields.pay_code);
      }

      // School
      const { data: s } = await supabase.from("school_info" as any).select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;

      let logoBase64: string | null = null;
      let stampBase64: string | null = null;
      let watermarkBase64: string | null = null;
      let headSigBase64: string | null = null;

      if ((s as any)?.logo_path) {
        const { data: u } = await supabase.storage.from("school-assets").createSignedUrl((s as any).logo_path, 3600);
        logoBase64 = await preloadImageAsBase64(u?.signedUrl ?? null);
      }
      if ((s as any)?.stamp_path) {
        const { data: u } = await supabase.storage.from("school-assets").createSignedUrl((s as any).stamp_path, 3600);
        stampBase64 = await preloadImageAsBase64(u?.signedUrl ?? null);
      }
      if ((s as any)?.watermark_path) {
        const { data: u } = await supabase.storage.from("school-assets").createSignedUrl((s as any).watermark_path, 3600);
        watermarkBase64 = await preloadImageAsBase64(u?.signedUrl ?? null);
      }
      const headSigPath = (s as any)?.nursery_head_teacher_signature_path ?? (s as any)?.head_teacher_signature_path;
      if (headSigPath) {
        const { data: u } = await supabase.storage.from("signatures").createSignedUrl(headSigPath, 3600);
        headSigBase64 = await preloadImageAsBase64(u?.signedUrl ?? null);
      }

      // Learner
      const { data: l } = await supabase.from("nursery_learners" as any).select("*").eq("id", learnerId).maybeSingle();
      if (cancelled) return;
      let photoBase64: string | null = null;
      if ((l as any)?.photo_path) photoBase64 = await preloadImageAsBase64(nurseryPublicUrl((l as any).photo_path));

      let classData: any = null;
      let streamData: any = null;
      let teacherData: any = null;
      let classSigBase64: string | null = null;

      if ((l as any)?.class_id) {
        const { data: c } = await supabase.from("nursery_classes" as any).select("*").eq("id", (l as any).class_id).maybeSingle();
        classData = c;
        if ((c as any)?.class_teacher_id) {
          const { data: t } = await supabase.from("teachers" as any).select("*").eq("id", (c as any).class_teacher_id).maybeSingle();
          teacherData = t;
          if ((t as any)?.signature_path) {
            const { data: u } = await supabase.storage.from("signatures").createSignedUrl((t as any).signature_path, 3600);
            classSigBase64 = await preloadImageAsBase64(u?.signedUrl ?? null);
          }
        }
        // class signature override
        try {
          const { data: c2 } = await supabase.from("nursery_classes" as any).select("class_signature_path").eq("id", (l as any).class_id).maybeSingle();
          const csp = (c2 as any)?.class_signature_path;
          if (csp) {
            const { data: u } = await supabase.storage.from("signatures").createSignedUrl(csp, 3600);
            if (u?.signedUrl) classSigBase64 = await preloadImageAsBase64(u.signedUrl);
          }
        } catch {}
      }
      if ((l as any)?.stream_id) {
        const { data: st } = await supabase.from("nursery_streams" as any).select("*").eq("id", (l as any).stream_id).maybeSingle();
        streamData = st;
      }

      // Term
      const { data: t } = await supabase.from("terms" as any).select("*").eq("id", termId).maybeSingle();
      if (cancelled) return;

      // Areas + colors
      const { data: a } = await supabase.from("nursery_learning_areas" as any).select("*").order("sort_order");
      const areaRows = ((a as any) ?? []) as Area[];
      const areaImages = await Promise.all(areaRows.map((area) => preloadImageAsBase64(nurseryPublicUrl(area.image_path))));
      const { data: g } = await supabase.from("nursery_grade_colors" as any).select("grade,label,color").order("sort_order");

      // Assessments
      const { data: ams } = await supabase.from("nursery_assessments" as any).select("*").eq("learner_id", learnerId).eq("term_id", termId);
      const map: Record<string, { grade: string | null; comment: string | null }> = {};
      (ams as any[] ?? []).forEach((r) => { map[r.learning_area_id] = { grade: r.grade, comment: r.comment }; });

      // Report card comments
      const { data: rc } = await supabase.from("nursery_report_cards" as any).select("*").eq("learner_id", learnerId).eq("term_id", termId).maybeSingle();

      if (cancelled) return;

      setSchool(s);
      setLogoB64(logoBase64); setStampB64(stampBase64); setWatermarkB64(watermarkBase64); setHeadSigB64(headSigBase64);
      setLearner(l); setPhotoB64(photoBase64); setCls(classData); setStream(streamData);
      setClassTeacher(teacherData); setClassSigB64(classSigBase64);
      setTerm(t); setAssessments(map);
      setReport({ class_teacher_comment: (rc as any)?.class_teacher_comment ?? "", head_teacher_comment: (rc as any)?.head_teacher_comment ?? "" });
      setAreas(areaRows.map((area, i) => ({ ...area, imageBase64: areaImages[i] })));
      setColors((g as any) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [learnerId, termId]);

  // Signal ready after images loaded
  useEffect(() => {
    if (loading || readyRef.current || !rootRef.current) return;
    let cancelled = false;
    const imgs = rootRef.current.querySelectorAll("img");
    Promise.all(
      Array.from(imgs).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
      })
    ).then(() => document.fonts.ready).then(() => new Promise(r => setTimeout(r, 300))).then(() => {
      if (!cancelled && !readyRef.current) {
        readyRef.current = true;
        onReady?.();
      }
    });
    return () => { cancelled = true; };
  }, [loading, onReady]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    colors.forEach(c => m.set(c.grade.toUpperCase(), c.color));
    return m;
  }, [colors]);

  const fmtDate = (d?: string | null) => {
    if (!d) return "";
    try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; }
  };

  const ff = fontStyleCss;

  if (loading) {
    return <div className="pdf-root" ref={rootRef} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><span>Preparing report card…</span></div>;
  }

  return (
    <div
      ref={rootRef}
      className="pdf-root"
      style={pageBreak ? { pageBreakAfter: "always" } : undefined}
    >
      {/* Watermark — absolute positioned behind content */}
      {watermarkB64 && school?.watermark_enabled !== false && (
        <img
          src={watermarkB64}
          alt=""
          className="pdf-watermark"
          style={{
            left: `${school?.watermark_x ?? 50}%`,
            top: `${school?.watermark_y ?? 50}%`,
            opacity: school?.watermark_opacity ?? 0.15,
          }}
        />
      )}

      {/* Border SVG */}
      <img src={`/borders/${borderStyle}.svg`} alt="" className="pdf-border-svg" />

      {/* Content wrapper — 8mm padding inside border */}
      <div className="pdf-content">
        {/* ===== HEADER ===== */}
        <table className="pdf-header-table">
          <tbody>
            <tr>
              <td className="pdf-logo-cell">
                {logoB64 ? <img src={logoB64} alt="Logo" className="pdf-logo-img" /> : <span className="pdf-placeholder">LOGO</span>}
              </td>
              <td className="pdf-school-cell">
                <div className="pdf-school-name">{school?.name?.toUpperCase() ?? "SCHOOL NAME"}</div>
                {school?.motto && <div className="pdf-motto">"{school.motto}"</div>}
                <div className="pdf-divider"></div>
                <div className="pdf-assessment-title">{term ? `${term.name?.toUpperCase()} ASSESSMENT` : "TERM ASSESSMENT"}</div>
              </td>
              <td className="pdf-photo-cell">
                {photoB64 ? <img src={photoB64} alt="Photo" className="pdf-photo-img" /> : <span className="pdf-placeholder">PHOTO</span>}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Pupil info */}
        <table className="pdf-info-table">
          <tbody>
            <tr>
              <td colSpan={4}>Pupil's Name: <span className="pdf-val" style={{ fontFamily: ff }}>{learner?.full_name ?? ""}</span></td>
            </tr>
            <tr>
              <td>Age: <span className="pdf-val" style={{ fontFamily: ff }}>{learner?.age ?? ""}</span></td>
              <td>Class: <span className="pdf-val pdf-val-red" style={{ fontFamily: ff }}>{cls?.name ?? ""}</span></td>
              <td>Stream: <span className="pdf-val" style={{ fontFamily: ff }}>{stream?.name ?? ""}</span></td>
              <td></td>
            </tr>
            <tr>
              <td>Sex: <span className="pdf-val" style={{ fontFamily: ff }}>{learner?.sex ?? learner?.gender ?? ""}</span></td>
              {showPayCode && <td>Pay Code: <span className="pdf-val" style={{ fontFamily: ff }}>{learner?.pay_code ?? ""}</span></td>}
              <td colSpan={showPayCode ? 2 : 3}></td>
            </tr>
          </tbody>
        </table>

        {/* ===== LEARNING AREAS ===== */}
        <table className="pdf-areas-table">
          <tbody>
            {areas.map(a => {
              const ax = assessments[a.id];
              const grade = (ax?.grade ?? "").toUpperCase();
              const bg = grade ? colorMap.get(grade) ?? "#e5e7eb" : "transparent";
              return (
                <tr key={a.id} className="pdf-area-row">
                  <td className="pdf-icon-cell">
                    {a.imageBase64 ? <img src={a.imageBase64} alt="" className="pdf-area-icon" /> : <div className="pdf-icon-empty"></div>}
                  </td>
                  <td className="pdf-content-cell">
                    <div className="pdf-area-name">{a.name}</div>
                    <div className="pdf-area-comment" style={{ fontFamily: ff }}>{ax?.comment ?? ""}</div>
                  </td>
                  <td className="pdf-grade-cell">
                    {grade && (
                      <div className="pdf-grade-box" style={{ background: bg }}>{grade}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ===== KEY ===== */}
        <div className="pdf-key-row">
          <span className="pdf-key-label">KEY</span>
          {colors.map(c => (
            <span key={c.grade} className="pdf-key-item">
              <span className="pdf-key-box" style={{ background: c.color }}>{c.grade}</span>
              <span> - {c.label}</span>
            </span>
          ))}
        </div>

        {/* ===== COMMENTS ===== */}
        <table className="pdf-comments-table">
          <tbody>
            <tr>
              <td className="pdf-comment-td">
                <div className="pdf-comment-title">Class teacher's Comment:</div>
                <div className="pdf-comment-body" style={{ fontFamily: ff }}>{report.class_teacher_comment}</div>
                <div className="pdf-sign-row">
                  <span>Sign:</span>
                  <span className="pdf-sig-block">
                    {classSigB64 && <img src={classSigB64} alt="" className="pdf-sig-img" />}
                    <span className="pdf-sig-line"></span>
                  </span>
                  <span className="pdf-sig-name">{classTeacher?.full_name?.toUpperCase() ?? ""}</span>
                </div>
              </td>
              <td className="pdf-comment-td">
                <div className="pdf-comment-title">Head teacher's Comment:</div>
                <div className="pdf-comment-body" style={{ fontFamily: ff }}>{report.head_teacher_comment}</div>
                <div className="pdf-sign-row">
                  <span>Sign:</span>
                  <span className="pdf-sig-block">
                    {headSigB64 && <img src={headSigB64} alt="" className="pdf-sig-img" />}
                    <span className="pdf-sig-line"></span>
                  </span>
                  <span className="pdf-sig-name">{(school?.nursery_head_teacher_name ?? school?.head_teacher_name ?? "").toUpperCase()}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ===== FOOTER ===== */}
        <table className="pdf-footer-table">
          <tbody>
            <tr>
              <td>Next term begins on: <span className="pdf-val-red" style={{ fontFamily: ff }}>{fmtDate(term?.next_begins_on)}</span></td>
              <td style={{ textAlign: "right" }}>Ends on: <span className="pdf-val-red" style={{ fontFamily: ff }}>{fmtDate(term?.ends_on)}</span></td>
            </tr>
          </tbody>
        </table>
        {school?.motto && <div className="pdf-motto-bottom">"{school.motto}"</div>}
      </div>

      {/* Stamp */}
      {stampB64 && (
        <img
          src={stampB64}
          alt=""
          className="pdf-stamp"
          style={{
            left: `${school?.stamp_x ?? 75}%`,
            top: `${school?.stamp_y ?? 78}%`,
            opacity: school?.stamp_opacity ?? 0.6,
          }}
        />
      )}
    </div>
  );
}
