import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nurseryPublicUrl } from "@/lib/nurseryStorage";
import { preloadImageAsBase64, waitForImagesAndFonts } from "@/lib/reportAssets";
import { NURSERY_FONT_STYLES, type NurseryFontStyleKey } from "@/hooks/useNurseryFontStyle";
import "./NurseryReportSheet.css";

type Props = { learnerId: string; termId: string; onReady?: () => void; pageBreak?: boolean };

type Area = { id: string; name: string; image_path: string | null; imageBase64?: string | null; sort_order: number };
type GC = { grade: string; label: string; color: string };

export function NurseryReportSheet({ learnerId, termId, onReady, pageBreak }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const readySignaledRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [reportDataReady, setReportDataReady] = useState(false);
  const [school, setSchool] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [learner, setLearner] = useState<any>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cls, setCls] = useState<any>(null);
  const [stream, setStream] = useState<any>(null);
  const [term, setTerm] = useState<any>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [colors, setColors] = useState<GC[]>([]);
  const [assessments, setAssessments] = useState<Record<string, { grade: string | null; comment: string | null }>>({});
  const [report, setReport] = useState<{ class_teacher_comment: string; head_teacher_comment: string }>({ class_teacher_comment: "", head_teacher_comment: "" });
  const [classTeacher, setClassTeacher] = useState<any>(null);
  const [classSigUrl, setClassSigUrl] = useState<string | null>(null);
  const [headSigUrl, setHeadSigUrl] = useState<string | null>(null);
  const [borderStyle, setBorderStyle] = useState<string>("double");
  const [fontStyleCss, setFontStyleCss] = useState<string>(NURSERY_FONT_STYLES[0].css);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setReportDataReady(false);
      readySignaledRef.current = false;

      // Load settings (border_style + nursery_font_style)
      const { data: settingsRows } = await supabase
        .from("system_settings" as any)
        .select("key,value")
        .in("key", ["border_style", "nursery_font_style"]);
      if (!cancelled) {
        const sMap: Record<string, any> = {};
        ((settingsRows as any[]) ?? []).forEach((r: any) => { sMap[r.key] = r.value; });
        if (typeof sMap.border_style === "string") setBorderStyle(sMap.border_style);
        if (typeof sMap.nursery_font_style === "string") {
          const match = NURSERY_FONT_STYLES.find((f) => f.key === sMap.nursery_font_style);
          if (match) setFontStyleCss(match.css);
        }
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
      }
      if ((l as any)?.stream_id) {
        const { data: st } = await supabase.from("nursery_streams" as any).select("*").eq("id", (l as any).stream_id).maybeSingle();
        streamData = st;
      }

      // Term
      const { data: t } = await supabase.from("terms" as any).select("*").eq("id", termId).maybeSingle();

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

      // Class signature override
      try {
        const { data: c2 } = await supabase.from("nursery_classes" as any).select("class_signature_path").eq("id", (l as any)?.class_id).maybeSingle();
        const csp = (c2 as any)?.class_signature_path;
        if (csp) {
          const { data: u } = await supabase.storage.from("signatures").createSignedUrl(csp, 3600);
          if (u?.signedUrl) classSigBase64 = await preloadImageAsBase64(u.signedUrl);
        }
      } catch {}

      if (cancelled) return;
      setSchool(s);
      setLogoUrl(logoBase64); setStampUrl(stampBase64); setWatermarkUrl(watermarkBase64); setHeadSigUrl(headSigBase64);
      setLearner(l); setPhotoUrl(photoBase64); setCls(classData); setStream(streamData); setClassTeacher(teacherData); setClassSigUrl(classSigBase64);
      setTerm(t); setAssessments(map);
      setReport({ class_teacher_comment: (rc as any)?.class_teacher_comment ?? "", head_teacher_comment: (rc as any)?.head_teacher_comment ?? "" });
      setAreas(areaRows.map((area, i) => ({ ...area, imageBase64: areaImages[i] })));
      setColors((g as any) ?? []);
      setReportDataReady(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [learnerId, termId]);

  useEffect(() => {
    if (loading || !reportDataReady || !pageRef.current || readySignaledRef.current) return;
    let cancelled = false;
    waitForImagesAndFonts(pageRef.current).then(() => {
      if (!cancelled && !readySignaledRef.current) {
        readySignaledRef.current = true;
        onReady?.();
      }
    });
    return () => { cancelled = true; };
  }, [loading, reportDataReady, onReady]);

  // Realtime sync of assessments
  useEffect(() => {
    const ch = supabase
      .channel(`nursery-rt-${learnerId}-${termId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nursery_assessments", filter: `learner_id=eq.${learnerId}` }, () => {
        supabase.from("nursery_assessments" as any).select("*").eq("learner_id", learnerId).eq("term_id", termId).then(({ data }) => {
          const map: Record<string, { grade: string | null; comment: string | null }> = {};
          (data as any[] ?? []).forEach((r) => { map[r.learning_area_id] = { grade: r.grade, comment: r.comment }; });
          setAssessments(map);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [learnerId, termId]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    colors.forEach((c) => m.set(c.grade.toUpperCase(), c.color));
    return m;
  }, [colors]);

  const fmtDate = (d?: string | null) => {
    if (!d) return "";
    try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; }
  };

  const rowHeightStyle = useMemo(() => {
    const n = Math.max(areas.length, 1);
    return { "--rc-rows": String(n) } as React.CSSProperties;
  }, [areas.length]);

  const inputFontFamily = fontStyleCss;

  return (
    <div ref={pageRef} className="nrc-page" style={{ ...rowHeightStyle, ...(pageBreak ? { pageBreakAfter: "always" } : {}) }}>
      {loading && <div className="nrc-loading">Preparing report card...</div>}
      {!loading && (
      <>
        {/* Border SVG overlay */}
        <img
          src={`/borders/${borderStyle}.svg`}
          alt=""
          className="nrc-border-svg"
          aria-hidden="true"
        />
        <div className="nrc-frame-inner">
          {watermarkUrl && (school?.watermark_enabled !== false) && (
            <img
              src={watermarkUrl}
              alt=""
              className="nrc-watermark"
              style={{
                left: `${school?.watermark_x ?? 50}%`,
                top: `${school?.watermark_y ?? 50}%`,
                opacity: school?.watermark_opacity ?? 0.15,
                transform: `translate(-50%,-50%) scale(${school?.watermark_scale ?? 1})`,
              }}
            />
          )}
          {/* Header */}
          <div className="nrc-header">
            <div className="nrc-logo-box">
              {logoUrl ? <img src={logoUrl} alt="Logo" /> : <div className="nrc-logo-placeholder">SCHOOL<br/>LOGO<br/>HERE</div>}
            </div>
            <div className="nrc-school">
              <div className="nrc-school-name">{school?.name?.toUpperCase() ?? "SCHOOL NAME"}</div>
              {school?.motto && <div className="nrc-motto">{school.motto}</div>}
              <div className="nrc-divider" />
              <div className="nrc-assessment-title">{term ? `${term.name?.toUpperCase()} ASSESSMENT` : "TERM ASSESSMENT"}</div>
              <div className="nrc-pupil">
                <span>Pupil's Name:</span> <span className="nrc-write" style={{ fontFamily: inputFontFamily }}>{learner?.full_name ?? ""}</span>
              </div>
              <div className="nrc-pupil-row">
                <div><span>Age:</span> <span className="nrc-write" style={{ fontFamily: inputFontFamily }}>{learner?.age ? `${learner.age} years` : ""}</span></div>
                <div><span>Class:</span> <span className="nrc-write nrc-write-red" style={{ fontFamily: inputFontFamily }}>{cls?.name ?? ""}</span></div>
                <div><span>Stream:</span> <span className="nrc-write" style={{ fontFamily: inputFontFamily }}>{stream?.name ?? ""}</span></div>
              </div>
            </div>
            <div className="nrc-photo-box">
              {photoUrl ? <img src={photoUrl} alt="Pupil" /> : <div className="nrc-photo-placeholder">PHOTO</div>}
            </div>
          </div>

          {/* Areas */}
          <div className="nrc-areas">
            {areas.map((a) => {
              const ax = assessments[a.id];
              const grade = (ax?.grade ?? "").toUpperCase();
              const bg = grade ? colorMap.get(grade) ?? "#e5e7eb" : "transparent";
              return (
                <div key={a.id} className="nrc-area-row">
                  <div className="nrc-area-img">
                    {a.imageBase64 ? <img src={a.imageBase64} alt={a.name} /> : <div className="nrc-area-img-empty" />}
                  </div>
                  <div className="nrc-area-text">
                    <div className="nrc-area-name">{a.name}</div>
                    <div className="nrc-area-comment nrc-write" style={{ fontFamily: inputFontFamily }}>{ax?.comment ?? ""}</div>
                  </div>
                  <div className="nrc-area-grade" style={{ background: bg, borderColor: grade ? "rgba(0,0,0,0.25)" : "transparent" }}>
                    {grade || ""}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Color key */}
          <div className="nrc-key">
            <span className="nrc-key-label">KEY</span>
            {colors.map((c) => (
              <span key={c.grade} className="nrc-key-item">
                <span className="nrc-key-box" style={{ background: c.color }}>{c.grade}</span>
                <span className="nrc-key-text">- {c.label}</span>
              </span>
            ))}
          </div>

          {/* Comments */}
          <div className="nrc-comments">
            <div className="nrc-comment-cell">
              <div className="nrc-comment-title">Class teacher's Comment:</div>
              <div className="nrc-comment-body nrc-write" style={{ fontFamily: inputFontFamily }}>{report.class_teacher_comment}</div>
              <div className="nrc-sign">
                <span>Sign:</span>
                <span className="nrc-sig-stack">
                  {classSigUrl && <img src={classSigUrl} alt="sig" className="nrc-sig-img" />}
                  <span className="nrc-sig-line" />
                </span>
                <span className="nrc-sig-name">{classTeacher?.full_name?.toUpperCase() ?? ""}</span>
              </div>
            </div>
            <div className="nrc-comment-cell">
              <div className="nrc-comment-title">Head teacher's Comment:</div>
              <div className="nrc-comment-body nrc-write" style={{ fontFamily: inputFontFamily }}>{report.head_teacher_comment}</div>
              <div className="nrc-sign">
                <span>Sign:</span>
                <span className="nrc-sig-stack">
                  {headSigUrl && <img src={headSigUrl} alt="sig" className="nrc-sig-img" />}
                  <span className="nrc-sig-line" />
                </span>
                <span className="nrc-sig-name">{(school?.nursery_head_teacher_name ?? school?.head_teacher_name ?? "").toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="nrc-footer">
            <div>Next term begins on: <span className="nrc-write" style={{ fontFamily: inputFontFamily }}>{fmtDate(term?.next_begins_on)}</span></div>
            <div>Ends on: <span className="nrc-write" style={{ fontFamily: inputFontFamily }}>{fmtDate(term?.ends_on)}</span></div>
          </div>
          {school?.motto && <div className="nrc-motto-bottom">{school.motto}</div>}

          {/* Stamp */}
          {stampUrl && (
            <img
              src={stampUrl}
              alt="Stamp"
              className="nrc-stamp"
              style={{
                left: `${school?.stamp_x ?? 75}%`,
                top: `${school?.stamp_y ?? 78}%`,
                opacity: school?.stamp_opacity ?? 0.6,
                transform: `translate(-50%,-50%) scale(${school?.stamp_size ?? 1})`,
              }}
            />
          )}
        </div>
      </>
      )}
    </div>
  );
}
