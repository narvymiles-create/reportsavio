import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nurseryPublicUrl } from "@/lib/nurseryStorage";
import "./NurseryReportSheet.css";

type Props = { learnerId: string; termId: string };

type Area = { id: string; name: string; image_path: string | null; sort_order: number };
type GC = { grade: string; label: string; color: string };

export function NurseryReportSheet({ learnerId, termId }: Props) {
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

  useEffect(() => {
    (async () => {
      // School
      const { data: s } = await supabase.from("school_info" as any).select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setSchool(s);
      if ((s as any)?.logo_path) {
        const { data: u } = await supabase.storage.from("school-assets").createSignedUrl((s as any).logo_path, 3600);
        setLogoUrl(u?.signedUrl ?? null);
      }
      if ((s as any)?.stamp_path) {
        const { data: u } = await supabase.storage.from("school-assets").createSignedUrl((s as any).stamp_path, 3600);
        setStampUrl(u?.signedUrl ?? null);
      }
      if ((s as any)?.watermark_path) {
        const { data: u } = await supabase.storage.from("school-assets").createSignedUrl((s as any).watermark_path, 3600);
        setWatermarkUrl(u?.signedUrl ?? null);
      }
      if ((s as any)?.head_teacher_signature_path) {
        const { data: u } = await supabase.storage.from("signatures").createSignedUrl((s as any).head_teacher_signature_path, 3600);
        setHeadSigUrl(u?.signedUrl ?? null);
      }

      // Learner
      const { data: l } = await supabase.from("nursery_learners" as any).select("*").eq("id", learnerId).maybeSingle();
      setLearner(l);
      if ((l as any)?.photo_path) setPhotoUrl(nurseryPublicUrl((l as any).photo_path));

      if ((l as any)?.class_id) {
        const { data: c } = await supabase.from("nursery_classes" as any).select("*").eq("id", (l as any).class_id).maybeSingle();
        setCls(c);
        if ((c as any)?.class_teacher_id) {
          const { data: t } = await supabase.from("teachers" as any).select("*").eq("id", (c as any).class_teacher_id).maybeSingle();
          setClassTeacher(t);
          if ((t as any)?.signature_path) {
            const { data: u } = await supabase.storage.from("signatures").createSignedUrl((t as any).signature_path, 3600);
            setClassSigUrl(u?.signedUrl ?? null);
          }
        }
      }
      if ((l as any)?.stream_id) {
        const { data: st } = await supabase.from("nursery_streams" as any).select("*").eq("id", (l as any).stream_id).maybeSingle();
        setStream(st);
      }

      // Term
      const { data: t } = await supabase.from("terms" as any).select("*").eq("id", termId).maybeSingle();
      setTerm(t);

      // Areas + colors
      const { data: a } = await supabase.from("nursery_learning_areas" as any).select("*").order("sort_order");
      setAreas((a as any) ?? []);
      const { data: g } = await supabase.from("nursery_grade_colors" as any).select("grade,label,color").order("sort_order");
      setColors((g as any) ?? []);

      // Assessments
      const { data: ams } = await supabase.from("nursery_assessments" as any).select("*").eq("learner_id", learnerId).eq("term_id", termId);
      const map: Record<string, { grade: string | null; comment: string | null }> = {};
      (ams as any[] ?? []).forEach((r) => { map[r.learning_area_id] = { grade: r.grade, comment: r.comment }; });
      setAssessments(map);

      // Report card comments
      const { data: rc } = await supabase.from("nursery_report_cards" as any).select("*").eq("learner_id", learnerId).eq("term_id", termId).maybeSingle();
      if (rc) setReport({ class_teacher_comment: (rc as any).class_teacher_comment ?? "", head_teacher_comment: (rc as any).head_teacher_comment ?? "" });
    })();
  }, [learnerId, termId]);

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

  // Adaptive row height based on number of areas (fits page)
  const rowHeightStyle = useMemo(() => {
    const n = Math.max(areas.length, 1);
    return { "--rc-rows": String(n) } as React.CSSProperties;
  }, [areas.length]);

  return (
    <div className="nrc-page" style={rowHeightStyle}>
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

      <div className="nrc-frame">
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
              <span>Pupil's Name:</span> <span className="nrc-write">{learner?.full_name ?? ""}</span>
            </div>
            <div className="nrc-pupil-row">
              <div><span>Age:</span> <span className="nrc-write">{learner?.age ? `${learner.age} years` : ""}</span></div>
              <div><span>Class:</span> <span className="nrc-write nrc-write-red">{cls?.name ?? ""}</span></div>
              <div><span>Stream:</span> <span className="nrc-write">{stream?.name ?? ""}</span></div>
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
            const url = nurseryPublicUrl(a.image_path);
            return (
              <div key={a.id} className="nrc-area-row">
                <div className="nrc-area-img">
                  {url ? <img src={url} alt={a.name} /> : <div className="nrc-area-img-empty" />}
                </div>
                <div className="nrc-area-text">
                  <div className="nrc-area-name">{a.name}</div>
                  <div className="nrc-area-comment nrc-write">{ax?.comment ?? ""}</div>
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
            <div className="nrc-comment-body nrc-write">{report.class_teacher_comment}</div>
            <div className="nrc-sign">
              <span>Sign:</span>
              {classSigUrl && <img src={classSigUrl} alt="sig" className="nrc-sig-img" />}
              <span className="nrc-sig-line" />
            </div>
          </div>
          <div className="nrc-comment-cell">
            <div className="nrc-comment-title">Head teacher's Comment:</div>
            <div className="nrc-comment-body nrc-write">{report.head_teacher_comment}</div>
            <div className="nrc-sign">
              <span>Sign:</span>
              {headSigUrl && <img src={headSigUrl} alt="sig" className="nrc-sig-img" />}
              <span className="nrc-sig-line" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="nrc-footer">
          <div>Next term begins on: <span className="nrc-write">{fmtDate(term?.next_begins_on)}</span></div>
          <div>Ends on: <span className="nrc-write">{fmtDate(term?.ends_on)}</span></div>
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
    </div>
  );
}
